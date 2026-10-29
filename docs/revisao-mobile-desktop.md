# Revisão de compatibilidade — 29/10/2026

## Corrigido nesta entrega
- Assets reais de instalação: 192, 512, Apple 180 e versão maskable com margem segura; dimensões conferidas em teste. Mesma marca institucional.
- Orientação livre no PWA, preservando uso em tablet e horizontal.
- Campos de 16px em tela pequena e controles de toque maiores; foco visível e preferência de movimento reduzido.
- Altura dos diálogos e do perfil acompanha a área visível; formulário continua rolável e botões de salvar ficam disponíveis em altura reduzida.
- Grids de eventos, equipe, avisos e escalas adaptam a largura mínima ao contêiner.
- Link do Kids legível no tema escuro do login Systems.
- Instruções de instalação por plataforma, incluindo desktop e iPad em modo desktop.
- Aviso offline sem simular sucesso de salvamento; reconexão remove o aviso.
- Service worker web compartilhado: registrado no navegador/PWA, removido no APK; sem apagar indiscriminadamente caches. Push Android continua nativo.
- Botão Voltar no portal Android fecha diálogos antes de sair e impede abandonar formulário pendente.
- Fluxo web consulta a disponibilidade do serviço push antes de pedir permissão ao navegador.

## Evidências
- Perfil real do código renderizado em fixture local, com dados sintéticos e API substituída: nenhum cadastro real foi criado/alterado. Fixture tools/mobile-qa.html não integra os inputs do build de produção.
- 320×568: página sem overflow horizontal; diálogo 304×544; campos de 16px.
- 360×360: diálogo de 336px de altura, topo 12px, rodapé dentro da tela; corpo rolável de 172px.
- 1440×900: diálogo 760×870; perfil em duas colunas.
- Login público inspecionado em 360px; encontrado campo de 13px no portal e link ilegível no tema escuro, corrigidos.
- Testes Node: APIs, atualização, presença, push, realtime, instalação e dimensões dos PNG. Build de produção e CI do GitHub conferidos antes da publicação.

## Limites e pendências reais
- Não houve teste físico em Android/iPhone, teclado de sistema, câmera, GPS, instalação PWA ou atendimento push com tela bloqueada. Redimensionamento de navegador não equivale a um iPhone real.
- A API de produção informa push_platforms=[android]. Chamados nativos são do APK Android; push externo web/iOS não está habilitado no servidor. Instalar um atalho não habilita essa integração.
- Não há gravação offline: é necessário internet para consultar e salvar; não foi introduzida fila local de dados pessoais.
- A versão de APK disponibilizada continua sendo a 3.3.1 assinada para testes; distribuir como APK definitivo requer assinatura de produção e plano de atualização da parte nativa.
- Google Login e recuperação de senha estão desabilitados nas capabilities atuais do Cloudflare. São integrações pendentes, não problemas de dimensão da tela.
- Não foi comprovado suporte a 1.000–10.000 acessos simultâneos nem feita auditoria funcional integral de cada setor autenticado nesta revisão de compatibilidade.

Fontes de instalação: https://support.google.com/chrome/answer/9658361 e guia Apple https://support.apple.com/guide/iphone/iph42ab2f3a7/ios
