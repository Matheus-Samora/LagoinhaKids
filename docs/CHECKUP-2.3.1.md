# Revisão funcional e visual — 2.3.1

## Referência examinada
Último pedido do Antigravity na conversa do projeto: “Continue de onde parou”. Pedido detalhado anterior: Link/Future separados, GCs oficiais, banners, emblemas, portal de candidaturas, acesso pastoral, escalas por instrumento, previsões e relatórios, criptografia e retirada da biometria. Base: commit 9734c36, versão 2.3.0 publicada. Não foi utilizado o build 2.1 anterior para evitar regressão.

## Correções realizadas
- Escala de louvor: formulário enviava instrument_role, mas API exigia instrument; confirmação também usava contador inexistente. Contrato corrigido e criação conferida no navegador local.
- Ministérios: escopo agora limita consultas e também verifica o registro original ao editar. Aprovação não concede consulta irrestrita automaticamente.
- Finance: reenvio de borderô não duplica receita; conferentes devem ser diferentes; alteração da receita vinculada tem histórico; liquidação repetida é idempotente.
- Previsão: considera vencimentos nos horizontes de 30, 60 e 90 dias; busca e limite visual não alteram o resumo. Indicativa de compromissos cadastrados, sem API bancária e sem promessa de inteligência preditiva validada.
- Exportação Excel: arquivo XLSX real, com texto tratado como texto. Filtros de conta/banco aplicados às contas e borderôs; datas inválidas/invertidas rejeitadas.
- Push: usuários de outros setores podem assinar Web Push; avisos de candidaturas não dependem de Kids e direcionam ao portal do membro. Conteúdo externo permanece genérico. Atualização de avisos sem reconstruir formulários abertos.
- Privacidade: endereço e notas sensíveis cifrados, incluindo históricos e registros anteriores pela migração aditiva. Retirada a alegação incorreta de criptografia ponta a ponta.
- Inicialização: catálogo oficial sem sobrescrever edições em cada reinício. Retirada limpeza automática baseada em nomes, que poderia apagar dados reais ou romper referências.
- Kids: cadastro/comparação facial desativados na API; preservados descarte de descritor e revogação de consentimento. Operação por QR continua.
- Administração geral e pastoral operam Kids mesmo com perfil legado de responsável; gestão global de identidades permanece exclusiva da TI.
- Visual: retirados banners promocionais, descrições repetidas, tags e emojis redundantes; ações curtas, integração em painel recolhível, GCs sem vitrine duplicada na administração, emblemas com dimensão fixa e banners sem corte da arte. Ajustes de quebra no cabeçalho e grades móveis.

## Limites e pendências reais
Integração com bancos não existe; contas são manuais. Push em Android/iOS físicos e instalação PWA precisam de testes nos aparelhos; iPhone exige versão compatível e instalação na tela inicial. SMTP, OAuth Google, APNs e domínio próprio dependem de configuração. Não há certificação de 1–10 mil usuários simultâneos. O checklist não comprova ausência absoluta de falhas: cobre testes automatizados, inspeção de código, formulários locais, imagens e dimensões móveis. Nenhum cadastro fictício novo foi criado no servidor.
