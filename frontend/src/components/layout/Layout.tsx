// src/components/layout/Layout.tsx
//
// Coquille des pages connectées : barre latérale, en-tête, contenu.
//
// ── Correction ─────────────────────────────────────────────────────
//
// Le fond était écrit « bg-stone-100 », une valeur littérale que
// Tailwind compile en couleur fixe : elle échappe aux variables de
// palette, donc toutes les pages seraient restées crème en mode
// sombre. Il passe à bg-stone-50, qui s'inverse.
//
// Les décalages suivent la barre élargie — ms-64 au lieu de ms-52,
// pt-16 au lieu de pt-14. Ces trois nombres doivent rester d'accord
// avec Sidebar (w-64) et TopNav (h-16, start-64) : s'ils divergent, le
// contenu passe sous la barre sans que rien ne le signale.

import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

interface LayoutProps {
  children: ReactNode;

  /**
   * @deprecated Sans effet, conservé pour ne pas casser les pages qui
   * le passent encore.
   *
   * L'intention était un champ de recherche global dans l'en-tête.
   * Mais chaque page qui transmet cette propriété — candidatures,
   * congés, documents — possède déjà son propre champ, placé près des
   * filtres qu'il accompagne et branché sur sa propre liste. Un second
   * champ dans le bandeau ferait doublon, et un champ de recherche qui
   * ne cherche rien apprend à l'utilisateur que l'interface ment.
   *
   * À retirer des pages quand tu en auras le temps ; d'ici là, le
   * laisser ici évite cinq erreurs de compilation pour rien.
   */
  searchPlaceholder?: string;

  /** Largeur maximale du contenu. « large » convient aux tableaux qui
   *  ont besoin de toute la place ; la valeur par défaut garde des
   *  lignes de texte lisibles. */
  largeur?: 'normale' | 'large';
}

export default function Layout({ children, largeur = 'normale' }: LayoutProps) {
  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar />
      <TopNav />

      <main className="ms-64 pt-16 min-h-screen">
        <div
          className={'p-6 mx-auto '
            + (largeur === 'large' ? 'max-w-none' : 'max-w-7xl')}
        >
          {children}
        </div>
      </main>
    </div>
  );
}