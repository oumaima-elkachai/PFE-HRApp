import { useState, useEffect } from 'react';
import {
  FileText, CheckCircle2, XCircle, AlertTriangle,
  Clock, Loader2, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { quizService } from '../../services/quiz';

const GREEN = '#4338CA';
const INK = '#131729';
const INK_SOFT = '#656C86';
const BORDER = '#DFE3F0';
const BG_SOFT = '#F5F6FC';

interface ReponseCorrigee {
  questionId: string;
  type: 'QCM' | 'TEXTE';
  competenceEvaluee?: string | null;
  reponse: string | null;
  pointsMax: number;
  pointsObtenus: number;
  correct: boolean;
  pourcentage?: number;
  commentaire?: string | null;
  criteresSatisfaits?: string[];
}

interface Session {
  id: string;
  candidatNom: string;
  offreTitre?: string;
  statut: string;
  debutLe: string;
  finLe?: string;
  dureeReelleMinutes?: number;
  dureeMinutes: number;
  scoreObtenu?: number;
  pointsObtenus?: number;
  pointsMax?: number;
  reussi?: boolean;
  competences?: { nom: string; score: number }[];
  reponses?: ReponseCorrigee[];
  sourceEvaluation?: 'bedrock' | 'fallback' | 'aucune';
  nombreChangementsOnglet?: number;
  nombreCopierColler?: number;
  alertesIntegrite?: string[];
}

const couleurScore = (s: number) =>
  s >= 75 ? GREEN : s >= 50 ? '#ca8a04' : '#D4193C';

export default function ResultatsQuiz({ candidatureId }: { candidatureId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [deplie, setDeplie] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await quizService.sessionsCandidature(candidatureId) as any;
        setSessions(res?.data?.sessions ?? []);
      } catch (e: any) {
        setErreur(e?.erreur ?? 'Impossible de charger les résultats');
      } finally {
        setChargement(false);
      }
    })();
  }, [candidatureId]);

  if (chargement) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: INK_SOFT }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des résultats…
      </div>
    );
  }

  if (erreur) {
    return (
      <p className="text-sm py-4" style={{ color: '#D4193C' }}>{erreur}</p>
    );
  }

  if (sessions.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ borderColor: BORDER, backgroundColor: BG_SOFT }}
      >
        <FileText className="w-6 h-6 mx-auto mb-2" style={{ color: INK_SOFT }} />
        <p className="text-sm" style={{ color: INK_SOFT }}>
          Aucun quiz passé par ce candidat
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const score = session.scoreObtenu ?? 0;
        const ouvert = deplie === session.id;
        const enCours = session.statut === 'EN_COURS';

        return (
          <div key={session.id} className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>

            <div className="p-4" style={{ backgroundColor: BG_SOFT }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: INK }}>
                      {session.offreTitre || 'Évaluation technique'}
                    </span>
                    {enCours && (
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#dbeafe', color: '#2563eb' }}
                      >
                        En cours
                      </span>
                    )}
                    {session.statut === 'EXPIRE' && (
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#fef3c7', color: '#B45309' }}
                      >
                        Hors délai
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: INK_SOFT }}>
                    {new Date(session.debutLe).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                    {session.dureeReelleMinutes != null &&
                      ` · ${session.dureeReelleMinutes} min sur ${session.dureeMinutes} autorisées`}
                  </p>
                </div>

                {!enCours && (
                  <div className="text-end shrink-0">
                    <div className="text-2xl font-bold" style={{ color: couleurScore(score) }}>
                      {score}<span className="text-sm font-normal">/100</span>
                    </div>
                    <div className="text-xs flex items-center gap-1 justify-end" style={{ color: INK_SOFT }}>
                      {session.reussi
                        ? <><CheckCircle2 className="w-3 h-3" style={{ color: GREEN }} /> Réussi</>
                        : <><XCircle className="w-3 h-3" style={{ color: '#D4193C' }} /> Sous le seuil</>}
                    </div>
                  </div>
                )}
              </div>

              {/* Le detail par competence justifie la decision bien mieux
                  qu'un score global : il montre ou le candidat est fort. */}
              {session.competences && session.competences.length > 0 && (
                <div className="space-y-2 mb-3">
                  {session.competences.map((c) => (
                    <div key={c.nom}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: INK_SOFT }}>{c.nom}</span>
                        <span className="font-semibold" style={{ color: INK }}>{c.score}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#DFE3F0' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.score}%`, backgroundColor: couleurScore(c.score) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap text-xs">
                {/* Rend visible une correction degradee : sans cette
                    mention, un score calcule par repli passerait pour
                    une evaluation par le modele. */}
                {session.sourceEvaluation === 'fallback' && (
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-full font-medium"
                    style={{ backgroundColor: '#fef3c7', color: '#B45309' }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Questions ouvertes non évaluées par l'IA — relecture requise
                  </span>
                )}
                {session.sourceEvaluation === 'bedrock' && (
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-full font-medium"
                    style={{ backgroundColor: '#ede9fe', color: '#7c3aed' }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Questions ouvertes évaluées par IA
                  </span>
                )}

                {(session.alertesIntegrite ?? []).map((a) => (
                  <span
                    key={a}
                    className="flex items-center gap-1 px-2 py-1 rounded-full font-medium"
                    style={{ backgroundColor: '#fee2e2', color: '#D4193C' }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {a}
                  </span>
                ))}

                {session.nombreChangementsOnglet != null && (
                  <span style={{ color: INK_SOFT }}>
                    {session.nombreChangementsOnglet} sortie(s) de page ·{' '}
                    {session.nombreCopierColler ?? 0} collage(s)
                  </span>
                )}
              </div>
            </div>

            {!enCours && (session.reponses?.length ?? 0) > 0 && (
              <>
                <button
                  onClick={() => setDeplie(ouvert ? null : session.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-t hover:bg-gray-50 transition-colors"
                  style={{ borderColor: BORDER, color: GREEN }}
                >
                  {ouvert ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {ouvert ? 'Masquer' : 'Voir'} le détail des {session.reponses!.length} réponses
                </button>

                {ouvert && (
                  <div className="p-4 space-y-3 border-t" style={{ borderColor: BORDER }}>
                    {session.reponses!.map((r, i) => (
                      <div
                        key={r.questionId}
                        className="rounded-xl border p-3"
                        style={{
                          borderColor: r.correct ? '#bbf7d0' : '#fecaca',
                          backgroundColor: r.correct ? '#f0fdf4' : '#fef2f2',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className="text-xs font-semibold" style={{ color: INK }}>
                            Question {i + 1}
                            {r.competenceEvaluee && (
                              <span className="font-normal" style={{ color: INK_SOFT }}>
                                {' '}· {r.competenceEvaluee}
                              </span>
                            )}
                          </span>
                          <span
                            className="text-xs font-bold shrink-0"
                            style={{ color: r.correct ? GREEN : '#D4193C' }}
                          >
                            {r.pointsObtenus}/{r.pointsMax} pts
                            {r.pourcentage != null && ` (${r.pourcentage}%)`}
                          </span>
                        </div>

                        <div className="text-xs mb-1.5" style={{ color: INK_SOFT }}>
                          <span className="font-medium">Réponse : </span>
                          {r.reponse ?? <em>sans réponse</em>}
                        </div>

                        {r.commentaire && (
                          <p
                            className="text-xs italic ps-2 border-s-2"
                            style={{ color: INK_SOFT, borderColor: BORDER }}
                          >
                            {r.commentaire}
                          </p>
                        )}

                        {(r.criteresSatisfaits?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {r.criteresSatisfaits!.map((c) => (
                              <span
                                key={c}
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: '#dcfce7', color: '#10B981' }}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {enCours && (
              <div
                className="flex items-center gap-2 px-4 py-3 text-xs border-t"
                style={{ borderColor: BORDER, color: INK_SOFT }}
              >
                <Clock className="w-3.5 h-3.5" />
                Le candidat a commencé le quiz sans l'avoir soumis
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}