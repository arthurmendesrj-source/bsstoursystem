Entendo sua frustração. Pelo que verifiquei agora, o problema não é apenas um cursor antigo: o desenho atual tenta “copiar o Gmail inteiro” em lotes pequenos, por labels/mês, dentro de rotas com limite de execução. Isso é frágil para uma caixa grande.

## O que está impedindo a sincronização completa hoje

1. **O cron está falhando/interrompendo com frequência**
   - Nos logs recentes, várias chamadas para `/api/public/gmail-poll` aparecem com status `0`, sinal de execução interrompida/timeout.
   - Isso confirma que o processo de mirror completo é pesado demais para rodar com segurança desse jeito.

2. **A sincronização ainda está incompleta**
   - Estado atual: `full_sync_in_progress = true`.
   - Só existem cerca de **275 emails** e **134 threads** gravados até agora.
   - Ou seja: quando você abre a tela, ela mostra os mesmos emails porque o banco ainda não tem uma cópia completa e confiável do Gmail.

3. **Existem dois caminhos de sincronização competindo**
   - Botão de sincronização por período na interface.
   - Mirror completo em segundo plano pelo cron.
   - Isso aumenta risco de estado inconsistente, repetição, travamento e impressão de que “não mudou nada”.

4. **O mirror completo baixa corpo e anexos durante o lote**
   - Isso pesa muito.
   - Para contas com muitos emails/anexos, a chance de timeout é alta.

5. **Espelhar 100% do Gmail não é o caminho mais estável aqui**
   - Gmail tem paginação, labels sobrepostos, histórico que expira e limites de API.
   - Fazer uma cópia fiel, histórica e permanente dentro desse app exige uma arquitetura de worker/fila dedicada, não apenas cron chamando uma rota web.

## Solução que eu consigo executar com mais segurança

Trocar o modelo de “espelhar todo o Gmail” por um modelo **Gmail como fonte da verdade + cache operacional limitado**.

Em vez de tentar copiar tudo, o app passa a funcionar assim:

```text
Tela de Email
  -> busca a lista diretamente no Gmail em tempo real
  -> salva no banco só o necessário para uso operacional
  -> abre mensagens sob demanda
  -> sincroniza automaticamente apenas emails recentes/importantes
```

## O que será implementado

### 1. Remover o mirror completo como fluxo principal

- Parar de usar “Importar tudo / cópia fiel” como ação principal.
- Manter ou remover visualmente esse botão para evitar falsa expectativa.
- O app não vai mais depender de uma importação completa terminar para exibir emails.

### 2. Criar listagem direta do Gmail

- Ao clicar em Caixa de entrada, Enviados, Spam, Lixeira etc., buscar direto no Gmail.
- Usar paginação real do Gmail com `nextPageToken`.
- Exibir os emails retornados imediatamente, sem esperar o banco completar.

### 3. Cache local simples e seguro

- Ao buscar uma página do Gmail, gravar/atualizar os emails no banco com deduplicação.
- O banco vira cache, não “fonte absoluta”.
- Se o cache falhar, a tela ainda pode buscar no Gmail.

### 4. Abrir email sob demanda

- A lista carrega metadados leves.
- Corpo completo e anexos só são buscados quando o usuário abre a conversa.
- Isso reduz drasticamente timeout e repetição.

### 5. Sincronização automática apenas recente

- Cron passa a fazer uma tarefa pequena e previsível:
  - buscar apenas emails novos/recentes;
  - atualizar cache;
  - nunca tentar varrer anos de histórico.
- Se o histórico expirar, o app não quebra: volta a buscar por data recente.

### 6. Simplificar a interface

- Trocar “Sincronizar tudo” por ações mais confiáveis:
  - **Atualizar caixa atual**
  - **Carregar mais antigos**
  - **Buscar no Gmail**
- Mostrar status real: “Buscando no Gmail”, “Cache atualizado”, “Sem mais resultados”.

## Resultado esperado

- A tela passa a mostrar emails atuais sem depender de mirror completo.
- O risco de timeout cai muito.
- Emails antigos aparecem via paginação/busca, não por uma cópia total prévia.
- O banco continua útil para vínculo com leads, reservas, clientes, tarefas e histórico interno.

## Limitação honesta

Eu não recomendo prometer “espelhamento completo e fiel de todo o Gmail” dentro desta arquitetura atual. A solução confiável que consigo executar é: **cliente Gmail operacional com cache local**, não um backup integral do Gmail.