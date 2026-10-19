# Termo unificado — implementação para revisão

Sem publicação em produção. O conteúdo do ZIP foi preservado integralmente: versão proposta 1.0, SHA-256 `79d37d9ff0b462c98919ea9cdc735a9ab4ce9a6df905385913c6b7d6fb546d12`.

## Comportamento

- Todos os usuários, incluindo antigos, motoristas, funcionários, Admins e Masters, devem confirmar o termo vigente no módulo antes de operar. Checkbox único de ciência/confidencialidade, inicialmente desmarcado. A declaração de veracidade já existente no cadastro do Frete permanece separada.
- Cadastros novos podem salvar rascunho, mas só enviam para aprovação depois do aceite autenticado. Recuperação de senha, consulta ao termo/política e saída continuam disponíveis. Os fluxos Empresa/Motorista e documentos do Frete foram preservados.
- Aceite não aprova acesso nem atribui perfil. As aprovações, suspensões e permissões de cada módulo continuam independentes. O identificador operacional `venda-externa` corresponde a `vendas_externas` nas evidências do pacote.
- O Financeiro permanece dentro do Vendas e restrito ao Master autorizado no Financeiro.

## Evidência e segurança

Eventos append-only por UUID de usuário, módulo, versão, hash, horário UTC do servidor, origem HTTP validada e UUID do comprovante. Não recebem CPF, IP, user-agent, senha ou documento. Reenvios da mesma versão convergem para o mesmo comprovante. A ativação de nova versão exige nova ciência, preservando o histórico. Termos antigos não podem ter o texto sobrescrito.

Status/aceite/comprovantes passam por sessão verificada na API; o navegador não escolhe o usuário do aceite, a origem ou a data. RPCs com identificadores explícitos são exclusivas da conta técnica. Usuários leem só seus comprovantes; auditoria administrativa exige módulo e empresa/estabelecimentos autorizados. Exportação em JSON inclui texto integral e metadados; cópia do termo em TXT e página pública de leitura também disponíveis.

RLS e funções operacionais verificam o aceite. Guardas SQL bloqueiam envio/aprovação sem ciência válida. Histórico não tem exclusão em cascata com a identidade, evitando apagar evidência ou impedir o fluxo existente de exclusão de conta; guarda UUID sem copiar dados cadastrais. Retenção e eventual anonimização precisam ser validadas com o encarregado/jurídico, sem inventar prazo neste pacote.

## Testes executados localmente

- 24 testes SQL passaram, incluindo migrações reais dos três projetos, reexecução segura, versão/hash, conta técnica real de teste, bloqueio de legados, checkbox falso, duplicidade, imutabilidade, proteção de submissão, recibos próprios, auditoria, escopo, RLS, isolamento Financeiro/Externas e nova versão.
- 166 testes core do Vendas e 67 testes do Frete passaram.
- 15 cenários do termo no navegador passaram: cinco módulos × 320/390/820 px. Texto integral, checkbox desmarcado, erro de rede/sessão simulado, nova tentativa, cópia TXT, comprovante JSON, nova versão e distinção entre aceite e aprovação.
- 16 cenários de cadastro/rascunho dos outros módulos passaram, incluindo confirmação no envio. O Fiscal 820 px foi executado separadamente.
- Cinco fluxos Frete passaram no navegador: motorista, funcionário, falha de upload, falha de login e convite; o envio exige confirmação do termo.
- Builds dos cinco repositórios passaram. Vendas e Externas foram compilados também com configuração pública fictícia para garantir inclusão do controle de acesso no bundle. Nenhum serviço real foi chamado pelos navegadores.

Comandos centrais no Vendas: `node --test checks/unified-legal.test.cjs`, `npm run test:core`; no Frete: `node --test tests/*.test.cjs`. O teste SQL do Vendas inclui fixtures do Fiscal/Frete para rodar sem checkout dos outros repositórios (`LEGAL_USE_FIXTURES=1`). Os navegadores usam checkouts irmãos mobile-vendas/mobile-fiscal/mobile-vendas-externas/forte-frete-cadastro e Chromium/Playwright.

As imagens são evidências de interface com respostas simuladas. Não houve criação de usuários, emissão de documentos, envio de mensagens ou mudanças nos bancos de produção. Não houve teste em aparelhos físicos Android/iOS nem homologação integrada implantada.

## Publicação futura coordenada

1. Revisar o texto com jurídico/encarregado e validar a Política de Privacidade existente, contatos e retenção. A minuta não substitui bases legais, políticas nem contratos. Se o texto mudar materialmente, registrar outra versão/hash.
2. Após autorização expressa do proprietário, aplicar primeiro as migrações de cadastro já presentes nas PRs e depois a migração `*_unified_legal_acceptance.sql` de cada projeto: Vendas compartilhado, Fiscal e Frete. Financeiro e Externas usam o backend Vendas; não repetir sua migração nesses repositórios.
3. Publicar as funções alteradas e as interfaces de forma coordenada. Frete também inclui as verificações do bridge/diretório para o módulo solicitante. Não executar as cópias de migrations em checks/fixtures: são somente fixtures de teste.
4. Homologar com contas fictícias antigas/novas, incluindo Master, funcionário e motorista. Verificar termo, submissão, aprovação e operações em cada módulo separadamente antes da liberação operacional.

Estas alterações não foram publicadas nem aplicadas a produção.
