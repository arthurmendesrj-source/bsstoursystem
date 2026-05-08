## Objetivo

Reformular o `EmailPanel` para ficar como um cliente de email completo, com painéis ajustáveis, sidebar colapsável e funções de IA + Associar reintroduzidas.

## Mudanças

### 1. Sidebar de pastas colapsável (estilo "toolbar")
- Adicionar estado `foldersCollapsed` (persistido em `localStorage`).
- Botão de toggle no topo da sidebar (ícone `PanelLeftClose` / `PanelLeftOpen`).
- Quando colapsada: largura fixa `w-14`, mostra apenas ícones das pastas (com `Tooltip` no hover exibindo o nome e contador de não lidas).
- Quando expandida: comportamento atual com nomes e contadores.
- O botão "Sincronizar Gmail" vira ícone `RefreshCw` no estado colapsado.

### 2. Painéis redimensionáveis (largura editável)
- Substituir os três `<aside>/<section>` fixos por `ResizablePanelGroup` (`react-resizable-panels` já presente em `src/components/ui/resizable.tsx`).
- Estrutura: `Sidebar | ResizableHandle | Lista de Threads | ResizableHandle | Leitor`.
- Persistir os tamanhos em `localStorage` (`email.panels.sizes`) via `onLayout` do grupo.
- Tamanhos mínimos sensatos (`minSize` em %): sidebar 8, lista 18, leitor 30.
- Quando a sidebar estiver colapsada, ela sai do grupo redimensionável e vira um `div` fixo `w-14` ao lado do grupo (para não permitir resize do strip de ícones).

### 3. Duplo clique abre popup independente da thread
- Adicionar `onDoubleClick` em cada item de thread na lista.
- Estado `popupThreadId: string | null` que abre um `Dialog` grande (`sm:max-w-5xl`, `h-[85vh]`) renderizando o mesmo Reader (extraído para um subcomponente `ThreadReader` reutilizado pelo painel principal e pelo popup).
- O popup é independente do `selectedThreadId` — pode-se ter uma thread aberta no painel e várias outras em popups (cada chamada de duplo clique substitui o popup atual; manter simples com 1 popup por vez).
- Dentro do popup: mesmas ações (Reply, Forward, Star, Archive, Trash, Anexos) e também os botões de IA/Associar abaixo.

### 4. Reintroduzir IA + Associar
Recolocar os fluxos que existiam antes:

**Botão "Triagem com IA"** na barra de ações do leitor (e no popup):
- Chama `emailAnalyze` (já existe em `src/server/gmail.functions.ts`) com o `gmail_id` da última mensagem.
- Abre `Dialog` de triagem mostrando: `summary`, `suggested_action`, `intent`, dados extraídos (cliente, destino, pax, valor estimado).
- Três botões finais:
  - **Criar Lead** — pré-preenche e navega para `/leads` com `state` (ou abre dialog) usando os dados extraídos; persiste `email_id` no lead.
  - **Criar Atividade** — abre dialog simples (título, categoria negocio/suporte, prioridade, descrição com summary, due date) e insere em `tasks` com `source='email'` e `email_id`.
  - **Ignorar** — fecha e marca thread como lida.

**Botão "Associar"** na mesma barra:
- Abre `AssociateDialog` (`src/components/AssociateDialog.tsx`) com tabs `lead | customer | supplier | quote | booking`.
- Ao escolher: faz `update` em `email_threads`/`emails` setando `lead_id` / `customer_id` / `supplier_id` / `quote_id` / `booking_id` na thread atual (e em todas as mensagens da thread).
- Toast de confirmação. Mostrar chip "Associado a: …" no header do leitor quando houver vínculo.

### 5. Detalhes técnicos

```text
EmailPanel
├── Sidebar (colapsável, w-60 ↔ w-14)
└── ResizablePanelGroup (horizontal)
    ├── Panel: ThreadList            (defaultSize 28, min 18)
    ├── ResizableHandle
    └── Panel: ThreadReader          (defaultSize 60, min 30)

ThreadReader  (componente extraído)
├── Header com ações: Archive, Trash, Star, "Triagem IA", "Associar"
├── ScrollArea com mensagens
└── Footer Reply/Forward por mensagem

Popup independente
└── Dialog → ThreadReader (mesma instância de componente)
```

- Persistência: `localStorage` para `foldersCollapsed` e tamanhos dos painéis.
- Schema: verificar se `email_threads` tem colunas `lead_id`, `customer_id`, `supplier_id`, `quote_id`, `booking_id`. Se faltarem, criar migration adicionando-as como `uuid null` (sem FK rígida para evitar quebrar deletes em cascata indesejados) e índices.
- IA: reaproveita `emailAnalyze` existente (sem alterar backend).
- Tooltips: usar `@/components/ui/tooltip` no estado colapsado.

## Arquivos afetados

- `src/components/email/EmailPanel.tsx` — refator principal (sidebar colapsável + ResizablePanelGroup + duplo clique + extração de `ThreadReader`).
- `src/components/email/ThreadReader.tsx` — novo (subcomponente reutilizado por painel e popup).
- `src/components/email/AiTriageDialog.tsx` — novo (UI da triagem com IA + criar lead/atividade/ignorar).
- Migration `add_email_thread_associations` — apenas se as colunas de associação não existirem.

## Fora do escopo

- Não alterar backend de sync/realtime do Gmail.
- Não mexer no modo `lead` (`LeadEmailMini`) — segue como está.
