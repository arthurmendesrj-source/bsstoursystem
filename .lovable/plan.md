## O que está acontecendo

A função de convite (`admin-users`) está respondendo com status 400, mas o front-end mostra apenas a mensagem genérica do supabase-js: **"Edge Function returned a non-2xx status code"**. Isso acontece porque, quando há erro HTTP, o helper `callAdminUsers` em `src/routes/users.tsx` lê `error.message` (genérico) e ignora o corpo JSON com `{ error: "..." }` que a função devolve.

Sem ver a mensagem real, não dá para saber se é:
- "Diretor não pode atribuir admin/diretor" (papel selecionado foi **Diretor**, e somente Admin pode convidar outro Diretor — esse é o suspeito principal pelo print);
- "Falha no convite" vindo do Auth (ex.: rate-limit de e-mail, e-mail inválido);
- "Convidador sem tenant ativo".

## Plano

### Passo 1 — Surface do erro real (1 arquivo)

Em `src/routes/users.tsx`, na função `callAdminUsers`, ler o corpo da resposta quando `error` vier de `FunctionsHttpError`:

- Tentar `await (error as any).context.json()` e usar `body.error` se existir;
- Fallback para `await (error as any).context.text()`;
- Se nada vier, manter `error.message`.

Resultado: o toast vai mostrar exatamente o motivo (ex.: "Diretor não pode atribuir admin/diretor").

### Passo 2 — Você reenvia o convite e me manda o novo texto do toast

Com a mensagem exata, eu corrijo a causa de verdade no próximo turno. Os caminhos mais prováveis:

- **Se for "Diretor não pode atribuir admin/diretor":** mudar o papel padrão do diálogo de "Diretor" para "Operador" (ou esconder a opção "Diretor" quando o convidador não é admin), evitando que um Diretor tente convidar outro Diretor.
- **Se for erro de e-mail do Auth (rate limit / SMTP):** ajustar a estratégia de envio (reduzir tentativas, configurar remetente próprio, etc.).
- **Se for "Convidador sem tenant ativo":** garantir vínculo do `diretorturismos@gmail.com` em `tenant_members` antes do convite.

## Detalhes técnicos

- Nenhuma alteração de banco neste passo.
- Apenas `src/routes/users.tsx` é tocado (~10 linhas dentro de `callAdminUsers`).
- O edge function `admin-users` não muda agora; ele já devolve mensagem útil no JSON, só não estava sendo lida.
