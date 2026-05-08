## Objetivo

Hoje a conexão Gmail do projeto (`booking@adatours.com`) é compartilhada por toda a workspace — qualquer usuário logado que abra `/email` enxerga essa caixa. Você quer que, enquanto não houver vínculo com uma conta de email real por usuário, apenas a **Alexandra Ermolaeva** veja a caixa `booking@adatours.com`. Os demais usuários devem ver um estado vazio com um aviso de "vincule sua conta de email".

## Como vamos resolver (curto prazo, sem OAuth por usuário)

Criar um mapeamento por usuário → endereço de email autorizado, e filtrar tudo no painel `/email` por esse endereço.

### 1. Banco de dados
- Nova tabela `user_email_accounts`:
  - `user_id` (uuid, FK lógico para `auth.users`)
  - `email_address` (text) — ex: `booking@adatours.com`
  - `is_primary` (bool)
  - `created_at`
- RLS: usuário só lê/edita as próprias linhas; admin lê tudo.
- Seed inicial: vincular `booking@adatours.com` ao `user_id` da Alexandra (`733024b9-2dbe-4319-a98f-4815e59a5ac2`).

### 2. Backend (server functions de email)
- Em `gmail-mirror.functions.ts` e nas leituras do painel:
  - Buscar `user_email_accounts` do `auth.uid()` atual.
  - Se o usuário **não tem** nenhum email vinculado → retornar listas vazias (labels, threads, mensagens) sem chamar o Gmail Gateway.
  - Se tem → filtrar `emails`/`email_threads`/`email_labels` por `account_email IN (...)` do usuário (adicionando coluna `account_email` nas tabelas espelhadas se ainda não existir).
- A sincronização (`gmailFullSync`/`gmailIncrementalSync`) só roda para usuários com vínculo. Cada email gravado recebe `account_email = 'booking@adatours.com'`.

### 3. Frontend (`EmailPanel.tsx`)
- Ao montar, consultar `user_email_accounts` do usuário logado.
- Se vazio → mostrar tela "Nenhuma conta de email vinculada. Solicite ao administrador para vincular sua conta." (sem sidebar/threads, sem botão Sincronizar).
- Se tiver → comportamento atual, porém com filtros aplicados pelo backend.
- Esconder/desabilitar o botão "Sincronizar Gmail" para quem não tem vínculo.

### 4. Resultado
- Alexandra: vê normalmente `booking@adatours.com`.
- Outros usuários: caixa de entrada vazia + aviso, sem nenhuma mensagem de outros.
- Quando quiser liberar para outro usuário, basta inserir 1 linha em `user_email_accounts` (futuramente, uma tela de admin).

## Próximo passo (futuro, fora deste plano)
Quando cada usuário for ter o **próprio Gmail real**, migrar de "connector compartilhado" para **OAuth Google por usuário** (tokens guardados em `user_email_accounts`). Isso é uma mudança maior e fica para depois.

## Pergunta
Quer que eu já adicione uma **tela simples de admin** ("Vincular conta de email a usuário") junto, ou por enquanto só o seed da Alexandra via migration e os outros vínculos a gente faz sob demanda?
