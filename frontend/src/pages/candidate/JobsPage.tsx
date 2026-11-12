// src/pages/candidate/JobsPage.tsx
//
// Les offres publiées, côté candidat : liste, filtres, recherche,
// pagination.
//
// ── Ce qui a changé depuis la version précédente ────────────────────
//
// 1. La carte mène au détail. Toute la carte est cliquable, et un
//    bouton « Détails » le dit explicitement — un bloc cliquable sans
//    repère visuel ne se découvre pas.
//
// 2. Le paramètre `?offre=` est enfin lu. La page Recommandations
//    envoyait vers `/candidat/offres?offre=ID` depuis le début, et
//    cette page ignorait le paramètre : le bouton « Postuler » d'une
//    recommandation ouvrait la liste complète, sans rien montrer de
//    l'offre choisie. Il redirige maintenant vers le détail.
//
// 3. Une offre déjà postulée le dit. Rien n'empêchait d'envoyer deux
//    dossiers pour le même poste, et le bouton affichait « Postuler »
//    dans tous les cas.
//
// 4. Le formulaire de candidature vit dans son propre fichier : la
//    page de détail s'en sert aussi.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Briefcase, MapPin, Clock, Search, X, ChevronRight,
  Flame, Check, Send,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { EnTete, Toast, Vide, CARTE, ACCENT } from '../../components/ui/kit';
import ModalPostuler from '../../components/candidat/ModalPostuler';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

const PAR_PAGE = 6;


// ── Types ──────────────────────────────────────────────────────────

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description: string;
  statut: 'active' | 'urgente' | 'fermee' | 'ACTIVE' | 'POURVUE' | 'ARCHIVEE';
  urgente?: boolean;
  creeLe: string;
  lieu?: string;
}

const STYLE_TYPE: Record<string, { bg: string; text: string }> = {
  CDI:        { bg: 'bg-brand-500/10', text: 'text-brand-texte' },
  CDD:        { bg: 'bg-blue-50',      text: 'text-blue-600' },
  STAGE:      { bg: 'bg-amber-50',     text: 'text-amber-600' },
  Stage:      { bg: 'bg-amber-50',     text: 'text-amber-600' },
  ALTERNANCE: { bg: 'bg-purple-50',    text: 'text-purple-600' },
  Freelance:  { bg: 'bg-purple-50',    text: 'text-purple-600' },
};

const styleType = (t: string) =>
  STYLE_TYPE[t] ?? { bg: 'bg-stone-100', text: 'text-stone-500' };

const estFermee = (o: Offre) =>
  o.statut === 'fermee' || o.statut === 'POURVUE' || o.statut === 'ARCHIVEE';

const estUrgente = (o: Offre) => Boolean(o.urgente) || o.statut === 'urgente';

// ── Carte d'une offre ──────────────────────────────────────────────

