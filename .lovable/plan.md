
# Aba Email — Gmail + IA (criação manual de Leads)

Nova aba **Email** no menu lateral, conectada ao Gmail da operadora (uma única caixa compartilhada via conector Lovable). O usuário lê e responde e-mails dentro do CRM e, quando quiser, usa a IA para extrair dados do e-mail e **abrir o formulário de novo Lead pré-preenchido** — a criação só acontece após confirmação humana.

## 1. Conexão com Gmail
- Usar o **Gmail Connector da Lovable** (OAuth gerenciado, sem armazenar senha).
- A conta conectada é a da operadora (caixa de atendimento), não dos clientes finais.
- Tela mostra "Conectar Gmail" enquanto o conector não estiver ativo; depois exibe a inbox.
- Escopos necessários: `gmail.readonly`, `gmail.send`, `gmail.modify`.

## 2. Tela `/email` (3 colunas)
- **Esquerda — Pastas/Filtros**: Caixa de entrada, Não lidos, Enviados, Lixeira, "Com Lead vinculado".
- **Centro — Lista**: remetente, assunto, snippet, data, badge "Lead vinculado", busca, paginação, botão "Sincronizar".
- **Direita — Visualização**: cabeçalho, corpo HTML sanitizado, anexos (lista), barra de ações.

Ações no e-mail:
- **Responder / Encaminhar** (compositor inline, envia via Gmail, mantém threading).
- **Marcar lido/não lido**, **Arquivar**, **Mover para lixeira**.
- **Analisar com IA → Criar Lead** (abre dialog pré-preenchido — ver seção 4).
- **Vincular a lead/cliente existente** (busca em `leads`/`customers`).

## 3. Sincronização
- Server function puxa últimos 50 e-mails da Inbox via Gmail API e armazena metadados na tabela `emails`.
- Sincronização sob demanda (botão) e ao abrir a aba; corpo completo carregado ao abrir cada e-mail (cacheado).
- Sem auto-processamento por IA em background — a análise só roda quando o usuário clicar.

## 4. IA — assistente para criação **manual** de Leads
Fluxo 100% controlado pelo usuário:
1. Usuário abre um e-mail e clica em **"Analisar com IA → Criar Lead"**.
2. Server function `email.analyze` chama **Lovable AI (google/gemini-3-flash-preview)** com tool calling, extraindo:
   - nome, e-mail, telefone do remetente
   - destino, datas previstas, número de pax, orçamento, moeda
   - resumo / próxima ação sugerida
3. Abre o **dialog de Novo Lead já pré-preenchido** com os campos extraídos + link para o e-mail original.
4. Usuário revisa, edita e clica em **Salvar Lead**. Só nesse momento são criados:
   - `customers` (se não existir cliente com o mesmo e-mail — opcional, marcado por checkbox no dialog)
   - `leads` (origem `email`)
   - `interactions` tipo `email` referenciando o e-mail
   - `emails.lead_id` é atualizado com o vínculo
5. Botão alternativo **"Criar Lead manualmente"** abre o mesmo dialog vazio (sem IA), com o e-mail já vinculado.

Nada é gravado em `leads` automaticamente; a IA é apenas um assistente de preenchimento.

## 5. Banco de dados (nova migração)
- Tabela `emails`: `id`, `gmail_id` (unique), `thread_id`, `from_email`, `from_name`, `to_emails text[]`, `subject`, `snippet`, `body_html`, `body_text`, `received_at`, `labels text[]`, `has_attachments`, `lead_id` (fk leads, null), `customer_id` (fk customers, null), `ai_suggestion jsonb` (último resultado da IA, opcional), `created_at`.
- Adicionar valor `email` ao enum de origem de leads (se ainda não existir).
- RLS: leitura/escrita restrita a usuários autenticados com papel Admin/Vendedor/Operacional.

## 6. Server functions (TanStack Start)
- `gmail.list` — lista mensagens via gateway (`users/me/messages?q=...`).
- `gmail.get` — busca uma mensagem completa.
- `gmail.send` — envia resposta/encaminhamento (RFC 2822 + base64url, mantém In-Reply-To/References).
- `gmail.modify` — marca lido/arquivar/lixeira.
- `gmail.sync` — sincroniza últimos N para a tabela `emails`.
- `email.analyze` — chama Lovable AI Gateway e devolve sugestão estruturada (não escreve no banco).
- Todas validam sessão Supabase e usam `LOVABLE_API_KEY` + `GOOGLE_MAIL_API_KEY`.

## 7. Internacionalização
- Strings da nova aba (Email, Caixa de entrada, Responder, Encaminhar, Analisar com IA, Criar Lead, Vincular a Lead, etc.) adicionadas em PT/EN/ES no `src/lib/i18n.tsx`.

## 8. Pré-requisitos / passos do usuário
- Aprovar a conexão do **Gmail Connector** (uma vez).
- `LOVABLE_API_KEY` já está configurado.

## 9. Fora deste escopo
- Caixas Gmail por vendedor (multi-conta).
- Download/preview e envio de anexos no compositor (apenas listagem agora).
- Templates de resposta com IA ("sugerir resposta").
- Webhooks/push do Gmail (ficamos com polling/sync manual).
