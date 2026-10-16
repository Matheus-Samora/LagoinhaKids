import QRCode from 'qrcode';

export const SECTOR_EMBLEMS = {
  systems: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-emblem">
    <defs><linearGradient id="g-sys" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#18181b"/><stop offset="100%" stop-color="#3f3f46"/></linearGradient></defs>
    <rect width="48" height="48" rx="14" fill="url(#g-sys)"/>
    <path d="M24 9L36 14V23C36 31.5 30.8 37.8 24 40C17.2 37.8 12 31.5 12 23V14L24 9Z" stroke="#fafafa" stroke-width="2.2" fill="rgba(255,255,255,0.08)"/>
    <circle cx="24" cy="24" r="4" fill="#fbbf24"/>
    <path d="M24 15V18M24 30V33M16 24H19M29 24H32" stroke="#fafafa" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  access: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-emblem">
    <defs><linearGradient id="g-acc" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#09090b"/><stop offset="100%" stop-color="#27272a"/></linearGradient></defs>
    <rect width="48" height="48" rx="14" fill="url(#g-acc)"/>
    <rect x="11" y="11" width="11" height="11" rx="3" stroke="#fbbf24" stroke-width="2.2" fill="rgba(251,191,36,0.15)"/>
    <rect x="26" y="11" width="11" height="11" rx="3" stroke="#fafafa" stroke-width="2"/>
    <rect x="11" y="26" width="11" height="11" rx="3" stroke="#fafafa" stroke-width="2"/>
    <circle cx="31.5" cy="31.5" r="5.5" stroke="#fbbf24" stroke-width="2.2"/>
  </svg>`,
  members: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-emblem">
    <defs><linearGradient id="g-mem" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#064e3b"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs>
    <rect width="48" height="48" rx="14" fill="url(#g-mem)"/>
    <circle cx="19" cy="18" r="4.5" stroke="#ecfdf5" stroke-width="2.2" fill="rgba(255,255,255,0.12)"/>
    <circle cx="30" cy="19.5" r="3.5" stroke="#6ee7b7" stroke-width="2"/>
    <path d="M11 35C11 29.8 14.6 26.5 19 26.5C23.4 26.5 27 29.8 27 35" stroke="#ecfdf5" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M26.5 34.5C27.2 30.8 29.8 28.5 33 28.5C35.8 28.5 38 30.4 38.5 34.5" stroke="#6ee7b7" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,
  ministries: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-emblem">
    <defs><linearGradient id="g-min" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#311042"/><stop offset="100%" stop-color="#6b21a8"/></linearGradient></defs>
    <rect width="48" height="48" rx="14" fill="url(#g-min)"/>
    <path d="M24 10C27.5 16 33 19.5 33 26.5C33 31.8 28.9 36 24 36C19.1 36 15 31.8 15 26.5C15 19.5 20.5 16 24 10Z" stroke="#f3e8ff" stroke-width="2.2" fill="rgba(233,213,255,0.14)"/>
    <path d="M24 19L25.8 23.8L30.5 25.5L25.8 27.2L24 32L22.2 27.2L17.5 25.5L22.2 23.8L24 19Z" fill="#facc15"/>
  </svg>`,
  finance: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-emblem">
    <defs><linearGradient id="g-fin" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient></defs>
    <rect width="48" height="48" rx="14" fill="url(#g-fin)"/>
    <path d="M12 34H36" stroke="#93c5fd" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="14" y="24" width="4.5" height="10" rx="1.5" fill="#60a5fa"/>
    <rect x="21.75" y="19" width="4.5" height="15" rx="1.5" fill="#93c5fd"/>
    <rect x="29.5" y="13" width="4.5" height="21" rx="1.5" fill="#fbbf24"/>
    <path d="M14 20L22 15L28 17L35 11" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  kids: `<span class="kids-native-badge" aria-hidden="true">🧒</span>`
};

