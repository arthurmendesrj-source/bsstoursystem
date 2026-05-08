## Diagnóstico

- O estado atual mostra `wipe_status = wiping` em `booking@adatours.com`, mas a fila do cron não está drenando — por isso nada foi apagado (688 emails, 23 threads, 92 anexos, 15 labels ainda no banco).
- Você quer remover o botão **Esvaziar tudo e ressincronizar** do painel `/email` e fazer a limpeza completa agora, manualmente, pelo chat.
- Depois que o banco e o storage estiverem 100% vazios, você mesmo vai disparar a sincronização nova pelo fluxo correto (pasta por pasta, mês a mês).

## Plano

### 1. Remover o botão e o diálogo de "Esvaziar"

Em `src/components/email/EmailPanel.tsx`:

- remover o botão **Esvaziar tudo e ressincronizar** do `MirrorPanel`
- remover o `Dialog` de confirmação (com input "ESVAZIAR")
- remover os estados `wipeOpen`, `wipeConfirmText`, `wipingMirror`
- remover a função `wipeAndRestart` e o `useServerFn(gmailWipeAndRestart)`
- remover o import de `Trash2` se não for mais usado

Em `src/server/gmail-mirror.functions.ts`:

- remover o export `gmailWipeAndRestart` e a função auxiliar `wipeOwnerStorage`
- remover o import de `enqueueWipe`

Em `src/server/gmail-mirror.server.ts`:

- remover `enqueueWipe` e `runWipeBatch` (não serão mais usados)

Em `src/routes/api/public/gmail-poll.ts`:

- remover o ramo `wipe_status === "wiping"` e o import de `runWipeBatch`
- manter apenas full-sync tick e incremental

### 2. Limpar tudo agora via chat (sem botão)

Vou executar na ordem:

1. **Storage**: listar e remover recursivamente `email-attachments/booking@adatours.com/**`
2. **Banco** (migração): apagar `email_attachments` → `emails` → `email_threads` → `email_labels` do owner
3. **Estado**: zerar completamente `email_sync_state` para o owner: `wipe_status = idle`, `wipe_step = null`, `wipe_deleted_count = 0`, `full_sync_in_progress = false`, `full_sync_label_queue = []`, `full_sync_page_token = null`, `full_sync_current_label = null`, `full_sync_current_month_offset = 0`, `full_sync_empty_streak = 0`, `full_sync_total_synced = 0`, `last_history_id = null`, `last_incremental_sync_at = null`

Resultado: caixa 100% zerada, sem nenhum botão destrutivo, pronta para você iniciar a nova sincronização manualmente quando quiser.

### 3. Confirmação no painel

Após a limpeza, o painel `/email` deve mostrar:

- 0 emails, 0 threads, 0 anexos
- nenhum sync em andamento
- somente os botões existentes de "Listar labels", "Iniciar mirror completo", "Sincronizar incremental" (e cancelar/reset se já existem)

## Resultado esperado

- Botão "Esvaziar" e todo o caminho destrutivo removidos do código.
- Banco e storage do `booking@adatours.com` completamente vazios.
- Estado de sincronização totalmente resetado.
- Você inicia a nova sincronização pelo fluxo correto, sem nenhuma rota de wipe automática no caminho.
