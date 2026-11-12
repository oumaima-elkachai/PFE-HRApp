// src/components/ui/Pagination.tsx
//
// Pagination cliente, suffisante tant que les volumes restent de
// l'ordre de la centaine de lignes : tout est déjà chargé pour les
// filtres et les statistiques.

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  taillePage: number;
  total: number;
  onPage: (p: number) => void;
  libelle?: string;
  accent?: string;
}

export default function Pagination({
  page, taillePage, total, onPage,
  libelle = 'élément', accent = '#4F46E5',
}: Props) {
  const nbPages = Math.max(1, Math.ceil(total / taillePage));

  // Fenêtre glissante de cinq pages : au-delà, la liste des numéros
  // deviendrait plus longue que le tableau.
  const premiere = Math.max(0, Math.min(page - 2, nbPages - 5));
  const pages = Array.from(
    { length: Math.min(5, nbPages - premiere) },
    (_, i) => premiere + i
  );

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100 bg-stone-50">
      <span className="text-xs text-stone-500">
        {total} {libelle}{total > 1 ? 's' : ''} affichée{total > 1 ? 's' : ''}
      </span>

      {nbPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" style={{ color: accent }} />
          </button>

          {premiere > 0 && <span className="text-xs text-stone-400 px-0.5">…</span>}

          {pages.map((p) => (
            <button
              key={p}
              onClick={() => onPage(p)}
              className="w-6 h-6 rounded-md text-xs font-semibold transition-colors"
              style={{
                backgroundColor: p === page ? accent : 'transparent',
                color: p === page ? 'white' : accent,
              }}
            >
              {p + 1}
            </button>
          ))}

          {premiere + 5 < nbPages && <span className="text-xs text-stone-400 px-0.5">…</span>}

          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= nbPages - 1}
            className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 transition-colors"
          >
            <ChevronRight className="w-4 h-4" style={{ color: accent }} />
          </button>
        </div>
      )}
    </div>
  );
}