import { useState, useEffect } from 'react';
import {
  Code, Brain, Database, Calendar, Video, MapPin,
  Clock, TrendingUp, AlertCircle, MoreVertical,
   Settings, Bell, 
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ── Types ──────────────────────────────────────
interface Quiz {
  id: string;
  titre: string;
  description: string;
  offreTitre: string;
  dureeMinutes: number;
  niveauDifficulte: 'Beginner' | 'Intermediate' | 'Advanced';
  deadline: string;
  statut: 'pending' | 'in_progress' | 'completed';
  priorite: 'high' | 'normal';
  icone: 'code' | 'brain' | 'database';
}

interface Meeting {
  id: string;
  titre: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  type: 'video' | 'onsite';
  lien?: string;
  adresse?: string;
  interviewerNom: string;
  interviewerPhoto?: string;
  interviewerTitre: string;
}

// ── Config Icônes ──────────────────────────────
const icones = {
  code: Code,
  brain: Brain,
  database: Database,
};

// ── Card Quiz ──────────────────────────────────
function QuizCard({ quiz }: { quiz: Quiz }) {
  const navigate = useNavigate(); 
  const handleStartQuiz = () => {
    navigate(`/candidat/quiz/${quiz.id}`); 
  };

  const IconComponent = icones[quiz.icone];
  const isUrgent = quiz.priorite === 'high';
  
  const dateDeadline = new Date(quiz.deadline);
  const aujourdhui = new Date();
  const heuresRestantes = Math.floor((dateDeadline.getTime() - aujourdhui.getTime()) / 3600000);
  const estAujourdHui = heuresRestantes < 24 && heuresRestantes > 0;

  const niveauColors = {
    Beginner: 'text-[#705c30]',
    Intermediate: 'text-[#4a7c59]',
    Advanced: 'text-[#b83230]',
  };

  return (
    <div className={`bg-white rounded-xl p-6 shadow-[0_4px_20px_rgba(46,50,48,0.06)] border-l-4 ${
      isUrgent ? 'border-[#b83230]' : 'border-[#4a7c59]/20'
    } flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:shadow-md transition-all`}>
      <div className="flex gap-5">
        {/* Icône */}
        <div className="hidden md:flex w-16 h-16 bg-[#f0ece4] items-center justify-center rounded-lg text-[#4a7c59]">
          <IconComponent className="w-8 h-8" />
        </div>

        <div className="flex-1">
          {/* Titre + Badge */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-serif text-xl font-bold text-[#2e3230]">{quiz.titre}</h4>
            {isUrgent && (
              <span className="px-2 py-0.5 bg-[#ffdad8] text-[#b83230] text-[10px] font-bold rounded-full uppercase tracking-wider">
                High Priority
              </span>
            )}
          </div>

          <p className="text-[#74796e] text-sm mb-3">{quiz.description}</p>

          {/* Infos détaillées */}
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#4a4e4a]">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {quiz.dureeMinutes} Minutes
            </div>
            <div className={`flex items-center gap-1 ${niveauColors[quiz.niveauDifficulte]}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              {quiz.niveauDifficulte}
            </div>
            <div className={`flex items-center gap-1 ${estAujourdHui ? 'text-[#b83230]' : ''}`}>
              <Calendar className="w-3.5 h-3.5" />
              Deadline: {estAujourdHui ? 'Today, ' : ''}{dateDeadline.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Bouton Action */}
      <button onClick={handleStartQuiz} className={`px-6 py-2.5 rounded-lg font-bold whitespace-nowrap transition-colors shadow-sm ${
        isUrgent
          ? 'bg-[#4a7c59] text-white hover:bg-[#2a6038]'
          : 'bg-[#f0ece4] text-[#4a7c59] border border-[#4a7c59]/20 hover:bg-[#78a886] hover:text-white'
      }`}>
        Start Quiz
      </button>
    </div>
  );
}

// ── Card Meeting ───────────────────────────────
function MeetingCard({ meeting }: { meeting: Meeting }) {
  const dateMeeting = new Date(meeting.date);

  return (
    <div className="bg-[#eae6de] rounded-xl p-4 flex gap-4 border border-[#c4c8bc]/30 hover:shadow-sm transition-shadow">
      {/* Date Badge */}
      <div className="shrink-0 w-12 h-12 bg-white rounded-lg flex flex-col items-center justify-center text-[#4a7c59] font-bold">
        <span className="text-xs uppercase">{dateMeeting.toLocaleDateString('en-US', { month: 'short' })}</span>
        <span className="text-xl leading-none">{dateMeeting.getDate()}</span>
      </div>

      <div className="grow">
        <h5 className="font-serif font-bold text-[#2e3230] mb-1">{meeting.titre}</h5>
        
        {/* Type + Horaires */}
        <div className="flex items-center gap-2 text-xs text-[#74796e] mb-3">
          {meeting.type === 'video' ? (
            <>
              <Video className="w-3.5 h-3.5" />
              <span>{meeting.heureDebut} - {meeting.heureFin}</span>
            </>
          ) : (
            <>
              <MapPin className="w-3.5 h-3.5" />
              <span>{meeting.adresse}</span>
            </>
          )}
        </div>

        {/* Interviewer */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#78a886] flex items-center justify-center text-white text-xs font-bold">
            {meeting.interviewerNom.split(' ').map(n => n[0]).join('')}
          </div>
          <span className="text-xs font-semibold text-[#2e3230]">
            {meeting.interviewerNom}, {meeting.interviewerTitre}
          </span>
        </div>
      </div>

      <button className="self-start text-[#4a7c59] hover:text-[#2a6038]">
        <MoreVertical className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── Calendrier Mini ────────────────────────────
function MiniCalendar({ meetings }: { meetings: Meeting[] }) {
  const aujourdhui = new Date();
  const moisActuel = aujourdhui.getMonth();
  const anneeActuelle = aujourdhui.getFullYear();

  const premierJour = new Date(anneeActuelle, moisActuel, 1).getDay();
  const joursTotal = new Date(anneeActuelle, moisActuel + 1, 0).getDate();

  const jours: (number | null)[] = [
    ...Array(premierJour === 0 ? 6 : premierJour - 1).fill(null),
    ...Array.from({ length: joursTotal }, (_, i) => i + 1),
  ];

  const joursMeetings = meetings.map(m => new Date(m.date).getDate());

  return (
    <div className="bg-white rounded-xl p-6 shadow-[0_4px_20px_rgba(46,50,48,0.06)]">
      {/* Header */}
      <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-[#74796e] uppercase mb-4">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Jours */}
      <div className="grid grid-cols-7 gap-2 text-center text-sm font-semibold">
        {jours.map((jour, i) => {
          if (jour === null) return <span key={i} />;

          const estAujourdhui = jour === aujourdhui.getDate();
          const aMeeting = joursMeetings.includes(jour);

          return (
            <span
              key={i}
              className={`py-2 relative ${
                estAujourdhui
                  ? 'bg-[#4a7c59] text-white rounded-lg shadow-sm'
                  : 'text-[#2e3230]'
              }`}
            >
              {jour}
              {aMeeting && !estAujourdhui && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#4a7c59] rounded-full" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── PAGE PRINCIPALE ────────────────────────────
export default function AssessmentsPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Chargement des données
  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);

        // TODO: Remplacer par vos vraies routes API
        const [resQuizzes, resMeetings] = await Promise.allSettled([
          api.get('/candidat/quizzes'),
          api.get('/candidat/meetings'),
        ]);

        if (resQuizzes.status === 'fulfilled') {
          setQuizzes(resQuizzes.value?.data?.quizzes || []);
        }
        if (resMeetings.status === 'fulfilled') {
          setMeetings(resMeetings.value?.data?.meetings || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    charger();
  }, []);

  // Stats calculées
  const quizzesPending = quizzes.filter(q => q.statut === 'pending').length;
  const meetingsConfirmed = meetings.length;
  const dueIn24h = quizzes.filter(q => {
    const heures = (new Date(q.deadline).getTime() - Date.now()) / 3600000;
    return heures > 0 && heures < 24;
  }).length;

  return (
    
      
        <Layout searchPlaceholder="Search assessments...">
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#2e3230] tracking-tight">
              Assessments & Schedule
            </h2>
            <p className="text-[#74796e] mt-2 text-lg">
              Keep track of your technical challenges and upcoming interviews.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-3 rounded-full bg-[#eae6de] text-[#74796e] hover:text-[#4a7c59] transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <button className="p-3 rounded-full bg-[#eae6de] text-[#74796e] hover:text-[#4a7c59] transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-[#f5f1ea] p-6 rounded-xl shadow-[0_4px_20px_rgba(46,50,48,0.06)] border border-[#c4c8bc]/20">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-[#78a886]/20 rounded-full text-[#4a7c59]">
                <Code className="w-5 h-5" />
              </div>
              <span className="text-sm text-[#74796e] font-medium">Pending Quizzes</span>
            </div>
            <p className="font-serif text-3xl font-bold text-[#2e3230]">
              {loading ? '...' : quizzesPending.toString().padStart(2, '0')}
            </p>
          </div>

          <div className="bg-[#f5f1ea] p-6 rounded-xl shadow-[0_4px_20px_rgba(46,50,48,0.06)] border border-[#c4c8bc]/20">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-[#c4a66a]/20 rounded-full text-[#705c30]">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-sm text-[#74796e] font-medium">Confirmed Meetings</span>
            </div>
            <p className="font-serif text-3xl font-bold text-[#2e3230]">
              {loading ? '...' : meetingsConfirmed.toString().padStart(2, '0')}
            </p>
          </div>

          <div className="bg-[#f5f1ea] p-6 rounded-xl shadow-[0_4px_20px_rgba(46,50,48,0.06)] border border-[#c4c8bc]/20">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-[#ffdad8]/60 rounded-full text-[#b83230]">
                <AlertCircle className="w-5 h-5" />
              </div>
              <span className="text-sm text-[#74796e] font-medium">Due in 24h</span>
            </div>
            <p className="font-serif text-3xl font-bold text-[#2e3230]">
              {loading ? '...' : dueIn24h.toString().padStart(2, '0')}
            </p>
          </div>
        </div>

        {/* Grille principale */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Gauche: Liste des Quiz */}
          <section className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl font-bold text-[#2e3230]">Pending Quizzes</h3>
              <button className="text-[#4a7c59] font-bold text-sm hover:underline">
                View History
              </button>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
                    <div className="flex gap-5">
                      <div className="w-16 h-16 bg-gray-200 rounded-lg" />
                      <div className="flex-1 space-y-3">
                        <div className="h-5 bg-gray-200 rounded w-2/3" />
                        <div className="h-4 bg-gray-200 rounded w-full" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : quizzes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl">
                <p className="text-[#74796e] text-lg">No pending quizzes at the moment 🎉</p>
              </div>
            ) : (
              <div className="space-y-4">
                {quizzes.map(quiz => (
                  <QuizCard key={quiz.id} quiz={quiz} />
                ))}
              </div>
            )}
          </section>

          {/* Droite: Calendrier + Meetings */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl font-bold text-[#2e3230]">Meeting Calendar</h3>
              <span className="text-[#74796e] text-sm font-semibold">
                {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </div>

            {/* Mini Calendrier */}
            <MiniCalendar meetings={meetings} />

            {/* Liste des meetings */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-[#74796e] uppercase tracking-wider">
                Confirmed Interviews
              </p>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-[#eae6de] rounded-xl p-4 animate-pulse">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-300 rounded w-3/4" />
                          <div className="h-3 bg-gray-300 rounded w-1/2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <div className="bg-[#eae6de] rounded-xl p-6 text-center">
                  <p className="text-sm text-[#74796e]">No scheduled meetings yet</p>
                </div>
              ) : (
                meetings.map(meeting => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))
              )}
            </div>

            {/* CTA Card */}
            <div className="bg-[#f8e0a8] text-[#554020] p-6 rounded-xl relative overflow-hidden group">
              <div className="relative z-10">
                <h4 className="font-serif text-lg font-bold mb-2">Need a Reschedule?</h4>
                <p className="text-sm mb-4 opacity-80">
                  Life happens. Contact your assigned admin at least 24h prior to the meeting.
                </p>
                <button className="bg-[#554020] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-[#705c30] transition-colors">
                  Contact Support
                </button>
              </div>
              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-[#c4a66a]/20 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700" />
            </div>
          </section>
          
        </div>
        </Layout>
      
    
  );
}