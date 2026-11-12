// src/pages/shared/AnnuairePage.tsx
//
// Annuaire interne. Accessible aux salariés et à la RH : un candidat
// n'a pas à consulter la composition des équipes.
//
// Deux principes :
//   1. Trouver quelqu'un doit prendre un geste, pas trois. D'où la
//      recherche toujours visible et le regroupement par département.
//   2. Une fois la personne trouvée, on veut la joindre. Les actions de
//      contact sont donc sur la carte elle-même, pas seulement dans la
//      fiche — ouvrir un panneau pour cliquer « mail » est un détour.
//
// ── Qui figure ici : tout le monde ─────────────────────────────────
//
// Toutes les personnes en poste, quelle que soit leur adresse. Une
// version précédente écartait celles dont l'adresse n'était pas dans
// un domaine de l'entreprise ; c'était une erreur. Un annuaire sert à
// trouver un collègue, et une personne dont l'adresse n'a pas encore
// été régularisée reste un collègue. La faire disparaître ne corrige
// rien, ça rend seulement l'annuaire faux.
//
// Le domaine sert donc à informer, pas à exclure. Une fiche dont
// l'adresse n'appartient pas à l'entreprise porte une pastille, et la
// RH voit en haut de page combien il lui en reste à régulariser.
//
// La page n'a pas besoin de savoir qui est connecté pour décider
// d'afficher ce bandeau : le serveur n'envoie `exclus` qu'à la RH. La
// présence du champ EST l'autorisation. Un rôle testé côté page serait
// une seconde vérité à tenir à jour, et la première à se désynchroniser.
//
// Les salariés sortis des effectifs sont le seul cas écarté, côté
// serveur : ils ne travaillent plus là.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Mail, Phone, Users, LayoutGrid, List, Building2, X,
  MessageSquare, CalendarDays, ChevronRight, AlertTriangle, Copy, Check,
  AtSign, UserX, Lock, Settings,
} from 'lucide-react';
import api from '@/services/api';
import Layout from '@/components/layout/Layout';

// ⚠️ SEULE LIGNE À ADAPTER si ton hook de traduction porte un autre nom.
import { useI18n, type Cle } from '@/i18n';

// ── Réglages ───────────────────────────────────────────────────────

/**
 * Messagerie interne salarié ↔ salarié.
 *
 * Repasse cette constante à false si tu n'as pas encore posé
 * `src/messagerie/internes.js` ni créé la table : le bouton mènerait
 * alors à une route inexistante, et un bouton qui échoue est pire que
 * pas de bouton.
 */
const MESSAGERIE_INTERNE = true;

/** Route d'un fil interne, une fois la messagerie disponible */
const routeMessageInterne = (employeId: string) => `/messages/collegue/${employeId}`;

/** Où la RH régularise les adresses personnelles */
const ROUTE_SALARIES = '/admin/employes';
const ROUTE_ENTREPRISE = '/admin/entreprise';

// ── Types ──────────────────────────────────────────────────────────

interface Collegue {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  poste?: string;
  departement?: string;
  dateEmbauche?: string;
  statut?: string;
  /** L'adresse n'appartient pas à un domaine déclaré. Informatif. */
  adressePersonnelle?: boolean;
}

/** Fiche écartée de l'annuaire, rendue à la RH seule */
interface ARegulariser {
  id: string;
  prenom: string;
  nom: string;
  email: string;
}

/**
 * Ce que le serveur dit de l'entreprise, en plus des collègues.
 * `exclus` et `aRegulariser` n'arrivent qu'à la RH.
 */
interface MetaAnnuaire {
  domaines: string[];
  entreprise: string | null;
  exclus?: { partis: number; sansAdresse: number; horsDomaine: number };
  aRegulariser?: ARegulariser[];
}

type Affichage = 'grille' | 'liste';

// ── Pastilles d'avatar ─────────────────────────────────────────────
//
// Huit teintes mesurées : toutes au-dessus de 5:1 avec le texte blanc.
// L'ancienne palette descendait à 2,15:1 sur l'ambre et 2,89:1 sur le
// cyan — les initiales y étaient illisibles, en clair comme en sombre.
// Un liseré translucide détache la pastille du panneau sombre, où son
// contraste de forme tombe à 2,2:1 sur l'indigo.

