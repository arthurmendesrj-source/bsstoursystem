## Objetivo

Quando um Lead ou Atividade for criado a partir de qualquer origem (Triagem IA, botão Associar, criação manual em /leads e /activities), o e-mail/thread de origem fica vinculado e **todas as mensagens futuras da mesma thread** herdam o vínculo automaticamente — gerando histórico contínuo para cotação, proposta, etc.

## Mudanças

### 1. Banco de dados (migration)

- **Trigger `auto_link_email_by_thread`** em `BEFORE INSERT` de `public.emails`: se `lead_id`/`customer_id`/`supplier_id` vierem nulos e já existir outro `emails` com o mesmo `thread_id` que tenha algum desses campos preenchidos, copiar para a nova linha. Garante que toda nova mensagem da thread herda o vínculo.
- Função auxiliar `link_email_thread(_thread_id text, _lead uuid, _customer uuid, _supplier uuid)` (SECURITY DEFINER): atualiza todas as linhas de `emails` da thread com os IDs informados (ignora os nulos) e faz `INSERT … ON CONFLICT DO NOTHING` em `email_message_links` para cada `gmail_id` da thread.
- Índice `(thread_id) WHERE lead_id IS NOT NULL` para o lookup do trigger.

### 2. Helper compartilhado no front

Criar `src/lib/linkEmailToEntity.ts` com `linkEmailThread(threadId, { lead_id?, customer_id?, supplier_id? })` que chama a RPC `link_email_thread`. Usado por todos os fluxos abaixo para evitar duplicação.

### 3. Triagem IA (`AiTriageDialog.tsx`)

- **Criar Lead** (já vincula `emails.lead_id` da thread): além disso chamar `linkEmailThread` para também gravar em `email_message_links` (rastreabilidade) e fixar `customer_id` quando aplicável.
- **Criar Atividade**: hoje só grava `task.email_id`. Passa a:
  - Buscar `lead_id`/`customer_id` já existentes na thread.
  - Setar `task.lead_id` / `task.customer_id` no insert (para a atividade já nascer ligada ao lead/cliente do thread).
  - Não mexer em `email_id` (mantido como hoje, conforme escolha).
  - Se a thread ainda não tem vínculo e o usuário associou um lead/cliente no formulário, chamar `linkEmailThread`.

### 4. Botão "Associar" da thread (`ThreadReader.tsx → onAssociate`)

- Substituir o `update emails` direto pela chamada `linkEmailThread` (atualiza emails + cria registros em `email_message_links`).
- Após associar, atualizar tasks já existentes que tenham `email_id` apontando para mensagens da thread, preenchendo `lead_id`/`customer_id` quando estiverem nulos.

### 5. Criação manual em `/leads` (`src/routes/leads.tsx`)

Após `insert` em `leads`:
- Buscar threads com participantes contendo o `email` do lead (via `email_threads.participants` + verificar `emails` com `from_email`/`to_emails` contendo o e-mail).
- Para cada thread distinta, chamar `linkEmailThread(threadId, { lead_id })`.
- Mostra um toast com a contagem de threads vinculadas (ex.: "Lead criado · 4 threads vinculadas").

### 6. Criação manual em `/activities` (`src/routes/activities.tsx`)

Após `insert` em `tasks`, se a task tiver `lead_id`/`customer_id`:
- Disparar a mesma rotina por e-mail do lead/cliente referenciado.
- Quando criada com `lead_id`, herda também o `customer_id` do lead se houver.

### 7. Validação

- Criar lead a partir da Triagem IA → thread fica em `email_message_links` e `emails.lead_id`. Enviar nova mensagem na mesma thread (ou rodar o mirror) → linha nova já nasce com `lead_id` (trigger).
- Criar atividade a partir da Triagem IA → `task.lead_id`/`customer_id` preenchidos com base na thread; `task.email_id` mantido.
- Criar lead manual em `/leads` com e-mail conhecido → threads existentes desse contato passam a aparecer no histórico do lead.
- Botão "Associar" em uma thread → todas as mensagens passadas e futuras da thread ficam ligadas ao alvo escolhido.

## Detalhes técnicos

```sql
-- pseudocódigo do trigger
CREATE OR REPLACE FUNCTION public.auto_link_email_by_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.thread_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.lead_id IS NOT NULL OR NEW.customer_id IS NOT NULL OR NEW.supplier_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT lead_id, customer_id, supplier_id INTO r
  FROM public.emails
  WHERE thread_id = NEW.thread_id
    AND (lead_id IS NOT NULL OR customer_id IS NOT NULL OR supplier_id IS NOT NULL)
  LIMIT 1;
  IF FOUND THEN
    NEW.lead_id := COALESCE(NEW.lead_id, r.lead_id);
    NEW.customer_id := COALESCE(NEW.customer_id, r.customer_id);
    NEW.supplier_id := COALESCE(NEW.supplier_id, r.supplier_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER emails_auto_link
BEFORE INSERT ON public.emails
FOR EACH ROW EXECUTE FUNCTION public.auto_link_email_by_thread();
```

`link_email_thread` faz `UPDATE emails SET lead_id = COALESCE(lead_id, _lead) … WHERE thread_id = _thread_id` e em seguida insere uma linha em `email_message_links` por `gmail_id` (deduplicando por `gmail_message_id`).

## Arquivos afetados

- migration nova
- `src/lib/linkEmailToEntity.ts` (novo)
- `src/components/email/AiTriageDialog.tsx`
- `src/components/email/ThreadReader.tsx`
- `src/routes/leads.tsx`
- `src/routes/activities.tsx`
