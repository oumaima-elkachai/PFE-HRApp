// src/pages/admin/DashboardPage.tsx
//
// Premier écran après connexion, côté ressources humaines. Tout ce qui
// s'affiche vient des API : aucune donnée simulée, parce qu'un tableau
// de bord qui ment est pire qu'un tableau de bord vide.
//
// ── Ce que cette page sert à faire ──────────────────────────────────
//
// Une seule chose : savoir où agir d'abord. Les compteurs du haut
// disent l'état de l'entreprise, la file d'attente dit ce qui bloque
// quelqu'un en ce moment. Le reste — courbes, agenda, absents — est du
// contexte, et vient après.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// 1. La file d'attente ignorait deux sources : les pièces du dossier
//    personnel déposées et jamais relues, et les recommandations de
//    cooptation. Un salarié pouvait attendre trois semaines qu'on
//    regarde son contrat signé sans que rien ne l'indique ici.
//
// 2. Les absents du jour se calculaient en UTC
//    (`new Date().toISOString()`). Entre minuit et une heure du matin
//    en Tunisie, la page affichait les absents de la veille.
//
// 3. Le lien « Voir les congés » pointait sur `/conges` alors que la
//    file d'attente, juste au-dessus, pointait sur `/admin/conges`.
//    L'un des deux était mort.
//
// 4. Rien n'était prévu en dessous de 1024 px : quatre indicateurs et
//    quatre raccourcis sur une ligne, graphiques en `col-span-2`.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Briefcase, CalendarDays, Wallet, ArrowRight, Hourglass,
  Receipt, FileText, UserPlus, AlertTriangle, CheckCircle2, Clock,
  FolderCheck, Handshake,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { EnTete, StatCard, CARTE, TONS, ACCENT } from '@/components/ui/kit';
import { STYLES_ANIMATION } from '@/utils/animations';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const tnd = (v: number) => `${v.toFixed(0)} TND`;

// Les couleurs des graphiques viennent des tons communs. Recharts
// n'accepte pas de classes, seulement des valeurs : c'est le seul
// endroit de la page où une couleur est écrite.
const PALETTE = [
  TONS.brand.pastille, TONS.bleu.pastille, TONS.violet.pastille,
  TONS.amber.pastille, TONS.red.pastille, '#22A6BF',
];

const GRILLE = '#EDEFF8';
const TEXTE_AXE = '#9298B0';

const INFOBULLE = {
  background: '#ffffff',
  border: '1px solid #e7e5e4',
  borderRadius: 12,
  fontSize: 12,
};

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/** Date du jour en heure locale. `toISOString` renverrait la date UTC. */
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Un appel qui échoue ne doit pas vider le tableau de bord entier :
 * chaque source retombe sur un tableau vide.
 */
const lister = (url: string, cle: string, params?: any) =>
  api.get(url, params ? { params } : undefined)
    .then((r: any) => (r?.data?.[cle] ?? []) as any[])
    .catch(() => [] as any[]);

// ── Carte de contenu ───────────────────────────────────────────────

