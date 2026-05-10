## Objetivo

1. **Auto-save** no editor de proposta: grava automaticamente 2s após qualquer alteração, com indicador discreto "Salvando…/Salvo" no cabeçalho (sem toasts repetidos).
2. **Janela flutuante persistente**: a janela de proposta (e demais janelas flutuantes) continua aberta ao navegar entre telas (`/leads`, `/bookings`, etc.), não só dentro de `/workspace`.

---

## 1. Janela flutuante global

**Mover** `WorkspaceWindowsProvider` de `src/routes/workspace.tsx` para `src/routes/__root.tsx`, dentro de `RootComponent` (logo abaixo de `PermissionsProvider`, envolvendo `<Outlet />`).

Resultado: o `FloatingWindowManager` é montado uma única vez no app inteiro; abrir uma proposta no `/workspace` mantém a janela visível ao navegar para `/leads` ou qualquer outra rota.

Nada muda na API do hook `useWorkspaceWindows()` — `workspace.tsx` continua usando como hoje, mas sem montar o provider localmente.

## 2. Auto-save no `ProposalEditor`

Em `src/components/proposal/ProposalEditor.tsx`:

- Novo estado `saveStatus: "idle" | "dirty" | "saving" | "saved" | "error"` e `lastSavedAt: Date | null`.
- Novo flag `dirtyRef` (useRef) para distinguir mudanças do usuário das vindas do `load()` inicial.
- `useEffect` que observa `[items, bankFee, quote?.notes, quote?.valid_until, quote?.currency, quote?.default_markup_pct]`:
  - Ignora a primeira execução pós-`load()`.
  - Marca `saveStatus = "dirty"` e agenda `setTimeout(2000)` chamando uma versão silenciosa de `save()`.
  - Limpa o timer anterior em cada mudança (debounce).
- Refatorar `save()` para aceitar `{ silent?: boolean }`:
  - Quando `silent`, não dispara `toast.success` nem `load()` (apenas atualiza ids de itens novos retornados pelo insert).
  - Em erro silencioso, define `saveStatus = "error"` (mantém toast só nos erros).
  - O botão "Salvar" manual continua funcionando como hoje (com toast).
- Pausar auto-save enquanto `saving === true` ou enquanto algum dialog filho (`hotelDialogOpen`, `serviceDialogOpen`, `flightDialogOpen`) estiver aberto, para evitar conflito com gravações próprias desses diálogos.
- Disparar um auto-save imediato (flush) ao desmontar o componente, se `saveStatus === "dirty"`.

### Indicador no cabeçalho

No header do editor (mesma linha do botão "Salvar"), adicionar um pequeno texto:

- `dirty` → "Alterações não salvas" (cinza)
- `saving` → "Salvando…" (com ícone girando)
- `saved` → "Salvo • HH:mm" (verde discreto)
- `error` → "Erro ao salvar" (vermelho)

## 3. Detalhes técnicos

- O `load()` atual já é chamado em `useEffect([quoteId])`. Após o load, resetar `dirtyRef = false` para o `useEffect` de auto-save não disparar.
- O auto-save NÃO precisa salvar enquanto `loading === true`.
- Os diálogos `HotelDialog`/`ServiceDialog`/`FlightDialog` continuam fazendo seu próprio insert/update — eles não dependem do auto-save.
- Permissão: se `!canEdit`, auto-save fica desligado (mesmo guard já presente em `save()`).

## Fora do escopo

- Versionamento/histórico de alterações.
- Conflict resolution multi-usuário (último a salvar vence, como hoje).
- Persistência da janela após F5/reload (apenas durante navegação SPA).
