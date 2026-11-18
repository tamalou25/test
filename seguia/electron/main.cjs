'use strict';
/**
 * Processus principal Electron de Séguia.
 * Le jeu (dist/, produit par Vite) est servi par le protocole privilégié app://seguia/.
 */
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSaveService } = require('./saves.cjs');

const APP_HOST = 'seguia';
const APP_ORIGIN = `app://${APP_HOST}`;
const START_URL = `${APP_ORIGIN}/index.html`;
const DIST_DIR = path.join(__dirname, '..', 'dist'); // fonctionne aussi dans app.asar
const TEST_MODE = process.env.SEGUIA_TEST === '1';

// --- Identité et dossiers ----------------------------------------------------------
// Doit précéder 'ready' : userData = %APPDATA%\Seguia (Windows), ~/.config/Seguia (Linux).
app.setName('Seguia');
if (process.env.SEGUIA_USERDATA) {
  app.setPath('userData', path.resolve(process.env.SEGUIA_USERDATA));
}

// Rendu logiciel pour les tests sous Linux sans GPU (Xvfb).
if (TEST_MODE && process.platform === 'linux') {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// Instance unique (le verrou dépend de userData, d'où l'ordre ci-dessus).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  /** @type {BrowserWindow | null} */
  let win = null;
  let saves = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  // --- Sécurité : aucune navigation externe, aucune nouvelle fenêtre ----------------
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guard = (ev, url) => {
      if (!isAppUrl(url)) ev.preventDefault();
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-frame-navigate', (ev) => {
      if (!isAppUrl(ev.url)) ev.preventDefault();
    });
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });

  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAppProtocol();

    saves = createSaveService(path.join(app.getPath('userData'), 'saves'));
    registerIpc(() => win, saves);

    // Refuse toute demande de permission (caméra, notifications…) ; le jeu n'en a pas besoin.
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'fullscreen' || permission === 'pointerLock');
    });

    win = createWindow();
    win.on('closed', () => {
      win = null;
    });
  });
}

function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'app:' && u.host === APP_HOST;
  } catch {
    return false;
  }
}

function registerAppProtocol() {
  const root = path.resolve(DIST_DIR);
  protocol.handle('app', async (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Requête invalide', { status: 400 });
    }
    if (url.host !== APP_HOST) return new Response('Introuvable', { status: 404 });

    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Requête invalide', { status: 400 });
    }
    if (rel.includes('\0')) return new Response('Requête invalide', { status: 400 });
    if (rel === '' || rel === '/') rel = '/index.html';

    const abs = path.normalize(path.join(root, rel));
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      return new Response('Accès refusé', { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(abs).href);
    } catch {
      return new Response('Introuvable', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Séguia',
    backgroundColor: '#14100c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // le preload n'utilise que contextBridge et ipcRenderer
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: TEST_MODE || !app.isPackaged,
    },
  });
  win.removeMenu();
  // Garde le titre « Séguia » même si la page en change.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.once('ready-to-show', () => win.show());

  // Fermer la fenêtre enregistre d'abord la partie : on prévient la page, qui répond quand c'est écrit.
  // Filet de sécurité : au bout de trois secondes, on ferme quoi qu'il arrive.
  let fermetureDemandee = false;
  win.on('close', (e) => {
    if (fermetureDemandee || win.webContents.isDestroyed()) return;
    fermetureDemandee = true;
    e.preventDefault();
    win.webContents.send('seguia:avantFermeture');
    setTimeout(() => {
      if (!win.isDestroyed()) win.close();
    }, 3000);
  });
  ipcMain.on('seguia:fermetureOk', (event) => {
    if (event.sender !== win.webContents) return;
    fermetureDemandee = true;
    if (!win.isDestroyed()) win.close();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && !input.alt && !input.control && !input.meta) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.loadURL(START_URL);
  return win;
}

/** Les réponses IPC transportent { ok, value | message } pour garder des messages d'erreur propres. */
function registerIpc(getWin, saves) {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) {
        return { ok: false, message: 'Appel refusé : origine inconnue.' };
      }
      try {
        return { ok: true, value: await fn(...args) };
      } catch (err) {
        return { ok: false, message: (err && err.message) || String(err) };
      }
    });
  };

  handle('seguia:saves:location', () => saves.location());
  handle('seguia:saves:list', () => saves.list());
  handle('seguia:saves:write', (slot, content) => saves.write(slot, content));
  handle('seguia:saves:read', (slot) => saves.read(slot));
  handle('seguia:saves:readBackup', (slot) => saves.readBackup(slot));
  handle('seguia:saves:remove', (slot) => saves.remove(slot));
  handle('seguia:saves:openFolder', async () => {
    await saves.ensureDir();
    const err = await shell.openPath(saves.dir);
    if (err) throw new Error(`Impossible d'ouvrir le dossier ${saves.dir} : ${err}`);
  });

  handle('seguia:app:version', () => app.getVersion());
  handle('seguia:app:quit', () => {
    setImmediate(() => app.quit());
  });
  handle('seguia:app:setFullscreen', (on) => {
    const w = getWin();
    if (w) w.setFullScreen(Boolean(on));
  });
  handle('seguia:app:isFullscreen', () => {
    const w = getWin();
    return w ? w.isFullScreen() : false;
  });

  // Lu une seule fois, de façon synchrone, par le preload.
  ipcMain.on('seguia:testMode', (event) => {
    event.returnValue = TEST_MODE;
  });
}
