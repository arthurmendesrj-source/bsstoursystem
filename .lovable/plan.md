## Cadastro em massa de fornecedores

Analisei o ZIP `FORNECEDORES-20260506T002214Z-3-001.zip`. Os arquivos estão organizados por **país → cidade → fornecedor** (ano 2026), com tarifários em PDF/XLSX/imagens. Vou extrair o nome de cada fornecedor a partir das pastas/arquivos e inseri-los na tabela `suppliers`.

### Fornecedores identificados (≈35)

| País | Cidade | Fornecedor | Categoria sugerida |
|---|---|---|---|
| Chile | Atacama | Margarita Atacama (guia EN/RU) | receptivo |
| Chile | Santiago / Patagônia | Jaime Chile Planet | operadora |
| Bolívia | — | Scarlet Bolivia | operadora |
| Bolívia | — | Strawberry Travel | operadora |
| Uruguai | Montevideo | Standard Transfer (driver) | transfer |
| Uruguai | Montevideo | VIP Transfer (driver) | transfer |
| Uruguai | Montevideo | Evgenia (guia/driver RU) | receptivo |
| Colômbia | — | Colombia Rates (operadora) | operadora |
| Argentina | BA/Calafate/Ushuaia/Salta | Pavlo | receptivo |
| Argentina | Bariloche | Uniqued (Federico) | receptivo |
| Argentina | Mendoza | Elena (guia RU) | receptivo |
| Argentina | Mendoza | Mendoza Servicios | receptivo |
| Brasil | Recife | Luck Receptivo Recife | receptivo |
| Brasil | Brasília | Prestheza | receptivo |
| Brasil | Amazonas | Cabral Expeditions | receptivo |
| Brasil | Foz do Iguaçu | EcoIguassu | receptivo |
| Brasil | Foz do Iguaçu | MMC Transportes | transfer |
| Brasil | Pantanal | Prado | receptivo |
| Brasil | Búzios | In Búzios | receptivo |
| Brasil | Natal | Luck Natal | receptivo |
| Brasil | Rio de Janeiro | Helisight / Helisul | passeio |
| Brasil | Rio de Janeiro | Trans Rezende (micro/ônibus) | transfer |
| Brasil | Rio de Janeiro | Fogo de Chão | outro (restaurante) |
| Brasil | Rio de Janeiro | Churrascaria Palace | outro |
| Brasil | Rio de Janeiro | Carretão | outro |
| Brasil | Rio de Janeiro | Siqueira Grill | outro |
| Brasil | Rio de Janeiro | Baleia | outro |
| Brasil | Rio de Janeiro | Riocopter | passeio |
| Brasil | Rio de Janeiro | Select | receptivo |
| Brasil | Rio de Janeiro | Corcovado (trem) | passeio |
| Brasil | Rio de Janeiro | Twister | passeio |
| Brasil | Rio de Janeiro | Jeep Tour | passeio |
| Brasil | Rio de Janeiro | Brummie Lines | transfer |
| Brasil | Rio de Janeiro | Carnaval Experience | passeio |
| Brasil | São Paulo | Pamtur | receptivo |
| Brasil | Fortaleza | Nettour | receptivo |
| Brasil | Bonito | Agência Bonito & Pantanal | receptivo |
| Peru | — | Vipac | operadora |
| Guatemala/Belize | — | PTP Mundo Maya | operadora |

### O que vou fazer

1. Inserir cada fornecedor em `public.suppliers` via SQL com:
   - `name`, `category` (enum existente), `status='ativo'`
   - `address_city`, `address_country`
   - `default_currency='USD'` (a maioria são tarifários em USD; Brasil será BRL)
   - `notes` com o caminho de origem do arquivo (ex.: `2026/CHILE/JAIME CHILE PLANET`)
   - `tags` com `['2026','tarifário']` + idiomas detectados (EN/RU/ES/PT) quando aplicável
   - `created_by` = seu usuário atual (preciso pegar via SQL `auth.uid()` no momento do insert — usarei o owner mais recente da tabela ou pedirei o user_id)
2. **Não vou fazer upload dos PDFs/planilhas** — apenas cadastro dos fornecedores. Se quiser que eu também envie os tarifários para o módulo de Itinerários ou crie um bucket `supplier-docs`, me avise.
3. Evitar duplicatas: antes de inserir, verifico `name` já existente (case-insensitive).

### Pergunta antes de aplicar

- Confirmar `created_by`: uso o seu user (admin atualmente logado)? Vou pegá-lo da tabela `user_roles` filtrando `role='admin'`.
- Quer que eu também faça upload dos arquivos para um bucket de documentos do fornecedor? (recomendo um novo bucket `supplier-docs` privado, mas isso adiciona ~30 min de trabalho).

Após aprovação, executo os inserts em uma única migração de dados (insert tool).