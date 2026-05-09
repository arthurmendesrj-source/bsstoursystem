## Objetivo

Adicionar um botão **Associar** na tela de resumo (summary) do `AiTriageDialog`, permitindo vincular o thread de e-mail a um Lead, Cliente, Fornecedor ou Reserva já existentes — sem fechar o diálogo, para que o usuário possa em seguida criar uma atividade ou simplesmente marcar como concluído.

## Mudanças

### 1. `src/components/email/AiTriageDialog.tsx`
- Importar `AssociateDialog` e `linkEmailThread`.
- Adicionar estado `associateOpen` e `linkedTo` (guarda o último vínculo feito: `{ kind, label, lead_id?, customer_id?, supplier_id?, booking_id? }`).
- Na seção `mode === "summary"`, adicionar um bloco "Associar a registro existente":
  - Botão **Associar** (variant outline, ícone Link2) que abre o `AssociateDialog` com `tabs={["lead","customer","supplier","booking"]}`.
  - Se `linkedTo` já existir, mostrar badge verde "Vinculado a {label}" + botão "Trocar".
- `onPick` callback:
  - Para `lead` / `customer` / `supplier`: chamar `linkEmailThread(threadId, { lead_id|customer_id|supplier_id })` (RPC já existente, atualiza `emails` e cria `email_message_links`).
  - Para `booking`: como `emails` não tem `booking_id`, fazer `INSERT` direto em `email_message_links` para cada mensagem do thread (`gmail_message_id`, `gmail_thread_id`, `booking_id`, `created_by`). Buscar mensagens via `supabase.from("emails").select("gmail_id, from_email, subject, snippet").eq("thread_id", threadId)`.
  - Em todos os casos: setar `linkedTo`, mostrar `toast.success("Vinculado · N mensagens")`, **manter o diálogo aberto** (conforme escolhido).
- Pré-preencher `lName/lEmail` com dados do registro vinculado é fora de escopo — usuário pode seguir com Criar Atividade no mesmo thread; a função `createTask` já herda `lead_id/customer_id` do thread automaticamente após o vínculo.

### 2. Sem mudanças de banco
- A RPC `link_email_thread` cobre lead/customer/supplier.
- Para booking, usamos `email_message_links.booking_id` (já existe) com INSERT direto — RLS atual já permite a authenticated users.

## Layout do bloco Associar (summary)

```
[ Resumo ]
[ Traduzir ]
[ Associar a registro existente ]
  ─ Vincular este e-mail a algo já cadastrado.
  [ 🔗 Associar ]   ← (ou "✓ Vinculado a Lead L0124 João — Trocar")

Recomendação da IA: Criar Lead
[ Criar Lead ] [ Criar Atividade ] [ Ignorar ]
```

## Fora de escopo
- Botão de Associar na lista (`TriageEmailPanel`) — manter apenas dentro do diálogo conforme decidido.
- Edição/remoção do vínculo após associar (apenas "Trocar" reabre o seletor).
- Auto-sugestão de match por e-mail do remetente.