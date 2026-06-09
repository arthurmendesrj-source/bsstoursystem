## Ajustar a aba “Licença”

**Problema atual**: quando o usuário não tem empresa selecionada, a página `/billing` mostra um card com botão “Criar empresa”. Você quer que essa aba mostre **pacotes (planos) e o pacote assinado**, sem botão de criar empresa.

### Mudanças em `src/routes/billing.tsx`

1. **Remover o fallback “Criar empresa”** (linhas ~73–100).
   - Sem tenant selecionado, não mostrar mais o card com `Link to="/onboarding"`.
   - Remover imports `Building2`, `Plus`, `Link` que ficam sem uso.

2. **Mostrar sempre a lista de pacotes**.
   - Renderizar a seção de planos (`PlansSection`) mesmo quando não há tenant/assinatura, usando `currentPlanCode = null`.
   - Quando houver tenant + assinatura, marcar o plano atual como “Atual” (comportamento já existente) e manter o botão “Assinar este plano” nos demais.
   - Quando não houver tenant, desabilitar o botão “Assinar este plano” com um aviso curto (“Selecione uma empresa para assinar”), já que `changeSubscriptionPlan` exige `tenant_id`.

3. **Cabeçalho da página**.
   - Manter o título “Cobrança / Licença”.
   - Quando houver tenant: continuar mostrando as abas (Visão geral, IA, Nuvem, Pagamentos, Dados) — a aba “Visão geral” já lista o plano atual + pacotes.
   - Quando não houver tenant: mostrar apenas a seção de pacotes (sem abas), com um destaque “Nenhum pacote assinado”.

4. **Bloqueio para não-owner** permanece igual (card “Acesso restrito”).

### Resultado esperado
- A aba “Licença” nunca mostra botão de criar empresa.
- Sempre exibe os pacotes disponíveis.
- Indica claramente qual é o pacote assinado (quando houver assinatura).
