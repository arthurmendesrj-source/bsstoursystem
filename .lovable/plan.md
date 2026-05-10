## Causa

A mensagem **"Access denied / Request access"** é da tela do Lovable, não do app. O link enviado pelo Supabase no convite está apontando para o domínio de **preview do editor** (`id-preview--…lovableproject.com`), que só permite entrada de colaboradores do workspace. Por isso o convidado bate na trava antes de chegar no app.

Isso acontece porque a edge function `admin-users` define `redirectTo` a partir de `req.headers.get("origin")`, e quando o admin envia o convite pelo editor, o origin é a URL de preview.

## Mudanças

### `supabase/functions/admin-users/index.ts`
- Trocar a montagem do `redirectTo` na ação `invite` (e também em `resend_invite`) para usar **sempre** a URL publicada:
  - `const APP_URL = "https://bsstoursystem.lovable.app"`
  - `redirectTo = `${APP_URL}/``
- Remover a dependência de `req.headers.get("origin")`.

### Sem outras alterações
- Auth, papéis padrão (`operador`), auto-confirm e demais regras continuam como já implementado.

## Como testar
1. Reenviar o convite para `booking@adatours.com` pela tela de Usuários.
2. Abrir o e-mail e clicar no link — deve abrir `bsstoursystem.lovable.app`, pedir senha (ou logar direto) e cair em `/dashboard` sem a tela "Access denied".

## Fora de escopo
- Custom domain, mudanças em templates de e-mail, demais ações da função.
