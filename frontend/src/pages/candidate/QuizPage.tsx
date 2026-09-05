// src/pages/candidate/QuizPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, ChevronRight, Award } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext'; // Importation nécessaire pour lier le candidat au submit

interface Question {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number;
}

interface Quiz {
  offreId: string;
  titre: string; // Correction d'éventuels typos (titre au lieu de titrOffre s'il vient de la BD)
  questions: Question[];
  dureeMinutes: number;
}

export default function QuizPage() {
  const navigate = useNavigate();
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuth(); // Récupérer l'utilisateur courant

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [current, setCurrent] = useState(0);
  const [reponses, setReponses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resultat, setResultat] = useState<{ score: number; total: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Charger le quiz
  useEffect(() => {
    const chargerQuiz = async () => {
      try {
        if (!quizId) {
          console.error('❌ Quiz ID manquant');
          navigate('/candidat/quizzes'); // ✅ Redirection vers la bonne page
          return;
        }

        setLoading(true);
        console.log(`📥 Chargement quiz ${quizId}...`);
        const response = await api.get(`/quiz/${quizId}`);
        
        if (response.data.succes) {
          const q = response.data.data.quiz;
          setQuiz(q);
          setTimeLeft(q.dureeMinutes * 60);
        } else {
          throw new Error('Quiz introuvable');
        }
      } catch (e) {
        console.error('Erreur chargement quiz:', e);
        navigate('/candidat/quizzes'); // ✅ Redirection vers la bonne page
      } finally {
        setLoading(false);
      }
    };

    chargerQuiz();
  }, [quizId, navigate]);

  // Timer
  useEffect(() => {
    if (!quiz || resultat || timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { 
          handleSubmit(); 
          return 0; 
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [quiz, resultat, timeLeft]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleReponse = (questionId: string, optionIndex: number) => {
    setReponses(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    if (!quiz || submitting || !quizId) return;
    setSubmitting(true);
    try {
      // ✅ Envoi au backend avec l'ID du candidat connecté
      const res = await api.post(`/quiz/${quizId}/submit`, {
        candidatId: user?.sub || user?.sub,
        reponses,
      }) as any;
      
      if (res?.data?.succes) {
        setResultat(res?.data?.data?.resultat || res?.data?.resultat);
      }
    } catch (e) {
      console.error("Erreur de soumission du quiz:", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout searchPlaceholder="">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin w-10 h-10 border-4 border-[#2d6a4f] border-t-transparent rounded-full" />
          <p className="text-sm text-gray-500">Chargement de votre examen...</p>
        </div>
      </Layout>
    );
  }

  // ── Résultat ──
  if (resultat) {
    const pct = Math.round((resultat.score / resultat.total) * 100);
    return (
      <Layout searchPlaceholder="">
        <div className="max-w-md mx-auto text-center py-16 px-4">
          <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
            pct >= 70 ? 'bg-[#d8f3dc]' : 'bg-amber-50'
          }`}>
            <Award className={`w-12 h-12 ${pct >= 70 ? 'text-[#2d6a4f]' : 'text-amber-500'}`} />
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">Quiz terminé !</h1>
          <p className="text-5xl font-bold text-[#2d6a4f] mb-3">{pct}/100</p>
          <p className="text-sm text-[#6b7280] mb-8">
            {resultat.score} sur {resultat.total} bonnes réponses.
          </p>
          <button 
            onClick={() => navigate('/candidat/quizzes')} // ✅ Redirection corrigée
            className="bg-[#2d6a4f] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1b4332] transition-colors"
          >
            Retour aux évaluations
          </button>
        </div>
      </Layout>
    );
  }

  if (!quiz) return null;
  const q = quiz.questions[current];
  const progress = ((current + 1) / quiz.questions.length) * 100;

  return (
    <Layout searchPlaceholder="">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[#1a1a1a]">Quiz — {quiz.titre}</h1>
            <p className="text-sm text-[#6b7280]">
              Question {current + 1} sur {quiz.questions.length}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-bold ${
            timeLeft < 60 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-[#f5f0e8] text-[#1a1a1a]'
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-[#f0ebe0] rounded-full h-2 mb-8 overflow-hidden">
          <div className="bg-[#2d6a4f] h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }} />
        </div>

        {/* Question */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-8 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-6 leading-relaxed">{q?.question}</h2>
          <div className="space-y-3">
            {q?.options.map((opt, i) => (
              <button key={i}
                onClick={() => handleReponse(q.id, i)}
                className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all text-sm ${
                  reponses[q.id] === i
                    ? 'border-[#2d6a4f] bg-[#d8f3dc] text-[#1a1a1a] font-medium'
                    : 'border-[#e5e0d8] bg-white text-[#374151] hover:border-[#2d6a4f]/50'
                }`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-3 ${
                  reponses[q.id] === i
                    ? 'bg-[#2d6a4f] text-white'
                    : 'bg-[#f0ebe0] text-[#6b7280]'
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setCurrent(Math.max(0, current - 1))}
            disabled={current === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[#e5e0d8] hover:bg-[#f5f0e8] disabled:opacity-40 transition-colors"
          >
            Précédent
          </button>

          {current < quiz.questions.length - 1 ? (
            <button
              onClick={() => setCurrent(current + 1)}
              disabled={reponses[q?.id] === undefined}
              className="flex items-center gap-1 bg-[#2d6a4f] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1b4332] disabled:opacity-40 transition-colors"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.keys(reponses).length < quiz.questions.length}
              className="flex items-center gap-1 bg-[#2d6a4f] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1b4332] disabled:opacity-40 transition-colors"
            >
              {submitting ? 'Envoi...' : 'Soumettre le quiz'}
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}