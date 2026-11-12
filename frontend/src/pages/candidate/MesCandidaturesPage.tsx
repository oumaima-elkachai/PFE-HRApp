// src/pages/candidate/MesCandidaturesPage.tsx
//
// Suivi des candidatures côté candidat. L'écran répond à une seule
// question : où en est mon dossier, et dois-je faire quelque chose ?
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// 1. L'import de `SuiviCandidature` pointait sur `./SuiviCandidature`,
//    donc sur ce dossier-ci. Le composant vit dans
//    `components/candidat/`, où plusieurs pages le partagent.
//
// 2. La frise dépliée ne recevait pas `candidatureId`. Le bouton
//    d'accès à la messagerie n'apparaissait donc jamais, et les
//    échanges n'étaient atteignables que depuis une liste qui reste
//    vide tant que personne n'a écrit.
//
// 3. Mise en page figée en dessous de 1024 px : en-tête sur une
//    ligne, quatre onglets et un champ de recherche sur la même
//    bande, grille d'informations à deux colonnes.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Clock, CheckCircle, XCircle, FileText, Video, MapPin,
  ChevronRight, Bell, ExternalLink, ClipboardList, CalendarDays,
  Award, Search, X,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { EnTete, Vide, Squelette, CARTE, ACCENT } from '../../components/ui/kit';
import { candidatsService } from '../../services/candidats';
import { notificationsService } from '../../services/notifications';
import { useAuth } from '../../context/AuthContext';
import type { Candidat, Notification as Notif } from '../../types';
import { STYLES_ANIMATION } from '../../utils/animations';
import SuiviCandidature from './SuiviCandidature';

const PAR_PAGE = 5;

// Style uniquement : les états que le candidat doit distinguer.
const STYLE_STATUT: Record<string, {
  libelle: string; bg: string; text: string;
  icone: React.ComponentType<{ className?: string }>;
}> = {
  SOUMIS:          { libelle: 'Candidature soumise', bg: 'bg-blue-50',      text: 'text-blue-600',    icone: FileText },
  PRESELECTION:    { libelle: "En cours d'analyse",  bg: 'bg-amber-50',     text: 'text-amber-600',   icone: Clock },
  QUIZ_EN_ATTENTE: { libelle: 'Quiz disponible',     bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: ClipboardList },
  QUIZ_ENVOYE:     { libelle: 'Quiz disponible',     bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: ClipboardList },
  QUIZ_TERMINE:    { libelle: 'Quiz complété',       bg: 'bg-blue-50',      text: 'text-blue-600',    icone: CheckCircle },
  ENTRETIEN:       { libelle: 'Entretien planifié',  bg: 'bg-purple-50',    text: 'text-purple-600',  icone: CalendarDays },
  OFFRE:           { libelle: 'Offre reçue',         bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: Award },
  EMBAUCHE:        { libelle: 'Embauché',            bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: CheckCircle },
  REFUSE:          { libelle: 'Non retenu',          bg: 'bg-red-50',       text: 'text-red-500',     icone: XCircle },
};

const styleStatut = (s: string) =>
  STYLE_STATUT[s] ?? { libelle: 'En cours', bg: 'bg-stone-100', text: 'text-stone-500', icone: Clock };

// Les deux statuts de quiz appellent une action du candidat. Le
// filtre testait QUIZ_COMPLETE, un statut qui n'existe pas : un
// dossier au quiz terminé disparaissait de toutes les catégories.
const ACTION_REQUISE = ['QUIZ_EN_ATTENTE', 'QUIZ_ENVOYE'];
const TERMINE = ['EMBAUCHE', 'REFUSE', 'OFFRE'];
const EN_COURS = ['SOUMIS', 'PRESELECTION', 'QUIZ_TERMINE', 'ENTRETIEN'];

const formaterDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

// ── Bandeau de notifications ───────────────────────────────────────

