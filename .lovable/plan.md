## Objetivo

Tornar o buscador da aba E-mail abrangente: ao digitar uma palavra, encontrar threads cujo **assunto, snippet, participantes, remetente, destinatários OU corpo da mensagem** contenham o termo.

## Estado atual

`src/components/email/EmailPanel.tsx` (l. 117) filtra apenas `subject` e `snippet` da tabela `email_threads`:

```ts
q = q.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
```

Campos úteis ficam de fora: `participants` (array em `email_threads`), `from_email`, `from_name`, `to_emails`, `body_text` e `body_html` (em `emails`).

## O que muda

### Em `src/components/email/EmailPanel.tsx` — `loadThreads()`

Quando `search.trim()` tiver ao menos 2 caracteres:

1. **Buscar thread_ids candidatos por conteúdo** na tabela `emails` (filtrando por `owner_email`):
   ```ts
   const like = `%${term}%`;
   const { data: hits } = await supabase
     .from("emails")
     .select("thread_id")
     .in("owner_email", authorizedEmails!)
     .or(`subject.ilike.${like},from_name.ilike.${like},from_email.ilike.${like},snippet.ilike.${like},body_text.ilike.${like}`)
     .limit(500);
   const threadIds = Array.from(new Set((hits ?? []).map(h => h.thread_id).filter(Boolean)));
   ```

2. **Buscar nas próprias threads** (assunto, snippet, participantes — esta inclui destinatários):
   ```ts
   let q = supabase.from("email_threads").select("*")
     .in("owner_email", authorizedEmails!)
     .contains("labels", [activeLabel])
     .order("last_message_at", { ascending: false }).limit(200);

   const orParts = [
     `subject.ilike.${like}`,
     `snippet.ilike.${like}`,
     // array overlap como string Postgres: {term}
     `participants.cs.{${term.replace(/[",{}\\]/g, "")}}`,
   ];
   if (threadIds.length) orParts.push(`id.in.(${threadIds.map(id => `"${id}"`).join(",")})`);
   q = q.or(orParts.join(","));
   ```

   - `participants.cs.{term}` (`contains`) cobre buscas exatas de e-mail; para parcial dentro do array, o caminho é via `emails.from_email`/`to_emails` (item 1).
   - Para incluir `to_emails` (array em `emails`), adicionamos no `or` da consulta de `emails`: `to_emails.cs.{term}` (apenas para correspondência completa de endereço). Para parcial, `from_email`/`subject` já capturam a maior parte.

3. **Manter o limite de 200 threads** e ordenação por `last_message_at`.

4. **Sanitização**: escapar `%`, `,`, `(`, `)`, `"` no termo antes de montar o `or`, evitando quebrar a sintaxe PostgREST.

5. **Debounce de 250 ms** no `search` para não disparar duas consultas a cada tecla.

6. **Indicador de carregamento**: usar o `syncing`/novo `searching` para mostrar spinner pequeno no campo enquanto busca.

### Sem mudanças em backend / RLS

- As policies de `emails` e `email_threads` já restringem por `owner_email` do usuário; o pré-filtro `.in("owner_email", authorizedEmails!)` mantém o escopo.
- Nenhuma migração ou nova função é necessária.

## Fora do escopo

- Não alteramos o buscador global (lupa do header), que já cobre busca em e-mails em todo o sistema.
- Não criamos índice full-text (FTS); se o volume crescer, fica como evolução futura.
- Anexos (nome do arquivo) não entram nessa rodada — exige join em `email_attachments`.
