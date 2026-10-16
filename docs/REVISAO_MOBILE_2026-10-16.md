# Forte Atacarejo — revisão mobile e integração

Data: 16/10/2026. Referência: FORTE_PACOTE_PROGRAMACAO_16-10-2026.zip, requisitos e telas fornecidos pelo responsável.

## Situação da entrega

Candidato para revisão, **sem implantação em produção**. Prioridade executada: Forte Frete mobile. O novo desenho permanece em protótipo para aprovação; a aplicação operacional recebeu somente propostas funcionais na branch de revisão. Bancos remotos foram consultados exclusivamente para metadados de esquema, políticas e funções. Não houve alteração de cadastros, chaves, arquivos, certificados ou dados reais. Nenhum pagamento, mensagem externa, emissão fiscal ou publicação nas lojas foi realizado.

## Análise anterior às alterações

| Sistema | Conferência efetuada | Resultado / limite |
|---|---|---|
| Forte Frete | Código atual, autenticação, menu, carga/aceite, viagem, Storage, RLS, funções e contratos | Aceite anterior gravava várias etapas sem transação; faltava oferta privada; motorista consultava registros completos e snapshots internos. |
| Forte Vendas | Código comercial, FinanceiroHub, salvamento com versão, pedidos, ponte Frete e regras financeiras | Financeiro permitia acesso além de Master. Base comercial agrega dados operacionais e financeiros no mesmo JSON; a separação de leitura ainda é bloqueio de liberação. |
| Forte Financeiro legado | Código e serviço separado | Tela própria aceita Master/Administrador/permissões financeiras. Diverge da decisão de Financeiro somente no Vendas. Candidato separado transforma a entrada em redirecionamento para o Financeiro interno do Vendas. Serviço não alterado em produção. |
| Forte Fiscal | Repositório privado, README, estrutura e isolamento de projeto | Base separada e homologação mantidas. Nenhuma integração direta Frete–Fiscal criada. Emissão e certificados reais não testados. |
| Venda Externa | Repositório, entrada e contrato de acesso | Integra-se ao Vendas com aplicativo e aprovação próprios; sem modificação nesta etapa. Fluxo completo por carteira aguarda homologação. |
| Site/Central | Código da Central e carregador | O código atual exibia três acessos. Candidato separado restaura Fiscal e Venda Externa, totalizando os cinco aprovados, sem Financeiro/Carga Direta/Pátio externos. |
| Carga Direta legado | Inventário GitHub e Render | Serviço separado ainda existe. Remoção do aplicativo independente exige revisão do consumidor e autorização para alterar produção. |

A conferência de `pg_policies.permissive` confirmou que os gates gerais de aprovação do Frete são **RESTRICTIVE**. Não foi confirmado um desbloqueio global por soma de políticas. Os problemas tratados são exposição de campos, alcance de cargas, mutação direta de interesses e atomicidade do aceite.

Os serviços principais do Render acompanham a branch principal com implantação automática. As branches de revisão e seus rascunhos não foram mesclados à principal. Previews automáticos estavam desabilitados no inventário consultado.

## Alterações propostas no Forte Frete

