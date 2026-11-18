/** Pictogrammes originaux de l'interface (SVG en ligne, trait simple). */

const svg = (contenu: string, vb = '0 0 24 24') =>
  `<svg class="ico" viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contenu}</svg>`;

export const ICO: Record<string, string> = {
  goutte: svg('<path d="M12 3c3.5 4.2 6 7.300 6 10.300a6 6 0 0 1-12 0C6 10.300 8.500 7.200 12 3z" fill="currentColor" fill-opacity=".25"/>'),
  pieces: svg('<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".2"/><path d="M12 8v8M9.500 10.500h3.800a1.700 1.700 0 0 1 0 3.400H9.500"/>'),
  materiaux: svg('<path d="M3 15h8v5H3zM13 15h8v5h-8zM8 9h8v5H8z" fill="currentColor" fill-opacity=".2"/>'),
  vivres: svg('<path d="M4 13h16a8 8 0 0 1-16 0z" fill="currentColor" fill-opacity=".2"/><path d="M8 9c0-2 2-2 2-4M12 9c0-2 2-2 2-4M16 9c0-1.500 1.500-1.500 1.500-3"/>'),
  dattes: svg('<path d="M12 3v5M12 8c-3 0-5 2-5 5M12 8c3 0 5 2 5 5"/><ellipse cx="8" cy="16.500" rx="2.200" ry="3.200" fill="currentColor" fill-opacity=".3"/><ellipse cx="16" cy="16.500" rx="2.200" ry="3.200" fill="currentColor" fill-opacity=".3"/><ellipse cx="12" cy="18" rx="2.200" ry="3.200" fill="currentColor" fill-opacity=".3"/>'),
  habitants: svg('<circle cx="9" cy="8" r="3" fill="currentColor" fill-opacity=".2"/><path d="M3.500 20c.500-4 2.500-6 5.500-6s5 2 5.500 6"/><circle cx="17" cy="9" r="2.300"/><path d="M15.500 14.200c3 .200 4.500 2.300 5 5.800"/>'),
  bras: svg('<path d="M5 20l3-9 4 2 3-8 4 1.500-3 9-4-2-2 7z" fill="currentColor" fill-opacity=".15"/><path d="M14 5l4 1.500"/>'),
  renommee: svg('<path d="M12 3l2.600 5.600 6.100.700-4.500 4.200 1.200 6.100L12 16.600 6.600 19.600l1.200-6.100L3.300 9.300l6.100-.700z" fill="currentColor" fill-opacity=".25"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  lecture: svg('<path d="M7 4.500v15l12-7.500z" fill="currentColor"/>'),
  rapide: svg('<path d="M4 5v14l8-7zM13 5v14l8-7z" fill="currentColor"/>'),
  tresRapide: svg('<path d="M2 5v14l6-7zM9 5v14l6-7zM16 5v14l6-7z" fill="currentColor"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  curseur: svg('<path d="M5 3l14 8-6 1.500L10 19z" fill="currentColor" fill-opacity=".2"/>'),
  gomme: svg('<path d="M4 16l9-11 7 6-9 11H7z" fill="currentColor" fill-opacity=".2"/><path d="M9 10l7 6M4 21h16"/>'),
  canal: svg('<path d="M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 14c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/>'),
  canalMaconne: svg('<path d="M3 5h18v3H3zM3 16h18v3H3z" fill="currentColor" fill-opacity=".25"/><path d="M3 12c3 0 3 1.500 6 1.500S12 12 15 12s3 1.500 6 1.500"/>'),
  cloture: svg('<path d="M5 20V8l1.500-3L8 8v12M11 20V8l1.500-3L14 8v12M17 20V8l1.500-3L20 8v12M3 12h18M3 16h18"/>'),
  haie: svg('<path d="M3 20c0-6 2-9 4.500-9S10 13 10 13s.500-5 3.500-5 3.500 5 3.500 5 1-2 2.500-2S21 14 21 20z" fill="currentColor" fill-opacity=".25"/>'),
  jardin: svg('<path d="M3 20h18M6 20v-5M12 20v-8M18 20v-5"/><path d="M6 15c-2-1-2-3 0-4 2 1 2 3 0 4zM12 12c-2.500-1-2.500-4 0-5 2.500 1 2.500 4 0 5zM18 15c-2-1-2-3 0-4 2 1 2 3 0 4z" fill="currentColor" fill-opacity=".3"/>'),
  palmeraie: svg('<path d="M12 21V10"/><path d="M12 10c-1-4-5-5-8-3 3 0 5 1 8 3zM12 10c1-4 5-5 8-3-3 0-5 1-8 3zM12 10c-3-2-7 0-8 3 2-2 5-3 8-3zM12 10c3-2 7 0 8 3-2-2-5-3-8-3zM12 10c0-3 0-5 0-7" fill="currentColor" fill-opacity=".3"/>'),
  vent: svg('<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/>'),
  oeil: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".3"/>'),
  journal: svg('<path d="M5 4h11l3 3v13H5z" fill="currentColor" fill-opacity=".12"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  caravane: svg('<path d="M4 18v-5c0-2 1-3 3-3 1 0 1.500-2.500 3.500-2.500S13 10 14 10c2 0 2.500-3 4-4l1 2c-1 1-1 3-1 5v5M8 18v-4M14 18v-4" fill="currentColor" fill-opacity=".15"/>'),
  tempete: svg('<path d="M3 8c4-3 8 3 12 0s5-1 6 0M3 13c4-3 8 3 12 0s5-1 6 0M3 18c4-3 8 3 12 0s5-1 6 0"/>'),
  soleil: svg('<circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity=".3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  lune: svg('<path d="M19 14.500A8 8 0 1 1 9.500 5 6.500 6.500 0 0 0 19 14.500z" fill="currentColor" fill-opacity=".3"/>'),
  sable: svg('<path d="M3 19c3-5 6-5 9 0M10 19c2-4 5-4 7 0M15 19c1.500-2.500 3.500-2.500 6 0" fill="currentColor" fill-opacity=".25"/><path d="M6 8h3M12 6h4M9 11h5"/>'),
  faim: svg('<path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M5 5l14 14"/>'),
  chantier: svg('<path d="M14 4l6 6-3 3-6-6zM11 7L4 14v6h6l7-7" fill="currentColor" fill-opacity=".2"/>'),
  feuille: svg('<path d="M5 19C5 9 11 5 20 4c0 9-4 15-15 15z" fill="currentColor" fill-opacity=".25"/><path d="M5 19c3-5 7-8 11-10"/>'),
  annuler: svg('<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>'),
  rotation: svg('<path d="M20 12a8 8 0 1 1-3-6.200M20 4v5h-5"/>'),
  croix: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  coche: svg('<path d="M5 12.500l4.500 4.500L19 7.500" stroke-width="2.400"/>'),
  aide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 1-1 1.700M12 17v.100"/>'),
  reglages: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M19.100 4.900L17 7M7 17l-2.100 2.100"/>'),
  dossier: svg('<path d="M3 7h6l2 2h10v10H3z" fill="currentColor" fill-opacity=".15"/>'),
  corvee: svg('<path d="M4 20l9-9M13 11l3-3 4 4-3 3zM14 4l6 6" /><path d="M3 21h7" />'),
  foggara: svg('<path d="M3 17h18M5 17V9l2-2 2 2v8M11 17v-6l2-2 2 2v6M17 17v-4l1.500-1.500L20 13v4"/>'),
  eauVue: svg('<path d="M12 3c3.500 4.200 6 7.300 6 10.300a6 6 0 0 1-12 0C6 10.300 8.500 7.200 12 3z"/><path d="M9.500 14a2.500 2.500 0 0 0 2.500 2.500"/>'),
  horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.500 2"/>'),
  fleche: svg('<path d="M12 20V5M6 11l6-6 6 6" stroke-width="2.400"/>'),
  maison: svg('<path d="M4 11l8-6 8 6v9H4z" fill="currentColor" fill-opacity=".2"/><path d="M10 20v-5h4v5"/>'),
};

export function ico(nom: string): string {
  return ICO[nom] ?? '';
}