function Carte({ titre, sousTitre, action, onAction, children, className = '', delai = 0 }: {
  titre: string;
  sousTitre?: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
  delai?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter ${CARTE} p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-stone-800 text-sm">{titre}</h3>
          {sousTitre && <p className="text-xs text-stone-400 mt-0.5">{sousTitre}</p>}
        </div>
        {action && onAction && (
          <button
            onClick={onAction}
            className="text-xs font-bold text-brand-texte flex items-center gap-1 hover:underline shrink-0"
          >
            {action}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chargement, setChargement] = useState(true);
  const [donnees, setDonnees] = useState({
    employes: [] as any[],
    offres: [] as any[],
    conges: [] as any[],
    candidatures: [] as any[],
    factures: [] as any[],
    notesFrais: [] as any[],
    documents: [] as any[],
    evenements: [] as any[],
    entretiens: [] as any[],
    cooptations: [] as any[],
    dossiers: [] as any[],
  });

  useEffect(() => {
    (async () => {
      try {
        const [
          employes, offres, conges, candidatures, factures,
          notesFrais, documents, evenements, entretiens,
          cooptations, dossiers,
        ] = await Promise.all([
          lister('/employes', 'employes'),
          lister('/offres', 'offres'),
          lister('/conges', 'conges'),
          lister('/candidatures', 'candidatures'),
          lister('/factures', 'factures'),
          lister('/frais/notes', 'notes', { statut: 'SOUMISE' }),
          lister('/documents/demandes', 'demandes', { statut: 'EN_ATTENTE' }),
          lister('/evenements', 'evenements'),
          lister('/entretiens', 'entretiens'),
          lister('/cooptations', 'cooptations'),
          // Les pièces du dossier personnel en attente de relecture.
          lister('/dossier/a-valider', 'dossiers'),
        ]);

        setDonnees({
          employes, offres, conges, candidatures, factures,
          notesFrais, documents, evenements, entretiens,
          cooptations, dossiers,
        });
      } catch (e) {
        console.error('Chargement du tableau de bord :', e);
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const actifs = useMemo(
    () => donnees.employes.filter((e) => String(e.statut).toLowerCase() === 'actif'),
    [donnees.employes]
  );

  const offresActives = useMemo(
    () => donnees.offres.filter((o) => o.statut === 'ACTIVE'),
    [donnees.offres]
  );

  // La masse salariale vient des bulletins du dernier mois émis, pas
  // d'une somme de salaires contractuels : c'est ce qui a été versé.
  const dernierePeriode = useMemo(() => {
    const periodes = donnees.factures.map((f) => f.periode).filter(Boolean).sort();
    return periodes[periodes.length - 1] ?? null;
  }, [donnees.factures]);

  const masseSalariale = useMemo(() => {
    if (!dernierePeriode) return 0;
    return donnees.factures
      .filter((f) => f.periode === dernierePeriode)
      .reduce((s, f) => s + (f.salaireNet ?? 0), 0);
  }, [donnees.factures, dernierePeriode]);

  // Effectif par mois, reconstruit depuis les dates d'embauche et de
  // sortie : chaque point compte les salariés présents à cette date.
  const effectifParMois = useMemo(() => {
    const maintenant = new Date();
    return [...Array(6)].map((_, i) => {
      const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - (5 - i) + 1, 0);
      const presents = donnees.employes.filter((e) => {
        const embauche = e.dateEmbauche ? new Date(e.dateEmbauche) : null;
        if (!embauche || embauche > date) return false;
        if (String(e.statut).toLowerCase() === 'inactif' && e.sortieLe) {
          return new Date(e.sortieLe) > date;
        }
        return true;
      }).length;

      return { mois: MOIS_COURTS[date.getMonth()], effectif: presents };
    });
  }, [donnees.employes]);

  // Candidatures reçues et embauches par mois, sur les six derniers.
  const recrutementParMois = useMemo(() => {
    const maintenant = new Date();
    return [...Array(6)].map((_, i) => {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - (5 - i), 1);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const recues = donnees.candidatures.filter(
        (c) => String(c.creeLe ?? '').startsWith(cle)
      ).length;

      const embauches = donnees.candidatures.filter(
        (c) => c.statut === 'EMBAUCHE' && String(c.majLe ?? c.creeLe ?? '').startsWith(cle)
      ).length;

      return { mois: MOIS_COURTS[d.getMonth()], recues, embauches };
    });
  }, [donnees.candidatures]);

  const parDepartement = useMemo(() => {
    const comptes = new Map<string, number>();
    for (const e of actifs) {
      const dept = e.departement || 'Non renseigné';
      comptes.set(dept, (comptes.get(dept) ?? 0) + 1);
    }
    return [...comptes.entries()]
      .map(([nom, nb]) => ({
        nom,
        nb,
        pct: actifs.length ? Math.round((nb / actifs.length) * 100) : 0,
      }))
      .sort((a, b) => b.nb - a.nb);
  }, [actifs]);

  // ── Ce qui attend une décision ──
  //
  // Six sources. Deux manquaient : les pièces du dossier personnel,
  // qu'un salarié dépose et que personne ne relit, et les
  // recommandations de cooptation.
  const aTraiter = useMemo(() => {
    const piecesEnAttente = donnees.dossiers.reduce(
      (total, d) => total + (d.pieces?.length ?? 0),
      0
    );

    return [
      { label: 'Congés', nb: donnees.conges.filter((c) => c.statut === 'EN_ATTENTE').length,
        icone: CalendarDays, route: '/admin/conges', tonalite: 'amber' },
      { label: 'Pièces', nb: piecesEnAttente,
        icone: FolderCheck, route: '/admin/dossiers', tonalite: 'brand' },
      { label: 'Notes de frais', nb: donnees.notesFrais.length,
        icone: Receipt, route: '/frais-rh', tonalite: 'violet' },
      { label: 'Documents', nb: donnees.documents.length,
        icone: FileText, route: '/documents-rh', tonalite: 'bleu' },
      { label: 'Candidatures', nb: donnees.candidatures.filter((c) => c.statut === 'SOUMIS').length,
        icone: UserPlus, route: '/candidatures', tonalite: 'brand' },
      { label: 'Cooptations', nb: donnees.cooptations.filter((c) => c.statut === 'ENVOYEE').length,
        icone: Handshake, route: '/admin/cooptations', tonalite: 'bleu' },
    ];
  }, [donnees]);

  const totalATraiter = aTraiter.reduce((s, a) => s + a.nb, 0);

  // Les sept prochains jours : entretiens et événements mêlés, triés
  // par date. C'est l'agenda de la semaine en un coup d'œil.
  const prochainement = useMemo(() => {
    const maintenant = Date.now();
    const limite = maintenant + 7 * 86400000;

    const entretiens = donnees.entretiens
      .filter((e) => {
        const t = new Date(e.dateHeure ?? e.date ?? 0).getTime();
        return t >= maintenant && t <= limite;
      })
      .map((e) => ({
        id: `entretien-${e.id}`,
        date: e.dateHeure ?? e.date,
        titre: e.candidatNom ?? 'Entretien',
        detail: e.offreTitre ?? 'Entretien de recrutement',
        type: 'entretien' as const,
      }));

    const evenements = donnees.evenements
      .filter((e) => {
        const t = new Date(e.dateDebut ?? 0).getTime();
        return t >= maintenant && t <= limite && e.statut !== 'ANNULE';
      })
      .map((e) => ({
        id: `evenement-${e.id}`,
        date: e.dateDebut,
        titre: e.titre,
        detail: e.typeLibelle ?? 'Événement',
        type: 'evenement' as const,
      }));

    return [...entretiens, ...evenements]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 6);
  }, [donnees.entretiens, donnees.evenements]);

  // Les salariés absents aujourd'hui, d'après les congés approuvés.
  const absents = useMemo(() => {
    const jour = aujourdhui();
    return donnees.conges.filter((c) =>
      c.statut === 'APPROUVE'
      && String(c.dateDebut).split('T')[0] <= jour
      && String(c.dateFin).split('T')[0] >= jour
    );
  }, [donnees.conges]);

  const prenom = (user as any)?.prenom ?? '';
  const sorties = donnees.employes.length - actifs.length;

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Pilotage', 'Tableau de bord']}
          titre={`Bonjour${prenom ? ` ${prenom}` : ''}`}
          sousTitre={chargement ? 'Chargement…' : totalATraiter > 0 ? (
            <>
              <span className="text-amber-600 font-semibold">
                {totalATraiter} demande{totalATraiter > 1 ? 's' : ''}
              </span>
              {' en attente de votre décision'}
              {absents.length > 0 && (
                <> · {absents.length} salarié{absents.length > 1 ? 's' : ''} en congé aujourd'hui</>
              )}
            </>
          ) : "Rien n'attend votre décision aujourd'hui"}
        />

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-4">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Effectif"
              value={chargement ? '…' : actifs.length}
              sub={chargement ? undefined
                : `${sorties} sortie${sorties > 1 ? 's' : ''} · ${parDepartement.length} département${parDepartement.length > 1 ? 's' : ''}`}
              tonalite="brand"
              delai={0}
              onClick={() => navigate('/allemployees')}
            />
            <StatCard
              icon={Briefcase}
              label="Offres actives"
              value={chargement ? '…' : offresActives.length}
              sub={chargement ? undefined
                : `${donnees.candidatures.length} candidature${donnees.candidatures.length > 1 ? 's' : ''} reçues`}
              tonalite="bleu"
              delai={60}
              onClick={() => navigate('/job-offers')}
            />
            <StatCard
              icon={Hourglass}
              label="En attente de décision"
              value={chargement ? '…' : totalATraiter}
              sub="congés, dossiers, frais, documents, recrutement"
              tonalite="amber"
              alerte={totalATraiter > 0}
              delai={120}
            />
            <StatCard
              icon={Wallet}
              label="Masse salariale nette"
              value={chargement ? '…' : masseSalariale > 0 ? tnd(masseSalariale) : '—'}
              sub={dernierePeriode
                ? `bulletins de ${MOIS_COURTS[Number(dernierePeriode.split('-')[1]) - 1]} ${dernierePeriode.split('-')[0]}`
                : 'aucun bulletin émis'}
              tonalite="violet"
              delai={180}
              onClick={() => navigate('/invoicing')}
            />
          </div>

          {/* ── File d'attente ── */}
          {/* La raison d'être de cet écran : savoir où agir d'abord. */}
          {!chargement && totalATraiter > 0 && (
            <div style={{ animationDelay: '240ms' }} className={`hrup-monter ${CARTE} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-stone-800 text-sm">À traiter</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {aTraiter.map(({ label, nb, icone: Icone, route, tonalite }) => {
                  const t = TONS[tonalite] ?? TONS.stone;
                  return (
                    <button
                      key={label}
                      onClick={() => navigate(route)}
                      disabled={nb === 0}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${
                        nb > 0
                          ? 'border-stone-200 hover:border-brand-500 hover:shadow-sm cursor-pointer'
                          : 'border-stone-100 opacity-40 cursor-default'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.bg}`}>
                        <Icone className={`w-4 h-4 ${t.text}`} />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-lg font-bold leading-none ${nb > 0 ? t.text : 'text-stone-400'}`}>
                          {nb}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 truncate">{label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!chargement && totalATraiter === 0 && (
            <div className={`hrup-monter ${CARTE} p-5 flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-brand-texte" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">Aucune demande en attente</p>
                <p className="text-xs text-stone-500">
                  Congés, dossiers, notes de frais, documents et recrutement sont à jour.
                </p>
              </div>
            </div>
          )}

          {/* ── Effectif ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Carte
              titre="Évolution de l'effectif"
              sousTitre="Salariés présents, six derniers mois"
              className="xl:col-span-2"
              delai={300}
            >
              {chargement ? (
                <div className="h-45 bg-stone-50 rounded-xl animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={effectifParMois} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradEffectif" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={ACCENT} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRILLE} />
                    <XAxis dataKey="mois" tick={{ fontSize: 11, fill: TEXTE_AXE }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: TEXTE_AXE }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={INFOBULLE} />
                    <Area
                      type="monotone"
                      dataKey="effectif"
                      name="Effectif"
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#gradEffectif)"
                      dot={{ fill: ACCENT, r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Carte>

            <Carte titre="Par département" sousTitre="Répartition de l'effectif" delai={360}>
              {chargement ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-3 bg-stone-100 rounded mb-2" />
                      <div className="h-1.5 bg-stone-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : parDepartement.length === 0 ? (
                <p className="text-xs text-stone-400 py-8 text-center">Aucun salarié</p>
              ) : (
                <div className="space-y-3">
                  {parDepartement.slice(0, 6).map((d, i) => (
                    <div key={d.nom}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-xs text-stone-700 truncate">{d.nom}</span>
                        <span className="text-xs font-bold text-stone-500 shrink-0">{d.nb}</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${d.pct}%`,
                            backgroundColor: PALETTE[i % PALETTE.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Carte>
          </div>

          {/* ── Recrutement et agenda ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Carte
              titre="Activité de recrutement"
              sousTitre="Candidatures reçues et embauches"
              action="Voir le pipeline"
              onAction={() => navigate('/candidatures')}
              className="xl:col-span-2"
              delai={420}
            >
              {chargement ? (
                <div className="h-38 bg-stone-50 rounded-xl animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={recrutementParMois} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRILLE} />
                    <XAxis dataKey="mois" tick={{ fontSize: 11, fill: TEXTE_AXE }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: TEXTE_AXE }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={INFOBULLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="recues" name="Candidatures" fill="#C3C7FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="embauches" name="Embauches" fill={ACCENT} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Carte>

            <Carte
              titre="Cette semaine"
              sousTitre="Entretiens et événements"
              action="Agenda"
              onAction={() => navigate('/calendar')}
              delai={480}
            >
              {chargement ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-2.5 animate-pulse">
                      <div className="w-9 h-9 bg-stone-100 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-stone-100 rounded w-24" />
                        <div className="h-2.5 bg-stone-100 rounded w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : prochainement.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-stone-300" />
                  <p className="text-xs text-stone-400">Rien de prévu cette semaine</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {prochainement.map((p) => {
                    const date = new Date(p.date);
                    const entretien = p.type === 'entretien';
                    const t = entretien ? TONS.bleu : TONS.brand;
                    return (
                      <div key={p.id} className="flex items-start gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 ${t.bg}`}>
                          <span className={`text-[11px] font-bold leading-none ${t.text}`}>
                            {date.getDate()}
                          </span>
                          <span className="text-[8px] text-stone-400 leading-none mt-0.5">
                            {MOIS_COURTS[date.getMonth()].slice(0, 3)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-stone-800 truncate">{p.titre}</div>
                          <div className="text-[10px] text-stone-400 truncate">
                            {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {' · '}{p.detail}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Carte>
          </div>

          {/* ── Absents du jour ── */}
          {!chargement && absents.length > 0 && (
            <Carte
              titre="En congé aujourd'hui"
              sousTitre={`${absents.length} salarié${absents.length > 1 ? 's' : ''} absent${absents.length > 1 ? 's' : ''}`}
              action="Voir les congés"
              onAction={() => navigate('/admin/conges')}
              delai={540}
            >
              <div className="flex flex-wrap gap-2">
                {absents.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 bg-stone-50 rounded-xl ps-1.5 pe-3 py-1.5"
                    title={`Jusqu'au ${new Date(c.dateFin).toLocaleDateString('fr-FR')}`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: couleurDe(c.employeNom) }}
                    >
                      {initiales(c.employeNom)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-800">{c.employeNom}</div>
                      <div className="text-[10px] text-stone-400">
                        jusqu'au {new Date(c.dateFin).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Carte>
          )}

          {/* ── Raccourcis ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {([
              ['Publier une offre', Briefcase, '/job-offers'],
              ['Générer un bulletin', Wallet, '/invoicing'],
              ['Ajouter un salarié', UserPlus, '/allemployees'],
              ['Publier un événement', CalendarDays, '/evenementsAdmin'],
            ] as [string, React.ComponentType<{ className?: string }>, string][])
              .map(([label, Icone, route], i) => (
                <button
                  key={label}
                  onClick={() => navigate(route)}
                  style={{ animationDelay: `${600 + i * 60}ms` }}
                  className={`hrup-monter hrup-carte ${CARTE} p-4 flex items-center gap-3 hover:shadow-md hover:border-brand-500 text-start`}
                >
                  <div className="w-9 h-9 rounded-xl bg-stone-50 flex items-center justify-center shrink-0">
                    <Icone className="w-4 h-4 text-brand-texte" />
                  </div>
                  <span className="text-xs font-bold text-stone-700">{label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-300 ms-auto shrink-0" />
                </button>
              ))}
          </div>
        </div>

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}