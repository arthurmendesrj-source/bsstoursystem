## Objetivo
Garantir que os modais de criação manual de **lead** e **tarefa** dentro do `EmailPanel` (painel de e-mail) também tenham o seletor "Atribuir a" / "Responsável" para subordinados — alinhando com o que já existe em `/leads` e `/activities`.

## Situação atual
- `src/routes/leads.tsx` ✅ já tem campo "Atribuir a" (visível quando há subordinados).
- `src/routes/activities.tsx` ✅ já tem campo "Responsável".
- `src/components/email/EmailPanel.tsx` ⚠️ tem o estado `assigned_to` nos forms e envia o valor no insert, **mas não renderiza nenhum Select na UI** — então hoje sempre cai no `user.id` (atual usuário).

## Alterações

### `src/components/email/EmailPanel.tsx`
1. No modal **"Novo lead"** (e no modal de revisão pré-preenchido pela IA), adicionar abaixo dos campos atuais:
   - `<Label>Atribuir a</Label>`
   - `<Select>` com opções: "Eu mesmo" (default = `self`) + lista de `subordinates` (mostrando `full_name (role)`).
   - Visível apenas se `subordinates.length > 0`.
2. No modal **"Nova tarefa"**, adicionar:
   - `<Label>Responsável</Label>`
   - Mesmo padrão de Select com subordinados.
3. Reaproveitar exatamente o padrão visual já usado em `leads.tsx` / `activities.tsx` para consistência.

## Fora do escopo
- RLS, hierarquia e hook `useSubordinates` — já implementados.
- Ação em massa em `/users` ("Distribuir N…") — pode ser feita depois se quiser.
