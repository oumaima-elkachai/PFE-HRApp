// src/pages/employee/MesCongesPage.tsx
//
// Congés du salarié : son solde, ses demandes, et le formulaire pour
// en faire une nouvelle. Le solde prévisionnel compte autant que le
// solde actuel — c'est lui qui dit si une demande passera.
//
// ── Ce qui a changé, et pourquoi ────────────────────────────────────
//
// 1. LA PIÈCE JOINTE NE PARTAIT PAS. La page appelait
//    « congesService.demanderAvecPiece » — une méthode qui n'existait
//    pas. Joindre un fichier levait « is not a function ». Et comme
//    le congé maladie EXIGEAIT un justificatif, le bouton d'envoi
//    n'était actif qu'avec un fichier : un arrêt maladie ne pouvait
//    donc pas être demandé du tout. La méthode est désormais écrite
//    dans services/conges.ts.
//
// 2. TROIS TYPES DE CONGÉ MANQUAIENT CÔTÉ INTERFACE. Le serveur
//    accepte sept types — « TYPES_VALIDES » dans demander.js — et le
//    frontal n'en déclarait que quatre dans TYPES_CONGE. Maternité,
//    paternité et décès étaient donc impossibles à demander depuis
//    l'application, alors que le serveur sait les traiter et exige
//    une pièce pour chacun. Les deux listes sont réalignées.
//
//    (J'avais d'abord conclu l'inverse — que ces trois types étaient
//    du code mort — en lisant une version de demander.js antérieure
//    de deux semaines, qui n'en comptait que quatre.)
//
// 3. LE VIOLET N'ÉTAIT PAS CELUI DE LA PALETTE. « purple-* » n'existe
//    pas dans theme.css : Tailwind le compilait avec son violet
//    d'usine, hors charte et insensible au mode sombre.
//
// 4. « APPROUVÉ » PORTAIT LA COULEUR DE LA MARQUE. L'indigo sert à
//    l'action et à l'en-cours ; une validation est verte. Sans quoi
//    le bandeau d'un congé accordé ressemblait à un bouton.
//
// 5. L'EXPORT CSV COUPAIT SUR LES MOTIFS. Les champs n'étaient pas
//    encadrés : un commentaire RH contenant un point-virgule ou un
//    retour à la ligne décalait toutes les colonnes suivantes.
//
// 6. LE BANDEAU DE CONFIRMATION NE SE FERMAIT PAS TOUJOURS. Sa
//    minuterie dépendait de « onClose », recréée à chaque rendu du
//    parent : chaque rendu relançait le compte à rebours.

import {
  useState, useEffect, useMemo, useCallback, useRef,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Plus, X, CheckCircle2, XCircle, Hourglass, ChevronRight,
  Search, Download, AlertTriangle, Palmtree, MessageSquare, CalendarDays,
  Upload, FileText, Paperclip, CalendarX, History,
  Stethoscope, Baby, Users, Flower2, CalendarMinus, CalendarClock, Info,
} from 'lucide-react';

import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { congesService, type Conge, type SoldeConges } from '../../services/conges';
import api from '../../services/api';
import { TYPES_CONGE } from '../../types/domaine';
import type { StatutConge, TypeConge } from '../../types/domaine';
import { useI18n, type Cle } from '@/i18n';
import {
  joursOuvrablesEntre, lendemainDe, dateAujourdhui,
} from  '@/services/Feries';

const PAR_PAGE = 8;

const TAILLE_MAX = 5 * 1024 * 1024;

const FORMATS_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Routes réelles du routeur. */
const ROUTES = {
  historique: '/employe/historique-pointage',
} as const;

/** Signale qu'une demande de congé vient d'être déposée.
 *
 *  Même mécanique que « hrup:pointage » : le tableau de bord affiche
 *  le solde, et restait sur une valeur périmée après une demande faite
 *  ici. Cette page l'émet après un envoi réussi, et l'écoute — une
 *  demande déposée ailleurs met celle-ci à jour aussi. */
const EVENEMENT_CONGES = 'hrup:conges';

// Les statuts qui réservent une période. Un congé refusé ne bloque
// rien : la date redevient libre.
const STATUTS_BLOQUANTS: string[] = ['EN_ATTENTE', 'APPROUVE'];

// ── Justificatifs ──────────────────────────────────────────────────
//
// Ces deux tables reflètent « src/conges/demander.js » :
//
//   JUSTIFICATIF_REQUIS = ["maladie","maternite","paternite","deces"]
//
// Le serveur répond 400 sans la pièce pour ces quatre types. La page
// applique donc la MÊME règle : laisser envoyer une demande que le
// serveur refusera fait perdre la saisie pour rien, et le salarié ne
// comprend pas pourquoi.
//
// Si la règle doit s'assouplir — un salarié malade n'a pas toujours
// son certificat le jour même — c'est « demander.js » qu'il faut
// changer d'abord. L'interface ne peut pas être plus permissive que
// le serveur.
const JUSTIFICATIF_REQUIS: Partial<Record<TypeConge, Cle>> = {
  maladie: 'cg.piece.maladie',
  maternite: 'cg.piece.maternite',
  paternite: 'cg.piece.paternite',
  deces: 'cg.piece.deces',
};

/** Facultatif, mais la RH arbitre mieux avec une pièce. */
const JUSTIFICATIF_SUGGERE: Partial<Record<TypeConge, Cle>> = {
  exceptionnel: 'cg.piece.exceptionnel',
};

/** Une icône par type de congé.
 *
 *  Le formulaire les présente en grille plutôt qu'en liste déroulante.
 *  Deux types partageant le même pictogramme donneraient l'impression
 *  d'un doublon, d'où sept symboles distincts — une fleur pour le
 *  décès, qui est la convention la plus sobre. */
