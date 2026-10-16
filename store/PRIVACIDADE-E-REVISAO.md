# Forte Frete — preparação das lojas

Pacote 1.2.0 (5), identificador `br.com.forteatacarejo.frete` nas duas plataformas. Nenhum pagamento ou envio às lojas foi feito por esta preparação.

## Declaração de dados: rascunho para conferir com o comportamento real

| Dados | Uso | Vinculados ao usuário |
| --- | --- | --- |
| Nome, CPF, nascimento, telefone, e-mail e endereço | Conta, identificação, contato e análise cadastral | Sim |
| CNH, documentos e fotos enviados | Validação de motorista, veículo e favorecido | Sim |
| Placas, capacidade e dados do proprietário | Operação e compatibilidade das cargas | Sim |
| Favorecido, banco, Pix, fretes e comprovantes | Identificação do recebedor e conferência dos pagamentos | Sim |
| Identificador de conta, sessão e registros operacionais | Autenticação, segurança e histórico | Sim |
| Mensagens de suporte e solicitações de privacidade | Atendimento e exercício dos direitos do titular | Sim |

Não declarar “nenhum dado coletado”. Conferir campos das lojas para informações pessoais, financeiras, fotos/documentos e identificadores. Supabase e Render processam dados para o serviço. WhatsApp Business/Meta participa quando há envio de mensagens; conferir a configuração ativa. Não há SDK de publicidade no projeto nativo criado nesta preparação. Não há permissão nativa de localização; origem e destino informados não equivalem a rastreamento GPS. Não anunciar notificações push no iOS: APNs ainda não foi implementado.

## Material visual

Ícone existente preservado em 512 px (Google/web) e 1024 px (Apple). `scripts/mobile-assets.py` reproduz os arquivos sem bibliotecas externas. Capturas definitivas devem sair dos aplicativos em execução com dados fictícios, sem CPF, telefone, CNH ou Pix reais. Capturar: login; cargas disponíveis; detalhes/aceite; viagens; pagamentos; cadastro/documentos. Capturar tamanhos solicitados pelos consoles e validar o destaque Google Play 1024 × 500 preparado em `store/pt-BR/destaque-google-play.png`. Não apresentar montagens como telas reais.

## Teste obrigatório antes de pagar/submeter

- Instalar APK em Android e executar projeto iOS em simulador; testar também em iPhone real quando houver assinatura de desenvolvimento disponível.
- CPF com/sem pontuação, senha, lembrar sessão, recuperação, primeiro acesso e aprovação.
- Usuário pendente e reprovado não acessam operação; motorista só consulta seus próprios dados; permissões de admin/master conferidas.
- Selecionar PDF, JPG e PNG pelo seletor nativo; cancelar e reenviar; verificar tamanho limite. Testar câmera e biblioteca no iPhone.
- Aceitar carga de teste sem duplicar viagem nem ultrapassar capacidade, abrir ordens e comprovantes, voltar de links externos.
- Sem internet: mensagem e nova tentativa; com internet: sessão e operação se recuperam.
- Não gerar pagamentos, viagens ou mensagens reais para validar as lojas.
- Validar suporte e solicitação de exclusão de ponta a ponta; confirmar prazos e processo de remoção/anomização com quem atende. Protocolo não significa exclusão executada.

## Acesso para revisão

Criar conta exclusiva de motorista com dados fictícios, aprovação e conteúdo de demonstração isolado da operação. Registrar credenciais apenas no campo privado de revisão das lojas; nunca neste repositório público. Informar o caminho para cargas, viagens, pagamentos, documentos e exclusão. Não depender de aprovação manual durante a análise. Ainda não existe conta de demonstração validada nesta preparação.

## Pendências que não podem ser consideradas concluídas automaticamente

