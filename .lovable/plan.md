## Problema

A tela **Atendimento** (`/workspace?lead=...`) tem a aba **E-mail**, mas hoje ela só exibe o placeholder *"Email agora vive em /email."* — por isso o email vinculado ao lead (mesmo recém-criado) não aparece, e você precisa sair pra outra tela.

## Objetivo

Manter tudo dentro do Atendimento: a aba E-mail do lead mostra o(s) email(s) vinculados ao lead atual, sem trocar de tela.

## Correção

Em `src/routes/workspace.tsx`, substituir as **duas** ocorrências do placeholder (no accordion principal, ~linha 730, e na janela flutuante via `openSection("email")`, ~linha 302) por uma lista real dos emails vinculados.

### Regra (igual à já aplicada em `/leads/$leadId`)
- Buscar apenas `emails` onde `lead_id = <lead atual>` (sem busca por endereço, sem backfill).
- Ordenar por `date desc`.
- Auto-refresh a cada 30s enquanto o componente estiver montado (acompanha o sync global de inbox).
- Renderizar: remetente, assunto, data; expandir para ver o corpo (HTML em iframe sandboxed, fallback texto).
- Estado vazio: "Nenhum email vinculado a este lead ainda."

### Implementação técnica
1. Criar `src/components/lead/LeadEmailsTab.tsx` (componente client) que:
   - recebe `leadId: string`;
   - usa `supabase.from('emails').select('id,subject,from_email,from_name,to_emails,date,body_text,body_html').eq('lead_id', leadId).order('date', { ascending: false })`;
   - `useEffect` com `setInterval(30_000)` + cleanup para refresh;
   - UI simples com `Accordion`/`Collapsible` por email.
2. Em `src/routes/workspace.tsx`:
   - importar `LeadEmailsTab`;
   - trocar o placeholder do accordion (linha ~730) por `<LeadEmailsTab leadId={lead.id} />`;
   - trocar o `content` do `openSection("email")` (linha ~302) por `<div className="p-4"><LeadEmailsTab leadId={lead.id} /></div>`.

Nada mais muda. A criação de Lead/Atividade a partir de email já grava `lead_id` no registro do email, então o lead recém-criado a partir do email passa a exibi-lo imediatamente no Atendimento.
