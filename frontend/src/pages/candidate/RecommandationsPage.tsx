// src/pages/candidate/RecommandationsPage.tsx
//
// Offres classées par correspondance avec le profil du candidat. Le
// score est explicité : une recommandation qu'on ne comprend pas ne
// convainc personne de postuler.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// Les composants recopiés viennent du kit, et les couleurs des
// indicateurs suivent la palette commune — le bleu, le violet et
// l'ambre y étaient choisis au cas par cas. La grille à quatre
// colonnes et celle à trois se replient enfin. La logique du score,
// des filtres et des alertes n'a pas bougé.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Bell, BellOff, Check, X, Briefcase, MapPin, ArrowRight,
  AlertCircle, Settings2, TrendingUp, Search, SlidersHorizontal,
  Target, CheckCircle2, GraduationCap,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import {
  EnTete, StatCard, Toast, Vide, CARTE, CHAMP, ACCENT,
} from '../../components/ui/kit';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

const PAR_PAGE = 6;

interface Recommandation {
  offre: {
    id: string;
    titre: string;
    departement: string;
    type: string;
    modeTravail: string;
    creeLe: string;
  };
  score: number;
  detail: { competences: number; poste: number; niveau: number; departement: number };
  competencesCommunes: string[];
  competencesManquantes: string[];
  explication: string;
}

interface Alerte {
  active: boolean;
  scoreMinimum: number;
  departements: string[];
  typesContrat: string[];
}

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];
const CONTRATS = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE'];

// Trois paliers de correspondance, trois traitements visuels : le
// candidat doit distinguer d'un regard ce qui mérite sa candidature.
const PALIERS = [
  { seuil: 75, libelle: 'Très bonne correspondance', bg: 'bg-brand-500/10', text: 'text-brand-texte', barre: 'bg-brand-500', bord: 'border-brand-500/30' },
  { seuil: 55, libelle: 'Correspondance partielle',  bg: 'bg-amber-50',     text: 'text-amber-600',   barre: 'bg-amber-400', bord: 'border-stone-100' },
  { seuil: 0,  libelle: 'Correspondance faible',     bg: 'bg-stone-100',    text: 'text-stone-500',   barre: 'bg-stone-300', bord: 'border-stone-100' },
];

const palierDe = (score: number) =>
  PALIERS.find((p) => score >= p.seuil) ?? PALIERS[PALIERS.length - 1];

// ── Préférences d'alerte ───────────────────────────────────────────

