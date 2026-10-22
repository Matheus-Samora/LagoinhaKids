# Lagoinha Systems 2.7.1

- Corrige isolamento de eventos entre setores, com revalidação da sessão e das permissões durante a conexão.
- Remove autenticação por CSRF e credenciais de sessão em query strings. SSE utiliza ticket criptografado de até 60 segundos, exclusivo do stream e vinculado à sessão ativa.
- Emite eventos somente depois do commit; rollback descarta eventos pendentes. PostgreSQL NOTIFY reutiliza o pool limitado da aplicação.
- Eventos de Kids e perfil carregam apenas sinais de atualização; comunicados personalizados chegam somente aos destinatários.
- Hall consulta dados e permissões do próprio leitor, preservando filtros, contagens e estado de reações entre dispositivos.
- Leitura individual de notificações sincroniza o contador e valida a propriedade nas três rotas existentes.
- Heartbeat explícito evita reconexões em sessões ociosas. Logout impede conexões atrasadas e reconexões automáticas.

Validação: suíte Python SQLite, testes JavaScript de conexão/logout/heartbeat, build e auditoria de dependências. CI inclui PostgreSQL e smoke do container. Testes usam dados sintéticos isolados; nenhum cadastro real é alterado.

Esta versão não ativa integrações externas desabilitadas, nem representa homologação de carga ou entrega push em aparelhos físicos.
