
# CRM + ERP — Operadora de Turismo (MVP)

Sistema interno autenticado, multilíngue (PT/EN/ES) e multimoeda (BRL/USD/EUR), com dois módulos principais — **CRM** e **Reservas/Pacotes** — e quatro perfis de usuário. Vou usar o app do AI Studio (link enviado) e o zip como referência visual/estrutural durante a implementação.

## 1. Autenticação e perfis
- Login por e-mail/senha (Lovable Cloud).
- Perfis: **Admin**, **Vendedor**, **Operacional**, **Financeiro** — armazenados em tabela `user_roles` separada com RLS (sem role no profile).
- Tela de gestão de usuários (apenas Admin) para convidar e atribuir papéis.
- Cada perfil enxerga apenas o que faz sentido; Admin vê tudo.

## 2. Layout geral
- Shell autenticado com sidebar fixa: Dashboard, CRM (Leads, Clientes, Funil), Reservas, Pacotes, Usuários (admin), Configurações.
- Topbar com seletor de **idioma** (PT/EN/ES) e **moeda de exibição** (BRL/USD/EUR).
- Tema claro/escuro, visual SaaS moderno e limpo. Vou usar o app do AI Studio como referência de cores e organização.

## 3. Módulo CRM
- **Clientes/PAX**: dados pessoais, documento, passaporte (número/validade), nacionalidade, contatos, preferências, histórico de viagens.
- **Leads**: origem, status, vendedor responsável, próxima ação, anotações.
- **Funil de vendas (Kanban)**: colunas Novo → Qualificado → Cotação → Proposta → Fechado/Perdido, com drag-and-drop.
- **Oportunidades**: vinculadas a lead/cliente, com valor estimado, moeda, destino, datas previstas.
- **Timeline de interações** por cliente (ligações, e-mails, reuniões, notas).
- **Tarefas e lembretes** por vendedor.

## 4. Módulo Reservas e Pacotes
- **Catálogo de Pacotes**: nome, destino, duração, descrição multilíngue, fotos, valor por pessoa em múltiplas moedas, datas de saída, vagas, inclusos/não inclusos.
- **Cotações**: criar a partir de um lead, escolher pacote ou montar sob medida (hospedagem, transporte, passeios), aplicar descontos, gerar PDF da proposta.
- **Reservas**: converter cotação aprovada, vincular PAX, status (pré-reserva, confirmada, em viagem, concluída, cancelada).
- **Vouchers/Itinerário**: documento por reserva com dados de viagem, fornecedores e contatos de emergência.
- **Calendário de embarques**: visão mensal das próximas saídas.

## 5. Dashboard inicial
- KPIs por perfil: leads no funil, cotações abertas, reservas confirmadas no mês, receita prevista (na moeda selecionada).
- Gráficos: vendas por período, top destinos, conversão por vendedor.

## 6. IA (Lovable AI Gateway — Gemini)
- Geração de descrição de pacote multilíngue.
- Sugestão de resposta para leads e resumo automático da timeline do cliente.
- Rascunho de proposta a partir da cotação.
- Gmail e WhatsApp ficam para fases seguintes (não entram no MVP).

## 7. Internacionalização e moeda
- i18n PT-BR (padrão), EN, ES — toda a UI traduzida.
- Cada registro guarda valor em moeda base + tabela `exchange_rates` configurável; UI converte para a moeda escolhida pelo usuário.

## 8. Banco de dados (Lovable Cloud)
Tabelas com RLS: `profiles`, `user_roles`, `customers`, `leads`, `opportunities`, `interactions`, `tasks`, `packages`, `package_dates`, `quotes`, `quote_items`, `bookings`, `booking_pax`, `vouchers`, `currencies`, `exchange_rates`.

## 9. Fora do MVP (próximas fases)
Fornecedores/contratos, Operacional (ordens de serviço), Financeiro (contas a pagar/receber, comissões), integrações Gmail e WhatsApp, relatórios avançados.

> Na implementação eu descompacto o zip do AI Studio e o app público para alinhar telas, nomenclatura e fluxo ao que você já começou antes de gerar o código.
