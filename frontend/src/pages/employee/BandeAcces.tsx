// src/components/employee/BandeAcces.tsx
//
// Deux accès que le tableau de bord n'offrait pas : l'agenda du salarié
// et son dossier. Le composant compte lui-même ses pièces en attente —
// aucune propriété à câbler, aucune ligne à ajouter dans EmplDash en
// dehors de l'import et de la balise.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, FolderOpen, ArrowRight, AlertTriangle,
} from 'lucide-react';
import api from '@/services/api';

export default function BandeAcces() {
  const navigate = useNavigate();
  const [echeances, setEcheances] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/dossier/mes-pieces') as any;
        const lignes: any[] = res?.data?.lignes ?? [];
        // Une pièce manquante ou périmée appelle une action ; une pièce
        // en cours d'examen par la RH n'en appelle aucune.
        setEcheances(lignes.filter(
          (l) => l.statut === 'MANQUANTE' || l.statut === 'EXPIREE'
        ).length);
      } catch {
        // Le dossier indisponible ne doit pas priver le salarié des
        // deux liens : on affiche la carte sans compteur.
        setEcheances(0);
      }
    })();
  }, []);

  const acces: {
    titre: string; detail: string; route: string;
    icone: React.ComponentType<{ className?: string }>;
    fond: string; texte: string; alerte?: boolean;
  }[] = [
    {
      titre: 'Mon agenda',
      detail: 'Congés, événements et échéances',
      route: '/employe/agenda',
      icone: CalendarDays,
      fond: 'bg-brand-500/10', texte: 'text-brand-texte',
    },
    {
      titre: 'Mes documents',
      detail: echeances > 0
        ? `${echeances} pièce${echeances > 1 ? 's' : ''} à fournir`
        : 'Dossier et attestations',
      route: '/employe/documents',
      icone: FolderOpen,
      fond: echeances > 0 ? 'bg-amber-50' : 'bg-brand-500/10',
      texte: echeances > 0 ? 'text-amber-600' : 'text-brand-texte',
      alerte: echeances > 0,
    },
  ];

  // h-full : posée dans une colonne qui doit s'aligner sur la carte
  // voisine, la bande occupe la hauteur restante. Hors d'un parent de
  // hauteur contrainte, la règle n'a aucun effet.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
      {acces.map((a) => {
        const Icone = a.icone;
        return (
          <button
            key={a.route}
            onClick={() => navigate(a.route)}
            className={`bg-surface rounded-2xl shadow-sm border p-5 flex items-center gap-4 text-start transition-shadow hover:shadow-md ${
              a.alerte ? 'border-amber-200' : 'border-stone-100'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${a.fond}`}>
              <Icone className={`w-5 h-5 ${a.texte}`} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-stone-800">{a.titre}</div>
              <p className={`text-xs mt-0.5 flex items-center gap-1 ${
                a.alerte ? 'text-amber-600 font-semibold' : 'text-stone-500'
              }`}>
                {a.alerte && <AlertTriangle className="w-3 h-3" />}
                {a.detail}
              </p>
            </div>

            <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}