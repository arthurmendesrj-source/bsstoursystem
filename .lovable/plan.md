## Objetivo

Permitir que o usuário ajuste manualmente a altura da caixa de conteúdo do email (o iframe dentro de cada mensagem na janela de leitura), arrastando a borda inferior para cima/baixo.

## Mudança

Arquivo: `src/components/email/ThreadReader.tsx`

Hoje o iframe da mensagem usa `className="w-full min-h-[200px] border-0"` com altura fixa mínima. Vamos:

1. Envolver o `<iframe>` (e o `<pre>` do fallback texto) em um `<div>` wrapper com:
   - `resize: vertical`
   - `overflow: auto`
   - altura inicial (`height: 400px`) e `min-height: 120px`, `max-height: 80vh`
   - borda discreta para indicar a área redimensionável
2. O iframe interno passa a `h-full w-full` para preencher o wrapper.
3. Persistir a última altura escolhida em `localStorage` (chave `email.reader.msgHeight`) para que, ao abrir outras mensagens, a altura preferida seja reusada. Salvamos no `onMouseUp` do wrapper lendo `el.getBoundingClientRect().height`.

Resultado:
- Aparece uma alça nativa do navegador no canto inferior direito do quadro da mensagem.
- Usuário arrasta para baixo/cima e ajusta só a altura (largura continua acompanhando a janela).
- A próxima mensagem aberta já vem com a altura preferida.

## Validação

- Abrir uma janela de email → arrastar a borda inferior do quadro da mensagem → altura muda suavemente.
- Fechar e abrir outra mensagem → vem com a mesma altura definida antes.
- Janela maximizada e janela normal: ambos casos funcionam, sem quebrar o scroll externo do `ScrollArea`.
- Mensagens com anexos: anexos seguem aparecendo abaixo, fora da área redimensionável.
