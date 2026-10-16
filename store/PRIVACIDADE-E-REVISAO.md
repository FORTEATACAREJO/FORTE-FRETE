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

Ícone existente preservado em 512 px (Google/web) e 1024 px (Apple). `scripts/mobile-assets.py` reproduz os arquivos sem bibliotecas externas. Capturas definitivas devem sair dos aplicativos em execução com dados fictícios, sem CPF, telefone, CNH ou Pix reais. Capturar: login; cargas disponíveis; detalhes/aceite; viagens; pagamentos; cadastro/documentos. Capturar tamanhos solicitados pelos consoles e produzir destaque Google Play 1024 × 500 a partir da identidade aprovada. Não apresentar montagens como telas reais.

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

1. Validar compilações dos dois workflows após as mudanças e testar em dispositivos.
2. Configurar os quatro secrets Android já previstos no workflow e guardar backup seguro da chave de upload. A chave pode ser preparada antes do pagamento; esta conexão GitHub não fornece operação de gravação de secrets. Nunca publicar chave/senha no código, em logs ou artifacts.
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
