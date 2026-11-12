// src/pages/employee/PointagePage.tsx
//
// Écran de pointage du salarié.
//
// ── Ce que la page doit répondre, dans cet ordre ────────────────────
//
// 1. Suis-je pointé ou non ?            → l'état, en gros, tout en haut
// 2. Combien ai-je fait aujourd'hui ?   → le compteur, vivant
// 3. Que dois-je faire maintenant ?     → une seule action évidente
// 4. Et le reste de ma semaine ?        → plus bas, quand on cherche
//
// L'ordre n'est pas esthétique, il est fonctionnel : quatre-vingt-dix
// pour cent des visites servent à pointer et à repartir. Tout ce qui
// demande à être cherché passe après.
//
// ── Ce que le salarié ne peut pas faire ici ─────────────────────────
//
// Modifier un pointage enregistré. Le tableau est en lecture seule, et
// le dit. Un oubli passe par une demande que la RH valide — c'est la
// section du bas. Laisser le salarié corriger lui-même ses heures
// reviendrait à supprimer le pointage.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Play, Square, Coffee, UtensilsCrossed, ChevronRight, MapPin,
  AlertTriangle, CheckCircle2, Hourglass, XCircle, ScanFace, QrCode,
  CalendarClock, Send, Loader2, Info, TrendingUp, History,
} from 'lucide-react';

import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import {
  pointagesService,
  type Journee, type Segment, type DemandeCorrection,
} from '../../services/pointages';
import ModalPointage from '@/components/pointages/ModalPointage';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

// Plage affichée par la frise. Avant 6 h et après 21 h, la bande
// serait vide pour presque tout le monde : on gagne en lisibilité ce
// qu'on perd en exhaustivité, et un pointage hors plage reste visible
// dans le tableau.
const FRISE_DEBUT = 6 * 60;
const FRISE_FIN = 21 * 60;

const COULEUR_SEGMENT: Record<string, string> = {
  TRAVAIL: ACCENT,
  PAUSE_DEJEUNER: '#c2956a',
  PAUSE_CAFE: '#9298B0',
};

const LIBELLE_SEGMENT: Record<string, string> = {
  TRAVAIL: 'Travail',
  PAUSE_DEJEUNER: 'Déjeuner',
  PAUSE_CAFE: 'Pause',
};

