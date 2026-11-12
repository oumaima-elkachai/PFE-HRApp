// src/pages/admin/CandidaturesPage.tsx
//
// Vue centrée sur les candidats, complémentaire de RecruitmentPage qui
// est centrée sur les offres.
//
// Habillage repris de RecruitmentPipelinePage : palette pierre, accent
// #4a7c59, cartes arrondies.

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Download, Eye, Mail, Phone, Star, X,
  ChevronLeft, ChevronRight, LayoutGrid, List,
  Sparkles, Briefcase, AlertTriangle, Paperclip, Filter,
  CheckCircle2, Calendar, Video, MapPin,
  MessageSquare,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import ResultatsQuiz from '../../components/recrutement/ResultatsQuiz';
import api from '../../services/api';
import {
  LIBELLES_STATUT_CANDIDATURE,
  PIPELINE_RECRUTEMENT,
  libelle,
} from '../../types/domaine';
import type { StatutCandidature } from '../../types/domaine';
import Pagination from '../../components/ui/Pagination';
import {  useNavigate } from 'react-router-dom';


const FOND = 'transparent';

interface Candidature {
  id: string;
  offreId?: string;
  offreTitre?: string;
  posteVise?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  linkedin?: string | null;
  cvKey?: string | null;
  cvFileName?: string | null;
  lettreMotivation?: string;
  competences?: string[];
  niveauEtude?: string | null;
  experience?: string | null;
  scoreCV?: number;
  scoreQuiz?: number | null;
  scoreTotal?: number;
  recommendation?: string;
  analyseIA?: {
    competencesMatchees?: string[];
    competencesManquantes?: string[];
    pointsForts?: string[];
    pointsFaibles?: string[];
    resumeAnalyse?: string;
    niveauExperience?: string;
  };
  sourceAnalyse?: 'bedrock' | 'fallback';
  statut: StatutCandidature;
  historiqueStatuts?: { statut: string; date: string; commentaire?: string }[];
  entretien?: {
    date: string;
    heure: string;
    type: 'en_ligne' | 'sur_site';
    lien?: string;
    adresse?: string;
    notes?: string;
  };
  creeLe: string;
}

