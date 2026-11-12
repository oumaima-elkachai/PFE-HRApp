// src/pages/candidate/DashboardCandidatPage.tsx
//
// Première page de l'espace candidat.
//
// ── Ce qu'une personne qui cherche un emploi vient vérifier ─────────
//
// Dans l'ordre, et c'est l'ordre de la page :
//
//   1. Est-ce qu'on m'a répondu ? Est-ce que j'ai quelque chose à
//      faire maintenant ?
//   2. Où en sont mes dossiers ?
//   3. Y a-t-il de nouvelles offres pour moi ?
//
// Tout le reste vient après. Les indicateurs en haut d'une page ne
// servent à rien si la seule question du candidat — « et mon quiz,
// il expire quand ? » — demande trois clics.
//
// ── Pourquoi l'accent est mis sur l'avancement ──────────────────────
//
// Une recherche d'emploi, c'est surtout des refus. Une page qui
// afficherait « 7 candidatures, 5 refusées » décourage sans rien
// apprendre. Les compteurs portent donc ce qui avance : dossiers
// actifs, étapes franchies, meilleure correspondance. Les refus
// restent lisibles, dans la liste, à leur place.
//
// ── Cinq sources, aucune bloquante ──────────────────────────────────
//
// Les cinq appels partent ensemble et chacun peut échouer seul. Un
// service de recommandation indisponible ne doit pas effacer les
// entretiens de la semaine.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, FileText, Calendar, Video, MapPin, Phone,
  ArrowRight, Target, Sparkles, CheckCircle2, AlertTriangle,
  TrendingUp, UserCircle, Send, ChevronRight, Award, Rocket,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

import { STYLES_ANIMATION } from '../../utils/animations';
import { Anneau, CARTE, EnTete, Section, Squelette, StatCard, ton, Vide } from '@/components/ui/kit';
import SuiviCandidature from './SuiviCandidature';

// ── Types ───────────────────────────────────────────────────────────

interface Candidature {
  id: string;
  statut: string;
  offreTitre?: string;
  posteVise?: string;
  offreDepartement?: string;
  creeLe: string;
  scoreQuiz?: number | null;
  scoreTotal?: number | null;
  quizId?: string | null;
  historiqueStatuts?: { statut: string; date: string }[];
}

interface Quiz {
  id: string;
  titre: string;
  offreTitre: string;
  echeance: string;
  dureeMinutes: number;
  nombreQuestions: number;
  statut: 'a_faire' | 'en_cours' | 'termine';
  urgent: boolean;
  expire: boolean;
}

interface Rendezvous {
  id: string;
  type: 'ENTRETIEN' | 'QUIZ' | 'EVENEMENT';
  titre: string;
  dateHeure: string;
  sousType?: 'TELEPHONE' | 'VIDEO' | 'SUR_SITE';
  lieu?: string | null;
  lienVideo?: string | null;
  quizId?: string | null;
  offreTitre?: string;
  jours: number;
}

interface Recommandation {
  offre: { id: string; titre: string; departement: string; type: string };
  score: number;
  competencesCommunes: string[];
}

interface Profil {
  posteVise?: string;
  telephone?: string;
  niveauEtude?: string;
  experience?: string;
  linkedin?: string;
  competences?: string[];
  cvKey?: string | null;
}

// ── Constantes partagées avec les autres pages candidat ─────────────

const ACTION_REQUISE = ['QUIZ_EN_ATTENTE', 'QUIZ_ENVOYE'];
const TERMINE = ['EMBAUCHE', 'REFUSE'];

