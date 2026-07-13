// src/pages/candidate/MesCandidaturesPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Clock, CheckCircle, XCircle, FileText,
  Video, MapPin, ChevronRight, Bell, ExternalLink,
  ClipboardList, CalendarDays, Award,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { candidatsService } from '../../services/candidats';
import { useAuth } from '../../context/AuthContext';
import type { Candidat, Notification as Notif } from '../../types';
import { notificationsService } from '@/services/notifications';

// ── Config statuts (simplifié pour candidat) ──
const statutDisplay: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  SOUMIS:          { label: 'Candidature soumise',   color: 'text-blue-600',     bg: 'bg-blue-50',      icon: FileText },
  PRESELECTION:    { label: 'En cours d\'analyse',   color: 'text-amber-600',    bg: 'bg-amber-50',     icon: Clock },
  QUIZ_EN_ATTENTE: { label: 'Quiz disponible',       color: 'text-indigo-600',   bg: 'bg-indigo-50',    icon: ClipboardList },
  QUIZ_COMPLETE:   { label: 'Quiz complété',         color: 'text-cyan-600',     bg: 'bg-cyan-50',      icon: CheckCircle },
  ENTRETIEN:       { label: 'Entretien planifié',    color: 'text-purple-600',   bg: 'bg-purple-50',    icon: CalendarDays },
  OFFRE:           { label: 'Offre reçue 🎉',       color: 'text-[#2d6a4f]',    bg: 'bg-[#d8f3dc]',    icon: Award },
  EMBAUCHE:        { label: 'Embauché 🎉',          color: 'text-[#2d6a4f]',    bg: 'bg-[#d8f3dc]',    icon: CheckCircle },
  REFUSE:          { label: 'Non retenu',            color: 'text-red-500',      bg: 'bg-red-50',       icon: XCircle },
};

