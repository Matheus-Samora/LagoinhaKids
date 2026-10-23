# Lagoinha Systems 3.0.0 — melhorias aplicáveis

Base: 2.7.2 / 92140cb. Alterações aditivas, sem limpar dados, enviar convites em massa, migrar senhas automaticamente ou fundir cadastros reais.

TI mantém poder global; pastores mantêm poder global fora de TI; responsáveis de setor respeitam escopos; perfis comuns preservam o próprio cadastro. O Hall não expõe e-mail, telefone, endereço, saúde ou notas pastorais.

## Onde encontrar

- Todos os setores: Tarefas, Agenda e Minha conta.
- TI → Operações: convites, migração individual, integridade, revisão de duplicados, auditoria e entrega de avisos.
- Members → Integração & GCs; Área do Membro → Liderança de GC e Recepção Kids para equipe autorizada.
- Ministries → Gestão da equipe: cultos/horários, materiais e substituições.
- Finance → Conferência: transferências, recorrências, extrato e aprovação.

## Matriz de aplicação

“Implementado” refere-se às rotinas descritas abaixo, não à homologação física ou à capacidade de produção. Itens condicionais são explicitados.

| Item | Entrega / condição |
|---|---|
| S01 | Convite individual de 48 h, senha definida pela pessoa, uso único; formulários TI/equipe usam convite. |
| S02 | Migração individual com prévia, confirmação e revogação de sessões. Nenhuma conta existente é migrada automaticamente. |
| S03 | Ampliação dos testes de API para perfil, escopo, arquivos, relatórios, versões e operações novas; testes existentes preservados. |
| S04 | Minha conta mostra direitos efetivos; TI/pastor são heranças globais e escopos ministeriais limitam demais usuários. |
| S05 | Promoções explicam impacto e registram antes/depois na auditoria; política pastoral preservada. |
| S06 | Concessão de vários ministérios por usuário, validada no servidor e nas leituras/escritas. |
| S07 | Minha conta reúne perfil, privacidade, senha, segundo fator, sessões e acessos; avisos/preferências continuam na central comum. |
| S08 | Autenticador aparece após solicitação no login; qualquer pessoa pode habilitar 2FA. TI pode exigir para conta já configurada, sem bloquear contas não preparadas. |
| S09 | Auditoria com busca, setor, intervalo, paginação, total e acesso antes/depois exclusivo de TI. |
| S10 | Restauração SQLite isolada em teste; pipeline PostgreSQL faz pg_dump/pg_restore e compara tabelas, contagens e restrições. Política operacional em operations-recovery.md. |
| D01 | Painel TI identifica vínculos de turma inválidos; revisão pelo cadastro existente. Nenhum vínculo real foi modificado automaticamente. |
| D02 | Equipe considera atribuições de turma, tabela de equipe e aulas futuras; acesso por reserva antiga não permanece indefinidamente. |
| D03 | Identidade existente é reutilizada; nenhuma tabela paralela de pessoas é criada. Conta explícita prevalece sobre correspondência de e-mail. |
| D04 | Detecção de nomes duplicados e fusão revisada por TI, prévia/versões/motivo, preservando referências e histórico; bloqueio de identidades incompatíveis. |
| D05 | Origem e confirmação de cadastro, indicador de incompletude, jornada e histórico. Campos desconhecidos não são preenchidos automaticamente. |
| D06 | Estágios e aniversariantes agregados no servidor; vínculos ministeriais agregados; cálculos financeiros usam conjunto completo, separado da página carregada. |
| K01 | Buscar aluno não abre câmera nem registra presença: exibe resultados e exige conferir entrada/saída. |
| K02 | Retirada mantém confirmação, código e exceção auditada. Testes cobrem validade/reutilização e regras existentes; validação física ainda necessária. |
| K03 | Presença vincula aula quando informada, valida contexto e expiração; código é invalidado na saída. Sem aula, validade de 12 h; com aula, fim + 2 h. Legados não são reescritos. |
| K04 | Autorizações estruturadas por criança com vínculo, final opcional do documento, validade e revogação auditada; responsável principal/TI/pastor gerenciam. |
| K05 | Recepção Kids na Área do Membro reúne situação, reservas e pendências; registro continua no fluxo de conferência do Kids. |
| K06 | Cartões mostram alerta resumido; detalhes de saúde/retirada ficam recolhidos para equipe autorizada. Não ampliar acesso ao Hall. |
| K07 | Componentes adaptáveis, áreas de toque e tabelas roláveis; verificação visual a 390 px realizada nas novas áreas. |
| K08 | Datas localizadas e contexto de aula disponível; horários usam fuso da igreja. |
| K09 | DEPENDÊNCIA FÍSICA: QR/câmera, impressora, etiquetas e totem em aparelhos reais devem ser homologados. QR de instalação agora é gerado a partir do endereço real. |
| M01 | Próximas escalas filtram data/hora presente no fuso da igreja. |
| M02 | Agenda unificada com período, ministério e situação; lista pessoal respeita vínculo e gestão respeita escopo. |
| M03 | Duração de 15–480 min; bloqueio por intervalos, incluindo compromissos de dias adjacentes. |
| M04 | Indisponibilidades, prazo, lembrete optativo e lista de substitutos sem conflito; substituição revalida no salvamento. |
| M05 | Substituição e histórico na mesma transação; respostas registradas sem apagar histórico anterior. |
| M06 | Cadastro arquivável de cultos/horários e preenchimento assistido da escala; funções padronizadas existentes preservadas, sem renomear dados reais em massa. |
| M07 | Etapas de triagem/conversa/treinamento/pronto, responsável/prazo e histórico; aprovação/recusa existente continua disponível. |
| M08 | Painel por escopo com equipes, lideranças, respostas carregadas, materiais, substituição e candidaturas em tarefas. Não se inventam metas de vagas fora das capacidades configuradas. |
| M09 | Upload PDF/imagem, responsável, validade, versão otimista e troca de arquivo preservando mídia anterior e auditoria; download autenticado por escopo. |
| F01 | Zero sem classificação de superávit/déficit nem barra fictícia. |
| F02 | Orientação inicial: conta, centro, lançamento e conferência; atalhos para os cadastros. |
| F03 | Notas Fiscais e Fechamento do culto padronizados; exportação operacional distinguida de backup completo. |
| F04 | Centro de custo valida catálogo ministerial; formulário usa seleção, orçamento não negativo. |
| F05 | Fechamento mantém vínculo idempotente; lançamento manual disfarçado de borderô bloqueado. Conta com aprovação gera pendência. |
| F06 | Centavos e filtros conferidos em fixtures; total do relatório segue linhas filtradas; previsões não dependem dos primeiros 200 registros. |
| F07 | Política opcional por conta; solicitante e criador não aprovam o próprio lançamento, decisão vinculada à versão, baixa exige aprovação atual. |
| F08 | CSV UTF-8 com prévia e referências únicas, deduplicação e conciliação por conta/valor/sentido. API bancária depende de provedor e credenciais e não está conectada. |
| F09 | Recorrência mensal gera parcelas pendentes e preserva dia âncora; transferências criam duas pernas atômicas, bloqueiam alteração isolada e cancelam juntas. |
| F10 | Orçamento acumulado versus pago, alertas de consumo e vencimento. Alerta não é bloqueio automático de despesa; isso evita impedir compromissos reais sem política definida. |
| F11 | Exportações existentes CSV/JSON/XLSX/impressão preservadas; relatório filtrado ganha totais explícitos. Impressão/PDF continua via navegador. |
| G01 | Vocabulário de jornada inclui acolhimento, GC, formação, membro e serviço; diretório mantém privacidade dos campos. |
| G02 | Acompanhamento com etapas, responsável, prazo, ação seguinte e histórico; conclusão remove tarefa. |
| G03 | Liderança de GC vinculada a conta e grupo, sem conceder permissão global de Members. |
| G04 | Registro de encontros e presenças limitado aos participantes do GC; na 3.0.1, líderes também analisam pedidos do próprio GC, sem acesso global a Members. |
| G05 | Busca de GCs por nome/bairro/dia; endereço residencial só é exibido a gestão e participantes/líderes autorizados. |
| G06 | Participante acompanha etapas e pode desistir de candidatura pendente; respostas de aprovação/recusa existentes mantidas. |
| C01 | Formulário explica quais campos aparecem no Hall e quais continuam privados. |
| C02 | Biografia e profissão podem ser ocultadas; profissão oculta também não é pesquisável. Contatos nunca são publicados. |
| C03 | Regras de convivência e orientação sobre dados sensíveis; sinalizações geram retorno privado após análise, sem repetir notificação ao resolver novamente. |
| C04 | Prévia da audiência, agendamento e expiração; destinatários são revalidados na execução, bem como a autoridade do autor. |
| C05 | Confirmação de leitura optativa em tarefas; painel distingue aberto no app e aceito pelo serviço push, sem afirmar exibição no aparelho. |
| C06 | Entregas/tentativas e erro técnico genérico consultáveis por TI; retentativas e preferências existentes preservadas. |
| C07 | Tarefas pessoais: escalas, leitura, candidatura, acompanhamento e análise, com contexto e conclusão. |
| C08 | Agenda reúne Kids, escalas e eventos e exporta ICS filtrado. Não é sincronização bidirecional com Google Agenda. |
| U01 | Seletor de setor/conta/tarefas/agenda no Kids e navegação comum nos demais setores. |
| U02 | Área do Membro separada da gestão de membros; rótulos por tarefa. |
| U03 | Inícios dos setores mostram resumo e atalhos; tabelas e permissões saem do destaque inicial. |
| U04 | Carregamento/erro/vazio, comandos inativos em transições e formulários protegidos contra perda/duplicidade. |
| U05 | Paginação de membros no servidor, busca assistida e homônimos com ID interno; não usar contato parcial como identificador público. |
| U06 | Filtros explícitos/limpeza, datas locais, navegação móvel por seletor sem sobrecarregar a barra inferior. |
| U07 | Confirmação de impactos de promoção, migração, fusão, cancelamento e arquivamento; versões impedem sobrescrita silenciosa. |
| U08 | Foco visível, hidden consistente, movimento reduzido, rótulos/estados e diálogo nativo; inspeção visual móvel realizada. Auditoria assistiva completa ainda exige dispositivos/leitores reais. |
| U09 | DEPENDÊNCIA FÍSICA: instalar, push aberto/fechado/negado, teclado, câmera e retomada em Android/iOS reais. Não certificado só por testes de API. |
| U10 | Ferramenta de carga gradual somente localhost e roteiro de recuperação. Meta de 1.000–10.000 pessoas não certificada; exige homologação com volume e infraestrutura representativos. |

## Evidência

Testes automatizados com dados sintéticos isolados, verificação visual desktop/390 px, build e auditoria de dependências. A execução final da CI, revisão publicada e smoke pós-publicação são registrados no relatório de entrega, separadamente do desenvolvimento local. Nenhum teste de escrita é executado sobre dados reais de produção.

## Complemento 3.0.1

- Líderes de GC aprovam ou recusam pedidos apenas do próprio grupo e recebem aviso sem contatos privados; retirada da liderança revoga essas ações.
- GC e ministério vinculam solicitações pela conta. Homônimos nunca são fundidos automaticamente; legado ambíguo ou e-mail não confirmado exige revisão. Datas desconhecidas permanecem vazias.
- Pedido por ID de GC prevalece sobre nomes repetidos; reenvio não repete decisão nem notificação.
- Aprovação ministerial preserva acesso bloqueado por TI e não altera cargo nem escopo administrativo existente. Responsável e prazo podem ser definidos na triagem.
