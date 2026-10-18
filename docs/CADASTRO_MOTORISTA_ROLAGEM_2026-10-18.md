# Entrada separada e retomada do cadastro de motorista

A entrada do Forte Frete distingue Motorista e Funcionário com botões próprios, títulos e instruções correspondentes. Funcionário envia somente os dados pessoais para análise; motorista continua com os documentos.

A transição após salvar os dados iniciais confirma o rascunho e inicia o dossiê pendente quando necessário. Falha no login automático apresenta a entrada com CPF e senha, sem tentar cadastrar novamente o mesmo CPF. Falha no vínculo do convite não impede preencher o dossiê pendente. Cadastros pendentes feitos sem convite podem escolher explicitamente continuar como motorista; a função do servidor preserva a verificação de cadastro pendente e não concede aprovação.

O formulário do motorista permanece em uma tela com rolagem vertical, seções Motorista/Veículos/Pagamento, atalhos, salvar rascunho no início e ações ao final. Dados são salvos antes dos uploads e a referência de cada anexo é persistida após o envio. Se outro upload falhar, os dados e anexos anteriores continuam salvos. Campos obrigatórios continuam necessários para enviar a análise, mas não para salvar o rascunho.

## Verificação

- 15 testes de serviço e banco isolado: retomada direta sem convite, perfis recusados, aprovados e sessão com troca de senha, início idempotente e permissões administrativas.
- 4 cenários de navegador em 390x640: motorista, funcionário, falha de login automático e falha de convite; inclui rolagem, ausência de transbordamento horizontal e preservação de dados/anexos quando um upload posterior falha.
- 2 caminhos completos de navegador: funcionário com uma tela e motorista até envio do dossiê para análise.
- Regressão do frontend e build.
- Inspeção visual interna com dados fictícios.

## Implantação

Publicar a função driver-onboarding com suas dependências existentes e depois o frontend. O service worker possui nova versão de cache. Não há migração nem mudança de cadastros existentes. Esta revisão não foi implantada em produção e não confirma que o erro relatado pelos motoristas já deixou de ocorrer nos dispositivos reais.

Cadastro público autorizado: botão CADASTRAR SEM CONVITE para motorista e funcionário. Todos continuam inativos e PENDENTES até aprovação administrativa. Testes de navegador partem do endereço sem parâmetros de convite.