function BanniereNotifications({ notifications, onFermer }: {
  notifications: Notif[];
  onFermer: (id: string) => void;
}) {
  const nonLues = notifications.filter((n) => !n.lu);
  if (nonLues.length === 0) return null;

  const STYLE: Record<string, { bg: string; bord: string; icone: string; texte: string }> = {
    ENTRETIEN_PLANIFIE: { bg: 'bg-purple-50',    bord: 'border-purple-200',    icone: 'bg-purple-100 text-purple-600',       texte: 'text-purple-700' },
    QUIZ_DISPONIBLE:    { bg: 'bg-brand-500/10', bord: 'border-brand-500/25',  icone: 'bg-brand-500/15 text-brand-texte',    texte: 'text-brand-texte' },
    OFFRE_RECUE:        { bg: 'bg-brand-500/10', bord: 'border-brand-500/25',  icone: 'bg-brand-500/15 text-brand-texte',    texte: 'text-brand-texte' },
  };
  const defaut = { bg: 'bg-blue-50', bord: 'border-blue-200', icone: 'bg-blue-100 text-blue-600', texte: 'text-blue-700' };

  return (
    <div className="space-y-2.5 mb-6">
      {nonLues.map((n) => {
        const style = STYLE[n.type] ?? defaut;
        return (
          <div
            key={n.id}
            className={`hrup-monter flex items-start gap-3 p-4 rounded-2xl border ${style.bg} ${style.bord}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.icone}`}>
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${style.texte}`}>{n.titre}</p>
              <p className="text-xs text-stone-500 mt-0.5">{n.message}</p>
            </div>
            <button
              onClick={() => onFermer(n.id)}
              aria-label="Masquer"
              className="p-1 rounded-lg hover:bg-surface/60 shrink-0 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-stone-400" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Carte d'une candidature ────────────────────────────────────────

function CarteCandidature({ candidat, delai }: { candidat: Candidat; delai: number }) {
  const [deplie, setDeplie] = useState(false);
  const navigate = useNavigate();

  const style = styleStatut(candidat.statut);
  const Icone = style.icone;

  const titrePoste = candidat.offreTitre || candidat.posteVise || 'Candidature spontanée';
  const agir = ACTION_REQUISE.includes(candidat.statut);

  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter bg-surface rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md ${
        agir ? 'border-brand-500/40' : 'border-stone-100'
      }`}
    >
      <div className="p-5">

        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
              <Briefcase className="w-5 h-5 text-brand-texte" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-stone-800 text-[15px] truncate">{titrePoste}</h3>
              {candidat.offreDepartement && (
                <p className="text-xs text-brand-texte font-semibold">
                  {candidat.offreDepartement}
                </p>
              )}
              <p className="text-[10px] text-stone-400 mt-0.5">
                Déposée le {formaterDate(candidat.creeLe)}
              </p>
            </div>
          </div>

          <span className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0 whitespace-nowrap ${style.bg} ${style.text}`}>
            <Icone className="w-3 h-3 shrink-0" />
            {style.libelle}
          </span>
        </div>

        {/* Frise compacte : le candidat voit d'un coup d'œil où en
            est son dossier, sans déplier. */}
        <div className="mb-4">
          <SuiviCandidature
            statut={candidat.statut}
            historique={candidat.historiqueStatuts}
            compact
          />
        </div>

        {agir && (
          <div className="bg-brand-500/10 border border-brand-500/25 rounded-xl p-3.5 mb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <ClipboardList className="w-4 h-4 text-brand-texte shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-texte">
                    Quiz technique disponible
                  </p>
                  <p className="text-xs text-stone-500">
                    Complétez-le pour avancer dans le processus
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/candidat/quiz/${candidat.quizId}`)}
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
              >
                Passer le quiz
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {candidat.scoreQuiz != null && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Award className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-700">
                Quiz complété — {candidat.scoreQuiz}/100
              </p>
              {candidat.scoreTotal != null && (
                <span className="text-xs text-blue-600 sm:ms-auto">
                  Score global {candidat.scoreTotal}/100
                </span>
              )}
            </div>
          </div>
        )}

        {candidat.statut === 'ENTRETIEN' && candidat.entretien && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                {candidat.entretien.type === 'en_ligne'
                  ? <Video className="w-4 h-4 text-purple-600" />
                  : <MapPin className="w-4 h-4 text-purple-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-purple-800">
                  Entretien {candidat.entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'}
                </p>
                <p className="text-xs text-purple-600 mt-1">
                  {formaterDate(candidat.entretien.date)} à {candidat.entretien.heure}
                </p>

                {candidat.entretien.type === 'en_ligne' && candidat.entretien.lien && (
                  <a
                    href={candidat.entretien.lien}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-100 px-3 py-1.5 rounded-xl mt-2 hover:bg-purple-200 transition-colors"
                  >
                    <Video className="w-3 h-3" />
                    Rejoindre la visioconférence
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {candidat.entretien.type === 'sur_site' && candidat.entretien.adresse && (
                  <p className="text-xs text-purple-600 mt-1 flex items-start gap-1">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    {candidat.entretien.adresse}
                  </p>
                )}

                {candidat.entretien.notes && (
                  <p className="text-xs text-purple-500 mt-1.5 italic">
                    {candidat.entretien.notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {candidat.statut === 'OFFRE' && (
          <div className="bg-brand-500/10 border border-brand-500/25 rounded-xl p-4 mb-3 text-center">
            <Award className="w-6 h-6 mx-auto mb-2 text-brand-texte" />
            <p className="text-sm font-bold text-brand-texte">
              Vous avez reçu une offre
            </p>
            <p className="text-xs text-stone-500 mt-1">
              L'équipe de recrutement vous contactera avec les détails
            </p>
          </div>
        )}

        <button
          onClick={() => setDeplie(!deplie)}
          className="flex items-center gap-1 text-xs font-bold text-brand-texte hover:underline"
        >
          {deplie ? 'Masquer le détail' : 'Voir le détail'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${deplie ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {deplie && (
        <div className="border-t border-stone-100 px-5 py-4 bg-stone-50 space-y-4">

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
              Parcours de votre candidature
            </p>
            {/* candidatureId donne accès à la messagerie : sans lui,
                le bouton n'apparaissait jamais. */}
            <SuiviCandidature
              statut={candidat.statut}
              historique={candidat.historiqueStatuts}
              candidatureId={candidat.id}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ['Adresse', candidat.email],
              ['Téléphone', candidat.telephone || '—'],
              ['Niveau', candidat.niveauEtude || '—'],
              ['Expérience', candidat.experience || '—'],
            ] as [string, string][]).map(([libelle, valeur]) => (
              <div key={libelle} className="bg-surface rounded-xl p-3 border border-stone-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  {libelle}
                </div>
                <div className="text-sm font-medium text-stone-800 truncate">{valeur}</div>
              </div>
            ))}
          </div>

          {(candidat.competences?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Compétences
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {candidat.competences.map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="text-xs font-bold bg-brand-500/10 text-brand-texte px-2.5 py-1 rounded-full"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.lettreMotivation && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Lettre de motivation
              </p>
              <p className="text-xs text-stone-600 bg-surface rounded-xl p-3 border border-stone-100 leading-relaxed whitespace-pre-wrap">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {candidat.cvFileName && (
            <div className="flex items-center gap-2 text-xs font-bold text-brand-texte bg-brand-500/10 px-3 py-2 rounded-xl w-fit">
              <FileText className="w-3.5 h-3.5" />
              {candidat.cvFileName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

type Filtre = 'tous' | 'encours' | 'action' | 'termine';

export default function MesCandidaturesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [candidatures, setCandidatures] = useState<Candidat[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);

  // On dépend de l'identifiant, pas de l'objet. Selon la façon dont
  // le contexte est construit, `user` peut être recréé à chaque
  // rendu : l'effet se relancerait alors sans fin, et la page
  // resterait bloquée sur « Chargement… ».
  const idUtilisateur = (user as any)?.sub ?? (user as any)?.email ?? null;

  useEffect(() => {
    (async () => {
      try {
        setChargement(true);
        if (!idUtilisateur) return;

        const [resCand, resNotif] = await Promise.allSettled([
          candidatsService.mesCandidatures(),
          notificationsService.mesNotifications(),
        ]);

        if (resCand.status === 'fulfilled') {
          setCandidatures((resCand.value as any)?.data?.candidatures ?? []);
        }
        if (resNotif.status === 'fulfilled') {
          setNotifications((resNotif.value as any)?.data?.notifications ?? []);
        }
      } catch (e) {
        console.error('Chargement des candidatures :', e);
      } finally {
        setChargement(false);
      }
    })();
  }, [idUtilisateur]);

  useEffect(() => { setPage(0); }, [filtre, recherche]);

  const fermerNotif = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    try { await notificationsService.marquerLue(id); } catch { /* sans incidence */ }
  };

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return candidatures
      .filter((c) => {
        if (filtre === 'encours' && !EN_COURS.includes(c.statut)) return false;
        if (filtre === 'action' && !ACTION_REQUISE.includes(c.statut)) return false;
        if (filtre === 'termine' && !TERMINE.includes(c.statut)) return false;
        if (!terme) return true;
        return `${c.offreTitre ?? ''} ${c.posteVise ?? ''} ${c.offreDepartement ?? ''}`
          .toLowerCase().includes(terme);
      })
      // Ce qui demande une action remonte, puis le plus récent.
      .sort((a, b) => {
        const aA = ACTION_REQUISE.includes(a.statut) ? 0 : 1;
        const bA = ACTION_REQUISE.includes(b.statut) ? 0 : 1;
        if (aA !== bA) return aA - bA;
        return String(b.creeLe).localeCompare(String(a.creeLe));
      });
  }, [candidatures, filtre, recherche]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  const compte = {
    tous: candidatures.length,
    encours: candidatures.filter((c) => EN_COURS.includes(c.statut)).length,
    action: candidatures.filter((c) => ACTION_REQUISE.includes(c.statut)).length,
    termine: candidatures.filter((c) => TERMINE.includes(c.statut)).length,
  };

  const ONGLETS: [Filtre, string][] = [
    ['tous', 'Toutes'],
    ['encours', 'En cours'],
    ['action', 'Action requise'],
    ['termine', 'Terminées'],
  ];

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher une candidature…">

        <EnTete
          fil={['Mon suivi', 'Mes candidatures']}
          titre="Mes candidatures"
          sousTitre={chargement ? 'Chargement…' : (
            <>
              {filtrees.length} candidature{filtrees.length > 1 ? 's' : ''} sur {compte.tous}
              {compte.action > 0 && (
                <span className="text-brand-texte font-semibold">
                  {' · '}{compte.action} action{compte.action > 1 ? 's' : ''} requise
                  {compte.action > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        />

        <div className="px-4 sm:px-8 py-6 sm:py-8">

          <BanniereNotifications notifications={notifications} onFermer={fermerNotif} />

          {/* ── Onglets et recherche ── */}
          <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${CARTE} p-2 mb-5`}>
            <div className="flex items-center gap-1 flex-wrap">
              {ONGLETS.map(([cle, libelle]) => (
                <button
                  key={cle}
                  onClick={() => setFiltre(cle)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                    filtre === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  {libelle}
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    filtre === cle ? 'bg-white/25' : 'bg-stone-100'
                  }`}>
                    {chargement ? '…' : compte[cle]}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-64 shrink-0">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Poste, département…"
                className="w-full ps-9 pe-8 py-2 rounded-lg border border-stone-200 text-sm bg-stone-50 focus:outline-none focus:border-brand-500 focus:bg-surface transition-colors"
              />
              {recherche && (
                <button
                  onClick={() => setRecherche('')}
                  aria-label="Effacer la recherche"
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-200"
                >
                  <X className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>
          </div>

          {/* ── Liste ── */}
          {chargement ? (
            <Squelette nombre={3} hauteur="h-40" />
          ) : filtrees.length === 0 ? (
            <Vide
              icone={Briefcase}
              message="Aucune candidature"
              detail={recherche ? `Aucun résultat pour « ${recherche} »`
                : filtre !== 'tous' ? 'Aucune candidature dans cette catégorie'
                : "Vous n'avez pas encore postulé."}
              action={filtre === 'tous' && !recherche && (
                <button
                  onClick={() => navigate('/candidat/offres')}
                  className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Voir les offres disponibles
                </button>
              )}
            />
          ) : (
            <>
              <div className="space-y-4">
                {pageCourante.map((c, i) => (
                  <CarteCandidature key={c.id} candidat={c} delai={i * 60} />
                ))}
              </div>

              {filtrees.length > PAR_PAGE && (
                <div className={`${CARTE} mt-4 overflow-hidden`}>
                  <Pagination
                    page={page}
                    taillePage={PAR_PAGE}
                    total={filtrees.length}
                    onPage={setPage}
                    libelle="candidature"
                    accent={ACCENT}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}