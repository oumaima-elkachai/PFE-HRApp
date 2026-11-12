// src/pages/candidate/AssessmentsPage.tsx
//
// Quiz techniques et entretiens du candidat, en sections empilées.
// L'écran répond à une question : qu'est-ce qui m'attend, et par quoi
// dois-je commencer ?
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// Les composants recopiés (StatCard, Section, Vide) viennent du kit.
// Les quatre indicateurs et les trois conseils du bas tenaient sur
// une seule ligne quelle que soit la largeur, et les lignes de quiz
// alignaient cinq informations côte à côte sans jamais revenir à la
// ligne. La logique n'a pas bougé.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, FileText, AlertTriangle, Play, RotateCcw, Calendar, Video,
  MapPin, Phone, Search, X, Award, Hourglass, Target, XCircle,
  CheckCircle2,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import {
  EnTete, StatCard, Section, Vide, Squelette, Jauge, CARTE, ton,
} from '../../components/ui/kit';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

// ── Types, alignés sur ce que renvoie l'API ────────────────────────
// Les champs viennent de GET /candidat/quizzes et /candidat/meetings :
// toute divergence ici produit des valeurs indéfinies à l'affichage.

interface Quiz {
  id: string;
  candidatureId: string;
  titre: string;
  offreTitre: string;
  dureeMinutes: number;
  nombreQuestions: number;
  seuilPassage: number;
  echeance: string;
  statut: 'a_faire' | 'en_cours' | 'termine';
  urgent: boolean;
  expire: boolean;
  scoreObtenu: number | null;
  reussi: boolean | null;
}

interface Entretien {
  id: string;
  candidatureId: string;
  candidatNom?: string;
  offreTitre?: string;
  type: 'TELEPHONE' | 'VIDEO' | 'SUR_SITE';
  dateHeure: string;
  dureeMinutes?: number;
  lieu?: string | null;
  lienVideo?: string | null;
  statut: string;
}

const STYLE_ENTRETIEN: Record<string, {
  libelle: string; icone: React.ComponentType<{ className?: string }>; tonalite: string;
}> = {
  TELEPHONE: { libelle: 'Entretien téléphonique', icone: Phone,  tonalite: 'bleu' },
  VIDEO:     { libelle: 'Visioconférence',        icone: Video,  tonalite: 'violet' },
  SUR_SITE:  { libelle: 'Entretien sur site',     icone: MapPin, tonalite: 'amber' },
};

const styleEntretien = (t: string) =>
  STYLE_ENTRETIEN[t] ?? { libelle: 'Entretien', icone: Calendar, tonalite: 'stone' };

const joursRestants = (echeance: string) =>
  Math.ceil((new Date(echeance).getTime() - Date.now()) / 86400000);

const formaterDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ── Ligne de quiz à passer ─────────────────────────────────────────