const ICONE_TYPE: Record<string, any> = {
  annuel: Palmtree,
  maladie: Stethoscope,
  maternite: Baby,
  paternite: Users,
  deces: Flower2,
  sans_solde: CalendarMinus,
  exceptionnel: CalendarClock,
};

const iconeDe = (type: string) => ICONE_TYPE[type] ?? CalendarDays;

/** Libellé traduit d'un type de congé. */
const cleType = (t: string) => `cg.type.${t}` as Cle;

/** Libellé traduit d'un statut. */
const cleStatut = (s: string) => `cg.statut.${s}` as Cle;

// ── Styles ─────────────────────────────────────────────────────────
//
// Une couleur par sens, comme sur l'historique de pointage :
//   vert   → validé           ambre → en attente
//   rouge  → refusé           indigo → action, à venir
//
// « APPROUVE » portait l'indigo de la marque, qui sert à l'action :
// un congé accordé prenait l'air d'un bouton, et se confondait avec
// la pastille « à venir ».
const STYLE_STATUT: Record<StatutConge, {
  bg: string; text: string; barre: string; icone: any;
}> = {
  EN_ATTENTE: { bg: 'bg-amber-50', text: 'text-amber-600', barre: 'bg-amber-500', icone: Hourglass },
  APPROUVE: { bg: 'bg-green-50', text: 'text-green-700', barre: 'bg-green-500', icone: CheckCircle2 },
  REFUSE: { bg: 'bg-red-50', text: 'text-red-600', barre: 'bg-red-500', icone: XCircle },
};

const STYLE_DEFAUT = {
  bg: 'bg-stone-200', text: 'text-stone-600', barre: 'bg-stone-400', icone: Hourglass,
};

const styleStatut = (s: string) => STYLE_STATUT[s as StatutConge] ?? STYLE_DEFAUT;

/** Langue des formats de date. */
const loc = (langue: string) => (langue === 'ar' ? 'ar-TN' : langue);

/**
 * Ouvre le justificatif d'un congé dans un nouvel onglet.
 *
 * window.open refuse une URL blob: sur certains navigateurs lorsque
 * noopener est posé : passer par un lien contourne la restriction.
 */
