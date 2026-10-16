# FORTE FRETE v5.0

Operação de motoristas, cadastro e aprovação, rotas, cargas de 36–52 t, aceite por capacidade efetiva, integração com Forte Vendas, ordens de carregamento, viagens e pagamentos.

## Cadastro separado (v5.3)

1. Motorista: dados pessoais, contato, endereço, CNH e documentos pessoais.
2. Veículo/conjunto: proprietário, cavalo, carreta 1, dolly e carreta 2, documentos, capacidade e vínculo atual ao motorista.
3. Favorecido: nome, CPF/CNPJ, banco e múltiplas chaves Pix, com uma chave principal por favorecido. O favorecido é vinculado ao veículo.

A ação **Trocar motorista** atualiza somente o vínculo do veículo e registra o histórico. Ela exige administrador e motorista aprovado e bloqueia a troca enquanto houver viagem em andamento. Viagens e ordens anteriores mantêm o motorista e o favorecido registrados na operação. Nenhum cadastro é apagado na substituição.

Schema aplicado em `supabase/separate-registration.sql` e `supabase/pix-key.sql`. A função autenticada `set-password` permite salvar seis números e concluir a liberação do primeiro acesso. A permissão administrativa consulta o perfil ativo no banco, incluindo MASTER em maiúsculas.

## Preparação das lojas sem pagamento

Android 1.2.0 (5): `android-apk/`; APK de testes e AAB pelo workflow Android.
O AAB só é publicável quando assinado com os quatro secrets previstos no workflow.

iOS 1.2.0 (5): projeto gerado com `xcodegen generate --spec ios/project.yml`;
workflow iOS compila para simulador e dispositivo sem conta paga e captura uma tela de teste.
O pacote sem assinatura não é IPA de distribuição e não substitui TestFlight.

Textos e pendências em `store/PRIVACIDADE-E-REVISAO.md` e `store/pt-BR/listing.json`.
Privacidade e atendimento públicos em `/privacidade.html`, `/suporte.html` e `/excluir-conta.html`.
Solicitações autenticadas chegam a **Ajuda e Privacidade** no aplicativo. A administração pode responder;
um protocolo de exclusão não remove automaticamente conta, arquivos ou histórico.