- Oferta pública para elegíveis ou privada para um motorista aprovado; busca administrativa por nome/placa.
- Criação em rascunho antes da oferta, evitando publicação temporária de uma carga privada. Falha no envio preserva o rascunho para nova tentativa.
- Destinatário, modalidade e situação da oferta no banco; auditoria de autor, destinatário, horário e mudanças. Recusa mantém a carga privada; nova oferta ou publicação exige ação administrativa explícita.
- Aceite atômico com bloqueio da carga: interesse, viagem, atribuição e fila de integração gravados na mesma transação. Falha da integração desfaz a operação inteira. Repetição retorna a viagem anterior.
- Peso efetivo limitado ao conjunto; quantidade inteira coerente com o peso unitário. Veículo com capacidade superior à faixa pode transportar somente o peso permitido pela oferta.
- Projeções específicas de cargas, viagens e ordens para o motorista. As tabelas completas de cargas, viagens e ordens ficam acessíveis à administração, preservando as informações internas e a integração existente.
- Motorista sem menu de cadastros administrativos, indicação ou documentos de fornecedores; perfil próprio mínimo. Nenhum botão de envio de comprovante para motorista.
- Comprovante da viagem própria disponível somente com pagamento confirmado e autorização explícita; comprovante vindo do Vendas somente quando validado. Storage verifica propriedade e autorização.
- Botões de andamento usam operações autenticadas no banco, com transições permitidas e rejeição de ID de outra viagem. O endpoint `motorista-viagem` referenciado anteriormente não estava presente no repositório; o candidato usa a RPC controlada.
- Avisos internos de oferta privada, aceite/recusa, mudanças de viagem e autorização de comprovante. Isso não representa entrega de WhatsApp ou push por provedor externo.
- Mensagens de falha/repetição, bloqueio de duplo clique, escape de conteúdo nas novas telas e atualização do cache dos módulos.
- CI de revisão sem assinatura de loja em pull requests. A chave Android existente não foi acessada nem trocada.

Migração candidata: `supabase/migrations/20261016162214_private_load_dispatch.sql`. Não aplicada remotamente. O novo frontend e a migração precisam ser homologados e liberados em conjunto; o frontend depende das novas RPCs.

## Financeiro — candidato complementar no Forte Vendas

Branch separada com guarda Master no grupo Financeiro e no componente, helper de banco baseado no perfil Master aprovado e remoção do atalho de Administrador na validação de alterações financeiras. Migração preparada, não aplicada: `20261016163637_financeiro_master_interno.sql`.

**Bloqueio:** o JSON compartilhado `fc_app_state` ainda exige projeção/segregação financeira de leitura antes de afirmar isolamento completo do Financeiro. Ocultar a tela não resolve esse acesso. Foi preparado redirecionamento do Financeiro legado para o módulo interno; o candidato também depende dessa segregação antes da liberação. Essa etapa não foi declarada concluída nem liberada para produção.

## Modelos para aprovação

Protótipo HTML navegável e offline, com dados claramente fictícios. Gestão: login, painel, cargas, nova oferta pública/privada, convites, viagens, acompanhamento de comprovantes e configurações. Motorista: cargas permitidas, detalhe/aceite/recusa, viagem, comprovante autorizado, perfil mínimo e avisos. A terceira proposta do pacote foi tratada como referência pendente, não como aprovação final.

## Testes executados

| Grupo | Resultado | Ambiente / alcance |
|---|---|---|
| Frete — SQL, aceite, autenticação, exportação, aprovação, pagamentos e build | 47 verificações passaram | Node 24; PostgreSQL WASM/PGlite isolado; dados fictícios; não é a base de produção. |
| SQL/RLS da nova operação | Incluído no total | Visibilidade privada, IDOR, outros perfis, aprovação, rota/capacidade, propriedade, anonimato, recusa/reenvio/publicação, idempotência e rollback da fila. |
| Cálculos | Incluído no total | 36/38/38,5/52 t, capacidade de 60 t limitada a 52 t, unidade de 25/50 kg, arredondamento, tarifa zero, negativos e valores não finitos. |
| Comprovantes e Storage | Incluído no total | Documento alheio e sem autorização bloqueados; motorista não anexa comprovante; snapshot de fornecedor excluído. |
| Navegador dos módulos funcionais | Passou | Chromium headless: oferta privada, falha preservando rascunho, repetição sem segunda criação, botões de viagem, erro de rede, conteúdo hostil escapado e perfil mínimo. API simulada; não é homologação externa. |
| Protótipo | Passou | 14 telas capturadas, navegação, recusa privada, publicação explícita, larguras 360/390/430 px, sem erros de JavaScript ou rolagem horizontal. |
| Financeiro Master + regressões Vendas | Passou: 1 teste específico, 125 testes centrais, 105 simulações de conta corrente e regras numéricas do build | Master aprovado, outros perfis com permissão financeira, troca de senha, inatividade e empresa divergente. |
| Concorrência PostgreSQL com conexões independentes | Workflow preparado | O bloqueio transacional foi exercitado em sequência no PGlite. A prova de corrida real exige o job PostgreSQL 17; não confundir com teste sequencial. |
| Android/iPhone reais, lojas e provedores externos | Não executado nesta revisão | Não houve build assinado ou publicação nova. Homologação autenticada em dispositivos reais permanece necessária. |

