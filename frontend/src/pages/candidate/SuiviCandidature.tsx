// src/components/candidat/SuiviCandidature.tsx
//
// Frise du parcours de recrutement. Un statut textuel ne dit rien au
// candidat sur ce qui l'attend : la frise montre le chemin parcouru
// et ce qui reste.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// Les couleurs étaient écrites en hexadécimal, dans des constantes
// locales — dont une nommée GREEN qui contenait un indigo. Le jour où
// la marque change de teinte, ce fichier reste en arrière et la frise
// jure avec le reste de la page. Tout passe par les jetons Tailwind,
// comme partout ailleurs.

import {
  Check, Circle, X, FileText, Search, ClipboardCheck,
  Users, Handshake, PartyPopper, Clock, MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EtapeHistorique {
  statut: string;
  date: string;
  commentaire?: string;
}

interface Props {
  statut: string;
  historique?: EtapeHistorique[];
  compact?: boolean;
  /** Fourni par la page : active le bouton d'accès à la messagerie. */
  candidatureId?: string;
}

// Le parcours nominal. REFUSE n'y figure pas : c'est une sortie
// possible à chaque étape, pas une étape en soi.
const PARCOURS = [
  {
    cle: 'SOUMIS',
    titre: 'Candidature reçue',
    description: 'Votre dossier a été enregistré et analysé',
    icone: FileText,
  },
  {
    cle: 'PRESELECTION',
    titre: 'Présélection',
    description: 'Votre profil correspond au poste',
    icone: Search,
  },
  {
    cle: 'QUIZ',
    titre: 'Évaluation technique',
    description: 'Un quiz mesure vos compétences',
    icone: ClipboardCheck,
    // Trois statuts distincts correspondent à cette même étape.
    statuts: ['QUIZ_EN_ATTENTE', 'QUIZ_ENVOYE', 'QUIZ_TERMINE'],
  },
  {
    cle: 'ENTRETIEN',
    titre: 'Entretien',
    description: "Rencontre avec l’équipe de recrutement",
    icone: Users,
  },
  {
    cle: 'OFFRE',
    titre: 'Proposition',
    description: 'Une offre vous est adressée',
    icone: Handshake,
  },
  {
    cle: 'EMBAUCHE',
    titre: 'Bienvenue',
    description: 'Votre recrutement est confirmé',
    icone: PartyPopper,
  },
];

/** Position de l'étape courante dans le parcours nominal. */
function indiceDe(statut: string): number {
  if (statut === 'REFUSE') return -1;
  return PARCOURS.findIndex(
    (e) => e.cle === statut || (e.statuts ?? []).includes(statut)
  );
}

function dateDe(
  historique: EtapeHistorique[] | undefined,
  etape: typeof PARCOURS[number],
) {
  if (!historique) return null;
  const cles = [etape.cle, ...(etape.statuts ?? [])];
  return historique.find((h) => cles.includes(h.statut))?.date ?? null;
}

export default function SuiviCandidature({
  statut, historique, compact, candidatureId,
}: Props) {
  const navigate = useNavigate();
  const refuse = statut === 'REFUSE';
  const courant = indiceDe(statut);

  // Sur un refus, la dernière étape atteinte se lit dans l'historique :
  // elle indique jusqu'où le dossier est allé.
  const derniereAtteinte = refuse && historique
    ? Math.max(...historique.map((h) => indiceDe(h.statut)), 0)
    : courant;

  // ── Version compacte ──────────────────────────────────────────────

  if (compact) {
    const total = PARCOURS.length;
    const atteintes = Math.max(0, derniereAtteinte + 1);

    return (
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
          <span className="text-stone-500 truncate">
            {refuse ? 'Parcours interrompu' : PARCOURS[courant]?.titre ?? 'En cours'}
          </span>
          <span className="text-stone-400 shrink-0">{atteintes} / {total}</span>
        </div>

        <div className="flex gap-1">
          {PARCOURS.map((e, i) => (
            <div
              key={e.cle}
              className={`h-1.5 flex-1 rounded-full ${
                i > derniereAtteinte ? 'bg-stone-200'
                  : refuse ? 'bg-red-400'
                  : 'bg-brand-500'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Version complète ──────────────────────────────────────────────

  return (
    <div>
      {PARCOURS.map((etape, i) => {
        const Icone = etape.icone;
        const franchie = i < derniereAtteinte || (!refuse && i < courant);
        const active = !refuse && i === courant;
        const bloquee = refuse && i === derniereAtteinte;
        const aVenir = i > derniereAtteinte;

        const date = dateDe(historique, etape);
        const dernier = i === PARCOURS.length - 1;

        return (
          <div key={etape.cle} className="flex gap-4">

            {/* Colonne du jalon et du trait de liaison */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  franchie ? 'bg-brand-500'
                    : active ? 'bg-brand-500/10 border-2 border-brand-500'
                    : bloquee ? 'bg-red-50'
                    : 'bg-stone-100'
                }`}
              >
                {franchie ? (
                  <Check className="w-4 h-4 text-white" />
                ) : bloquee ? (
                  <X className="w-4 h-4 text-red-500" />
                ) : active ? (
                  <Icone className="w-4 h-4 text-brand-texte" />
                ) : (
                  <Circle className="w-3 h-3 text-stone-300" />
                )}
              </div>

              {!dernier && (
                <div
                  className={`w-0.5 flex-1 min-h-7 ${
                    franchie ? 'bg-brand-500' : 'bg-stone-200'
                  }`}
                />
              )}
            </div>

            {/* Contenu de l'étape */}
            <div className={`min-w-0 flex-1 ${dernier ? '' : 'pb-6'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`text-sm ${
                    aVenir ? 'text-stone-400' : 'text-stone-800'
                  } ${active ? 'font-bold' : 'font-semibold'}`}
                >
                  {etape.titre}
                </h4>

                {active && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-texte">
                    <Clock className="w-3 h-3" />
                    En cours
                  </span>
                )}

                {bloquee && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                    Non retenu à cette étape
                  </span>
                )}
              </div>

              <p className={`text-xs mt-0.5 ${aVenir ? 'text-stone-300' : 'text-stone-500'}`}>
                {etape.description}
              </p>

              {date && (
                <p className="text-xs mt-1 text-stone-400">
                  {new Date(date).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {refuse && (
        <div className="mt-4 rounded-xl px-4 py-3 text-sm bg-stone-50 text-stone-500 leading-relaxed">
          Votre candidature n'a pas été retenue pour ce poste. Votre profil
          reste dans notre vivier : nous vous recontacterons si une opportunité
          correspond mieux à votre parcours.
        </div>
      )}

      {/* Sans ce point d'entrée, la messagerie n'est atteignable que
          depuis une liste qui reste vide tant que personne n'a écrit. */}
      {candidatureId && (
        <button
          onClick={() => navigate(`/messages/${candidatureId}`)}
          className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-stone-200 text-brand-texte hover:bg-stone-50 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          {refuse ? 'Consulter les échanges' : 'Écrire au recruteur'}
        </button>
      )}
    </div>
  );
}