const LIBELLE_STATUT: Record<string, { texte: string; tonalite: string }> = {
  SOUMIS:          { texte: 'Candidature soumise', tonalite: 'bleu' },
  PRESELECTION:    { texte: 'Profil retenu',       tonalite: 'amber' },
  QUIZ_EN_ATTENTE: { texte: 'Quiz à passer',       tonalite: 'brand' },
  QUIZ_ENVOYE:     { texte: 'Quiz à passer',       tonalite: 'brand' },
  QUIZ_TERMINE:    { texte: 'Quiz passé',          tonalite: 'bleu' },
  ENTRETIEN:       { texte: 'Entretien prévu',     tonalite: 'violet' },
  OFFRE:           { texte: 'Offre reçue',         tonalite: 'brand' },
  EMBAUCHE:        { texte: 'Embauché',            tonalite: 'brand' },
  REFUSE:          { texte: 'Non retenu',          tonalite: 'red' },
};

const statutDe = (s: string) =>
  LIBELLE_STATUT[s] ?? { texte: 'En cours', tonalite: 'stone' };

const ICONE_RDV: Record<string, React.ComponentType<{ className?: string }>> = {
  TELEPHONE: Phone, VIDEO: Video, SUR_SITE: MapPin,
};

// ── Petites fonctions ───────────────────────────────────────────────

/** Jours calendaires : « demain à 9 h » reste demain, pas 0,6 jour. */
function joursAvant(iso: string): number {
  const cible = new Date(iso);
  const maintenant = new Date();
  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  return Math.round((a - b) / 86400000);
}

function delai(jours: number): string {
  if (jours < 0) return `en retard de ${Math.abs(jours)} jour${Math.abs(jours) > 1 ? 's' : ''}`;
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return 'demain';
  return `dans ${jours} jours`;
}

