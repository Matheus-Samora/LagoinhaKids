# Relatório Geral de Ícones & Prompt Único para Magnific IA

Este documento reúne:
1. **O inventário completo de todos os 40 ícones do aplicativo** (separando o que hoje já é SVG no *Lagoinha Kids* e o que ainda está como emoji provisório nos menus laterais de *Membros*, *Ministérios*, *Financeiro* e *TI*).
2. **O Redesign Escrito de cada ícone** (seguindo a identidade visual **Monocromática Minimalista da Lagoinha**: traços geométricos limpos, cantos arredondados suaves, alto contraste em Preto/Grafite `#09090B` e Branco `#FAFAFA`, com toque sutil de Âmbar/Dourado `#F59E0B`).
3. **O Prompt Único Unificado (em Português e em Inglês)** pronto para copiar e colar no **Gerador de Ícones da Magnific IA**.

---

## Recomendação de Seleção na Tela da Magnific IA
Na tela da Magnific IA (**Gerador de ícones com IA**):
* **Para ícones de menu lateral, barra inferior e botões:** selecione a opção **`Outline`** (ou **`Flat`** se quiser preenchimento suave).
* **Para os emblemas principais dos 6 Setores:** selecione **`Solid`** ou **`Color`**.

---

## Parte 1 — Relatório de Todos os 40 Ícones do Aplicativo e Redesign Escrito

### Grupo A: Emblemas dos 6 Setores Principais (`src/platform/emblems.js`)

| # | Ícone / Setor | Como está hoje | Onde aparece | Redesign Escrito (Novo Conceito Visual) |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Lagoinha Systems (TI)** | SVG Escudo simples | Menu de setores / Painel TI | Escudo octogonal minimalista com núcleo luminoso central e quatro conexões simétricas representando segurança e controle central. |
| **2** | **Área do Membro** | Emoji `👤` / Grade SVG | Menu lateral / Portal | Crachá de identificação moderno com silhueta humana geométrica minimalista e estrela sutil de pertencimento. |
| **3** | **Lagoinha Kids** | Emoji `🧒` | Menu de setores / Topo Kids | Rosto infantil estilizado em linhas curvas contínuas acolhedoras com uma pequena estrela de quatro pontas (✦) acima. |
| **4** | **Lagoinha Members** | Emoji `🏠` / SVG Duplo | Menu de setores / Cards | Duas silhuetas humanas integradas sob um arco protetor geométrico representando comunhão, família e igreja. |
| **5** | **Lagoinha Ministries** | Emoji `🎵` / SVG Chama | Menu de setores / Cards | Chama estilizada em linhas geométricas fluidas com uma faísca estelar central simbolizando serviço, dons e adoração. |
| **6** | **Lagoinha Finance** | Emoji `💼` / SVG Barras | Menu de setores / Cards | Três barras ascendentes minimalistas com cantos arredondados e uma linha de evolução com ponto de destaque no topo. |

---

### Grupo B: Navegação dos Menus Laterais e Barra Inferior (`src/platform/main.js` & `src/main.js`)

