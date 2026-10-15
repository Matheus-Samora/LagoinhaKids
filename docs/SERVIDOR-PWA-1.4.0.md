# Lagoinha Kids 1.4.0 — operação por servidor e instalação web

Data da revisão: 15/10/2026.

## Modelo escolhido

Aplicativo web instalável (PWA), acessado por HTTPS e adicionado à Tela de Início. Preserva introdução, marca, login e perfis. Não exige distribuição pela Play Store ou App Store. A instalação e as permissões são controladas pelo navegador/sistema. No iPhone, Web Push exige iOS 16.4 ou posterior e instalação na Tela de Início.

O servidor de aplicação será um serviço exclusivo `lagoinha-kids` no Cloud Run. O banco será uma instância PostgreSQL exclusiva `lagoinha-kids-db`. Ambos ficam somente no projeto `lagoinha-kids-20261014`, região `southamerica-east1`. O script não altera o projeto padrão do SDK, servidores existentes ou dados de outros projetos. Cloud Run é um serviço isolado gerenciado, não uma máquina física exclusiva.

## O que foi implementado

| Área | Estado e limite |
|---|---|
| Introdução, login e senha | Preservados; acesso administrativo próprio criado. |
| Administração | Gestão de usuários, turmas, horários e eventos. Contas fictícias anteriores removidas. |
| Professores | Turmas atribuídas, chamada, visitantes e comunicação conforme permissões. É necessário cadastrar contas reais de professores. |
| Responsáveis | Cadastro de filhos, horários disponíveis, confirmação/cancelamento e comunicação. Conta e criança reais existentes preservadas. |
| Turmas e eventos | Base de demonstração removida com confirmação do usuário. Criar turmas e horários reais para aparecerem às famílias. |
| Entrada e retirada | Conferência presencial obrigatória; retirada com código. QR identifica o cadastro e abre a conferência. |
| Notificações web | Assinatura Push API autenticada, VAPID, fila no servidor, serviço worker, revogação ao sair e teste de envio pelo servidor. Permissão isolada não significa cadastro concluído. |
| Notificações no aparelho | Implementadas por Web Push; homologação em Android/iPhone com aplicativo fechado continua pendente. Entrega depende de rede, permissões e controles do sistema. |
| Privacidade dos avisos | Mensagem genérica na tela bloqueada; nome, saúde e código de retirada ficam dentro da área autenticada. |
| Estou a caminho | Exige chamado existente, vínculo familiar e proteção CSRF. Removidos o fluxo de demonstração e a falsa confirmação do service worker. |
| Agenda | Google Agenda abre evento preenchido para o usuário salvar; exportação `.ics` para o calendário do celular. Não é sincronização bidirecional. |
| Uso sem conexão | Mostra orientação para reconectar. API, fotografias e cadastros não são guardados no cache do service worker. Não permite fingir que um cadastro offline foi salvo. |
| Banco | SQLite preservado localmente. PostgreSQL com pool e esquema sem demonstração para Cloud SQL; suíte de integração também executada contra PostgreSQL 16. |
| Implantação | Container com build web e supervisão de HTTP/worker. Cloud Run recusa SQLite efêmero e exige chave estável de criptografia. |
| Backup | Backup local antes da limpeza; implantação configura backup diário e proteção contra exclusão na instância Cloud SQL. Restauração Cloud SQL ainda precisa ser exercitada após a implantação. |
| E-mail e Google login | Continuam dependentes de SMTP e credenciais OAuth. Não foram inventadas configurações de serviços inexistentes. |
| Reconhecimento facial | Auxiliar e experimental; não substitui conferência de responsáveis. Não homologado como sistema biométrico de produção. |
| Capacidade | Configuração inicial limitada para testes. Não certificada para 1.000–10.000 usuários simultâneos. |

## Limpeza realizada

Removidas quatro contas, seis crianças, seis turmas, três horários/aulinhas e dois eventos de demonstração, incluindo os vínculos operacionais correspondentes. Preservados uma conta e um cadastro de criança posteriores à demonstração. Foi criado um administrador próprio da operação real. A criança preservada ficou sem turma após a exclusão das turmas fictícias: atribua/crie uma turma real.

Backup privado: `runtime/backups/before-real-operation/`. Credencial administrativa: `runtime/ADMINISTRACAO-REAL.md`. Nenhum desses arquivos entra no Git, contexto do Cloud Build ou imagem. A criação de demonstração fica desabilitada por padrão e proibida no Cloud Run.

## Implantação preparada

Execute na raiz do repositório, usando o Python do ambiente e o Google Cloud SDK autenticado:

```powershell
.venv\Scripts\python.exe deploy/cloud_run.py
```

O script verifica faturamento antes de criar recursos. Sem faturamento, termina informando o bloqueio. Com faturamento, prepara APIs, contas de serviço, repositório de imagem, banco, importação inicial dos dados limpos, segredos e serviço Cloud Run. Cada comando recebe explicitamente o projeto exclusivo. A importação é realizada uma vez; uma execução posterior não sobrescreve os cadastros feitos no servidor.

A transferência inicial usa objeto privado no Cloud Storage, com acesso da conta da instância Cloud SQL, e o remove depois da importação. Credenciais, chave biométrica, chave VAPID e conexão do banco ficam em Secret Manager; não aparecem na linha de comando. O banco e uma instância mínima do Cloud Run geram cobrança contínua. A configuração inicial usa no máximo duas instâncias do serviço, pool pequeno e banco compartilhado pequeno; deve ser redimensionada e testada antes do volume estimado.

O procedimento foi preparado e o backend PostgreSQL foi testado em CI. A criação efetiva de recursos pagos, build Docker no Cloud Build, importação Cloud SQL e URL definitiva só podem ser confirmados após a execução com faturamento habilitado. Não declare o servidor implantado apenas porque os arquivos existem.

## Roteiro de teste em celulares reais

1. No Android, abrir o endereço HTTPS no Chrome e escolher Instalar aplicativo/Adicionar à tela inicial.
2. No iPhone com iOS compatível, abrir no Safari, Compartilhar, Adicionar à Tela de Início e iniciar pelo ícone.
3. Entrar com uma conta real, ativar notificações em Minha conta e aceitar a permissão do sistema.
4. Solicitar um teste pelo botão do aplicativo. Verificar aviso com o app aberto, em segundo plano e fechado. Aceitação na fila não comprova entrega.
5. Criar professor, turma e horário reais; cadastrar/confirmar aluno pelo responsável e registrar entrada presencial pela equipe.
6. Enviar chamado, abrir pelo aviso e confirmar Estou a caminho. Conferir retorno para o professor e retirar com o código correto.
7. Testar cancelamento, limite de vagas, internet interrompida, encerramento de sessão e isolamento entre duas famílias.

Fontes: WebKit, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; Google Cloud, https://docs.cloud.google.com/run/docs/container-contract e https://docs.cloud.google.com/sql/docs/postgres/connect-run .
