# Recuperação de acesso — 2.4.1

Adiciona Esqueci minha senha ao login do Lagoinha Systems e formulário de redefinição compartilhado pelos setores. Lagoinha Kids mantém a recuperação existente e os links recebidos abrem a nova tela central.

Links expiram em 30 minutos, são de uso único e armazenados somente como hash. Uma nova solicitação substitui o link anterior. Ao redefinir, as sessões e dispositivos anteriores são revogados. Respostas não revelam se uma conta existe; limite de cinco solicitações por endereço a cada cinco minutos. Novos links usam fragmento para evitar enviar o token na URL das requisições HTTP. TLS SMTP valida o certificado do provedor. Falhas de entrega são registradas sem destinatário, senha ou token.

Validação local e de produção: 112 testes aprovados, build Vite concluído e envio real do Cloud Run (`southamerica-east1`) validado via `smtp-relay.brevo.com:587` com remetente verificado `Lagoinha Systems <imm.tecnologia1@gmail.com>` e entrega confirmada (`event: delivered`) na API transacional do Brevo.

Credenciais ficam exclusivamente no Secret Manager do projeto `lagoinha-kids-20261014` (`lagoinha-systems-smtp-password`); nunca inserir chaves no repositório. Alterações amplas da checklist continuam em branch separado.