| # | Nome do Ícone | Como está hoje | Onde aparece | Redesign Escrito (Novo Conceito Visual) |
| :-: | :--- | :--- | :--- | :--- |
| **7** | **Início / Visão Geral (`home`)** | SVG Casa / Emojis `🏠` `📊` | Primeiro item de todos os menus | Casa geométrica minimalista de traço contínuo com porta em arco suave no centro. |
| **8** | **Comunicados / Mural (`announcements`)** | Emoji `📢` | Menu Área do Membro | Megafone moderno minimalista inclinado a 30 graus emitindo duas ondas sonoras curvas limpas. |
| **9** | **GCs / Células (`cells`)** | Emoji `📍` | Menu Membros e Área do Membro | Pino de localização arredondado contendo um pequeno coração ou casa minimalista no centro. |
| **10** | **Famílias (`families`)** | Emoji `🏠` | Menu Membros | Duas figuras adultas e uma figura menor central conectadas por uma linha de base curva contínua. |
| **11** | **Membros / Pessoas (`people`)** | Emoji `👥` / SVG `kids` | Menu Membros e Alunos Kids | Duas silhuetas de busto sobrepostas com proporção áurea e traços limpos arredondados. |
| **12** | **Louvor / Música (`worship`)** | Emoji `🎵` | Menu Ministérios | Colcheia musical dupla moderna combinada com uma pequena onda sonora minimalista. |
| **13** | **Cultos / Escalas (`schedules` / `calendar`)** | Emoji `📅` / SVG `calendar` | Menu Ministérios e Eventos Kids | Calendário quadrado de cantos arredondados com duas argolas superiores e um ponto de confirmação no centro. |
| **14** | **Equipes / Voluntários (`assignments`)** | Emoji `🙌` | Menu Ministérios e Equipe Kids | Duas mãos estilizadas em gesto de acolhimento/serviço formando um escudo circular aberto. |
| **15** | **Materiais / Arquivos (`resources`)** | Emoji `📁` | Menu Ministérios e Aulinhas | Pasta de arquivos moderna com aba arredondada e uma folha sutil saindo da parte superior. |
| **16** | **Lançamentos (`entries`)** | Emoji `💸` | Menu Financeiro | Duas setas opostas horizontais suaves (entrada e saída) dentro de uma moldura circular de fluxo de caixa. |
| **17** | **Fechamento do Culto (`closings`)** | Emoji `📋` | Menu Financeiro | Prancheta executiva minimalista com duas linhas de conferência e um selo de visto (`check`) no canto inferior. |
| **18** | **Contas Bancárias (`accounts`)** | Emoji `🏦` | Menu Financeiro | Fachada clássica estilizada de instituição financeira com três colunas geométricas simples e frontão triangular. |
| **19** | **Centros de Custo (`cost-centers`)** | Emoji `🏷️` | Menu Financeiro | Etiqueta de classificação (tag) inclinada a 45 graus com furo circular perfeito e bordas suaves. |
| **20** | **Faturas / Notas Fiscais (`invoices`)** | Emoji `🧾` | Menu Financeiro | Comprovante vertical com base serrilhada minimalista e símbolo de cifra estilizado no centro. |
| **21** | **Acessos / Permissões (`permissions`)** | Emoji `🔐` | Menu Painel TI | Cadeado fechado moderno com arco espesso e fechadura circular minimalista no centro. |
| **22** | **Turmas / Salinhas (`rooms`)** | SVG 4 quadrados | Menu Kids | Grade modular de quatro blocos quadrados com cantos arredondados, sendo o bloco superior direito destacado. |
| **23** | **Aulinhas / Horários (`clock`)** | SVG Relógio | Menu Kids | Relógio circular minimalista marcando 10h10 com aro contínuo e ponteiros de ponta arredondada. |
| **24** | **Notificações / Avisos (`bell`)** | SVG Sino / Emoji `🔔` | Topo de todas as telas | Sino de contorno elegante com badalo semicircular e um ponto de alerta flutuante no canto superior direito. |

---

### Grupo C: Ações Operacionais, Segurança Infantil e Utilitários (`src/main.js` & `src/school.js`)

| # | Nome do Ícone | Como está hoje | Onde aparece | Redesign Escrito (Novo Conceito Visual) |
| :-: | :--- | :--- | :--- | :--- |
| **25** | **Check-in QR / Scanner (`qrcode`)** | SVG QR Code | Topo Kids / Chamada | Três cantoneiras de leitura óptica enquadrando um código matriz geométrico minimalista no centro. |
| **26** | **Carteirinha Digital (`digital-id`)** | Emoji `🪪` | Cards de alunos e Membros | Cartão horizontal com cantos arredondados mostrando um avatar circular à esquerda e duas linhas de dados à direita. |
| **27** | **Chamar no Telão (`speaker`)** | SVG Alto-falante / `📢` | Chamada de emergência Kids | Alto-falante direcional emitindo duas ondas concêntricas de longo alcance para alerta no auditório. |
| **28** | **Etiqueta Térmica / Imprimir (`print`)** | Emoji `🖨️` / `🏷️` | Modal Carteirinha e Totem | Impressora térmica minimalista expedindo uma etiqueta pareada com código de segurança. |
| **29** | **Modo Totem / Recepção (`totem`)** | Emoji `🖥️` | Visão Geral Kids | Totem vertical de autoatendimento (quiosque touch) com tela iluminada e símbolo de check-in no centro. |
| **30** | **Saúde / Alergia (`health-alert`)** | Emojis `⚠️` `🩺` `💊` | Ficha da criança e chamada | Cruz médica de cantos arredondados dentro de um escudo octogonal suave de proteção à criança. |
| **31** | **Mudar Turma / Transferir (`transfer`)** | Emoji `🔄` | Card do aluno | Duas setas curvas formando um círculo contínuo de transição suave entre salinhas. |
| **32** | **Câmera / Foto de Perfil (`camera`)** | Emoji `📷` / SVG `face` | Upload de foto de aluno/turma | Câmera fotográfica minimalista de traço único com lente circular central e obturador sutil. |
| **33** | **Anexar Arquivo (`attach`)** | Emoji `📎` | Aulinhas e Notas Fiscais | Clipe de papel geométrico vertical com curvas contínuas paralelas. |
| **34** | **Confirmar / Presença (`check`)** | SVG Check | Botões de confirmação e chamada | Selo circular contendo um traço de confirmação (`checkmark`) com ângulo preciso de 45 graus. |
| **35** | **Adicionar / Novo (`plus`)** | SVG Sinal `+` | Todos os botões de cadastro | Cruz simétrica de adição com extremidades arredondadas dentro de um círculo sutil. |
| **36** | **Buscar / Pesquisa (`search`)** | SVG Lupa | Barras de busca | Lupa circular minimalista com cabo curto inclinado a 45 graus. |
| **37** | **Configurações / Opções (`settings`)** | SVG Engrenagem | Minha conta e editar | Engrenagem octogonal limpa com círculo vazado central. |
| **38** | **Baixar / Instalar App (`download`)** | SVG Download | Topo e rodapé | Seta vertical apontando para baixo em direção a uma bandeja horizontal de cantos arredondados. |
| **39** | **Sair / Check-out (`out`)** | SVG Porta + Seta | Botão Sair e Registrar Saída | Porta minimalista semiaberta com seta horizontal apontando para fora. |
| **40** | **Tema Claro / Escuro (`theme`)** | Emojis `☀️` `🌙` | Barra auxiliar de rodapé | Ícone dual combinando meia-lua crescente elegante e raios solares minimalistas. |

