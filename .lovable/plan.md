## O que vai mudar

Hoje as caixas (Recebidos / Enviados) aparecem como abas horizontais em cima da lista de mensagens. Vou transformar em uma **barra lateral vertical à esquerda do email**, com:

1. **Botão recolher / expandir** (chevron), igual ao menu principal do app.
   - Expandido: mostra ícone + nome ("Recebidos", "Enviados").
   - Recolhido: só o ícone (largura fixa estreita, ex.: 56px).
   - Estado salvo em `localStorage` (`email:sidebar:collapsed`).
2. **Largura editável** (arrastar para redimensionar).
   - Alça de redimensionamento na borda direita da barra.
   - Limites: mínimo 160px, máximo 360px.
   - Largura salva em `localStorage` (`email:sidebar:width`).
   - Quando recolhida, ignora a largura customizada e usa a largura fixa do modo ícone.
3. Layout dentro do email vira: **[ Sidebar caixas ] [ Lista de mensagens ] [ Leitor ]**, mantendo a lista (380px) e o leitor já existentes.

Sem mudar nada do backend / IMAP / envio / leitura — é só layout.

## Onde mexo

- `src/components/email/EmailMailbox.tsx`
  - Remover o `<Tabs>` horizontal de pastas (mantém `folder` como estado).
  - Adicionar componente `MailboxSidebar` interno: lista vertical "Recebidos" / "Enviados" com ícones, botão chevron no topo (igual `AppShell`), alça de resize na borda direita.
  - Trocar grid de `md:grid-cols-[380px_1fr]` para `md:grid-cols-[auto_380px_1fr]` (auto = a sidebar).

## Fora de escopo

- Renomear/adicionar/esconder caixas — só Recebidos e Enviados continuam, como hoje.
- Mostrar Rascunhos / Spam / Lixeira do Gmail — pode ser pedido depois.
