# Cofre de integrações Forte

O botão **COFRE DE INTEGRAÇÕES** aparece na barra administrativa somente após o servidor confirmar um perfil Master ativo/aprovado. Está disponível no Vendas, Frete e Fiscal. Cada projeto mantém seu próprio cofre; aplicativos que usam o mesmo projeto Vendas compartilham esse armazenamento.

O Master cadastra integração, referência, nome de identificação, validade opcional e valor secreto (token, senha ou JSON). Pode substituir a credencial com controle de versão, arquivar e restaurar. O valor salvo não pode ser revelado nem exportado pela interface. Nome e referência são metadados visíveis ao Master e não devem conter segredos.

Guardar uma credencial não ativa uma conexão. Integrações existentes de WhatsApp, Gmail, Itaú e certificado continuam usando seus cofres/configurações anteriores, sem migração automática. O cadastro novo pode ser consumido por um adaptador do servidor mediante `integration_vault_read(provider, reference)`; nunca disponibilizar esse RPC ou uma chave de serviço no navegador. Configurar esse vínculo exige conhecer os campos e as regras da integração. Tokens recusados pela Meta não são renovados por este recurso.

## Proteções

- Segredos armazenados no Supabase Vault com criptografia autenticada; tabelas e auditoria em `private`, RLS habilitada e nenhum acesso direto para `anon`/`authenticated`.
- Edge Function valida token com `auth.getUser`; banco revalida perfil atual, sessão existente/não expirada e bloqueio do usuário em cada operação administrativa.
- RPCs de gerenciamento/leitura são executáveis somente por `service_role`. Funções privilegiadas ficam no schema privado com `search_path` vazio.
- Interface recebe apenas metadados e histórico, não IDs dos segredos nem valores. Campos secretos são limpos ao salvar ou falhar e ao fechar; não há persistência no navegador.
- Atualizações concorrentes exigem versão correta. Arquivados/expirados não podem ser lidos pelos consumidores internos. Arquivar não apaga o segredo.
- Auditoria registra ator, horário e ação; não registra corpo de requisição, valor ou mensagem bruta de erro. Não há rota de exclusão permanente.

## Validação

`npm run test:vault` testa autorização por perfil, comandos, renderização segura, limpeza dos valores e ausência de exportação/disparo de mensagens. `supabase/tests/integration-vault.sql` testa criptografia, ACLs, sessão, substituição concorrente, arquivamento/restauração, expiração e auditoria usando fixtures em transação revertida. Testes reais dos endpoints confirmam rejeição de sessão ausente/inválida e origem indevida. Não foram usados segredos reais nos testes e nenhuma integração foi acionada.

Uma sessão Master autenticada no navegador ainda é necessária para homologação visual do painel com o usuário. A verificação de publicação dos arquivos não substitui esse teste.
