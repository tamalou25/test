import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/inter/index.css';
import './ui/style.css';
import { Jeu } from './jeu/jeu';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const chargement = document.createElement('div');
chargement.className = 'chargement';
chargement.innerHTML = '<div><h1>Séguia</h1><div class="jauge"><i style="width:4%"></i></div></div>';
ui.appendChild(chargement);
const barre = chargement.querySelector('i') as HTMLElement;

function erreurFatale(e: unknown) {
  console.error(e);
  const message = e instanceof Error ? e.message : String(e);
  chargement.innerHTML = `<div style="max-width:560px;padding:20px;line-height:1.5">
    <h1 style="font-size:40px">Séguia</h1>
    <p>Le jeu n’a pas pu démarrer.</p>
    <p style="color:#f0c88f">${message.replace(/</g, '&lt;')}</p>
    <p>Si le message parle de WebGL : mettez à jour le pilote de la carte graphique, puis relancez le jeu.</p></div>`;
  if (!chargement.isConnected) ui.appendChild(chargement);
}

async function demarrer() {
  const essai = document.createElement('canvas').getContext('webgl2');
  if (!essai) throw new Error('WebGL 2 est indisponible sur cet ordinateur.');
  const jeu = new Jeu(canvas, ui);
  await jeu.demarrer((p) => {
    barre.style.width = Math.round(p * 100) + '%';
  });
  chargement.remove();
  (window as any).__seguiaReady = true;
}

demarrer().catch(erreurFatale);