Os testes de assinatura e o histórico dos builds anteriores permanecem separados desta revisão: não constituem prova dos novos fluxos autenticados.

## Integrações conferidas

| Fluxo | O que foi verificado | O que falta |
|---|---|---|
| Frete → Vendas | Fila existente `integracao_forte_vendas`; preservado tipo `SOLICITAR_PEDIDO`, status `PENDENTE_ENVIO`, correlação de carga/viagem/motorista/veículo e valores. Fila integra a transação do aceite. | Consumidor/entrega da fila e retorno real do número do pedido não comprovados. Há ponte Vendas → Frete, mas isso não comprova o caminho inverso. Bloqueio de liberação operacional. |
| Vendas → Frete | `orders-workflow` chama `vendas-frete-bridge`; autenticação do Vendas, empresa, motorista/conjunto e peso; comprovante validado copiado para bucket privado. | Homologar ponta a ponta com contas de teste e verificar idempotência/retentativa em ambiente separado. |
| Frete → Fiscal | Projetos e controles separados; exportação cadastral existente preservada. | Validar importação autorizada com arquivo fictício. Nenhum vínculo direto novo. |
| WhatsApp/push | Fila antiga preservada; novos avisos internos registrados. | Credenciais, templates e entrega por provedor não confirmados. Nenhuma mensagem enviada. |
| Itaú | Código de boleto, validações e regras existentes inspecionados; nenhum pagamento real. | Boleto tradicional, ausência de Bolecode/Pix, autenticação e liquidação exigem homologação dedicada. Não tratar presença de serviço como integração aprovada. |
| Gmail / Fiscal / A1 | Estrutura existente preservada. | Sem acesso a conteúdo pessoal, segredos, certificado ou operação fiscal nesta revisão. |

## Pendências e critérios para liberação

1. Aprovação do modelo mobile. Refinar o desenho e somente então aplicar a nova identidade visual à aplicação operacional.
2. Homologar migração, frontend e Edge Function juntos em ambiente separado, com contas fictícias Master/Admin/motorista A/motorista B e perfis bloqueados.
3. Resolver e testar a entrega Frete → Vendas e o retorno do pedido; não anunciar integração completa enquanto a fila permanecer apenas pendente.
4. Concluir segregação de leitura do Financeiro e migração do aplicativo legado, preservando saldos e rotinas comerciais. Financeiro exclusivamente Master dentro do Vendas.
5. Validar permissões específicas de funcionários além de Master/Admin antes de ampliar o envio privado. Não houve concessão automática a Operador Geral.
6. Homologar cancelamento, expiração e exceções de viagem/pallets: a proposta de status do ZIP não foi aplicada por substituição dos estados históricos existentes.
7. Autorizar comprovantes históricos: a nova coluna começa vazia, sem presumir autorização retroativa. Validar a transição com o responsável para preservar a consulta dos documentos já aprovados.
8. Homologar notificações externas, XML/Gmail/A1, fluxo Itaú e importação Fiscal separadamente.
9. Concluir testes Android/iPhone autenticados e de conectividade. Depois preparar pacotes de loja sem substituir a chave Android existente.
10. Obter autorização explícita antes de mesclar, aplicar migrações, publicar frontend/Edge Functions, alterar serviços ou enviar às lojas.

Nenhum item pendente foi considerado aprovado por inferência. Esta entrega permite revisar as telas e o candidato de código, com bloqueios explícitos para evitar uma liberação incompleta.
