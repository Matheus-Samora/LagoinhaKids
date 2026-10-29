import QRCode from 'qrcode';
import {installHelp} from '../install-help.js';

import {uiIcon} from '../ui/icons.js';

export const SECTOR_EMBLEMS = Object.fromEntries(['systems','access','members','ministries','finance','kids'].map(key=>[key,`<span class="custom-emblem ls-sector-emblem">${uiIcon(key,36)}</span>`]));

export const MINISTRY_META = {
  'Music': {
    tagline: 'Louvor & Adoração',
    description: 'Música, banda e vocais nos cultos.',
    roles: ['Ministro de Louvor', 'Vocal / Backing Vocal', 'Tecladista', 'Baterista', 'Guitarrista', 'Violonista', 'Baixista', 'Cordas / Sopros', 'Diretor Musical', 'VS / Tracks'],
    accent: '#7c3aed',
    bannerUrl: '/ministries/music.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/music.webp" alt="Ministério Music" loading="lazy"/></div>`
  },
  'Intercessão': {
    tagline: 'Oração & Vigília',
    description: 'Cobertura espiritual e oração pela igreja.',
    roles: ['Intercessor(a) de Culto', 'Torre de Oração', 'Líder de Turno', 'Aconselhamento de Altar'],
    accent: '#b45309',
    bannerUrl: '/ministries/intercessao.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/intercessao.webp" alt="Ministério Intercessão" loading="lazy"/></div>`
  },
  'Hero': {
    tagline: 'Ministério de Homens',
    description: 'Comunhão e crescimento espiritual para homens.',
    roles: ['Integrante Hero', 'Líder de Homens', 'Mentoria Espiritual', 'Apoio aos Encontros'],
    accent: '#1e293b',
    bannerUrl: '/ministries/hero.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/hero.webp" alt="Ministério Hero" loading="lazy"/></div>`
  },
  'Shine': {
    tagline: 'Grupo de Mulheres',
    description: 'Comunhão e crescimento espiritual para mulheres.',
    roles: ['Voluntária Shine', 'Comunhão & Discipulado', 'Recepção Feminina', 'Organização de Encontros'],
    accent: '#be185d',
    bannerUrl: '/ministries/shine.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/shine.webp" alt="Ministério Shine" loading="lazy"/></div>`
  },
  'Bem Casados': {
    tagline: 'Casais & Família',
    description: 'Fortalecimento de casamentos e famílias.',
    roles: ['Casal Mentor', 'Apoio em Cursos de Casais', 'Organização de Encontros', 'Acolhimento Familiar'],
    accent: '#0f766e',
    bannerUrl: '/ministries/bem-casados.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/bem-casados.webp" alt="Ministério Bem Casados" loading="lazy"/></div>`
  },
  'Rocket': {
    tagline: 'Adolescentes (Teens)',
    description: 'Cultos, GCs e discipulado para adolescentes.',
    roles: ['Líder / Conselheiro Rocket', 'Louvor Rocket', 'Mídia & Criativo Rocket', 'Recreação & Eventos'],
    accent: '#ea580c',
    bannerUrl: '/ministries/rocket.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/rocket.webp" alt="Ministério Rocket" loading="lazy"/></div>`
  },
  'Legacy': {
    tagline: 'Ministério de Jovens',
    description: 'Jovens vivendo o Evangelho em comunhão.',
    roles: ['Voluntário Legacy', 'Conector de Jovens', 'Produção & Louvor Legacy', 'Líder de GC Jovem'],
    accent: '#4338ca',
    bannerUrl: '/ministries/legacy.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/legacy.webp" alt="Ministério Legacy" loading="lazy"/></div>`
  },
  'Kids': {
    tagline: 'Ministério Infantil',
    description: 'Ensino bíblico e cuidado para as crianças.',
    roles: ['Professor(a) Kids', 'Monitor(a) de Turma', 'Check-in & Recepção Kids', 'Louvor & Teatro Infantil'],
    accent: '#16a34a',
    bannerUrl: '/ministries/kids.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/kids.webp" alt="Ministério Kids" loading="lazy"/></div>`
  },
  'Manutenção': {
    tagline: 'Infraestrutura & Zeladoria',
    description: 'Cuidado técnico e estrutura física da igreja.',
    roles: ['Técnico / Eletricista', 'Manutenção Geral', 'Climatização & Estrutura', 'Apoio Logístico'],
    accent: '#475569',
    bannerUrl: '/ministries/manutencao.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/manutencao.webp" alt="Ministério Manutenção" loading="lazy"/></div>`
  },
  'Voluntário': {
    tagline: 'Recepção & Hospitalidade',
    description: 'Acolhimento, recepção e apoio nos cultos.',
    roles: ['Recepção de Porta', 'Organização de Auditório', 'Boas-Vindas', 'Apoio Geral nos Cultos'],
    accent: '#0284c7',
    bannerUrl: '/ministries/voluntario.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/voluntario.webp" alt="Ministério Voluntário" loading="lazy"/></div>`
  },
  'Follow': {
    tagline: 'Mídia & Comunicação',
    description: 'Postagens, fotografia e gravações.',
    roles: ['Fotógrafo(a)', 'Filmagem / Gravação', 'Social Media / Postagens', 'Design & Criativo', 'Transmissão Ao Vivo'],
    accent: '#059669',
    bannerUrl: '/ministries/follow.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/follow.webp" alt="Ministério Follow" loading="lazy"/></div>`
  },
  'Link': {
    tagline: 'Grupo de Adolescentes',
    description: 'Encontros, comunhão e discipulado de adolescentes.',
    roles: ['Líder de Adolescentes', 'Conselheiro(a) Teen', 'Louvor & Dinâmicas', 'Acolhimento Teen'],
    accent: '#2563eb',
    bannerUrl: '/ministries/link.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/link.webp" alt="Ministério Link" loading="lazy"/></div>`
  },
  'Future': {
    tagline: 'Som & Iluminação',
    description: 'Mesa de som, áudio e iluminação dos cultos.',
    roles: ['Operador(a) de Som (Mesa P.A.)', 'Técnico de Monitor / Palco', 'Iluminação Cênica', 'Mixagem de Áudio'],
    accent: '#0891b2',
    bannerUrl: '/ministries/future.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/future.webp" alt="Ministério Future" loading="lazy"/></div>`
  },
  'Gourmet': {
    tagline: 'Cozinha & Comunhão',
    description: 'Cozinha da igreja, refeições e cantina.',
    roles: ['Cozinheiro(a)', 'Auxiliar de Cozinha', 'Café & Cantina', 'Organização de Cozinha'],
    accent: '#b91c1c',
    bannerUrl: '/ministries/gourmet.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/gourmet.webp" alt="Ministério Gourmet" loading="lazy"/></div>`
  },
  'Champions': {
    tagline: 'Saúde, Esportes & Lazer',
    description: 'Esportes, atividades físicas e comunhão.',
    roles: ['Líder Esportivo / Treinos', 'Organização de Atividades Físicas', 'Eventos de Lazer & Torneios', 'Comunhão & Acolhimento'],
    accent: '#ca8a04',
    bannerUrl: '/ministries/champions.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/champions.webp" alt="Ministério Champions" loading="lazy"/></div>`
  },
  'DNA': {
    tagline: 'Discipulado & Integração',
    description: 'Formação cristã, batismo e integração.',
    roles: ['Professor(a) Trilha DNA', 'Monitor(a) de Turma DNA', 'Equipe de Batismo', 'Secretaria DNA'],
    accent: '#9333ea',
    bannerUrl: '/ministries/dna.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/dna.webp" alt="Ministério DNA" loading="lazy"/></div>`
  }
};

