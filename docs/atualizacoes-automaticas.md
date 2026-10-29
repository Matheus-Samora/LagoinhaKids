# Atualizações web automáticas

O APK carrega o Cloudflare por HTTPS. Cada build Vite gera um identificador único em app-release.json, também incluído no JavaScript. Não depende de alguém alterar manualmente o número da versão.

Os dois pontos de entrada (Kids e Systems) verificam a publicação após 15 segundos, a cada minuto enquanto visíveis, ao recuperar conexão e ao voltar ao aplicativo. Havendo mudança, recarregam a página após 10 segundos sem interação, preservando URL e autenticação existente. O servidor envia HTML e manifestos com Cache-Control: no-store.

Não há atualização forçada durante formulário modificado, requisição de alteração pendente, diálogo, câmera ou chamado web. A atualização fica indicada em uma faixa e aguarda um momento seguro. Formulários não monitorados individualmente também são protegidos por eventos de edição; se continuarem abertos depois de salvar, feche-os para permitir a atualização.

Publicação: executar npm run build:server antes de npx wrangler deploy. Esse modo também inclui o APK disponibilizado em public/lagoinha-kids.apk, quando presente. O build mobile normal continua excluindo instaladores dos assets embarcados.

As próximas telas, estilos e funções web são atualizadas sem reinstalar. Serviços Android, permissões, plugins, assinatura e código Java continuam exigindo APK novo. Em especial, a correção de chamadas nativas desta entrega exige instalar uma vez o APK 3.3.1. Este mecanismo não instala APK silenciosamente nem contorna controles Android.

Validação: testes da política de aplicação, build Vite e checagens do manifesto/HTML publicados. Sem aparelho conectado, não se afirma teste físico em segundo plano ou tela bloqueada.
