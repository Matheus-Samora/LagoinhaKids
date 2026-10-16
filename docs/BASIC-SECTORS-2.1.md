# Cadastros básicos — versão 2.1.0

Members cadastra famílias e integrantes, data de entrada na igreja, nascimento, parentesco e contato opcionais. A quantidade de integrantes é calculada pelos membros ativos vinculados. Não cria contas de login automaticamente.

Ministries usa o diretório Members (somente identificador e nome) para atribuir ministério, função e data inicial. Catálogo: Music, Intercessão, Hero, Shine, Bem Casados, Rocket, Legacy, Kids, Manutenção, Voluntário, Follow, Link Future, Gourmet, Champions, DNA e Sonoplastia. Uma pessoa pode ter vários ministérios, sem repetir vínculo ativo no mesmo ministério.

Finance registra contas e saldo inicial, entradas e saídas manuais, categoria e data, notas com número, fornecedor, valor e anexo PDF/JPG/PNG/WebP até 10 MB. Valores são armazenados em centavos. Saldo considera lançamentos ativos; histórico registra antes/depois. Não há conexão bancária ou validação fiscal automática. Anexos exigem permissão Finance.

Systems é exclusivo da administração TI. /access é o seletor dos setores autorizados para outros usuários. Administração TI mantém acesso geral e gestão de usuários/permissões. Perfil viewer consulta; editor cadastra/edita; admin também arquiva e consulta histórico financeiro. Kids permanece com seus fluxos anteriores.

Exclusões são arquivamentos. Famílias com integrantes e contas com lançamentos ativos não podem ser arquivadas. Arquivar um membro encerra seus vínculos ministeriais. Edições possuem controle de versão; reenvios de criação com mesmo identificador não duplicam registros. Migração somente adiciona tabelas e índices, preservando dados existentes. Arquivamento não possui restauração pela interface nesta versão.

Interface responsiva com busca, estados vazios, confirmação e indicação de erros. Listas limitadas a 200 por seção; famílias/contas a 500. Paginação completa, importação/exportação e integrações ficam para próximas etapas.

Validação: suíte automatizada de 95 testes (SQLite), build Vite, testes CI PostgreSQL/container e conferência local dos formulários. Não equivale a certificação de carga de 10 mil usuários ou teste físico de push Android/iOS.
