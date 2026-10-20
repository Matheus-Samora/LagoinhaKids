# Notificações — pesquisa e remodelação 2.4.6

## Decisão de produto

O histórico dentro do aplicativo é o registro principal. Push é um canal adicional para chamar atenção, condicionado à escolha do usuário, permissões do aparelho, conectividade e configuração do provedor. Um aceite do provedor não significa que a pessoa leu ou que o aparelho mostrou o alerta.

Não usar telas de erro como notificações. Confirmações de salvar e erros de formulário continuam no contexto da ação. Não pedir permissão automaticamente ao entrar. No aplicativo aberto, atualizar a central e o contador sem gerar um segundo alerta local para o mesmo push.

## Tipos implementados

| Categoria | Exemplos existentes | Comportamento |
|---|---|---|
| Chamados da salinha | Chamado no telão, pedido de presença, responsável chegou | Prioridade alta, validade de 30 minutos para push; segue preferência do usuário e controles do sistema. Chamado encerrado não gera push atrasado. |
| Solicitações e respostas | Candidatura a ministério/GC, aprovação, responsável a caminho | Aviso normal e histórico. Vai à equipe autorizada e/ou à pessoa envolvida. |
| Comunicados | Comunicado para setor, líderes ou pessoas; anúncio de evento | Prioridade normal, conteúdo completo apenas no aplicativo. |
| Presenças e atualizações | Entrada/saída, aula, conteúdo aprendido, inscrição em evento | Push desabilitado por padrão; histórico preservado. Pode ser habilitado nas preferências. |
| Conta e sistema | Avisos da conta e teste do canal | Prioridade normal; a existência desta categoria não cria automações de segurança que ainda não existem. |

Avisos comuns são retidos para tentativa externa por até 7 dias; atividades e sistema por até 24 horas. O histórico não é apagado por essa expiração. Alertas já lidos são suprimidos na fila de push.

## Necessidade por perfil

| Perfil | Informação pertinente | O que evitar |
|---|---|---|
| Pais/responsáveis | Chamados dos filhos vinculados, respostas e comunicados permitidos | Informações de outras famílias; dados da criança na tela bloqueada |
| Professores/monitores | Retorno dos responsáveis e rotina das turmas autorizadas | Avisos financeiros e de ministérios não autorizados |
| Líderes/responsáveis | Solicitações do setor e do escopo de ministério delegado | Candidaturas de ministérios alheios; associação por coincidência de nomes |
| Membros | Próprias inscrições, aprovações e comunicados destinados a eles | Filas administrativas sem permissão |
| Pastores | Supervisão dos sistemas permitidos e comunicações deliberadamente direcionadas | Cópia automática de toda notificação operacional |
| TI | Supervisão de acesso e escalonamento quando não há equipe responsável | Ser o destino primário de toda inscrição ou evento |

Solicitações notificam primeiro responsáveis com permissão. Na ausência de responsáveis há fallback pastoral e, depois, TI. Supervisão global não gera inscrição automática em todo push setorial; comunicados diretos e destinados a líderes continuam disponíveis. Permissões e visibilidade são verificadas no servidor.

## Experiência implementada

- Central unificada em Kids e Systems, aberta pelo sino; sem painel grande automático no meio da página.
- Filtros por categoria/não lidas, paginação por cursor, contador total e leitura individual ou em lote.
- Abrir o detalhe marca leitura. Isso não confirma que o responsável está a caminho: essa ação continua exigindo confirmação autenticada no chamado.
- Preferências individuais por categoria, opção de pausar todo push e horário de silêncio em Brasília. O silêncio pode adiar avisos comuns; chamados passam apenas quando sua categoria está habilitada. O usuário e o sistema operacional mantêm o controle final.
- Clique no push abre um aviso autorizado e sua área correspondente. URLs são limitadas a caminhos locais conhecidos; nenhum token é colocado na URL.
- Prévia de tela bloqueada genérica, sem nomes, valores, saúde ou códigos de retirada.
- Tag estável por notificação e comprovante de aceite por aparelho/canal. Em falhas parciais, tentativas seguintes pulam destinos com aceite persistido. Ainda há uma pequena janela de repetição se o processo cair entre o aceite externo e a gravação; não se promete entrega exatamente uma vez.
- Preferências, notificações e dados antigos são preservados por migração aditiva. Não houve envio a pessoas reais durante a validação.

## Plataforma e limites

A instalação pela Tela de Início (PWA) continua sendo a opção publicada. No iPhone/iPad, web push requer iOS/iPadOS 16.4+ e abertura como app instalado, com permissão solicitada após um toque do usuário. Android/navegadores compatíveis também exigem permissão.

Os canais Android foram preparados por categoria no código. FCM/APNs nativos dependem das credenciais/registro de app e de uma nova compilação distribuída; alterar o servidor não instala um novo APK. Não ativamos um canal nativo inexistente por simulação. O modo Foco, silêncio e políticas do sistema não são contornados.

Não existem ainda novos lembretes automáticos de vencimento financeiro, escala ou integração de calendário nesta entrega. A central está pronta para esses eventos futuros, mas somente ações existentes geram registros hoje. Teste real de entrega com o aparelho bloqueado deve ser feito com destinatário autorizado.

## Pesquisa oficial

- Apple HIG: conteúdo útil, conciso e privado; evitar repetição e interrupções desnecessárias. https://developer.apple.com/design/human-interface-guidelines/notifications
- Apple: níveis de interrupção, consentimento e controle pelo Foco. Alertas críticos exigem autorização específica; não são usados aqui. https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- Android: canais por tipo e controle de importância pelo usuário. https://developer.android.com/develop/ui/compose/notifications/channels
- Android: permissão de notificações em tempo de execução. https://developer.android.com/develop/ui/compose/notifications/notification-permission
- WebKit: condições do web push em apps da Tela de Início no iOS/iPadOS. https://webkit.org/blog/13878/

As recomendações foram adaptadas ao produto. Não se afirma acesso à implementação privada de aplicativos comerciais.
