## Diagnóstico

Olhando os logs da edge function `process-itinerary`, há **dois problemas reais** acontecendo (o upload ao Storage funciona — o que falha é o processamento que roda logo depois):

1. **`Memory limit exceeded`** — a função está estourando memória ao processar arquivos grandes. Hoje ela faz tudo num único request: baixa o .docx/.pdf, extrai texto, chama IA para metadados, gera *todos* os embeddings e insere chunks. Para roteiros longos isso ultrapassa o limite da edge function.

2. **`Could not find file in options`** — erro do `mammoth` no Deno. Ao receber `{ arrayBuffer: buf }` vindo de `blob.arrayBuffer()`, o build de `mammoth@1.8.0` no esm.sh não reconhece o ArrayBuffer puro e exige um `Buffer` do Node ou `Uint8Array`.

Resultado prático para você: o arquivo *sobe* para o Storage e o registro é criado, mas o card aparece com status **"failed"** ou trava em "processing", e parece que "o upload não funcionou".

## O que vou mudar

### 1. `supabase/functions/process-itinerary/index.ts`
- **Corrigir mammoth**: passar `Buffer.from(buf)` (via `node:buffer`) em vez de `{ arrayBuffer }`. Resolve o "Could not find file in options".
- **Reduzir uso de memória**:
  - Liberar o `ArrayBuffer` (`buf = null`) imediatamente após extrair o texto.
  - Baixar embeddings em lotes menores (8 em vez de 16) e fazer `insert` dos chunks no mesmo loop, sem manter o array gigante de embeddings em memória.
  - Truncar `extracted_text` salvo no DB para 100 KB (em vez de 200 KB).
  - Limitar texto enviado para extração de metadados (já está em 12k — manter).
- **Timeout/erro mais claro**: retornar mensagem específica quando texto > X chars, sugerindo dividir o documento.

### 2. `src/routes/itineraries.tsx`
- **Desacoplar upload de processamento**: hoje o frontend espera o `process-itinerary` retornar antes de marcar "ready". Vou:
  - Marcar a job como **"ready"** (enviado) assim que o upload ao Storage + insert do registro derem certo.
  - Disparar `process-itinerary` em *fire-and-forget* (sem `await` bloqueando o worker), e deixar o realtime + status do registro mostrarem o progresso da IA.
  - Assim, mesmo se a IA falhar para um arquivo, o upload em si nunca aparece como "falhou" e o usuário pode reprocessar depois pelo botão já existente.
- Mostrar mensagens de erro mais legíveis (truncar stack, traduzir "Memory limit exceeded" para "Documento muito grande — tente dividir").
- Reduzir concorrência padrão de 3 para 2 para não saturar a edge function.

### 3. Reprocessar os que já falharam
Após o deploy das correções, vou:
- Listar os roteiros com `processing_status = 'failed'` ou travados em `processing`.
- Re-disparar `process-itinerary` para cada um (em lotes pequenos), para você não precisar reenviar manualmente.

## Fora do escopo
- Conversão automática de `.doc` legado → continua exigindo conversão manual para `.docx`/`.pdf`.
- Não vou trocar o modelo de embedding nem mexer no schema do banco.
