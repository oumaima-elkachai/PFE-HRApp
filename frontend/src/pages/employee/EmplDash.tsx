// src/pages/employee/EmplDash.tsx

import { useState, useEffect } from 'react';
import {
  Clock, FileText, Calendar, Download, ArrowRight,
  Award, TrendingUp, Plus, X, CheckCircle2, XCircle, Hourglass,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { pointagesService } from '../../services/pointages';
import { facturesService } from '../../services/factures';
import { calendrierService } from '../../services/calendrier';
import { congesService, type Conge, type SoldeConges } from '../../services/conges';
import { LIBELLES_TYPE_CONGE, LIBELLES_STATUT_CONGE, libelle } from '../../types/domaine';
import type { StatutConge, TypeConge } from '../../types/domaine';
import { employesService } from '../../services/employes';
import api from '../../services/api';

// ── Palette ────────────────────────────────────────────────────────
const GREEN = '#2d6a4f';
const INK = '#1a1a1a';
const INK_SOFT = '#6b7280';
const BORDER = '#e5e0d8';
const BG_SOFT = '#f7f5f1';

// Style uniquement : le vocabulaire métier vient de types/domaine.ts
const STYLE_CONGE: Record<StatutConge, { bg: string; text: string; icon: any }> = {
  EN_ATTENTE: { bg: '#fef3c7', text: '#b45309', icon: Hourglass },
  APPROUVE:   { bg: '#d8f3dc', text: GREEN,     icon: CheckCircle2 },
  REFUSE:     { bg: '#fee2e2', text: '#dc2626', icon: XCircle },
};

const STYLE_CONGE_DEFAUT = { bg: '#f3f4f6', text: '#6b7280', icon: Hourglass };

/**
 * Date du jour au format AAAA-MM-JJ, dans le fuseau du navigateur.
 * toISOString() convertirait en UTC et décalerait d'un jour entre minuit
 * et 1 h du matin en Tunisie.
 */
function dateAujourdhui(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const heureCourte = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const jourCourt = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ── Composants partagés ────────────────────────────────────────────
function Section({ title, icon: Icon, action, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-2xl p-6" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold flex items-center gap-2 text-[15px]" style={{ color: INK }}>
          {Icon && <Icon className="w-4 h-4" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="text-center py-10">
      <div className="text-3xl mb-2 opacity-60">{emoji}</div>
      <p className="text-sm" style={{ color: INK_SOFT }}>{text}</p>
    </div>
  );
}

function Skeleton({ count = 3, h = 'h-14' }: { count?: number; h?: string }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${h} rounded-xl animate-pulse`} style={{ backgroundColor: BG_SOFT }} />
      ))}
    </div>
  );
}

function Badge({ icon: Icon, label, achieved }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  achieved: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: achieved ? GREEN : '#e5e5e5' }}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <span className="text-sm" style={{ color: achieved ? INK : '#9ca3af' }}>{label}</span>
      {achieved && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: GREEN }} />}
    </div>
  );
}

function ProgressBar({ label, value, suffix = '%' }: { label: string; value: number; suffix?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm" style={{ color: INK_SOFT }}>{label}</span>
        <span className="text-sm font-semibold" style={{ color: GREEN }}>
          {Math.round(value)}{suffix}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: BG_SOFT }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: GREEN }}
        />
      </div>
    </div>
  );
}

// ── Modale de demande ──────────────────────────────────────────────
function ModalDemandeConge({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<{
    type: TypeConge;
    dateDebut: string;
    dateFin: string;
    motif: string;
  }>({ type: 'annuel', dateDebut: '', dateFin: '', motif: '' });

  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.dateDebut || !form.dateFin) {
      setErreur('Sélectionnez les dates de début et de fin');
      return;
    }
    // Comparaison lexicographique : exacte sur le format AAAA-MM-JJ
    if (form.dateFin < form.dateDebut) {
      setErreur('La date de fin doit suivre la date de début');
      return;
    }

    setLoading(true);
    setErreur('');
    try {
      await congesService.demander(form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || err?.message || 'Erreur lors de la demande');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-1';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: BORDER }}>
          <h2 className="font-semibold text-lg" style={{ color: INK }}>Demander un congé</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-xl">
            <X className="w-5 h-5" style={{ color: INK_SOFT }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="text-sm rounded-xl px-4 py-3" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: INK_SOFT }}>
              Type de congé
            </label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as TypeConge })}
              className={inputCls}
              style={{ borderColor: BORDER, backgroundColor: BG_SOFT }}
            >
              {(Object.keys(LIBELLES_TYPE_CONGE) as TypeConge[]).map(t => (
                <option key={t} value={t}>{LIBELLES_TYPE_CONGE[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: INK_SOFT }}>Du</label>
              <input
                type="date"
                value={form.dateDebut}
                onChange={e => setForm({ ...form, dateDebut: e.target.value })}
                className={inputCls}
                style={{ borderColor: BORDER, backgroundColor: BG_SOFT }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: INK_SOFT }}>Au</label>
              <input
                type="date"
                value={form.dateFin}
                min={form.dateDebut || undefined}
                onChange={e => setForm({ ...form, dateFin: e.target.value })}
                className={inputCls}
                style={{ borderColor: BORDER, backgroundColor: BG_SOFT }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: INK_SOFT }}>
              Motif (optionnel)
            </label>
            <textarea
              value={form.motif}
              onChange={e => setForm({ ...form, motif: e.target.value })}
              rows={3}
              className={`${inputCls} resize-none`}
              style={{ borderColor: BORDER, backgroundColor: BG_SOFT }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              style={{ borderColor: BORDER, color: INK }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 text-white rounded-xl py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: GREEN }}
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pointageActif, setPointageActif] = useState(false);
  const [heureArrivee, setHeureArrivee] = useState<string | null>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [conges, setConges] = useState<Conge[]>([]);
  const [solde, setSolde] = useState<SoldeConges | null>(null);
  const [loading, setLoading] = useState(true);
  const [ptLoading, setPtLoading] = useState(false);
  const [flash, setFlash] = useState('');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [ficheEmploye, setFicheEmploye] = useState<any>(null);

  const montrerFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const chargerConges = async () => {
    try {
      const res = await congesService.lister();
      setConges(res?.data?.conges ?? []);
      setSolde(res?.data?.solde ?? null);
    } catch (e) {
      console.error('Chargement des congés :', e);
    }
  };

  useEffect(() => {
    const charger = async () => {
      try {
          const [facRes, evRes, ptRes, congesRes, ficheRes] = await Promise.all([
          facturesService.lister() as any,
          calendrierService.lister() as any,
          pointagesService.historique({ date: dateAujourdhui() }) as any,
          congesService.lister(),
          user?.employeId
            ? (employesService.detail(user.employeId) as any).catch(() => null)
            : Promise.resolve(null),
        ]);

        setFicheEmploye(ficheRes?.data?.employe ?? null);

        // Le serveur filtre déjà sur le compte connecté : re-filtrer ici
        // comparerait à un identifiant différent et viderait la liste.
        setFactures((facRes?.data?.factures ?? []).slice(0, 5));
        setEvenements((evRes?.data?.evenements ?? []).slice(0, 4));
        setConges(congesRes?.data?.conges ?? []);
        setSolde(congesRes?.data?.solde ?? null);

        const enCours = (ptRes?.data?.pointages ?? []).find((p: any) => p.statut === 'EN_COURS');
        if (enCours) {
          setPointageActif(true);
          setHeureArrivee(heureCourte(enCours.heureArrivee));
        }
      } catch (e) {
        console.error('Chargement du tableau de bord :', e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, [user?.sub]);

  const handlePointage = async () => {
    setPtLoading(true);
    try {
      if (!pointageActif) {
        await pointagesService.arrivee();
        setPointageActif(true);
        setHeureArrivee(heureCourte(new Date().toISOString()));
        montrerFlash('Arrivée enregistrée');
      } else {
        await pointagesService.depart();
        setPointageActif(false);
        setHeureArrivee(null);
        montrerFlash('Départ enregistré');
      }
    } catch (e: any) {
      montrerFlash(e?.erreur || 'Erreur lors du pointage');
    } finally {
      setPtLoading(false);
    }
  };

  const heure = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';

  // ── Indicateurs, calculés sur le dernier bulletin ────────────────
  const derniereFacture = factures[0];
  const nbOuvrables   = derniereFacture?.nbJoursOuvrables ?? derniereFacture?.nbOuvrables ?? 0;
  const joursPresents = derniereFacture?.joursPresents ?? 0;
  const joursAbsents  = derniereFacture?.joursAbsents ?? 0;
  const retardMin     = derniereFacture?.minutesRetard ?? derniereFacture?.totalRetardMin ?? 0;

  const tauxAssiduite   = nbOuvrables > 0 ? (joursPresents / nbOuvrables) * 100 : 0;
  const tauxPonctualite = Math.max(0, 100 - retardMin / 2);

  const anneeEmbauche = ficheEmploye?.dateEmbauche
    ? new Date(ficheEmploye.dateEmbauche).getFullYear()
    : new Date().getFullYear();
  const anciennete = new Date().getFullYear() - anneeEmbauche;
  const anciennetePct = Math.min(100, (anciennete / 3) * 100);

  const badges = [
    { icon: CheckCircle2, label: `Assidu — ${Math.round(tauxAssiduite)} % de présence`, achieved: tauxAssiduite >= 90 },
    { icon: Clock,        label: `Ponctuel — ${retardMin} min de retard cumulé`,        achieved: retardMin < 30 },
    { icon: Award,        label: 'Aucune absence ce mois-ci',                           achieved: joursAbsents === 0 && !!derniereFacture },
    { icon: TrendingUp,   label: `${anciennete} an(s) d'ancienneté`,                    achieved: anciennete >= 1 },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {flash && (
          <div
            className="fixed top-20 right-6 z-50 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm"
            style={{ backgroundColor: GREEN }}
          >
            {flash}
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: INK }}>
              {salutation}, {user?.prenom}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: INK_SOFT }}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm" style={{ color: INK_SOFT }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: pointageActif ? GREEN : '#d1d5db' }}
              />
              {pointageActif ? `En service depuis ${heureArrivee}` : 'Hors service'}
            </span>
            <button
              onClick={handlePointage}
              disabled={ptLoading}
              className="text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
              style={{ backgroundColor: pointageActif ? '#dc2626' : GREEN }}
            >
              {ptLoading
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Clock className="w-3.5 h-3.5" />}
              {pointageActif ? 'Départ' : 'Arrivée'}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <Section
            title="Mes fiches de paie"
            icon={FileText}
            action={factures.length > 0 && (
              <button
                onClick={() => navigate('/employe/factures')}
                className="flex items-center gap-1 text-xs font-medium hover:underline"
                style={{ color: GREEN }}
              >
                Voir tout <ArrowRight className="w-3 h-3" />
              </button>
            )}
          >
            {loading ? <Skeleton count={3} /> : factures.length === 0 ? (
              <EmptyState emoji="📄" text="Aucune fiche de paie disponible" />
            ) : (
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {factures.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium" style={{ color: INK }}>{f.moisLabel}</div>
                      <div className="text-xs font-mono" style={{ color: INK_SOFT }}>{f.numero}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm" style={{ color: GREEN }}>
                        {f.salaireNet?.toFixed(3)} TND
                      </span>
                      {/* Le PDF vit sur S3 (ou sur disque en local) : on passe
                          par l'API plutôt que par un base64 embarqué */}
                                            {f.pdfKey && (
                        <button
                          onClick={async () => {
                            try {
                              const blob = await api.get(
                                `/factures/pdf/${encodeURIComponent(f.id)}`,
                                { responseType: 'blob' }
                              ) as unknown as Blob;
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${f.numero}.pdf`;
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 5000);
                            } catch {
                              montrerFlash('Bulletin indisponible');
                            }
                          }}
                          className="p-1.5 hover:bg-gray-50 rounded-lg"
                          title="Télécharger le bulletin"
                        >
                          <Download className="w-3.5 h-3.5" style={{ color: GREEN }} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="grid grid-cols-2 gap-5">
            <Section title="Ma progression" icon={TrendingUp}>
              {loading ? <Skeleton count={3} h="h-6" /> : !derniereFacture ? (
                <EmptyState emoji="📊" text="Pas encore de données ce mois-ci" />
              ) : (
                <div className="space-y-4">
                  <ProgressBar label="Assiduité" value={tauxAssiduite} />
                  <ProgressBar label="Ponctualité" value={tauxPonctualite} />
                  <ProgressBar label="Ancienneté" value={anciennetePct} suffix="" />
                </div>
              )}
            </Section>

            <Section title="Mes badges" icon={Award}>
              {loading ? <Skeleton count={4} h="h-9" /> : (
                <div>{badges.map((b, i) => <Badge key={i} {...b} />)}</div>
              )}
            </Section>
          </div>

          <Section
            title="Congés et absences"
            icon={Calendar}
            action={
              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                <Plus className="w-3.5 h-3.5" /> Demander
              </button>
            }
          >
            {solde && (
              <div
                className="flex items-center justify-between p-4 rounded-xl mb-4"
                style={{ backgroundColor: BG_SOFT }}
              >
                <div>
                  <span className="text-xs" style={{ color: INK_SOFT }}>Solde de congés</span>
                  <div className="text-2xl font-semibold" style={{ color: INK }}>
                    {solde.restants}
                    <span className="text-sm font-normal" style={{ color: INK_SOFT }}>
                      {' '}/ {solde.total} jours
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs" style={{ color: INK_SOFT }}>
                  <div>{solde.utilises} jour{solde.utilises > 1 ? 's' : ''} pris</div>
                  {solde.enAttente > 0 && (
                    <div className="mt-0.5" style={{ color: '#b45309' }}>
                      {solde.enAttente} en attente · {solde.previsionnels} restants si accordés
                    </div>
                  )}
                </div>
              </div>
            )}

            {loading ? <Skeleton count={2} /> : conges.length === 0 ? (
              <EmptyState emoji="🌴" text="Aucune demande de congé" />
            ) : (
              <div className="space-y-2">
                {conges.slice(0, 4).map(c => {
                  const style = STYLE_CONGE[c.statut] ?? STYLE_CONGE_DEFAUT;
                  const StatutIcon = style.icon;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ backgroundColor: BG_SOFT }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: INK }}>
                          {libelle(LIBELLES_TYPE_CONGE, c.type)}
                        </div>
                        <div className="text-xs" style={{ color: INK_SOFT }}>
                          {jourCourt(c.dateDebut)} → {jourCourt(c.dateFin)} · {c.nbJours} j
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        <StatutIcon className="w-3.5 h-3.5" />
                        {libelle(LIBELLES_STATUT_CONGE, c.statut)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Prochains événements" icon={Calendar}>
            {loading ? <Skeleton count={3} h="h-10" /> : evenements.length === 0 ? (
              <EmptyState emoji="📅" text="Aucun événement à venir" />
            ) : (
              <div className="space-y-3">
                {evenements.map((ev: any) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-3 pl-3 border-l-2"
                    style={{ borderColor: GREEN }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: INK }}>{ev.titre}</div>
                      <div className="text-xs" style={{ color: INK_SOFT }}>
                        {new Date(ev.dateDebut).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {showLeaveModal && (
        <ModalDemandeConge
          onClose={() => setShowLeaveModal(false)}
          onSuccess={() => {
            montrerFlash('Demande de congé envoyée');
            chargerConges();
          }}
        />
      )}
    </Layout>
  );
}