# Hall de Membros — Comunidade 2.6.0

O Hall deixa de ser apenas uma lista de contatos e passa a reunir conversas e pessoas no próprio aplicativo.

## Experiência

- Identidade visual em verde profundo, tons claros e dourado suave; hierarquia simples e layout adaptado a celular e computador, com tema escuro.
- Mural com publicações de comunidade, gratidão, oração e boas-vindas.
- Reação “Acolher”, comentários, edição das próprias publicações e filtro “Minhas publicações”.
- Diretório paginado com busca por nome/profissão, filtro por ministério, fotos, biografias, GCs e ministérios. Perfil permite abrir as publicações da pessoa.
- Perfil próprio e acesso aos GCs integrados. Alterar o perfil pelo Hall preserva o rascunho da publicação.
- Links diretos: `/members#hall` e `/membro#hall`; diretório em `#hall/people`; conversa de uma publicação em `#hall/<id>`.
- Indicador de novidades consultado a cada 60 segundos enquanto o mural está visível. Atualizar o mural preserva o texto sendo escrito. Conversas abertas consultam comentários a cada 30 segundos, preservando o campo de resposta.
- Aviso pessoal ao autor quando outra pessoa comenta. Reações e novas publicações não disparam avisos em massa. Web Push/Android/iOS preservam o link da conversa; envio obedece permissões e preferências existentes.

## Acesso e cuidado

- Participação vinculada ao acesso Members, inclusive perfil de visualização, além de TI e Pastores. O servidor verifica a permissão em todas as operações.
- Diretório separado do cadastro administrativo: não retorna telefone, e-mail, endereço, nascimento, estado civil ou anotações pastorais. A interface não direciona interações ao WhatsApp.
- Sinalização de conteúdo e análise pela coordenação com permissão de gestão de Members, TI e Pastores. Identidade de quem sinalizou não é exibida ao autor.
- Remoção lógica de publicações/comentários, com conteúdo preservado no banco. Sinalizações, reações e conversas entram na exportação TI e nos backups do banco existente.
- Transações, controle de versão nas publicações editadas, identificadores de solicitação contra duplicação e limites contra publicação/comentários repetidos.
- Conteúdo exibido como texto escapado; imagens de perfil com alternativa visual caso falhem. Nenhum HTML enviado por membros é executado.
- Listas paginadas e consultas agrupadas, sem uma consulta adicional por cartão para contar interações ou carregar ministérios.

## Verificação

- Regressões automatizadas de permissão, CSRF, privacidade do diretório, solicitação repetida, conflito de versão, autoria, reações, comentários, notificações, moderação, limites e paginação.
- Suíte delimitada à pasta `tests/`: scripts de importação avulsos não são executados como testes nem tentam abrir arquivos de cadastros reais.
- Testes visuais e funcionais locais com banco temporário: publicar, editar, reagir, comentar, buscar perfis e abrir publicações por autor; layouts de computador e celular.
- Dados demonstrativos e mensagens de teste permanecem exclusivamente no banco temporário. Não são enviados a pessoas nem publicados no servidor real.

Validação em aparelhos físicos e entrega real de push não fazem parte da prova local. Mensagens privadas individuais, anexos nas publicações e transmissão instantânea por WebSocket não foram introduzidos nesta versão.