function LigneQuiz({ quiz, delai }: { quiz: Quiz; delai: number }) {
  const navigate = useNavigate();
  const jours = joursRestants(quiz.echeance);
  const enCours = quiz.statut === 'en_cours';

  const tonalite = quiz.expire ? 'red' : quiz.urgent ? 'amber' : 'brand';
  const t = ton(tonalite);

  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter bg-surface rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md ${
        quiz.expire ? 'border-red-200' : quiz.urgent ? 'border-amber-200' : 'border-stone-100'
      }`}
    >
      <div className="flex">
        {/* Bande d'urgence : le délai se lit avant le titre. */}
        <div className={`w-1 shrink-0 ${t.barre}`} />

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
                <FileText className="w-5 h-5 text-brand-texte" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-stone-800">{quiz.titre}</h4>
                  {enCours && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      Commencé
                    </span>
                  )}
                  {quiz.urgent && !quiz.expire && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Urgent
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand-texte font-semibold mt-0.5 truncate">
                  {quiz.offreTitre}
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate(`/candidat/quiz/${quiz.id}`)}
              disabled={quiz.expire}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 shrink-0"
            >
              {enCours ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {enCours ? 'Reprendre' : 'Commencer'}
            </button>
          </div>

          <div className="flex items-center gap-x-5 gap-y-2 text-xs text-stone-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              {quiz.dureeMinutes} minutes
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-stone-400" />
              {quiz.nombreQuestions} question{quiz.nombreQuestions > 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-stone-400" />
              Seuil {quiz.seuilPassage} %
            </span>

            <span className={`flex items-center gap-1.5 font-bold px-2.5 py-1 rounded-full sm:ms-auto ${t.bg} ${t.text}`}>
              {quiz.expire ? 'Délai dépassé'
                : jours <= 0 ? "À faire aujourd'hui"
                : `${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Le minuteur ne se remet pas à zéro : le candidat doit le
              savoir avant de quitter la page. */}
          {enCours && (
            <p className="text-xs text-stone-400 mt-3 pt-3 border-t border-stone-100">
              Le minuteur tourne depuis votre premier accès, même si vous
              fermez la page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ligne de quiz terminé ──────────────────────────────────────────

function LigneQuizTermine({ quiz, delai }: { quiz: Quiz; delai: number }) {
  const reussi = Boolean(quiz.reussi);
  const tonalite = reussi ? 'brand' : 'amber';
  const t = ton(tonalite);
  const Icone = reussi ? CheckCircle2 : XCircle;
  const score = quiz.scoreObtenu ?? 0;

  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter ${CARTE} overflow-hidden`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${t.barre}`} />

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.bg}`}>
                <Icone className={`w-5 h-5 ${t.text}`} />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-stone-800 truncate">{quiz.titre}</h4>
                <p className="text-xs text-stone-400 truncate">{quiz.offreTitre}</p>
              </div>
            </div>

            <div className="text-end shrink-0">
              <div className={`text-2xl font-bold leading-none ${t.text}`}>
                {score}<span className="text-sm font-normal">/100</span>
              </div>
              <div className="text-[10px] text-stone-400 mt-1">
                {reussi ? 'Réussi' : 'Sous le seuil'}
              </div>
            </div>
          </div>

          {/* La barre situe le score face au seuil : « 58 » seul ne
              dit pas si c'est loin ou de peu. */}
          <Jauge valeur={score} tonalite={tonalite} seuil={quiz.seuilPassage} />

          <div className="flex justify-between text-[10px] text-stone-400 mt-1.5">
            <span>0</span>
            <span>Seuil {quiz.seuilPassage} %</span>
            <span>100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ligne d'entretien ──────────────────────────────────────────────

function LigneEntretien({ entretien, delai }: { entretien: Entretien; delai: number }) {
  const style = styleEntretien(entretien.type);
  const Icone = style.icone;
  const t = ton(style.tonalite);

  const date = new Date(entretien.dateHeure);
  const passe = date.getTime() < Date.now();
  const jours = Math.ceil((date.getTime() - Date.now()) / 86400000);

  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter ${CARTE} overflow-hidden transition-shadow hover:shadow-md ${
        passe ? 'opacity-60' : ''
      }`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${t.barre}`} />

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.bg}`}>
                <Icone className={`w-5 h-5 ${t.text}`} />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-stone-800">{style.libelle}</h4>
                <p className="text-xs text-brand-texte font-semibold mt-0.5 truncate">
                  {entretien.offreTitre ?? 'Entretien de recrutement'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!passe && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                  {jours <= 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `J-${jours}`}
                </span>
              )}

              {entretien.lienVideo && !passe && (
                <a
                  href={entretien.lienVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  <Video className="w-4 h-4" />
                  Rejoindre
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-x-5 gap-y-2 text-xs text-stone-500 flex-wrap">
            <span className="font-medium text-stone-700 first-letter:uppercase">
              {formaterDate(entretien.dateHeure)}
            </span>
            {entretien.dureeMinutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                {entretien.dureeMinutes} min
              </span>
            )}
            {entretien.lieu && (
              <span className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span className="truncate">{entretien.lieu}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function AssessmentsPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [entretiens, setEntretiens] = useState<Entretien[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Chargées en parallèle et tolérantes à l'échec de l'une : un
        // entretien indisponible ne doit pas masquer les quiz.
        const [resQuiz, resEntretiens] = await Promise.allSettled([
          api.get('/candidat/quizzes') as any,
          api.get('/candidat/meetings') as any,
        ]);

        if (resQuiz.status === 'fulfilled') {
          setQuizzes(resQuiz.value?.data?.quizzes ?? []);
        }
        if (resEntretiens.status === 'fulfilled') {
          setEntretiens(resEntretiens.value?.data?.entretiens ?? []);
        }
      } catch (e) {
        console.error('Chargement des évaluations :', e);
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const correspond = (texte: string) => {
    const terme = recherche.trim().toLowerCase();
    return !terme || texte.toLowerCase().includes(terme);
  };

  const aPasser = useMemo(
    () => quizzes
      .filter((q) => q.statut !== 'termine')
      .filter((q) => correspond(`${q.titre} ${q.offreTitre}`))
      // Ce qui expire en premier remonte : le candidat ne doit pas
      // manquer une échéance parce qu'elle était en bas de liste.
      .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance))),
    [quizzes, recherche]
  );

  const termines = useMemo(
    () => quizzes
      .filter((q) => q.statut === 'termine')
      .filter((q) => correspond(`${q.titre} ${q.offreTitre}`)),
    [quizzes, recherche]
  );

  const aVenir = useMemo(
    () => entretiens
      .filter((e) => new Date(e.dateHeure).getTime() >= Date.now() && e.statut !== 'ANNULE')
      .filter((e) => correspond(`${e.offreTitre ?? ''} ${styleEntretien(e.type).libelle}`))
      .sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure))),
    [entretiens, recherche]
  );

  const tousQuiz = quizzes.filter((q) => q.statut !== 'termine');
  const tousEntretiens = entretiens.filter(
    (e) => new Date(e.dateHeure).getTime() >= Date.now() && e.statut !== 'ANNULE'
  );

  const urgents = tousQuiz.filter((q) => q.urgent && !q.expire).length;
  const reussis = quizzes.filter((q) => q.statut === 'termine' && q.reussi).length;

  // Le prochain rendez-vous, quel qu'il soit : c'est la seule chose
  // que le candidat vérifie en arrivant.
  const prochain = useMemo(() => {
    const quizProche = [...tousQuiz]
      .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)))[0];
    const entretienProche = [...tousEntretiens]
      .sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure)))[0];

    if (!quizProche && !entretienProche) return null;
    if (!entretienProche) {
      return { type: 'quiz' as const, date: quizProche.echeance, titre: quizProche.titre };
    }
    if (!quizProche) {
      return {
        type: 'entretien' as const,
        date: entretienProche.dateHeure,
        titre: styleEntretien(entretienProche.type).libelle,
      };
    }

    return new Date(quizProche.echeance) < new Date(entretienProche.dateHeure)
      ? { type: 'quiz' as const, date: quizProche.echeance, titre: quizProche.titre }
      : {
        type: 'entretien' as const,
        date: entretienProche.dateHeure,
        titre: styleEntretien(entretienProche.type).libelle,
      };
  }, [quizzes, entretiens]);

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Mon suivi', 'Mes évaluations']}
          titre="Mes évaluations"
          sousTitre={chargement ? 'Chargement…' : prochain ? (
            <>
              Prochaine échéance :{' '}
              <span className="text-brand-texte font-semibold">{prochain.titre}</span>
              {' le '}{dateCourte(prochain.date)}
            </>
          ) : 'Rien de prévu pour le moment'}
        >
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Quiz, poste…"
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
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={FileText}
              label="Quiz à passer"
              value={chargement ? '…' : tousQuiz.length}
              sub={urgents > 0 ? `dont ${urgents} urgent${urgents > 1 ? 's' : ''}` : 'aucune urgence'}
              tonalite="brand"
              alerte={urgents > 0}
              delai={0}
            />
            <StatCard
              icon={Calendar}
              label="Entretiens à venir"
              value={chargement ? '…' : tousEntretiens.length}
              sub="rendez-vous planifiés"
              tonalite="violet"
              delai={60}
            />
            <StatCard
              icon={Award}
              label="Quiz terminés"
              value={chargement ? '…' : quizzes.filter((q) => q.statut === 'termine').length}
              sub={`${reussis} au-dessus du seuil`}
              tonalite="bleu"
              delai={120}
            />
            <StatCard
              icon={Hourglass}
              label="Échéance la plus proche"
              value={chargement ? '…' : prochain ? dateCourte(prochain.date) : '—'}
              sub={prochain
                ? prochain.type === 'quiz' ? 'quiz technique' : 'entretien'
                : 'rien de planifié'}
              tonalite="amber"
              delai={180}
            />
          </div>

          {chargement ? (
            <Squelette nombre={4} hauteur="h-28" />
          ) : (
            <div className="space-y-8">

              <Section icone={FileText} titre="Quiz à passer" compteur={aPasser.length}>
                {aPasser.length === 0 ? (
                  <Vide
                    icone={FileText}
                    message={recherche
                      ? `Aucun quiz ne correspond à « ${recherche} »`
                      : 'Aucun quiz à passer'}
                    detail={recherche ? undefined
                      : "Les quiz vous sont envoyés après présélection d'une candidature."}
                  />
                ) : (
                  <div className="space-y-3">
                    {aPasser.map((quiz, i) => (
                      <LigneQuiz key={quiz.id} quiz={quiz} delai={i * 60} />
                    ))}
                  </div>
                )}
              </Section>

              <Section icone={Calendar} titre="Entretiens à venir" compteur={aVenir.length}>
                {aVenir.length === 0 ? (
                  <Vide
                    icone={Calendar}
                    message={recherche
                      ? `Aucun entretien ne correspond à « ${recherche} »`
                      : 'Aucun entretien planifié'}
                  />
                ) : (
                  <div className="space-y-3">
                    {aVenir.map((e, i) => (
                      <LigneEntretien key={e.id} entretien={e} delai={i * 60} />
                    ))}
                  </div>
                )}
              </Section>

              {termines.length > 0 && (
                <Section icone={Award} titre="Évaluations terminées" compteur={termines.length}>
                  <div className="space-y-3">
                    {termines.map((quiz, i) => (
                      <LigneQuizTermine key={quiz.id} quiz={quiz} delai={i * 60} />
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Conseils ── */}
              {/* Un quiz technique se prépare : le dire vaut mieux
                  qu'un candidat qui le commence sans savoir qu'il est
                  chronométré. */}
              <div className={`${CARTE} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-brand-texte" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    Avant de commencer un quiz
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
                  {([
                    ["Le minuteur ne s’arrête pas", 'Une fois lancé, il tourne même si vous fermez la page'],
                    ['Une seule tentative', 'Le score obtenu est définitif et transmis au recruteur'],
                    ['Connexion stable', 'Vos réponses sont enregistrées au fur et à mesure'],
                  ] as [string, string][]).map(([titre, detail]) => (
                    <div key={titre}>
                      <div className="text-xs font-bold text-stone-700">{titre}</div>
                      <p className="text-[10px] text-stone-400 mt-0.5 leading-relaxed">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}