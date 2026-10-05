# Notificações Forte — 05/10/2026

O contador vem do servidor e respeita aplicativo, aprovação e empresa. Admin/master recebem avisos de cadastros, recuperação de acesso e documentação de motoristas pendente. O motorista vê exatamente a quantidade de cargas publicadas compatíveis com suas rotas e capacidade. Abrir as cargas não apaga o contador; retirar/aceitar uma carga atualiza o saldo.

Ative ATIVAR NOTIFICAÇÕES no aplicativo ou na Central e conceda permissão no celular. No iPhone, use Safari e Adicionar à Tela de Início. Número ou ponto no ícone depende do sistema e navegador.

Consulta com aplicativo aberto: 30 segundos. Web Push com aplicativo fechado: verificação no servidor a cada minuto. APKs atualizados: JobScheduler com intervalo mínimo de 15 minutos, sujeito a rede/bateria do Android, e atualização enquanto abertos. APK anterior precisa de atualização; instalação pelo navegador usa Web Push. O APK da Central com Capacitor precisa usar a instalação pelo navegador para Web Push.

A Central recebe somente contadores de origens e janelas verificadas e assina avisos de aplicativos conectados no mesmo navegador. Não copia senhas, tokens ou cadastro entre aplicativos. Navegadores que isolam sessões de iframes podem exigir abrir o aplicativo diretamente.

Sessões dos APKs: AES-GCM com Android Keystore e restauração da sessão ao reabrir. Sair limpa tokens e contadores. Chaves privadas de Push ficam no servidor e não são concedidas a anon/authenticated.

Validação: builds web; testes de elegibilidade, autenticação e origens; simulação DOM dos contadores 3 → 2 → 0; regressões do Forte Frete. Notificações físicas dependem de permissão no aparelho do usuário.
