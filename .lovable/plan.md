## Objetivo

Reduzir o intervalo de auto-refresh do inbox de **60s → 30s** e garantir que o sync rode enquanto o **app estiver aberto** (qualquer rota), não só quando o usuário está em `/email`.

## Mudanças

### 1. Mover o polling para nível global do app
- Criar `src/hooks/useEmailBackgroundSync.ts` — hook que:
  - Roda um `setInterval(30_000)` chamando `syncFolderFn({ folder: "INBOX" })` silenciosamente.
  - Só dispara se `document.visibilityState === "visible"`.
  - Só roda se o usuário estiver autenticado (verifica sessão Supabase).
  - Pula execução se já houver um sync em andamento (ref guard).
  - Dispara um sync imediato ao voltar de aba oculta (`visibilitychange`).
- Montar o hook em `src/routes/__root.tsx` (ou no provider de auth), dentro de um componente cliente, para que rode em qualquer rota enquanto o app estiver aberto.

### 2. Ajustar `EmailMailbox.tsx`
- Remover o `setInterval` local de 60s (agora vive no hook global).
- Manter o listener que recarrega a lista (`listMessagesFn`) quando a tela de email está aberta — após cada tick do sync global, refazer o `list` da pasta atual para atualizar a UI.
- Reduzir o tick do label "Atualizado há Xs" para refletir a janela de 30s.

### 3. Sem alterações
- Nada muda em RLS, migrations, `emails`, `email_sync_state`, server functions, ou no botão "Atualizar" manual.
- Nenhum cron de servidor — continua sendo polling no browser apenas com a aba aberta.

## Validação

- Abrir o app em qualquer rota (ex.: `/dashboard`) e deixar aberto → novos emails do Gmail aparecem no DB em até 30s.
- Ir para `/email` → lista já está atualizada (vem do cache do DB) e continua atualizando a cada 30s.
- Trocar de aba por 2 min e voltar → dispara sync imediato.
- Fazer logout → polling para.
