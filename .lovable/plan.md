# Pacote completo do código-fonte para auditoria externa

## O que será entregue
Um arquivo ZIP com todo o código do aplicativo, pronto para enviar ao auditor, salvo em Arquivos (Files).

## Conteúdo do pacote
- Todo o código das telas e funções do app (pasta `src/`)
- Funções do servidor e todas as migrações do banco de dados (pasta `supabase/`), incluindo regras de segurança (RLS)
- Arquivos de configuração (package.json, vite.config.ts, tsconfig.json, wrangler.jsonc, etc.)
- Documentação existente (pasta `docs/`, incluindo os relatórios de auditoria anteriores) e AGENTS.md
- Arquivos públicos (pasta `public/`)
- Um arquivo LEIAME-AUDITORIA.md explicando a estrutura do sistema, tecnologias usadas e onde fica cada módulo (CRM, propostas, reservas, e-mail, assistente IA, cobrança, permissões)

## O que NÃO entra (por segurança e tamanho)
- Arquivo `.env` com chaves (substituído por um `.env.example` sem valores)
- Pastas de dependências instaladas e arquivos gerados de build
- Metadados internos de versionamento (.git) e da plataforma (.lovable)
- Dados reais dos clientes (o banco não é exportado, apenas a estrutura)

## Etapas técnicas
1. Montar uma pasta limpa em /tmp copiando somente os itens acima.
2. Listar todo o conteúdo (incluindo arquivos ocultos) e conferir que não há chaves/segredos.
3. Gerar o ZIP em /tmp, inspecionar a lista de arquivos e copiar para /mnt/documents como `codigo-fonte-auditoria-2026-11.zip`.
