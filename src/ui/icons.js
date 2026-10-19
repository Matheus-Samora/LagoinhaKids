/** Lagoinha Systems: native SVG redraw of the approved 30-icon sheet. */
import './icons.css';
const a = content => `<g class="ls-icon-accent" stroke="#F59E0B">${content}</g>`;
export const ICON_PATHS = Object.freeze({
 systems: '<path d="M12 2.5 21 6v6c0 4.4-3.8 7.8-9 10-5.2-2.2-9-5.6-9-10V6Z"/>'+a('<path d="m12 7 1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5Z"/>'),
 identity: '<rect x="4" y="5" width="16" height="17" rx="2"/><circle cx="12" cy="11.5" r="2.5"/><path d="M7.5 19a4.5 4.5 0 0 1 9 0"/>'+a('<rect x="10" y="2" width="4" height="5" rx="1"/>'),
 kids: '<path d="M19.5 10a2 2 0 0 1 0 4 8 8 0 0 1-15 0 2 2 0 0 1 0-4 8 8 0 0 1 15 0Z"/><path d="M8 11q1-2 2 0m4 0q1-2 2 0m-8 4q4 4 8 0M11 5q3 0 2-3"/>'+a('<path d="m20 2 .7 1.8L22.5 4l-1.8.7L20 6.5l-.7-1.8L17.5 4l1.8-.2Z"/>'),
 community: '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M2 22v-3a5 5 0 0 1 10 0v3m0-3a5 5 0 0 1 10 0v3"/>'+a('<path d="M3 7a10 10 0 0 1 18 0"/>'),
 ministries: '<path d="M10 22C2 19 3 13 8 8c2-2 3-4 3-6 4 2 7 6 6 10l3-3c3 7 0 11-5 13"/>'+a('<path d="m12 11 1.2 3.3 3.3 1.2-3.3 1.2L12 20l-1.2-3.3-3.3-1.2 3.3-1.2Z"/>'),
 finance: '<rect x="3" y="16" width="4" height="6" rx="1"/><rect x="10" y="12" width="4" height="10" rx="1"/><rect x="17" y="8" width="4" height="14" rx="1"/>'+a('<path d="M3 10c7-1 12-4 18-8m-5 0h5v5"/>'),
 home: '<path d="m2 11 10-9 10 9M4 10v11h16V10"/>'+a('<path d="M9 21v-7a3 3 0 0 1 6 0v7"/>'),
 announcements: '<path d="m4 9 13-5v15L4 15H2V9Zm1 6 2 6h3l-2-5M6 8v8"/>'+a('<path d="M20 8a8 8 0 0 1 0 8m2-10a12 12 0 0 1 0 12"/>'),
 groups: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/>'+a('<path d="M12 14 7.8 10a2.5 2.5 0 0 1 4.2-2.7 2.5 2.5 0 0 1 4.2 2.7Z"/>'),
 family: '<circle cx="6.5" cy="7" r="3"/><circle cx="17.5" cy="7" r="3"/><path d="M1 21v-5a5.5 5.5 0 0 1 7-5m8 0a5.5 5.5 0 0 1 7 5v5M8 22v-3a4 4 0 0 1 8 0v3"/>'+a('<circle cx="12" cy="12" r="2.5"/>'),
 worship: '<path d="M8 17V5l10-3v13M8 8l10-3"/><circle cx="5" cy="18" r="3"/><circle cx="15" cy="16" r="3"/>'+a('<path d="M2 9v3m2-5v7m16-4v3m2-5v7"/>'),
 schedules: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M7 2v5m10-5v5M3 10h18"/>'+a('<path d="m8 16 3 3 6-6"/>'),
 volunteers: '<path d="M9 21c-5-2-7-5-7-10 0-2 2-2 2 0v3m5 5-4-4c-1.5-1.5 0-3 1.5-2L10 16m5 5c5-2 7-5 7-10 0-2-2-2-2 0v3m-5 5 4-4c1.5-1.5 0-3-1.5-2L14 16"/>'+a('<path d="M4 6a10 10 0 0 1 16 0M9 22a12 12 0 0 0 6 0"/>'),
 resources: '<path d="M8 8V3h12v10M2 10V8h6l3 4h9a2 2 0 0 1 2 2v7H2Z"/>'+a('<path d="M11 6h6m-6 3h4"/>'),
 transactions: '<path d="M3 9a9 9 0 0 1 16-3l2 2m0-5v5h-5M21 15a9 9 0 0 1-16 3l-2-2"/>'+a('<path d="M3 21v-5h5m-3 2 3 2"/>'),
 closing: '<path d="M9 4H5a2 2 0 0 0-2 2v15h18V6a2 2 0 0 0-2-2h-4"/><rect x="9" y="2" width="6" height="5" rx="1"/>'+a('<path d="m7 14 3 3 7-7"/>'),
 bank: '<path d="m2 7 10-5 10 5v2H2Zm1 13h18v3H3ZM5 11v7m7-7v7m7-7v7"/>'+a('<path d="M5 7h14"/>'),
 costs: '<path d="M13 3h8v8L10 22 2 14Z"/>'+a('<circle cx="17" cy="7" r="2"/>'),
 invoice: '<path d="m4 2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v20l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2Z"/><path d="M8 11h8M8 15h8m-8 4h4"/>'+a('<path d="M8 7h8"/>'),
 permissions: '<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>'+a('<circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>'),
 classrooms: '<rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'+a('<rect x="3" y="3" width="7" height="7" rx="2"/>'),
 lessons: '<circle cx="12" cy="12" r="10"/><path d="m6 8 6 4 6-4M12 3v1m9 8h-1M3 12h1"/>'+a('<circle cx="12" cy="12" r=".7"/>'),
 notifications: '<path d="M18 11c0 5 3 6 3 7H3c0-1 3-2 3-8a6 6 0 0 1 8-5m-5 16a3 3 0 0 0 6 0"/>'+a('<circle cx="19" cy="5" r="2" fill="#F59E0B"/>'),
 qr: '<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5" stroke="#F59E0B"/><path d="M7 7h3v3H7zm7 0h3v3h-3zM7 14h3v3H7zm7 0h1v1h2v2h-3zm3-3v1m-6 0h1v2m0 4h1m4 1h1"/>',
 printer: '<path d="M6 7V3h12v4M6 18H4a2 2 0 0 1-2-2v-6a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v6a2 2 0 0 1-2 2h-2M2 12h20M6 15h12v7l-2-1-2 1-2-1-2 1-2-1-2 1Z"/>'+a('<path d="m12 16 2 .7v1.5q0 1-2 2-2-1-2-2v-1.5Z"/>'),
 kiosk: '<path d="M7 18h10v3H7Zm4 0v-4m2 0v4M5 2h13l3 12H8Z"/>'+a('<path d="m8 5 8 0m-7 3h7"/>'),
 health: '<path d="m12 2 9 4v7q-1 5-9 9-8-4-9-9V6Z"/>'+a('<path d="M10 7h4v4h4v4h-4v4h-4v-4H6v-4h4Z"/>'),
 camera: '<path d="m8 3-2 4H3a2 2 0 0 0-2 2v11h22V9a2 2 0 0 0-2-2h-3l-2-4Z"/><circle cx="12" cy="13" r="5"/><circle cx="12" cy="13" r="2.5"/>'+a('<circle cx="19" cy="10" r=".5"/>'),
 attachment: '<path d="m9 16 7-7a2 2 0 0 0-3-3L5 14a4 4 0 0 0 6 6l9-9a6 6 0 0 0-9-8l-8 8"/>',
 exit: '<path d="M15 7V3L3 5v15l10 2V7L3 5m12 15v-3M10 12v2"/>'+a('<path d="M16 12h7m-3-3 3 3-3 3"/>')
});
export const ICON_NAMES = Object.freeze(Object.keys(ICON_PATHS));
const aliases = {access:'identity',membro:'identity',members:'community',all:'home',people:'identity',families:'family',cells:'groups',gcs:'groups',assignments:'volunteers',entries:'transactions',closings:'closing',accounts:'bank','cost-centers':'costs',invoices:'invoice',audit:'systems',rooms:'classrooms',clock:'lessons',calendar:'schedules',bell:'notifications',qrcode:'qr',out:'exit',shield:'systems',speaker:'announcements',heart:'health',team:'volunteers',materials:'resources',print:'printer'};
export function hasIcon(name){return Boolean(ICON_PATHS[aliases[name]||name]);}
export function uiIcon(name,size=20){
 const key=aliases[name]||name;const safe=ICON_PATHS[key]?key:'home';
 const pixels=Number.isFinite(size)?Math.min(128,Math.max(12,size)):20;
 return `<svg class="ls-icon" data-icon="${safe}" width="${pixels}" height="${pixels}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[safe]}</svg>`;
}