// Style uniquement : les libellés viennent de types/domaine.ts
const STYLE_STATUT: Record<string, { bg: string; text: string; dot: string }> = {
  SOUMIS:          { bg: 'bg-blue-50',      text: 'text-blue-600',   dot: 'bg-blue-400' },
  PRESELECTION:    { bg: 'bg-amber-50',     text: 'text-amber-600',  dot: 'bg-amber-400' },
  QUIZ_EN_ATTENTE: { bg: 'bg-orange-50',    text: 'text-orange-600', dot: 'bg-orange-400' },
  QUIZ_ENVOYE:     { bg: 'bg-indigo-50',    text: 'text-indigo-600', dot: 'bg-indigo-400' },
  QUIZ_TERMINE:    { bg: 'bg-cyan-50',      text: 'text-cyan-600',   dot: 'bg-cyan-400' },
  ENTRETIEN:       { bg: 'bg-purple-50',    text: 'text-purple-600', dot: 'bg-purple-400' },
  OFFRE:           { bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
  EMBAUCHE:        { bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
  REFUSE:          { bg: 'bg-red-50',       text: 'text-red-500',    dot: 'bg-red-400' },
};

const STYLE_DEFAUT = { bg: 'bg-stone-50', text: 'text-stone-500', dot: 'bg-stone-400' };

const styleStatut = (s: string) => STYLE_STATUT[s] ?? STYLE_DEFAUT;

// Chaque transition mérite son message : « statut mis à jour » ne dit
// pas au recruteur ce qui vient d'être déclenché.
const MESSAGES_STATUT: Record<string, string> = {
  SOUMIS: 'Candidature replacée en réception',
  PRESELECTION: 'Candidat présélectionné',
  QUIZ_EN_ATTENTE: 'Quiz généré et envoyé au candidat',
  QUIZ_ENVOYE: 'Quiz envoyé au candidat',
  QUIZ_TERMINE: 'Quiz marqué comme passé',
  OFFRE: 'Offre émise, candidat notifié',
  EMBAUCHE: 'Recrutement confirmé',
  REFUSE: 'Candidature refusée, candidat informé',
};

const couleurScore = (s?: number) =>
  s == null ? 'text-stone-400'
    : s >= 75 ? 'text-brand-texte'
    : s >= 50 ? 'text-amber-500'
    : 'text-red-400';

const barreScore = (s: number) =>
  s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-400';

function initiales(prenom: string, nom: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();
}

function dateRelative(iso: string) {
  const heures = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (heures < 1) return "à l'instant";
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 7) return `il y a ${jours} j`;
  return `il y a ${Math.floor(jours / 7)} sem.`;
}

// Date du jour sans conversion UTC : toISOString décalerait d'un jour
// entre minuit et 1 h du matin en Tunisie.
function dateAujourdhui(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Téléchargement du CV ───────────────────────────────────────────
// Le fichier ne transite jamais par un lien direct : sans en-tête
// d'autorisation, la passerelle rejetterait la requête.
async function telechargerCv(candidature: Candidature) {
  const res = await api.get(`/candidatures/${candidature.id}/cv`, {
    responseType: 'blob',
  }) as unknown as Blob;

  if (res.type.includes('json')) {
    const texte = await res.text();
    throw new Error(JSON.parse(texte)?.erreur ?? 'CV indisponible');
  }

  const url = URL.createObjectURL(res);
  const a = document.createElement('a');
  a.href = url;
  a.download = candidature.cvFileName ?? `CV_${candidature.nom}_${candidature.prenom}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Notification ───────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-60">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-70">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Carte de candidat, vue pipeline ────────────────────────────────
function CarteCandidat({ candidature, onVoir }: {
  candidature: Candidature;
  onVoir: () => void;
}) {
  const estOffre = candidature.statut === 'OFFRE' || candidature.statut === 'EMBAUCHE';

  return (
    <div
      onClick={onVoir}
      className={`p-4 rounded-2xl shadow-sm border hover:shadow-md transition-shadow cursor-pointer ${
        estOffre ? 'bg-brand-500/5 border-brand-500/20' : 'bg-surface border-stone-100'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
          estOffre ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-texte'
        }`}>
          {initiales(candidature.prenom, candidature.nom)}
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded bg-stone-50 text-stone-500">
          {dateRelative(candidature.creeLe)}
        </span>
      </div>

      <h4 className="font-bold text-stone-800 leading-tight">
        {candidature.prenom} {candidature.nom}
      </h4>
      <p className="text-xs text-brand-texte font-semibold mt-1">
        {candidature.offreTitre ?? candidature.posteVise ?? 'Candidature spontanée'}
      </p>

      {!candidature.offreId && (
        <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-500">
          Spontanée
        </span>
      )}

      {/* L'entretien planifié est l'information qui conditionne l'action
          suivante du recruteur : elle mérite d'apparaître sur la carte. */}
      {candidature.entretien?.date && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 rounded-lg px-2 py-1.5">
          {candidature.entretien.type === 'en_ligne'
            ? <Video className="w-3.5 h-3.5" />
            : <MapPin className="w-3.5 h-3.5" />}
          <span className="font-medium">
            {new Date(candidature.entretien.date).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'short',
            })} à {candidature.entretien.heure}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between pt-3 border-t border-stone-100">
        <div className="flex items-center gap-1">
          <Star className={`w-3.5 h-3.5 ${couleurScore(candidature.scoreTotal)}`} fill="currentColor" />
          <span className="text-xs font-bold text-stone-600">
            {candidature.scoreTotal ?? candidature.scoreCV ?? '—'}/100
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-brand-texte font-medium">
          <Eye className="w-3 h-3" />
          Ouvrir
        </div>
      </div>
    </div>
  );
}

// ── Dossier d'un candidat ──────────────────────────────────────────
function DossierCandidat({
  candidature, index, total, onPrecedent, onSuivant, onClose, onTermine,
}: {
  candidature: Candidature;
  index: number;
  total: number;
  onPrecedent: () => void;
  onSuivant: () => void;
  onClose: () => void;
  onTermine: (message: string) => void;
}) {
  const [statut, setStatut] = useState<string>(candidature.statut);
  const [commentaire, setCommentaire] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState('');

  // Le passage en entretien exige une date et une modalité : sans
  // elles, le candidat reçoit une notification sans contenu.
  const [entretien, setEntretien] = useState({
    date: '',
    heure: '10:00',
    type: 'en_ligne' as 'en_ligne' | 'sur_site',
    lien: '',
    adresse: '',
    notes: '',
  });

  const passageEnEntretien = statut === 'ENTRETIEN' && candidature.statut !== 'ENTRETIEN';

  // Le dossier change quand on navigue : l'état local doit suivre
  useEffect(() => {
    setStatut(candidature.statut);
    setCommentaire('');
    setMessage('');
    setEntretien({
      date: candidature.entretien?.date ?? '',
      heure: candidature.entretien?.heure ?? '10:00',
      type: candidature.entretien?.type ?? 'en_ligne',
      lien: candidature.entretien?.lien ?? '',
      adresse: candidature.entretien?.adresse ?? '',
      notes: candidature.entretien?.notes ?? '',
    });
  }, [candidature.id, candidature.statut]);

  const analyse = candidature.analyseIA ?? {};

  const handleCv = async () => {
    try {
      setMessage('');
      await telechargerCv(candidature);
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  

  const handleStatut = async () => {
    if (passageEnEntretien && !entretien.date) {
      setMessage("Indiquez la date de l'entretien");
      return;
    }

    setEnregistrement(true);
    setMessage('');
    try {
      if (passageEnEntretien) {
        // Route dédiée : elle crée l'entretien, met le statut à jour
        // et notifie le candidat en une seule opération.
        await api.put(`/candidatures/${candidature.id}/entretien`, {
          entretien,
          statut: 'ENTRETIEN',
          notifier: true,
        });
        onTermine(
          `Entretien planifié le ${new Date(entretien.date).toLocaleDateString('fr-FR')}`
          + ` à ${entretien.heure}, candidat notifié`
        );
      } else {
        await api.put(`/candidatures/${candidature.id}/statut`, { statut, commentaire });
        onTermine(MESSAGES_STATUT[statut] ?? 'Statut mis à jour');
      }
    } catch (e: any) {
      setMessage(e?.erreur ?? 'Erreur lors de la mise à jour');
      setEnregistrement(false);
    }
  };

  const navigate = useNavigate();
  const champ = 'w-full px-3 py-2 text-sm bg-surface border border-stone-200 rounded-xl focus:outline-none focus:border-purple-400';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold bg-brand-500/10 text-brand-texte shrink-0">
              {initiales(candidature.prenom, candidature.nom)}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-stone-800 truncate">
                {candidature.prenom} {candidature.nom}
              </h2>
              <p className="text-sm text-stone-500 truncate">
                {candidature.offreTitre ?? candidature.posteVise ?? 'Candidature spontanée'}
              </p>
            </div>
          </div>

          {/* Navigation entre dossiers : dépouiller une pile de
              candidatures sans repasser par la liste à chaque fois. */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onPrecedent}
              disabled={index === 0}
              className="p-2 rounded-xl hover:bg-stone-50 disabled:opacity-30 transition-colors"
              title="Candidat précédent"
            >
              <ChevronLeft className="w-4 h-4 text-stone-500" />
            </button>
            <span className="text-xs tabular-nums text-stone-500 px-1">
              {index + 1} / {total}
            </span>
            <button
              onClick={onSuivant}
              disabled={index >= total - 1}
              className="p-2 rounded-xl hover:bg-stone-50 disabled:opacity-30 transition-colors"
              title="Candidat suivant"
            >
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-50 ms-1 transition-colors">
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {message && (
            <div className="text-sm rounded-xl px-4 py-2.5 bg-amber-50 text-amber-700">
              {message}
            </div>
          )}

          {/* Infos de base */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Email', candidature.email, Mail],
              ['Téléphone', candidature.telephone || '—', Phone],
              ['Niveau', candidature.niveauEtude || '—', Briefcase],
              ['Expérience', candidature.experience || '—', Briefcase],
            ] as [string, string, any][]).map(([label, valeur, Icone]) => (
              <div key={label} className="bg-stone-50 rounded-xl p-3">
                <div className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                  <Icone className="w-3 h-3" />
                  {label}
                </div>
                <div className="text-sm font-medium text-stone-800 truncate">{valeur}</div>
              </div>
            ))}
          </div>

          {/* Scores */}
          <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-brand-texte" fill="currentColor" />
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Scores
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['Score CV', candidature.scoreCV],
                ['Score quiz', candidature.scoreQuiz],
                ['Score global', candidature.scoreTotal],
              ] as [string, number | null | undefined][]).map(([label, valeur]) => (
                <div key={label} className="bg-surface rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-stone-800">
                    {valeur ?? '—'}
                    <span className="text-sm text-stone-500 font-normal">/100</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">{label}</div>
                  {valeur != null && (
                    <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${barreScore(valeur)}`}
                        style={{ width: `${valeur}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCv}
              disabled={!candidature.cvKey}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
              title={candidature.cvKey ? 'Télécharger le CV' : 'Aucun CV enregistré'}
            >
              <Download className="w-3.5 h-3.5" />
              {candidature.cvKey ? 'Télécharger le CV' : 'CV non disponible'}
            </button>
                        <button
              onClick={() => navigate(`/messages/${candidature.id}`)}
              className="flex items-center gap-1.5 bg-surface border border-stone-200 text-stone-600 px-4 py-2 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Écrire au candidat
            </button>

            {candidature.linkedin && (
              <a
                href={candidature.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-surface border border-stone-200 text-stone-600 px-4 py-2 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Profil LinkedIn
              </a>
            )}

            {candidature.cvFileName && (
              <div className="flex items-center gap-1.5 text-xs text-brand-texte bg-brand-500/10 px-3 py-2 rounded-xl">
                <Paperclip className="w-3.5 h-3.5" />
                {candidature.cvFileName}
              </div>
            )}
          </div>

          {/* Entretien déjà planifié */}
          {candidature.entretien?.date && !passageEnEntretien && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm text-purple-700 font-medium mb-1">
                <Calendar className="w-4 h-4" />
                Entretien {candidature.entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'}
                {' — '}
                {new Date(candidature.entretien.date).toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })} à {candidature.entretien.heure}
              </div>
              {candidature.entretien.lien && (
                <a
                  href={candidature.entretien.lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:underline break-all"
                >
                  {candidature.entretien.lien}
                </a>
              )}
              {candidature.entretien.adresse && (
                <div className="text-xs text-purple-600">{candidature.entretien.adresse}</div>
              )}
            </div>
          )}

          {/* Analyse du CV */}
          {candidature.scoreCV != null && (
            <div className="bg-stone-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Analyse du CV
                </span>
                {candidature.sourceAnalyse === 'fallback' ? (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    Analyse dégradée
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                    <Sparkles className="w-3 h-3" />
                    Analysé par IA
                  </span>
                )}
              </div>

              {analyse.resumeAnalyse && (
                <p className="text-sm italic text-stone-600 ps-3 border-s-2 border-brand-500 mb-3">
                  {analyse.resumeAnalyse}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(analyse.competencesMatchees ?? []).map((c) => (
                  <span key={c} className="text-xs bg-green-50 text-green-600 px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
                {(analyse.competencesManquantes ?? []).map((c) => (
                  <span key={c} className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Compétences déclarées */}
          {(candidature.competences?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Compétences déclarées</div>
              <div className="flex flex-wrap gap-1.5">
                {candidature.competences!.map((c, i) => (
                  <span key={i} className="text-xs bg-brand-500/10 text-brand-texte px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lettre de motivation */}
          {candidature.lettreMotivation && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Lettre de motivation</div>
              <p className="text-xs text-stone-700 bg-stone-50 rounded-xl p-3 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line custom-scrollbar">
                {candidature.lettreMotivation}
              </p>
            </div>
          )}

          {/* Évaluation technique */}
          <div className="border-t border-stone-100 pt-4">
            <div className="text-xs font-medium text-stone-500 mb-3">Évaluation technique</div>
            <ResultatsQuiz candidatureId={candidature.id} />
          </div>

          {/* Historique */}
          {(candidature.historiqueStatuts?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Historique</div>
              <div className="space-y-2 max-h-28 overflow-y-auto custom-scrollbar">
                {[...(candidature.historiqueStatuts ?? [])].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-stone-800">
                        {LIBELLES_STATUT_CANDIDATURE[h.statut as StatutCandidature] ?? h.statut}
                      </span>
                      {h.commentaire && <span className="text-stone-500 ms-1">— {h.commentaire}</span>}
                      <div className="text-stone-400">
                        {new Date(h.date).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Faire avancer */}
          <div className="border-t border-stone-100 pt-4">
            <div className="text-xs font-medium text-stone-500 mb-3">
              Faire avancer dans le pipeline
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[...PIPELINE_RECRUTEMENT, 'REFUSE' as StatutCandidature].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatut(s)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                    statut === s
                      ? 'bg-brand-500 text-white border-brand-500'
                      : s === 'REFUSE'
                        ? 'bg-surface text-red-500 border-red-200 hover:border-red-400'
                        : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500'
                  }`}
                >
                  {LIBELLES_STATUT_CANDIDATURE[s]}
                </button>
              ))}
            </div>

            {/* Le formulaire d'entretien n'apparaît que sur la
                transition qui l'exige, pas en permanence. */}
            {passageEnEntretien && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                  <Calendar className="w-4 h-4" />
                  Détails de l'entretien
                </div>

                <div className="flex gap-2">
                  {([
                    ['en_ligne', 'En ligne', Video],
                    ['sur_site', 'Sur site', MapPin],
                  ] as ['en_ligne' | 'sur_site', string, any][]).map(([cle, label, Icone]) => (
                    <button
                      key={cle}
                      type="button"
                      onClick={() => setEntretien({ ...entretien, type: cle })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                        entretien.type === cle
                          ? 'bg-purple-100 text-purple-700 border-purple-300'
                          : 'bg-surface text-stone-500 border-stone-200 hover:border-purple-300'
                      }`}
                    >
                      <Icone className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Date *</label>
                    <input
                      type="date"
                      value={entretien.date}
                      min={dateAujourdhui()}
                      onChange={(e) => setEntretien({ ...entretien, date: e.target.value })}
                      className={champ}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Heure *</label>
                    <input
                      type="time"
                      value={entretien.heure}
                      onChange={(e) => setEntretien({ ...entretien, heure: e.target.value })}
                      className={champ}
                    />
                  </div>
                </div>

                {entretien.type === 'en_ligne' ? (
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">
                      Lien de visioconférence
                    </label>
                    <input
                      type="url"
                      value={entretien.lien}
                      onChange={(e) => setEntretien({ ...entretien, lien: e.target.value })}
                      placeholder="https://meet.google.com/…"
                      className={champ}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Adresse</label>
                    <input
                      value={entretien.adresse}
                      onChange={(e) => setEntretien({ ...entretien, adresse: e.target.value })}
                      placeholder="Siège HR UP, Tunis…"
                      className={champ}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-stone-500 mb-1">
                    Instructions pour le candidat
                  </label>
                  <textarea
                    value={entretien.notes}
                    onChange={(e) => setEntretien({ ...entretien, notes: e.target.value })}
                    rows={2}
                    placeholder="Documents à apporter, personnes présentes…"
                    className={`${champ} resize-none`}
                  />
                </div>
              </div>
            )}

            {!passageEnEntretien && (
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={2}
                placeholder="Commentaire (optionnel)…"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 resize-none mb-3"
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={handleStatut}
                disabled={enregistrement || statut === candidature.statut}
                className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {enregistrement && (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {enregistrement ? 'Enregistrement…'
                  : passageEnEntretien ? 'Planifier et notifier'
                  : 'Mettre à jour'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
type Affichage = 'tableau' | 'pipeline';

export default function CandidaturesPage() {
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<string>('tous');
  const [scoreMin, setScoreMin] = useState(0);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [affichage, setAffichage] = useState<Affichage>('pipeline');
  const [indexOuvert, setIndexOuvert] = useState<number | null>(null);
  const [toast, setToast] = useState('');


  const [page, setPage] = useState(0);
  const taillePage  = 10;

   

  const charger = async () => {
    try {
      setChargement(true);
      const res = await api.get('/candidatures') as any;
      setCandidatures(res?.data?.candidatures ?? []);
    } catch (e) {
      console.error('Chargement des candidatures :', e);
      setCandidatures([]);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  
  

  // Le filtrage est mémorisé : il s'exécuterait sinon à chaque frappe
  // dans le champ de recherche, sur toute la liste.
  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return candidatures
      .filter((c) => {
        const texte = `${c.prenom} ${c.nom} ${c.email} ${c.offreTitre ?? ''}`.toLowerCase();
        if (terme && !texte.includes(terme)) return false;
        if (filtreStatut !== 'tous' && c.statut !== filtreStatut) return false;
        if (scoreMin > 0 && (c.scoreTotal ?? 0) < scoreMin) return false;
        return true;
      })
      .sort((a, b) => (b.scoreTotal ?? 0) - (a.scoreTotal ?? 0));
  }, [candidatures, recherche, filtreStatut, scoreMin]);

  const stats = useMemo(() => ({
    total: candidatures.length,
    spontanees: candidatures.filter((c) => !c.offreId).length,
    entretiens: candidatures.filter((c) => c.statut === 'ENTRETIEN').length,
  }), [candidatures]);

  const filtresActifs = filtreStatut !== 'tous' || scoreMin > 0;
    const pageCourante = useMemo(
    () => filtrees.slice(page * taillePage, (page + 1) * taillePage),
    [filtrees, page, taillePage]
  );

  // Un filtre qui réduit la liste doit ramener à la première page :
  // rester sur la page 4 d'un résultat qui n'en compte plus qu'une
  // afficherait un tableau vide.
  useEffect(() => { setPage(0); }, [recherche, filtreStatut, scoreMin]);
  

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un candidat…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Recrutement</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Candidatures</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Candidatures</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtrees.length} candidature{filtrees.length > 1 ? 's' : ''} sur {stats.total}
                  {stats.spontanees > 0 && ` · ${stats.spontanees} spontanée${stats.spontanees > 1 ? 's' : ''}`}
                  {stats.entretiens > 0 && ` · ${stats.entretiens} en entretien`}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher…"
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={() => setFiltresOuverts(!filtresOuverts)}
              className={`flex items-center gap-2 px-4 py-2 bg-surface border rounded-xl font-semibold transition-colors shadow-sm ${
                filtresOuverts || filtresActifs
                  ? 'border-brand-500 text-brand-texte'
                  : 'border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtrer
              {filtresActifs && (
                <span className="bg-brand-500 text-white text-[10px] font-bold px-1.5 rounded-full">
                  {(filtreStatut !== 'tous' ? 1 : 0) + (scoreMin > 0 ? 1 : 0)}
                </span>
              )}
            </button>

            <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1 shadow-sm">
              {([['tableau', List], ['pipeline', LayoutGrid]] as [Affichage, any][]).map(([mode, Icone]) => (
                <button
                  key={mode}
                  onClick={() => setAffichage(mode)}
                  className={`p-2 rounded-lg transition-colors ${
                    affichage === mode ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                  }`}
                  title={mode === 'tableau' ? 'Vue tableau' : 'Vue pipeline'}
                >
                  <Icone className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* Les filtres apparaissent à la demande : les afficher en
              permanence encombre la vue pour un usage occasionnel. */}
          {filtresOuverts && (
            <div className="flex justify-end mb-6">
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
                <div className="flex items-end gap-4">

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Statut
                    </label>
                    <select
                      value={filtreStatut}
                      onChange={(e) => setFiltreStatut(e.target.value)}
                      className={`px-3 py-2 rounded-xl border text-sm bg-stone-50 focus:outline-none transition-colors ${
                        filtreStatut !== 'tous'
                          ? 'border-brand-500 text-brand-texte font-medium'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      <option value="tous">Tous les statuts</option>
                      {Object.entries(LIBELLES_STATUT_CANDIDATURE).map(([cle, label]) => (
                        <option key={cle} value={cle}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Score minimum
                    </label>
                    <select
                      value={scoreMin}
                      onChange={(e) => setScoreMin(Number(e.target.value))}
                      className={`px-3 py-2 rounded-xl border text-sm bg-stone-50 focus:outline-none transition-colors ${
                        scoreMin > 0
                          ? 'border-brand-500 text-brand-texte font-medium'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      <option value={0}>Tous les scores</option>
                      <option value={50}>Score ≥ 50</option>
                      <option value={65}>Score ≥ 65</option>
                      <option value={80}>Score ≥ 80</option>
                    </select>
                  </div>

                  {(filtresActifs || recherche) && (
                    <button
                      onClick={() => { setFiltreStatut('tous'); setScoreMin(0); setRecherche(''); }}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Réinitialiser
                    </button>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* ── Contenu ── */}
          {chargement ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-40" />
                      <div className="h-3 bg-stone-100 rounded w-28" />
                    </div>
                    <div className="h-6 bg-stone-100 rounded-full w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtrees.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="text-4xl mb-3 opacity-60">🔍</div>
              <p className="text-sm text-stone-500">
                {recherche
                  ? `Aucun résultat pour « ${recherche} »`
                  : filtresActifs ? 'Aucune candidature ne correspond aux filtres'
                  : 'Aucune candidature'}
              </p>
            </div>
          ) : affichage === 'tableau' ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    {['Candidat', 'Poste', 'CV', 'Quiz', 'Global', 'Statut', ''].map((h) => (
                      <th
                        key={h}
                        className="text-start px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                    {pageCourante.map((c) => {
                    const style = styleStatut(c.statut);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setIndexOuvert(filtrees.indexOf(c))}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold bg-brand-500/10 text-brand-texte shrink-0">
                              {initiales(c.prenom, c.nom)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-stone-800 truncate">
                                {c.prenom} {c.nom}
                              </div>
                              <div className="text-xs text-stone-400 truncate">{c.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-700">
                            {c.offreTitre ?? c.posteVise ?? '—'}
                          </span>
                          {!c.offreId && (
                            <span className="block text-xs text-stone-400">Spontanée</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${couleurScore(c.scoreCV)}`}>
                            {c.scoreCV ?? '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${couleurScore(c.scoreQuiz ?? undefined)}`}>
                            {c.scoreQuiz ?? '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-sm font-bold ${couleurScore(c.scoreTotal)}`}>
                            <Star className="w-3 h-3" fill="currentColor" />
                            {c.scoreTotal ?? '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {libelle(LIBELLES_STATUT_CANDIDATURE, c.statut)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <Eye className="w-4 h-4 text-stone-400" />
                        </td>
                      </tr>
                    );
                  })}
                                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={taillePage}
                total={filtrees.length}
                onPage={setPage}
                libelle="candidature"
                accent="#4F46E5"
              />
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar pb-4">
              <div className="flex gap-6 min-w-max">
                {PIPELINE_RECRUTEMENT.map((etape) => {
                  const colonne = filtrees.filter((c) => c.statut === etape);
                  const style = styleStatut(etape);

                  return (
                    <div key={etape} className="flex flex-col w-72">
                      <div className="flex items-center gap-2 mb-4 px-2">
                        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                        <h3 className="font-bold text-stone-700 uppercase text-xs tracking-widest">
                          {LIBELLES_STATUT_CANDIDATURE[etape]}
                        </h3>
                        <span className="bg-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {colonne.length}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {colonne.length === 0 ? (
                          <div className="border-2 border-dashed border-stone-200 rounded-xl p-6 text-center">
                            <p className="text-xs text-stone-400">Aucun candidat</p>
                          </div>
                        ) : (
                          colonne.map((c) => (
                            <CarteCandidat
                              key={c.id}
                              candidature={c}
                              onVoir={() => setIndexOuvert(filtrees.indexOf(c))}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {indexOuvert !== null && filtrees[indexOuvert] && (
          <DossierCandidat
            candidature={filtrees[indexOuvert]}
            index={indexOuvert}
            total={filtrees.length}
            onPrecedent={() => setIndexOuvert((i) => Math.max(0, (i ?? 0) - 1))}
            onSuivant={() => setIndexOuvert((i) => Math.min(filtrees.length - 1, (i ?? 0) + 1))}
            onClose={() => setIndexOuvert(null)}
            onTermine={(message) => {
              // La modale se ferme et la liste se recharge : le
              // recruteur enchaîne sans action supplémentaire.
              setToast(message);
              setIndexOuvert(null);
              charger();
            }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #DFE3F0;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}