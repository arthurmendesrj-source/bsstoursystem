## Objetivo

Vídeo MP4 curto (~30s) demonstrando o fluxo operacional, com **screenshots reais** capturados no preview e montados em timeline animada (Remotion).

## Mapeamento de papéis (corrigido)

| Papel | Email | Senha |
|---|---|---|
| **Diretor** | `agrafena.svetlova@sim.local` | `senhaSim@12345` |
| **Gerente** | `alexandra.ermolaeva@sim.local` | `senhaSim@12345` |
| **Operador** | `sergei.koroliov@sim.local` | `senhaSim@12345` |
| **Coordenador** | `mikhail.kutuzov@sim.local` | `senhaSim@12345` |

## Cenário (fluxograma)

1. **Diretor (Agrafena)**
   - Abre `/email` → caixa de entrada
   - Abre um email de cliente
   - Aciona **Triagem** → decide:
     - Se for cotação → **Criar Lead** (atribuído ao Gerente Alexandra)
     - Se não → **Criar Atividade**
   - Confirma criação do lead

2. **Gerente (Alexandra)**
   - Recebe lead em `/leads` (atribuído a mim)
   - Abre lead → cria **Cotação** → atribui ao Operador Sergei

3. **Operador (Sergei)**
   - Abre cotação → adiciona itens → envia ao cliente
   - Marca como ganha → gera **Booking**

4. **Coordenador (Mikhail)**
   - Abre `/bookings` → confirma fornecedores → fecha reserva

## Produção

### A. Captura (browser tool)
- Para cada papel: login → navegar pelas telas → executar ações reais → `browser--screenshot` em cada momento-chave (~12-15 frames)
- Salva em `/tmp/demo/{papel}-{n}.png`

### B. Montagem (Remotion)
- 1920×1080, 30fps, ~900 frames (30s)
- Cada screenshot = cena de ~2s com Ken Burns sutil
- Legenda inferior do passo (ex.: "Diretor abre o email", "Cria lead para o Gerente")
- Badge superior com nome + papel ativo
- Chip colorido grande nas trocas de papel
- Transições fade/slide; sem áudio
- Render para `/mnt/documents/demo-fluxo.mp4`

### C. Entrega
- `<lov-artifact>` do MP4
- Lista dos registros criados (lead, cotação, booking) com prefixo "DEMO —" para você limpar depois se quiser

## Confirmações antes de executar
- A captura **cria dados reais** no sistema (1 lead, 1 cotação, 1 booking). OK prefixar com "DEMO —"?
- Se algum login falhar, eu paro e aviso.
