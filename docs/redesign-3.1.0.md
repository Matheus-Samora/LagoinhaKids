# Ajustes visuais 3.1.0

## Perfil e conta

- Editor compartilhado por todos os setores, com blocos de foto, dados pessoais e presença no Hall.
- Campos em duas colunas onde há espaço, uma coluna no celular e tamanho de fonte adequado para evitar zoom automático do iOS.
- Cabeçalho e botões de salvar/cancelar permanecem acessíveis enquanto o conteúdo rola.
- Foto com seleção visual, prévia, indicação de arquivo e remoção; nomes extensos e ausência de foto têm tratamento.
- Visibilidade do Hall com controles dimensionados corretamente e explicação dos dados privados.
- Minha conta separa identidade, segurança, dispositivos e permissões. Consultas independentes carregam em paralelo.

## Áreas compartilhadas

- Formulários, diálogos, tabelas e estados vazios das áreas operacionais receberam espaçamentos, bordas e hierarquia consistentes.
- Agenda e tarefas mantêm os comandos existentes com filtros mais organizados e tabelas acessíveis pelo teclado.
- Members, Ministries e Finance compartilham o acabamento dos editores. Cadastros pendentes deixaram de impor um fundo claro incompatível com o tema escuro.
- Central de notificações recebeu ajuste de filtros, leitura e estados vazios, preservando os sinais de não lida e de urgência.
- Hall e páginas iniciais mantiveram sua identidade existente. Nenhuma função ou autorização foi removida.

## Validação

- Revisão de código e componentes comuns, com inspeção no navegador da conta, editor do perfil, tarefas, agenda e central de avisos.
- Temas claro/escuro e viewport de 390 px. Botão de salvar visível, fechamento acessível e ausência de overflow horizontal no editor.
- Escrita exclusivamente no banco temporário: edição de nome/biografia/privacidade, criação de família, envio e remoção de foto, seguida de reabertura para confirmar persistência.
- Testes de perfil existentes e testes de atualização em tempo real executados. A execução completa da CI e a publicação ficam registradas no relatório externo de entrega.
- Nenhum cadastro real alterado nos testes. Homologação física de teclado, câmera e notificações permanece distinta da inspeção do navegador.
