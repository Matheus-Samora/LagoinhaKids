# Otimização sem contratação de infraestrutura — 29/10/2026

## Alterações
- JavaScript e CSS públicos com nomes versionados passam a ser servidos diretamente pelo sistema de assets do Cloudflare, sem invocar o Worker da API. Somente esses JS/CSS recebem cache longo immutable; HTML, versão, service worker e todas as APIs continuam passando pelos controles anteriores. Dados pessoais não recebem cache compartilhado.
- Leaflet e seu CSS só são importados ao abrir o mapa de configuração do culto. Falhas de carregamento preservam os campos manuais. Fechar o diálogo libera o mapa e seu temporizador de geocodificação.
- O servidor informa explicitamente que não oferece stream SSE persistente. O cliente encerra essa tentativa sem reconectar repetidamente e mostra atualização periódica. A conexão real de outros backends continua compatível.
- Verificação de chamados no portal evita execuções simultâneas e não consulta em segundo plano/sem internet. O intervalo de 2,5 segundos em primeiro plano permanece. O push nativo FCM e a rotina de repetição de entrega permanecem ativos.
- Resumo de notificações do portal é atualizado uma vez por minuto apenas enquanto visível e autenticado; não depende do antigo stream vazio.
- Verificação Kids de mudanças usa um SELECT com subconsultas em vez de quatro chamadas SQL sequenciais. As leituras lógicas são equivalentes, com menos viagens ao banco. Avisos, leitura, chamados e auditoria continuam alterando a revisão.
- Snapshot de responsável filtra os filhos no SQL, sem carregar primeiro todas as crianças para depois filtrar em memória. Não altera o conjunto retornado.
- Índice parcial dos perfis pastorais e índice de sessões por usuário. Removido apenas notice_user_id, duplicata exata de notifications_user(user_id,id), mantendo este último. Não exclui registros.

## Medições do build
Comparação feita com os mesmos critérios (soma do gzip dos scripts referenciados no HTML inicial):

| Entrada | Antes | Depois | Redução |
|---|---:|---:|---:|
| Kids | 140.991 bytes | 98.127 bytes | 30,4% |
| Systems | 144.303 bytes | 101.509 bytes | 29,7% |

É redução de transferência inicial, não promessa de 30% menos tempo em qualquer aparelho. O código do mapa continua disponível em um chunk separado, carregado ao usar a função. Foi adicionado orçamento de 120 kB gzip por entrada no CI para prevenir regressão.

## APK, custo e confiabilidade
- APK atual permanece 3.3.1, 14.850.600 bytes, mesma assinatura e hash. Nenhuma reinstalação necessária para esta entrega web. Não foi recompilado nem foi alegada redução do instalador. Os assets embarcados representam aproximadamente 5,04 MB comprimidos; mudança de empacotamento nativo ficará para uma versão que exija novo APK, com validação da instalação e push.
- Sem mudança de plano, novo serviço pago, nova instância, KV, Durable Objects, rede dedicada ou frequência do cron. Objetivo: reduzir requisições, tráfego repetido e scans no D1 existente. Não se promete valor exato da fatura, que depende do uso real.
- Nenhuma conta, criança ou lançamento real foi criado, alterado ou excluído nos testes. Sem testes de carga contra produção, mensagens a usuários, cache de permissões, relaxamento de autenticação ou alterações na persistência dos dados.
- Testes isolados cobrem SSE desabilitado, concorrência/visibilidade dos chamados, SQL de revisão, preservação de dados durante índices, API, autorizações, presença, formulários e push. Build e CI completos antes de publicar.
- Não houve benchmark físico do APK, nem comprovação de capacidade de 1.000–10.000 usuários simultâneos. A latência pública foi amostrada com poucas requisições, não usada para prometer ganho em operações autenticadas.

Fontes: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ e https://developers.cloudflare.com/d1/best-practices/use-indexes/ .
