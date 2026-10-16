// Universal Internationalization (i18n) & Dark Mode Engine for Lagoinha Systems & Kids

export const SUPPORTED_LANGS = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' }
];

export const TRANSLATIONS = {
  pt: {
    // Brand & Identity
    'brand.kids': 'Lagoinha Kids',
    'brand.systems': 'Lagoinha Systems',
    'brand.kids_tagline': 'CUIDADO QUE CONECTA',
    'brand.systems_tagline': 'GOVERNANÇA, SEGURANÇA & TI',
    'brand.membro_tagline': 'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS',
    'brand.access_tagline': 'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS',
    'brand.members_tagline': 'MEMBRESIA & COMUNHÃO EM GCs',
    'brand.ministries_tagline': 'CADA DOM A SERVIÇO DO REINO',
    'brand.finance_tagline': 'MOTOR FINANCEIRO, PREVISÕES & GESTÃO',
    'brand.our_space': 'NOSSO ESPAÇO',

    // Navigation & Topbar
    'nav.systems': 'Painel TI',
    'nav.member': 'Área do Membro',
    'nav.kids': 'Kids',
    'nav.members': 'Membros',
    'nav.ministries': 'Ministérios',
    'nav.finance': 'Financeiro',
    'nav.download_app': 'Baixar App',
    'nav.app_qr': 'App QR',
    'nav.notices': 'Avisos',
    'nav.enable_notices': 'Ativar avisos',
    'nav.sign_out': 'Sair',
    'nav.access': 'Acessos',
    'nav.menu': 'Menu',
    'nav.checkin_qr': 'Check-in QR',
    'theme.toggle': 'Modo Escuro / Claro',
    'theme.light': '☀️ Claro',
    'theme.dark': '🌙 Escuro',
    'lang.selector': 'Idioma',

    // Kids Navigation & Pages
    'kids.overview': 'Visão geral',
    'kids.rooms': 'Turmas',
    'kids.my_rooms': 'Minhas turmas',
    'kids.team': 'Professores e Monitores',
    'kids.team_short': 'Equipe',
    'kids.lessons': 'Aulinhas',
    'kids.attendance': 'Chamada',
    'kids.events': 'Eventos',
    'kids.notifications': 'Avisos e Recados',
    'kids.users': 'Usuários e acessos',
    'kids.settings': 'Minha conta',
    'kids.my_children': 'Meus filhos',
    'kids.students': 'Alunos',
    'kids.search_student': 'Buscar aluno pelo nome',
    'kids.all_rooms': 'Todas as minhas turmas',
    'kids.footer_sub': 'Ambiente seguro · Igreja Batista da Lagoinha',
    'kids.active_call': 'CHAMADO ATIVO NO TELÃO',
    'kids.on_my_way': '🏃 Estou a caminho!',
    'kids.parents_on_way': '🏃 Pais a caminho',
    'kids.waiting_parents': '⏳ Aguardando pais',
    'kids.notified_on_way': '✓ Você avisou que está a caminho!',
    'kids.resolve': 'Concluir',

    // Auth & Access
    'auth.welcome': 'Bem-vindo',
    'auth.welcome_back': 'Entre para continuar.',
    'auth.welcome_system': 'Entre na sua conta.',
    'auth.saved_accounts': 'Acessos neste dispositivo',
    'auth.tap_to_enter': 'Toque para entrar',
    'auth.email': 'E-mail',
    'auth.password': 'Senha',
    'auth.name': 'Nome',
    'auth.phone': 'Celular',
    'auth.sign_in': 'Entrar',
    'auth.sign_in_system': 'Entrar no Sistema',
    'auth.sign_up': 'Criar conta',
    'auth.forgot_password': 'Esqueci minha senha',
    'auth.first_time': 'Primeiro acesso?',
    'auth.already_account': 'Já tem conta?',
    'auth.continue_google': 'Continuar com Google',
    'auth.authenticating': 'Autenticando...',
    'auth.privacy': 'Privacidade',
    'auth.install_app': 'Instalar app',
    'auth.connection': 'Conexão',

    // Member Portal
    'portal.title': 'Área de Membros · Acessos, GCs & Ministérios',
    'portal.my_sectors': 'Minhas Áreas de Gestão Liberadas',
    'portal.my_sectors_sub': 'Toque em Abrir área para entrar diretamente no setor autorizado para seu usuário',
    'portal.welcome_sub': 'Você está na Área de Membros. Inscreva-se abaixo em um GC ou Ministério!',
    'portal.open_sector': 'Abrir setor →',
    'portal.open_kids': 'Abrir Lagoinha Kids →',
    'portal.restricted_access': 'Acesso liberado apenas mediante autorização do responsável pelo setor.',
    'portal.my_apps_title': 'Minhas Inscrições em Análise & Histórico',
    'portal.my_apps_sub': 'Acompanhe suas solicitações enviadas para lideranças de GCs e Ministérios',
    'portal.status_approved': 'Aprovado e Integrado',
    'portal.status_pending': 'Aguardando Contato do Líder',
    'portal.status_rejected': 'Encerrado',
    'portal.gc_title': 'Escolha seu GC pelos Banners Oficiais',
    'portal.gc_sub': 'Confira a arte, o endereço e o dia de encontro de cada GC. Toque em Participar deste GC para avisar o líder!',
    'portal.gc_join': 'Quero Participar deste GC →',
    'portal.gc_joined': 'Inscrito! Aguardando Líder',
    'portal.ministry_title': 'Candidate-se para Servir nos Ministérios da Lagoinha',
    'portal.ministry_sub': 'Cada card possui identidade única com arte oficial. Ao se candidatar, o líder responsável recebe uma notificação imediata para preparar você!',
    'portal.ministry_apply': 'Candidatar-se ao Ministério →',
    'portal.ministry_applied': 'Candidatura enviada!',
    'portal.announcements_title': 'Mural de Comunicados & Eventos Oficiais',
    'portal.announcements_sub': 'Avisos e celebrações publicados pela coordenação pastoral e liderança dos setores',
    'portal.new_announcement': '📢 Publicar Comunicado / Evento',
    'portal.all_sectors': 'Todos os Setores',

    // Worship / Ministries
    'worship.create_scale': 'Montar Escala da Banda & Vocais do Culto',
    'worship.save_scale': 'Salvar Escala Completa do Louvor',
    'worship.open_slot': '- Vaga Livre (Não escalar) -',
    'worship.role_ministrante': 'Ministrante',
    'worship.role_backing': 'Backing Vocal',
    'worship.role_tecladista': 'Tecladista',
    'worship.role_guitarrista': 'Guitarrista',
    'worship.role_baixista': 'Baixista',
    'worship.role_baterista': 'Baterista',
    'worship.role_extra': 'Músico Extra',

    // Sector Management
    'sector.back_member': '← Área do Membro',
    'sector.pastoral_access': 'Acesso Pastoral Pleno (Alteração liberada)',
    'sector.admin_access': 'Administração do Setor',
    'sector.editor_access': 'Cadastro e Edição',
    'sector.viewer_access': 'Somente consulta',
    'sector.all_records': 'Todos os Registros',
    'sector.empty': 'Nenhum registro nesta lista',
    'sector.actions': 'Ações',
    'sector.member_doc': '🪪 Carteirinha / Batismo',
    'sector.settle': '✓ Dar baixa',
    'sector.history': 'Histórico',

    // Actions & Common
    'action.save': 'Salvar',
    'action.close': 'Fechar',
    'action.add': 'Adicionar',
    'action.edit': 'Editar',
    'action.delete': 'Excluir',
    'action.archive': 'Arquivar',
    'action.search': 'Buscar',
    'action.clear': 'Limpar',
    'action.confirm': 'Confirmar',
    'action.cancel': 'Cancelar',
    'action.reports': 'Relatórios',
    'action.download': 'Baixar',
    'action.show': 'Ver',
    'action.all': 'Todos'
  },
  en: {
    // Brand & Identity
    'brand.kids': 'Lagoinha Kids',
    'brand.systems': 'Lagoinha Systems',
    'brand.kids_tagline': 'CARE THAT CONNECTS',
    'brand.systems_tagline': 'GOVERNANCE, SECURITY & IT',
    'brand.membro_tagline': 'MEMBER PORTAL · ACCESS, GCs & MINISTRIES',
    'brand.access_tagline': 'MEMBER PORTAL · ACCESS, GCs & MINISTRIES',
    'brand.members_tagline': 'MEMBERSHIP & FELLOWSHIP IN GCs',
    'brand.ministries_tagline': 'EVERY GIFT SERVING THE KINGDOM',
    'brand.finance_tagline': 'FINANCIAL ENGINE, FORECASTS & MANAGEMENT',
    'brand.our_space': 'OUR SPACE',

    // Navigation & Topbar
    'nav.systems': 'IT Admin',
    'nav.member': 'Member Portal',
    'nav.kids': 'Kids',
    'nav.members': 'Members',
    'nav.ministries': 'Ministries',
    'nav.finance': 'Finance',
    'nav.download_app': 'Download App',
    'nav.app_qr': 'App QR',
    'nav.notices': 'Notices',
    'nav.enable_notices': 'Enable alerts',
    'nav.sign_out': 'Sign out',
    'nav.access': 'Access',
    'nav.menu': 'Menu',
    'nav.checkin_qr': 'QR Check-in',
    'theme.toggle': 'Dark / Light Mode',
    'theme.light': '☀️ Light',
    'theme.dark': '🌙 Dark',
    'lang.selector': 'Language',

    // Kids Navigation & Pages
    'kids.overview': 'Overview',
    'kids.rooms': 'Rooms',
    'kids.my_rooms': 'My Rooms',
    'kids.team': 'Teachers & Monitors',
    'kids.team_short': 'Team',
    'kids.lessons': 'Lessons',
    'kids.attendance': 'Attendance',
    'kids.events': 'Events',
    'kids.notifications': 'Notices & Messages',
    'kids.users': 'Users & Access',
    'kids.settings': 'My Account',
    'kids.my_children': 'My Children',
    'kids.students': 'Students',
    'kids.search_student': 'Search student by name',
    'kids.all_rooms': 'All my classrooms',
    'kids.footer_sub': 'Safe environment · Lagoinha Baptist Church',
    'kids.active_call': 'ACTIVE CALL ON SCREEN',
    'kids.on_my_way': '🏃 I am on my way!',
    'kids.parents_on_way': '🏃 Parents on the way',
    'kids.waiting_parents': '⏳ Waiting for parents',
    'kids.notified_on_way': '✓ You notified you are on your way!',
    'kids.resolve': 'Resolve',

    // Auth & Access
    'auth.welcome': 'Welcome',
    'auth.welcome_back': 'Sign in to continue.',
    'auth.welcome_system': 'Sign in to your account.',
    'auth.saved_accounts': 'Saved on this device',
    'auth.tap_to_enter': 'Tap to sign in',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.name': 'Name',
    'auth.phone': 'Mobile phone',
    'auth.sign_in': 'Sign in',
    'auth.sign_in_system': 'Sign in to System',
    'auth.sign_up': 'Create account',
    'auth.forgot_password': 'Forgot password',
    'auth.first_time': 'First time here?',
    'auth.already_account': 'Already have an account?',
    'auth.continue_google': 'Continue with Google',
    'auth.authenticating': 'Authenticating...',
    'auth.privacy': 'Privacy',
    'auth.install_app': 'Install app',
    'auth.connection': 'Connection',

    // Member Portal
    'portal.title': 'Member Portal · Access, Growth Groups & Ministries',
    'portal.my_sectors': 'My Authorized Management Sectors',
    'portal.my_sectors_sub': 'Tap Open Sector to enter directly into your permitted church area',
    'portal.welcome_sub': 'You are in the Member Portal. Join a Growth Group or Ministry below!',
    'portal.open_sector': 'Open Sector →',
    'portal.open_kids': 'Open Lagoinha Kids →',
    'portal.restricted_access': 'Access granted only upon authorized leadership approval.',
    'portal.my_apps_title': 'My Applications & Status History',
    'portal.my_apps_sub': 'Track your requests submitted to Growth Group and Ministry leaders',
    'portal.status_approved': 'Approved & Joined',
    'portal.status_pending': 'Awaiting Leader Contact',
    'portal.status_rejected': 'Closed',
    'portal.gc_title': 'Choose your Growth Group (GC) from Official Banners',
    'portal.gc_sub': 'Check out the artwork, address, and meeting day. Tap Join this GC to notify the leader!',
    'portal.gc_join': 'Join this Growth Group →',
    'portal.gc_joined': 'Enrolled! Awaiting Leader',
    'portal.ministry_title': 'Apply to Serve in Church Ministries',
    'portal.ministry_sub': 'Each ministry has official artwork and a unique calling. When applying, the leader is instantly notified to welcome you!',
    'portal.ministry_apply': 'Apply to Ministry →',
    'portal.ministry_applied': 'Application submitted!',
    'portal.announcements_title': 'Official Leadership Notices & Events Wall',
    'portal.announcements_sub': 'Church updates, celebrations, and notices posted by sector coordinators',
    'portal.new_announcement': '📢 Publish Notice / Event',
    'portal.all_sectors': 'All Sectors',

    // Worship / Ministries
    'worship.create_scale': 'Build Band & Vocal Worship Schedule',
    'worship.save_scale': 'Save Full Worship Schedule',
    'worship.open_slot': '- Open Slot (Do not assign) -',
    'worship.role_ministrante': 'Worship Leader',
    'worship.role_backing': 'Backing Vocalist',
    'worship.role_tecladista': 'Keyboardist',
    'worship.role_guitarrista': 'Guitarist',
    'worship.role_baixista': 'Bass Player',
    'worship.role_baterista': 'Drummer',
    'worship.role_extra': 'Extra Musician',

    // Sector Management
    'sector.back_member': '← Member Portal',
    'sector.pastoral_access': 'Full Pastoral Access (Editing Enabled)',
    'sector.admin_access': 'Sector Administration',
    'sector.editor_access': 'Register & Edit',
    'sector.viewer_access': 'Read Only',
    'sector.all_records': 'All Records',
    'sector.empty': 'No records in this list',
    'sector.actions': 'Actions',
    'sector.member_doc': '🪪 ID Card / Baptism',
    'sector.settle': '✓ Settle payment',
    'sector.history': 'History',

    // Actions & Common
    'action.save': 'Save',
    'action.close': 'Close',
    'action.add': 'Add',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.archive': 'Archive',
    'action.search': 'Search',
    'action.clear': 'Clear',
    'action.confirm': 'Confirm',
    'action.cancel': 'Cancel',
    'action.reports': 'Reports',
    'action.download': 'Download',
    'action.show': 'View',
    'action.all': 'All'
  },
  es: {
    // Brand & Identity
    'brand.kids': 'Lagoinha Kids',
    'brand.systems': 'Lagoinha Systems',
    'brand.kids_tagline': 'CUIDADO QUE CONECTA',
    'brand.systems_tagline': 'GOBERNANZA, SEGURIDAD Y TI',
    'brand.membro_tagline': 'ÁREA DE MIEMBROS · ACCESOS, GCs Y MINISTERIOS',
    'brand.access_tagline': 'ÁREA DE MIEMBROS · ACCESOS, GCs Y MINISTERIOS',
    'brand.members_tagline': 'MEMBRESÍA Y COMUNIÓN EN GCs',
    'brand.ministries_tagline': 'CADA DON AL SERVICIO DEL REINO',
    'brand.finance_tagline': 'MOTOR FINANCIERO, PREVISIONES Y GESTIÓN',
    'brand.our_space': 'NUESTRO ESPACIO',

    // Navigation & Topbar
    'nav.systems': 'Panel TI',
    'nav.member': 'Área de Miembros',
    'nav.kids': 'Kids',
    'nav.members': 'Miembros',
    'nav.ministries': 'Ministerios',
    'nav.finance': 'Finanzas',
    'nav.download_app': 'Descargar App',
    'nav.app_qr': 'App QR',
    'nav.notices': 'Avisos',
    'nav.enable_notices': 'Activar avisos',
    'nav.sign_out': 'Cerrar sesión',
    'nav.access': 'Accesos',
    'nav.menu': 'Menú',
    'nav.checkin_qr': 'Check-in QR',
    'theme.toggle': 'Modo Oscuro / Claro',
    'theme.light': '☀️ Claro',
    'theme.dark': '🌙 Oscuro',
    'lang.selector': 'Idioma',

    // Kids Navigation & Pages
    'kids.overview': 'Visión general',
    'kids.rooms': 'Salas',
    'kids.my_rooms': 'Mis salas',
    'kids.team': 'Profesores y Monitores',
    'kids.team_short': 'Equipo',
    'kids.lessons': 'Clases',
    'kids.attendance': 'Asistencia',
    'kids.events': 'Eventos',
    'kids.notifications': 'Avisos y Mensajes',
    'kids.users': 'Usuarios y Accesos',
    'kids.settings': 'Mi Cuenta',
    'kids.my_children': 'Mis Hijos',
    'kids.students': 'Alumnos',
    'kids.search_student': 'Buscar alumno por nombre',
    'kids.all_rooms': 'Todas mis salas',
    'kids.footer_sub': 'Ambiente seguro · Iglesia Bautista de la Lagoinha',
    'kids.active_call': 'LLAMADO ACTIVO EN PANTALLA',
    'kids.on_my_way': '🏃 ¡Voy en camino!',
    'kids.parents_on_way': '🏃 Padres en camino',
    'kids.waiting_parents': '⏳ Esperando a los padres',
    'kids.notified_on_way': '✓ ¡Has avisado que vas en camino!',
    'kids.resolve': 'Completar',

    // Auth & Access
    'auth.welcome': 'Bienvenido',
    'auth.welcome_back': 'Inicia sesión para continuar.',
    'auth.welcome_system': 'Ingresa a tu cuenta.',
    'auth.saved_accounts': 'Guardados en este dispositivo',
    'auth.tap_to_enter': 'Toca para entrar',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'auth.name': 'Nombre',
    'auth.phone': 'Teléfono celular',
    'auth.sign_in': 'Ingresar',
    'auth.sign_in_system': 'Ingresar al Sistema',
    'auth.sign_up': 'Crear cuenta',
    'auth.forgot_password': 'Olvidé mi contraseña',
    'auth.first_time': '¿Primer acceso?',
    'auth.already_account': '¿Ya tienes cuenta?',
    'auth.continue_google': 'Continuar con Google',
    'auth.authenticating': 'Autenticando...',
    'auth.privacy': 'Privacidad',
    'auth.install_app': 'Instalar app',
    'auth.connection': 'Conexión',

    // Member Portal
    'portal.title': 'Área de Miembros · Accesos, GCs & Ministerios',
    'portal.my_sectors': 'Mis Sectores de Gestión Autorizados',
    'portal.my_sectors_sub': 'Toca Abrir sector para entrar directamente a tu área autorizada',
    'portal.welcome_sub': 'Estás en el Área de Miembros. ¡Inscríbete abajo en un GC o Ministerio!',
    'portal.open_sector': 'Abrir sector →',
    'portal.open_kids': 'Abrir Lagoinha Kids →',
    'portal.restricted_access': 'Acceso otorgado únicamente con autorización del líder responsable.',
    'portal.my_apps_title': 'Mis Postulaciones e Historial',
    'portal.my_apps_sub': 'Sigue tus solicitudes enviadas a líderes de GCs y Ministerios',
    'portal.status_approved': 'Aprobado e Integrado',
    'portal.status_pending': 'Esperando Contacto del Líder',
    'portal.status_rejected': 'Cerrado',
    'portal.gc_title': 'Elige tu Grupo de Crecimiento (GC) por Banners Oficiales',
    'portal.gc_sub': 'Revisa el banner, la dirección y el día de reunión. ¡Toca Unirme a este GC para avisar al líder!',
    'portal.gc_join': 'Quiero Unirme a este GC →',
    'portal.gc_joined': '¡Inscrito! Esperando al Líder',
    'portal.ministry_title': 'Postúlate para Servir en los Ministerios de Lagoinha',
    'portal.ministry_sub': 'Cada ministerio tiene una identidad única con arte oficial. ¡Al postularte, el líder recibe un aviso inmediato para capacitarte!',
    'portal.ministry_apply': 'Postularse al Ministerio →',
    'portal.ministry_applied': '¡Postulación enviada!',
    'portal.announcements_title': 'Muro de Comunicados & Eventos Oficiales',
    'portal.announcements_sub': 'Avisos y celebraciones publicados por la coordinación pastoral y líderes de sector',
    'portal.new_announcement': '📢 Publicar Comunicado / Evento',
    'portal.all_sectors': 'Todos los Sectores',

    // Worship / Ministries
    'worship.create_scale': 'Crear Escala de Alabanza y Voces',
    'worship.save_scale': 'Guardar Escala Completa',
    'worship.open_slot': '- Vacante Libre (No asignar) -',
    'worship.role_ministrante': 'Ministrante de Alabanza',
    'worship.role_backing': 'Voz de Apoyo (Backing)',
    'worship.role_tecladista': 'Tecladista',
    'worship.role_guitarrista': 'Guitarrista',
    'worship.role_baixista': 'Bajista',
    'worship.role_baterista': 'Baterista',
    'worship.role_extra': 'Músico Extra',

    // Sector Management
    'sector.back_member': '← Área de Miembros',
    'sector.pastoral_access': 'Acceso Pastoral Pleno (Edición Permitida)',
    'sector.admin_access': 'Administración del Sector',
    'sector.editor_access': 'Registro y Edición',
    'sector.viewer_access': 'Solo Consulta',
    'sector.all_records': 'Todos los Registros',
    'sector.empty': 'No hay registros en esta lista',
    'sector.actions': 'Acciones',
    'sector.member_doc': '🪪 Credencial / Bautismo',
    'sector.settle': '✓ Liquidar',
    'sector.history': 'Historial',

    // Actions & Common
    'action.save': 'Guardar',
    'action.close': 'Cerrar',
    'action.add': 'Agregar',
    'action.edit': 'Editar',
    'action.delete': 'Eliminar',
    'action.archive': 'Archivar',
    'action.search': 'Buscar',
    'action.clear': 'Limpiar',
    'action.confirm': 'Confirmar',
    'action.cancel': 'Cancelar',
    'action.reports': 'Informes',
    'action.download': 'Descargar',
    'action.show': 'Ver',
    'action.all': 'Todos'
  }
};

