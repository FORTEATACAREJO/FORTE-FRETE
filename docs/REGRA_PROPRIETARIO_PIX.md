# Proprietário e pagamento do frete

Regra aprovada em 18/10/2026:

- Proprietário: nome e WhatsApp com DDD.
- CPF/CNPJ do proprietário não é um campo obrigatório separado.
- Pagamento: a chave Pix efetivamente usada fica no favorecido vinculado ao veículo. O favorecido pode ser o proprietário, motorista ou outra pessoa autorizada.
- A identificação e as validações do favorecido já existentes continuam em vigor.
- Documentos do motorista e do conjunto e aprovação administrativa continuam obrigatórios.

Os documentos de proprietário já armazenados são preservados. Cadastros aprovados não são rebaixados automaticamente. Em novas aprovações, o WhatsApp do proprietário precisa estar preenchido.

## Publicação

1. Aplicar a migração `proprietario_nome_whatsapp_pix`.
2. Publicar `driver-onboarding` com os arquivos `index.ts` e `invite-policy.mjs`, preservando a autenticação interna existente.
3. Publicar o frontend e conferir o formulário de convite e o cadastro administrativo de veículos.

## Validação

`node --test tests/owner-contact.test.cjs tests/invite-driver-stage.test.cjs`

`node tests/frontend-regression.cjs`

`node tests/build-dependencies.cjs`

`node build.js`

O teste de navegador está em `tests/invite-paths.browser.cjs` e exige Chromium funcional.
