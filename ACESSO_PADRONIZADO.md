# Acesso padronizado — 4/10/2026

O primeiro cadastro pede CPF válido, nome completo, WhatsApp, nascimento, e-mail opcional e senha somente numérica com pelo menos 6 dígitos. O formulário envia a solicitação para análise, sem liberar a operação.

O serviço access-standard verifica a sessão no servidor. Novos perfis começam inativos; uma aprovação vale para um aplicativo. Admin/master aprovado vê a fila pelo botão CADASTROS. Cada novo cadastro registra um aviso administrativo e um aviso ao solicitante, consultados a cada 15 segundos quando a tela está aberta. As decisões ficam registradas e o usuário acompanha a aprovação ou recusa no mesmo aplicativo.

Senhas existentes são preservadas até o titular alterá-las. Senha antiga válida fora do padrão abre somente a criação de nova senha numérica; a operação e a administração ficam bloqueadas até a troca. Senha antiga inválida não altera o perfil. O Fiscal continua em banco separado e exige uma unidade autorizada na aprovação. A aprovação inicial do Frete libera o preenchimento do dossiê; a liberação de cargas e viagens continua exigindo a conferência documental completa. A Central permanece pública.

A recuperação usa CPF e o contato cadastrado. O retorno solicitado pelo serviço corresponde ao aplicativo de origem, incluindo /admin.html para o site. Não informe que uma mensagem foi entregue sem confirmação do provedor. É necessário manter os destinos permitidos e os modelos em português no painel do Supabase; o WhatsApp também exige token, número empresarial e modelo configurados.

Validação: 41 cenários SQL com ROLLBACK e uma conferência adicional da permissão de cadastro Fiscal, 18 testes do serviço, 12 simulações de tela nos oito aplicativos, 21 verificações de regressão da Central e builds dos projetos. Scripts SQL usam somente dados temporários; não executar sem BEGIN/ROLLBACK.

