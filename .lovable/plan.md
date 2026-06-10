## Plano

1. Corrigir o botão da página `/email`
   - O botão principal ainda abre diretamente `/api/public/google/oauth/start?token=...`.
   - Trocar esse fluxo para abrir `/google-oauth-popup`, igual ao card de configurações já corrigido.

2. Reforçar a rota popup
   - Garantir que a janela popup use navegação de topo para o Google.
   - Manter mensagens claras quando faltar sessão, token ou configuração.

3. Atualizar diagnóstico
   - Destacar que o teste correto deve abrir `/google-oauth-popup`.
   - Mostrar quando algum botão antigo ainda está usando o endpoint direto.

4. Validar
   - Conferir que não sobrou nenhum `window.open('/api/public/google/oauth/start...')` no frontend.
   - Verificar que o botão “Conectar conta Google” da página `/email` usa somente o popup bridge.