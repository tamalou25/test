// Lit les métadonnées de version d'un .exe Windows sans Wine (via resedit, dépendance de @electron/packager).
// Usage : node scripts/inspect-win-exe.mjs <chemin/Seguia.exe>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) {
  console.error('Usage : node scripts/inspect-win-exe.mjs <Seguia.exe>');
  process.exit(2);
}
const req = createRequire(createRequire(import.meta.url).resolve('@electron/packager'));
const ResEdit = await import(req.resolve('resedit'));
const { NtExecutable, NtExecutableResource, Resource } = ResEdit.default ?? ResEdit;

const ne = NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = NtExecutableResource.from(ne);
const [vi] = Resource.VersionInfo.fromEntries(res.entries);
if (!vi) {
  console.error('Aucune ressource VERSIONINFO.');
  process.exit(1);
}
const fixed = vi.fixedInfo;
const v = (ms, ls) => `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
const out = {
  fichier: path.basename(exe),
  FileVersion: v(fixed.fileVersionMS, fixed.fileVersionLS),
  ProductVersion: v(fixed.productVersionMS, fixed.productVersionLS),
  chaines: {},
  icones: res.entries.filter((e) => e.type === 14).length,
};
for (const lang of vi.getAllLanguagesForStringValues()) {
  out.chaines[`${lang.lang}/${lang.codepage}`] = vi.getStringValues(lang);
}
console.log(JSON.stringify(out, null, 2));