// ── Bannière Notification ─────────────────────
function NotificationBanner({ notifications, onDismiss }: {
  notifications: Notif[];
  onDismiss: (id: string) => void;
}) {
  const unread = notifications.filter(n => !n.lu);
  if (unread.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {unread.map(n => (
        <div key={n.id}
          className={`flex items-start gap-3 p-4 rounded-2xl border ${
            n.type === 'ENTRETIEN_PLANIFIE'
              ? 'bg-purple-50 border-purple-200'
              : n.type === 'QUIZ_DISPONIBLE'
                ? 'bg-indigo-50 border-indigo-200'
                : n.type === 'OFFRE_RECUE'
                  ? 'bg-[#d8f3dc] border-[#2d6a4f]/20'
                  : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            n.type === 'ENTRETIEN_PLANIFIE' ? 'bg-purple-100' :
            n.type === 'QUIZ_DISPONIBLE'    ? 'bg-indigo-100' :
            n.type === 'OFFRE_RECUE'        ? 'bg-[#b7e4c7]' : 'bg-blue-100'
          }`}>
            <Bell className="w-4 h-4 text-current" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1a1a1a]">{n.titre}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
          </div>
          <button onClick={() => onDismiss(n.id)}
            className="text-[#9ca3af] hover:text-[#6b7280] shrink-0 mt-1">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Card Candidature (vue candidat) ───────────
function CandidatureCard({ candidat }: { candidat: Candidat }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const config = statutDisplay[candidat.statut] ?? statutDisplay['SOUMIS'];
  const Icon = config.icon;

  const titrePoste = candidat.offreTitre || candidat.posteVise || 'Poste';
  const dateStr    = candidat.soumisLe || new Date().toISOString();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-5">
        {/* ── Header: Poste + Statut ── */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#f5f0e8] rounded-xl flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-[#2d6a4f]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#1a1a1a] text-[15px]">{titrePoste}</h3>
              {candidat.offreDepartement && (
                <p className="text-xs text-[#9ca3af]">{candidat.offreDepartement}</p>
              )}
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Postulé le {formatDate(dateStr)}
              </p>
            </div>
          </div>

          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full shrink-0 ${config.bg} ${config.color}`}>
            <Icon className="w-3.5 h-3.5" />
            {config.label}
          </span>
        </div>

        {/* ── Alerte Quiz disponible ── */}
        {candidat.statut === 'QUIZ_EN_ATTENTE' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-indigo-700">Quiz technique disponible</p>
                  <p className="text-xs text-indigo-500">Complétez le quiz pour avancer dans le processus</p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/candidat/quiz/${candidat.offreId}/${candidat.id}`)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1"
              >
                Passer le Quiz
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* ── Score Quiz (si complété) ── */}
        {candidat.quizResult && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-medium text-cyan-700">
                Quiz complété — Score : {candidat.quizResult.scoreQuiz}/100
              </p>
              <span className="text-xs text-cyan-500 ml-auto">
                {candidat.quizResult.bonnesReponses}/{candidat.quizResult.totalQuestions} bonnes réponses
              </span>
            </div>
          </div>
        )}

        {/* ── Entretien planifié ── */}
        {candidat.statut === 'ENTRETIEN' && candidat.entretien && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                {candidat.entretien.type === 'en_ligne'
                  ? <Video className="w-4 h-4 text-purple-600" />
                  : <MapPin className="w-4 h-4 text-purple-600" />
                }
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-800">
                  Entretien {candidat.entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'}
                </p>
                <p className="text-xs text-purple-600 mt-1">
                  📅 {formatDate(candidat.entretien.date)} à {candidat.entretien.heure}
                </p>
                {candidat.entretien.type === 'en_ligne' && candidat.entretien.lien && (
                  <a href={candidat.entretien.lien} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg mt-2 hover:bg-purple-200 transition-colors font-medium">
                    <Video className="w-3 h-3" />
                    Rejoindre la visioconférence
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {candidat.entretien.type === 'sur_site' && candidat.entretien.adresse && (
                  <p className="text-xs text-purple-600 mt-1">
                    📍 {candidat.entretien.adresse}
                  </p>
                )}
                {candidat.entretien.notes && (
                  <p className="text-xs text-purple-500 mt-1 italic">
                    💬 {candidat.entretien.notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Offre reçue ── */}
        {candidat.statut === 'OFFRE' && (
          <div className="bg-[#d8f3dc] border border-[#2d6a4f]/20 rounded-xl p-4 mb-3 text-center">
            <p className="text-lg mb-1">🎉</p>
            <p className="text-sm font-semibold text-[#2d6a4f]">
              Félicitations ! Vous avez reçu une offre
            </p>
            <p className="text-xs text-[#2d6a4f]/70 mt-1">
              L'équipe RH vous contactera bientôt avec les détails
            </p>
          </div>
        )}

        {/* ── Infos soumises (expandable) ── */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[#2d6a4f] font-medium hover:underline mt-1"
        >
          {expanded ? 'Masquer mes informations' : 'Voir mes informations'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* ── Détails expandés ── */}
      {expanded && (
        <div className="border-t border-[#f0ebe0] px-5 py-4 bg-[#fafaf8] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Email',       v: candidat.email },
              { l: 'Téléphone',   v: candidat.telephone || '—' },
              { l: 'Niveau',      v: candidat.niveauEtude || '—' },
              { l: 'Expérience',  v: candidat.experience || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-white rounded-xl p-3 border border-[#e5e0d8]">
                <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-1">{l}</div>
                <div className="text-sm font-medium text-[#1a1a1a]">{v}</div>
              </div>
            ))}
          </div>

          {candidat.competences?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-2">Compétences</p>
              <div className="flex gap-1.5 flex-wrap">
                {candidat.competences.map((c, i) => (
                  <span key={i} className="text-xs bg-[#d8f3dc] text-[#2d6a4f] px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.lettreMotivation && (
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-2">Lettre de motivation</p>
              <p className="text-xs text-[#374151] bg-white rounded-xl p-3 border border-[#e5e0d8] leading-relaxed">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {candidat.cvFileName && (
            <div className="flex items-center gap-2 text-xs text-[#2d6a4f] bg-[#d8f3dc] px-3 py-2 rounded-xl w-fit">
              <FileText className="w-3.5 h-3.5" />
              {candidat.cvFileName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page principale candidat ──────────────────
export default function MesCandidaturesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidatures,  setCandidatures]  = useState<Candidat[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('Tous');

  const filters = ['Tous', 'En cours', 'Action requise', 'Terminé'];

  // ── Chargement ──
  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        if (!user) return;

        const [resCand, resNotif] = await Promise.allSettled([
          candidatsService.mesCandidatures(),
          notificationsService.mesNotifications(),
        ]);

        if (resCand.status === 'fulfilled') {
          setCandidatures((resCand.value as any)?.data?.candidats ?? []);
        }
        if (resNotif.status === 'fulfilled') {
          setNotifications((resNotif.value as any)?.data?.notifications ?? []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, [user]);

  // ── Marquer notification lue ──
  const dismissNotif = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
    try { await notificationsService.marquerLue(id); } catch {}
  };

  // ── Filtres ──
  const filtered = candidatures.filter(c => {
    if (filter === 'En cours')
      return ['SOUMIS', 'PRESELECTION', 'QUIZ_COMPLETE', 'ENTRETIEN'].includes(c.statut);
    if (filter === 'Action requise')
      return c.statut === 'QUIZ_EN_ATTENTE';
    if (filter === 'Terminé')
      return ['EMBAUCHE', 'REFUSE', 'OFFRE'].includes(c.statut);
    return true;
  });

  // ── Stats ──
  const stats = {
    total:    candidatures.length,
    enCours:  candidatures.filter(c => !['EMBAUCHE','REFUSE','OFFRE'].includes(c.statut)).length,
    action:   candidatures.filter(c => c.statut === 'QUIZ_EN_ATTENTE').length,
    termine:  candidatures.filter(c => ['EMBAUCHE','REFUSE','OFFRE'].includes(c.statut)).length,
  };

  return (
    <Layout searchPlaceholder="Rechercher...">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Mes Candidatures</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Suivez l'état de vos candidatures et actions requises
          </p>
        </div>

        {/* Notifications */}
        <NotificationBanner notifications={notifications} onDismiss={dismissNotif} />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total',           value: stats.total,   emoji: '📋', color: 'bg-[#f5f0e8]' },
            { label: 'En cours',        value: stats.enCours, emoji: '⏳', color: 'bg-blue-50'   },
            { label: 'Action requise',  value: stats.action,  emoji: '⚡', color: 'bg-indigo-50' },
            { label: 'Terminé',         value: stats.termine, emoji: '✅', color: 'bg-[#d8f3dc]' },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{s.emoji}</div>
              <div className="text-xl font-bold text-[#1a1a1a]">{s.value}</div>
              <div className="text-xs text-[#6b7280] font-medium">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1 w-fit mb-6">
          {filters.map(f => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-[#2d6a4f] text-white shadow-sm'
                  : 'text-[#6b7280] hover:text-[#374151]'
              }`}
            >
              {f}
              {f === 'Action requise' && stats.action > 0 && (
                <span className="ml-1.5 bg-white/30 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {stats.action}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5e0d8] p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 bg-gray-100 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-100 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-28" />
                  </div>
                  <div className="h-6 bg-gray-100 rounded-full w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-[#e5e0d8]">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="font-semibold text-[#1a1a1a] mb-2">Aucune candidature</h3>
            <p className="text-sm text-[#6b7280] mb-4">
              {filter !== 'Tous'
                ? 'Aucune candidature dans cette catégorie'
                : "Vous n'avez pas encore postulé à des offres"}
            </p>
            {filter === 'Tous' && (
              <button
                onClick={() => navigate('/offres')}
                className="bg-[#2d6a4f] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1b4332] transition-colors"
              >
                Voir les offres disponibles
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(c => <CandidatureCard key={c.id} candidat={c} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}