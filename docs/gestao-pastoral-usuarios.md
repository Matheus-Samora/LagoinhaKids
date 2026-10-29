# Gestão de usuários por Pastores

Pastores acessam /access#permissions (Usuários e acessos) sem acesso ao painel de TI. Podem atribuir os perfis existentes de Kids, Members, Ministries e Finance, definir ministérios específicos, bloquear/reativar e redefinir senha de contas que não sejam TI. Podem atribuir ou remover o perfil pastoral de outras pessoas; o perfil pastoral continua concedendo todos os setores, exceto TI.

Excluir conta revoga sessões e desativa o login, mantendo o histórico e os vínculos de crianças/membros/finanças. A conta permanece marcada como Excluído e pode ser restaurada na mesma área. Não há apagamento físico de usuários ou cadastros relacionados. Administrador TI continua protegido contra alterações por Pastores; a exclusão da própria conta e a remoção do próprio privilégio global são bloqueadas. A API valida autorização e CSRF, perfis/setores e tipos de campos; registra alterações em auditoria. Troca administrativa de senha revoga sessões.

Migração aditiva 0002_user_archives.sql. Não cria ou exclui pessoas reais. Testes de integração em SQLite isolado verificam matriz de permissões, proteção TI, CSRF, escopos de ministérios, exclusão/restauração e revogação de sessões. Renderização do gerenciador pastoral testada com dados sintéticos. Publicação na infraestrutura Cloudflare existente; atualização web, sem novo APK.
