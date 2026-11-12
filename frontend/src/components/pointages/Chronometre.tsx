// src/components/pointage/Chronometre.tsx
//
// Durées réellement mesurées par le module de reconnaissance
// faciale, affichées sous la vidéo.
//
// Partagé par la page d'enrôlement et le modal de pointage : le
// laisser dans l'une des deux obligeait l'autre à importer depuis une
// page, ce qui croise les dépendances sans raison.

import { useState, useEffect } from 'react';
import { chronos } from '../../lib/visage';

// ── Chronomètre ─────────────────────────────────────────────────────
//
// Affiche les durées réellement mesurées. « C'est lent » ne permet
// pas de choisir entre le téléchargement des poids, un moteur de
// calcul émulé, le détecteur et le réseau de reconnaissance ; ces
// trois chiffres, oui.

export default function Chronometre() {
  const [c, setC] = useState(chronos());

  // Relevé périodique : les durées se remplissent au fil des analyses,
  // et un affichage figé au montage resterait à zéro.
  useEffect(() => {
    const t = setInterval(() => setC(chronos()), 700);
    return () => clearInterval(t);
  }, []);

  if (!c.backend) return null;

  return (
    <div className="mt-2 text-center">
      <p className="text-[10px] text-stone-400 font-mono">
        {c.backend} · chargement {c.chargementMs} ms · cadrage {c.vivaciteMs} ms
        {c.descripteurMs > 0 && ` · descripteur ${c.descripteurMs} ms`}
      </p>

      {/* Chrome privé d'accélération matérielle fournit quand même
          WebGL, émulé en logiciel : le nom du moteur dit « webgl »
          pendant que tout se calcule sur le processeur central. Seule
          la durée le révèle. */}
      {c.suspect && (
        <p className="text-[10px] text-amber-600 leading-relaxed mt-1">
          Ces durées indiquent un calcul non accéléré. Ouvrez
          <span className="font-mono"> chrome://gpu</span> : si WebGL y est
          « Software only », activez l'accélération matérielle dans
          <span className="font-mono"> chrome://settings/system</span>, puis
          redémarrez le navigateur.
        </p>
      )}
    </div>
  );
}