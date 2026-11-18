'use strict';
/**
 * Preload (bac à sable) : expose window.seguiaBridge conformément à src/platform/bridge.d.ts.
 * Seuls contextBridge et ipcRenderer sont utilisés (compatibles sandbox: true).
 */
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && res.ok) return res.value;
  throw new Error((res && res.message) || 'Erreur inconnue du processus principal.');
}

let testMode = false;
try {
  testMode = ipcRenderer.sendSync('seguia:testMode') === true;
} catch {
  testMode = false;
}

const bridge = {
  saves: {
    location: () => call('seguia:saves:location'),
    list: () => call('seguia:saves:list'),
    write: (slot, content) => call('seguia:saves:write', slot, content),
    read: (slot) => call('seguia:saves:read', slot),
    readBackup: (slot) => call('seguia:saves:readBackup', slot),
    remove: (slot) => call('seguia:saves:remove', slot),
    openFolder: () => call('seguia:saves:openFolder'),
  },
  app: {
    version: () => call('seguia:app:version'),
    quit: () => call('seguia:app:quit'),
    setFullscreen: (on) => call('seguia:app:setFullscreen', Boolean(on)),
    isFullscreen: () => call('seguia:app:isFullscreen'),
    // la fenêtre va se fermer : le jeu enregistre la partie puis confirme
    onAvantFermeture: (rappel) => {
      ipcRenderer.on('seguia:avantFermeture', () => rappel());
    },
    fermetureOk: () => ipcRenderer.send('seguia:fermetureOk'),
  },
  testMode,
};

contextBridge.exposeInMainWorld('seguiaBridge', bridge);
