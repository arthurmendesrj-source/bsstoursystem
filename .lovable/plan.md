## Mudança

Em `src/routes/biblia.tsx`, na tabela "Tráfego":

- Renomear a coluna **Fatura** para **Invoice**.
- Mover essa coluna para a primeira posição (antes de **Serviço**).
- Reordenar as células do corpo da tabela de forma equivalente: a célula de Invoice (com o link para `/bookings/$bookingId`) passa a ser a primeira de cada linha.
- Manter as demais colunas inalteradas: Serviço · Hotel · Motorista · Fornecedor · Guia · Data · P · Cidade · Pax · Nome Pax · Status · Ações.

Nenhuma mudança de banco, dados ou outros arquivos.