# Ícones Lagoinha Systems — 2.4.2

Redesenho SVG dos 30 símbolos aprovados na prancha: zinco, âmbar, traço 2 px, terminais arredondados, dimensões 24×24 e fundo transparente. Não recortamos o PNG: os desenhos são vetoriais e permanecem nítidos em telas de alta densidade.

## Aplicação

- TI: escudo; área do membro: crachá; Kids: criança; Members: comunidade; Ministries: chama; Finance: gráfico.
- Navegação: início, comunicados, GCs, famílias, louvor, escalas, equipes e materiais.
- Financeiro: lançamentos, fechamento do culto, contas, centros de custo e notas fiscais.
- Acessos: cadeado. Kids: turmas, relógio de aulinhas, avisos, leitor QR, impressora de etiquetas, totem, saúde, câmera, anexos e saída.

O logo oficial, as fotos e os banners dos ministérios permanecem. SVGs decorativos possuem aria-hidden e focusable=false; nomes dos controles permanecem visíveis ou identificados por rótulos. O contorno herda a cor do texto para funcionar em tema escuro e em botões de cor invertida. Âmbar é um detalhe visual, sem carregar informação sozinho.

## Fontes e exportação

- src/ui/icons.js: catálogo único e mapeamento semântico, compartilhado por Kids e Systems.
- src/ui/icons.css: tamanhos, alinhamento e comportamento de contraste.
- public/icons/lagoinha/: os 30 SVGs independentes e manifest.json com nomes e áreas.
- docs/design/icon-gallery.html: catálogo local para revisão.

Validação: build de produção; XML e unicidade dos 30 SVGs; revisão dos menus e das áreas em ambiente com dados descartáveis. Nenhuma regra de negócio, permissão ou dado pessoal é alterado por este redesign.