---

## Parte 2 — Prompt Único Unificado para a Magnific IA

### Opção 1: Prompt Único Completo em Inglês (Maior Precisão na Magnific IA)

```text
Cohesive minimalist UI icon pack for a modern church management & kids ministry app ("Lagoinha Systems"), Apple HIG & Linear design aesthetic, uniform 2px monoline stroke, smooth rounded corners, geometric precision, high contrast dark zinc (#09090B) on pure clean background with subtle warm amber gold (#F59E0B) accent, flat vector icon grid containing: (1) security shield with glowing core for IT Systems, (2) member ID badge with minimalist person silhouette, (3) happy child face line art with a four-point sparkle star for Kids Ministry, (4) two connected people under a protective arch for Members & Community, (5) geometric flame with inner star for Ministries, (6) ascending rounded bar chart with trend line for Finance, (7) minimalist home house with arched door, (8) angled modern megaphone with soundwaves for Announcements, (9) map location pin with heart inside for Small Groups GC, (10) family trio silhouette, (11) double musical note with soundwave for Worship, (12) rounded calendar with checkmark for Service Schedules, (13) two welcoming hands forming a circle for Volunteers, (14) modern folder with document for Resources, (15) two opposite cashflow arrows in circle for Transactions, (16) clipboard with checkmark for Service Closing, (17) minimalist bank building with three columns, (18) angled price tag for Cost Centers, (19) receipt invoice with serrated edge, (20) modern padlock for Permissions, (21) four-square modular grid for Classrooms, (22) minimalist clock at 10:10 for Lessons, (23) notification bell with alert dot, (24) QR code scanner frame, (25) thermal label printer with security tag, (26) self-service touch totem kiosk, (27) medical cross inside soft shield for Child Health & Allergies, (28) camera lens icon, (29) paperclip attachment, (30) exit door with arrow. Clean vector lines, no 3D clutter, no text labels, uniform padding and stroke weight.
```

---

### Opção 2: Prompt Único Completo em Português

```text
Conjunto coeso de ícones de interface (UI icon pack) minimalistas para aplicativo moderno de gestão de igreja e ministério infantil ("Lagoinha Systems"), estética Apple HIG e Linear, traço contínuo uniforme de 2px, cantos suavemente arredondados, geometria precisa, alto contraste em grafite escuro (#09090B) com toque sutil em dourado âmbar (#F59E0B), estilo vetorial limpo contendo: (1) escudo de segurança com núcleo luminoso para Painel TI, (2) crachá de membro com silhueta humana minimalista, (3) rosto infantil sorridente em linha contínua com estrela de quatro pontas para Lagoinha Kids, (4) duas pessoas conectadas sob um arco para Membros, (5) chama geométrica com estrela central para Ministérios, (6) gráfico de barras ascendentes arredondadas para Financeiro, (7) casa minimalista com porta em arco para Início, (8) megafone moderno com ondas sonoras para Comunicados, (9) pino de mapa com coração central para GCs, (10) silhueta de família unida, (11) nota musical dupla com onda sonora para Louvor, (12) calendário arredondado com check para Escalas e Eventos, (13) duas mãos acolhedoras em círculo para Voluntários, (14) pasta moderna com documento para Materiais, (15) duas setas opostas em círculo para Lançamentos, (16) prancheta com visto de confirmação para Fechamento do Culto, (17) prédio bancário minimalista de três colunas para Contas, (18) etiqueta inclinada para Centros de Custo, (19) nota fiscal estilizada para Faturas, (20) cadeado moderno para Permissões, (21) grade modular de quatro blocos para Turmas, (22) relógio minimalista para Aulinhas, (23) sino de notificação com ponto de alerta, (24) moldura de leitura QR Code, (25) impressora de etiqueta térmica de segurança, (26) totem de autoatendimento, (27) cruz médica dentro de escudo suave para Saúde e Alergias, (28) câmera fotográfica minimalista, (29) clipe de anexo, (30) porta com seta de saída. Traços vetoriais puros, sem textos, sem sombras pesadas, mesma espessura de linha em todos.
```