function ModalAlerte({ alerte, onClose, onSucces }: {
  alerte: Alerte;
  onClose: () => void;
  onSucces: (message: string) => void;
}) {
  const [form, setForm] = useState<Alerte>(alerte);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const basculer = (liste: string[], valeur: string) =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      const res = await api.put('/offres/alerte', form) as any;
      onSucces(res?.data?.message ?? 'Préférences enregistrées');
      onClose();
    } catch (e: any) {
      setErreur(e?.erreur ?? "Impossible d'enregistrer");
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-stone-100 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-stone-800">Alertes par courriel</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Soyez averti des offres qui correspondent à votre profil
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-500">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          <button
            onClick={() => setForm({ ...form, active: !form.active })}
            className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border transition-all ${
              form.active ? 'bg-brand-500/10 border-brand-500' : 'bg-surface border-stone-200'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {form.active
                ? <Bell className="w-5 h-5 text-brand-texte shrink-0" />
                : <BellOff className="w-5 h-5 text-stone-400 shrink-0" />}
              <div className="text-start min-w-0">
                <div className="text-sm font-bold text-stone-800">
                  {form.active ? 'Alertes activées' : 'Alertes désactivées'}
                </div>
                <div className="text-xs text-stone-500">Un courriel par offre correspondante</div>
              </div>
            </div>

            <div className={`w-10 h-6 rounded-full p-1 transition-colors shrink-0 ${
              form.active ? 'bg-brand-500' : 'bg-stone-300'
            }`}>
              <div
                className="w-4 h-4 bg-surface rounded-full transition-transform"
                style={{ transform: form.active ? 'translateX(16px)' : 'none' }}
              />
            </div>
          </button>

          <div style={{
            opacity: form.active ? 1 : 0.4,
            pointerEvents: form.active ? 'auto' : 'none',
          }}>
            <div className="mb-5">
              <label className="block text-xs font-medium text-stone-500 mb-2">
                Seuil de correspondance
              </label>
              <input
                type="range"
                min="40"
                max="90"
                step="5"
                value={form.scoreMinimum}
                onChange={(e) => setForm({ ...form, scoreMinimum: Number(e.target.value) })}
                className="w-full accent-brand-texte"
              />
              <div className="flex justify-between text-xs mt-1 text-stone-500">
                <span>Large (40)</span>
                <span className="font-bold text-brand-texte">{form.scoreMinimum} %</span>
                <span>Strict (90)</span>
              </div>
              {/* Un seuil bas noie le candidat sous les messages : le
                  dire évite une désactivation par lassitude. */}
              <p className="text-xs mt-2 text-stone-400 leading-relaxed">
                {form.scoreMinimum <= 50
                  ? 'Vous recevrez beaucoup de messages, dont certains peu pertinents.'
                  : form.scoreMinimum >= 80
                    ? 'Seules les offres très proches de votre profil déclencheront un message.'
                    : 'Bon équilibre entre pertinence et nombre de messages.'}
              </p>
            </div>

            {([
              ['Départements', DEPARTEMENTS, form.departements, 'departements'],
              ['Types de contrat', CONTRATS, form.typesContrat, 'typesContrat'],
            ] as [string, string[], string[], 'departements' | 'typesContrat'][])
              .map(([libelle, liste, choisis, cle]) => (
                <div key={cle} className="mb-5 last:mb-0">
                  <label className="block text-xs font-medium text-stone-500 mb-2">
                    {libelle}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {liste.map((v) => {
                      const choisi = choisis.includes(v);
                      return (
                        <button
                          key={v}
                          onClick={() => setForm({ ...form, [cle]: basculer(choisis, v) })}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                            choisi
                              ? 'bg-brand-500 text-white border-brand-500'
                              : 'bg-surface text-stone-500 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                  {cle === 'departements' && (
                    <p className="text-xs mt-2 text-stone-400">
                      Aucune sélection signifie tous les départements.
                    </p>
                  )}
                </div>
              ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              onClick={onClose}
              className="sm:flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={enregistrer}
              disabled={envoi}
              className="sm:flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Check className="w-4 h-4" />}
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Carte d'une offre recommandée ──────────────────────────────────

function CarteOffre({ reco, onPostuler, delai }: {
  reco: Recommandation;
  onPostuler: () => void;
  delai: number;
}) {
  const palier = palierDe(reco.score);
  const manquantes = reco.competencesManquantes.length;

  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter hrup-carte bg-surface rounded-2xl shadow-sm border overflow-hidden flex flex-col hover:shadow-md ${palier.bord}`}
    >
      {/* Barre de correspondance : le score se lit avant le titre. */}
      <div className="h-1 bg-stone-100">
        <div className={`h-full ${palier.barre}`} style={{ width: `${reco.score}%` }} />
      </div>

      <div className="p-5 flex-1 flex flex-col">

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-stone-800 leading-tight">
              {reco.offre.titre}
            </h4>
            <div className="flex items-center gap-2.5 text-[10px] text-stone-400 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1">
                <Briefcase className="w-2.5 h-2.5" />
                {reco.offre.departement}
              </span>
              <span className="font-bold text-brand-texte">{reco.offre.type}</span>
              {reco.offre.modeTravail && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" />
                  {reco.offre.modeTravail}
                </span>
              )}
            </div>
          </div>

          <div className={`rounded-xl px-2.5 py-1.5 text-center shrink-0 ${palier.bg}`}>
            <div className={`text-lg font-bold leading-none ${palier.text}`}>
              {reco.score}<span className="text-[10px] font-normal">%</span>
            </div>
          </div>
        </div>

        <div className={`text-[10px] font-bold px-2 py-1 rounded-lg inline-block self-start mb-3 ${palier.bg} ${palier.text}`}>
          {palier.libelle}
        </div>

        {/* L'explication rend la recommandation lisible : le candidat
            voit pourquoi cette offre lui est proposée. */}
        <p className="text-xs text-stone-500 mb-3 leading-relaxed line-clamp-2">
          {reco.explication}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3 flex-1 content-start">
          {reco.competencesCommunes.slice(0, 4).map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-brand-500/10 text-brand-texte"
            >
              <Check className="w-2.5 h-2.5" />
              {c}
            </span>
          ))}

          {/* Les compétences manquantes ne sont pas un rejet : elles
              disent au candidat où se former pour la prochaine fois. */}
          {reco.competencesManquantes.slice(0, 2).map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-stone-100 text-stone-500"
              title="Compétence attendue que votre profil ne mentionne pas"
            >
              <GraduationCap className="w-2.5 h-2.5" />
              {c}
            </span>
          ))}

          {manquantes > 2 && (
            <span className="text-[10px] text-stone-400 font-bold px-1 py-0.5">
              +{manquantes - 2}
            </span>
          )}
        </div>

        <div className="pt-3 border-t border-stone-100">
          <div className="flex items-center gap-1.5 text-[10px] text-stone-400 mb-3">
            <TrendingUp className="w-3 h-3 shrink-0" />
            Compétences {reco.detail.competences} · Poste {reco.detail.poste} ·
            Niveau {reco.detail.niveau}
          </div>

          <button
            onClick={onPostuler}
            className="w-full flex items-center justify-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-xs font-bold transition-colors"
          >
            Postuler
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function RecommandationsPage() {
  const navigate = useNavigate();

  const [recommandations, setRecommandations] = useState<Recommandation[]>([]);
  const [profilIncomplet, setProfilIncomplet] = useState(false);
  const [alerte, setAlerte] = useState<Alerte | null>(null);
  const [chargement, setChargement] = useState(true);
  const [preferences, setPreferences] = useState(false);
  const [toast, setToast] = useState('');

  const [recherche, setRecherche] = useState('');
  const [filtreDept, setFiltreDept] = useState('tous');
  const [filtreContrat, setFiltreContrat] = useState('tous');
  const [scoreMin, setScoreMin] = useState(0);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);

  // Un clic hors du menu le referme : sans cela, il resterait ouvert
  // et masquerait la liste qu'il sert à filtrer.
  useEffect(() => {
    if (!menuOuvert) return;
    const auClic = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOuvert(false);
      }
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [menuOuvert]);

  const charger = async () => {
    try {
      setChargement(true);
      const [resReco, resAlerte] = await Promise.allSettled([
        api.get('/offres/recommandations') as any,
        api.get('/offres/alerte') as any,
      ]);

      if (resReco.status === 'fulfilled') {
        setRecommandations(resReco.value?.data?.recommandations ?? []);
        setProfilIncomplet(resReco.value?.data?.profilIncomplet ?? false);
      }
      if (resAlerte.status === 'fulfilled') {
        setAlerte(resAlerte.value?.data?.alerte ?? null);
      }
    } catch (e) {
      console.error('Chargement des recommandations :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(0); }, [recherche, filtreDept, filtreContrat, scoreMin]);

  const departements = useMemo(() => {
    const liste = new Set(recommandations.map((r) => r.offre.departement).filter(Boolean));
    return [...liste].sort();
  }, [recommandations]);

  const contrats = useMemo(() => {
    const liste = new Set(recommandations.map((r) => r.offre.type).filter(Boolean));
    return [...liste].sort();
  }, [recommandations]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return recommandations
      .filter((r) => {
        if (filtreDept !== 'tous' && r.offre.departement !== filtreDept) return false;
        if (filtreContrat !== 'tous' && r.offre.type !== filtreContrat) return false;
        if (r.score < scoreMin) return false;
        if (!terme) return true;
        return `${r.offre.titre} ${r.offre.departement} ${r.competencesCommunes.join(' ')}`
          .toLowerCase().includes(terme);
      })
      // Le meilleur score d'abord : le candidat lit rarement au-delà
      // de la première page.
      .sort((a, b) => b.score - a.score);
  }, [recommandations, recherche, filtreDept, filtreContrat, scoreMin]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  const tresBonnes = recommandations.filter((r) => r.score >= 75).length;
  const meilleurScore = recommandations.length
    ? Math.max(...recommandations.map((r) => r.score))
    : 0;

  // Les compétences qui reviennent le plus souvent dans les offres
  // sans figurer au profil : c'est là qu'une formation paie.
  const aDevelopper = useMemo(() => {
    const comptes = new Map<string, number>();
    for (const r of recommandations) {
      for (const c of r.competencesManquantes) {
        comptes.set(c, (comptes.get(c) ?? 0) + 1);
      }
    }
    return [...comptes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recommandations]);

  const nbFiltres = (filtreDept !== 'tous' ? 1 : 0)
    + (filtreContrat !== 'tous' ? 1 : 0)
    + (scoreMin > 0 ? 1 : 0);

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher une offre…">

        <EnTete
          fil={['Ma recherche', 'Offres pour vous']}
          titre="Offres pour vous"
          sousTitre={chargement ? 'Analyse de votre profil…' : profilIncomplet
            ? 'Complétez votre profil pour recevoir des recommandations'
            : (
              <>
                {filtrees.length} offre{filtrees.length > 1 ? 's' : ''} sur {recommandations.length}
                {tresBonnes > 0 && (
                  <span className="text-brand-texte font-semibold">
                    {' · '}{tresBonnes} très bonne{tresBonnes > 1 ? 's' : ''} correspondance
                    {tresBonnes > 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
        >
          {!profilIncomplet && (
            <>
              <div className="relative w-full sm:w-52">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Poste, compétence…"
                  className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500 transition-colors"
                />
                {recherche && (
                  <button
                    onClick={() => setRecherche('')}
                    aria-label="Effacer la recherche"
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                  >
                    <X className="w-3.5 h-3.5 text-stone-400" />
                  </button>
                )}
              </div>

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOuvert(!menuOuvert)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    menuOuvert || nbFiltres > 0
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filtrer
                  {nbFiltres > 0 && (
                    <span className="bg-surface text-brand-texte text-[10px] font-bold px-1.5 rounded-full">
                      {nbFiltres}
                    </span>
                  )}
                </button>

                {menuOuvert && (
                  <div className="absolute end-0 top-full mt-2 w-72 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
                        Filtres
                      </span>
                      {nbFiltres > 0 && (
                        <button
                          onClick={() => {
                            setFiltreDept('tous');
                            setFiltreContrat('tous');
                            setScoreMin(0);
                          }}
                          className="text-xs font-medium text-stone-500 hover:text-stone-700"
                        >
                          Tout effacer
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        Correspondance minimale
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        step="10"
                        value={scoreMin}
                        onChange={(e) => setScoreMin(Number(e.target.value))}
                        className="w-full accent-brand-texte"
                      />
                      <div className="flex justify-between text-[10px] text-stone-400">
                        <span>Toutes</span>
                        <span className="font-bold text-brand-texte">
                          {scoreMin === 0 ? 'toutes' : `${scoreMin} % et plus`}
                        </span>
                        <span>90 %</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        Département
                      </label>
                      <select
                        value={filtreDept}
                        onChange={(e) => setFiltreDept(e.target.value)}
                        className={CHAMP}
                      >
                        <option value="tous">Tous les départements</option>
                        {departements.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        Type de contrat
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {['tous', ...contrats].map((c) => (
                          <button
                            key={c}
                            onClick={() => setFiltreContrat(c)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              filtreContrat === c
                                ? 'bg-brand-500 text-white border-brand-500'
                                : 'bg-surface text-stone-500 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {c === 'tous' ? 'Tous' : c}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {alerte && (
                <button
                  onClick={() => setPreferences(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    alerte.active
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {alerte.active ? <Bell className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
                  Alertes
                </button>
              )}
            </>
          )}
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">

          {profilIncomplet ? (
            <Vide
              icone={Sparkles}
              message="Complétez votre profil"
              detail="Renseignez vos compétences et le poste que vous visez. Les offres vous seront alors proposées par ordre de correspondance, avec le détail de ce qui vous rapproche de chacune."
              action={(
                <button
                  onClick={() => navigate('/candidat/profile')}
                  className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Compléter mon profil
                </button>
              )}
            />
          ) : (
            <>
              {/* ── Indicateurs ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <StatCard
                  icon={Target}
                  label="Offres correspondantes"
                  value={chargement ? '…' : recommandations.length}
                  sub="classées par pertinence"
                  tonalite="brand"
                  delai={0}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Très bonnes correspondances"
                  value={chargement ? '…' : tresBonnes}
                  sub="75 % et plus"
                  tonalite="brand"
                  delai={60}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Meilleur score"
                  value={chargement ? '…' : `${meilleurScore} %`}
                  sub="sur l'ensemble des offres"
                  tonalite={meilleurScore >= 75 ? 'brand' : 'amber'}
                  delai={120}
                />
                <StatCard
                  icon={alerte?.active ? Bell : BellOff}
                  label="Alertes"
                  value={alerte?.active ? 'Actives' : 'Inactives'}
                  sub={alerte?.active
                    ? `à partir de ${alerte.scoreMinimum} %`
                    : 'aucun courriel envoyé'}
                  tonalite={alerte?.active ? 'brand' : 'stone'}
                  delai={180}
                  onClick={alerte ? () => setPreferences(true) : undefined}
                />
              </div>

              {/* ── Compétences à développer ── */}
              {/* Les manques récurrents valent plus qu'un score : ils
                  disent où une formation ouvrirait des portes. */}
              {!chargement && aDevelopper.length > 0 && (
                <div className={`hrup-monter ${CARTE} p-5 mb-6`}>
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-4 h-4 text-brand-texte" />
                    <h3 className="font-bold text-stone-800 text-sm">
                      Compétences qui reviennent le plus
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    {aDevelopper.map(([competence, nb]) => (
                      <span
                        key={competence}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-stone-50 text-stone-600"
                      >
                        {competence}
                        <span className="text-[10px] text-stone-400">
                          {nb} offre{nb > 1 ? 's' : ''}
                        </span>
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-stone-400 leading-relaxed">
                    Ces compétences sont attendues par plusieurs offres mais ne figurent
                    pas à votre profil. Les acquérir élargirait vos correspondances.
                  </p>
                </div>
              )}

              {/* ── Cartes ── */}
              {chargement ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`${CARTE} p-5 animate-pulse`}>
                      <div className="h-4 bg-stone-100 rounded w-32 mb-2" />
                      <div className="h-3 bg-stone-100 rounded w-24 mb-4" />
                      <div className="h-12 bg-stone-50 rounded-lg mb-3" />
                      <div className="h-9 bg-stone-50 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : filtrees.length === 0 ? (
                <Vide
                  icone={Briefcase}
                  message={recommandations.length === 0
                    ? 'Aucune offre correspondante'
                    : 'Aucun résultat'}
                  detail={recherche ? `Aucune offre ne correspond à « ${recherche} »`
                    : nbFiltres > 0 ? 'Élargissez vos critères de filtrage.'
                    : "Activez les alertes pour être averti dès qu’une offre correspond."}
                  action={(
                    <button
                      onClick={() => navigate('/candidat/offres')}
                      className="text-sm font-bold text-brand-texte hover:underline"
                    >
                      Parcourir toutes les offres
                    </button>
                  )}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pageCourante.map((r, i) => (
                      <CarteOffre
                        key={r.offre.id}
                        reco={r}
                        onPostuler={() => navigate(`/candidat/offres?offre=${r.offre.id}`)}
                        delai={i * 60}
                      />
                    ))}
                  </div>

                  {filtrees.length > PAR_PAGE && (
                    <div className={`${CARTE} mt-4 overflow-hidden`}>
                      <Pagination
                        page={page}
                        taillePage={PAR_PAGE}
                        total={filtrees.length}
                        onPage={setPage}
                        libelle="offre"
                        accent={ACCENT}
                      />
                    </div>
                  )}
                </>
              )}

              {/* ── Comment le score est calculé ── */}
              {/* Une recommandation opaque ne convainc pas : dire sur
                  quoi elle repose rend le classement crédible. */}
              <div className={`${CARTE} mt-4 p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-brand-texte" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    Comment le score est calculé
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {([
                    ['Compétences', "Celles de votre profil présentes dans l’offre"],
                    ['Poste visé', "Proximité avec l’intitulé que vous recherchez"],
                    ['Niveau', 'Votre expérience face à celle attendue'],
                    ['Département', 'Correspondance avec votre domaine'],
                  ] as [string, string][]).map(([libelle, detail]) => (
                    <div key={libelle} className="border-b border-stone-50 pb-2">
                      <div className="text-xs font-bold text-stone-700">{libelle}</div>
                      <p className="text-[10px] text-stone-400 mt-0.5 leading-relaxed">{detail}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-stone-400 mt-3 leading-relaxed">
                  Un score élevé n'est pas une garantie, et un score moyen n'interdit
                  pas de postuler : la lettre de motivation pèse autant que la
                  correspondance technique.
                </p>
              </div>
            </>
          )}
        </div>

        {preferences && alerte && (
          <ModalAlerte
            alerte={alerte}
            onClose={() => setPreferences(false)}
            onSucces={(m) => { setToast(m); charger(); }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}