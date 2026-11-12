// src/pages/candidate/QuizPage.tsx
//
// Passage d'un quiz technique.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// Les couleurs écrites en hexadécimal passent aux jetons Tailwind,
// comme le reste de l'application. La logique n'a pas bougé : le
// minuteur, la soumission par référence, la surveillance d'intégrité
// et l'avertissement avant fermeture sont identiques.
//
// Trois défauts d'affichage corrigés au passage :
//
//   — la page n'avait pas de marge horizontale, donc le texte touchait
//     le bord sur téléphone ;
//   — les trois cartes de résultat restaient sur une ligne quelle que
//     soit la largeur, et se chevauchaient en dessous de 360 px ;
//   — la barre de navigation entre questions débordait dès qu'un quiz
//     dépassait une quinzaine de questions, les pastilles n'ayant
//     aucune règle de retour à la ligne.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, ChevronLeft, ChevronRight, Send, AlertTriangle,
  CheckCircle2, XCircle, Loader2, FileText,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { Jauge, CARTE } from '../../components/ui/kit';
import {
  quizService,
  type QuizCandidat,
  type SessionQuiz,
  type ResultatQuiz,
} from '../../services/quiz';

const formaterDuree = (secondes: number) => {
  const m = Math.floor(Math.max(0, secondes) / 60);
  const s = Math.max(0, secondes) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizCandidat | null>(null);
  const [session, setSession] = useState<SessionQuiz | null>(null);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [secondesRestantes, setSecondesRestantes] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<ResultatQuiz | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  // Indicateurs d'intégrité. Stockés en référence et non en état :
  // ils changent souvent et ne doivent déclencher aucun rendu.
  const integrite = useRef({ changementsOnglet: 0, copierColler: 0 });

  // La soumission est référencée, pas capturée : sans cela, le
  // minuteur enverrait les réponses telles qu'elles étaient au premier
  // rendu.
  const soumettreRef = useRef<() => void>(() => {});

  // ── Démarrage de la session ──────────────────────────────────────
  useEffect(() => {
    if (!quizId) return;

    (async () => {
      try {
        setChargement(true);
        const res = await quizService.demarrer(quizId);
        setQuiz(res.data.quiz);
        setSession(res.data.session);

        const restant = Math.floor(
          (new Date(res.data.session.expireLe).getTime() - Date.now()) / 1000
        );
        setSecondesRestantes(Math.max(0, restant));
      } catch (e: any) {
        setErreur(e?.erreur ?? 'Impossible de démarrer ce quiz');
      } finally {
        setChargement(false);
      }
    })();
  }, [quizId]);

  // ── Soumission ───────────────────────────────────────────────────
  const soumettre = useCallback(async () => {
    if (!session || envoi) return;

    setEnvoi(true);
    setErreur('');
    try {
      const res = await quizService.soumettre(session.id, {
        reponses: Object.entries(reponses).map(([questionId, reponse]) => ({
          questionId,
          reponse,
        })),
        nombreChangementsOnglet: integrite.current.changementsOnglet,
        nombreCopierColler: integrite.current.copierColler,
      });
      setResultat(res.data.resultat);
    } catch (e: any) {
      setErreur(e?.erreur ?? "Impossible d'enregistrer vos réponses");
    } finally {
      setEnvoi(false);
      setConfirmation(false);
    }
  }, [session, reponses, envoi]);

  // La référence suit toujours la dernière version de la fonction.
  useEffect(() => {
    soumettreRef.current = soumettre;
  }, [soumettre]);

  // ── Minuteur ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || resultat) return;

    const intervalle = setInterval(() => {
      setSecondesRestantes((restant) => {
        if (restant <= 1) {
          clearInterval(intervalle);
          // Soumission automatique à l'expiration, avec les réponses
          // réellement saisies grâce à la référence.
          soumettreRef.current();
          return 0;
        }
        return restant - 1;
      });
    }, 1000);

    return () => clearInterval(intervalle);
  }, [session, resultat]);

  // ── Surveillance d'intégrité ─────────────────────────────────────
  // Les compteurs sont remontés au serveur au fil de l'eau : un
  // candidat qui abandonne laisse tout de même une trace.
  useEffect(() => {
    if (!session || resultat) return;

    let attente: ReturnType<typeof setTimeout> | null = null;

    const remonter = () => {
      if (attente) clearTimeout(attente);
      attente = setTimeout(() => {
        quizService
          .signalerIntegrite(session.id, {
            nombreChangementsOnglet: integrite.current.changementsOnglet,
            nombreCopierColler: integrite.current.copierColler,
          })
          .catch(() => {
            /* silencieux : ne doit pas perturber le passage */
          });
      }, 3000);
    };

    const surVisibilite = () => {
      if (document.hidden) {
        integrite.current.changementsOnglet += 1;
        remonter();
      }
    };

    const surCollage = () => {
      integrite.current.copierColler += 1;
      remonter();
    };

    document.addEventListener('visibilitychange', surVisibilite);
    document.addEventListener('paste', surCollage);

    return () => {
      document.removeEventListener('visibilitychange', surVisibilite);
      document.removeEventListener('paste', surCollage);
      if (attente) clearTimeout(attente);
    };
  }, [session, resultat]);

  // Avertit avant de quitter la page en cours de passage.
  useEffect(() => {
    if (!session || resultat) return;

    const surFermeture = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', surFermeture);
    return () => window.removeEventListener('beforeunload', surFermeture);
  }, [session, resultat]);

  // ── Chargement et erreur ─────────────────────────────────────────

  if (chargement) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 sm:py-32 px-4">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-brand-texte" />
          <p className="text-sm text-stone-500">Préparation du quiz…</p>
        </div>
      </Layout>
    );
  }

  if (erreur && !quiz) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-20 sm:py-24 px-4">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h1 className="text-xl font-bold mb-2 text-stone-800">
            Quiz indisponible
          </h1>
          <p className="text-sm mb-6 text-stone-500">{erreur}</p>
          <button
            onClick={() => navigate('/candidat/quizzes')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors"
          >
            Retour à mes évaluations
          </button>
        </div>
      </Layout>
    );
  }

  // ── Résultat ─────────────────────────────────────────────────────

  if (resultat) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto py-8 sm:py-12 px-4 sm:px-8">

          <div
            className="rounded-2xl p-6 sm:p-8 text-center text-white mb-5"
            style={{
              background: resultat.reussi
                ? 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)'
                : 'linear-gradient(135deg, #B45309 0%, #D97706 100%)',
            }}
          >
            {resultat.reussi
              ? <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-white/90" />
              : <FileText className="w-14 h-14 mx-auto mb-3 text-white/90" />}
            <p className="text-sm text-white/70 mb-1">VOTRE SCORE</p>
            <p className="text-4xl sm:text-5xl font-bold mb-2">
              {resultat.scoreObtenu}<span className="text-2xl">/100</span>
            </p>
            <p className="text-sm text-white/80">
              Seuil de réussite : {resultat.seuilPassage}
            </p>
          </div>

          {/* Trois cartes qui tiennent aussi sur un téléphone étroit. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {([
              ['Questions', `${resultat.questionsRepondues}/${resultat.nombreQuestions}`],
              ['Durée', `${resultat.dureeReelleMinutes} min`],
              ['Résultat', resultat.reussi ? 'Réussi' : 'Non retenu'],
            ] as [string, string][]).map(([label, valeur]) => (
              <div
                key={label}
                className="rounded-xl p-3 text-center border border-stone-200 bg-stone-50"
              >
                <div className="text-xs mb-1 text-stone-500">{label}</div>
                <div className="font-bold text-sm text-stone-800">{valeur}</div>
              </div>
            ))}
          </div>

          {resultat.competences.length > 0 && (
            <div className={`${CARTE} p-5 mb-5`}>
              <h2 className="text-sm font-bold mb-4 text-stone-800">
                Détail par compétence
              </h2>
              <div className="space-y-3">
                {resultat.competences.map((c) => (
                  <div key={c.nom}>
                    <div className="flex justify-between text-sm mb-1 gap-2">
                      <span className="text-stone-500 truncate">{c.nom}</span>
                      <span className="font-bold text-stone-800 shrink-0">{c.score} %</span>
                    </div>
                    <Jauge
                      valeur={c.score}
                      hauteur="h-1.5"
                      tonalite={c.score >= 70 ? 'brand' : c.score >= 50 ? 'amber' : 'red'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm text-center mb-6 text-stone-500 leading-relaxed">
            {resultat.reussi
              ? 'Votre candidature poursuit son parcours. Le recruteur vous recontactera.'
              : 'Vos réponses ont été transmises au recruteur.'}
          </p>

          <button
            onClick={() => navigate('/candidat/quizzes')}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors"
          >
            Retour à mes évaluations
          </button>
        </div>
      </Layout>
    );
  }

  if (!quiz || !session) return null;

  // ── Passage ──────────────────────────────────────────────────────

  const question = quiz.questions[index];
  const nbRepondues = Object.values(reponses).filter((r) => r?.trim()).length;
  const progression = (nbRepondues / quiz.questions.length) * 100;
  const urgence = secondesRestantes < 120;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-6 px-4 sm:px-8">

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-stone-800 truncate">{quiz.titre}</h1>
            <p className="text-sm text-stone-500 truncate">{quiz.offreTitre}</p>
          </div>

          {/* Le minuteur passe au rouge sous deux minutes : à ce
              moment-là, il faut qu'on le voie sans le chercher. */}
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl font-mono font-bold shrink-0 ${
              urgence ? 'bg-red-50 text-red-500' : 'bg-stone-50 text-stone-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            {formaterDuree(secondesRestantes)}
          </div>
        </div>

        {session.reprise && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-4 text-sm bg-amber-50 text-amber-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Session reprise. Le minuteur a continué de tourner depuis votre
              premier accès.
            </span>
          </div>
        )}

        {erreur && (
          <div className="rounded-xl px-4 py-3 mb-4 text-sm bg-red-50 text-red-500">
            {erreur}
          </div>
        )}

        <div className="mb-5">
          <div className="flex justify-between text-xs mb-1.5 text-stone-500 gap-2">
            <span>Question {index + 1} sur {quiz.questions.length}</span>
            <span className="shrink-0">
              {nbRepondues} répondue{nbRepondues > 1 ? 's' : ''}
            </span>
          </div>
          <Jauge valeur={progression} hauteur="h-1.5" />
        </div>

        <div className={`${CARTE} p-5 sm:p-6 mb-5`}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <p className="font-medium leading-relaxed text-stone-800">
              {question.question}
            </p>
            <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0 bg-stone-50 text-stone-500">
              {question.points} pts
            </span>
          </div>

          {question.type === 'QCM' ? (
            <div className="space-y-2">
              {(question.options ?? []).map((option) => {
                const choisi = reponses[question.id] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setReponses((r) => ({ ...r, [question.id]: option }))}
                    className={`w-full text-start px-4 py-3 rounded-xl border text-sm transition-all ${
                      choisi
                        ? 'border-brand-500 bg-brand-500/10 text-brand-texte font-bold'
                        : 'border-stone-200 bg-surface text-stone-800 hover:bg-stone-50'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <textarea
                value={reponses[question.id] ?? ''}
                onChange={(e) =>
                  setReponses((r) => ({ ...r, [question.id]: e.target.value }))
                }
                rows={7}
                placeholder="Rédigez votre réponse…"
                className="w-full px-4 py-3 text-sm rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:border-brand-500 resize-none transition-colors"
              />
              <p className="text-xs mt-1.5 text-stone-500">
                {(reponses[question.id] ?? '').trim().length} caractères
              </p>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        {/* Les pastilles passent à la ligne : un quiz de vingt
            questions débordait de l'écran. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
          {quiz.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setIndex(i)}
              title={`Question ${i + 1}`}
              aria-label={`Aller à la question ${i + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === index ? 'bg-brand-500 scale-150'
                  : reponses[q.id]?.trim() ? 'bg-brand-500/40'
                  : 'bg-stone-200'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Précédent</span>
          </button>

          {index < quiz.questions.length - 1 ? (
            <button
              onClick={() => setIndex((i) => i + 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setConfirmation(true)}
              disabled={envoi}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-60 transition-colors"
            >
              <Send className="w-4 h-4" />
              Terminer
            </button>
          )}
        </div>
      </div>

      {confirmation && (
        <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="font-bold text-lg mb-2 text-stone-800">
              Soumettre vos réponses ?
            </h2>
            <p className="text-sm mb-5 text-stone-500 leading-relaxed">
              {nbRepondues < quiz.questions.length
                ? `Il reste ${quiz.questions.length - nbRepondues} question`
                  + `${quiz.questions.length - nbRepondues > 1 ? 's' : ''} sans réponse. `
                : ''}
              Cette action est définitive.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmation(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors"
              >
                Continuer
              </button>
              <button
                onClick={soumettre}
                disabled={envoi}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {envoi
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
                {envoi ? 'Envoi…' : 'Soumettre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}