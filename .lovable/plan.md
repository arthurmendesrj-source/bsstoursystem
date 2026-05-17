## Objetivo
Adicionar dois novos módulos na barra lateral principal: **Financeiro** e **Marketing**, com criação básica (páginas placeholder) e **acesso restrito** já no primeiro release.

## Escopo

### 1. Novas rotas
- `src/routes/financeiro.tsx` → `/financeiro`
  - Página básica com título, descrição e cards placeholder (Contas a Pagar, Contas a Receber, Fluxo de Caixa).
  - `head()` com title/description próprios.
- `src/routes/marketing.tsx` → `/marketing`
  - Página básica com título, descrição e cards placeholder (Campanhas, Leads por Canal, Automações).
  - `head()` com title/description próprios.

Ambas usam `AppShell`, tokens semânticos do design system, sem cores hardcoded.

### 2. Restrição de acesso (versão inicial, baseada em role)
Reaproveitando o padrão já existente no projeto (`useEffectiveAuth` + `isAdmin` / `hasRole`), sem criar tabela nova:

- **Financeiro**: visível e acessível apenas para `admin`, `diretor` e `financeiro` (se existir esse role; caso contrário, apenas admin/diretor).
- **Marketing**: visível e acessível apenas para `admin`, `diretor` e `gerente`.

Implementação:
- No componente da rota, se o usuário não tem o role permitido, renderizar um bloco "Acesso negado" (mesmo padrão usado em outras telas restritas).
- Na sidebar (`AppShell.tsx`), só renderizar o item se o usuário tiver o role permitido (igual ao tratamento atual de "Gerencial" e do bloco admin).

Hook futuro: quando o sistema de "acesso por módulos" (`has_module_permission`) for criado, basta trocar a checagem por role pela checagem por permissão de módulo — a estrutura fica preparada.

### 3. Sidebar (`src/components/AppShell.tsx`)
- Importar ícones `Wallet` e `Megaphone` do `lucide-react`.
- Adicionar dois itens condicionais logo após "Alertas":
  - "Financeiro" → `/financeiro` (gate por role)
  - "Marketing" → `/marketing` (gate por role)
- Funciona em modo expandido e colapsado (com tooltip).

### 4. Fora de escopo (agora)
- Nenhuma tabela, RLS, integração financeira (gateways, conciliação) ou ferramentas de marketing (envio de campanhas, tracking).
- Não criar ainda o sistema genérico de "acesso por módulo" — só deixar o ponto pronto para receber.
- Sem entradas no `i18n` por enquanto (labels fixos "Financeiro" / "Marketing").

## Verificação
- Usuário sem o role permitido **não vê** o item na sidebar e recebe "Acesso negado" se acessar a URL diretamente.
- Usuário com role permitido vê os itens e abre as páginas placeholder normalmente.
- Sidebar funciona expandida e colapsada.

## Pergunta antes de implementar
Confirma os roles para cada módulo?
- **Financeiro** → admin + diretor (+ "financeiro" se existir esse role no projeto)
- **Marketing** → admin + diretor + gerente

Se quiser outra combinação (por exemplo, "Marketing também para operacional"), me diga que ajusto antes de codar.