async function voirJustificatif(congeId: string, messageDefaut: string) {
  try {
    const blob = await api.get(`/conges/${congeId}/justificatif`, {
      responseType: 'blob',
    }) as unknown as Blob;

    if (blob.type.includes('json')) {
      const texte = await blob.text();
      throw new Error(JSON.parse(texte)?.erreur ?? messageDefaut);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Révoquer trop tôt annule l'affichage : l'URL doit survivre au
    // chargement de la nouvelle fenêtre.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: any) {
    // L'intercepteur rejette avec le corps de la réponse, qui est un
    // Blob pour une requête binaire : il faut le lire pour obtenir le
    // message, sinon l'erreur reste opaque.
    if (e instanceof Blob) {
      const texte = await e.text();
      throw new Error(JSON.parse(texte)?.erreur ?? messageDefaut);
    }
    throw e;
  }
}

// ── Composants partagés ────────────────────────────────────────────

/** Le solde, en un seul bloc.
 *
 *  Il remplace quatre cartes PLUS une jauge, qui disaient la même
 *  chose deux fois : « solde disponible » en grand dans une carte, et
 *  le même nombre à droite de la jauge juste en dessous. Cinq objets
 *  pour trois chiffres.
 *
 *  Ici le chiffre qui compte est seul et grand, la barre montre la
 *  répartition, et le prévisionnel — celui qui dit si la PROCHAINE
 *  demande passera — se lit à côté sans lui disputer la place. */
function BlocSolde({ solde }: { solde: SoldeConges }) {
  const { t } = useI18n();

  // Les segments sont bornés : si le serveur renvoyait des utilisés et
  // des en-attente dont la somme dépasse le total, la barre déborderait
  // de son cadre.
  const part = (n: number) => (solde.total
    ? Math.max(0, Math.min(100, (n / solde.total) * 100))
    : 0);

  const Puce = ({ couleur, texte }: { couleur: string; texte: string }) => (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${couleur}`} />
      {texte}
    </span>
  );

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-200 p-6 mb-4 panneau">
      <div className="flex items-center gap-8 flex-wrap">

        <div className="shrink-0">
          <div className="text-5xl font-bold text-brand-texte leading-none tabular-nums">
            {solde.restants}
          </div>
          <div className="text-xs text-stone-500 mt-2">{t('cg.joursRestants')}</div>
          <div className="text-[10px] text-stone-400">
            {t('cg.surNAcquisCourt', { n: solde.total })}
          </div>
        </div>

        <div className="flex-1 min-w-60">
          <div
            role="progressbar"
            aria-valuenow={solde.utilises}
            aria-valuemin={0}
            aria-valuemax={solde.total}
            aria-label={t('cg.droitAnnuel')}
            className="h-3 bg-stone-100 rounded-full overflow-hidden flex"
          >
            <div
              className="h-full bg-green-500"
              style={{ width: `${part(solde.utilises)}%` }}
              title={t('cg.joursPrisTitre', { n: solde.utilises })}
            />
            <div
              className="h-full bg-amber-500"
              style={{ width: `${part(solde.enAttente)}%` }}
              title={t('cg.joursAttenteTitre', { n: solde.enAttente })}
            />
          </div>

          <div className="flex items-center gap-5 mt-3 text-[11px] text-stone-500 flex-wrap">
            <Puce couleur="bg-green-500" texte={t('cg.nPris', { n: solde.utilises })} />
            <Puce couleur="bg-amber-500" texte={t('cg.nAttente', { n: solde.enAttente })} />
            <Puce couleur="bg-stone-300" texte={t('cg.nDisponibles', { n: solde.restants })} />
          </div>
        </div>

        <div className="shrink-0 text-end">
          <div className="text-2xl font-bold text-violet-600 tabular-nums leading-none">
            {solde.previsionnels}
          </div>
          <div className="text-[10px] text-stone-400 mt-1.5 max-w-28">
            {t('cg.soldePrevisionnel')}
          </div>
        </div>
      </div>
    </div>
  );
}

/** La frise de l'année.
 *
 *  C'est la question qu'un écran de congés doit répondre d'un coup
 *  d'œil et que ni les cartes ni la liste ne répondaient : QUAND
 *  suis-je absent cette année ? Une liste paginée de huit lignes ne le
 *  dit pas ; une barre de douze mois, si.
 *
 *  Elle ne porte que les congés qui RÉSERVENT la période — accordés et
 *  en attente. Un congé refusé n'occupe aucun jour : le faire figurer
 *  sur une frise d'absences serait faux.
 *
 *  Cliquer un mois filtre la liste en dessous : la frise sert à
 *  naviguer, pas seulement à regarder. */
function FriseAnnee({ conges, annee, moisActif, surMois }: {
  conges: Conge[];
  annee: number;
  moisActif: number | null;
  surMois: (m: number | null) => void;
}) {
  const { t, langue } = useI18n();

  const JOUR = 86_400_000;
  const debutAnnee = new Date(annee, 0, 1).getTime();
  const totalJours = (new Date(annee, 11, 31).getTime() - debutAnnee) / JOUR + 1;

  /** Position d'une date dans l'année, en pourcentage, bornée. */
  const pct = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`).getTime();
    return Math.max(0, Math.min(100, ((d - debutAnnee) / JOUR / totalJours) * 100));
  };

  // Les mois ne font pas tous un douzième d'année : février en fait
  // 7,7 % et juillet 8,5 %. Des repères posés tous les 1/12 seraient
  // DÉCALÉS par rapport aux barres, qui sont placées au jour près —
  // la barre de mars ne tomberait pas entre les traits de mars.
  //
  // On calcule donc la vraie position du 1er de chaque mois, et on
  // donne aux étiquettes des colonnes proportionnelles à la durée
  // réelle des mois.
  const mois = useMemo(() => {
    const f = new Intl.DateTimeFormat(loc(langue), { month: 'short' });
    return Array.from({ length: 12 }, (_, i) => {
      const jours = new Date(annee, i + 1, 0).getDate();
      return {
        nom: f.format(new Date(annee, i, 1)),
        debut: ((new Date(annee, i, 1).getTime() - debutAnnee) / JOUR / totalJours) * 100,
        jours,
      };
    });
  }, [langue, annee, debutAnnee, totalJours]);

  const periodes = useMemo(() => conges
    .filter((c) => STATUTS_BLOQUANTS.includes(c.statut)
      && new Date(c.dateDebut).getFullYear() <= annee
      && new Date(c.dateFin).getFullYear() >= annee)
    .map((c) => {
      const depart = pct(c.dateDebut);
      const arrivee = pct(c.dateFin);
      return {
        conge: c,
        depart,
        // Un congé d'un seul jour mesure 0,27 % de l'année : sans
        // largeur plancher, il serait invisible.
        largeur: Math.max(arrivee - depart, 0.6),
      };
    }), [conges, annee, langue]);

  const maintenant = new Date();
  const estAnneeCourante = maintenant.getFullYear() === annee;
  const positionAujourdhui = estAnneeCourante
    ? ((maintenant.getTime() - debutAnnee) / JOUR / totalJours) * 100
    : null;

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-200 p-5 mb-5 panneau">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-bold text-stone-800">
          {t('cg.monAnnee', { a: annee })}
        </h3>
        {moisActif !== null && (
          <button
            type="button"
            onClick={() => surMois(null)}
            className="text-xs font-semibold text-brand-texte hover:underline"
          >
            {t('cg.voirTout')}
          </button>
        )}
      </div>

      {periodes.length === 0 ? (
        <p className="text-xs text-stone-400 py-4 text-center">
          {t('cg.aucunCongeAnnee')}
        </p>
      ) : (
        <>
          {/* La bande des périodes.
              L'enveloppe porte le repère du jour ; la bande, elle,
              coupe ce qui dépasse pour que les barres restent dans
              ses coins arrondis. */}
          <div className="relative">
            <div className="relative h-9 rounded-lg bg-stone-100 overflow-hidden">
              {/* Séparations mensuelles, à leur vraie date */}
              {mois.slice(1).map((m) => (
                <span
                  key={m.nom + m.debut}
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-px bg-stone-200"
                  style={{ insetInlineStart: `${m.debut}%` }}
                />
              ))}

              {periodes.map(({ conge, depart, largeur }) => (
                <span
                  key={conge.id}
                  title={`${t(cleType(conge.type))} · ${conge.dateDebut} → ${conge.dateFin}`}
                  className={`absolute top-1.5 bottom-1.5 rounded ${
                    conge.statut === 'APPROUVE' ? 'bg-green-500' : 'bg-amber-500'
                  }`}
                  style={{ insetInlineStart: `${depart}%`, width: `${largeur}%` }}
                />
              ))}
            </div>

            {/* Le repère du jour : il situe le reste.
                Il dépasse de la bande, en haut et en bas, pour ne pas
                se confondre avec un congé d'un seul jour — même
                largeur, même hauteur, on ne les distinguait plus. */}
            {positionAujourdhui !== null && (
              <span
                aria-hidden="true"
                title={t('cg.aujourdhui')}
                className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-brand-500"
                style={{ insetInlineStart: `${positionAujourdhui}%` }}
              />
            )}
          </div>

          {/* Les mois, cliquables. Les colonnes suivent la durée
              réelle de chaque mois, pour tomber sous les barres. */}
          <div
            className="grid gap-px mt-1.5"
            style={{ gridTemplateColumns: mois.map((m) => `${m.jours}fr`).join(' ') }}
          >
            {mois.map((m, i) => (
              <button
                key={m.nom + i}
                type="button"
                onClick={() => surMois(moisActif === i + 1 ? null : i + 1)}
                aria-pressed={moisActif === i + 1}
                className={`text-[10px] py-1 rounded transition-colors truncate ${
                  moisActif === i + 1
                    ? 'bg-brand-500 text-white font-bold'
                    : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                }`}
              >
                {m.nom}
              </button>
            ))}
          </div>

          <p className="flex items-center gap-1.5 text-[10px] text-stone-400 mt-3">
            <Info className="w-3 h-3 shrink-0" />
            {t('cg.survolerPeriode')}
          </p>
        </>
      )}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  // La minuterie ne dépend plus de « onClose ».
  //
  // Le parent passe une fonction flèche, recréée à chaque rendu : le
  // tableau de dépendances changeait donc à chaque rendu, l'effet se
  // rejouait, et le compte à rebours repartait de zéro. Un parent qui
  // se redessine souvent gardait le bandeau à l'écran indéfiniment.
  //
  // La référence garde la dernière fonction sans entrer dans les
  // dépendances : la minuterie est posée une fois, et une seule.
  const fermer = useRef(onClose);
  fermer.current = onClose;

  useEffect(() => {
    const minuterie = setTimeout(() => fermer.current(), 3500);
    return () => clearTimeout(minuterie);
  }, []);

  return (
    <div className="fixed top-6 end-6 z-60">
      <div
        role="status"
        className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-70"
      >
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Demande de congé ───────────────────────────────────────────────

function ModalDemande({ solde, congesExistants, onClose, onSuccess }: {
  solde: SoldeConges | null;
  congesExistants: Conge[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { t, tn, langue } = useI18n();

  const [form, setForm] = useState<{
    type: TypeConge;
    dateDebut: string;
    dateFin: string;
    motif: string;
  }>({ type: 'annuel', dateDebut: '', dateFin: '', motif: '' });

  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const jourCourt = useCallback((iso: string) =>
    new Date(iso).toLocaleDateString(loc(langue), { day: 'numeric', month: 'short' }),
  [langue]);

  const jourLong = useCallback((iso: string) =>
    new Date(iso).toLocaleDateString(loc(langue), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
  [langue]);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);

  const jours = joursOuvrablesEntre(form.dateDebut, form.dateFin);
  const pieceObligatoire = JUSTIFICATIF_REQUIS[form.type];
  const pieceSuggeree = JUSTIFICATIF_SUGGERE[form.type];

  // Le solde prévisionnel tient compte des demandes déjà en attente :
  // c'est lui qui dit si celle-ci passera, pas le solde affiché.
  const disponible = solde?.previsionnels ?? solde?.restants ?? 0;
  const depasse = form.type === 'annuel' && jours > disponible;

  // Les périodes déjà réservées sont connues de la page : avertir
  // pendant la saisie évite de remplir tout le formulaire pour rien.
  const conflit = useMemo(() => {
    if (!form.dateDebut || !form.dateFin) return null;

    return congesExistants.find((c) =>
      STATUTS_BLOQUANTS.includes(c.statut)
      && String(c.dateDebut) <= form.dateFin
      && String(c.dateFin) >= form.dateDebut) ?? null;
  }, [congesExistants, form.dateDebut, form.dateFin]);

  // Les périodes occupées à venir, listées pour guider le choix.
  const periodesOccupees = useMemo(
    () => congesExistants
      .filter((c) =>
        STATUTS_BLOQUANTS.includes(c.statut)
        && String(c.dateFin) >= dateAujourdhui())
      .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut))),
    [congesExistants],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.dateDebut || !form.dateFin) {
      setErreur(t('cg.errDates'));
      return;
    }
    // Comparaison lexicographique : exacte sur le format AAAA-MM-JJ
    if (form.dateFin < form.dateDebut) {
      setErreur(t('cg.errOrdre'));
      return;
    }
    if (conflit) {
      setErreur(t('cg.errConflit', {
        a: jourCourt(conflit.dateDebut), b: jourCourt(conflit.dateFin),
      }));
      return;
    }
    if (jours === 0) {
      setErreur(t('cg.errAucunOuvrable'));
      return;
    }
    if (pieceObligatoire && !justificatif) {
      setErreur(t('cg.errPiece', { p: t(pieceObligatoire) }));
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      // Un fichier impose multipart : sans pièce, l'envoi JSON reste
      // plus léger et évite une conversion inutile côté serveur.
      if (justificatif) {
        const donnees = new FormData();
        donnees.append('type', form.type);
        donnees.append('dateDebut', form.dateDebut);
        donnees.append('dateFin', form.dateFin);
        donnees.append('motif', form.motif);
        donnees.append('justificatif', justificatif);
        await congesService.demanderAvecPiece(donnees);
      } else {
        await congesService.demander(form);
      }
      onSuccess(tn('cg.demandeTransmise', jours));
      onClose();
    } catch (err: any) {
      // LE MESSAGE DU SERVEUR PASSE EN PREMIER.
      //
      // La version précédente affichait « la demande avec pièce jointe
      // n'a pas abouti » dès qu'un fichier était joint, et écrasait
      // donc le vrai motif. Un refus pour chevauchement de période —
      // 409, « une demande existe déjà sur cette période » — devenait
      // un reproche adressé à la pièce jointe, alors qu'elle était
      // parfaitement arrivée. Le salarié retirait son fichier, ré-
      // essayait, et récoltait la même erreur sans comprendre.
      //
      // On ne retombe sur le message de la pièce que lorsque le
      // serveur n'a rien dit du tout : coupure réseau, réponse
      // illisible. Dans ce cas seulement, retirer le fichier est un
      // conseil utile.
      const duServeur = err?.erreur ?? err?.response?.data?.erreur;

      setErreur(duServeur
        ?? (justificatif ? t('cg.errPieceEnvoi') : t('cg.errDemande')));
      setEnvoi(false);
    }
  };

  const champ = 'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 '
    + 'rounded-xl text-stone-700 focus:outline-none focus:border-brand-500 transition-colors';

  const champDate = (enConflit: boolean) =>
    `w-full px-3 py-2.5 text-sm rounded-xl border text-stone-700 focus:outline-none transition-colors ${
      enConflit
        ? 'bg-amber-50 border-amber-500 focus:border-amber-600'
        : 'bg-stone-50 border-stone-200 focus:border-brand-500'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('cg.demanderUnConge')}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col panneau"
      >

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Palmtree className="w-5 h-5 text-brand-texte" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-stone-800">{t('cg.demanderUnConge')}</h2>
              <p className="text-xs text-stone-500">
                {tn('cg.nDisponiblesCourt', disponible)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('hp.fermer')}
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto barre-fine">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{erreur}</span>
            </div>
          )}

          {/* Les périodes déjà prises, affichées avant la saisie :
              choisir une date libre du premier coup vaut mieux que
              corriger après un refus. */}
          {periodesOccupees.length > 0 && (
            <div className="bg-stone-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <CalendarX className="w-3.5 h-3.5 text-stone-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  {t('cg.periodesReservees')}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {periodesOccupees.slice(0, 5).map((c) => (
                  <span
                    key={c.id}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      c.statut === 'APPROUVE'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                    title={t(cleStatut(c.statut))}
                  >
                    {jourCourt(c.dateDebut)} → {jourCourt(c.dateFin)}
                  </span>
                ))}
                {periodesOccupees.length > 5 && (
                  <span className="text-[10px] text-stone-400 px-2 py-1">
                    +{periodesOccupees.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Le type se choisit en GRILLE, plus en liste déroulante.
              Une liste cache ses options jusqu'au clic, et surtout elle
              cachait l'essentiel : qu'un congé maladie exige un
              justificatif. Le salarié le découvrait après avoir choisi,
              rempli ses dates, et vu le bouton d'envoi rester gris.
              La pastille ambre le dit avant. */}
          <fieldset>
            <legend className="block text-xs font-medium text-stone-500 mb-2">
              {t('cg.choisirType')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {TYPES_CONGE.map((v) => {
                const Icone = iconeDe(v);
                const choisi = form.type === v;
                const exigePiece = Boolean(JUSTIFICATIF_REQUIS[v]);

                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, type: v })}
                    aria-pressed={choisi}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-start transition-colors ${
                      choisi
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-stone-200 bg-surface hover:bg-stone-50'
                    }`}
                  >
                    <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${
                      choisi ? 'text-brand-texte' : 'text-stone-400'
                    }`} />
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold leading-tight ${
                        choisi ? 'text-brand-texte' : 'text-stone-700'
                      }`}>
                        {t(cleType(v))}
                      </span>
                      {exigePiece && (
                        <span className="block text-[9px] font-semibold text-amber-600 mt-0.5">
                          {t('cg.pieceRequise')}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cg-debut" className="block text-xs font-medium text-stone-500 mb-1.5">
                {t('cg.du')}
              </label>
              <input
                id="cg-debut"
                type="date"
                value={form.dateDebut}
                min={dateAujourdhui()}
                onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                className={champDate(Boolean(conflit))}
              />
            </div>
            <div>
              <label htmlFor="cg-fin" className="block text-xs font-medium text-stone-500 mb-1.5">
                {t('cg.au')}
              </label>
              <input
                id="cg-fin"
                type="date"
                value={form.dateFin}
                min={form.dateDebut || dateAujourdhui()}
                onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                className={champDate(Boolean(conflit))}
              />
            </div>
          </div>

          {/* L'alerte de conflit remplace le décompte : afficher une
              durée sur une période impossible induirait en erreur. */}
          {conflit ? (
            <div className="rounded-xl p-4 bg-amber-50 ring-1 ring-amber-500">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-700">
                    {t('cg.periodeDejaPrise')}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {t('cg.vousAvezUn', {
                      type: t(cleType(conflit.type)).toLowerCase(),
                      etat: conflit.statut === 'APPROUVE'
                        ? t('cg.accorde')
                        : t('cg.enAttenteDeReponse'),
                      debut: jourLong(conflit.dateDebut),
                      fin: jourLong(conflit.dateFin),
                    })}
                  </p>

                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      dateDebut: lendemainDe(conflit.dateFin),
                      dateFin: '',
                    })}
                    className="text-xs font-bold text-amber-700 underline mt-2"
                  >
                    {t('cg.commencerLendemain', {
                      d: jourCourt(lendemainDe(conflit.dateFin)),
                    })}
                  </button>
                </div>
              </div>
            </div>
          ) : jours > 0 && (
            /* Le dégradé d'origine est retiré : la charte retenue est
               plate. */
            <div className={`rounded-xl p-4 ${depasse ? 'bg-amber-50' : 'bg-stone-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    {t('cg.dureeDemandee')}
                  </div>
                  <div className={`text-2xl font-bold ${depasse ? 'text-amber-600' : 'text-brand-texte'}`}>
                    {tn('cg.nJoursDemandes', jours)}
                  </div>
                  <div className="text-[10px] text-stone-400">{t('cg.ouvrablesDeduits')}</div>
                </div>

                {form.type === 'annuel' && (
                  <div className="text-end">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {t('cg.soldeApres')}
                    </div>
                    <div className={`text-lg font-bold ${depasse ? 'text-amber-600' : 'text-stone-800'}`}>
                      {disponible - jours}
                    </div>
                  </div>
                )}
              </div>

              {depasse && (
                <p className="text-xs text-amber-700 mt-2">
                  {tn('cg.depasseDe', jours - disponible)}
                </p>
              )}

              <p className="text-[10px] text-stone-400 mt-2">
                {t('cg.decompteDefinitif')}
              </p>
            </div>
          )}

          {/* Quatre types exigent une pièce, côté serveur comme ici.
              Le dire en ambre AVANT l'envoi vaut mieux qu'un 400
              après : le salarié voit tout de suite ce qu'il lui
              manque. */}
          <div>
            <span className="block text-xs font-medium text-stone-500 mb-1.5">
              {t('cg.justificatif')}{' '}
              {pieceObligatoire ? t('cg.obligatoire') : t('cg.optionnel')}
            </span>

            {pieceObligatoire && (
              <p className="text-xs rounded-xl px-3 py-2 mb-2 bg-amber-50 text-amber-700 leading-relaxed">
                {t('cg.pieceObligatoire', { p: t(pieceObligatoire) })}
              </p>
            )}

            {!pieceObligatoire && pieceSuggeree && (
              <p className="text-xs rounded-xl px-3 py-2 mb-2 bg-stone-50 text-stone-600 leading-relaxed">
                {t('cg.pieceAide', { p: t(pieceSuggeree) })}
              </p>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors shrink-0">
                <Upload className="w-4 h-4" />
                {t('cg.joindre')}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    // L'attribut « accept » est une suggestion : le
                    // sélecteur de fichiers du système permet de
                    // choisir « tous les fichiers ». On revérifie.
                    if (!FORMATS_ACCEPTES.includes(f.type)) {
                      setErreur(t('cg.errFormat'));
                      return;
                    }
                    if (f.size > TAILLE_MAX) {
                      setErreur(t('cg.errTaille'));
                      return;
                    }
                    setJustificatif(f);
                    setErreur('');
                  }}
                />
              </label>

              {justificatif && (
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-brand-texte shrink-0" />
                  <span className="text-xs text-stone-700 truncate">
                    {justificatif.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setJustificatif(null)}
                    aria-label={t('cg.retirerPiece')}
                    className="shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-stone-400 hover:text-stone-600" />
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-stone-400 mt-2">
              {t('cg.formatsAcceptes')}
            </p>
          </div>

          <div>
            <label htmlFor="cg-motif" className="block text-xs font-medium text-stone-500 mb-1.5">
              {t('cg.motif')} {t('cg.optionnel')}
            </label>
            <textarea
              id="cg-motif"
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              rows={3}
              placeholder={t('cg.motifPlaceholder')}
              className={`${champ} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              {t('pt.annuler')}
            </button>
            <button
              type="submit"
              disabled={envoi || jours === 0 || Boolean(conflit)
                || (Boolean(pieceObligatoire) && !justificatif)}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-4 h-4" />}
              {envoi ? t('cg.envoiEnCours') : t('cg.envoyer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

type Onglet = 'tous' | StatutConge;

export default function MesCongesPage() {
  const { t, tn, langue } = useI18n();

  const [conges, setConges] = useState<Conge[]>([]);
  const [solde, setSolde] = useState<SoldeConges | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);
  const [demande, setDemande] = useState(false);
  const [toast, setToast] = useState('');

  // Mois sélectionné dans la frise, ou null. La frise sert à naviguer.
  const [moisActif, setMoisActif] = useState<number | null>(null);

  const jourCourt = useCallback((iso: string) =>
    new Date(iso).toLocaleDateString(loc(langue), { day: 'numeric', month: 'short' }),
  [langue]);

  const jourLong = useCallback((iso: string) =>
    new Date(iso).toLocaleDateString(loc(langue), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
  [langue]);

  const charger = useCallback(async () => {
    try {
      setChargement(true);
      setErreur('');
      const res = await congesService.lister();
      setConges(res?.data?.conges ?? []);
      setSolde(res?.data?.solde ?? null);
    } catch (e: any) {
      console.error('Chargement des congés :', e);
      setErreur(e?.erreur ?? t('cg.erreurChargement'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffect(() => { void charger(); }, [charger]);

  // ── Synchronisation ───────────────────────────────────────────────
  //
  // Le tableau de bord affiche le solde de congés. Sans cet échange,
  // déposer une demande ici le laissait sur une valeur périmée, et
  // l'écart se voyait d'un écran à l'autre.
  useEffect(() => {
    const rafraichir = () => { void charger(); };
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') rafraichir();
    };

    window.addEventListener(EVENEMENT_CONGES, rafraichir);
    window.addEventListener('focus', rafraichir);
    document.addEventListener('visibilitychange', surVisibilite);

    return () => {
      window.removeEventListener(EVENEMENT_CONGES, rafraichir);
      window.removeEventListener('focus', rafraichir);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [charger]);

  useEffect(() => { setPage(0); }, [onglet, recherche, moisActif]);

  const ouvrirJustificatif = async (congeId: string) => {
    try {
      setErreur('');
      await voirJustificatif(congeId, t('cg.justificatifIndisponible'));
    } catch (e: any) {
      setErreur(e.message ?? t('cg.justificatifIndisponible'));
    }
  };

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return conges
      .filter((c) => {
        if (onglet !== 'tous' && c.statut !== onglet) return false;

        // Un congé compte pour un mois dès qu'il le TRAVERSE : une
        // semaine à cheval sur mars et avril doit sortir dans les deux.
        if (moisActif !== null) {
          const m1 = new Date(c.dateDebut).getMonth() + 1;
          const m2 = new Date(c.dateFin).getMonth() + 1;
          if (moisActif < m1 || moisActif > m2) return false;
        }

        if (!terme) return true;
        return `${t(cleType(c.type))} ${c.motif ?? ''}`.toLowerCase().includes(terme);
      })
      // Les demandes en attente remontent : ce sont celles dont
      // l'issue est encore incertaine.
      .sort((a, b) => {
        const aAttente = a.statut === 'EN_ATTENTE' ? 0 : 1;
        const bAttente = b.statut === 'EN_ATTENTE' ? 0 : 1;
        if (aAttente !== bAttente) return aAttente - bAttente;
        return String(b.dateDebut).localeCompare(String(a.dateDebut));
      });
  }, [conges, onglet, recherche, moisActif, t]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page],
  );

  const parStatut = (s: StatutConge) => conges.filter((c) => c.statut === s).length;

  // Le prochain congé approuvé qui n'est pas encore terminé.
  const prochain = useMemo(() => {
    const aujourdhui = dateAujourdhui();
    return conges
      .filter((c) => c.statut === 'APPROUVE' && String(c.dateFin) >= aujourdhui)
      .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)))[0] ?? null;
  }, [conges]);

  // ── Export ────────────────────────────────────────────────────────
  //
  // Chaque champ est encadré et ses guillemets doublés. Sans cela, un
  // motif ou une réponse RH contenant un point-virgule — ou un simple
  // retour à la ligne — décalait toutes les colonnes suivantes, et
  // l'export d'un congé refusé avec explication devenait illisible.
  const exporterCsv = () => {
    const champs = (valeurs: (string | number)[]) =>
      valeurs.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';');

    const lignes = [
      champs([
        t('cg.typeConge'), t('cg.du'), t('cg.au'), t('cg.uniteJour_pluriel'),
        t('hp.colStatut'), t('cg.motif'), t('cg.reponse'),
      ]),
      ...filtres.map((c) => champs([
        t(cleType(c.type)),
        new Date(c.dateDebut).toLocaleDateString(loc(langue)),
        new Date(c.dateFin).toLocaleDateString(loc(langue)),
        String(c.nbJours ?? ''),
        t(cleStatut(c.statut)),
        c.motif ?? '',
        c.commentaireRH ?? '',
      ])),
    ];

    // Le BOM force Excel à lire le fichier en UTF-8 : sans lui, les
    // accents et l'arabe sont illisibles sous Windows.
    const blob = new Blob([`﻿${lignes.join('\r\n')}`],
      { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mes-conges-${new Date().getFullYear()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const ONGLETS: [Onglet, Cle, number][] = [
    ['tous', 'cg.toutes', conges.length],
    ['EN_ATTENTE', 'cg.enAttente', parStatut('EN_ATTENTE')],
    ['APPROUVE', 'cg.approuvees', parStatut('APPROUVE')],
    ['REFUSE', 'cg.refusees', parStatut('REFUSE')],
  ];

  return (
    <Layout searchPlaceholder={t('cg.rechercherConge')}>

      {/* ── En-tête ── */}
      <div className="px-8 py-6 flex justify-between items-end gap-4 flex-wrap border-b border-stone-200">
        <div>
          <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
            <Link to={ROUTES.historique} className="hover:text-brand-texte transition-colors">
              {t('hp.monTemps')}
            </Link>
            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            <span className="text-brand-texte font-semibold">{t('cg.titre')}</span>
          </nav>
          <h2 className="text-3xl font-bold text-stone-800">{t('cg.titre')}</h2>
          <p className="text-stone-500 mt-1">
            {chargement ? t('hp.chargement') : prochain ? (
              <>
                {t('cg.prochainDu', {
                  a: jourCourt(prochain.dateDebut), b: jourCourt(prochain.dateFin),
                })}
              </>
            ) : parStatut('EN_ATTENTE') > 0 ? (
              <span className="text-amber-600 font-semibold">
                {tn('cg.nEnAttenteLongue', parStatut('EN_ATTENTE'))}
              </span>
            ) : t('cg.aucunPlanifie')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exporterCsv}
            disabled={filtres.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 shadow-sm transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            {t('hp.exporter')}
          </button>

          <button
            type="button"
            onClick={() => setDemande(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('cg.demander')}
          </button>
        </div>
      </div>

      <div className="px-8 py-8">

        {erreur && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-sm bg-red-50 text-red-600">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{erreur}</span>
            <button
              type="button"
              onClick={() => void charger()}
              className="font-bold underline shrink-0"
            >
              {t('cg.reessayer')}
            </button>
          </div>
        )}

        {/* ── Solde et année ── */}
        {/* Pas de solde inventé : afficher « 0 jour restant » quand le
            serveur n'a rien renvoyé serait un chiffre faux sur un
            écran que le salarié lit pour décider. */}
        {solde ? <BlocSolde solde={solde} /> : !chargement && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 mb-4 text-sm bg-stone-50 text-stone-500">
            <Info className="w-4 h-4 shrink-0" />
            {t('cg.nonCalcule')}
          </div>
        )}

        <FriseAnnee
          conges={conges}
          annee={new Date().getFullYear()}
          moisActif={moisActif}
          surMois={setMoisActif}
        />

        {/* ── Onglets et recherche ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap bg-surface border border-stone-200 rounded-xl shadow-sm px-2 py-2 mb-5">
          <div role="tablist" aria-label={t('hp.colStatut')} className="flex items-center gap-1 flex-wrap">
            {ONGLETS.map(([cle, libelle, nb]) => (
              <button
                key={cle}
                type="button"
                role="tab"
                aria-selected={onglet === cle}
                onClick={() => setOnglet(cle)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  onglet === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                {t(libelle)}
                <span className={`text-[10px] px-1.5 rounded-full ${
                  onglet === cle ? 'bg-white/25' : 'bg-stone-100'
                }`}>
                  {chargement ? '…' : nb}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-64 shrink-0">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('cg.recherchePlaceholder')}
              aria-label={t('cg.rechercherConge')}
              className="w-full ps-9 pe-8 py-2 rounded-lg border border-stone-200 text-sm bg-stone-50 text-stone-700 focus:outline-none focus:border-brand-500 focus:bg-surface transition-colors"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                aria-label={t('pt.annuler')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-200"
              >
                <X className="w-3.5 h-3.5 text-stone-400" />
              </button>
            )}
          </div>
        </div>

        {/* ── Liste ── */}
        {chargement ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-surface rounded-2xl border border-stone-200 p-5 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-stone-100 rounded w-40" />
                    <div className="h-3 bg-stone-100 rounded w-56" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtres.length === 0 ? (
          <div className="bg-surface rounded-2xl shadow-sm border border-stone-200 p-16 text-center panneau">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
              <Palmtree className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">{t('cg.aucuneDemande')}</p>
            <p className="text-xs text-stone-500 mb-4">
              {recherche
                ? t('cg.aucunResultat', { q: recherche })
                : moisActif !== null
                  ? t('cg.aucunDansMois', {
                    m: new Intl.DateTimeFormat(loc(langue), { month: 'long' })
                      .format(new Date(new Date().getFullYear(), moisActif - 1, 1)),
                  })
                  : onglet !== 'tous'
                    ? t('cg.aucuneDansCategorie')
                    : t('cg.jamaisDemande')}
            </p>
            {onglet === 'tous' && !recherche && (
              <button
                type="button"
                onClick={() => setDemande(true)}
                className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                {t('cg.faireUneDemande')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {pageCourante.map((c) => {
                const style = styleStatut(c.statut);
                const Icone = style.icone;
                const aVenir = String(c.dateDebut) >= dateAujourdhui();

                return (
                  <div
                    key={c.id}
                    className="bg-surface rounded-2xl shadow-sm border border-stone-200 overflow-hidden transition-shadow hover:shadow-md panneau"
                  >
                    <div className="flex">
                      <div className={`w-1 shrink-0 ${style.barre}`} />

                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${style.bg}`}>
                              <Icone className={`w-5 h-5 ${style.text}`} />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-stone-800">
                                  {t(cleType(c.type))}
                                </h4>
                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                                  {t(cleStatut(c.statut))}
                                </span>
                                {aVenir && c.statut === 'APPROUVE' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-texte">
                                    {t('cg.aVenir')}
                                  </span>
                                )}
                              </div>

                              <p className="text-sm text-stone-600 mt-1 capitalize">
                                {jourLong(c.dateDebut)}
                                {c.dateDebut !== c.dateFin && ` → ${jourLong(c.dateFin)}`}
                              </p>

                              {c.motif && (
                                <p className="text-xs text-stone-500 italic mt-1.5 ps-2 border-s-2 border-stone-200">
                                  {c.motif}
                                </p>
                              )}

                              {/* La réponse de la RH compte autant que
                                  la décision : un refus sans motif est
                                  incompréhensible. */}
                              {c.commentaireRH && (
                                <div className="flex items-start gap-1.5 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 mt-2">
                                  <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>
                                    <span className="font-bold">{t('cg.reponse')}</span>
                                    {' '}{c.commentaireRH}
                                    {c.traitePar && (
                                      <span className="text-stone-400"> — {c.traitePar}</span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-end">
                              <div className={`text-2xl font-bold leading-none ${style.text}`}>
                                {c.nbJours}
                              </div>
                              <div className="text-[10px] text-stone-400 mt-1">
                                {tn('cg.uniteJour', c.nbJours ?? 0)}
                              </div>
                            </div>

                            {/* « justificatifKey » est désormais sur le
                                type Conge : plus de « as any », et le
                                nom du fichier sert d'infobulle. */}
                            {c.justificatifKey && (
                              <button
                                type="button"
                                onClick={() => void ouvrirJustificatif(c.id)}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 bg-stone-50 hover:bg-stone-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                title={c.justificatifNom ?? t('cg.consulterJustificatif')}
                              >
                                <Paperclip className="w-3 h-3" />
                                {t('cg.justificatif')}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-stone-200 mt-4 overflow-hidden panneau">
              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtres.length}
                onPage={setPage}
                libelle={t('cg.demandes')}
              />
            </div>
          </>
        )}

        {/* ── Règle applicable ── */}
        <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-200 p-5 panneau">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-brand-texte" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
              {t('cg.droitTitre')}
            </h4>
          </div>

          <p className="text-xs text-stone-500 leading-relaxed">
            {t('cg.article113')}
          </p>

          <Link
            to={ROUTES.historique}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-texte hover:underline mt-3"
          >
            <History className="w-3.5 h-3.5" />
            {t('hp.titre')}
          </Link>
        </div>
      </div>

      {demande && (
        <ModalDemande
          solde={solde}
          congesExistants={conges}
          onClose={() => setDemande(false)}
          onSuccess={(msg) => {
            setToast(msg);
            void charger();
            // Le tableau de bord écoute : son solde se met à jour sans
            // que le salarié ait à recharger la page.
            window.dispatchEvent(new Event(EVENEMENT_CONGES));
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      <style>{`
        .barre-fine { scrollbar-width: thin; scrollbar-color: var(--color-stone-300) transparent; }
        .barre-fine::-webkit-scrollbar { width: 6px; height: 6px; }
        .barre-fine::-webkit-scrollbar-track { background: transparent; }
        .barre-fine::-webkit-scrollbar-thumb {
          background: var(--color-stone-300);
          border-radius: 10px;
        }
      `}</style>
    </Layout>
  );
}