const jourCourt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Salutation selon l'heure, sans fausse familiarité. */
function salutation(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

// ── Complétude du profil ────────────────────────────────────────────
//
// Sept éléments, et chacun dit à quoi il sert. Un pourcentage sans
// liste laisse le candidat deviner ce qui manque.

function completude(profil: Profil | null) {
  const elements = [
    { cle: 'cv',          libelle: 'CV déposé',          rempli: Boolean(profil?.cvKey) },
    { cle: 'poste',       libelle: 'Poste visé',         rempli: Boolean(profil?.posteVise) },
    { cle: 'competences', libelle: 'Au moins 3 compétences', rempli: (profil?.competences?.length ?? 0) >= 3 },
    { cle: 'niveau',      libelle: "Niveau d'étude",     rempli: Boolean(profil?.niveauEtude) },
    { cle: 'experience',  libelle: 'Expérience',         rempli: Boolean(profil?.experience) },
    { cle: 'telephone',   libelle: 'Téléphone',          rempli: Boolean(profil?.telephone) },
    { cle: 'linkedin',    libelle: 'Profil LinkedIn',    rempli: Boolean(profil?.linkedin) },
  ];

  const remplis = elements.filter((e) => e.rempli).length;
  return {
    elements,
    remplis,
    total: elements.length,
    pourcentage: Math.round((remplis / elements.length) * 100),
  };
}

// ── Bandeau d'accueil ───────────────────────────────────────────────

function Accueil({ prenom, urgence, profil, onAgir }: {
  prenom: string;
  urgence: { texte: string; action: string; aller: () => void; critique: boolean } | null;
  profil: ReturnType<typeof completude>;
  onAgir: () => void;
}) {
  return (
    <div
      className="hrup-monter rounded-2xl overflow-hidden text-white relative"
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 55%, #818CF8 100%)' }}
    >
      {/* Halo décoratif, masqué sur téléphone où il n'y a pas la place */}
      <div
        className="hidden sm:block absolute -end-16 -top-16 w-64 h-64 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/70">{salutation()}</p>
          <h3 className="text-xl sm:text-2xl font-bold mt-0.5">{prenom}</h3>

          {urgence ? (
            <>
              <p className="text-sm text-white/90 mt-3 leading-relaxed max-w-xl">
                {urgence.texte}
              </p>
              <button
                onClick={urgence.aller}
                className={`mt-4 inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-colors ${
                  urgence.critique
                    ? 'bg-white text-red-600 hover:bg-red-50'
                    : 'bg-white text-brand-texte hover:bg-stone-50'
                }`}
              >
                {urgence.action}
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-white/90 mt-3 leading-relaxed max-w-xl">
                Rien ne vous attend dans l'immédiat. C'est le bon moment pour
                regarder les offres qui correspondent à votre profil.
              </p>
              <button
                onClick={onAgir}
                className="mt-4 inline-flex items-center gap-2 bg-white text-brand-texte text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-stone-50 transition-colors"
              >
                Voir les offres pour moi
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* La complétude n'apparaît que si elle manque : un anneau à
            100 % ne dit rien que le candidat ne sache déjà. */}
        {profil.pourcentage < 100 && (
          <div className="flex items-center gap-4 bg-white/10 rounded-2xl p-4 shrink-0">
            <Anneau
              valeur={profil.pourcentage}
              taille={64}
              epaisseur={6}
              couleur="#ffffff"
              piste="rgba(255,255,255,0.25)"
            >
              <span className="text-sm font-bold text-white">{profil.pourcentage}%</span>
            </Anneau>
            <div className="min-w-0">
              <div className="text-sm font-bold">Profil complété</div>
              <div className="text-xs text-white/70 mt-0.5">
                {profil.total - profil.remplis} élément
                {profil.total - profil.remplis > 1 ? 's' : ''} à renseigner
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ligne d'un rendez-vous ──────────────────────────────────────────

function LigneRdv({ rdv, onOuvrir, delai: retard }: {
  rdv: Rendezvous;
  onOuvrir: () => void;
  delai: number;
}) {
  const tonalite = rdv.type === 'ENTRETIEN' ? 'violet'
    : rdv.type === 'QUIZ' ? 'brand'
    : 'bleu';
  const t = ton(tonalite);

  const Icone = rdv.type === 'ENTRETIEN'
    ? (ICONE_RDV[rdv.sousType ?? 'VIDEO'] ?? Calendar)
    : rdv.type === 'QUIZ' ? FileText
    : Calendar;

  const urgent = rdv.jours <= 1;

  return (
    <button
      onClick={onOuvrir}
      style={{ animationDelay: `${retard}ms` }}
      className={`hrup-monter hrup-carte w-full text-start ${CARTE} p-4 hover:shadow-md flex items-center gap-3.5`}
    >
      {/* La date en pavé : repérer un jour dans une liste va plus vite
          qu'en lisant une phrase complète. */}
      <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${t.bg}`}>
        <span className={`text-sm font-bold leading-none ${t.text}`}>
          {new Date(rdv.dateHeure).getDate()}
        </span>
        <span className="text-[8px] text-stone-400 uppercase mt-0.5">
          {jourCourt(rdv.dateHeure).split(' ')[1]}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-stone-800 truncate">{rdv.titre}</span>
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
            <Icone className="w-2.5 h-2.5" />
            {rdv.type === 'ENTRETIEN' ? 'Entretien' : rdv.type === 'QUIZ' ? 'Quiz' : 'Événement'}
          </span>
        </div>
        <p className="text-xs text-stone-500 mt-0.5 truncate">
          {/* Un événement porte son type en sous-titre, et le type vaut
              souvent le titre : « Portes ouvertes · Portes ouvertes ». */}
          {rdv.offreTitre && rdv.offreTitre !== rdv.titre
            ? `${rdv.offreTitre} · ${heure(rdv.dateHeure)}`
            : heure(rdv.dateHeure)}
        </p>
      </div>

      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
        urgent ? 'bg-amber-50 text-amber-600' : 'bg-stone-100 text-stone-600'
      }`}>
        {rdv.jours <= 0 ? "Auj." : rdv.jours === 1 ? 'Demain' : `J-${rdv.jours}`}
      </span>
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function DashboardCandidatPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [rendezvous, setRendezvous] = useState<Rendezvous[]>([]);
  const [recommandations, setRecommandations] = useState<Recommandation[]>([]);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      // Cinq sources, chacune tolérante à son propre échec : un
      // service indisponible masque sa section, pas la page.
      const [resCand, resQuiz, resAgenda, resReco, resProfil] = await Promise.allSettled([
        api.get('/mes-candidatures') as any,
        api.get('/candidat/quizzes') as any,
        api.get('/candidat/agenda') as any,
        api.get('/offres/recommandations') as any,
        api.get('/candidat/profil') as any,
      ]);

      if (resCand.status === 'fulfilled') {
        setCandidatures(resCand.value?.data?.candidatures ?? []);
      }
      if (resQuiz.status === 'fulfilled') {
        setQuizzes(resQuiz.value?.data?.quizzes ?? []);
      }
      if (resAgenda.status === 'fulfilled') {
        setRendezvous(resAgenda.value?.data?.evenements ?? []);
      }
      if (resReco.status === 'fulfilled') {
        setRecommandations(resReco.value?.data?.recommandations ?? []);
      }
      if (resProfil.status === 'fulfilled') {
        setProfil(resProfil.value?.data?.profil ?? null);
      }

      setChargement(false);
    })();
  }, []);

  const profilComplet = useMemo(() => completude(profil), [profil]);

  const actives = candidatures.filter((c) => !TERMINE.includes(c.statut));
  const aFaire = candidatures.filter((c) => ACTION_REQUISE.includes(c.statut));

  const quizAPasser = useMemo(
    () => quizzes
      .filter((q) => q.statut !== 'termine' && !q.expire)
      .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance))),
    [quizzes]
  );

  const prochains = useMemo(
    () => [...rendezvous]
      .sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure)))
      .slice(0, 4),
    [rendezvous]
  );

  const meilleurScore = recommandations.length
    ? Math.max(...recommandations.map((r) => r.score))
    : 0;

  // Les étapes franchies, tous dossiers confondus. C'est le chiffre
  // qui monte quand une recherche avance, et le seul qui ne baisse
  // jamais à cause d'un refus.
  const etapesFranchies = useMemo(
    () => candidatures.reduce(
      (total, c) => total + Math.max(0, (c.historiqueStatuts?.length ?? 1) - 1),
      0
    ),
    [candidatures]
  );

  // ── Ce qui passe dans le bandeau ──
  //
  // Une seule chose, la plus pressante. Un bandeau qui liste trois
  // urgences n'en signale aucune.
  const urgence = useMemo(() => {
    const quiz = quizAPasser[0];
    if (quiz) {
      const jours = joursAvant(quiz.echeance);
      return {
        texte: `Votre quiz « ${quiz.titre} » pour le poste ${quiz.offreTitre} `
          + `est à passer ${delai(jours)}. Comptez ${quiz.dureeMinutes} minutes, `
          + `${quiz.nombreQuestions} questions, et une seule tentative.`,
        action: quiz.statut === 'en_cours' ? 'Reprendre le quiz' : 'Commencer le quiz',
        aller: () => navigate(`/candidat/quiz/${quiz.id}`),
        critique: jours <= 1,
      };
    }

    const entretien = prochains.find((r) => r.type === 'ENTRETIEN');
    if (entretien) {
      return {
        texte: `Vous avez un entretien ${delai(entretien.jours)} à ${heure(entretien.dateHeure)}`
          + `${entretien.offreTitre ? ` pour le poste ${entretien.offreTitre}` : ''}.`,
        action: entretien.lienVideo ? 'Rejoindre' : 'Voir mon agenda',
        aller: () => (entretien.lienVideo
          ? window.open(entretien.lienVideo, '_blank', 'noopener')
          : navigate('/candidat/agenda')),
        critique: entretien.jours <= 0,
      };
    }

    if (profilComplet.pourcentage < 60) {
      return {
        texte: 'Votre profil est encore incomplet. Les offres vous sont proposées '
          + 'selon vos compétences et le poste que vous visez : sans eux, '
          + 'aucune correspondance ne peut être calculée.',
        action: 'Compléter mon profil',
        aller: () => navigate('/candidat/profile'),
        critique: false,
      };
    }

    if (candidatures.length === 0) {
      return {
        texte: "Vous n'avez pas encore postulé. Parcourez les offres, ou envoyez "
          + 'une candidature spontanée : elle sera conservée et ressortie dès '
          + "qu'un poste correspond.",
        action: 'Parcourir les offres',
        aller: () => navigate('/candidat/offres'),
        critique: false,
      };
    }

    return null;
  }, [quizAPasser, prochains, profilComplet, candidatures, navigate]);

  const ouvrirRdv = (r: Rendezvous) => {
    if (r.type === 'QUIZ' && r.quizId) navigate(`/candidat/quiz/${r.quizId}`);
    else if (r.lienVideo) window.open(r.lienVideo, '_blank', 'noopener');
    else navigate('/candidat/agenda');
  };

  const prenom = user?.prenom || 'Bienvenue';

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Espace candidat', 'Accueil']}
          titre="Mon espace"
          sousTitre={chargement ? 'Chargement…'
            : aFaire.length > 0
              ? `${aFaire.length} action${aFaire.length > 1 ? 's' : ''} vous attend${aFaire.length > 1 ? 'ent' : ''}`
              : `${actives.length} candidature${actives.length > 1 ? 's' : ''} en cours`}
        >
          <button
            onClick={() => navigate('/candidat/offres')}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 sm:px-5 py-2 rounded-xl shadow-sm transition-colors"
          >
            <Briefcase className="w-4 h-4" />
            Voir les offres
          </button>
          <button
            onClick={() => navigate('/candidat/candidature-spontanee')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 shadow-sm transition-colors"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Candidature spontanée</span>
            <span className="sm:hidden">Spontanée</span>
          </button>
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-5">

          {/* ── Bandeau ── */}
          {chargement ? (
            <div className="h-44 rounded-2xl bg-stone-100 animate-pulse" />
          ) : (
            <Accueil
              prenom={prenom}
              urgence={urgence}
              profil={profilComplet}
              onAgir={() => navigate('/candidat/recommandations')}
            />
          )}

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Briefcase}
              label="Candidatures en cours"
              value={chargement ? '…' : actives.length}
              sub={candidatures.length > actives.length
                ? `${candidatures.length} au total`
                : 'dossiers suivis'}
              tonalite="brand"
              delai={60}
              onClick={() => navigate('/candidat/mes-candidatures')}
            />
            <StatCard
              icon={Rocket}
              label="Étapes franchies"
              value={chargement ? '…' : etapesFranchies}
              sub="entretiens, quiz, présélections"
              tonalite="brand"
              delai={120}
            />
            <StatCard
              icon={TrendingUp}
              label="Meilleure correspondance"
              value={chargement ? '…' : meilleurScore ? `${meilleurScore} %` : '—'}
              sub={meilleurScore
                ? 'sur les offres ouvertes'
                : 'complétez votre profil'}
              tonalite={meilleurScore >= 75 ? 'brand' : 'amber'}
              delai={180}
              onClick={() => navigate('/candidat/recommandations')}
            />
          </div>

          {/* ── Deux colonnes ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">

            {/* ── Colonne principale ── */}
            <div className="space-y-6 min-w-0">

              <Section
                icone={Calendar}
                titre="Ce qui vous attend"
                compteur={prochains.length}
                action={prochains.length > 0 && (
                  <button
                    onClick={() => navigate('/candidat/agenda')}
                    className="text-xs font-bold text-brand-texte hover:underline shrink-0"
                  >
                    Mon agenda
                  </button>
                )}
              >
                {chargement ? (
                  <Squelette nombre={3} hauteur="h-19" />
                ) : prochains.length === 0 ? (
                  <Vide
                    icone={Calendar}
                    message="Rien de prévu"
                    detail="Vos entretiens et échéances de quiz apparaîtront ici."
                  />
                ) : (
                  <div className="space-y-2.5">
                    {prochains.map((r, i) => (
                      <LigneRdv
                        key={r.id}
                        rdv={r}
                        onOuvrir={() => ouvrirRdv(r)}
                        delai={220 + i * 50}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icone={Briefcase}
                titre="Où en sont mes dossiers"
                compteur={actives.length}
                action={candidatures.length > 3 && (
                  <button
                    onClick={() => navigate('/candidat/mes-candidatures')}
                    className="text-xs font-bold text-brand-texte hover:underline shrink-0"
                  >
                    Tout voir
                  </button>
                )}
              >
                {chargement ? (
                  <Squelette nombre={2} hauteur="h-28" />
                ) : candidatures.length === 0 ? (
                  <Vide
                    icone={Briefcase}
                    message="Aucune candidature"
                    detail="Parcourez les offres ouvertes, ou envoyez une candidature spontanée."
                    action={(
                      <button
                        onClick={() => navigate('/candidat/offres')}
                        className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                      >
                        Voir les offres disponibles
                      </button>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* Ce qui demande une action remonte, puis le plus
                        récent : même règle que la page des candidatures. */}
                    {[...candidatures]
                      .sort((a, b) => {
                        const aA = ACTION_REQUISE.includes(a.statut) ? 0 : 1;
                        const bA = ACTION_REQUISE.includes(b.statut) ? 0 : 1;
                        if (aA !== bA) return aA - bA;
                        return String(b.creeLe).localeCompare(String(a.creeLe));
                      })
                      .slice(0, 3)
                      .map((c, i) => {
                        const st = statutDe(c.statut);
                        const t = ton(st.tonalite);
                        const agir = ACTION_REQUISE.includes(c.statut);

                        return (
                          <div
                            key={c.id}
                            style={{ animationDelay: `${300 + i * 60}ms` }}
                            className={`hrup-monter bg-surface rounded-2xl shadow-sm border p-5 ${
                              agir ? 'border-brand-500/40' : 'border-stone-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-3.5">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-stone-800 truncate">
                                  {c.offreTitre || c.posteVise || 'Candidature spontanée'}
                                </h4>
                                <p className="text-xs text-stone-400 mt-0.5">
                                  {c.offreDepartement ? `${c.offreDepartement} · ` : ''}
                                  Déposée le {jourCourt(c.creeLe)}
                                  {c.scoreTotal != null && ` · score ${c.scoreTotal}/100`}
                                </p>
                              </div>

                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap ${t.bg} ${t.text}`}>
                                {st.texte}
                              </span>
                            </div>

                            {/* La frise compacte : le candidat voit le
                                chemin parcouru sans ouvrir le dossier. */}
                            <SuiviCandidature
                              statut={c.statut}
                              historique={c.historiqueStatuts}
                              compact
                            />

                            {agir && (
                              <button
                                onClick={() => navigate(`/candidat/quiz/${c.quizId}`)}
                                className="mt-3.5 w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Passer le quiz technique
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </Section>
            </div>

            {/* ── Colonne latérale ── */}
            <div className="space-y-5 min-w-0 xl:sticky xl:top-6">

              {/* ── Offres pour vous ── */}
              <div
                style={{ animationDelay: '240ms' }}
                className={`hrup-monter ${CARTE} overflow-hidden`}
              >
                <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 flex items-center justify-between gap-2">
                  <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-texte" />
                    Offres pour vous
                  </h3>
                  {recommandations.length > 3 && (
                    <button
                      onClick={() => navigate('/candidat/recommandations')}
                      className="text-xs font-bold text-brand-texte hover:underline"
                    >
                      Tout voir
                    </button>
                  )}
                </div>

                {chargement ? (
                  <div className="p-4"><Squelette nombre={3} hauteur="h-16" /></div>
                ) : recommandations.length === 0 ? (
                  <div className="p-6 text-center">
                    <Target className="w-5 h-5 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs text-stone-500 leading-relaxed">
                      Aucune offre ne correspond encore. Renseignez vos compétences
                      et le poste visé pour que le calcul devienne possible.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {[...recommandations]
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map((r) => {
                        const fort = r.score >= 75;
                        const t = ton(fort ? 'brand' : 'amber');

                        return (
                          <button
                            key={r.offre.id}
                            onClick={() => navigate(`/candidat/offres?offre=${r.offre.id}`)}
                            className="w-full text-start px-5 py-4 hover:bg-stone-50 transition-colors flex items-start gap-3"
                          >
                            <div className={`rounded-xl px-2.5 py-1.5 text-center shrink-0 ${t.bg}`}>
                              <div className={`text-base font-bold leading-none ${t.text}`}>
                                {r.score}
                                <span className="text-[9px] font-normal">%</span>
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-stone-800 truncate">
                                {r.offre.titre}
                              </div>
                              <div className="text-[10px] text-stone-400 mt-0.5 truncate">
                                {r.offre.departement} · {r.offre.type}
                              </div>

                              {r.competencesCommunes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {r.competencesCommunes.slice(0, 2).map((c) => (
                                    <span
                                      key={c}
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-texte"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                  {r.competencesCommunes.length > 2 && (
                                    <span className="text-[9px] text-stone-400 font-bold">
                                      +{r.competencesCommunes.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <ChevronRight className="w-4 h-4 text-stone-300 shrink-0 mt-1" />
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* ── Profil ── */}
              {/* Affiché seulement s'il manque quelque chose : une
                  carte à 7 coches vertes occupe la place sans rien
                  apprendre. */}
              {!chargement && profilComplet.pourcentage < 100 && (
                <div
                  style={{ animationDelay: '300ms' }}
                  className={`hrup-monter ${CARTE} p-5`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserCircle className="w-4 h-4 text-brand-texte" />
                    <h3 className="font-bold text-stone-800 text-sm">Compléter mon profil</h3>
                  </div>
                  <p className="text-xs text-stone-400 mb-4">
                    {profilComplet.remplis} sur {profilComplet.total} · un profil complet
                    fait remonter plus d'offres
                  </p>

                  <div className="space-y-1.5 mb-4">
                    {profilComplet.elements.map((e) => (
                      <div
                        key={e.cle}
                        className={`flex items-center gap-2.5 p-2 rounded-xl ${
                          e.rempli ? 'bg-brand-500/5' : ''
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                          e.rempli ? 'bg-brand-500' : 'bg-stone-100'
                        }`}>
                          {e.rempli && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-xs font-medium ${
                          e.rempli ? 'text-stone-800' : 'text-stone-400'
                        }`}>
                          {e.libelle}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => navigate('/candidat/profile')}
                    className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                  >
                    Compléter
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── Évaluations ── */}
              {!chargement && quizAPasser.length > 0 && (
                <div
                  style={{ animationDelay: '360ms' }}
                  className="hrup-monter bg-surface rounded-2xl shadow-sm border border-amber-200 p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-stone-800 text-sm">
                      {quizAPasser.length} quiz à passer
                    </h3>
                  </div>

                  <ul className="space-y-2 mb-4">
                    {quizAPasser.slice(0, 3).map((q) => {
                      const jours = joursAvant(q.echeance);
                      return (
                        <li key={q.id} className="flex items-start justify-between gap-2">
                          <span className="text-xs text-stone-600 truncate">{q.titre}</span>
                          <span className={`text-[10px] font-bold shrink-0 ${
                            jours <= 1 ? 'text-red-500' : 'text-amber-600'
                          }`}>
                            {jours <= 0 ? "Auj." : `J-${jours}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={() => navigate('/candidat/quizzes')}
                    className="w-full flex items-center justify-center gap-2 border border-stone-200 text-stone-700 text-sm font-bold py-2.5 rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    <Award className="w-4 h-4" />
                    Mes évaluations
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}