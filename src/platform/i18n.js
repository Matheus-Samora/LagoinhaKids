// Universal Internationalization (i18n) & Dark Mode Engine for Lagoinha Systems & Kids

export const SUPPORTED_LANGS = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' }
];

const TRANSLATIONS = {
  pt: {
    // Navigation & Global
    'nav.systems': 'Painel TI',
    'nav.member': 'Área do Membro',
    'nav.kids': 'Kids',
    'nav.members': 'Membros',
    'nav.ministries': 'Ministérios',
    'nav.finance': 'Financeiro',
    'nav.download_app': 'App QR',
    'nav.notices': 'Avisos',
    'nav.enable_notices': 'Ativar avisos',
    'nav.sign_out': 'Sair',
    'theme.toggle': 'Modo Escuro / Claro',
    'lang.selector': 'Idioma',

    // Member Portal
    'portal.title': 'Área de Membros · Acessos, GCs & Ministérios',
    'portal.my_sectors': 'Minhas Áreas de Gestão Liberadas',
    'portal.my_sectors_sub': 'Toque em Abrir área para entrar diretamente no setor autorizado para seu usuário',
    'portal.welcome_sub': 'Você está na Área de Membros. Inscreva-se abaixo em um GC ou Ministério!',
    'portal.open_sector': 'Abrir área →',
    'portal.my_apps_title': 'Minhas Inscrições em Análise & Histórico',
    'portal.my_apps_sub': 'Acompanhe suas solicitações enviadas para lideranças de GCs e Ministérios',
    'portal.status_approved': 'Aprovado e Integrado',
    'portal.status_pending': 'Aguardando Contato do Líder',
    'portal.status_rejected': 'Encerrado',
    'portal.gc_title': 'Escolha seu GC pelos Banners Oficiais',
    'portal.gc_sub': 'Confira a arte, o endereço e o dia de encontro de cada GC. Toque em Participar deste GC para avisar o líder!',
    'portal.gc_join': 'Quero Participar deste GC →',
    'portal.ministry_title': 'Candidate-se para Servir nos Ministérios da Lagoinha',
    'portal.ministry_sub': 'Cada card possui identidade única. Ao se candidatar, o líder responsável recebe uma notificação imediata para preparar você!',
    'portal.ministry_apply': 'Candidatar-se ao Ministério →',
    'portal.announcements_title': 'Mural de Comunicados & Eventos Oficiais',
    'portal.announcements_sub': 'Avisos e celebrações publicados pela coordenação pastoral e liderança dos setores',
    'portal.new_announcement': '📢 Publicar Comunicado / Evento',
    'portal.all_sectors': 'Todos os Setores',

    // Worship / Ministries
    'worship.create_scale': 'Montar Escala do Louvor',
    'worship.save_scale': 'Salvar Escala Completa do Louvor',
    'worship.role_ministrante': 'Ministrante',
    'worship.role_backing': 'Backing Vocal',
    'worship.role_tecladista': 'Tecladista',
    'worship.role_guitarrista': 'Guitarrista',
    'worship.role_baixista': 'Baixista',
    'worship.role_baterista': 'Baterista',
    'worship.role_extra': 'Músico Extra',

    // Actions
    'action.save': 'Salvar',
    'action.close': 'Fechar',
    'action.add': 'Adicionar',
    'action.edit': 'Editar',
    'action.delete': 'Excluir',
    'action.archive': 'Arquivar',
    'action.search': 'Buscar',
    'action.confirm': 'Confirmar',
    'action.cancel': 'Cancelar',
    'action.reports': 'Relatórios'
  },
  en: {
    // Navigation & Global
    'nav.systems': 'IT Admin',
    'nav.member': 'Member Portal',
    'nav.kids': 'Kids',
    'nav.members': 'Members',
    'nav.ministries': 'Ministries',
    'nav.finance': 'Finance',
    'nav.download_app': 'App QR',
    'nav.notices': 'Notices',
    'nav.enable_notices': 'Enable notifications',
    'nav.sign_out': 'Sign out',
    'theme.toggle': 'Dark / Light Mode',
    'lang.selector': 'Language',

    // Member Portal
    'portal.title': 'Member Portal · Access, Growth Groups & Ministries',
    'portal.my_sectors': 'My Authorized Management Sectors',
    'portal.my_sectors_sub': 'Tap Open Sector to enter directly into your permitted church area',
    'portal.welcome_sub': 'You are in the Member Portal. Join a Growth Group or Ministry below!',
    'portal.open_sector': 'Open Sector →',
    'portal.my_apps_title': 'My Applications & Status History',
    'portal.my_apps_sub': 'Track your requests submitted to Growth Group and Ministry leaders',
    'portal.status_approved': 'Approved & Joined',
    'portal.status_pending': 'Awaiting Leader Contact',
    'portal.status_rejected': 'Closed',
    'portal.gc_title': 'Choose your Growth Group (GC) from Official Banners',
    'portal.gc_sub': 'Check out the official artwork, location, and meeting day. Tap Join this GC to notify the leader!',
    'portal.gc_join': 'Join this Growth Group →',
    'portal.ministry_title': 'Apply to Serve in Church Ministries',
    'portal.ministry_sub': 'Each ministry has a unique calling. When you apply, the responsible leader receives an instant notification to welcome you!',
    'portal.ministry_apply': 'Apply to Ministry →',
    'portal.announcements_title': 'Official Leadership Notices & Events Wall',
    'portal.announcements_sub': 'Church updates, celebrations, and notices posted by sector coordinators',
    'portal.new_announcement': '📢 Publish Notice / Event',
    'portal.all_sectors': 'All Sectors',

    // Worship / Ministries
    'worship.create_scale': 'Build Worship Schedule',
    'worship.save_scale': 'Save Full Worship Schedule',
    'worship.role_ministrante': 'Worship Leader',
    'worship.role_backing': 'Backing Vocalist',
    'worship.role_tecladista': 'Keyboardist',
    'worship.role_guitarrista': 'Guitarist',
    'worship.role_baixista': 'Bass Player',
    'worship.role_baterista': 'Drummer',
    'worship.role_extra': 'Extra Musician',

    // Actions
    'action.save': 'Save',
    'action.close': 'Close',
    'action.add': 'Add',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.archive': 'Archive',
    'action.search': 'Search',
    'action.confirm': 'Confirm',
    'action.cancel': 'Cancel',
    'action.reports': 'Reports'
  },
  es: {
    // Navigation & Global
    'nav.systems': 'Panel TI',
    'nav.member': 'Área de Miembros',
    'nav.kids': 'Kids',
    'nav.members': 'Miembros',
    'nav.ministries': 'Ministerios',
    'nav.finance': 'Finanzas',
    'nav.download_app': 'App QR',
    'nav.notices': 'Avisos',
    'nav.enable_notices': 'Activar avisos',
    'nav.sign_out': 'Cerrar sesión',
    'theme.toggle': 'Modo Oscuro / Claro',
    'lang.selector': 'Idioma',

    // Member Portal
    'portal.title': 'Área de Miembros · Accesos, GCs & Ministerios',
    'portal.my_sectors': 'Mis Sectores de Gestión Autorizados',
    'portal.my_sectors_sub': 'Toca Abrir área para entrar directamente a tu sector autorizado',
    'portal.welcome_sub': 'Estás en el Área de Miembros. ¡Inscríbete abajo en un GC o Ministerio!',
    'portal.open_sector': 'Abrir sector →',
    'portal.my_apps_title': 'Mis Postulaciones e Historial',
    'portal.my_apps_sub': 'Sigue tus solicitudes enviadas a líderes de GCs y Ministerios',
    'portal.status_approved': 'Aprobado e Integrado',
    'portal.status_pending': 'Esperando Contacto del Líder',
    'portal.status_rejected': 'Cerrado',
    'portal.gc_title': 'Elige tu Grupo de Crecimiento (GC) por Banners Oficiales',
    'portal.gc_sub': 'Revisa el banner, la dirección y el día de reunión. ¡Toca Unirme a este GC para avisar al líder!',
    'portal.gc_join': 'Quiero Unirme a este GC →',
    'portal.ministry_title': 'Postúlate para Servir en los Ministerios de Lagoinha',
    'portal.ministry_sub': 'Cada ministerio tiene una identidad única. ¡Al postularte, el líder recibe un aviso inmediato para capacitarte!',
    'portal.ministry_apply': 'Postularse al Ministerio →',
    'portal.announcements_title': 'Muro de Comunicados & Eventos Oficiales',
    'portal.announcements_sub': 'Avisos y celebraciones publicados por la coordinación pastoral y líderes de sector',
    'portal.new_announcement': '📢 Publicar Comunicado / Evento',
    'portal.all_sectors': 'Todos los Sectores',

    // Worship / Ministries
    'worship.create_scale': 'Crear Escala de Alabanza',
    'worship.save_scale': 'Guardar Escala Completa',
    'worship.role_ministrante': 'Ministrante de Alabanza',
    'worship.role_backing': 'Voz de Apoyo (Backing)',
    'worship.role_tecladista': 'Tecladista',
    'worship.role_guitarrista': 'Guitarrista',
    'worship.role_baixista': 'Bajista',
    'worship.role_baterista': 'Baterista',
    'worship.role_extra': 'Músico Extra',

    // Actions
    'action.save': 'Guardar',
    'action.close': 'Cerrar',
    'action.add': 'Agregar',
    'action.edit': 'Editar',
    'action.delete': 'Eliminar',
    'action.archive': 'Archivar',
    'action.search': 'Buscar',
    'action.confirm': 'Confirmar',
    'action.cancel': 'Cancelar',
    'action.reports': 'Informes'
  }
};

