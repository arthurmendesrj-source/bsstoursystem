## Plano para corrigir a aba “Licença”

1. **Corrigir o crash da página `/billing`**
   - A página está quebrando ao renderizar planos porque os recursos do plano (`features`) podem vir do backend em formatos diferentes.
   - Vou normalizar esse campo antes de renderizar, garantindo que nunca seja chamado `.map` em um valor que não é lista.

2. **Manter o menu “Licença” navegando para `/billing`**
   - O item do menu já aponta para `/billing`; vou preservar isso e corrigir a renderização da página de destino.

3. **Deixar o Plano Avulso aparecendo de forma segura**
   - Vou garantir que o card do plano continue mostrando R$150/mês, 1 usuário e o botão “Assinar este plano”, sem depender de um formato frágil de `features`.

4. **Validar o resultado**
   - Confirmar que clicar em “Licença” não deixa mais a tela em branco e que a aba carrega com os cards de cobrança/planos.