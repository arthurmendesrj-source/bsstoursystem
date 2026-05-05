## Mudança em `/activities` — Dialog "Vincular a Lead"

Substituir o `<Select>` atual por um combobox com busca digitável (ShadCN `Command` dentro de `Popover`).

### Detalhes

- **Tipo `LeadLite`**: adicionar `destination?: string | null` (já existe na tabela `leads`).
- **Carregamento de leads**: no `useEffect` que carrega `leadOptions`, adicionar `destination` ao `select(...)`.
- **UI no Dialog**:
  - `Popover` + `Button` (variant `outline`, w-full, mostra lead selecionado ou placeholder "Buscar por código, nome ou destino…").
  - Dentro: `Command` com `CommandInput` (placeholder de busca), `CommandList`, `CommandEmpty` ("Nenhum lead encontrado"), `CommandGroup` com `CommandItem` para cada lead.
  - `CommandItem` exibe `code · name · destination` e tem `value={`${code} ${name} ${destination}`}` para que o `Command` faça o filtro nativo por qualquer um dos campos.
  - Item especial no topo "— Desvincular".
  - `onSelect` define `linkLeadId`, fecha o popover.
- **i18n**: adicionar `searchLeadPlaceholder` (pt: "Buscar por código, nome ou destino…", en: "Search by code, name or destination…", es: "Buscar por código, nombre o destino…") e `noLeadsFound`.

### Observação
"Assunto" no contexto de leads = `destination` (campo principal de assunto da viagem). Se o usuário quiser outro campo, pode-se adicionar depois.