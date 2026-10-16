// Branched Menu Micro-Interaction Component
// Inspired by React Bits by David Haz (https://reactbits.dev/micro/branched-menu)
// Collapsible menu that branches each section from a central trunk and traces an animated SVG line to the active pick.

const PAD = 6;
const MARK = 16;
const TRUNK = 14;
const INDENT = 40;
const RADIUS = 10;
const ROW_HEIGHT = 38;

export function createBranchedMenu(container, options = {}) {
  if (!container) return null;

  const config = {
    items: options.items || [],
    defaultOpen: options.defaultOpen ?? 0,
    defaultActive: options.defaultActive || '',
    onSelect: options.onSelect || null,
    width: options.width || 270,
    rowHeight: options.rowHeight || ROW_HEIGHT,
    indent: options.indent || INDENT,
    trunk: options.trunk || TRUNK,
    radius: options.radius || RADIUS,
    lineWidth: options.lineWidth || 1.8,
    drawDuration: options.drawDuration || 400,
    foldDuration: options.foldDuration || 300,
    ...options
  };

  const openSet = new Set(Array.isArray(config.defaultOpen) ? config.defaultOpen : [config.defaultOpen]);
  let activeValue = config.defaultActive;
  if (!activeValue) {
    const firstSec = config.items[0];
    activeValue = firstSec?.children?.[0]?.value || firstSec?.value || '';
  }

  container.className = 'branched-menu ' + (options.className || '');
  container.style.setProperty('--bm-w', `${config.width}px`);
  container.style.setProperty('--bm-row', `${config.rowHeight}px`);
  container.style.setProperty('--bm-indent', `${config.indent}px`);
  container.style.setProperty('--bm-line-w', String(config.lineWidth));
  container.style.setProperty('--bm-draw', `${config.drawDuration}ms`);
  container.style.setProperty('--bm-fold', `${config.foldDuration}ms`);

  const marker = document.createElement('span');
  marker.className = 'branched-menu__marker';
  marker.setAttribute('aria-hidden', 'true');
  container.appendChild(marker);

  const headElements = [];
  const reachPaths = [];

  const r = Math.min(config.radius, config.rowHeight / 2 - 2);
  const endX = config.indent - 8;
  const rowY = k => PAD + k * config.rowHeight + config.rowHeight / 2;
  const branchPathD = k => `M ${config.trunk} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${config.trunk + r} ${rowY(k)} H ${endX}`;
  const reachPathD = k => `M ${config.trunk} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${config.trunk + r} ${rowY(k)} H ${endX}`;
  const pathLength = k => rowY(k) - r + (Math.PI * r) / 2 + (endX - config.trunk - r);

  function render() {
    // Clear sections except marker
    Array.from(container.children).forEach(ch => {
      if (ch !== marker) ch.remove();
    });
    headElements.length = 0;
    reachPaths.length = 0;

    config.items.forEach((section, sIndex) => {
      const secDiv = document.createElement('div');
      secDiv.className = 'branched-menu__section';
      const isOpen = section.children ? openSet.has(sIndex) : false;
      if (isOpen) secDiv.setAttribute('data-open', '');

      // Section Header Button
      const headBtn = document.createElement('button');
      headBtn.type = 'button';
      headBtn.className = 'branched-menu__head';
      headBtn.innerHTML = `<span>${section.icon ? `<span class="branched-menu__head-icon">${section.icon}</span> ` : ''}${escapeHtml(section.label)}</span>${section.badge ? `<span class="badge" style="font-size:10px;padding:1px 6px;">${escapeHtml(section.badge)}</span>` : ''}`;
      if (section.children) {
        headBtn.setAttribute('aria-expanded', String(isOpen));
      }

      headBtn.addEventListener('click', () => {
        if (section.children) {
          if (openSet.has(sIndex)) openSet.delete(sIndex);
          else openSet.add(sIndex);
          render();
          placeMarker();
        } else {
          selectItem(section.value || section.label, section);
        }
      });

      headElements[sIndex] = headBtn;
      secDiv.appendChild(headBtn);

      // Section Children Body
      if (section.children && section.children.length) {
        const bodyH = PAD * 2 + section.children.length * config.rowHeight;
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'branched-menu__body';

        const foldDiv = document.createElement('div');
        foldDiv.className = 'branched-menu__fold';

        const treeDiv = document.createElement('div');
        treeDiv.className = 'branched-menu__tree';
        treeDiv.style.height = `${bodyH}px`;

        // SVG lines
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'branched-menu__lines');
        svg.setAttribute('width', String(config.indent));
        svg.setAttribute('height', String(bodyH));
        svg.setAttribute('aria-hidden', 'true');

        // Main trunk line for this section
        const baseTrunk = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        baseTrunk.setAttribute('class', 'branched-menu__base');
        baseTrunk.setAttribute('d', `M ${config.trunk} 0 V ${rowY(section.children.length - 1) - r}`);
        svg.appendChild(baseTrunk);

        // Branch connectors to each child
        section.children.forEach((kid, k) => {
          const bPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          bPath.setAttribute('class', 'branched-menu__base');
          bPath.setAttribute('d', branchPathD(k));
          svg.appendChild(bPath);

          const rPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          rPath.setAttribute('class', 'branched-menu__reach');
          rPath.setAttribute('d', reachPathD(k));
          const len = pathLength(k);
          rPath.style.strokeDasharray = String(len);
          rPath.style.strokeDashoffset = kid.value === activeValue ? '0' : String(len);
          svg.appendChild(rPath);
          reachPaths.push({ value: kid.value, path: rPath, len });
        });

        treeDiv.appendChild(svg);

        // Child item buttons
        section.children.forEach(kid => {
          const itemBtn = document.createElement('button');
          itemBtn.type = 'button';
          itemBtn.className = 'branched-menu__item';
          if (kid.value === activeValue) {
            itemBtn.setAttribute('data-active', '');
            itemBtn.setAttribute('aria-current', 'true');
          }
          itemBtn.tabIndex = isOpen ? 0 : -1;
          itemBtn.innerHTML = `
            ${kid.icon ? `<span class="branched-menu__icon">${kid.icon}</span>` : ''}
            <span class="branched-menu__label">${escapeHtml(kid.label)}</span>
            ${kid.pill ? `<span class="badge mini-pill">${escapeHtml(kid.pill)}</span>` : ''}
          `;

          itemBtn.addEventListener('click', () => {
            selectItem(kid.value, kid);
          });

          treeDiv.appendChild(itemBtn);
        });

        foldDiv.appendChild(treeDiv);
        bodyDiv.appendChild(foldDiv);
        secDiv.appendChild(bodyDiv);
      }

      container.appendChild(secDiv);
    });

    placeMarker();
  }

  function selectItem(val, item) {
    activeValue = val;
    // Update active attributes
    container.querySelectorAll('.branched-menu__item').forEach(btn => {
      btn.removeAttribute('data-active');
      btn.removeAttribute('aria-current');
    });

    const activeItemBtn = Array.from(container.querySelectorAll('.branched-menu__item')).find(btn => {
      return btn.textContent.trim().includes(item.label);
    });
    if (activeItemBtn) {
      activeItemBtn.setAttribute('data-active', '');
      activeItemBtn.setAttribute('aria-current', 'true');
    }

    // Update reach paths dashoffset
    reachPaths.forEach(entry => {
      entry.path.style.strokeDashoffset = entry.value === activeValue ? '0' : String(entry.len);
    });

    placeMarker();
    config.onSelect?.(val, item);
  }

  function placeMarker() {
    const activeSectionIndex = config.items.findIndex(s => {
      if (s.value === activeValue) return true;
      return s.children?.some(kid => kid.value === activeValue);
    });

    if (activeSectionIndex >= 0 && headElements[activeSectionIndex]) {
      const headEl = headElements[activeSectionIndex];
      marker.style.top = `${headEl.offsetTop + (headEl.offsetHeight - MARK) / 2}px`;
      marker.setAttribute('data-on', '');
    } else {
      marker.removeAttribute('data-on');
    }
  }

  render();

  return {
    select: selectItem,
    openSection(idx) {
      openSet.add(idx);
      render();
    },
    closeSection(idx) {
      openSet.delete(idx);
      render();
    },
    destroy() {
      container.innerHTML = '';
    }
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Global modal drawer launcher for Branched Navigation
export function openBranchedNavigationDrawer(options = {}) {
  let dlg = document.getElementById('branched-nav-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'branched-nav-dialog';
    dlg.className = 'branched-nav-dialog';
    document.body.appendChild(dlg);
  }

  const items = options.items || [
    {
      label: 'Área do Membro',
      icon: '🏠',
      badge: 'Geral',
      children: [
        { value: '/membro#showcase-gcs', label: 'Banners Oficiais de GCs', icon: '🎨' },
        { value: '/membro#ministries-list', label: 'Candidaturas a Ministérios', icon: '🤝' },
        { value: '/membro#announcements-mural', label: 'Mural de Comunicados', icon: '📢' },
        { value: '/membro#my-apps', label: 'Minhas Inscrições', icon: '📋' }
      ]
    },
    {
      label: 'Lagoinha Kids',
      icon: '🧒',
      badge: 'Operação',
      children: [
        { value: '/kids#overview', label: 'Painel & Chamada', icon: '📊' },
        { value: '/kids#attendance', label: 'Check-in por QR Code', icon: '📱' },
        { value: '/kids#children', label: 'Alunos & Famílias', icon: '👶' },
        { value: '/kids#rooms', label: 'Salinhas & Turmas', icon: '🚪' },
        { value: '/kids#lessons', label: 'Aulinhas & Roteiros', icon: '📖' },
        { value: '/kids#team', label: 'Professores & Monitores', icon: '👥' }
      ]
    },
    {
      label: 'Louvor & Ministérios',
      icon: '🎵',
      badge: '16 Áreas',
      children: [
        { value: '/ministries#scale', label: 'Escala do Louvor por Função', icon: '🎸' },
        { value: '/ministries#music', label: 'Ministério Music', icon: '🎹' },
        { value: '/ministries#future', label: 'Future (Som & Luz)', icon: '🎚️' },
        { value: '/ministries#follow', label: 'Follow (Mídia & Fotos)', icon: '📸' },
        { value: '/ministries#shine', label: 'Shine (Mulheres)', icon: '✨' },
        { value: '/ministries#champions', label: 'Champions (Esportes)', icon: '🏆' },
        { value: '/ministries#hero', label: 'Hero (Homens)', icon: '🛡️' }
      ]
    },
    {
      label: 'Membros & GCs',
      icon: '🌿',
      badge: 'Células',
      children: [
        { value: '/members#cells', label: '8 GCs Oficiais', icon: '📍' },
        { value: '/members#discipleship', label: 'Jornada & Batismo', icon: '🕊️' },
        { value: '/members#records', label: 'Dados Criptografados', icon: '🔒' }
      ]
    },
    {
      label: 'Financeiro',
      icon: '💼',
      badge: 'Motor BI',
      children: [
        { value: '/finance#forecast', label: 'Previsões 30/60/90d', icon: '📈' },
        { value: '/finance#bordero', label: 'Borderô com Dupla Conferência', icon: '🧾' },
        { value: '/finance#reports', label: 'Exportação Excel & PDF', icon: '📊' }
      ]
    },
    {
      label: 'Governança & TI',
      icon: '⚙️',
      badge: 'Admin',
      children: [
        { value: '/systems#users', label: 'Usuários Centrais & Pastores', icon: '👤' },
        { value: '/systems#audit', label: 'Trilha de Auditoria Global', icon: '🛡️' },
        { value: '/systems#backup', label: 'Exportar Backup JSON', icon: '💾' }
      ]
    }
  ];

  dlg.innerHTML = `
    <div class="branched-drawer-content">
      <div class="branched-drawer-header">
        <div>
          <span class="eyebrow" style="color:var(--bm-accent,#f59e0b);">NAVEGADOR EM ÁRVORE · REACT BITS</span>
          <h2 style="margin:2px 0 0;font-size:18px;">Navegação Rápida</h2>
        </div>
        <button type="button" class="secondary" id="close-branched-drawer" style="padding:6px 12px;font-size:12px;">Fechar ✕</button>
      </div>
      <div id="branched-drawer-tree-mount" style="padding:8px 0 16px;"></div>
    </div>
  `;

  const mountEl = dlg.querySelector('#branched-drawer-tree-mount');
  createBranchedMenu(mountEl, {
    items,
    defaultOpen: 0,
    width: 320,
    onSelect(val) {
      dlg.close();
      if (val.startsWith('/') || val.startsWith('#')) {
        window.location.href = val;
      }
    }
  });

  dlg.querySelector('#close-branched-drawer').onclick = () => dlg.close();
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  dlg.showModal();
}