const TEINTES = [
  '#4338CA', '#1D4ED8', '#7C3AED', '#B45309',
  '#BE123C', '#0E7490', '#047857', '#9333EA',
] as const;

/**
 * Teinte stable d'une personne.
 *
 * Somme des codes du prénom ET du nom : avec le seul premier caractère
 * du prénom, tous les Mohamed d'une équipe recevaient la même couleur,
 * ce qui annule l'intérêt du repère visuel.
 */
function teinteDe(prenom = '', nom = ''): string {
  let somme = 0;
  for (const c of `${prenom}${nom}`) somme = (somme + c.charCodeAt(0)) % 9973;
  return TEINTES[somme % TEINTES.length];
}

const initiales = (prenom = '', nom = '') =>
  `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase() || '?';

// ── Utilitaires ────────────────────────────────────────────────────

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const localeDe = (langue: string) => LOCALES[langue] ?? 'fr-FR';

/** Ancienneté en mois révolus, ou null si la date manque ou est à venir */
function moisDepuis(iso?: string): number | null {
  if (!iso) return null;
  const debut = new Date(iso).getTime();
  if (!Number.isFinite(debut) || debut > Date.now()) return null;
  return Math.floor((Date.now() - debut) / (30.44 * 86400000));
}

/**
 * Le code HTTP d'une erreur, quelle que soit la forme sous laquelle
 * l'intercepteur la rejette : l'erreur axios complète, ou seulement le
 * corps de la réponse.
 */
function codeDe(e: unknown): number | null {
  const x = e as Record<string, any> | null;
  return x?.response?.status ?? x?.status ?? x?.statusCode ?? null;
}

function Avatar({ collegue, taille = 'md' }: {
  collegue: Collegue;
  taille?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const dims = {
    sm: 'w-9 h-9 text-[11px]',
    md: 'w-12 h-12 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-2xl',
  }[taille];

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center text-white font-bold shrink-0 ring-1 ring-white/15 shadow-sm select-none`}
      style={{ backgroundColor: teinteDe(collegue.prenom, collegue.nom) }}
      aria-hidden="true"
    >
      {initiales(collegue.prenom, collegue.nom)}
    </div>
  );
}

// ── Actions de contact ─────────────────────────────────────────────

