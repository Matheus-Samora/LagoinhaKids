# WhatsApp oficial — ativação

Recomendação para o Lagoinha Systems: WhatsApp Cloud API direta da Meta.

## Preparado no aplicativo

- Provedor Meta nas configurações restritas a TI/Pastores.
- Phone Number ID numérico e token próprio; chave Evolution não é reaproveitada.
- Consulta somente leitura para validar acesso ao número; não envia mensagem.
- Credenciais válidas são distintas de entrega confirmada.
- Envio de texto reconhece identificador de aceite e explica erro de janela de atendimento.
- A versão Graph pode ser definida por WHATSAPP_META_GRAPH_VERSION (padrão v21.0 já utilizado).

## Necessário para ativar realmente

1. Portfólio empresarial Meta e aplicativo com produto WhatsApp.
2. Número autorizado e registrado na WhatsApp Business Platform.
3. Token apropriado com acesso ao número; armazenar pelo painel restrito ou Secret Manager, nunca no chat/Git.
4. Configurar Meta no aplicativo e verificar a conexão.
5. Configurar modelos aprovados para comunicações iniciadas pela igreja; o compositor atual envia texto livre e não deve ser usado como disparo irrestrito.
6. Implementar recepção de webhooks com verificação de assinatura e estados de entrega, consentimento/opt-out e fila idempotente antes de disparos em escala.
7. Teste com destinatário autorizado e validação de entrega real.

A implantação do código não ativa uma conta Meta nem comprova envio. Não migrar/excluir o número do celular sem definir o fluxo oficial aplicável. Nenhuma sessão Evolution precisa ser excluída para preparar esta integração.

Referências: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api e https://www.twilio.com/en-us/whatsapp/pricing
