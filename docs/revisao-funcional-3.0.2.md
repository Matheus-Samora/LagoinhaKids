# Revisão funcional — 3.0.2

Revisão por responsabilidade e fluxo, sobre a versão 3.0.1. Inventário estático: 264 rotas HTTP em 17 módulos de backend; esse número não representa 264 fluxos testados individualmente. A matriz de cobertura anterior permanece em release-3.0.0.md. Nenhuma alteração ou notificação de teste foi realizada em cadastros reais.

## Áreas e impacto

| Área | Fluxos conferidos no código e na suíte | Ajuste desta revisão |
|---|---|---|
| Conta | Login, recuperação, sessão, foto, dados pessoais, conflitos de edição | Mantidos salvamento atômico, versão e proteção dos dados privados |
| TI e permissões | TI, pastores, responsáveis de setor, usuário próprio, escopos e auditoria | Exclusão de eventos de terceiros restrita a TI/pastores; triagem de GC limitada à liderança autorizada |
| Members | Pessoas, famílias, vínculos de conta, inscrições, aprovação, jornada | Aprovação completa o cadastro já ligado à conta, sem duplicá-lo; preserva informações existentes; famílias não são unidas por sobrenome; datas desconhecidas não viram a data atual |
| GCs | Catálogo, solicitação, liderança, encontros e histórico | Consultas não criam GCs; carga opcional não altera nem reativa registros existentes; liderança acompanha triagem somente dos seus GCs |
| Ministries | Vínculos, escalas, disponibilidade, conflitos, resposta, recursos e histórico | Reagendamento rearma lembrete; edição de instruções não rearma; prazo inválido rejeitado também em escala recusada |
| Finance | Contas, lançamentos, transferências, fechamento, conferência, recorrência, notas e exportação | Mantidos valores em centavos, transações, controle de versão, idempotência e proteção das transferências |
| Kids | Crianças, turmas, aulas, reservas, espera, chamada, retirada, arquivos | Seleção “sem monitor” passa a remover o monitor e permanece correta ao reabrir |
| Eventos | Inscrição, capacidade, idade, edição e cancelamento | Edição não pode tornar crianças já inscritas incompatíveis com a faixa etária |
| Triagem | Etapas, responsável, prazo, desistência e decisões | Reenvio com a mesma identificação não duplica histórico; candidatura concluída não aceita nova triagem; líder não desiste em nome do solicitante |
| Hall | Perfil público, publicações, comentários, reações e moderação | Mantidas separação de dados privados e permissões de moderação |
| Notificações | Inbox, preferências, confirmação, SSE, entrega e trabalho em segundo plano | Mantida entrega vinculada ao usuário; corrigido o ciclo do lembrete de escala |
| Interface | Formulários, navegação com rascunhos, carregamento, mensagens e tela pequena | Correção pontual da seleção de monitor, preservando o fluxo simples existente |
| Continuidade | Arquivamento, restauração, auditoria, backup e recuperação | Sem limpeza ou transformação automática dos cadastros existentes |

## Simplificação aplicada

- Aproveitar o cadastro explicitamente ligado à conta, em vez de bloquear a aprovação ou cadastrar outra pessoa.
- Pedir decisão de aprovação/rejeição e reservar desistência ao próprio solicitante.
- Exibir erro acionável antes de invalidar inscrições existentes.
- Respeitar campos opcionais vazios, consultas sem efeitos colaterais e reenvios sem duplicação.
- Não acrescentar telas, configurações obrigatórias ou integrações desnecessárias.

## Limites de validação

A suíte exercita os fluxos e regras principais com dados sintéticos; não certifica ausência absoluta de falhas. Em produção, realizar somente leituras autenticadas, saúde, versão, frontend e conexão SSE. Android/iOS físicos com app fechado, permissões do sistema, câmera, impressoras e totens exigem homologação nos equipamentos. Suporte a 1.000–10.000 usuários simultâneos depende de teste de carga representativo; não foi atestado por esta revisão. Backups gerenciados/PITR não substituem ensaio de restauração do ambiente completo.
