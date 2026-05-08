## Objetivo

Restaurar atribuição a subordinados na Triagem IA (Diretor/Gerente atribuem Lead/Atividade criados a usuários abaixo na hierarquia) e adicionar botão de tradução do email com seleção de idioma.

## Mudanças

### 1. Atribuição a subordinados em `AiTriageDialog.tsx`

- Importar `useSubordinates` de `@/lib/hierarchy` e `useAuth` de `@/lib/auth`.
- Adicionar estado `assignedTo` (default = `user.id` do usuário atual).
- Renderizar um `Select "Atribuir a"` em ambos os modos (`lead` e `task`):
  - Opção padrão: "Eu (próprio usuário)".
  - Opções adicionais: lista de `subordinates` (nome + role).
  - Só aparece se `subordinates.length > 0` (ou seja, somente Diretor/Gerente/Supervisor verão).
- `createLead`: usar `assigned_to: assignedTo`, mantendo `created_by: uid`.
- `createTask`: usar `assigned_to: assignedTo`, mantendo `created_by: uid`.

### 2. Tradução do email na Triagem IA

**Backend** — adicionar `emailTranslate` em `src/server/gmail.functions.ts`:
- `createServerFn({ method: "POST" })` com middleware de auth (igual ao `emailAnalyze`).
- Input: `{ gmail_id: string, target_language: string }`.
- Carrega o email pelo `gmail_id` (mesmo padrão do `emailAnalyze`), extrai corpo texto.
- Chama Lovable AI Gateway (`google/gemini-2.5-flash`) com prompt: "Traduza o email a seguir para {target_language}, preservando formatação e quebras de linha. Retorne APENAS o texto traduzido."
- Retorna `{ translated: string }`.

**Frontend** — em `AiTriageDialog.tsx`, no bloco `mode === "summary"`:
- Adicionar `Select` de idioma com opções: Português, Inglês, Espanhol, Francês, Italiano, Alemão (default: Português).
- Botão "Traduzir email" ao lado do select.
- Ao clicar, chama `emailTranslate` via `useServerFn`, mostra loader, e renderiza o texto traduzido em uma caixa abaixo do resumo (com `whitespace-pre-wrap`).
- Estado: `translating`, `translation`, `targetLang`.

### 3. Manter intacto

- `EmailPanel.tsx`, `ThreadReader.tsx`, `AssociateDialog.tsx`: sem alteração.
- Lógica de criar Lead / Atividade / Ignorar mantida — apenas adiciona campo `assigned_to`.

## Arquivos afetados

- `src/components/email/AiTriageDialog.tsx` — adicionar select de subordinados + bloco de tradução.
- `src/server/gmail.functions.ts` — nova `emailTranslate`.

## Fora do escopo

- Não alterar layout do `EmailPanel`, `ThreadReader`, sidebar ou backend de sync.
- Não traduzir anexos (apenas corpo do email).