1. Completar testes dos fluxos autenticados e em aparelhos físicos. As compilações e os testes de abertura inicial estão registrados abaixo; não equivalem a homologação completa.
2. Assinatura Android preparada e validada conforme registro abaixo. Manter o backup criptografado e a senha guardados separadamente. Não substituir a chave já criada nem publicar chave privada ou senha em texto aberto, logs ou artifacts.
3. Confirmar canal público de suporte e processo completo de exclusão, incluindo autenticação indisponível, dados relacionados, arquivos e cópias de segurança. O atendimento deve diferenciar retenção necessária de exclusão efetiva e comunicar o resultado. A aprovação da Apple exige que a experiência de exclusão atenda às regras aplicáveis; uma fila isolada não atesta conformidade.
4. Capturar imagens reais e concluir as respostas de privacidade, faixa etária e conteúdo.
5. Confirmar titularidade/identificação das contas empresariais e eventual D-U-N-S.
6. Após a conta Apple: equipe/certificado/perfil, assinatura, TestFlight e envio. O zip iOS sem assinatura não é IPA instalável/distribuível.
7. Após a conta Google: Play App Signing, teste exigido para o tipo da conta, ficha e revisão. AAB sem assinatura não é publicável.

## Referências oficiais

- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/googleplay/android-developer/answer/13327111?hl=pt-BR
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://developer.apple.com/app-store/review/guidelines/br/
- https://developer.apple.com/app-store/app-privacy-details/

## Verificações confirmadas

- iOS: execução 38880250145, commit 1794ccd. Compilação para simulador e dispositivo; aplicativo instalado e aberto no iPhone simulado; captura extraída e inspecionada. Também houve compilação e abertura aprovadas no commit c7fab (execução 38881632200). Não valida fluxos autenticados nem iPhone físico.
- Android: execução 38896019123, commit 56b8550. APK compilado, instalado e aberto em Android 15/API 35; CPF, senha e Entrar identificados; captura extraída e inspecionada. Nenhum dado operacional foi criado. O AAB permanece sem assinatura de publicação.
- A captura revelou pouco contraste na barra superior Android; a correção compilou e uma captura posterior confirmou ícones escuros no fundo claro. As repetições do teste encontraram travamento do Pixel Launcher do emulador e falha de DNS, registrados nos artifacts. O teste final exige o login em primeiro plano, não aceita tela vazia ou de erro e verifica erros AndroidRuntime. Permite no máximo duas tentativas pelo botão nativo, com diagnóstico salvo; não altera autenticação nem dados.
- Android final: execução 38898484372, commit 350949e. Compilação e abertura aprovadas. O login apareceu após uma nova tentativa pelo botão nativo; `tentativas.txt` registra 1. Captura do artifact 12045126742 extraída e inspecionada: login visível, barra superior legível, aplicativo em primeiro plano e sem erro AndroidRuntime. O acesso de rede inicial do emulador foi instável; não declarar ausência de falhas de conexão. Fluxos autenticados e aparelhos físicos continuam pendentes.
- Testes de regressão web, pagamentos, capacidade e autorização passaram nas compilações Android. Testes SQL com rollback confirmaram isolamento dos protocolos e autorização administrativa; os testes Edge rejeitam acesso indevido. Nenhuma conta sintética ou protocolo de teste permaneceu salvo.
- As páginas públicas de privacidade, suporte e exclusão foram publicadas no Render e conferidas por navegação. O servidor respondeu HTTP 200 em 16/10/2026. Isso não substitui homologação dos fluxos completos.

## Assinatura Android pelo celular

O workflow manual **Preparar chave Android pelo celular** evita instalar ferramentas no telefone. Não cria contas de lojas, não cobra e não submete aplicativos. A primeira chave foi gerada em 16/10/2026 e o AAB assinado foi validado conforme o registro abaixo. Não executar a geração novamente.

1. No GitHub do Forte Frete, criar um **Repository Secret** chamado `FORTE_SIGNING_BACKUP_PASSWORD`. Usar senha forte e exclusiva de 32 a 256 caracteres, com pelo menos três entre maiúsculas, minúsculas, números e símbolos, sem repetições simples nem quebras de linha. Guardá-la separadamente em um gerenciador de senhas. Não enviar a senha por chat nem colocá-la em Variables, código ou inputs de workflow.
2. Em Actions, abrir **Preparar chave Android pelo celular**, escolher main e confirmar a criação da primeira chave. Somente o titular do repositório pode iniciar a geração. A etapa manual tem permissão de escrita apenas para guardar o resultado nesse repositório; os builds normais continuam com leitura.
3. O workflow gera a chave temporariamente no executor, verifica o backup, e salva **somente** `store/android-upload-key.enc` e o certificado público `store/android-upload-cert.der`. O repositório é público: o arquivo cifrado será público, e sua proteção depende da força e guarda da senha. A chave privada e sua senha aleatória não são publicadas em texto aberto. Nenhum artifact contém credenciais privadas.
4. Guardar também uma cópia de `store/android-upload-key.enc` fora do repositório. Só esse arquivo ou só a senha não bastam para recuperação. Não trocar nem apagar o Secret após criar a chave sem um procedimento de recuperação/recriptografia; a geração recusa sobrescrever material existente.
5. Executar manualmente **Android APK and Store Build** em main. O commit do workflow de geração não dispara automaticamente outro workflow com o token padrão do GitHub. Conferir o artifact **ForteFrete-PlayStore-AAB-Assinado** e a etapa de verificação da assinatura antes de considerar concluído.

