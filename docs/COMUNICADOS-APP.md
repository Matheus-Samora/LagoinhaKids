# Comunicados no aplicativo — 2.4.5

WhatsApp foi retirado da interface Kids/Systems e do backend. Clientes antigos recebem HTTP 410; não há envio externo por estas rotas. Histórico do banco foi preservado.

Em Comunidade > Comunicados > Novo Comunicado, escolha o setor e o público: todos do setor, somente líderes ou pessoas específicas. A autorização é aplicada no servidor, incluindo escopo de ministério; mensagens direcionadas ficam fora do mural dos demais usuários. TI/Pastores mantêm supervisão global e o autor pode consultar seus comunicados.

Cada destinatário recebe uma notificação interna; o trigger do banco agenda o push existente. Comunicados de setores não dependem de acesso ao Kids. Push mostra texto genérico na tela bloqueada, sem conteúdo privado. O recebimento no celular exige instalação/permissão de notificações e configuração do canal disponível (web push ou push nativo). Nenhuma mensagem foi enviada a usuários reais nos testes.

A infraestrutura Evolution não foi apagada nesta alteração; o código do aplicativo não a utiliza. Dados e credenciais históricos não são reutilizados.