function CarteOffre({ offre, dejaPostule, onPostuler, onOuvrir, delai }: {
  offre: Offre;
  dejaPostule: boolean;
  onPostuler: (o: Offre) => void;
  onOuvrir: (o: Offre) => void;
  delai: number;
}) {
  const jours = Math.floor((Date.now() - new Date(offre.creeLe).getTime()) / 86400000);
  const fermee = estFermee(offre);
  const urgente = estUrgente(offre);

  return (
    // Toute la carte ouvre le détail. Le bouton « Postuler » arrête la
    // propagation : sans cela, un clic dessus ferait les deux.
    <div
      onClick={() => onOuvrir(offre)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOuvrir(offre);
        }
      }}
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter hrup-carte ${CARTE} p-5 sm:p-6 hover:shadow-md hover:border-brand-500/30 flex flex-col group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="w-11 h-11 bg-brand-500/10 rounded-xl flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5 text-brand-texte" />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {dejaPostule && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">
              <Check className="w-3 h-3" />
              Déjà postulé
            </span>
          )}
          {urgente && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500">
              <Flame className="w-3 h-3" />
              Urgent
            </span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${styleType(offre.type).bg} ${styleType(offre.type).text}`}>
            {offre.type}
          </span>
        </div>
      </div>

      <h3 className="font-bold text-stone-800 text-base mb-1 line-clamp-2 group-hover:text-brand-texte transition-colors">
        {offre.titre}
      </h3>

      <div className="flex items-center gap-3 text-xs text-stone-500 mb-4 flex-wrap">
        <span className="flex items-center gap-1">
          <Briefcase className="w-3.5 h-3.5" />
          {offre.departement}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          {offre.lieu || offre.modeTravail}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {jours === 0 ? "Aujourd'hui" : `Il y a ${jours} j`}
        </span>
      </div>

      <p className="text-sm text-stone-600 line-clamp-3 mb-5 leading-relaxed flex-1">
        {offre.description || 'Aucune description fournie pour cette offre.'}
      </p>

      <div className="flex items-center justify-between gap-2 pt-4 border-t border-stone-100">
        <span className="flex items-center gap-1 text-xs font-bold text-brand-texte group-hover:underline">
          Détails
          <ChevronRight className="w-3.5 h-3.5" />
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onPostuler(offre); }}
          disabled={fermee || dejaPostule}
          className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:bg-stone-200 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shrink-0"
        >
          {fermee ? 'Fermée' : dejaPostule ? 'Envoyée' : (
            <>
              <Send className="w-3.5 h-3.5" />
              Postuler
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function JobsPage() {
  const navigate = useNavigate();
  const [parametres, setParametres] = useSearchParams();

  const [offres, setOffres] = useState<Offre[]>([]);
  const [postulees, setPostulees] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('Tous');
  const [filtreMode, setFiltreMode] = useState('Tous');
  const [page, setPage] = useState(0);
  const [offreChoisie, setOffreChoisie] = useState<Offre | null>(null);
  const [toast, setToast] = useState('');

  const TYPES = ['Tous', 'CDI', 'CDD', 'STAGE', 'ALTERNANCE'];
  const MODES = ['Tous', 'PRESENTIEL', 'HYBRIDE', 'DISTANCIEL'];

  // La page Recommandations envoie ici avec ?offre=ID. Le paramètre
  // était ignoré : on arrivait sur la liste complète sans rien voir
  // de l'offre choisie. Il mène maintenant au détail.
  useEffect(() => {
    const cible = parametres.get('offre');
    if (!cible) return;
    parametres.delete('offre');
    setParametres(parametres, { replace: true });
    navigate(`/candidat/offres/${cible}`, { replace: true });
  }, [parametres, navigate, setParametres]);

  const charger = async () => {
    try {
      setChargement(true);

      // Les candidatures servent uniquement à savoir ce qui a déjà
      // été envoyé ; leur échec ne doit pas masquer les offres.
      const [resOffres, resCand] = await Promise.allSettled([
        api.get('/offres') as any,
        api.get('/mes-candidatures') as any,
      ]);

      if (resOffres.status === 'fulfilled') {
        const liste: Offre[] = resOffres.value?.data?.offres ?? resOffres.value?.data ?? [];
        // Seules les offres ouvertes ont leur place dans l'espace candidat.
        setOffres(liste.filter((o) => !estFermee(o)));
      }

      if (resCand.status === 'fulfilled') {
        const liste: { offreId?: string }[] = resCand.value?.data?.candidatures ?? [];
        setPostulees(new Set(liste.map((c) => String(c.offreId)).filter(Boolean)));
      }
    } catch (e) {
      console.error('Chargement des offres :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(0); }, [recherche, filtreType, filtreMode]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return offres
      .filter((o) => {
        if (filtreType !== 'Tous' && o.type !== filtreType) return false;
        if (filtreMode !== 'Tous' && o.modeTravail !== filtreMode) return false;
        if (!terme) return true;
        return `${o.titre} ${o.departement} ${o.type}`.toLowerCase().includes(terme);
      })
      // Les urgentes d'abord, puis la plus récente.
      .sort((a, b) => {
        const au = estUrgente(a);
        const bu = estUrgente(b);
        if (au !== bu) return au ? -1 : 1;
        return String(b.creeLe).localeCompare(String(a.creeLe));
      });
  }, [offres, recherche, filtreType, filtreMode]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  const nbUrgentes = filtrees.filter(estUrgente).length;
  const filtreActif = filtreType !== 'Tous' || filtreMode !== 'Tous' || Boolean(recherche);

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher une offre…">

        <EnTete
          fil={['Espace candidat', "Offres d'emploi"]}
          titre="Opportunités d'emploi"
          sousTitre={chargement ? 'Chargement…' : (
            <>
              {filtrees.length} offre{filtrees.length > 1 ? 's' : ''} disponible
              {filtrees.length > 1 ? 's' : ''}
              {nbUrgentes > 0 && (
                <span className="text-red-500 font-semibold">
                  {' · '}{nbUrgentes} urgente{nbUrgentes > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        >
          {filtreActif && (
            <button
              onClick={() => {
                setFiltreType('Tous');
                setFiltreMode('Tous');
                setRecherche('');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Réinitialiser
            </button>
          )}
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">

          {/* ── Filtres ── */}
          {/* Une seule bande blanche, d'un bord à l'autre.
              
              Elle n'a aucune marge horizontale, et c'est voulu : la
              grille intérieure reprend celle des offres, donc chaque
              groupe se cale exactement sur la carte qui lui
              correspond. Une marge, même de huit pixels, décalerait
              les trois colonnes et l'alignement tomberait. Le retrait
              visuel vient du contenu lui-même — la loupe est à douze
              pixels du bord, les boutons ont leur propre padding. */}
          <div className={`${CARTE} py-2 mb-5`}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Titre, département…"
                  className="w-full h-9 ps-9 pe-8 rounded-xl bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:bg-stone-50 transition-colors"
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

              {/* Les boutons gardent leur largeur naturelle et se
                  répartissent sur toute la colonne. À parts égales,
                  « ALTERNANCE » était coupé pour que « Tous » ait la
                  même place que lui. */}
              {([
                [TYPES, filtreType, setFiltreType, 'Type de contrat'],
                [MODES, filtreMode, setFiltreMode, 'Mode de travail'],
              ] as [string[], string, (v: string) => void, string][])
                .map(([liste, choisi, choisir, libelle]) => (
                  <div
                    key={libelle}
                    role="group"
                    aria-label={libelle}
                    // Un filet dans la gouttière sépare les deux
                    // groupes. Sur une bande d'un seul tenant,
                    // « ALTERNANCE » et le « Tous » suivant se
                    // touchaient sans qu'on voie où l'un finit.
                    // Positionné en absolu : il ne décale rien.
                    className="relative flex items-center justify-between gap-0.5 h-9
                      xl:before:content-[''] xl:before:absolute xl:before:-start-2.5
                      xl:before:top-0 xl:before:bottom-0 xl:before:w-px xl:before:bg-stone-200"
                  >
                    {liste.map((v) => (
                      <button
                        key={v}
                        onClick={() => choisir(v)}
                        title={v === 'Tous' ? `${libelle} : tous` : v}
                        className={`min-w-0 h-full px-2 rounded-xl text-[11px] font-bold truncate transition-colors ${
                          choisi === v
                            ? 'bg-brand-500 text-white shadow-sm'
                            : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </div>

          {/* ── Grille ── */}
          {chargement ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`${CARTE} p-6 animate-pulse`}>
                  <div className="w-11 h-11 bg-stone-100 rounded-xl mb-4" />
                  <div className="h-5 bg-stone-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-stone-100 rounded w-1/2 mb-4" />
                  <div className="h-16 bg-stone-50 rounded mb-4" />
                  <div className="h-9 bg-stone-50 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filtrees.length === 0 ? (
            <Vide
              icone={Briefcase}
              message={filtreActif ? 'Aucune offre ne correspond' : 'Aucune offre disponible'}
              detail={filtreActif
                ? "Essayez d'autres mots-clés, ou élargissez les filtres."
                : 'Revenez bientôt : de nouvelles offres sont publiées régulièrement.'}
              action={!filtreActif && (
                <button
                  onClick={() => navigate('/candidat/candidature-spontanee')}
                  className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Envoyer une candidature spontanée
                </button>
              )}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-5">
                {pageCourante.map((offre, i) => (
                  <CarteOffre
                    key={offre.id}
                    offre={offre}
                    dejaPostule={postulees.has(String(offre.id))}
                    onPostuler={setOffreChoisie}
                    onOuvrir={(o) => navigate(`/candidat/offres/${o.id}`)}
                    delai={i * 60}
                  />
                ))}
              </div>

              {filtrees.length > PAR_PAGE && (
                <div className={`${CARTE} overflow-hidden`}>
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
        </div>

        {offreChoisie && (
          <ModalPostuler
            offre={offreChoisie}
            onClose={() => setOffreChoisie(null)}
            onSucces={() => {
              setToast('Votre candidature a été envoyée');
              charger();
            }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}