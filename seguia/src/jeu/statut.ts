/**
 * État d'un bâtiment tel qu'on l'explique au joueur : ce qui ne va pas, pourquoi, et quoi faire.
 */
import {
  aEauPotable,
  B,
  BATIMENTS,
  besoinEau,
  type Batiment,
  type Cache,
  type GameState,
} from '../sim';

export type Niveau = 'ok' | 'chantier' | 'attention' | 'arret';

export interface Statut {
  niveau: Niveau;
  /** pictogramme affiché au-dessus du bâtiment : goutte, bras, sable, pause, pain, chantier */
  icone: '' | 'goutte' | 'bras' | 'sable' | 'pause' | 'faim' | 'chantier' | 'feuille';
  titre: string;
  cause: string;
  remede: string;
}

const OK: Statut = { niveau: 'ok', icone: '', titre: 'En service', cause: '', remede: '' };

function sableMoyen(s: GameState, b: Batiment): number {
  let t = 0;
  for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) t += s.sable[(b.z + dz) * 44 + b.x + dx];
  return t / (b.w * b.d);
}

export function statutDe(s: GameState, c: Cache, b: Batiment): Statut {
  const def = BATIMENTS[b.kind];
  if (b.chantier < 1) {
    return {
      niveau: 'chantier',
      icone: 'chantier',
      titre: `En chantier (${Math.floor(b.chantier * 100)} %)`,
      cause: 'Les ouvriers libres bâtissent.',
      remede: c.ouvriersLibres < 1 ? 'Aucun bras libre : le chantier avance au ralenti.' : '',
    };
  }
  if (b.pause) {
    return {
      niveau: 'arret',
      icone: 'pause',
      titre: b.kind === 'jardin' || b.kind === 'palmeraie' ? 'En jachère' : 'À l’arrêt',
      cause: 'Vous l’avez mis à l’arrêt : il ne prend ni eau ni bras.',
      remede: 'Relancez-le avec le bouton ci-dessous.',
    };
  }
  if (b.kind === 'maison') {
    if (!aEauPotable(s, b.x + b.w / 2, b.z + b.d / 2)) {
      return {
        niveau: 'arret',
        icone: 'goutte',
        titre: 'Pas d’eau potable',
        cause: `Aucune fontaine en eau à moins de ${B.fontaineRayon} cases.`,
        remede: 'Bâtissez une fontaine contre une séguia en eau, près d’ici.',
      };
    }
    if (s.faim > 0) {
      return {
        niveau: 'arret',
        icone: 'faim',
        titre: 'Famine',
        cause: 'Les greniers sont vides : les habitants partent.',
        remede: 'Plantez des jardins, ou achetez des vivres à une caravane à l’étape.',
      };
    }
    return OK;
  }
  if (b.kind === 'jardin' || b.kind === 'palmeraie') {
    const sab = sableMoyen(s, b);
    if (sab > (b.kind === 'jardin' ? 0.5 : 0.7)) {
      return {
        niveau: 'arret',
        icone: 'sable',
        titre: 'Enseveli sous le sable',
        cause: 'La tempête a recouvert la parcelle : l’eau n’y entre plus.',
        remede: 'Les ouvriers libres la dégagent. Une corvée va plus vite ; un brise-vent évite que ça recommence.',
      };
    }
  }
  // raccordement à l'eau
  if (def.branche && b.kind !== 'puits') {
    if (!c.branchement.has(b.id)) {
      return {
        niveau: 'arret',
        icone: 'goutte',
        titre: 'Non raccordé',
        cause:
          b.kind === 'noria'
            ? 'La noria doit toucher une séguia en eau à son niveau et une séguia un niveau plus haut.'
            : 'Aucune séguia où l’eau arrive ne touche ce bâtiment (l’eau ne remonte pas les terrasses).',
        remede: 'Amenez une séguia à son contact, depuis l’amont.',
      };
    }
    const besoin = besoinEau(s, c, b);
    if (besoin > 0 && b.eauRatio < 0.4) {
      return {
        niveau: 'arret',
        icone: 'goutte',
        titre: `À sec (${Math.round(b.eauRatio * 100)} % du besoin)`,
        cause: 'L’amont boit tout avant lui.',
        remede: 'Donnez plus de poids à sa branche au répartiteur, mettez une parcelle d’amont en jachère ou ouvrez une citerne.',
      };
    }
    if (besoin > 0 && b.eauRatio < 0.9) {
      return {
        niveau: 'attention',
        icone: 'goutte',
        titre: `Manque d’eau (${Math.round(b.eauRatio * 100)} % du besoin)`,
        cause: 'Il reçoit moins que ce qu’il lui faut.',
        remede: 'Réglez le répartiteur en amont ou réduisez les pertes (canal maçonné, ombre des palmiers).',
      };
    }
  }
  if (b.kind === 'puits' && !c.branchement.has(b.id)) {
    return {
      niveau: 'arret',
      icone: 'goutte',
      titre: 'Sans débouché',
      cause: 'Aucune séguia voisine au même niveau ou plus bas.',
      remede: 'Tracez une séguia au contact du puits.',
    };
  }
  if (b.kind === 'jardin' && b.sante <= 0) {
    return {
      niveau: 'arret',
      icone: 'feuille',
      titre: 'Récolte perdue',
      cause: 'Le jardin a séché sur pied.',
      remede: 'Dès que l’eau revient, il repart de zéro.',
    };
  }
  if (b.kind === 'palmeraie' && b.sante < 0.5) {
    return {
      niveau: 'attention',
      icone: 'feuille',
      titre: b.sante <= 0 ? 'Palmiers morts' : 'Palmiers qui jaunissent',
      cause: 'Trop longtemps sans assez d’eau.',
      remede: 'Rendez-lui l’eau : une palmeraie met cinq jours à repousser.',
    };
  }
  if (def.ouvriers > 0 && b.personnel < 0.999) {
    const pourvus = Math.round(b.personnel * def.ouvriers * 10) / 10;
    return {
      niveau: b.personnel <= 0 ? 'arret' : 'attention',
      icone: 'bras',
      titre: s.corvee ? 'Tout le monde est à la corvée' : `Manque de bras (${pourvus}/${def.ouvriers})`,
      cause: s.corvee ? 'La corvée de curage a vidé les postes.' : 'Un habitant sur deux travaille, et les postes prioritaires sont servis d’abord.',
      remede: s.corvee ? 'Arrêtez la corvée quand les séguias sont dégagées.' : 'Bâtissez des maisons (avec fontaine et vivres) ou mettez un autre bâtiment à l’arrêt.',
    };
  }
  if (b.kind === 'bassin' && b.stock < 5) {
    return {
      niveau: 'attention',
      icone: 'goutte',
      titre: 'Bassin vide',
      cause: 'Une caravane ne s’arrête que s’il contient au moins un quart de sa soif.',
      remede: 'Amenez-y plus d’eau avant la prochaine caravane.',
    };
  }
  return OK;
}