O build suporta esse método e o antigo de quatro Secrets, mas recusa configuração mista para evitar troca silenciosa de identidade. Backup ausente, senha incorreta, integridade inválida, certificado diferente ou configuração parcial interrompem a assinatura. Os testes usam chaves descartáveis.

Referência oficial do modelo de arquivo cifrado com senha em Secret: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#storing-large-secrets

## Alternativa de assinatura Android pelo computador

`scripts/android-signing.py` pode criar a chave de upload, salvar backup com criptografia e autenticação de integridade e configurar os quatro Secrets via GitHub CLI. Os testes usam chave descartável e verificam recuperação, rejeição de senha incorreta/arquivo alterado, transmissão por stdin e recusa de backup dentro de Git.

1. Conferir ferramentas e autenticação: `python3 scripts/android-signing.py --preflight`.
2. Com GitHub CLI autenticado e permissão de Secrets no repositório, executar `python3 scripts/android-signing.py --backup-dir /caminho/seguro/fora/do/repositorio`.
3. Informar e guardar separadamente a senha do backup quando o programa solicitar. A senha não aparece no terminal.
4. O programa se recusa a sobrescrever backup ou gerar outra chave se Secrets de assinatura já existirem. Em falha parcial, restaurar o mesmo backup com `--restore /caminho/ForteFrete-upload-key.enc`.
5. Executar o workflow Android e verificar `ForteFrete-PlayStore-AAB-Assinado`. Não enviar o AAB sem assinatura.

## Assinatura concluída em 16/10/2026

O titular cadastrou `FORTE_SIGNING_BACKUP_PASSWORD`; somente a existência do Secret foi conferida, sem ler seu valor. A execução 38920972495 criou a chave e salvou apenas o backup cifrado e o certificado público no commit ba625ddd4f1a16469802675f97e6a3cffb7c36cc. Uma cópia de recuperação foi guardada separadamente, sem senha. Não configurar o método antigo nem gerar outra chave para este aplicativo.

A execução Android 38921256393 gerou o artifact 12053789879, **ForteFrete-PlayStore-AAB-Assinado**. A compilação e a verificação do jarsigner passaram. O AAB foi baixado para uma conferência independente: assinatura criptográfica válida, certificado igual ao certificado público guardado e integridade dos dez arquivos assinados conferida. Na mesma execução, o APK de teste foi instalado e abriu o login no emulador Android; o job android-launch passou. Isso não representa teste dos fluxos autenticados nem instalação do AAB em aparelho físico.

- Certificado SHA-256: `cf31264bd399e66734749f8c81bb3f5eb9490c32b1ea2fbf97466dde62344796`.
- AAB SHA-256: `89d764208eb392dcaab637145d1c929e9f656d2cdd6ab3562b3c928def98ef26`.

Isso conclui a preparação da assinatura Android; não atesta homologação dos fluxos completos, conformidade integral nem aprovação de loja. A assinatura Apple/TestFlight, exclusão efetiva de contas, conta de revisão e testes em aparelhos físicos continuam pendentes. Nenhum pagamento nem submissão às lojas foi realizado.

## Exclusão de contas

O atendimento administrativo oferece **ANALISAR VÍNCULOS ANTES DA EXCLUSÃO**. A função `account-deletion-review` valida administração ativa/aprovada e sessão atual, deriva o titular do protocolo, inventaria referências da conta e do motorista e conta arquivos identificados. É somente leitura: não exclui conta nem dados. Arquivos legados fora da pasta/sem proprietário ainda exigem conferência. O teste SQL roda com rollback; a Edge Function rejeita motorista, conta inativa/pendente, senha obrigatória e ação DELETE. A política de retenção e a remoção efetiva continuam pendentes.
