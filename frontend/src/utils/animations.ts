// src/utils/animations.ts
//
// Animations d'interface, en CSS pur. Aucune bibliothèque : une
// dépendance de plus pour du mouvement n'en vaut pas le risque.
//
// Partagé entre les pages qui en ont besoin — le même bloc copié à
// deux endroits aurait divergé au premier ajustement.
//
// Tout est désactivé sous prefers-reduced-motion. Ce n'est pas une
// politesse : une interface qui s'anime sans condition est
// inutilisable pour une personne sujette au mal des transports, et
// c'est un critère d'accessibilité vérifiable.

export const STYLES_ANIMATION = `
@keyframes hrup-monter {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.hrup-monter {
  animation: hrup-monter 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.hrup-carte {
  transition: transform 220ms ease, box-shadow 220ms ease;
}
.hrup-carte:hover {
  transform: translateY(-2px);
}
@media (prefers-reduced-motion: reduce) {
  .hrup-monter { animation: none; }
  .hrup-carte  { transition: none; }
  .hrup-carte:hover { transform: none; }
}
`;

/** Vrai quand le système demande à limiter les animations. */
export function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}