// Direct Portuguese phrase-to-target mapping for fast full-DOM translation
export const PHRASES = {
  en: {
    'NOSSO ESPAÇO': 'OUR SPACE',
    'Meus filhos': 'My Children',
    'Visão geral': 'Overview',
    'Visão': 'Overview',
    'Turmas': 'Rooms',
    'Minhas turmas': 'My Rooms',
    'Aulinhas': 'Lessons',
    'Equipe': 'Team',
    'Professores e Monitores': 'Teachers & Monitors',
    'Chamada': 'Attendance',
    'Frequência': 'Attendance',
    'Eventos': 'Events',
    'Alunos': 'Children',
    'Avisos': 'Notices',
    'Avisos e recados': 'Notices & Messages',
    'Usuários e acessos': 'Users & Access',
    'Minha conta': 'My Account',
    'Conta': 'Account',
    'Acessos': 'Access',
    'Check-in QR': 'QR Check-in',
    'Baixar App': 'Download App',
    'Menu': 'Menu',
    '🌿 Menu': '🌿 Menu',
    'Painel TI': 'IT Panel',
    'Área do Membro': 'Member Portal',
    'Kids': 'Kids',
    'Membros': 'Members',
    'Ministérios': 'Ministries',
    'Financeiro': 'Finance',
    'App QR': 'App QR',
    'Ativar avisos': 'Enable alerts',
    'Sair': 'Sign Out',
    'Sair da conta': 'Sign Out',
    'Sair do aplicativo': 'Exit App',
    '☀️ Claro': '☀️ Light',
    '🌙 Escuro': '🌙 Dark',
    '☀️ Modo Claro': '☀️ Light Mode',
    '🌙 Modo Escuro': '☀️ Dark Mode',
    'Bem-vindo': 'Welcome',
    'Entre para continuar.': 'Sign in to continue.',
    'Entre na sua conta.': 'Sign in to your account.',
    'Acessos neste dispositivo': 'Saved on this device',
    'Toque para entrar': 'Tap to sign in',
    'Remover': 'Remove',
    'E-mail': 'Email',
    'Senha': 'Password',
    'Nome': 'Name',
    'Celular': 'Phone',
    'Ver': 'Show',
    'Entrar': 'Sign in',
    'Entrar no Sistema': 'Sign in to System',
    'Criar conta': 'Create account',
    'Esqueci minha senha': 'Forgot password',
    'Primeiro acesso?': 'First time here?',
    'Já tem conta?': 'Already have an account?',
    'Continuar com Google': 'Continue with Google',
    'Privacidade': 'Privacy',
    'Instalar app': 'Install app',
    'Conexão': 'Connection',
    'Buscar aluno pelo nome': 'Search student by name',
    'Todas as minhas turmas': 'All my classrooms',
    'Novo evento': 'New event',
    'Todos os eventos': 'All events',
    'Kids (0 a 11 anos)': 'Kids (0 to 11 yrs)',
    'Teens (12 a 17 anos)': 'Teens (12 to 17 yrs)',
    'Vagas preenchidas': 'Spots filled',
    'Inscrever meu filho': 'Register my child',
    'Ver Inscritos': 'View Enrolled',
    'Lagoinha Kids · Cuidado que conecta': 'Lagoinha Kids · Care that connects',
    'Ambiente seguro · Igreja Batista da Lagoinha': 'Safe environment · Lagoinha Baptist Church',
    'CUIDADO QUE CONECTA': 'CARE THAT CONNECTS',
    'GOVERNANÇA, SEGURANÇA & TI': 'GOVERNANCE, SECURITY & IT',
    'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS': 'MEMBER PORTAL · ACCESS, GCs & MINISTRIES',
    'MEMBRESIA & COMUNHÃO EM GCs': 'MEMBERSHIP & FELLOWSHIP IN GCs',
    'CADA DOM A SERVIÇO DO REINO': 'EVERY GIFT SERVING THE KINGDOM',
    'MOTOR FINANCEIRO, PREVISÕES & GESTÃO': 'FINANCIAL ENGINE, FORECASTS & MANAGEMENT',
    'Minhas Áreas de Gestão Liberadas': 'My Authorized Management Sectors',
    'Sistemas e Setores da Igreja': 'Church Systems & Sectors',
    'Toque em Abrir área para entrar diretamente no setor autorizado para seu usuário': 'Tap Open Sector to access your permitted church area',
    'Você está na Área de Membros. Inscreva-se abaixo em um GC ou Ministério!': 'You are in the Member Portal. Join a Growth Group or Ministry below!',
    'Abrir Lagoinha Kids →': 'Open Lagoinha Kids →',
    'Abrir Setor →': 'Open Sector →',
    'Acesso liberado apenas mediante autorização do responsável pelo setor.': 'Access granted only upon authorized leadership approval.',
    'Escolha seu GC pelos Banners Oficiais': 'Choose your Growth Group (GC) from Official Banners',
    'Quero Participar deste GC →': 'Join this Growth Group →',
    'Inscrito! Aguardando Líder': 'Applied! Awaiting Leader',
    'Candidate-se para Servir nos Ministérios da Lagoinha': 'Apply to Serve in Church Ministries',
    'Candidatar-se ao Ministério →': 'Apply to Ministry →',
    'Candidatura enviada!': 'Application submitted!',
    'Mural de Comunicados & Eventos Oficiais': 'Official Notices & Events Wall',
    'Publicar Novo Comunicado ou Evento': '📢 Publish Notice / Event',
    'Todos os Setores': 'All Sectors',
    'Todos os Registros': 'All Records',
    '← Área do Membro': '← Member Portal',
    'Acesso Pastoral Pleno (Alteração liberada)': 'Full Pastoral Access (Editing Enabled)',
    'Administração do Setor': 'Sector Administration',
    'Cadastro e Edição': 'Register & Edit',
    'Somente consulta': 'Read Only',
    'Adicionar': 'Add',
    'Editar': 'Edit',
    'Arquivar': 'Archive',
    'Limpar': 'Clear',
    'Buscar': 'Search',
    'Salvar': 'Save',
    'Fechar': 'Close',
    'Ações': 'Actions',
    '🪪 Carteirinha / Batismo': '🪪 ID Card / Baptism',
    '✓ Dar baixa': '✓ Settle',
    'Histórico': 'History',
    'Nenhum registro nesta lista': 'No records in this list',
    'Montar Escala da Banda & Vocais do Culto': 'Build Band & Vocal Worship Schedule',
    'Salvar Escala Completa do Louvor': 'Save Full Worship Schedule',
    '- Vaga Livre (Não escalar) -': '- Open Slot (Do not assign) -',
    'Entradas e Saídas': 'Income & Expenses',
    'Borderôs': 'Service Closings',
    'Contas': 'Accounts',
    'Centros de custo': 'Cost Centers',
    'Notas Fiscais': 'Invoices',
    'Escalas': 'Schedules',
    'Materiais': 'Materials',
    'Famílias': 'Families',
    'GCs': 'GCs',
    'Equipe que cuida das turmas e conduz as aulinhas.': 'Team caring for classrooms and leading lessons.',
    'Acampamentos, EBF, Cultos e atividades para Kids e Teens.': 'Camps, VBS, services, and activities for Kids and Teens.',
    '📢 CHAMADO ATIVO NO TELÃO': '📢 ACTIVE CALL ON SCREEN',
    '🏃 Estou a caminho!': '🏃 I am on my way!',
    '🏃 Pais a caminho': '🏃 Parents on the way',
    '⏳ Aguardando pais': '⏳ Waiting for parents',
    '✓ Você avisou que está a caminho!': '✓ You notified you are on your way!',
    'Concluir': 'Resolve',
    'Membros Cadastrados': 'Registered Members',
    'Grupos de Crescimento (GCs)': 'Growth Groups (GCs)',
    'Escalas do Louvor': 'Worship Schedules',
    'Voluntários & Funções': 'Volunteers & Roles',
    'Repertório & Materiais': 'Repertoire & Materials',
    'Entradas & Saídas': 'Income & Expenses',
    'Borderôs de Culto': 'Service Closings',
    'Contas & Bancos': 'Accounts & Banks',
    'Controle de Acessos': 'Access Control',
    'Auditoria Global': 'Global Audit',
    'Membros & Células': 'Members & Cells (GCs)',
    'Louvor & Ministérios': 'Worship & Ministries',
    'Governança & TI': 'Governance & IT'
  },
  es: {
    'NOSSO ESPAÇO': 'NUESTRO ESPACIO',
    'Meus filhos': 'Mis Hijos',
    'Visão geral': 'Visión general',
    'Visão': 'Visión',
    'Turmas': 'Salas',
    'Minhas turmas': 'Mis Salas',
    'Aulinhas': 'Clases',
    'Equipe': 'Equipo',
    'Professores e Monitores': 'Profesores y Monitores',
    'Chamada': 'Asistencia',
    'Frequência': 'Asistencia',
    'Eventos': 'Eventos',
    'Alunos': 'Alumnos',
    'Avisos': 'Avisos',
    'Avisos e recados': 'Avisos y Mensajes',
    'Usuários e acessos': 'Usuarios y Accesos',
    'Minha conta': 'Mi Cuenta',
    'Conta': 'Cuenta',
    'Acessos': 'Accesos',
    'Check-in QR': 'Check-in QR',
    'Baixar App': 'Descargar App',
    'Menu': 'Menú',
    '🌿 Menu': '🌿 Menú',
    'Painel TI': 'Panel TI',
    'Área do Membro': 'Área de Miembros',
    'Kids': 'Kids',
    'Membros': 'Miembros',
    'Ministérios': 'Ministerios',
    'Financeiro': 'Finanzas',
    'App QR': 'App QR',
    'Ativar avisos': 'Activar avisos',
    'Sair': 'Cerrar sesión',
    'Sair da conta': 'Cerrar sesión',
    'Sair do aplicativo': 'Salir del app',
    '☀️ Claro': '☀️ Claro',
    '🌙 Escuro': '🌙 Oscuro',
    '☀️ Modo Claro': '☀️ Modo Claro',
    '🌙 Modo Escuro': '🌙 Modo Oscuro',
    'Bem-vindo': 'Bienvenido',
    'Entre para continuar.': 'Inicia sesión para continuar.',
    'Entre na sua conta.': 'Ingresa a tu cuenta.',
    'Acessos neste dispositivo': 'Guardados en este dispositivo',
    'Toque para entrar': 'Toca para entrar',
    'Remover': 'Eliminar',
    'E-mail': 'Correo electrónico',
    'Senha': 'Contraseña',
    'Nome': 'Nombre',
    'Celular': 'Teléfono celular',
    'Ver': 'Ver',
    'Entrar': 'Ingresar',
    'Entrar no Sistema': 'Ingresar al Sistema',
    'Criar conta': 'Crear cuenta',
    'Esqueci minha senha': 'Olvidé mi contraseña',
    'Primeiro acesso?': '¿Primer acceso?',
    'Já tem conta?': '¿Ya tienes cuenta?',
    'Continuar com Google': 'Continuar con Google',
    'Privacidade': 'Privacidad',
    'Instalar app': 'Instalar app',
    'Conexão': 'Conexión',
    'Buscar aluno pelo nome': 'Buscar alumno por nombre',
    'Todas as minhas turmas': 'Todas mis salas',
    'Novo evento': 'Nuevo evento',
    'Todos os eventos': 'Todos los eventos',
    'Kids (0 a 11 anos)': 'Kids (0 a 11 años)',
    'Teens (12 a 17 anos)': 'Teens (12 a 17 años)',
    'Vagas preenchidas': 'Lugares ocupados',
    'Inscrever meu filho': 'Inscribir a mi hijo',
    'Ver Inscritos': 'Ver Inscritos',
    'Lagoinha Kids · Cuidado que conecta': 'Lagoinha Kids · Cuidado que conecta',
    'Ambiente seguro · Igreja Batista da Lagoinha': 'Ambiente seguro · Iglesia Bautista de la Lagoinha',
    'CUIDADO QUE CONECTA': 'CUIDADO QUE CONECTA',
    'GOVERNANÇA, SEGURANÇA & TI': 'GOBERNANZA, SEGURIDAD Y TI',
    'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS': 'ÁREA DE MIEMBROS · ACCESOS, GCs Y MINISTERIOS',
    'MEMBRESIA & COMUNHÃO EM GCs': 'MEMBRESÍA Y COMUNIÓN EN GCs',
    'CADA DOM A SERVIÇO DO REINO': 'CADA DON AL SERVICIO DEL REINO',
    'MOTOR FINANCEIRO, PREVISÕES & GESTÃO': 'MOTOR FINANCIERO, PREVISIONES Y GESTIÓN',
    'Minhas Áreas de Gestão Liberadas': 'Mis Sectores de Gestión Autorizados',
    'Sistemas e Setores da Igreja': 'Sistemas y Sectores de la Iglesia',
    'Toque em Abrir área para entrar diretamente no setor autorizado para seu usuário': 'Toca Abrir sector para entrar directamente a tu sector autorizado',
    'Você está na Área de Membros. Inscreva-se abaixo em um GC ou Ministério!': 'Estás en el Área de Miembros. ¡Inscríbete abajo en un GC o Ministerio!',
    'Abrir Lagoinha Kids →': 'Abrir Lagoinha Kids →',
    'Abrir Setor →': 'Abrir Sector →',
    'Acesso liberado apenas mediante autorização do responsável pelo setor.': 'Acceso otorgado únicamente con autorización del líder responsable.',
    'Escolha seu GC pelos Banners Oficiais': 'Elige tu Grupo de Crecimiento (GC) por Banners Oficiales',
    'Quero Participar deste GC →': 'Quiero Unirme a este GC →',
    'Inscrito! Aguardando Líder': '¡Inscrito! Esperando al Líder',
    'Candidate-se para Servir nos Ministérios da Lagoinha': 'Postúlate para Servir en los Ministerios de Lagoinha',
    'Candidatar-se ao Ministério →': 'Postularse al Ministerio →',
    'Candidatura enviada!': '¡Postulación enviada!',
    'Mural de Comunicados & Eventos Oficiais': 'Muro de Comunicados & Eventos Oficiales',
    'Publicar Novo Comunicado ou Evento': '📢 Publicar Comunicado / Evento',
    'Todos os Setores': 'Todos los Sectores',
    'Todos os Registros': 'Todos los Registros',
    '← Área do Membro': '← Área de Miembros',
    'Acesso Pastoral Pleno (Alteração liberada)': 'Acceso Pastoral Pleno (Edición Permitida)',
    'Administração do Setor': 'Administración del Sector',
    'Cadastro e Edição': 'Registro y Edición',
    'Somente consulta': 'Solo Consulta',
    'Adicionar': 'Agregar',
    'Editar': 'Editar',
    'Arquivar': 'Archivar',
    'Limpar': 'Limpiar',
    'Buscar': 'Buscar',
    'Salvar': 'Guardar',
    'Fechar': 'Cerrar',
    'Ações': 'Acciones',
    '🪪 Carteirinha / Batismo': '🪪 Credencial / Bautismo',
    '✓ Dar baixa': '✓ Liquidar',
    'Histórico': 'Historial',
    'Nenhum registro nesta lista': 'No hay registros en esta lista',
    'Montar Escala da Banda & Vocais do Culto': 'Crear Escala de Alabanza y Voces',
    'Salvar Escala Completa do Louvor': 'Guardar Escala Completa',
    '- Vaga Livre (Não escalar) -': '- Vacante Libre (No asignar) -',
    'Entradas e Saídas': 'Ingresos y Egresos',
    'Borderôs': 'Cierres de Culto',
    'Contas': 'Cuentas',
    'Centros de custo': 'Centros de Costo',
    'Notas Fiscais': 'Facturas',
    'Escalas': 'Escalas',
    'Materiais': 'Materiales',
    'Famílias': 'Familias',
    'GCs': 'GCs',
    'Equipe que cuida das turmas e conduz as aulinhas.': 'Equipo que cuida las salas y guía las clases.',
    'Acampamentos, EBF, Cultos e atividades para Kids e Teens.': 'Campamentos, EBD, cultos y actividades para Kids y Teens.',
    '📢 CHAMADO ATIVO NO TELÃO': '📢 LLAMADO ACTIVO EN PANTALLA',
    '🏃 Estou a caminho!': '🏃 ¡Voy en camino!',
    '🏃 Pais a caminho': '🏃 Padres en camino',
    '⏳ Aguardando pais': '⏳ Esperando a los padres',
    '✓ Você avisou que está a caminho!': '✓ ¡Has avisado que vas en camino!',
    'Concluir': 'Completar',
    'Membros Cadastrados': 'Miembros Registrados',
    'Grupos de Crescimento (GCs)': 'Grupos de Crecimiento (GCs)',
    'Escalas do Louvor': 'Escalas de Alabanza',
    'Voluntários & Funções': 'Voluntarios & Roles',
    'Repertório & Materiais': 'Repertorio & Materiales',
    'Entradas & Saídas': 'Ingresos & Egresos',
    'Borderôs de Culto': 'Cierres de Culto',
    'Contas & Bancos': 'Cuentas & Bancos',
    'Controle de Acessos': 'Control de Accesos',
    'Auditoria Global': 'Auditoría Global',
    'Membros & Células': 'Miembros y Células (GCs)',
    'Louvor & Ministérios': 'Alabanza y Ministerios',
    'Governança & TI': 'Gobernanza y TI'
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
  translateDOM(document.body);
  window.dispatchEvent(new CustomEvent('lagoinha:lang-change', { detail: { lang } }));
}

export function t(keyOrPhrase, fallback = '') {
  if (!keyOrPhrase) return fallback || '';
  if (currentLang === 'pt') {
    return TRANSLATIONS.pt[keyOrPhrase] || fallback || keyOrPhrase;
  }
  // Try key translation first
  const fromKey = TRANSLATIONS[currentLang]?.[keyOrPhrase];
  if (fromKey) return fromKey;

  // Try direct phrase translation
  const fromPhrase = PHRASES[currentLang]?.[keyOrPhrase];
  if (fromPhrase) return fromPhrase;

  // Fallback
  return fallback || TRANSLATIONS.pt[keyOrPhrase] || keyOrPhrase;
}

/**
 * Automatically walks through the given container and translates text nodes,
 * placeholders, and aria-labels according to the active language.
 */
export function translateDOM(container = document.body) {
  if (!container || currentLang === 'pt') return;
  const langDict = PHRASES[currentLang];
  if (!langDict) return;

  // 1. Process visible text nodes
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        const parentTag = node.parentElement?.tagName;
        if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'SVG' || parentTag === 'CODE') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (langDict[trimmed]) {
      node.nodeValue = raw.replace(trimmed, langDict[trimmed]);
    }
  }

  // 2. Process inputs and textareas placeholders
  container.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    const p = el.placeholder?.trim();
    if (p && langDict[p]) {
      el.placeholder = langDict[p];
    }
  });

  // 3. Process buttons and elements with titles
  container.querySelectorAll('[title]').forEach(el => {
    const tVal = el.title?.trim();
    if (tVal && langDict[tVal]) {
      el.title = langDict[tVal];
    }
  });

  // 4. Process aria-labels
  container.querySelectorAll('[aria-label]').forEach(el => {
    const aVal = el.getAttribute('aria-label')?.trim();
    if (aVal && langDict[aVal]) {
      el.setAttribute('aria-label', langDict[aVal]);
    }
  });
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