// ── Formatage ───────────────────────────────────────────────────────

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** « 7h30 ». Les heures de travail se lisent ainsi, pas en « 7.5 h ». */
function duree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h${deuxChiffres(m % 60)}`;
}

/** « +1h15 » ou « −45 min ». Le signe porte l'information. */
function ecart(minutes: number): string {
  const signe = minutes < 0 ? '−' : '+';
  const m = Math.abs(Math.round(minutes));
  return m < 60 ? `${signe}${m} min` : `${signe}${duree(m)}`;
}

const heure = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  }) : '—';

const jourCourt = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

/** Date du jour en AAAA-MM-JJ, dans le fuseau du navigateur.
 *  toISOString() convertirait en UTC et décalerait d'un jour entre
 *  minuit et une heure du matin en Tunisie. */
function dateDuJour(d = new Date()): string {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

/** Minutes depuis minuit d'un instant, heure locale du navigateur. */
function minutesDuJour(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Lundi de la semaine d'une date. */
function lundiDe(d: Date): Date {
  const copie = new Date(d);
  const jour = copie.getDay() === 0 ? 7 : copie.getDay();
  copie.setDate(copie.getDate() - (jour - 1));
  copie.setHours(12, 0, 0, 0);
  return copie;
}

const segments = (j: Journee | null): Segment[] =>
  Array.isArray(j?.segments) ? j!.segments : [];

/** Segment en cours, ou null. Il ne peut y en avoir qu'un. */
const segmentOuvert = (j: Journee | null) =>
  segments(j).find((s) => !s.fin) ?? null;

/** Durée d'un segment ; un segment ouvert court jusqu'à `instant`. */
function dureeSegment(s: Segment, instant: number): number {
  const debut = new Date(s.debut).getTime();
  const fin = s.fin ? new Date(s.fin).getTime() : instant;
  return Math.max(0, Math.round((fin - debut) / 60000));
}

function minutesParType(j: Journee | null, type: string, instant: number): number {
  return segments(j)
    .filter((s) => (s.type ?? 'TRAVAIL') === type)
    .reduce((t, s) => t + dureeSegment(s, instant), 0);
}

// ── Page ────────────────────────────────────────────────────────────

export default function PointagePage() {
  const [mois, setMois] = useState<Journee[]>([]);
  const [demandes, setDemandes] = useState<DemandeCorrection[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [toast, setToast] = useState('');

  const [facialDisponible, setFacialDisponible] = useState(false);
  const [modal, setModal] = useState<null | 'arrivee' | 'depart'>(null);
  const [enCoursPause, setEnCoursPause] = useState(false);

  // L'horloge bat à la seconde ; tout le reste s'en déduit. Un
  // compteur figé sur un écran de pointage donne l'impression que
  // l'application a décroché.
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const aujourdhui = dateDuJour();

  // ── Chargement ────────────────────────────────────────────────────

  const charger = useCallback(async () => {
    try {
      // Un seul appel pour le mois : la journée, la semaine et les
      // cumuls mensuels s'en déduisent. Trois requêtes donneraient
      // trois instants de lecture différents, donc des totaux qui ne
      // s'additionnent pas.
      const [ptRes, corrRes, bioRes] = await Promise.allSettled([
        pointagesService.historique({ mois: aujourdhui.slice(0, 7) }) as any,
        pointagesService.corrections.lister() as any,
        api.get('/biometrie/etat') as any,
      ]);

      const valeur = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? r.value : null;

      setMois(valeur(ptRes)?.data?.pointages ?? []);
      setDemandes(valeur(corrRes)?.data?.demandes ?? []);
      setFacialDisponible(Boolean(valeur(bioRes)?.data?.enrole));
    } catch (e: any) {
      setErreur("Les pointages n'ont pas pu être chargés.");
    } finally {
      setChargement(false);
    }
  }, [aujourdhui]);

  useEffect(() => { charger(); }, [charger]);

  // ── Dérivés ───────────────────────────────────────────────────────

  const journee = useMemo(
    () => mois.find((j) => j.date === aujourdhui) ?? null,
    [mois, aujourdhui],
  );

  const ouvert = segmentOuvert(journee);
  const enTravail = ouvert?.type === 'TRAVAIL' || (ouvert && !ouvert.type);
  const enPause = Boolean(ouvert) && !enTravail;

  const travail = minutesParType(journee, 'TRAVAIL', maintenant);
  const dejeuner = minutesParType(journee, 'PAUSE_DEJEUNER', maintenant);
  const cafe = minutesParType(journee, 'PAUSE_CAFE', maintenant);

  // Objectif par défaut : 8 h. Le serveur renvoie l'horaire de
  // référence après chaque pointage, mais la page doit savoir
  // s'afficher avant le premier pointage de la journée.
  const objectif = 8 * 60;
  const pourcentage = Math.min(100, Math.round((travail / objectif) * 100));

  const semaine = useMemo(() => {
    const lundi = lundiDe(new Date());

    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      const cle = dateDuJour(d);
      const j = mois.find((x) => x.date === cle) ?? null;

      return {
        cle,
        libelle: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        minutes: j ? minutesParType(j, 'TRAVAIL', maintenant) : 0,
        estAujourdhui: cle === aujourdhui,
        aVerifier: segments(j).some((s) => s.aVerifier),
      };
    });
  }, [mois, maintenant, aujourdhui]);

  const cumulMois = useMemo(() => {
    const jours = mois.filter((j) => segments(j).length > 0);

    return {
      minutes: jours.reduce((t, j) => t + (j.dureeMinutes ?? 0), 0),
      jours: jours.length,
      pauses: jours.reduce((t, j) => t + (j.minutesPause ?? 0), 0),
      aVerifier: jours.filter((j) => segments(j).some((s) => s.aVerifier)).length,
    };
  }, [mois]);

  // ── Actions ───────────────────────────────────────────────────────

  const surSucces = (message: string) => {
    setToast(message);
    setModal(null);
    charger();
  };

  const pause = async (type: 'PAUSE_DEJEUNER' | 'PAUSE_CAFE') => {
    setEnCoursPause(true);
    setErreur('');
    try {
      const { data } = await pointagesService.commencerPause(type) as any;
      setToast(data?.message ?? 'Pause commencée');
      await charger();
    } catch (e: any) {
      setErreur(e?.response?.data?.erreur ?? e?.erreur ?? "La pause n'a pas pu être enregistrée.");
    } finally {
      setEnCoursPause(false);
    }
  };

  const finPause = async () => {
    setEnCoursPause(true);
    setErreur('');
    try {
      const { data } = await pointagesService.terminerPause() as any;
      setToast(data?.message ?? 'Pause terminée');
      await charger();
    } catch (e: any) {
      setErreur(e?.response?.data?.erreur ?? e?.erreur ?? "La pause n'a pas pu être close.");
    } finally {
      setEnCoursPause(false);
    }
  };

  // ── Rendu ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout>

        {/* ── En-tête ── */}
        <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-stone-200">
          <div className="ps-12 lg:ps-0">
            <nav className="flex items-center gap-1.5 text-xs text-stone-400 mb-2">
              <Link to="/employe" className="hover:text-brand-texte">Mon espace</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-stone-600 font-medium">Pointage</span>
            </nav>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-stone-800">Pointage</h1>
                <p className="text-sm text-stone-500 mt-1 capitalize">
                  {new Date().toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>

              <div className="text-end">
                <div className="text-2xl sm:text-3xl font-bold text-stone-800 tabular-nums">
                  {new Date(maintenant).toLocaleTimeString('fr-FR')}
                </div>
                <p className="text-[11px] text-stone-400">
                  Heure de votre poste · le serveur horodate le pointage
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-4 max-w-5xl">

          {erreur && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-100">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{erreur}</span>
            </div>
          )}

          {/* ── État et action ── */}
          <CarteEtat
            chargement={chargement}
            journee={journee}
            enTravail={Boolean(enTravail)}
            enPause={enPause}
            ouvert={ouvert}
            travail={travail}
            objectif={objectif}
            pourcentage={pourcentage}
            maintenant={maintenant}
            facialDisponible={facialDisponible}
            occupe={enCoursPause}
            surArrivee={() => setModal('arrivee')}
            surDepart={() => setModal('depart')}
            surPause={pause}
            surFinPause={finPause}
          />

          {/* ── Frise de la journée ── */}
          <Section titre="Ma journée" icone={Clock}>
            {segments(journee).length === 0 ? (
              <Vide texte="Aucun pointage aujourd'hui." />
            ) : (
              <>
                <Frise segments={segments(journee)} maintenant={maintenant} />

                <div className="grid grid-cols-3 gap-3 mt-5">
                  <Tuile
                    libelle="Écart à l'objectif"
                    valeur={ecart(travail - objectif)}
                    detail={travail >= objectif ? 'Objectif atteint' : `sur ${duree(objectif)}`}
                    bon={travail >= objectif}
                  />
                  <Tuile
                    libelle="Pauses"
                    valeur={duree(dejeuner + cafe)}
                    detail={`déjeuner ${duree(dejeuner)} · café ${duree(cafe)}`}
                  />
                  <Tuile
                    libelle="Pointages"
                    valeur={String(segments(journee).length)}
                    detail={segments(journee).length === 1 ? 'segment' : 'segments'}
                  />
                </div>
              </>
            )}
          </Section>

          {/* ── Détail des segments ── */}
          {segments(journee).length > 0 && (
            <Section titre="Mes pointages du jour" icone={History}>
              <TableauSegments segments={segments(journee)} maintenant={maintenant} />
              <p className="text-[11px] text-stone-400 mt-3 leading-relaxed">
                Chaque ligne est un pointage enregistré. Rien ici ne peut être
                modifié · pour corriger un oubli, utilisez la demande en bas de page.
              </p>
            </Section>
          )}

          {/* ── Semaine ── */}
          <Section titre="Ma semaine" icone={TrendingUp}>
            <Semaine jours={semaine} objectif={objectif} />
          </Section>

          {/* ── Mois ── */}
          <Section titre={`Mon mois · ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`} icone={CalendarClock}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tuile libelle="Heures travaillées" valeur={duree(cumulMois.minutes)} />
              <Tuile libelle="Jours pointés" valeur={`${cumulMois.jours} j`} />
              <Tuile libelle="Pauses" valeur={duree(cumulMois.pauses)} />
              <Tuile
                libelle="Jours à vérifier"
                valeur={String(cumulMois.aVerifier)}
                detail={cumulMois.aVerifier ? 'position hors zone' : 'aucun'}
                bon={cumulMois.aVerifier === 0}
              />
            </div>
          </Section>

          {/* ── Oubli de pointage ── */}
          <Oubli
            demandes={demandes}
            surEnvoye={(message) => { setToast(message); charger(); }}
          />
        </div>

        {modal && (
          <ModalPointage
            depart={modal === 'depart'}
            facialDisponible={facialDisponible}
            onClose={() => setModal(null)}
            onSuccess={surSucces}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </Layout>
    </div>
  );
}

// ── Carte d'état ────────────────────────────────────────────────────

function CarteEtat({
  chargement, journee, enTravail, enPause, ouvert, travail, objectif,
  pourcentage, maintenant, facialDisponible, occupe,
  surArrivee, surDepart, surPause, surFinPause,
}: {
  chargement: boolean;
  journee: Journee | null;
  enTravail: boolean;
  enPause: boolean;
  ouvert: Segment | null;
  travail: number;
  objectif: number;
  pourcentage: number;
  maintenant: number;
  facialDisponible: boolean;
  occupe: boolean;
  surArrivee: () => void;
  surDepart: () => void;
  surPause: (t: 'PAUSE_DEJEUNER' | 'PAUSE_CAFE') => void;
  surFinPause: () => void;
}) {
  const termine = journee?.statut === 'TERMINE';

  // Le compteur du segment en cours, à la seconde. C'est lui qui donne
  // le sentiment que le pointage est actif.
  const secondes = ouvert
    ? Math.max(0, Math.floor((maintenant - new Date(ouvert.debut).getTime()) / 1000))
    : 0;

  const chrono = `${deuxChiffres(Math.floor(secondes / 3600))}:`
    + `${deuxChiffres(Math.floor((secondes % 3600) / 60))}:`
    + `${deuxChiffres(secondes % 60)}`;

  const etat = chargement ? 'Chargement…'
    : enPause ? `En pause depuis ${heure(ouvert!.debut)}`
    : enTravail ? `En service depuis ${heure(ouvert!.debut)}`
    : termine ? 'Journée terminée'
    : 'Pas encore pointé';

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                enTravail ? 'bg-brand-500 animate-pulse'
                  : enPause ? 'bg-amber-400 animate-pulse'
                  : termine ? 'bg-stone-400'
                  : 'bg-stone-300'
              }`} />
              <span className="text-sm font-bold text-stone-800">{etat}</span>
            </div>

            <div className="mt-3 flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-bold text-stone-800 tabular-nums">
                {ouvert ? chrono : duree(travail)}
              </span>
              {ouvert && (
                <span className="text-sm text-stone-400">
                  segment en cours · {duree(travail)} travaillé aujourd'hui
                </span>
              )}
            </div>

            <p className="text-xs text-stone-500 mt-1.5">
              {duree(travail)} sur {duree(objectif)} · {pourcentage} %
            </p>
          </div>

          {/* ── Action principale, une seule à la fois ── */}
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            {chargement ? (
              <div className="h-12 w-full sm:w-56 rounded-xl bg-stone-50 animate-pulse" />
            ) : enPause ? (
              <button
                onClick={surFinPause}
                disabled={occupe}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {occupe ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Reprendre le travail
              </button>
            ) : enTravail ? (
              <>
                <button
                  onClick={surDepart}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Pointer mon départ
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => surPause('PAUSE_DEJEUNER')}
                    disabled={occupe}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    Déjeuner
                  </button>
                  <button
                    onClick={() => surPause('PAUSE_CAFE')}
                    disabled={occupe}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                  >
                    <Coffee className="w-3.5 h-3.5" />
                    Pause
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={surArrivee}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors"
              >
                {facialDisponible ? <ScanFace className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                {termine ? 'Repointer une arrivée' : 'Pointer mon arrivée'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Jauge de progression */}
      <div className="h-1.5 bg-stone-100">
        <div
          className="h-full bg-brand-500 transition-all duration-700"
          style={{ width: `${pourcentage}%` }}
        />
      </div>
    </div>
  );
}

// ── Frise de la journée ─────────────────────────────────────────────

function Frise({ segments: liste, maintenant }: { segments: Segment[]; maintenant: number }) {
  const amplitude = FRISE_FIN - FRISE_DEBUT;
  const position = (minutes: number) =>
    ((Math.min(FRISE_FIN, Math.max(FRISE_DEBUT, minutes)) - FRISE_DEBUT) / amplitude) * 100;

  const minutesActuelles = new Date(maintenant).getHours() * 60
    + new Date(maintenant).getMinutes();

  const heures = [6, 9, 12, 15, 18, 21];

  return (
    <div>
      <div className="relative h-12 rounded-xl bg-stone-50 overflow-hidden">
        {liste.map((s, i) => {
          const debut = position(minutesDuJour(s.debut));
          const fin = position(s.fin ? minutesDuJour(s.fin) : minutesActuelles);
          const type = s.type ?? 'TRAVAIL';

          return (
            <div
              key={i}
              title={`${LIBELLE_SEGMENT[type]} · ${heure(s.debut)} → ${s.fin ? heure(s.fin) : 'en cours'}`}
              className="absolute top-0 bottom-0 flex items-center justify-center"
              style={{
                left: `${debut}%`,
                // Deux pourcents de large au minimum : un segment de
                // cinq minutes serait invisible, et le salarié croirait
                // que son pointage n'a pas été pris.
                width: `${Math.max(2, fin - debut)}%`,
                backgroundColor: COULEUR_SEGMENT[type] ?? ACCENT,
                opacity: s.fin ? 1 : 0.75,
              }}
            >
              {fin - debut > 8 && (
                <span className="text-[10px] font-bold text-white/90 px-1 truncate">
                  {heure(s.debut)}
                </span>
              )}
            </div>
          );
        })}

        {/* Repère de l'instant présent */}
        {minutesActuelles >= FRISE_DEBUT && minutesActuelles <= FRISE_FIN && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-stone-800"
            style={{ left: `${position(minutesActuelles)}%` }}
          />
        )}
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-stone-400 tabular-nums">
        {heures.map((h) => <span key={h}>{deuxChiffres(h)}:00</span>)}
      </div>

      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(LIBELLE_SEGMENT).map(([type, libelle]) => (
          <span key={type} className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: COULEUR_SEGMENT[type] }}
            />
            {libelle}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Tableau des segments ────────────────────────────────────────────

function TableauSegments({ segments: liste, maintenant }: {
  segments: Segment[]; maintenant: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-[11px] uppercase tracking-wider text-stone-400">
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Début</th>
            <th className="pb-2 font-medium">Fin</th>
            <th className="pb-2 font-medium">Durée</th>
            <th className="pb-2 font-medium">Méthode</th>
            <th className="pb-2 font-medium">Position</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {liste.map((s, i) => {
            const type = s.type ?? 'TRAVAIL';

            return (
              <tr key={i}>
                <td className="py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: COULEUR_SEGMENT[type] }}
                    />
                    {LIBELLE_SEGMENT[type]}
                  </span>
                </td>
                <td className="py-2.5 tabular-nums text-stone-700">{heure(s.debut)}</td>
                <td className="py-2.5 tabular-nums text-stone-700">
                  {s.fin ? heure(s.fin) : <span className="text-brand-texte">en cours</span>}
                </td>
                <td className="py-2.5 tabular-nums font-medium text-stone-800">
                  {duree(dureeSegment(s, maintenant))}
                </td>
                <td className="py-2.5">
                  {s.methode === 'FACIAL' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                      <ScanFace className="w-3 h-3" /> visage
                      {s.biometrie && (
                        <span className="text-stone-400 font-mono">
                          {' '}{s.biometrie.distance}
                        </span>
                      )}
                    </span>
                  ) : s.methode === 'CORRECTION' ? (
                    <span className="text-[11px] text-amber-600">correction RH</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                      <QrCode className="w-3 h-3" /> QR
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  {s.aVerifier ? (
                    <span
                      title={s.motifVerification ?? undefined}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-600"
                    >
                      <AlertTriangle className="w-3 h-3" /> à vérifier
                    </span>
                  ) : s.latitude != null ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                      <MapPin className="w-3 h-3" />
                      {s.distanceMetres != null ? `${s.distanceMetres} m` : 'relevée'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-stone-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Semaine ─────────────────────────────────────────────────────────

function Semaine({ jours, objectif }: {
  jours: { cle: string; libelle: string; minutes: number; estAujourdhui: boolean; aVerifier: boolean }[];
  objectif: number;
}) {
  const total = jours.reduce((t, j) => t + j.minutes, 0);
  const prevu = objectif * 5;

  // L'échelle se cale sur le maximum réel quand il dépasse l'objectif :
  // sinon une journée de dix heures sortirait du cadre.
  const plafond = Math.max(objectif, ...jours.map((j) => j.minutes)) || objectif;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-stone-800">{duree(total)}</span>
        <span className="text-sm text-stone-500">sur {duree(prevu)} prévues</span>
      </div>

      <div className="flex items-end gap-2 h-32">
        {jours.map((j) => {
          const hauteur = Math.round((j.minutes / plafond) * 100);

          return (
            <div key={j.cle} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-stone-400">
                {j.minutes > 0 ? duree(j.minutes) : ''}
              </span>

              <div className="w-full flex-1 flex items-end">
                <div
                  title={`${jourCourt(j.cle)} · ${duree(j.minutes)}`}
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    j.minutes === 0 ? 'bg-stone-100'
                      : j.aVerifier ? 'bg-amber-400'
                      : j.estAujourdhui ? 'bg-brand-500'
                      : 'bg-brand-500/55'
                  }`}
                  // Trois pour cent au minimum : une barre nulle doit
                  // rester visible, sinon le jour disparaît du graphique
                  // et on croit la semaine plus courte qu'elle n'est.
                  style={{ height: `${Math.max(3, hauteur)}%` }}
                />
              </div>

              <span className={`text-[11px] ${
                j.estAujourdhui ? 'font-bold text-stone-800' : 'text-stone-400'
              }`}>
                {j.libelle}
              </span>
            </div>
          );
        })}
      </div>

      {/* Repère de l'objectif journalier */}
      <p className="text-[11px] text-stone-400 mt-3">
        Barre pleine : aujourd'hui · ambre : position à vérifier · objectif {duree(objectif)} par jour
      </p>
    </div>
  );
}

// ── Oubli de pointage ───────────────────────────────────────────────

function Oubli({ demandes, surEnvoye }: {
  demandes: DemandeCorrection[];
  surEnvoye: (message: string) => void;
}) {
  const [ouvertFormulaire, setOuvert] = useState(false);
  const [form, setForm] = useState({
    date: '', heureArrivee: '08:00', heureDepart: '17:00', motif: '',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Hier par défaut, et jamais au-delà : une correction ne se demande
  // que pour un jour passé, puisqu'aujourd'hui on peut encore pointer.
  const hier = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateDuJour(d);
  }, []);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');

    try {
      const { data } = await pointagesService.corrections.demander(form) as any;
      setForm({ date: '', heureArrivee: '08:00', heureDepart: '17:00', motif: '' });
      setOuvert(false);
      surEnvoye(data?.message ?? 'Demande transmise.');
    } catch (e: any) {
      setErreur(
        e?.response?.data?.erreur ?? e?.erreur
        ?? "La demande n'a pas pu être transmise.",
      );
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 '
    + 'rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  const STYLE: Record<string, { bg: string; texte: string; icone: any }> = {
    EN_ATTENTE: { bg: 'bg-amber-50', texte: 'text-amber-600', icone: Hourglass },
    APPROUVE: { bg: 'bg-brand-500/10', texte: 'text-brand-texte', icone: CheckCircle2 },
    REFUSE: { bg: 'bg-red-50', texte: 'text-red-500', icone: XCircle },
  };

  return (
    <Section
      titre="Oubli de pointage"
      icone={CalendarClock}
      action={!ouvertFormulaire && (
        <button
          onClick={() => setOuvert(true)}
          className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Déclarer
        </button>
      )}
    >
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-stone-50 mb-4">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
        <p className="text-xs text-stone-600 leading-relaxed">
          Vous déclarez les heures d'un jour oublié ; les ressources humaines
          acceptent ou refusent. Le pointage n'est enregistré qu'à
          l'acceptation — une demande en attente ne compte pas dans vos heures.
        </p>
      </div>

      {erreur && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 mb-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="leading-relaxed">{erreur}</span>
        </div>
      )}

      {ouvertFormulaire && (
        <form onSubmit={envoyer} className="space-y-3 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Jour</label>
              <input
                type="date"
                required
                max={hier}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Arrivée</label>
              <input
                type="time"
                required
                value={form.heureArrivee}
                onChange={(e) => setForm({ ...form, heureArrivee: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Départ</label>
              <input
                type="time"
                required
                value={form.heureDepart}
                onChange={(e) => setForm({ ...form, heureDepart: e.target.value })}
                className={champ}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Motif
            </label>
            <textarea
              required
              rows={2}
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Téléphone déchargé, intervention sur site, oubli au retour de déjeuner…"
              className={`${champ} resize-none`}
            />
            <p className="text-[11px] text-stone-400 mt-1.5">
              C'est sur ce motif que la RH tranche. Une ligne suffit.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={envoi}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Transmettre
            </button>
            <button
              type="button"
              onClick={() => { setOuvert(false); setErreur(''); }}
              className="px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {demandes.length === 0 ? (
        <Vide texte="Aucune demande de correction." />
      ) : (
        <div className="space-y-2">
          {demandes.slice(0, 6).map((d) => {
            const style = STYLE[d.statut] ?? STYLE.EN_ATTENTE;
            const Icone = style.icone;

            return (
              <div key={d.id} className="p-3.5 rounded-xl bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">
                      {jourCourt(d.date)} · {heure(d.heureArriveeDeclaree)} → {heure(d.heureDepartDeclaree)}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{d.motif}</p>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${style.bg} ${style.texte}`}>
                    <Icone className="w-3 h-3" />
                    {d.statut === 'EN_ATTENTE' ? 'en attente'
                      : d.statut === 'APPROUVE' ? 'acceptée' : 'refusée'}
                  </span>
                </div>

                {d.commentaireRH && (
                  <p className="text-xs text-stone-600 mt-2 pt-2 border-t border-stone-200 leading-relaxed">
                    <span className="font-medium">Réponse :</span> {d.commentaireRH}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Briques communes ────────────────────────────────────────────────

function Section({ titre, icone: Icone, action, children }: {
  titre: string;
  icone?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h2 className="font-bold text-stone-800 flex items-center gap-2 text-sm min-w-0">
          {Icone && <Icone className="w-4 h-4 text-brand-texte shrink-0" />}
          <span className="truncate">{titre}</span>
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Tuile({ libelle, valeur, detail, bon }: {
  libelle: string; valeur: string; detail?: string; bon?: boolean;
}) {
  return (
    <div className={`p-4 rounded-xl border ${
      bon ? 'bg-brand-500/10 border-brand-500/25' : 'bg-stone-50 border-transparent'
    }`}>
      <div className="text-[10px] uppercase tracking-wider text-stone-400">{libelle}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${
        bon ? 'text-brand-texte' : 'text-stone-800'
      }`}>
        {valeur}
      </div>
      {detail && (
        <div className="text-[10px] text-stone-400 mt-1 leading-relaxed">{detail}</div>
      )}
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <div className="text-center py-8">
      <div className="w-11 h-11 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-2.5">
        <Clock className="w-5 h-5 text-stone-300" />
      </div>
      <p className="text-sm text-stone-500">{texte}</p>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  const fermer = useRef(onClose);
  fermer.current = onClose;

  useEffect(() => {
    const t = setTimeout(() => fermer.current(), 4000);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div className="fixed top-4 start-4 end-4 sm:start-auto sm:top-6 sm:end-6 z-70">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-start gap-3 sm:max-w-md">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-medium flex-1 leading-relaxed">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}