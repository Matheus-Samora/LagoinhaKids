# Recuperação e homologação operacional

## Infraestrutura observada em 22/10/2026

Exclusivamente no projeto `lagoinha-kids-20261014`: Cloud Run `lagoinha-kids`, `southamerica-east1`; Cloud SQL `lagoinha-kids-db`, disponibilidade REGIONAL, backup automático às 03:00 UTC, retenção de 35 backups, PITR e retenção de logs por 7 dias. Configurações conferidas por SDK sem alterá-las.

A exportação JSON do aplicativo é operacional e não substitui um backup PostgreSQL. Arquivos e mídias armazenados no banco integram o backup do banco; a chave de criptografia depende das versões preservadas no Secret Manager. Nunca excluir versões necessárias para dados antigos.

## Restauração

1. Identificar incidente e intervalo afetado; preservar logs sem dados pessoais, sessões e a revisão anterior.
2. Restaurar backup/PITR para outra instância isolada do mesmo projeto, sem apontar o aplicativo de produção para ela.
3. Conferir restrições, contagens, registros amostrais autorizados, anexos e capacidade de descriptografar com o segredo correto. Não enviar notificações do ambiente restaurado.
4. Executar testes sintéticos, comparar estado antes de decidir um corte. Rollback de imagem não desfaz dados de usuários; nunca substituir o banco real para desfazer apenas uma interface.
5. Registrar hora do incidente, último ponto recuperável, duração da restauração e perda efetiva antes de aprovar o corte operacional.

A CI restaura um dump PostgreSQL sintético e compara tabelas, contagens e restrições. Isso não mede o tempo de recuperação do volume real nem testa o segredo real de produção. Metas propostas para homologação: RPO de até 5 minutos com PITR e RTO de até 4 horas, a confirmar por simulado; não são garantias já demonstradas. Alertar se backups/PITR falharem, se houver erro 5xx persistente ou falha das rotinas agendadas.

## Carga

`tools/load_smoke.py` recusa destinos fora de localhost. Use uma base descartável e credenciais sintéticas em KIDS_LOAD_EMAIL/KIDS_LOAD_PASSWORD. Executa leituras com concorrência 1, 5, 10 e 25, imprimindo erros, p95 e vazão. Não imprime credenciais nem respostas dos registros. Isso é smoke de concorrência; para 1.000–10.000 pessoas medir sessões ativas, taxa de requisições, latência, banco, tamanho dos dados, distribuição dos perfis, armazenamento e push em homologação antes de aumentar limites.

## Android/iOS

Homologar com contas de teste autorizadas: instalação PWA; permissão push aceita/negada; aviso com app aberto e fechado; clique abre contexto; saída/novo login não mantém dados da conta anterior; rede cai durante salvamento e reenvio não duplica; câmera/QR; etiqueta/printer; código antigo/reutilizado; teclado, zoom, leitor de tela e foco. Não testar entrega de crianças nem enviar chamados a famílias reais.

## Ativação de acessos

Conferir identidade e e-mail pessoalmente. Gerar convite individual; entregar em canal privado. A migração explicitamente confirmada revoga sessões e impede login até definição da senha pelo link de 48 h. Não executar migração em massa sem plano de suporte. Exigência de 2FA só pode ser ativada depois de a pessoa configurar e guardar seus códigos.
