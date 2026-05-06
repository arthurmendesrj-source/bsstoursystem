## Importar fornecedores do Beglobber

Você colou ~100 fornecedores do `adatours.beglobber.com/suppliers` (a página exige login Google, então não consegui buscar direto — copy/paste é o caminho).

### Passos

1. **Parse do texto colado** — script Node converte cada linha em registro:
   - `name`, `address_city` (código IATA: RIO, MAO, GUA…), `address_country` (BR, MX, PE…), `phone`, `email`.
   - Trata múltiplos telefones/emails separados por `;` (mantém o primeiro, demais vão para `notes`).
   - Limpa lixo: `@nenhum`, `nenhum@nenhum`, `naotem@naotem`, `.` viram `NULL`.

2. **Dedup contra os 437 existentes**:
   - Match por (a) email exato, (b) phone normalizado (só dígitos), ou (c) nome normalizado (lower, sem acento, sem espaços).
   - Se já existe → **atualiza** campos vazios (preenche email/phone/cidade se estiverem nulos no banco).
   - Se não existe → **insere** novo com `category='outro'`, `status='ativo'`, `default_currency='BRL'`, `created_by` = seu user_id.

3. **Mapeamento de país** — converte códigos para nomes consistentes:
   - BR→Brasil, MX→México, PE→Peru, AR→Argentina, CR→Costa Rica, CO→Colômbia, BO→Bolívia, BZ→Belize, CL→Chile, GT→Guatemala, PA→Panamá, UY→Uruguai, CU→Cuba, CE→Equador, COL→Colômbia.

4. **Relatório final** no chat: X inseridos, Y atualizados, Z ignorados (duplicados sem alterações), com lista dos nomes em cada bucket para você revisar.

### Observações

- O `code` (ex: SF0526) é gerado automaticamente pelo trigger `set_supplier_code`.
- Não importo `iata_code` para `address_city` literalmente porque o campo `address_city` espera nome — vou colocar o código IATA em `iata_code` (campo correto da tabela) e deixar `address_city` em branco para enriquecer depois.
- Linhas claramente quebradas (ex: "Sérgio Luiz" com email no campo phone) são corrigidas heuristicamente: se o "phone" tem `@`, troca com o email.

Aprovar para eu rodar o import?