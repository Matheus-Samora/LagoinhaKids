# Chamados Kids no APK Android 3.3.1 (código 6)

## O que estava falhando

O serviço Android consultava `/api/paging/active` sem autenticação. Dependia de polling `dataSync`, sujeito a Doze, encerramento de processo e limite de duração. O toque manual podia começar mesmo que a notificação/tela não tivesse autorização. Abrir o WebView por `startActivity` em segundo plano não garantia a apresentação do chamado.

## Correção

- Transporte FCM HTTP v1 de alta prioridade a partir do Cloudflare. Não há novo servidor Cloud Run. A conta Firebase pertence ao projeto exclusivo `lagoinha-kids-20261014`.
- Som gerenciado pelo canal de notificações Android, com notificação destacada e atividade nativa independente do WebView. Tela cheia depende da permissão especial e da decisão do Android.
- Conteúdo genérico na tela bloqueada, sem nome da criança, código de retirada ou dados de saúde no payload push.
- Ações nativas para abrir o app, silenciar e informar que está a caminho. Confirmar requer sessão autenticada, autorização para a criança e, se bloqueado, desbloqueio do aparelho. Não informa sucesso antes da resposta do servidor. Silenciar não confirma atendimento.
- Registro do novo APK associado ao usuário autenticado. Chamados vão apenas aos responsáveis vinculados; professor que iniciou ou administrador não toca automaticamente no próprio aparelho por ser administrador.
- Fila por chamado/dispositivo, tentativas limitadas com backoff, expiração, desduplicação e cancelamento nos demais aparelhos quando o chamado é atendido ou resolvido. Uma aceitação do FCM significa aceitação pelo provedor, não prova de que o aparelho tocou.
- Sessão removida ou usuário bloqueado suprime envios. Payloads de outro usuário ou chamados antigos são ignorados. No logout, a identidade local e o alerta são limpos.
- O alerta sonoro tem duração máxima de um minuto; chamados antigos não devem voltar a tocar indefinidamente. O histórico do chamado fica no aplicativo.
- O APK mostra diagnóstico de notificações, canal, som, registro e permissão de tela cheia. O usuário decide quais permissões conceder. Não se desativa Não Perturbe nem se força o volume do aparelho.

## Instalação e validação

É necessário instalar o APK código 6 sobre o antigo, entrar na conta correta e abrir **Avisos neste celular**. Autorizar notificações, manter o canal Kids com som e importância alta, e permitir tela de chamado quando disponível. A instalação pelo ícone do site não recebe as alterações nativas do APK.

Validar no celular: app visível, segundo plano, tela bloqueada, remoção dos recentes, rede móvel/Wi-Fi, silencioso/Não Perturbe, conta diferente, logout, chamado cancelado e resposta pela tela nativa. Não se declara homologação de aparelho que não foi testado fisicamente.

## Limitações do sistema

Não há garantia de alerta em aparelho desligado, sem conexão, com notificações bloqueadas, parada forçada ou restrições do fabricante. Remover dos recentes é diferente de **Forçar parada**. A exibição pode ser aviso destacado quando o telefone estiver em uso, e tela cheia quando bloqueado e autorizado. Este recurso é um aviso do app, não uma ligação telefônica ou serviço de emergência. A equipe deve acompanhar a confirmação de atendimento e usar outro contato quando não houver retorno.

## Referências oficiais

- Android, notificações urgentes e tela cheia: https://developer.android.com/develop/ui/views/notifications/build-notification#urgent-message
- Android, limites de serviço em primeiro plano: https://developer.android.com/develop/background-work/services/fgs/timeout
- Firebase, prioridade de mensagens Android: https://firebase.google.com/docs/cloud-messaging/android/message-priority
- Android, acesso à tela cheia: https://source.android.com/docs/core/permissions/fsi-limits

## Segredos e publicação

O segredo `FCM_SERVICE_ACCOUNT` fica no Worker, nunca no frontend, APK, Git ou relatório. A migração `deploy/cloudflare/migrations/0001_native_paging.sql` é aditiva. O cron do Worker processa somente a fila nativa. O APK antigo usa outro protocolo e deve ser atualizado. O projeto mantém outras limitações identificadas na revisão anterior; esta entrega não representa homologação de todas as APIs do Worker.
