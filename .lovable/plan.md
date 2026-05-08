## Objetivo
Permitir escolher o período da sincronização completa (3, 6, 12 meses ou personalizado) antes de iniciar.

## Escopo
Apenas frontend, em `src/components/email/EmailPanel.tsx`. Backend já aceita `windowDays` arbitrário (1–3650) — nenhuma mudança em `gmail-mirror.functions.ts`, `gmail-poll.ts`, banco ou RLS.

## Mudanças

1. **Estado novo**:
   - `syncWindowDays: number` (default `180`), persistido em `localStorage` (`email.sync.windowDays`) para lembrar a preferência do usuário entre sessões.
   - `syncMenuOpen: boolean` para controlar o popover.

2. **UI do botão "Sincronizar"** (sidebar expandida e colapsada):
   - Substituir o `<Button onClick={doFullSync}>` por um `DropdownMenu` (shadcn, já presente no projeto):
     - **Item principal** (clique direto no botão): inicia sync com o período atual (mostra label tipo "Sincronizar (6 meses)").
     - **Botão chevron** ao lado abre o menu com opções:
       - "Últimos 3 meses" → 90 dias
       - "Últimos 6 meses" → 180 dias (default)
       - "Últimos 12 meses" → 365 dias
       - "Últimos 24 meses" → 730 dias
       - Separador
       - "Personalizado…" → abre um pequeno `Dialog` com `Input type=number` (1–3650 dias) e botão "Sincronizar".
   - Ao escolher uma opção do menu: salva em `localStorage`, fecha o menu e dispara o sync imediatamente com aquele período.
   - Versão colapsada (sidebar w-14): mantém apenas o ícone `RefreshCw` que abre o mesmo menu (sem split-button por falta de espaço).

3. **`doFullSync(days?: number)`**:
   - Aceita um parâmetro opcional `days`; usa `days ?? syncWindowDays` e passa para `fullSyncFn({ data: { restart: i === 0, windowDays } })`.
   - O painel de progresso já existente passa a mostrar no cabeçalho "Sincronizando últimos N meses" derivado do período escolhido (3 / 6 / 12 / 24 / "N dias").

4. **Sem mudanças** em: estado de progresso por pasta, lógica de retomada (`restart` no primeiro lote), polling incremental, ou no endpoint `/api/public/gmail-poll` (que continua usando 180 dias por padrão para cron).

## Detalhes técnicos
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` de `@/components/ui/dropdown-menu`.
- `Dialog` para o personalizado (componente já importado no arquivo).
- Tokens semânticos do design system (sem cores hardcoded).
- Preferência persistida com try/catch em `localStorage` (mesmo padrão do `LS_COLLAPSED`).

## Fora de escopo
- Janelas por pasta diferentes (ex.: 12 meses só para SENT). O período se aplica a todas as pastas, como hoje.
- Sincronização parcial (ex.: só uma pasta). Continua sincronizando todas as 7 labels do `SYNC_LABELS`.
