## Reformatar a tabela de Fornecedores

Ajustar `/suppliers` para o layout da imagem, mantendo a coluna de Categoria.

### Novo cabeçalho da tabela (na ordem)

1. Ação excluir (ícone lixeira, à esquerda)
2. Nome (negrito)
3. Categoria (badge — mantida conforme pedido)
4. Código da Cidade
5. Código do País
6. Telefone
7. E-mail
8. Ação editar (ícone lápis, à direita)

Removidas: City (texto livre "cidade, país"), Status, Rating, ícone Eye.

### Mudanças visuais

- Linhas com **zebra striping** (alternar `bg-muted/30` nas linhas pares) como na imagem.
- Ícone lixeira em botão `variant="ghost" size="icon"` na primeira célula → confirma e chama `supabase.from("suppliers").delete().eq("id", s.id)` + reload.
- Ícone lápis na última célula → abre o `SupplierDrawer` (em vez de clicar na linha inteira) ou abre dialog de edição. Mantemos drawer para preservar funcionalidade existente.
- Campo de busca "Procurar" continua no topo do Card; remover os dois selects de filtro (Categoria/Status) para combinar com a imagem — ou mantê-los? **Decisão:** remover para ficar igual à imagem; categoria já aparece como coluna.
- Cabeçalho do Card mostra "Fornecedores" à esquerda e search à direita (layout flex).

### Mapeamento de campos

- **Código da Cidade** → `address_city` (já armazena códigos IATA tipo "CUN", "RIO" nos dados importados).
- **Código do País** → `address_country` (já armazena "BR", "MX" etc).
- **Telefone** → `phone`.
- **E-mail** → `email`.

### Arquivos a editar

- `src/routes/suppliers.tsx` — substituir o bloco da tabela (linhas ~249-307) e adicionar handler `handleDelete`.

Sem mudanças de schema, sem migrations.