let currentLang = 'pt';
try {
  const saved = localStorage.getItem('lagoinha_lang');
  if (saved && TRANSLATIONS[saved]) currentLang = saved;
  else if (navigator.language && navigator.language.startsWith('en')) currentLang = 'en';
  else if (navigator.language && navigator.language.startsWith('es')) currentLang = 'es';
} catch {}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  try { localStorage.setItem('lagoinha_lang', lang); } catch {}
  document.documentElement.setAttribute('lang', lang);
  window.dispatchEvent(new CustomEvent('lagoinha:lang-change', { detail: { lang } }));
}

export function t(key, fallback = '') {
  return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.pt[key] || fallback || key;
}

// -----------------------------------------------------------------------------
// Dark Mode Management
// -----------------------------------------------------------------------------

export function getTheme() {
  try {
    const saved = localStorage.getItem('lagoinha_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  const targetTheme = theme === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem('lagoinha_theme', targetTheme); } catch {}
  document.documentElement.setAttribute('data-theme', targetTheme);
  window.dispatchEvent(new CustomEvent('lagoinha:theme-change', { detail: { theme: targetTheme } }));
  return targetTheme;
}

export function toggleTheme() {
  const cur = getTheme();
  return setTheme(cur === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('lang', currentLang);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ev => {
      const manual = localStorage.getItem('lagoinha_theme');
      if (!manual) setTheme(ev.matches ? 'dark' : 'light');
    });
  }
}

// Auto-run on import to ensure correct initial theme and lang
initTheme();
