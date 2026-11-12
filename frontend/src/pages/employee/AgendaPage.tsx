// src/pages/employee/AgendaPage.tsx
//
// L'agenda du salarié. Trois sources, un seul calendrier :
//
//   • les événements auxquels il s'est inscrit — le catalogue reste sur
//     la page Événements, l'agenda ne porte que ce qui engage ;
//   • ses congés, approuvés ou en attente, étalés sur toute leur durée ;
//   • les échéances des pièces de son dossier. Une fiche d'aptitude qui
//     expire est un rendez-vous à prendre, pas une notification à lire.
//
// Aucune route nouvelle : /evenements, /conges et /dossier/mes-pieces
// existent déjà. L'export .ics est produit par le navigateur, via
// src/utils/ics.ts — l'agenda candidat passe par /candidat/agenda.ics,
// qui est réservé aux candidats, et ajouter une route serveur pour un
// fichier texte de trente lignes n'aurait pas été raisonnable.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, CalendarDays, CalendarCheck, ChevronLeft, ChevronRight,
  Clock, Download, List, MapPin, Video, X, Search, CheckCircle2,
  Palmtree, AlertTriangle, Hourglass, ArrowRight,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { telechargerIcs } from '../../utils/ics';

const PAR_PAGE_PASSES = 5;

// Au-delà de quatre mois, une échéance n'est plus un rendez-vous : elle
// encombrerait l'agenda sans appeler d'action.
const HORIZON_ECHEANCE_JOURS = 120;

type TypeEntree = 'EVENEMENT' | 'CONGE' | 'ECHEANCE';

interface Entree {
  id: string;
  type: TypeEntree;
  titre: string;
  detail: string;
  /** ISO complet pour un événement, AAAA-MM-JJ pour une journée entière */
  debut: string;
  fin?: string;
  journeeEntiere: boolean;
  lieu?: string | null;
  lienVisio?: string | null;
  alerte?: { niveau: 'urgent' | 'attention'; texte: string } | null;
  /** Route à ouvrir au clic */
  route?: string;
}

const STYLE_TYPE: Record<TypeEntree, {
  libelle: string;
  icone: React.ComponentType<{ className?: string }>;
  bg: string; text: string; barre: string; pastille: string;
}> = {
  EVENEMENT: {
    libelle: 'Événement', icone: CalendarCheck,
    bg: 'bg-blue-50', text: 'text-blue-600',
    barre: 'bg-blue-400', pastille: '#3b82f6',
  },
  CONGE: {
    libelle: 'Congé', icone: Palmtree,
    bg: 'bg-brand-500/10', text: 'text-brand-texte',
    barre: 'bg-brand-500', pastille: '#4F46E5',
  },
  ECHEANCE: {
    libelle: 'Échéance', icone: AlertTriangle,
    bg: 'bg-amber-50', text: 'text-amber-600',
    barre: 'bg-amber-400', pastille: '#F59E0B',
  },
};

const STYLE_ALERTE = {
  urgent: { bg: 'bg-red-50', text: 'text-red-500', bord: 'border-red-200' },
  attention: { bg: 'bg-amber-50', text: 'text-amber-600', bord: 'border-amber-200' },
};

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * Clé calendaire locale.
 *
 * toISOString() convertirait en UTC et décalerait d'un jour entre
 * minuit et une heure du matin en Tunisie.
 */
const cleJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Jours calendaires, pas horaires : « demain à 9 h » reste demain. */
const joursAvant = (iso: string) => {
  const cible = new Date(iso);
  const jour = new Date();
  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate());
  return Math.round((a - b) / 86400000);
};

const dateDe = (e: Entree) =>
  e.journeeEntiere ? new Date(`${e.debut}T00:00:00`) : new Date(e.debut);

