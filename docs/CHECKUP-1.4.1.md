# Check-up funcional — Lagoinha Kids 1.4.1

Data: 15/10/2026. Base analisada: commit 665f2b0 (inclui novos módulos do Antigravity). Ambiente: dados fictícios em banco temporário; nenhum cadastro real alterado pelos testes.

## Correções
- Gestão de contas, senhas, funções e delegação restrita à administração; professores veem apenas equipe vinculada às suas turmas, sem lista global de pais.
- Alterações de acesso encerram sessões; troca de e-mail remove vínculo Google e verificação anterior. Impedido remover o próprio acesso administrativo e converter responsável com filhos sem resolver seus vínculos.
- Participantes de eventos respeitam acesso à criança para consultar, incluir e cancelar. Inclusão pela equipe valida idade.
- Monitores permanecem vinculados às turmas após edição. Professores não transferem a titularidade usando o campo teacher_id. Professores/monitores de aula precisam estar ativos e autorizados na turma.
- Material de aula rejeita links executáveis; uploads possuem limite de leitura de 10 MB e fotos não aceitam PDF. Limite exibido no formulário agora corresponde ao servidor.
- Coordenação criada pelo formulário recebe perfil administrativo; telefone editado passa a ser salvo.
- Arquivos exigem sessão e usam cache privado sem armazenamento persistente.
- Push sem confirmação de provedor permanece pendente para nova tentativa; erros não registram endpoints privados. Tela bloqueada recebe mensagem genérica, sem nome, saúde ou código de retirada da criança.
- A ação da notificação abre o app para confirmar o chamado com sessão e proteção CSRF; retirada a falsa confirmação direta pelo service worker.
- Saúde distingue disponibilidade de push web e nativo.

- Removido worker duplicado iniciado ao importar a API, que concorria com o processo supervisionado e com os testes; fila processada pelo worker supervisionado a cada três segundos.

## Cobertura verificada
| Área | Evidência |
|---|---|
| Login, logout, senha, sessão, limitação de tentativas, CSRF e CORS | Testes de API; login/logout visual dos três perfis |
| Cadastro e edição de filhos, vínculo familiar, convite e consentimento | Testes de API com registros temporários |
| Turmas, equipe, monitores, horários, aulas recorrentes, idade e capacidade | Testes de API e isolamento entre perfis |
| Confirmação de participação, conflito de horário, fila de espera e cancelamento | Testes de API, incluindo concorrência pela última vaga |
| Entrada, saída, responsável, código de retirada e visitante | Testes de API; entrada e aviso ao pai conferidos visualmente |
| Eventos, inscrição, participantes, avatares e capas | Testes de API, incluindo acesso indevido negado |
| Conteúdo das aulas e calendário ICS | Testes de API |
| Notificações, leitura, isolamento entre famílias, fila e criptografia Web Push | Testes com provedores simulados e criptografia real; sem envio a pessoas |
| MFA, recuperação de senha, verificação de e-mail | Testes locais; serviços externos dependem de configuração |
| Reconhecimento facial | Teste local de modelo, template criptografado e consentimento; não equivale à validação biométrica com crianças reais |
| Backup/restauração SQLite e migração | Testes locais; não comprova restauração do Cloud SQL |
| Interface mobile | Navegador 390×844: login, turmas, equipe, chamada, área dos pais e administração; sem rolagem horizontal na chamada |
| Build e dependências | Build Vite e npm audit sem vulnerabilidades na instalação verificada |

## Pendências que impedem declarar validação completa
- Push em aparelho Android/iPhone real, inclusive tela bloqueada, aplicativo fechado, permissão revogada e rede instável. Aceitação pelo provedor não comprova recebimento físico.
- Google OAuth e SMTP de produção continuam sem configuração; recuperação por e-mail não opera sem SMTP.
- Câmera, QR físico, leitor USB, APK e Safari/iPhone não foram testados em dispositivos físicos nesta rodada.
- Reconhecimento facial é auxiliar, sem prova de vida; não libera criança automaticamente. Precisão real e resistência a fotos ainda exigem avaliação apropriada.
- Não executado teste de carga com 1.000–10.000 usuários. Configuração atual e banco pequeno não devem ser tratados como capacidade certificada.
- Acessibilidade completa com leitor de tela, uso prolongado, redes lentas, restauração do Cloud SQL e validação com famílias/professores reais continuam pendentes.
- Não foi realizada revisão jurídica de privacidade; o relatório descreve verificações técnicas.

A publicação deve ser identificada por revisão pronta e tráfego do Cloud Run, junto da versão retornada pelo servidor. O resultado dos testes está no XML de check-up e no CI do commit correspondente.
