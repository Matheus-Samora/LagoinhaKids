# Lagoinha Kids — revisão de implementação do checklist

Data: 14/10/2026. Versão: 1.3.0, Android código 4, candidato de testes.

## Resultado

Os 144 critérios foram revistos contra a auditoria anterior. Esta entrega corrige bloqueadores concretos, mas NÃO aprova o aplicativo para dados reais, reconhecimento biométrico decisório ou 10 mil acessos simultâneos. Critérios humanos e operacionais não podem ser comprovados apenas com alterações no código.

## Alterações verificáveis

- Recuperação de acesso exige serviço de e-mail; API não retorna token de redefinição. Contas com senha exposta foram renovadas, sessões/dispositivos afetados revogados; credenciais em arquivo privado, fora do Git.
- Chamados usam código independente da retirada, respeitam família/turma e reaproveitam chamado ativo. Professores não alteram currículo de outra turma nem acessam visitantes alheios.
- Visitantes aparecem corretamente para professores. Saída exige código e conferência presencial, limita tentativas e registra auditoria. Código não aparece na listagem de visitantes.
- Eventos validam datas, ordem dos horários e URL HTTPS da imagem; capacidade não pode ficar abaixo das inscrições. Inscrição repetida retorna o registro existente e a operação é serializada no banco.
- Sincronização atualiza eventos, chamados e visitantes. Endpoint snapshot substitui sete requisições de dados por uma após mudança; consultas internas continuam múltiplas, portanto não é garantia de escala nem snapshot transacional único.
- Leitor QR abre a conferência de responsável; não registra presença automaticamente. Nomes ambíguos são recusados. Câmera para quando a página fica oculta, biblioteca pesada é carregada sob demanda e áudio libera recursos.
- Edição de turmas envia versão e rejeita tela desatualizada com 409. Compatibilidade temporária permite omissão por clientes antigos; não protege todas as entidades.
- Links diretos por hash, avisos de perda de trabalho, foco de teclado, rótulos e redução global de movimento. Alvos de toque mínimos de 44px quando o dispositivo informa ponteiro grosso.
- Índices de consulta, SQLite WAL e fechamento explícito de conexões no backup.

## Validação

55 testes Python aprovados; build Vite aprovado; APK debug compilado; npm audit de produção sem vulnerabilidades. Restauração de uma cópia de teste confirmou login e leitura dos filhos em outro processo. Não houve restauração do banco de uso diário.

JavaScript inicial: 524,65 kB antes; aproximadamente 152 kB depois (redução de 71%). Biblioteca de câmera permanece em chunk separado de aproximadamente 368 kB. Isso reduz download/análise iniciais; não mede desempenho de celulares reais.

Os sete cenários negativos de recuperação, isolamento e eventos passaram após a correção. O oitavo cenário legado, sem informar versão da turma, continua reproduzindo sobrescrita; o novo teste com a versão enviada pelo app retorna 409.

## Prioridades restantes

1. Antes de produção: hospedagem permanente com TLS, SMTP com fila e confirmação de entrega, OAuth, APNs/assinatura iOS, notificações em celulares físicos e revisão de privacidade/consentimento/retirada.
2. Para a escala solicitada: paginação e consultas em lote, revisão por usuário/turma, migração para banco e implantação dimensionados, múltiplas instâncias, coordenação de filas e testes externos de carga com dados sintéticos. O teste anterior de 1.000 requisições com máximo de 100 em paralelo não representa 1.000 usuários simultâneos.
3. Continuidade: backups externos e restauração incluindo chave biométrica, métricas/alertas, plano de incidentes, suporte e retenção/exclusão. Não ativar exclusão automática de dados infantis sem prazo definido pela instituição.
4. Usabilidade: executar tarefas sem ajuda com responsáveis/professores, Android/iPhone físicos, rede instável e leitores de tela. Medir conclusão e corrigir problemas observados.