// ── Composants partagés ────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, fond, texte, alerte }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string;
  fond: string; texte: string; alerte?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-2xl shadow-sm border p-5 ${
      alerte ? 'border-amber-200 ring-1 ring-amber-100' : 'border-stone-100'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-[17rem]">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Section({ icone: Icone, titre, compteur, children }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string; compteur?: number; children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
        <Icone className="w-4 h-4 text-brand-texte" />
        {titre}
        {compteur != null && compteur > 0 && (
          <span className="text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
            {compteur}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

// ── Ligne d'agenda ─────────────────────────────────────────────────

function LigneEntree({ entree, onOuvrir, passe }: {
  entree: Entree;
  onOuvrir: (e: Entree) => void;
  passe?: boolean;
}) {
  const style = STYLE_TYPE[entree.type];
  const Icone = style.icone;
  const date = dateDe(entree);
  const jours = joursAvant(entree.debut);
  const urgent = entree.alerte?.niveau === 'urgent';

  const periode = entree.journeeEntiere
    ? (entree.fin && entree.fin !== entree.debut
      ? `Du ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} `
        + `au ${new Date(`${entree.fin}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
      : date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
    : date.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div
      onClick={() => onOuvrir(entree)}
      className={`bg-surface rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${
        urgent ? 'border-red-200' : 'border-stone-100'
      } ${passe ? 'opacity-60' : ''}`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${urgent ? 'bg-red-400' : style.barre}`} />

        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* La date en pavé : repérer un jour dans une liste est
                  plus rapide qu'en lisant une phrase complète. */}
              <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${style.bg}`}>
                <span className={`text-sm font-bold leading-none ${style.text}`}>
                  {date.getDate()}
                </span>
                <span className="text-[8px] text-stone-400 uppercase mt-0.5">
                  {MOIS[date.getMonth()].slice(0, 3)}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-stone-800">{entree.titre}</h4>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                    <Icone className="w-2.5 h-2.5" />
                    {style.libelle}
                  </span>
                </div>
                <p className="text-xs text-brand-texte font-semibold mt-0.5">
                  {entree.detail}
                </p>
              </div>
            </div>

            {!passe && jours >= 0 && jours <= 30 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 shrink-0">
                {jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `J-${jours}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-5 text-xs text-stone-500 flex-wrap">
            <span className="capitalize font-medium text-stone-700">{periode}</span>
            {entree.lieu && (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                {entree.lieu}
              </span>
            )}
            {entree.lienVisio && (
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-stone-400" />
                En ligne
              </span>
            )}
          </div>

          {entree.alerte && (
            <div className={`flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 mt-3 ${
              STYLE_ALERTE[entree.alerte.niveau].bg
            } ${STYLE_ALERTE[entree.alerte.niveau].text}`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {entree.alerte.texte}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panneau du jour choisi ─────────────────────────────────────────
//
// Même forme que l'agenda RH : la grille donne la vue d'ensemble, le
// panneau donne le détail. C'est ce qui distingue un agenda d'une
// liste d'événements.

function PanneauJour({ date, entrees, onFermer, onOuvrir }: {
  date: Date;
  entrees: Entree[];
  onFermer: () => void;
  onOuvrir: (e: Entree) => void;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 shrink-0 flex items-start justify-between">
        <div>
          <h3 className="font-bold text-stone-800 text-sm capitalize">
            {date.toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </h3>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {entrees.length === 0
              ? 'Rien de prévu'
              : `${entrees.length} élément${entrees.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={onFermer}
          aria-label="Fermer le détail du jour"
          className="p-1.5 hover:bg-surface rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-stone-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto agenda-scrollbar p-3 space-y-2">
        {entrees.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="w-7 h-7 mx-auto mb-2 text-stone-300" />
            <p className="text-xs text-stone-400">Journée libre</p>
          </div>
        ) : (
          entrees.map((e) => {
            const style = STYLE_TYPE[e.type];
            const Icone = style.icone;
            return (
              <button
                key={e.id}
                onClick={() => onOuvrir(e)}
                className={`w-full text-start rounded-xl p-3 border border-stone-100 transition-opacity hover:opacity-80 ${style.bg}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${style.text}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-stone-800">{e.titre}</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">{e.detail}</div>

                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-stone-400 flex-wrap">
                      {!e.journeeEntiere && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(e.debut).toLocaleTimeString('fr-FR', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                      {e.lieu && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {e.lieu}
                        </span>
                      )}
                      {e.lienVisio && (
                        <span className="flex items-center gap-1">
                          <Video className="w-2.5 h-2.5" />
                          En ligne
                        </span>
                      )}
                    </div>

                    {e.alerte && (
                      <div className={`flex items-start gap-1.5 text-[10px] font-bold rounded-lg px-2 py-1 mt-2 ${
                        STYLE_ALERTE[e.alerte.niveau].bg
                      } ${STYLE_ALERTE[e.alerte.niveau].text}`}>
                        <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                        {e.alerte.texte}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function AgendaEmployeePage() {
  const navigate = useNavigate();

  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [chargement, setChargement] = useState(true);
  const [toast, setToast] = useState('');
  // Le calendrier d'abord. Une page qui s'ouvre sur une liste de
  // cartes ressemble à la page Événements ; une grille de mois se
  // reconnaît immédiatement comme un agenda — c'est la forme de
  // l'agenda RH.
  const [affichage, setAffichage] = useState<'liste' | 'mois'>('mois');
  const [jourChoisi, setJourChoisi] = useState<Date | null>(null);
  const [recherche, setRecherche] = useState('');
  const [voirTousPasses, setVoirTousPasses] = useState(false);

  const [moisAffiche, setMoisAffiche] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    (async () => {
      // Trois sources, tolérantes à l'échec de l'une : un dossier
      // indisponible ne doit pas masquer les congés.
      const [resEvenements, resConges, resDossier] = await Promise.allSettled([
        api.get('/evenements') as any,
        api.get('/conges') as any,
        api.get('/dossier/mes-pieces') as any,
      ]);

      const liste: Entree[] = [];

      // ── Les événements auxquels il s'est inscrit ──
      if (resEvenements.status === 'fulfilled') {
        const corps = resEvenements.value?.data ?? resEvenements.value ?? {};
        const tous: any[] = [...(corps.evenements ?? []), ...(corps.passes ?? [])];

        for (const e of tous) {
          if (!e.inscrit || !e.dateDebut) continue;
          liste.push({
            id: `evenement-${e.id}`,
            type: 'EVENEMENT',
            titre: e.titre,
            detail: e.typeLibelle ?? 'Événement',
            debut: e.dateDebut,
            fin: e.dateFin,
            journeeEntiere: false,
            lieu: e.lieu,
            lienVisio: e.lienVisio,
            route: '/evenements',
            alerte: e.obligatoire && new Date(e.dateDebut).getTime() >= Date.now()
              ? { niveau: 'attention', texte: 'Participation obligatoire' }
              : null,
          });
        }
      }

      // ── Ses congés ──
      // Les demandes en attente figurent aussi : le salarié a posé des
      // dates, il doit les voir dans son agenda même si la RH n'a pas
      // encore tranché. La pastille dit lesquelles ne sont pas acquises.
      if (resConges.status === 'fulfilled') {
        const corps = resConges.value?.data ?? resConges.value ?? {};
        for (const c of (corps.conges ?? [])) {
          if (!c.dateDebut || c.statut === 'REFUSE' || c.statut === 'ANNULE') continue;
          const enAttente = c.statut === 'EN_ATTENTE';
          liste.push({
            id: `conge-${c.id}`,
            type: 'CONGE',
            titre: c.typeLibelle ?? 'Congé',
            detail: `${c.nbJours ?? '?'} jour${(c.nbJours ?? 0) > 1 ? 's' : ''}`,
            debut: String(c.dateDebut).slice(0, 10),
            fin: String(c.dateFin ?? c.dateDebut).slice(0, 10),
            journeeEntiere: true,
            route: '/employe/conges',
            alerte: enAttente
              ? { niveau: 'attention', texte: 'En attente de validation' }
              : null,
          });
        }
      }

      // ── Les échéances du dossier ──
      // Seules les pièces validées qui expirent dans l'horizon : une
      // pièce manquante n'a pas de date, et une échéance à trois ans
      // n'appelle aucune action.
      if (resDossier.status === 'fulfilled') {
        const corps = resDossier.value?.data ?? resDossier.value ?? {};
        const catalogue = corps.catalogue ?? {};

        for (const ligne of (corps.lignes ?? [])) {
          const piece = (ligne.pieces ?? [])[0];
          if (!piece?.dateExpiration) continue;
          if (ligne.statut !== 'VALIDEE' && ligne.statut !== 'EXPIREE') continue;

          const jours = joursAvant(piece.dateExpiration);
          if (jours > HORIZON_ECHEANCE_JOURS) continue;

          liste.push({
            id: `echeance-${piece.id}`,
            type: 'ECHEANCE',
            titre: `Renouveler : ${catalogue[ligne.type]?.libelle ?? ligne.type}`,
            detail: 'Pièce du dossier du personnel',
            debut: String(piece.dateExpiration).slice(0, 10),
            journeeEntiere: true,
            route: '/employe/documents',
            alerte: jours < 0
              ? { niveau: 'urgent', texte: 'Pièce expirée — à remplacer' }
              : { niveau: 'attention', texte: `Expire dans ${jours} jour${jours > 1 ? 's' : ''}` },
          });
        }
      }

      setEntrees(liste);
      setChargement(false);
    })();
  }, []);

  // ── Tri et partage passé / à venir ──

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const estPasse = (e: Entree) => {
    // Une pièce expirée reste à traiter : c'est sa date qui est
    // passée, pas l'action. La ranger dans « Passés » la ferait
    // disparaître du compteur alors qu'elle est le plus urgent.
    if (e.type === 'ECHEANCE' && e.alerte?.niveau === 'urgent') return false;

    const fin = e.journeeEntiere
      ? new Date(`${e.fin ?? e.debut}T23:59:59`)
      : new Date(e.fin ?? e.debut);
    return fin.getTime() < debutJour.getTime();
  };

  const correspond = (e: Entree) => {
    const terme = recherche.trim().toLowerCase();
    return !terme
      || `${e.titre} ${e.detail} ${e.lieu ?? ''}`.toLowerCase().includes(terme);
  };

  const aVenir = useMemo(
    () => entrees.filter((e) => !estPasse(e)).filter(correspond)
      .sort((a, b) => String(a.debut).localeCompare(String(b.debut))),
    [entrees, recherche] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const passes = useMemo(
    () => entrees.filter(estPasse).filter(correspond)
      .sort((a, b) => String(b.debut).localeCompare(String(a.debut))),
    [entrees, recherche] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Index par jour : une entrée de plusieurs jours figure sur chacun,
  // sans quoi un congé d'une semaine n'apparaîtrait qu'au premier jour.
  const parJour = useMemo(() => {
    const carte = new Map<string, Entree[]>();

    for (const e of entrees) {
      const debut = dateDe(e);
      const fin = e.fin
        ? (e.journeeEntiere ? new Date(`${e.fin}T00:00:00`) : new Date(e.fin))
        : debut;

      const curseur = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());
      const borne = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

      // Garde-fou : une date de fin aberrante ne doit pas boucler
      // indéfiniment.
      let securite = 0;
      while (curseur <= borne && securite < 400) {
        const cle = cleJour(curseur);
        carte.set(cle, [...(carte.get(cle) ?? []), e]);
        curseur.setDate(curseur.getDate() + 1);
        securite += 1;
      }
    }

    return carte;
  }, [entrees]);

  // Grille du mois, commençant un lundi : getDay() renvoie 0 pour
  // dimanche, d'où le décalage.
  const grille = useMemo(() => {
    const premier = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
    const dernier = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0);
    const decalage = (premier.getDay() + 6) % 7;

    const cases: (Date | null)[] = Array(decalage).fill(null);
    for (let j = 1; j <= dernier.getDate(); j += 1) {
      cases.push(new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), j));
    }
    while (cases.length % 7 !== 0) cases.push(null);

    return cases;
  }, [moisAffiche]);

  const aujourdhui = cleJour(new Date());

  const ouvrir = (e: Entree) => {
    if (e.lienVisio) window.open(e.lienVisio, '_blank', 'noopener');
    else if (e.route) navigate(e.route);
  };

  const exporter = () => {
    if (entrees.length === 0) { setToast('Rien à exporter pour le moment'); return; }

    const ok = telechargerIcs(
      entrees.map((e) => ({
        id: e.id,
        titre: e.titre,
        description: e.detail,
        lieu: e.lieu,
        url: e.lienVisio,
        debut: e.debut,
        fin: e.fin,
        journeeEntiere: e.journeeEntiere,
      })),
      'hr-up-agenda.ics'
    );

    setToast(ok ? 'Agenda exporté' : "Impossible de générer le fichier d'agenda");
  };

  const compter = (t: TypeEntree) => aVenir.filter((e) => e.type === t).length;
  const urgents = aVenir.filter((e) => e.alerte?.niveau === 'urgent').length;
  const prochain = aVenir[0];

  const passesAffiches = voirTousPasses ? passes : passes.slice(0, PAR_PAGE_PASSES);

  // L'en-tête. Une pièce expirée reste dans « à venir » puisqu'elle
  // appelle une action, mais elle n'est pas « prochaine » : son délai
  // est négatif, et « dans -19 jours » ne veut rien dire.
  const joursProchain = prochain ? joursAvant(prochain.debut) : 0;
  const enRetard = joursProchain < 0;
  const delaiProchain = enRetard
    ? `en retard de ${-joursProchain} jour${-joursProchain > 1 ? 's' : ''}`
    : joursProchain === 0 ? "aujourd'hui"
      : joursProchain === 1 ? 'demain'
      : `dans ${joursProchain} jours`;

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200 gap-4 flex-wrap">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Mon espace</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Mon agenda</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Mon agenda</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : prochain ? (
                <>
                  {enRetard ? 'À traiter : ' : 'Prochain : '}
                  <span className={`font-semibold ${
                    enRetard ? 'text-red-500' : 'text-brand-texte'
                  }`}>
                    {prochain.titre}
                  </span>
                  {' '}{delaiProchain}
                </>
              ) : 'Rien à venir pour le moment'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {affichage === 'mois' && (
              <button
                onClick={() => {
                  const d = new Date();
                  setMoisAffiche(new Date(d.getFullYear(), d.getMonth(), 1));
                  setJourChoisi(d);
                }}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 shadow-sm transition-colors"
              >
                Aujourd'hui
              </button>
            )}

            <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1 shadow-sm">
              {([['liste', List], ['mois', CalendarDays]] as
                ['liste' | 'mois', React.ComponentType<{ className?: string }>][])
                .map(([mode, Icone]) => (
                  <button
                    key={mode}
                    onClick={() => setAffichage(mode)}
                    aria-label={mode === 'liste' ? 'Vue en liste' : 'Vue par mois'}
                    className={`p-2 rounded-lg transition-colors ${
                      affichage === mode ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                    }`}
                  >
                    <Icone className="w-4 h-4" />
                  </button>
                ))}
            </div>

            <button
              onClick={exporter}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
              title="Ajouter à Google Agenda, Outlook ou Apple Calendrier"
            >
              <Download className="w-4 h-4" />
              Exporter
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Calendar}
              label="À venir"
              value={chargement ? '…' : aVenir.length}
              sub="congés, événements et échéances"
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={Palmtree}
              label="Congés"
              value={chargement ? '…' : compter('CONGE')}
              sub="posés ou accordés"
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={CalendarCheck}
              label="Mes inscriptions"
              value={chargement ? '…' : compter('EVENEMENT')}
              sub="événements rejoints"
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={Hourglass}
              label="Échéances"
              value={chargement ? '…' : compter('ECHEANCE')}
              sub={urgents > 0
                ? `${urgents} pièce${urgents > 1 ? 's' : ''} expirée${urgents > 1 ? 's' : ''}`
                : 'pièces du dossier'}
              fond="bg-amber-50"
              texte="text-amber-600"
              alerte={urgents > 0}
            />
          </div>

          {chargement ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-48" />
                      <div className="h-3 bg-stone-100 rounded w-32" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : affichage === 'mois' ? (
            <div className={`grid gap-4 items-start ${
              jourChoisi ? 'grid-cols-1 lg:grid-cols-[1fr_320px]' : 'grid-cols-1'
            }`}>
            <div className="space-y-4">

            {/* Les retards portent une date passée : ils sont comptés
                dans l'en-tête mais tombent hors de la grille du mois
                courant. Sans ce bandeau, le salarié lit l'alerte sans
                pouvoir atteindre la pièce. */}
            {aVenir.filter((e) => e.alerte?.niveau === 'urgent').length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h4 className="text-xs font-bold text-red-500">
                    À régulariser
                  </h4>
                </div>

                <div className="space-y-1.5">
                  {aVenir.filter((e) => e.alerte?.niveau === 'urgent').map((e) => (
                    <button
                      key={`retard-${e.id}`}
                      onClick={() => ouvrir(e)}
                      className="w-full flex items-center justify-between gap-3 text-start bg-surface rounded-xl px-3 py-2 hover:bg-red-50 transition-colors"
                    >
                      <span className="text-xs font-bold text-stone-800 truncate">
                        {e.titre}
                      </span>
                      <span className="text-[10px] font-bold text-red-500 shrink-0 flex items-center gap-1.5">
                        {e.alerte?.texte}
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                <button
                  onClick={() => {
                    setMoisAffiche(
                      new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() - 1, 1)
                    );
                    setJourChoisi(null);
                  }}
                  aria-label="Mois précédent"
                  className="p-2 hover:bg-surface rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-500" />
                </button>

                <h3 className="font-bold text-stone-800">
                  {MOIS[moisAffiche.getMonth()]} {moisAffiche.getFullYear()}
                </h3>

                <button
                  onClick={() => {
                    setMoisAffiche(
                      new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 1)
                    );
                    setJourChoisi(null);
                  }}
                  aria-label="Mois suivant"
                  className="p-2 hover:bg-surface rounded-xl transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-stone-100">
                {JOURS.map((j) => (
                  <div key={j} className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    {j}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {grille.map((jour, i) => {
                  if (!jour) {
                    return (
                      <div key={`vide-${i}`} className="min-h-[6.5rem] bg-stone-50/40 border-b border-e border-stone-100" />
                    );
                  }

                  const cle = cleJour(jour);
                  const duJour = parJour.get(cle) ?? [];
                  const estAujourdhui = cle === aujourdhui;
                  const choisi = jourChoisi != null && cleJour(jourChoisi) === cle;
                  const weekend = [5, 6].includes((jour.getDay() + 6) % 7);

                  return (
                    <button
                      key={cle}
                      onClick={() => setJourChoisi(choisi ? null : jour)}
                      className={`min-h-[6.5rem] p-2 border-b border-e border-stone-100 text-start transition-colors ${
                        choisi ? 'bg-brand-500/5'
                          : weekend ? 'bg-stone-50/50 hover:bg-stone-50'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold mb-1.5 ${
                        estAujourdhui ? 'bg-brand-500 text-white'
                          : choisi ? 'bg-brand-500/15 text-brand-texte'
                          : 'text-stone-600'
                      }`}>
                        {jour.getDate()}
                      </div>

                      {/* Les cases portent le titre, pas une pastille de
                          six pixels : un calendrier se lit. Le détail,
                          lui, est dans le panneau — une case de grille
                          n'a pas la place d'un bouton par entrée. */}
                      <div className="space-y-1">
                        {duJour.slice(0, 2).map((e) => {
                          const style = STYLE_TYPE[e.type];
                          return (
                            <div
                              key={`${cle}-${e.id}`}
                              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold truncate ${style.bg} ${style.text}`}
                              title={`${e.titre} — ${e.detail}`}
                            >
                              <span
                                className="w-1 h-1 rounded-full shrink-0"
                                style={{ backgroundColor: style.pastille }}
                              />
                              <span className="truncate">{e.titre}</span>
                            </div>
                          );
                        })}

                        {duJour.length > 2 && (
                          <div className="text-[9px] text-stone-400 font-bold ps-1.5">
                            +{duJour.length - 2} autre{duJour.length - 2 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 px-5 py-3 border-t border-stone-100 bg-stone-50 text-[10px] text-stone-400">
                {(['CONGE', 'EVENEMENT', 'ECHEANCE'] as TypeEntree[]).map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STYLE_TYPE[t].pastille }} />
                    {STYLE_TYPE[t].libelle}s
                  </span>
                ))}
              </div>
            </div>
            </div>

            {jourChoisi && (
              <PanneauJour
                date={jourChoisi}
                entrees={parJour.get(cleJour(jourChoisi)) ?? []}
                onFermer={() => setJourChoisi(null)}
                onOuvrir={ouvrir}
              />
            )}
            </div>
          ) : (
            <div className="space-y-8">

              {/* Recherche quand il y a de quoi chercher : un champ sur
                  une liste de trois lignes est du bruit. */}
              {entrees.length > 3 && (
                <div className="relative w-full max-w-sm">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Titre, lieu…"
                    className="w-full ps-9 pe-8 py-2.5 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
                  />
                  {recherche && (
                    <button
                      onClick={() => setRecherche('')}
                      aria-label="Effacer"
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                    >
                      <X className="w-3.5 h-3.5 text-stone-400" />
                    </button>
                  )}
                </div>
              )}

              <Section icone={Calendar} titre="À venir" compteur={aVenir.length}>
                {aVenir.length === 0 ? (
                  <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
                      <Calendar className="w-5 h-5 text-stone-300" />
                    </div>
                    <p className="text-sm text-stone-500 mb-3">
                      {recherche
                        ? `Rien ne correspond à « ${recherche} »`
                        : 'Rien à venir pour le moment'}
                    </p>
                    {!recherche && (
                      <button
                        onClick={() => navigate('/evenements')}
                        className="text-sm font-bold text-brand-texte hover:underline"
                      >
                        Parcourir les événements
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aVenir.map((e) => (
                      <LigneEntree key={e.id} entree={e} onOuvrir={ouvrir} />
                    ))}
                  </div>
                )}
              </Section>

              {passes.length > 0 && (
                <Section icone={Clock} titre="Passés" compteur={passes.length}>
                  <div className="space-y-3">
                    {passesAffiches.map((e) => (
                      <LigneEntree key={e.id} entree={e} onOuvrir={ouvrir} passe />
                    ))}
                  </div>

                  {passes.length > PAR_PAGE_PASSES && (
                    <button
                      onClick={() => setVoirTousPasses(!voirTousPasses)}
                      className="w-full mt-3 py-2 text-xs font-bold text-brand-texte hover:underline"
                    >
                      {voirTousPasses
                        ? 'Masquer les plus anciens'
                        : `Voir les ${passes.length - PAR_PAGE_PASSES} plus anciens`}
                    </button>
                  )}
                </Section>
              )}

              {/* ── Ce que l'agenda rassemble ── */}
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays className="w-4 h-4 text-brand-texte" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    Sources de l'agenda
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    ['CONGE', 'Mes congés', 'Posés et accordés, sur toute leur durée', '/employe/conges'],
                    ['EVENEMENT', 'Mes inscriptions', "Le catalogue reste sur la page Événements", '/evenements'],
                    ['ECHEANCE', 'Échéances du dossier', 'Pièces à renouveler avant expiration', '/employe/documents'],
                  ] as [TypeEntree, string, string, string][]).map(([type, label, detail, route]) => {
                    const style = STYLE_TYPE[type];
                    const Icone = style.icone;
                    return (
                      <button
                        key={type}
                        onClick={() => navigate(route)}
                        className="flex items-start gap-2.5 text-start hover:bg-stone-50 rounded-xl p-2 -m-2 transition-colors"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                          <Icone className={`w-4 h-4 ${style.text}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-stone-700">{label}</div>
                          <p className="text-[10px] text-stone-400">{detail}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-stone-300 shrink-0 mt-1" />
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-stone-400 mt-4 pt-3 border-t border-stone-50">
                  Un congé figure sur chacun de ses jours, pas seulement au premier.
                  Le fichier exporté s'ouvre dans Google Agenda, Outlook ou Apple
                  Calendrier.
                </p>
              </div>
            </div>
          )}
        </div>

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{`
          .agenda-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .agenda-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .agenda-scrollbar::-webkit-scrollbar-thumb {
            background: #DFE3F0;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}