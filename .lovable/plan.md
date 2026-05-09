## Mudança de layout do email

### Estado atual
A tela `/email` é dividida em três colunas: **Sidebar de pastas | Lista de conversas (384px) | Leitor da conversa (flex)**. Clique simples abre o leitor inline; duplo clique abre um modal centralizado sem controles de janela.

### Novo layout

**1. Tela só com a lista**
- Remover a coluna `Reader` da direita.
- A lista de conversas (`ThreadList`) ocupa toda a área disponível ao lado do sidebar de pastas.
- Clique simples passa a abrir a conversa em uma **janela flutuante**.

**2. Janelas flutuantes (múltiplas)**
Substituir o `<Dialog>` atual por janelas estilo desktop. Suportar **várias janelas abertas simultaneamente**:

- Cada conversa aberta vira uma janela independente, com sua própria posição, tamanho e estado.
- Clicar em uma conversa já aberta traz a janela dela para frente (foco) em vez de duplicar.
- Cada nova janela abre levemente deslocada da anterior (cascade) para não ficarem todas empilhadas.
- Z-index gerenciado: a janela clicada vai para o topo.

Cada janela tem:
- **Barra de título** com assunto + botões: **Minimizar (–)**, **Restaurar/Maximizar (□)**, **Fechar (×)**.
- **Arrastar pela barra de título** para reposicionar.
- **Redimensionar pelas bordas e cantos** (handles em todos os lados).
- Três estados:
  - *Normal*: tamanho/posição livres (padrão inicial: 900×640, com cascade de +30px por janela).
  - *Maximizado*: ocupa toda a área útil (abaixo do header do app). Botão alterna para "Restaurar".
  - *Minimizado*: a janela some do palco e aparece como pílula na **barra inferior** (estilo Gmail) com o assunto + botão restaurar + botão fechar. Múltiplas pílulas ficam lado a lado na barra inferior.

**3. Barra inferior de janelas minimizadas**
- Fixa no rodapé da tela `/email`, alinhada à direita.
- Mostra cada janela minimizada como pílula clicável.
- Clique restaura a janela ao tamanho/posição anteriores.

**4. Persistência leve**
- Guardar tamanho/posição padrão da última janela em `localStorage` para que novas janelas reabram com proporções familiares.
- Não persistir o conjunto de janelas abertas entre recarregamentos (escopo de sessão).

### Detalhes técnicos

- Instalar `react-rnd` (≈9 KB gzip) para arrastar + redimensionar.
- Criar `src/components/email/ThreadWindow.tsx` — componente único de janela (barra de título, controles, drag/resize, estados).
- Criar `src/components/email/ThreadWindowManager.tsx` — gerencia o array de janelas abertas, z-index, foco, cascade, e renderiza a barra inferior de minimizadas.
- Em `EmailPanel.tsx`:
  - Remover o bloco `Reader` e a coluna `flex-1` que o continha.
  - Substituir o `<Dialog>` da conversa pelo `<ThreadWindowManager>`.
  - `openThread` passa a fazer "abrir nova janela ou focar existente" via API do manager.
  - Cada janela carrega suas próprias mensagens via `gmailGetThread` (já existe), com seu próprio estado de loading.
  - Manter o `<Dialog>` de **Compose** como modal (não muda).

### Validação
- Abrir 3+ conversas e verificar que cada uma vira uma janela independente, posicionadas em cascade.
- Arrastar, redimensionar, minimizar, maximizar, restaurar e fechar funcionam por janela.
- Janelas minimizadas aparecem como pílulas no rodapé e restauram ao clicar.
- Clicar na conversa de uma janela já aberta traz ela ao topo em vez de criar outra.
- Clicar em qualquer janela leva ela ao topo (z-index).
- Compose continua funcionando como antes.

### Arquivos envolvidos
- `src/components/email/EmailPanel.tsx` (remove coluna Reader, integra o manager).
- `src/components/email/ThreadWindow.tsx` (novo).
- `src/components/email/ThreadWindowManager.tsx` (novo).
- `package.json` (adiciona `react-rnd`).
