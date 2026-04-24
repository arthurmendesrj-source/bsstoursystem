

# Adicionar Russo aos programas gerados por IA

Incluir o idioma **Russo (RU)** como opção na geração do documento da proposta, junto de PT/EN/ES já planejados.

## Mudanças

- **`GenerateDocDialog.tsx`** (a ser criado): adicionar `ru` ao seletor de idioma — opções ficam: Português · English · Español · Русский.
- **Edge function `generate-proposal-doc`**: aceitar `language: "ru"` no payload; o system prompt passa a instruir o modelo a gerar `title`, `intro`, `days[].narrative`, `inclusions`, `exclusions` e `notes` em russo quando selecionado. Cabeçalhos fixos da tabela (Day, City, Total, etc.) também são traduzidos para russo no template `.docx`.
- **`src/lib/i18n.tsx`**: adicionar a chave `languageRussian` nos três idiomas existentes da UI (PT/EN/ES) — só rotula o item no seletor; **não** vamos adicionar russo como idioma da própria interface do CRM (fora do escopo).
- **`quote_documents.language`**: a coluna fica como `text` livre (sem CHECK constraint), então aceita `"ru"` sem migration nova.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `src/components/proposal/GenerateDocDialog.tsx` (no momento da implementação) |
| Editar | `supabase/functions/generate-proposal-doc/index.ts` (no momento da implementação) |
| Editar | `src/lib/i18n.tsx` |

## Fora de escopo

- Traduzir a interface do CRM para russo.
- Ditado de itens em russo (já funciona automaticamente — Gemini detecta o idioma falado).

