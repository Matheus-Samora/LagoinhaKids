# Revisão do salvamento — 2.4.8

## Problemas corrigidos

- Perfil da conta condicionado indevidamente à permissão do Kids. Perfil, foto e central de notificações agora usam autenticação compartilhada, mantendo CSRF e limites de acesso aos dados.
- Foto enviada e associada em duas operações. O novo formulário grava nome, celular e imagem na mesma transação. Uma falha ou versão desatualizada não deixa a imagem parcialmente associada nem sobrescreve alterações mais recentes.
- Cadastro criado por um usuário confundido com seu cadastro pessoal. Identidade pessoal agora tem vínculo explícito com a conta; registros de terceiros continuam preservados. A migração associa apenas cadastros aprovados com correspondência única de proprietário, nome, e-mail e nascimento.
- Formulários simplificados apagavam campos omitidos. Membros, famílias, GCs, contas, lançamentos, centros de custo, notas, fechamentos, vínculos, escalas e materiais preservam campos que não foram enviados. Um valor vazio explícito continua permitindo limpar um campo opcional.
- No Kids, edições preservam foto e cuidados da criança, imagens e equipe da turma, anexos e notas de aulas, e imagens e demais campos opcionais dos eventos.
- Segundo conferente exibido como opcional, mas exigido no servidor. Regra alinhada ao formulário; quando informado, deve ser diferente do primeiro conferente.
- Fechamento e lançamento financeiro vinculado permanecem na mesma transação. Repetições da mesma solicitação não duplicam lançamentos; conflitos de versão são verificados antes de alterar o lançamento vinculado.
- Formulários de setores, escalas, autocadastro e perfil bloqueiam saída durante envio e pedem confirmação para descartar alterações. Entradas permanecem preenchidas em caso de erro. Salvamento confirmado não é anunciado como falha caso apenas a atualização da lista falhe.
- Imagens são validadas, orientadas conforme EXIF, limitadas em dimensões, otimizadas e gravadas sem metadados originais. Avatares locais precisam ser imagens enviadas pela própria conta.
- Perfil compartilhado acessível pelo botão “Meu perfil” nos setores e por “Editar perfil e foto” no Kids, com contraste em temas claro/escuro, rótulos, foco visível e controles para celular.

## Validação

- Suíte automatizada de autenticação, permissões, cadastros, aulas, presença, eventos, arquivos, finanças, notificações e integridade, acrescida de 12 regressões de salvamento.
- Testes específicos de gravação atômica, leitura em nova sessão, conflitos, ausência de arquivos órfãos no perfil, CSRF, acesso sem Kids, campos omitidos, migração de identidade e consistência de fechamentos.
- Build Vite e auditoria das dependências de produção.
- Interface local isolada: nome, celular e foto salvos pelo Kids; persistência após recarregar; confirmação de descarte cancelada mantém rascunho; fechamento sem alterações; acesso ao mesmo perfil no Members; criação e fechamento de cadastro; enquadramento de 390 × 844.
- Testes de escrita e uploads usam somente banco temporário e dados fictícios. Em produção, a conferência se limita a saúde, versão, revisão/tráfego, interface publicada e consultas autenticadas sem alteração dos registros.

## Limites

Esta revisão não é uma garantia de ausência de qualquer erro. Não foi realizada validação em aparelhos físicos Android/iOS, de todas as combinações de redes/perfis, nem teste de carga de 10 mil usuários. Versão otimista impede sobrescrita no novo perfil e nos cadastros de setores; nem todas as rotas antigas do Kids possuem controle de versão obrigatório. Eventos e cadastros Kids conservam suas permissões e regras existentes.

O perfil da conta (nome de exibição, celular e foto) e o cadastro de membro da igreja têm finalidades distintas e não sobrescrevem automaticamente um ao outro.