function BoutonAction({ icone: Icone, libelle, onClick, href, primaire }: {
  icone: React.ComponentType<{ className?: string }>;
  libelle: string;
  onClick?: () => void;
  href?: string;
  primaire?: boolean;
}) {
  const classes = primaire
    ? 'bg-brand-500 hover:bg-brand-600 text-white'
    : 'bg-stone-50 hover:bg-stone-100 text-stone-600';

  const contenu = (
    <>
      <Icone className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{libelle}</span>
    </>
  );

  const commun =
    `flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${classes}`;

  if (href) {
    return (
      <a href={href} className={commun} onClick={(e) => e.stopPropagation()}>
        {contenu}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={commun}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
      {contenu}
    </button>
  );
}

// ── Fiche détaillée, en panneau latéral ────────────────────────────
//
// Un panneau plutôt qu'une fenêtre centrée : la liste reste visible
// derrière, et passer d'une personne à l'autre ne fait pas clignoter
// tout l'écran.

function FicheCollegue({ collegue, onFermer, langue, t, tn }: {
  collegue: Collegue;
  onFermer: () => void;
  langue: string;
  t: (c: Cle) => string;
  tn: (c: Cle, n: number) => string;
}) {
  const [copie, setCopie] = useState(false);
  const mois = moisDepuis(collegue.dateEmbauche);
  const navigate = useNavigate();

  useEffect(() => {
    const sortie = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', sortie);
    return () => window.removeEventListener('keydown', sortie);
  }, [onFermer]);

  const copierEmail = async () => {
    try {
      await navigator.clipboard.writeText(collegue.email);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      // Presse-papiers refusé hors HTTPS : l'adresse reste sélectionnable.
    }
  };

  const anciennete = mois === null ? null
    : mois < 1 ? t('an.arriveCeMois')
      : mois < 12 ? tn('an.moisAnciennete', mois)
        : tn('an.ansAnciennete', Math.floor(mois / 12));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onFermer}
      role="dialog"
      aria-modal="true"
    >
      <aside
        className="bg-surface w-full max-w-sm h-full shadow-2xl flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-6 pb-5 bg-stone-50 border-b border-stone-200">
          <button
            onClick={onFermer}
            className="absolute top-4 p-2 rounded-xl hover:bg-stone-100 transition-colors"
            style={{ insetInlineEnd: '1rem' }}
            aria-label={t('an.fermer')}
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>

          <div className="flex flex-col items-center text-center pt-4">
            <Avatar collegue={collegue} taille="xl" />
            <h2 className="font-bold text-lg text-stone-800 mt-3">
              {collegue.prenom} {collegue.nom}
            </h2>
            {collegue.poste && (
              <p className="text-sm text-stone-500 mt-0.5">{collegue.poste}</p>
            )}
            {collegue.departement && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full mt-2.5 bg-brand-500/10 text-brand-texte">
                <Building2 className="w-3 h-3" />
                {collegue.departement}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 flex-1">
          <div className="grid grid-cols-2 gap-2">
            {collegue.email ? (
              <BoutonAction
                icone={Mail}
                libelle={t('an.ecrireMail')}
                href={`mailto:${collegue.email}`}
                primaire
              />
            ) : (
              <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-stone-50 text-stone-400">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('an.sansAdresse')}</span>
              </div>
            )}
            {MESSAGERIE_INTERNE ? (
              <BoutonAction
                icone={MessageSquare}
                libelle={t('an.envoyerMessage')}
                onClick={() => navigate(routeMessageInterne(collegue.id))}
              />
            ) : collegue.telephone ? (
              <BoutonAction
                icone={Phone}
                libelle={t('an.appeler')}
                href={`tel:${collegue.telephone}`}
              />
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
              {t('an.contact')}
            </p>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50">
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-stone-200">
                <Mail className="w-4 h-4 text-brand-texte" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-stone-400">{t('an.email')}</div>
                <div className="text-sm text-stone-800 truncate">
                  {collegue.email || <span className="text-stone-400">{t('an.sansAdresse')}</span>}
                </div>
              </div>
              <button
                onClick={copierEmail}
                className="p-2 rounded-lg hover:bg-surface transition-colors shrink-0"
                aria-label={t('an.copier')}
              >
                {copie
                  ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                  : <Copy className="w-3.5 h-3.5 text-stone-400" />}
              </button>
            </div>

            {collegue.telephone && (
              <a
                href={`tel:${collegue.telephone}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-stone-200">
                  <Phone className="w-4 h-4 text-brand-texte" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-stone-400">{t('an.telephone')}</div>
                  <div className="text-sm text-stone-800">{collegue.telephone}</div>
                </div>
              </a>
            )}

            {anciennete && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50">
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-stone-200">
                  <CalendarDays className="w-4 h-4 text-brand-texte" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-stone-400">{t('an.dansEntreprise')}</div>
                  <div className="text-sm text-stone-800">{anciennete}</div>
                  {collegue.dateEmbauche && (
                    <div className="text-[10px] text-stone-400">
                      {t('an.depuisLe')}{' '}
                      {new Date(collegue.dateEmbauche).toLocaleDateString(localeDe(langue), {
                        month: 'long', year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!MESSAGERIE_INTERNE && (
            <p className="text-[11px] text-stone-400 leading-relaxed">
              {t('an.messagerieBientot')}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Carte d'un collègue ────────────────────────────────────────────

function CarteCollegue({ collegue, onOuvrir, t, signaler }: {
  collegue: Collegue;
  onOuvrir: () => void;
  t: (c: Cle) => string;
  /** Afficher la pastille « adresse personnelle » (RH uniquement) */
  signaler?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div
      onClick={onOuvrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } }}
      className="group bg-surface rounded-2xl border border-stone-100 p-4 cursor-pointer hover:border-brand-500/40 hover:shadow-md transition-all focus:outline-none focus:border-brand-500"
    >
      <div className="flex flex-col items-center text-center">
        <Avatar collegue={collegue} taille="lg" />

        {/* `line-clamp-2` et non `truncate`.
            Sur une carte à deux colonnes (téléphone), `truncate` coupait
            « Responsable recrutement » — un intitulé parfaitement
            ordinaire — et le nom avec. Un nom tronqué dans un annuaire
            annule la raison d'être de la page. Deux lignes suffisent à
            tout ce qui existe dans une PME ; au-delà, l'intitulé est
            écourté mais le nom reste entier. */}
        <div className="text-sm font-bold text-stone-800 line-clamp-2 w-full mt-2.5 break-words">
          {collegue.prenom} {collegue.nom}
        </div>
        <div className="text-xs text-stone-500 line-clamp-2 w-full mt-0.5 min-h-8 break-words">
          {collegue.poste ?? ''}
        </div>

        {/* Signalé à la RH seulement : un salarié n'a pas à savoir
            que l'adresse d'un collègue n'est pas régularisée. */}
        {signaler && collegue.adressePersonnelle && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 mt-1.5">
            <AtSign className="w-2.5 h-2.5 shrink-0" />
            {t('an.adressePersonnelle')}
          </span>
        )}

        {/* Les actions apparaissent au survol, mais restent toujours
            présentes au clavier : masquées par l'opacité, jamais
            retirées du flux. */}
        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {/* Le message d'abord : c'est l'action interne, immédiate et
              sans quitter l'application. Le courriel reste là pour
              joindre quelqu'un qui ne consulte pas la messagerie. */}
          {MESSAGERIE_INTERNE && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(routeMessageInterne(collegue.id)); }}
              className="p-2 rounded-lg bg-stone-50 hover:bg-brand-500 hover:text-white text-stone-500 transition-colors"
              aria-label={t('an.envoyerMessage')}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Une fiche peut n'avoir aucune adresse : un lien mailto
              vide ouvrirait une fenêtre de message sans destinataire. */}
          {collegue.email && (
            <a
              href={`mailto:${collegue.email}`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg bg-stone-50 hover:bg-brand-500 hover:text-white text-stone-500 transition-colors"
              aria-label={t('an.ecrireMail')}
            >
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {collegue.telephone && (
            <a
              href={`tel:${collegue.telephone}`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg bg-stone-50 hover:bg-brand-500 hover:text-white text-stone-500 transition-colors"
              aria-label={t('an.appeler')}
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bandeau RH : les adresses à régulariser ────────────────────────
//
// Ces fiches figurent bien dans l'annuaire. Le bandeau ne signale pas
// une absence mais un travail à faire : tant que l'adresse n'appartient
// pas à l'entreprise, la personne ne pourra pas s'en servir pour se
// connecter.

function BandeauARegulariser({ nombre, fiches, t, onAller }: {
  nombre: number;
  fiches: ARegulariser[];
  t: (c: Cle) => string;
  onAller: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <UserX className="w-4 h-4 text-amber-700" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-900">
            {nombre === 1
              ? t('an.aRegulariserUne')
              : `${nombre} ${t('an.aRegulariserPlusieurs')}`}
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            {t('an.aRegulariserAide')}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onAller}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors"
            >
              {t('an.regulariser')}
            </button>
            {fiches.length > 0 && (
              <button
                type="button"
                onClick={() => setOuvert((o) => !o)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                aria-expanded={ouvert}
              >
                {ouvert ? t('an.masquerListe') : t('an.voirListe')}
              </button>
            )}
          </div>

          {ouvert && fiches.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {fiches.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs bg-surface rounded-xl px-3 py-2 border border-amber-100"
                >
                  <span className="font-bold text-stone-800">
                    {f.prenom} {f.nom}
                  </span>
                  <span className="text-stone-500 break-all">{f.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function AnnuairePage() {
  const { t, tn, langue } = useI18n();
  const navigate = useNavigate();

  const [collegues, setCollegues] = useState<Collegue[]>([]);
  const [meta, setMeta] = useState<MetaAnnuaire>({ domaines: [], entreprise: null });
  const [chargement, setChargement] = useState(true);
  const [souci, setSouci] = useState(false);
  const [refuse, setRefuse] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [departement, setDepartement] = useState('tous');
  const [affichage, setAffichage] = useState<Affichage>('grille');
  const [fiche, setFiche] = useState<Collegue | null>(null);

  const charger = useCallback(async () => {
    try {
      setChargement(true);
      setSouci(false);
      setRefuse(false);
      const res = await api.get('/annuaire') as any;
      const d = res?.data ?? res ?? {};
      setCollegues(d.collegues ?? []);
      setMeta({
        domaines: d.domaines ?? [],
        entreprise: d.entreprise ?? null,
        exclus: d.exclus,
        aRegulariser: d.aRegulariser,
      });
    } catch (e) {
      // Un candidat reçoit un 403 : ce n'est pas une panne, et le
      // signaler comme telle l'enverrait cliquer « Réessayer » en
      // boucle.
      if (codeDe(e) === 403) setRefuse(true);
      else {
        console.error("Chargement de l'annuaire :", e);
        setSouci(true);
      }
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const departements = useMemo(() => {
    const liste = new Set(collegues.map((c) => c.departement).filter(Boolean));
    return [...liste].sort((a, b) =>
      String(a).localeCompare(String(b), localeDe(langue))) as string[];
  }, [collegues, langue]);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return collegues
      .filter((c) => {
        if (departement !== 'tous' && c.departement !== departement) return false;
        if (!terme) return true;
        return `${c.prenom} ${c.nom} ${c.email ?? ''} ${c.poste ?? ''} ${c.departement ?? ''}`
          .toLowerCase().includes(terme);
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, localeDe(langue)));
  }, [collegues, recherche, departement, langue]);

  // Le regroupement par département rend la structure de l'entreprise
  // lisible d'un coup d'œil, ce qu'une liste plate ne permet pas.
  const parDepartement = useMemo(() => {
    const carte = new Map<string, Collegue[]>();
    for (const c of filtres) {
      const cle = c.departement || t('an.sansDepartement');
      carte.set(cle, [...(carte.get(cle) ?? []), c]);
    }
    return [...carte.entries()].sort(([a], [b]) =>
      a.localeCompare(b, localeDe(langue)));
  }, [filtres, langue, t]);

  // La RH, et elle seule, reçoit ces champs du serveur.
  const estRh = meta.exclus !== undefined;
  // Ces fiches FIGURENT dans l'annuaire. Le compte sert à la RH pour
  // savoir ce qu'il lui reste à mettre en ordre.
  const aRegulariser = meta.exclus?.horsDomaine ?? 0;

  // ── Accès refusé : un candidat, et rien d'autre à montrer ──
  if (refuse) {
    return (
      <Layout>
        <div className="px-6 sm:px-8 py-20">
          <div className="bg-surface rounded-2xl border border-stone-100 p-12 text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">{t('an.titre')}</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              {t('an.reserveInterne')}
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* ── En-tête ── */}
      <div className="px-6 sm:px-8 py-6 border-b border-stone-200">
        <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
          <span>{meta.entreprise ?? t('an.filEntreprise')}</span>
          <ChevronRight className="w-3 h-3 rtl:rotate-180" />
          <span className="text-brand-texte font-semibold">{t('an.titre')}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">{t('an.titre')}</h2>
            <p className="text-stone-500 mt-1 text-sm">
              {chargement ? t('an.chargement') : (
                <>
                  {tn('an.collaborateurs', collegues.length)}
                  {departements.length > 0 && ` · ${tn('an.departements', departements.length)}`}
                </>
              )}
            </p>

            {/* Le domaine de l'entreprise : c'est lui qui décide qui
                figure ici, autant le dire à l'écran plutôt que de
                laisser deviner pourquoi quelqu'un manque. */}
            {!chargement && meta.domaines.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <AtSign className="w-3 h-3 text-stone-400 shrink-0" />
                {meta.domaines.map((d) => (
                  <span
                    key={d}
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-texte break-all"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-stone-200 p-1 bg-surface shrink-0">
            {([['grille', LayoutGrid], ['liste', List]] as [Affichage, any][]).map(([mode, Icone]) => (
              <button
                key={mode}
                onClick={() => setAffichage(mode)}
                aria-pressed={affichage === mode}
                aria-label={t(mode === 'grille' ? 'an.vueGrille' : 'an.vueListe')}
                className={`p-2 rounded-lg transition-colors ${
                  affichage === mode
                    ? 'bg-brand-500 text-white'
                    : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                <Icone className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-8 py-6 space-y-5">

        {/* ── Ce que la RH doit savoir avant de lire la liste ── */}
        {!chargement && estRh && aRegulariser > 0 && (
          <BandeauARegulariser
            nombre={aRegulariser}
            fiches={meta.aRegulariser ?? []}
            t={t}
            onAller={() => navigate(ROUTE_SALARIES)}
          />
        )}

        {/* Aucun domaine déclaré : l'annuaire n'est alors filtré par
            rien, et ça se voit — autant l'expliquer à la RH plutôt
            qu'elle découvre des adresses personnelles dans l'annuaire. */}
        {!chargement && estRh && meta.domaines.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-stone-200">
                <AtSign className="w-4 h-4 text-stone-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-800">{t('an.aucunDomaine')}</p>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {t('an.aucunDomaineAide')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(ROUTE_ENTREPRISE)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-surface hover:bg-stone-100 text-stone-600 border border-stone-200 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  {t('an.reglerEntreprise')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Recherche et filtres ── */}
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
              style={{ insetInlineStart: '0.75rem' }}
            />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('an.recherchePlaceholder')}
              className="w-full ps-9 pe-8 py-2.5 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500 transition-colors text-start"
            />
            {recherche && (
              <button
                onClick={() => setRecherche('')}
                className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                style={{ insetInlineEnd: '0.6rem' }}
                aria-label={t('an.effacer')}
              >
                <X className="w-3.5 h-3.5 text-stone-400" />
              </button>
            )}
          </div>

          {departements.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {[['tous', t('an.tous')] as [string, string],
                ...departements.map((d) => [d, d] as [string, string])].map(([cle, label]) => {
                const actif = departement === cle;
                return (
                  <button
                    key={cle}
                    onClick={() => setDepartement(cle)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      actif
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500/50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Contenu ── */}
        {souci ? (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{t('an.erreurChargement')}</span>
            <button onClick={charger} className="font-bold underline shrink-0">
              {t('an.reessayer')}
            </button>
          </div>
        ) : chargement ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-4 animate-pulse">
                <div className="w-14 h-14 rounded-full bg-stone-100 mx-auto" />
                <div className="h-3 bg-stone-100 rounded w-24 mx-auto mt-3" />
                <div className="h-2.5 bg-stone-100 rounded w-16 mx-auto mt-2" />
              </div>
            ))}
          </div>
        ) : filtres.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-stone-100 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">
              {collegues.length === 0 ? t('an.aucunCollaborateur') : t('an.aucunResultat')}
            </p>
            <p className="text-xs text-stone-500">
              {collegues.length === 0 ? t('an.annuaireVideAide') : t('an.affinerRecherche')}
            </p>
          </div>
        ) : affichage === 'grille' ? (
          <div className="space-y-8">
            {parDepartement.map(([dept, membres]) => (
              <section key={dept}>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-brand-texte shrink-0" />
                  <h3 className="text-sm font-bold text-stone-800">{dept}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
                    {membres.length}
                  </span>
                  <div className="flex-1 h-px bg-stone-100" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {membres.map((c) => (
                    <CarteCollegue
                      key={c.id}
                      collegue={c}
                      onOuvrir={() => setFiche(c)}
                      t={t}
                      signaler={estRh}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-stone-100 overflow-hidden">
            {filtres.map((c) => (
              <div
                key={c.id}
                onClick={() => setFiche(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setFiche(c); }}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors cursor-pointer text-start focus:outline-none focus:bg-stone-50"
              >
                <Avatar collegue={c} taille="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-stone-800 truncate">
                      {c.prenom} {c.nom}
                    </span>
                    {estRh && c.adressePersonnelle && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                        <AtSign className="w-2.5 h-2.5" />
                        {t('an.adressePersonnelle')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 truncate">{c.poste}</div>
                </div>

                <div className="text-xs text-stone-500 shrink-0 hidden sm:block">
                  {c.departement}
                </div>

                <div className="text-xs text-stone-400 shrink-0 truncate max-w-56 hidden lg:block">
                  {c.email}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {MESSAGERIE_INTERNE && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(routeMessageInterne(c.id)); }}
                      className="p-2 rounded-lg hover:bg-brand-500 hover:text-white text-stone-400 transition-colors"
                      aria-label={t('an.envoyerMessage')}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg hover:bg-brand-500 hover:text-white text-stone-400 transition-colors"
                      aria-label={t('an.ecrireMail')}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {fiche && (
        <FicheCollegue
          collegue={fiche}
          onFermer={() => setFiche(null)}
          langue={langue}
          t={t}
          tn={tn}
        />
      )}
    </Layout>
  );
}