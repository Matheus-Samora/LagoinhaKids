# Revisão funcional e de integrações 3.2.0

## Escopo e evidência

Revisão do código compartilhado, suíte automatizada e consultas de produção. Base anterior: 3.1.0, revisão lagoinha-kids-00076-5nh. A nova versão inclui o redesenho pendente de Avisos. Registros reais não foram usados para testes de escrita nem sofreram limpeza, migração em massa ou fusão automática.

| Área | Verificação |
|---|---|
| Conta e acesso | Login, recuperação, sessões, autorização por perfil/escopo e segundo fator nos testes existentes |
| Perfil | Foto, dados pessoais, visibilidade, identidade, família, versão e envio parcial multipart |
| Members e GCs | Pessoas, família, inscrições, decisões, integração e liderança limitada ao grupo |
| Ministries | Equipes, disponibilidade, conflitos, respostas, identidade do voluntário, materiais e avisos |
| Kids | Turmas, aulas, reservas, espera, entrada, presença, retirada, saúde e arquivos |
| Eventos | Inscrição, idade, capacidade, alterações, participantes e chamados |
| Finance | Centavos, contas, lançamentos, conferência, transferências, recorrência, relatórios e arquivos |
| Hall | Perfis públicos, publicações, comentários, reações e moderação com proteção de dados |
| Avisos e integrações | Preferências, rascunhos, leitura, categorias, autorização do destino, push, retentativa e SSE |
| Continuidade | Inicialização, restauração PostgreSQL na CI, conflitos de edição e resposta segura a indisponibilidade do banco |

## Falhas corrigidas

1. Associação de perfil, escalas e envio de avisos por e-mail antigo sem confirmação suficiente: resolução comum privilegia vínculo explícito e só admite correspondência legada única com e-mail verificado. Alterações ambíguas exigem revisão, sem fundir pessoas.
2. Perfil listava famílias de terceiros e permitia vínculo direto com qualquer ID; criação pelo mesmo nome podia unir famílias indevidamente. Agora seleção comum se limita à família atribuída ou criada pela pessoa; gestão mantém suas permissões.
3. Envio parcial de foto podia limpar dados não enviados, como família e nascimento. Apenas campos realmente presentes no multipart são aplicados.
4. Clientes Kids e plataforma interpretavam respostas de API de forma diferente e falhavam diante de erro textual/HTML ou resposta vazia. Agora compartilham interpretação, mensagens acionáveis e códigos de conflito. Escritas não são repetidas automaticamente.
5. Preferências de Avisos podiam perder alterações durante atualização ou erro; leitura rápida podia diminuir o contador duas vezes. Rascunhos/solicitações são protegidos, leitura em andamento não duplica e filtros não reinserem o aviso de outra categoria aberto por link.
6. Escalas de Ministries dependiam de autorização Kids na fila de push. A autorização agora acompanha o destino real. Avisos de conta sem criança direcionam à área pessoal.
7. Falha transitória de banco/provedor na fila podia encerrar o processo e afetar o supervisor do servidor. Ciclos passam a aguardar nova tentativa com logs sem credenciais; falha operacional de banco em uma requisição tem resposta segura e recuperável.
8. Teste legado de notificações esperava comportamento anterior e não integrava a CI. Foi atualizado para verificar ausência de duplicação, privacidade e abertura apenas em rotas da aplicação; testes de materiais e participantes também passam a rodar na CI.

9. Lockfile continha versões de dependências alteradas por troca global da versão do aplicativo. O grafo original, compatível com o manifesto atual, foi restaurado. Novo teste compara cada versão ao arquivo exato de distribuição npm.

## Condições que continuam explícitas

- Google login está desabilitado no servidor por falta de configuração ativa, não validado como integração pronta.
- Push web está habilitado; push nativo está desabilitado. Exibição com celular bloqueado, permissões do sistema, câmera, etiquetas, impressoras e totens exigem homologação física.
- Recuperação de senha consta disponível na API. Esta revisão não enviou mensagens ou e-mails a pessoas reais.
- API bancária automática e sincronização bidirecional com calendário não estão conectadas.
- Capacidade de 1.000 a 10.000 pessoas simultâneas e recuperação do ambiente inteiro exigem ensaios representativos. Não se declara ausência absoluta de falhas ou perda zero de dados.
- Um erro operacional de banco apareceu na consulta dos últimos três dias; não se atribui automaticamente sua causa a ataque. Os ajustes de recuperação não substituem monitoramento do banco.

Contas antigas com correspondência ambígua podem receber orientação para procurar a gestão. Isso evita expor ou alterar o cadastro errado. Nenhuma identidade real foi transferida automaticamente.