export const MINISTRY_META = {
  'Music': {
    tagline: 'Louvor & Adoração Musical',
    description: 'Conduz a igreja em adoração através da música, banda, vocais e direção musical nos cultos e conferências.',
    roles: ['Ministro de Louvor', 'Vocal / Backing Vocal', 'Tecladista', 'Baterista', 'Guitarrista', 'Violonista', 'Baixista', 'Cordas / Sopros', 'Diretor Musical', 'VS / Tracks'],
    accent: '#7c3aed',
    bannerUrl: '/ministries/music.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/music.webp" alt="Ministério Music" loading="lazy"/></div>`
  },
  'Intercessão': {
    tagline: 'Clamor, Vigília & Cobertura Espiritual',
    description: 'Sustenta a igreja, famílias, pastores e cultos em oração contínua, intercessão profética e aconselhamento.',
    roles: ['Intercessor(a) de Culto', 'Torre de Oração', 'Líder de Turno', 'Aconselhamento de Altar'],
    accent: '#b45309',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-inter" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#78350f"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-inter)"/><path d="M24 11C28 17 32 21 32 27C32 31.5 28.4 35 24 35C19.6 35 16 31.5 16 27C16 21 20 17 24 11Z" fill="rgba(254,243,199,0.2)" stroke="#fef3c7" stroke-width="2.2"/><path d="M24 18C26 21.5 27.5 23.5 27.5 26.8C27.5 29 25.9 30.8 24 30.8C22.1 30.8 20.5 29 20.5 26.8C20.5 23.5 22 21.5 24 18Z" fill="#fbbf24"/></svg>`
  },
  'Hero': {
    tagline: 'Ministério de Homens & Crescimento Espiritual',
    description: 'Fortalecimento espiritual de homens, sacerdócio bíblico no lar, comunhão e mentoria cristã para o crescimento com Deus.',
    roles: ['Integrante Hero', 'Líder de Homens', 'Mentoria Espiritual', 'Apoio aos Encontros'],
    accent: '#1e293b',
    bannerUrl: '/ministries/hero.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/hero.webp" alt="Ministério Hero" loading="lazy"/></div>`
  },
  'Shine': {
    tagline: 'Grupo de Mulheres & Crescimento Espiritual',
    description: 'Grupo de mulheres para crescimento espiritual e comunhão entre as mulheres.',
    roles: ['Voluntária Shine', 'Comunhão & Discipulado', 'Recepção Feminina', 'Organização de Encontros'],
    accent: '#be185d',
    bannerUrl: '/ministries/shine.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/shine.webp" alt="Ministério Shine" loading="lazy"/></div>`
  },
  'Bem Casados': {
    tagline: 'Família, Casais & Aliança',
    description: 'Fortalecimento de casamentos, cursos para noivos e casais, encontros familiares e mentoria conjugal.',
    roles: ['Casal Mentor', 'Apoio em Cursos de Casais', 'Organização de Encontros', 'Acolhimento Familiar'],
    accent: '#0f766e',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-casados" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#134e4a"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-casados)"/><circle cx="20" cy="25" r="7.5" stroke="#fde047" stroke-width="2.4"/><circle cx="28" cy="25" r="7.5" stroke="#ccfbf1" stroke-width="2.4"/><path d="M24 12L26 14.5L24 17L22 14.5L24 12Z" fill="#fde047"/></svg>`
  },
  'Rocket': {
    tagline: 'Ministério de Adolescentes (Teens)',
    description: 'Desperta uma geração de adolescentes apaixonados por Jesus com cultos vibrantes, GCs, acampamentos e discipulado.',
    roles: ['Líder / Conselheiro Rocket', 'Louvor Rocket', 'Mídia & Criativo Rocket', 'Recreação & Eventos'],
    accent: '#ea580c',
    bannerUrl: '/ministries/rocket.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/rocket.webp" alt="Ministério Rocket" loading="lazy"/></div>`
  },
  'Legacy': {
    tagline: 'Ministério de Jovens',
    description: 'Movimento de jovens vocacionados a viver o Evangelho com intensidade nas universidades, trabalho e sociedade.',
    roles: ['Voluntário Legacy', 'Conector de Jovens', 'Produção & Louvor Legacy', 'Líder de GC Jovem'],
    accent: '#4338ca',
    bannerUrl: '/ministries/legacy.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/legacy.webp" alt="Ministério Legacy" loading="lazy"/></div>`
  },
  'Kids': {
    tagline: 'Ministério Infantil Lagoinha Kids',
    description: 'Ensina a Palavra de Deus às crianças com amor, excelência pedagógica e segurança total para as famílias.',
    roles: ['Professor(a) Kids', 'Monitor(a) de Turma', 'Check-in & Recepção Kids', 'Louvor & Teatro Infantil'],
    accent: '#16a34a',
    bannerUrl: '/ministries/kids.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/kids.webp" alt="Ministério Kids" loading="lazy"/></div>`
  },
  'Manutenção': {
    tagline: 'Infraestrutura, Zeladoria & Engenharia',
    description: 'Cuida da casa de Deus mantendo instalações elétricas, acústicas, climatização e estrutura sempre impecáveis.',
    roles: ['Técnico / Eletricista', 'Manutenção Geral', 'Climatização & Estrutura', 'Apoio Logístico'],
    accent: '#475569',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-manut" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#475569"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-manut)"/><circle cx="24" cy="24" r="6.5" stroke="#f1f5f9" stroke-width="2.4"/><path d="M24 12V15M24 33V36M12 24H15M33 24H36M15.5 15.5L17.8 17.8M30.2 30.2L32.5 32.5M32.5 15.5L30.2 17.8M17.8 30.2L15.5 32.5" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/></svg>`
  },
  'Voluntário': {
    tagline: 'Recepção, Hospitalidade & Serviço',
    description: 'O primeiro sorriso da igreja: acolhe membros e visitantes nas portas, auditório, corredores e ações sociais.',
    roles: ['Recepção de Porta', 'Organização de Auditório', 'Boas-Vindas', 'Apoio Geral nos Cultos'],
    accent: '#0284c7',
    bannerUrl: '/ministries/voluntario.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/voluntario.webp" alt="Ministério Voluntário" loading="lazy"/></div>`
  },
  'Follow': {
    tagline: 'Mídia, Fotografia & Gravações',
    description: 'Ministério de mídia da igreja, responsável pelas postagens, fotos e gravações.',
    roles: ['Fotógrafo(a)', 'Filmagem / Gravação', 'Social Media / Postagens', 'Design & Criativo', 'Transmissão Ao Vivo'],
    accent: '#059669',
    bannerUrl: '/ministries/follow.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/follow.webp" alt="Ministério Follow" loading="lazy"/></div>`
  },
  'Link': {
    tagline: 'Grupo de Adolescentes da Igreja',
    description: 'Ministério dedicado aos adolescentes da igreja, promovendo discipulado, encontros, comunhão e crescimento espiritual.',
    roles: ['Líder de Adolescentes', 'Conselheiro(a) Teen', 'Louvor & Dinâmicas', 'Acolhimento Teen'],
    accent: '#2563eb',
    bannerUrl: '/ministries/link.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/link.webp" alt="Ministério Link" loading="lazy"/></div>`
  },
  'Future': {
    tagline: 'Mesa de Som, Áudio & Iluminação',
    description: 'Responsável pela mesa de som de P.A., áudio de palco, mixagem, iluminação cênica e suporte técnico dos cultos.',
    roles: ['Operador(a) de Som (Mesa P.A.)', 'Técnico de Monitor / Palco', 'Iluminação Cênica', 'Mixagem de Áudio'],
    accent: '#0891b2',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-future" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#0891b2"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-future)"/><path d="M15 13V35M24 13V35M33 13V35" stroke="#a1a1aa" stroke-width="2.2" stroke-linecap="round"/><rect x="12" y="19" width="6" height="4" rx="1.5" fill="#38bdf8"/><rect x="21" y="26" width="6" height="4" rx="1.5" fill="#fbbf24"/><rect x="30" y="16" width="6" height="4" rx="1.5" fill="#4ade80"/></svg>`
  },
  'Gourmet': {
    tagline: 'Cozinha da Igreja & Gastronomia',
    description: 'Equipe dedicada ao trabalho na cozinha da igreja, refeições, cantina, café pós-culto e comunhão à mesa.',
    roles: ['Cozinheiro(a)', 'Auxiliar de Cozinha', 'Café & Cantina', 'Organização de Cozinha'],
    accent: '#b91c1c',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-gourmet" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#7f1d1d"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-gourmet)"/><path d="M15 22H31V27C31 31.4 27.4 35 23 35C18.6 35 15 31.4 15 27V22Z" stroke="#fee2e2" stroke-width="2.2" fill="rgba(254,226,226,0.15)"/><path d="M31 24H33.5C35.2 24 36.5 25.3 36.5 27C36.5 28.7 35.2 30 33.5 30H31" stroke="#fecaca" stroke-width="2.2"/><path d="M19 17V14M23 17V13M27 17V14" stroke="#fde047" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  'Champions': {
    tagline: 'Saúde, Esportes, Lazer & Comunhão',
    description: 'Ministério voltado para saúde e lazer da igreja, com esportes, atividades físicas e comunhão.',
    roles: ['Líder Esportivo / Treinos', 'Organização de Atividades Físicas', 'Eventos de Lazer & Torneios', 'Comunhão & Acolhimento'],
    accent: '#ca8a04',
    bannerUrl: '/ministries/champions.webp',
    emblem: `<div class="ministry-svg-emblem ministry-art-emblem"><img src="/ministries/champions.webp" alt="Ministério Champions" loading="lazy"/></div>`
  },
  'DNA': {
    tagline: 'Escola de Discipulado & Integração',
    description: 'Ensina a identidade cristã, visão da Igreja Batista da Lagoinha, preparação para o batismo e formação de discípulos.',
    roles: ['Professor(a) Trilha DNA', 'Monitor(a) de Turma DNA', 'Equipe de Batismo', 'Secretaria DNA'],
    accent: '#9333ea',
    emblem: `<svg viewBox="0 0 48 48" fill="none" class="ministry-svg-emblem"><defs><linearGradient id="m-dna" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#3b0764"/><stop offset="100%" stop-color="#9333ea"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#m-dna)"/><path d="M16 12C16 20 32 20 32 28C32 32 28 35 24 36M32 12C32 20 16 20 16 28C16 32 20 35 24 36" stroke="#f3e8ff" stroke-width="2.2" stroke-linecap="round"/><path d="M18 16H30M18 24H30M18 31H30" stroke="#facc15" stroke-width="2" stroke-linecap="round"/></svg>`
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
        <div>
          <span class="pill" style="margin-bottom:6px;">📲 DOWNLOAD & INSTALAÇÃO OFICIAL</span>
          <h2 style="margin:0;">Baixar App Lagoinha no Celular</h2>
        </div>
        <button type="button" class="secondary" id="close-app-qr-btn">Fechar</button>
      </div>
      <p class="subtle" style="margin-top:0;">Aponte a câmera do seu celular para o QR Code abaixo ou toque nos botões para baixar e instalar diretamente.</p>
      <div class="qr-cards-grid">
        <article class="qr-download-card">
          <span class="badge">🌐 App Web / iOS & Android (PWA)</span>
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code Portal Lagoinha" class="qr-code-img"/>` : ''}
          <strong>Acesso Direto & Área de Membros</strong>
          <small>Escaneie para abrir a Área de Membros, GCs, Ministérios e Kids e instalar na tela inicial.</small>
          <a class="button" href="${appUrl}" target="_blank" rel="noopener" style="width:100%;margin-top:8px;">Abrir Portal no Aparelho</a>
        </article>
        <article class="qr-download-card">
          <span class="badge" style="background:#09090b;color:#fff;">🤖 Instalador Nativo Android (APK)</span>
          ${qrApkDataUrl ? `<img src="${qrApkDataUrl}" alt="QR Code APK Android" class="qr-code-img"/>` : ''}
          <strong>Download Direto do Aplicativo (.APK)</strong>
          <small>Escaneie com um celular Android ou toque abaixo para baixar o instalador oficial.</small>
          <a class="button" href="/download/lagoinha-kids.apk" download="lagoinha-kids.apk" style="width:100%;margin-top:8px;">📥 Baixar Aplicativo Android</a>
        </article>
      </div>
    </div>
  `;
  dlg.querySelector('#close-app-qr-btn').onclick = () => dlg.close();
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  dlg.showModal();
}
