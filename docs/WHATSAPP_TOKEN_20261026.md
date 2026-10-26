# Configuração do WhatsApp por token

A configuração operacional aceita somente o token de acesso. Os IDs autorizados do remetente ficam no backend. O cofre genérico continua sendo armazenamento e não substitui a tela de configuração Business. Nenhuma migração de banco é necessária.

## Comportamento

Os convites de Frete e Vendas continuam usando o serviço compartilhado invitation-dispatch no projeto Vendas. A configuração valida a relação token, conta e número antes de gravar. O nome de modelo já configurado é preservado. Salvar um token não cria modelos na Meta nem envia mensagens. Se um modelo estiver ausente, pendente ou inacessível, a interface informa a pendência.

No Fiscal, a tela operacional também aceita apenas token. O segredo do aplicativo é lido da configuração criptografada existente ou das variáveis protegidas WHATSAPP_APP_SECRET ou META_APP_SECRET. Não enviar esse segredo pelo navegador. Se não houver segredo no servidor, a configuração é bloqueada com diagnóstico. Ao trocar somente o token da mesma conta, preservar verifyToken, enabled e webhook_verified_at. Ao mudar de uma configuração antiga de outra conta, a automação fica desativada até nova validação.

## Publicação coordenada

Este PR contém implementação e testes. Não houve alteração de credenciais, modelos Meta, banco ou produção durante a preparação.

1. Confirmar o workspace FORTEATACAREJO tea-daoniurm8hqs73fsi3p0 e revisar os três PRs antes do merge.
2. Publicar primeiro as funções do Vendas invitation-dispatch e order-communications, incluindo os imports de _shared/whatsapp-business.mjs. Conferir o resultado de cada publicação.
3. Publicar whatsapp-fiscal com connection.mjs. Se o endpoint legado driver-onboarding do Frete for publicado, incluir seu import _shared. Não alterar configurações de JWT/CORS neste trabalho.
4. Publicar os frontends após seus backends. Os clientes anteriores com os mesmos IDs continuam compatíveis. Acompanhar SHA, deploy live e interface.
5. Para forte-whatsapp-api, o arquivo whatsapp-server.mjs foi restaurado na main proposta a partir do commit publicado 983273dd0b3ed1d11d1c6b21fab69d5c548a3ea1, com correção de comparação de tokens de verificação por tamanho em bytes. Não apontar o serviço à main antes de esse arquivo estar nela. Preservar segredos e flags existentes. O encaminhamento ao Vendas depende de WHATSAPP_VENDAS_WEBHOOK_ENABLED=true; conferir antes de qualquer mudança e não habilitar automaticamente neste PR.
6. Testar convite, pedido ou ordem e evento fiscal com destinatário de teste explicitamente autorizado. Confirmar recebimento, respostas e anexos quando aplicáveis. Registrar horário e IDs redigidos. Não usar clientes reais para teste e não declarar homologação com base apenas em deploy live.

## Reversão

Registrar os SHAs atuais antes de publicar. Reverter funções e frontends para as versões registradas se houver regressão. Se houver troca de token, a reversão de código não restaura o segredo anterior; preservar a configuração segura e tratar rotação separadamente. O serviço WhatsApp pode continuar na branch atual até a publicação coordenada ser aprovada. Não reverter banco ou credenciais neste trabalho.

## Verificações locais

node --test tests/whatsapp-token-only.test.mjs

Testes usam tokens simulados e respostas Meta simuladas. Eles não comprovam autenticação ou entrega real na Meta. A chamada HTTP direta ao serviço publicado não foi concluída devido a timeout de rede neste ambiente.
