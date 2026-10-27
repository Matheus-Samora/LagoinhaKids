# Presença nos cultos

## Uso

O menu **Presença nos cultos** aparece na área do membro e nos setores. TI, pastores e responsáveis de edição de Members podem cadastrar o culto com data, início/fim, local, coordenadas e raio de 30 a 1.000 metros. A janela pode abrir antes e fechar após o início, limitada ao término do culto. Todos os horários usam Brasília.

O membro com cadastro pessoal vinculado pode confirmar a própria presença pela localização ou ativar o automático. A opção automática é individual, começa desativada e exige autorização explícita. Com o app aberto e visível, o sistema consulta os cultos a cada minuto e pede uma posição somente quando existe check-in aberto ainda não confirmado. Funciona também enquanto a pessoa usa a interface Kids. Ao ocultar o app, sair da conta ou trocar de conta, uma localização pendente não gera nova confirmação.

A liderança pode consultar a lista com paginação e confirmar manualmente um membro, informando o motivo. A gestão configura o ponto do culto manualmente ou usa a própria posição quando estiver no endereço correto. Nenhuma localização de igreja foi presumida nem criada em produção.

## Regras

- O servidor usa seu próprio relógio e aceita posições de até 60 segundos, com tolerância de 15 segundos no futuro para diferença entre relógios.
- A posição só é aceita se a distância ao centro somada à margem de precisão ficar dentro do raio. A precisão deve ser de até 100 metros ou metade do raio, o que for menor.
- Uma presença por membro e culto. Tentativas repetidas não criam duplicados. A conta não pode escolher outra pessoa no check-in por GPS.
- A lista nominal e a busca de membros são exclusivas da gestão de Members, pastores e TI. O membro consulta apenas a própria presença, sem totais nem nomes de outras pessoas.
- Cancelar culto preserva presenças. A edição usa versão para impedir sobrescrever alterações simultâneas. TI/pastores cancelam qualquer culto; responsáveis de setor cancelam os que criaram.
- Apenas TI, pastores ou a própria pessoa podem remover uma presença. A remoção é lógica e a auditoria registra a ação.
- Uma presença removida não volta por uma execução automática. A própria pessoa precisa confirmar novamente de forma explícita, ou a recepção pode registrar uma confirmação auditada. O servidor também exige a preferência automática ativa para chamadas identificadas como automáticas.
- A confirmação armazena membro, culto, horário, método, versão e responsável. A posição do membro não é persistida. Motivos de confirmação manual são criptografados no banco.

## Limites

É uma verificação de localização declarada pelo aparelho, que pode ser imprecisa ou adulterada. Não equivale a prova inviolável de comparecimento e não deve liberar retirada de criança, acesso físico ou privilégios. O browser exige HTTPS e permissão de localização. Não há promessa de execução com app fechado ou tela bloqueada. Para falhas de GPS ou ausência de cadastro vinculado, a recepção dispõe de confirmação manual auditada.

Não mede permanência durante todo o culto, não presume presença de familiares e não confunde cadastro de horários recorrentes de Ministries com uma ocorrência datada de culto. A programação inicial deve ser cadastrada pela gestão.
