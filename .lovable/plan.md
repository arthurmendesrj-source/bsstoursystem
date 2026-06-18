Objetivo: deixar os emails persistidos no banco do app para que, depois de carregados uma vez, fiquem disponíveis em qualquer login sem precisar buscar tudo de novo no Gmail. Também corrigir a tela em branco causada por erro de permissões da empresa.

## 1. Corrigir tela em branco no /email
- As políticas atuais da tabela de membros da empresa (`tenant_members`) estão gerando erro de recursão infinita, o que derruba o carregamento da página.
- Reescrever essas políticas usando funções seguras já existentes (sem consultar a própria tabela dentro da regra), para que o app volte a abrir normalmente.

## 2. Criar armazenamento próprio de emails no banco
- Criar uma tabela `emails` no banco do app com: dono (usuário), caixa (`inbox` / `sent`), Gmail ID, thread, remetente, destinatários, assunto, resumo, corpo (texto e html), data, labels, lido/não lido, vínculo opcional com lead/cliente.
- Índice por usuário + caixa + data para listagem rápida.
- Permissões: cada usuário vê os próprios emails; gestores veem os de subordinados conforme hierarquia; administradores têm acesso completo; backend pode escrever.
- Criar também uma tabela `email_sync_state` por usuário e caixa, guardando o `historyId` do Gmail e a data da última sincronização, para fazer sincronização incremental.

## 3. Comportamento de carregamento (cache-first)
- Ao abrir /email ou trocar de aba: ler os emails direto do banco e mostrar imediatamente — sem esperar o Gmail.
- Em segundo plano, disparar uma sincronização incremental: buscar no Gmail apenas o que mudou desde o último `historyId` salvo (ou os 50 mais recentes na primeira vez), salvar/atualizar no banco e atualizar a tela.
- Se a sincronização falhar (Gmail fora, token expirado, sem internet), a lista do banco continua aparecendo; mostramos só um aviso discreto.
- Botão "Atualizar" força a sincronização incremental, mas nunca apaga o que já está salvo.

## 4. Carregamento do corpo do email
- Ao abrir um email, se o corpo ainda não estiver salvo no banco, buscar uma vez no Gmail e gravar; nas próximas vezes carrega direto do banco.

## 5. Salvar enviados feitos pelo sistema
- Depois que `sendEmailFn` envia pelo Gmail, gravar o email enviado direto na tabela `emails`, para aparecer na aba "Enviados" sem depender da próxima sincronização.

## 6. Limpeza ao remover conta/usuário
- Ao desconectar o Gmail ou excluir o usuário, apagar também os registros de `emails` e `email_sync_state` daquele usuário (já existe rotina de cleanup; só estender para essas tabelas).

## 7. Ajustar telas que já consultam emails
- Atualizar busca global, visão gerencial do usuário e tela do lead para lerem da nova tabela `emails` em vez de retornar lista vazia.

## 8. Validar
- Login novo: emails antigos aparecem na hora, sem espera.
- Atualizar: traz só novidades, lista nunca fica em branco.
- Enviar email: aparece em "Enviados" imediatamente.
- Recebidos e Enviados continuam funcionando em modo gerente (subordinado).
- Sem mais erro de tela branca por permissão.

## Detalhe técnico (referência interna)
- Hoje `src/lib/gmail-api.server.ts` consulta a Gmail API e devolve em memória; não há tabela ativa de mensagens. As tabelas existentes são apenas `email_accounts` (tokens) e `email_ai_cache` (cache de IA). Por isso qualquer falha externa zera a tela.
- A sincronização incremental usará `users.history.list` do Gmail a partir do `historyId` salvo; fallback para `messages.list` com `maxResults=50` no primeiro carregamento ou se o histórico expirou.