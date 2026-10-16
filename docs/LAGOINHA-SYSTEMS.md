# Lagoinha Systems — base 2.0

## Acesso no Cloud Run

Um único serviço e banco existentes no projeto exclusivo `lagoinha-kids-20261014`. Os nomes técnicos legados do serviço, banco, repositório e variáveis KIDS_* são mantidos para preservar URLs, segredos, dados e instalações. O produto e a aplicação passam a se chamar Lagoinha Systems.

| Área | Caminho | Estado |
|---|---|---|
| Portal central | /systems (também /) | Login e gerenciamento de permissões |
| Lagoinha Kids | /kids | Fluxos existentes preservados |
| Lagoinha Finance | /finance | Base de acesso; negócio em desenvolvimento |
| Lagoinha Members | /members | Base de acesso; negócio em desenvolvimento |
| Lagoinha Ministries | /ministries | Base de acesso; negócio em desenvolvimento |

Os caminhos são áreas dentro do mesmo domínio, não subdomínios reais. O domínio run.app não permite criar subdomínios arbitrários sob a URL do serviço. Quando houver domínio próprio, configurar DNS/TLS e os hosts exatos em SYSTEMS_MODULE_HOSTS, por exemplo {"systems.exemplo.com":"systems","kids.exemplo.com":"kids","finance.exemplo.com":"finance","members.exemplo.com":"members","ministries.exemplo.com":"ministries"}. A configuração define a área inicial, os links e os hosts autorizados. Não habilita DNS ou certificados sozinha.

As sessões atuais usam cookies restritos ao host: no endereço único, o login é compartilhado entre caminhos. Em subdomínios futuros, cada host terá sua sessão; SSO entre hosts requer implementação própria posterior. Não compartilhar cookies amplamente por domínio.

## Identidade e autorização

- Identidade, senha, Google quando configurado e MFA são compartilhados.
- `platform_admins`: administração central; separada do perfil administrativo do Kids.
- `module_access`: acesso habilitado e perfil por usuário e módulo.
- Kids mantém admin/teacher/parent e suas regras de turmas/famílias.
- Novos módulos preveem admin/editor/viewer; as operações específicas e permissões detalhadas serão implementadas em suas etapas.
- Apenas administração central pode modificar contas, senhas de terceiros e permissões entre módulos. Administração de um módulo não concede administração central.
- Permissões são verificadas na API; esconder menus não é a barreira de segurança. Revogação passa a valer na próxima requisição, inclusive em sessões abertas.
- Usuários criados no portal começam sem módulos liberados; a administração escolhe os acessos. Cadastros de famílias feitos no Kids continuam recebendo somente o acesso Kids.
- Alterações são registradas na auditoria existente.
- Administração central atual é preservada. Criar usuário admin no Kids não cria um administrador central.

## Migração

A migração é aditiva e transacional, com marcador `systems_v1`. Na primeira execução, administradores já existentes recebem a função central e os usuários existentes mantêm seus acessos Kids. Nenhum usuário recebe automaticamente acesso aos três novos módulos, exceto os administradores centrais. Reexecutar a migração não reativa acessos revogados nem promove administradores Kids criados posteriormente.

Dados de crianças, turmas, aulas, notificações e templates permanecem nas tabelas atuais do Kids. Não são copiados para Finance, Members ou Ministries. A instalação limpa cria o administrador central pelo bootstrap existente. Não há novos dados de demonstração em produção.

## Organização do código

- `backend/platform.py`: portal e administração de acesso.
- `backend/platform_access.py`: migração e catálogo dos módulos.
- `backend/module_security.py`: dependências reutilizáveis de autorização.
- `backend/modules/finance`, `members`, `ministries`: routers independentes; atualmente somente estado protegido da base.
- Backend Kids: arquivos atuais preservados para reduzir risco nesta migração. Refatoração interna pode ocorrer separadamente.
- `src/platform`: interface central e entradas dos novos módulos.
- Frontend Kids: mantido, com retorno ao portal Systems.
- Vite possui duas entradas: index.html (Kids) e systems.html (portal).

Ao criar operações financeiras, de membros ou ministérios, utilizar `module_access('finance', roles=('admin','editor'))` nas operações de escrita; consulta pode permitir viewer. Separar modelos/tabelas com prefixo de módulo e evitar leitura direta de dados de outro módulo. Compartilhamento futuro deve ser explícito e autorizado, não consequência de estar no mesmo banco.

## Notificações e instalação

Avisos atuais continuam sendo do Kids. Links apontam para /kids#notifications; um clique no push vindo do portal abre a área correta. O manifest do Kids inicia em /kids e o portal possui manifest separado com identidade /systems. Não há notificações de Finance, Members ou Ministries antes de seus fluxos serem implementados.

## Validação

Testes abrangem isolamento de módulos, acesso negado, revogação com sessão aberta, distinção entre administração central e Kids, CSRF, validação de perfis, migração idempotente e regressão dos fluxos existentes. Interface verificada com dados temporários, inclusive tamanho móvel. PostgreSQL e container são validados no CI.

Limitações anteriores permanecem: Google/SMTP ainda dependem de configuração, push físico em Android/iOS e capacidade para 1.000–10.000 usuários não foram certificados por esta reestruturação.
