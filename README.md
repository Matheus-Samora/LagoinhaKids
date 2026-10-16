# Lagoinha Systems

Plataforma modular: Kids, Finance, Members e Ministries. [Arquitetura e desenvolvimento dos módulos](docs/LAGOINHA-SYSTEMS.md).

O Kids permanece operacional. Os demais módulos possuem base de acesso e aguardam a implementação das funcionalidades.

---

# Lagoinha Kids 1.2.0

Aplicativo do ministério infantil com acesso administrativo, de professores e de responsáveis. Backend FastAPI/SQLite, frontend Vite e aplicativo Capacitor Android/iOS.

## Desenvolvimento

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm ci
npm run build
# Não execute seed na instalação real. Crie um administrador com backend.manage.
.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8770
```

O seed cria somente dados fictícios e guarda acessos em runtime/ACESSOS-LOCAIS.md. Não use seed em produção. Para uma instalação real vazia, use `python -m backend.manage create-admin EMAIL NOME`: a senha será solicitada sem aparecer no terminal.

Copie .env.example para .env e ajuste as origens exatas. Credenciais, arquivos Firebase/APNs, banco, backups e chaves não devem entrar no Git. Em HTTPS, cookies de sessão são Secure e HttpOnly. Use uma chave biométrica estável e mantenha backup seguro dela.

## Versão 1.2.0

- Abertura animada da marca e login reduzido a ações de acesso; respeita movimento reduzido.
- Código obrigatório na retirada validado na API, sem revelar o código esperado; limite de tentativas e exceção administrativa com motivo auditado.
- Histórico append-only de entradas/saídas com referência à aula, preservando a chamada diária legada.
- Convites vinculados ao e-mail para outro responsável, aceite explícito, revogação e seleção da pessoa presente na entrega/retirada. O responsável principal mantém controle do cadastro e consentimento facial.
- Aulas recorrentes semanais (até 12), lista de espera e promoção automática de aluno elegível ao cancelar uma reserva.
- Recuperação de senha e verificação de e-mail por tokens com prazo e uso único; SMTP necessário.
- MFA administrativo opcional por TOTP e códigos de recuperação de uso único; revogação de outros acessos.
- Avisos internos para responsáveis vinculados e fila de push. Android usa FCM; iOS usa APNs com credenciais Apple próprias. Nenhum nome, cuidado médico ou código de retirada é incluído no conteúdo do push.
- Consulta leve de revisão antes de baixar listas, indicador de desconexão e atualização de versão por ação do usuário.
- Migração/seed corrigidos, campos de saúde preservados em edições parciais, auditoria com IP e hash encadeado de novos registros. Não equivale a armazenamento imutável contra um administrador do banco.
- Backup consistente por CLI, preparação Docker e verificação automática no GitHub Actions.

## Firebase isolado

Projeto exclusivo: `lagoinha-kids-20261014`. Android: `com.lagoinha.kids`. Não reutilizar projetos de outros sistemas. O projeto padrão do SDK não foi alterado.

Configuração Android local em android/app/google-services.json. Conta de serviço dedicada ao envio com papel Firebase Cloud Messaging Admin apenas neste projeto. Chave privada em runtime/lagoinha-firebase-service-account.json, ignorada pelo Git. .env aponta para a chave e exige KIDS_FIREBASE_PROJECT_ID correspondente.

Para outro computador, obtenha os arquivos por canal seguro e configure o ambiente local; eles não vêm pelo clone. Firebase está sendo usado para mensagens, não como banco das crianças. Nenhum Firestore/Storage de outros projetos é acessado.

```powershell
python -m backend.push_worker
```

Execute um único worker. A fila repete falhas com backoff e registra aceitação pelo provedor; aceitação não significa leitura no celular. Ative notificações em Minha conta no aplicativo nativo. O novo plugin exige reinstalação do APK. Push em aparelho físico ainda precisa de validação. iOS exige conta Apple Developer, chave APNs e assinatura/capacidade Push no Xcode; não foi compilado no Windows. O PWA não implementa Web Push.

## Operação e dados

```powershell
python -m backend.manage backup caminho/backup.sqlite3
```

Backups contêm dados privados. Agende esse comando na infraestrutura escolhida e retenha cópias criptografadas fora do servidor. Para restaurar, pare app e worker, valide a cópia com PRAGMA integrity_check, preserve o banco atual e copie a versão validada para runtime/kids.sqlite3; mantenha a chave biométrica correspondente. Testes conferem a integridade da cópia, mas um ensaio operacional completo de restauração permanece necessário.

Docker: execute npm ci e npm run build antes de docker compose up --build -d. O serviço fica em loopback; configure proxy HTTPS/domínio e segredo estável antes de uso real. Não houve contratação/provisionamento de hospedagem paga. O túnel atual é temporário e precisa do computador ligado.

## Limites e validação

Testes em `tests/`; execute python -m pytest -q. Build npm e APK debug conferidos; iOS e entrega push física não homologados. Login Google ainda requer Client ID/Secret e configuração de consentimento/redirect. SMTP não configurado. As telas informam indisponibilidade nesses casos.

SQLite permanece para piloto de uma organização. Não afirmar multitenancy entre igrejas nem escala ilimitada: testar carga representativa e considerar PostgreSQL, paginação e infraestrutura permanente conforme concorrência. Dados sensíveis não são armazenados offline no aparelho. Biometria continua opcional/experimental 1:1 e sem prova de vida; não decide retirada. Textos de privacidade precisam de revisão dos responsáveis pela operação.

## GitHub

Branches codex/* para mudanças, testes e PRs para main. Versão de produto/API/Android: 1.2.0; código Android: 3. Publicar APK em GitHub Releases, não no histórico de arquivos. O documento de acessos antigo foi retirado do versionamento e suas quatro senhas válidas foram renovadas; o histórico anterior ainda contém o documento antigo com senhas revogadas.