export function sectorEmblem(key) {
  return SECTOR_EMBLEMS[key] || SECTOR_EMBLEMS.systems;
}

export function ministryEmblem(name) {
  return MINISTRY_META[name]?.emblem || SECTOR_EMBLEMS.ministries;
}

export async function openAppDownloadQrModal() {
  let dlg = document.getElementById('global-app-qr-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'global-app-qr-dialog';
    dlg.className = 'app-qr-dialog';
    document.body.appendChild(dlg);
  }
  const appUrl = window.location.origin + '/access';
  const apkUrl = window.location.origin + '/download/lagoinha-kids.apk';
  let qrDataUrl = '';
  let qrApkDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(appUrl, { width: 220, margin: 1, color: { dark: '#09090b', light: '#ffffff' } });
    qrApkDataUrl = await QRCode.toDataURL(apkUrl, { width: 220, margin: 1, color: { dark: '#09090b', light: '#ffffff' } });
  } catch {}

  dlg.innerHTML = `
    <div class="sector-modal app-qr-modal-content">
      <div class="section-title" style="margin-bottom:12px;">
        <h2 style="margin:0;">Instalar aplicativo</h2>
        <button type="button" class="secondary" id="close-app-qr-btn">Fechar</button>
      </div>
      <p class="install-guidance">${installHelp({userAgent:navigator.userAgent,platform:navigator.platform,touchPoints:navigator.maxTouchPoints,native:Boolean(window.AndroidNativeApp)})}</p>
      <p class="install-guidance">O portal funciona no celular e no computador. Chamados nativos com toque e tela de atendimento estão disponíveis no APK Android; o site instalado no iPhone não oferece esse mesmo recurso.</p>
      <div class="qr-cards-grid">
        <article class="qr-download-card">
          <span class="badge">🌐 App Web (iOS & Android)</span>
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code Portal Lagoinha" class="qr-code-img"/>` : ''}
          <strong>Acesso Direto</strong>
          <a class="button" href="${appUrl}" target="_blank" rel="noopener" style="width:100%;margin-top:8px;">Abrir Portal</a>
        </article>
        <article class="qr-download-card">
          <span class="badge" style="background:#09090b;color:#fff;">🤖 Android (.APK)</span>
          ${qrApkDataUrl ? `<img src="${qrApkDataUrl}" alt="QR Code APK Android" class="qr-code-img"/>` : ''}
          <strong>Instalador Android</strong>
          <a class="button" href="/download/lagoinha-kids.apk" download="lagoinha-kids.apk" style="width:100%;margin-top:8px;">📥 Baixar APK</a>
        </article>
      </div>
    </div>
  `;
  dlg.querySelector('#close-app-qr-btn').onclick = () => dlg.close();
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  dlg.showModal();
}
