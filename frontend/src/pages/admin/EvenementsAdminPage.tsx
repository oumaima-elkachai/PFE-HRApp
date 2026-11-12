// src/pages/admin/EvenementsAdminPage.tsx
//
// Publication et suivi des événements. L'audience décide de qui voit
// quoi : un candidat ne verra jamais un événement réservé aux salariés.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Plus, X, Users, MapPin, Video, Pencil, Trash2, Ban,
  AlertCircle, Download, GraduationCap, PartyPopper, DoorOpen,
  Presentation, Building2, Lock, Search, SlidersHorizontal,
  ChevronRight, CheckCircle2, AlertTriangle, CalendarClock,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import api from '../../services/api';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 8;

type Audience = 'INTERNE' | 'PUBLIC' | 'MIXTE';

interface Participant {
  userId: string;
  email: string;
  nom: string;
  role: string;
  departement?: string | null;
  inscritLe: string;
}

interface Evenement {
  id: string;
  titre: string;
  description: string;
  type: string;
  typeLibelle: string;
  audience: Audience;
  dateDebut: string;
  dateFin: string;
  lieu?: string | null;
  adresse?: string | null;
  lienVisio?: string | null;
  capaciteMax?: number | null;
  dateLimiteInscription?: string | null;
  inscriptionRequise: boolean;
  obligatoire: boolean;
  organisateur?: string;
  departement?: string | null;
  participants?: Participant[];
  nbParticipants?: number;
  placesRestantes?: number | null;
  statut: string;
  motifAnnulation?: string;
}

const TYPES: Record<string, { libelle: string; icone: any; audience: Audience }> = {
  FORMATION:       { libelle: 'Formation',               icone: GraduationCap, audience: 'INTERNE' },
  SEMINAIRE:       { libelle: 'Séminaire',               icone: Presentation,  audience: 'INTERNE' },
  TEAM_BUILDING:   { libelle: "Cohésion d'équipe",       icone: Users,         audience: 'INTERNE' },
  REUNION:         { libelle: 'Réunion',                 icone: Building2,     audience: 'INTERNE' },
  FESTIVAL:        { libelle: 'Événement festif',        icone: PartyPopper,   audience: 'INTERNE' },
  PORTES_OUVERTES: { libelle: 'Journée portes ouvertes', icone: DoorOpen,      audience: 'PUBLIC' },
  SALON:           { libelle: 'Salon de recrutement',    icone: Users,         audience: 'PUBLIC' },
  WEBINAIRE:       { libelle: 'Webinaire',               icone: Video,         audience: 'MIXTE' },
};

const STYLE_AUDIENCE: Record<Audience, { libelle: string; court: string; bg: string; text: string }> = {
  INTERNE: { libelle: 'Salariés uniquement',   court: 'Interne', bg: 'bg-blue-50',      text: 'text-blue-600' },
  MIXTE:   { libelle: 'Salariés et candidats', court: 'Mixte',   bg: 'bg-purple-50',    text: 'text-purple-600' },
  PUBLIC:  { libelle: 'Candidats et public',   court: 'Public',  bg: 'bg-brand-500/10', text: 'text-brand-texte' },
};

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

// L'entree du formulaire est en heure locale : la conversion vers
// l'ISO ne se fait qu'a l'envoi, sinon le champ afficherait l'heure
// UTC au rechargement.
const versChampLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const estPasse = (iso: string) => new Date(iso).getTime() < Date.now();

// ── Composants partagés ────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, fond, texte }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  fond: string;
  texte: string;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

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

// ── Confirmation avec motif ────────────────────────────────────────
// Le prompt() et le confirm() natifs affichent les boîtes du
// navigateur, étrangères au design et impossibles à styler.
function ModalConfirmation({
  titre, message, libelleAction, avecMotif, destructif, onConfirmer, onAnnuler,
}: {
  titre: string;
  message: string;
  libelleAction: string;
  avecMotif?: boolean;
  destructif?: boolean;
  onConfirmer: (motif: string) => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const confirmer = async () => {
    if (avecMotif && !motif.trim()) {
      setErreur('Le motif sera transmis aux inscrits : il est requis.');
      return;
    }
    setEnvoi(true);
    await onConfirmer(motif.trim());
    setEnvoi(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            destructif ? 'bg-red-50' : 'bg-amber-50'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${destructif ? 'text-red-500' : 'text-amber-500'}`} />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">{titre}</h2>
            <p className="text-sm text-stone-500 mt-1">{message}</p>
          </div>
        </div>

        {avecMotif && (
          <div className="mb-4">
            <textarea
              value={motif}
              onChange={(e) => { setMotif(e.target.value); setErreur(''); }}
              rows={2}
              placeholder="Motif communiqué aux inscrits…"
              className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl resize-none focus:outline-none focus:border-brand-500"
            />
            {erreur && <p className="text-xs text-red-500 mt-1.5">{erreur}</p>}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onAnnuler}
            disabled={envoi}
            className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={confirmer}
            disabled={envoi}
            className={`flex-1 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
              destructif ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {envoi && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {envoi ? 'En cours…' : libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Formulaire d'événement ─────────────────────────────────────────
function ModalEvenement({ evenement, onClose, onSuccess }: {
  evenement?: Evenement;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const modification = !!evenement;

  const [form, setForm] = useState({
    titre: evenement?.titre ?? '',
    description: evenement?.description ?? '',
    type: evenement?.type ?? 'FORMATION',
    audience: evenement?.audience ?? 'INTERNE',
    dateDebut: versChampLocal(evenement?.dateDebut),
    dateFin: versChampLocal(evenement?.dateFin),
    lieu: evenement?.lieu ?? '',
    adresse: evenement?.adresse ?? '',
    lienVisio: evenement?.lienVisio ?? '',
    capaciteMax: evenement?.capaciteMax ? String(evenement.capaciteMax) : '',
    dateLimiteInscription: versChampLocal(evenement?.dateLimiteInscription),
    organisateur: evenement?.organisateur ?? '',
    departement: evenement?.departement ?? '',
    obligatoire: evenement?.obligatoire ?? false,
    inscriptionRequise: evenement?.inscriptionRequise ?? true,
  });

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Le type suggère son audience naturelle : une journée portes
  // ouvertes n'est pas un événement interne.
  const changerType = (type: string) =>
    setForm((f) => ({ ...f, type, audience: TYPES[type]?.audience ?? f.audience }));

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (!form.titre.trim()) { setErreur('Le titre est requis'); return; }
    if (!form.dateDebut) { setErreur('La date de début est requise'); return; }
    if (form.dateFin && form.dateFin < form.dateDebut) {
      setErreur('La date de fin précède la date de début'); return;
    }

    setEnvoi(true);
    try {
      const donnees = {
        ...form,
        dateDebut: new Date(form.dateDebut).toISOString(),
        dateFin: new Date(form.dateFin || form.dateDebut).toISOString(),
        dateLimiteInscription: form.dateLimiteInscription
          ? new Date(form.dateLimiteInscription).toISOString()
          : null,
        capaciteMax: form.capaciteMax ? Number(form.capaciteMax) : null,
        lieu: form.lieu || null,
        adresse: form.adresse || null,
        lienVisio: form.lienVisio || null,
        departement: form.departement || null,
      };

      if (modification) await api.put(`/evenements/${evenement!.id}`, donnees);
      else await api.post('/evenements', donnees);

      onSuccess(modification
        ? `« ${form.titre} » mis à jour`
        : `« ${form.titre} » publié`);
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur ?? "Impossible d'enregistrer");
      setEnvoi(false);
    }
  };

  const champ =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800">
              {modification ? "Modifier l'événement" : 'Publier un événement'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {modification ? evenement!.titre : "Il apparaîtra selon l'audience choisie"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={soumettre} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(TYPES).map(([cle, t]) => {
                const Icone = t.icone;
                const choisi = form.type === cle;
                return (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => changerType(cle)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      choisi
                        ? 'bg-brand-500/10 border-brand-500'
                        : 'bg-surface border-stone-200 hover:border-brand-500'
                    }`}
                  >
                    <Icone className={`w-4 h-4 ${choisi ? 'text-brand-texte' : 'text-stone-400'}`} />
                    <span className={`text-[10px] text-center leading-tight ${
                      choisi ? 'text-brand-texte font-bold' : 'text-stone-500'
                    }`}>
                      {t.libelle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Titre *</label>
            <input
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              placeholder="Formation AWS pour les développeurs"
              className={champ}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Programme, objectifs, prérequis…"
              className={`${champ} resize-none`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">Audience</label>
            <div className="grid grid-cols-3 gap-2">
              {(['INTERNE', 'MIXTE', 'PUBLIC'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm({ ...form, audience: a })}
                  className="py-2.5 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    backgroundColor: form.audience === a ? ACCENT : 'white',
                    color: form.audience === a ? 'white' : '#656C86',
                    borderColor: form.audience === a ? ACCENT : '#DFE3F0',
                  }}
                >
                  {STYLE_AUDIENCE[a].libelle}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-1.5">
              Un candidat ne verra jamais un événement réservé aux salariés.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Début *</label>
              <input
                type="datetime-local"
                value={form.dateDebut}
                onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Fin</label>
              <input
                type="datetime-local"
                value={form.dateFin}
                onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                className={champ}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Lieu</label>
              <input
                value={form.lieu}
                onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                placeholder="Salle de conférence, Tunis…"
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Lien de visioconférence
              </label>
              <input
                value={form.lienVisio}
                onChange={(e) => setForm({ ...form, lienVisio: e.target.value })}
                placeholder="https://meet.google.com/…"
                className={champ}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Capacité</label>
              <input
                type="number"
                min="1"
                value={form.capaciteMax}
                onChange={(e) => setForm({ ...form, capaciteMax: e.target.value })}
                placeholder="Illimitée"
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Clôture des inscriptions
              </label>
              <input
                type="datetime-local"
                value={form.dateLimiteInscription}
                onChange={(e) => setForm({ ...form, dateLimiteInscription: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Département</label>
              <select
                value={form.departement}
                onChange={(e) => setForm({ ...form, departement: e.target.value })}
                className={champ}
              >
                <option value="">Tous</option>
                {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-start gap-3 cursor-pointer bg-stone-50 rounded-xl p-3">
              <input
                type="checkbox"
                checked={form.inscriptionRequise}
                onChange={(e) => setForm({ ...form, inscriptionRequise: e.target.checked })}
                className="mt-0.5 accent-brand-texte"
              />
              <span>
                <span className="text-sm font-medium text-stone-800">Inscription requise</span>
                <span className="block text-xs text-stone-400 mt-0.5">
                  Décochez pour une participation libre
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer bg-stone-50 rounded-xl p-3">
              <input
                type="checkbox"
                checked={form.obligatoire}
                onChange={(e) => setForm({ ...form, obligatoire: e.target.checked })}
                className="mt-0.5 accent-brand-texte"
              />
              <span>
                <span className="text-sm font-medium text-stone-800">Obligatoire</span>
                <span className="block text-xs text-stone-400 mt-0.5">
                  La désinscription sera refusée
                </span>
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Calendar className="w-4 h-4" />}
              {envoi ? 'Enregistrement…' : modification ? 'Enregistrer' : 'Publier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Liste des inscrits ─────────────────────────────────────────────
function ModalParticipants({ evenement, onClose }: {
  evenement: Evenement;
  onClose: () => void;
}) {
  const participants = evenement.participants ?? [];

  const exporter = () => {
    // Un export CSV permet a la RH de preparer les emargements ou les
    // badges sans ressaisir la liste.
    const lignes = [
      ['Nom', 'Email', 'Rôle', 'Département', 'Inscrit le'].join(';'),
      ...participants.map((p) => [
        p.nom, p.email, p.role, p.departement ?? '',
        new Date(p.inscritLe).toLocaleDateString('fr-FR'),
      ].join(';')),
    ];

    const blob = new Blob(['\ufeff' + lignes.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants - ${evenement.titre}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const salaries = participants.filter((p) => p.role === 'EMPLOYE').length;
  const candidats = participants.length - salaries;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-stone-800 truncate">Participants</h2>
            <p className="text-xs text-stone-500 truncate">
              {evenement.titre}
              {evenement.capaciteMax && ` · ${participants.length} sur ${evenement.capaciteMax} places`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {participants.length > 0 && (
              <button
                onClick={exporter}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-stone-50 text-brand-texte transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>
        </div>

        {participants.length > 0 && (
          <div className="grid grid-cols-2 gap-2 p-3 border-b border-stone-100 shrink-0">
            <div className="bg-blue-50 rounded-xl py-2 text-center">
              <div className="text-lg font-bold text-blue-600 leading-none">{salaries}</div>
              <div className="text-[10px] text-stone-400 mt-1">Salariés</div>
            </div>
            <div className="bg-brand-500/10 rounded-xl py-2 text-center">
              <div className="text-lg font-bold text-brand-texte leading-none">{candidats}</div>
              <div className="text-[10px] text-stone-400 mt-1">Candidats</div>
            </div>
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar p-2">
          {participants.length === 0 ? (
            <div className="py-14 text-center">
              <Users className="w-7 h-7 mx-auto mb-2 text-stone-300" />
              <p className="text-sm text-stone-500">Aucun inscrit</p>
            </div>
          ) : (
            <div className="space-y-1">
              {participants.map((p) => (
                <div key={p.userId} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-stone-50 transition-colors">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: couleurDe(p.nom) }}
                  >
                    {initiales(p.nom)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-stone-800 truncate">{p.nom}</div>
                    <div className="text-[10px] text-stone-400 truncate">{p.email}</div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.role === 'EMPLOYE' ? 'bg-blue-50 text-blue-600' : 'bg-brand-500/10 text-brand-texte'
                    }`}>
                      {p.role === 'EMPLOYE' ? p.departement ?? 'Salarié' : 'Candidat'}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {new Date(p.inscritLe).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function EvenementsAdminPage() {
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreAudience, setFiltreAudience] = useState<Audience | 'tous'>('tous');
  const [filtreType, setFiltreType] = useState('tous');
  const [filtrePeriode, setFiltrePeriode] = useState<'tous' | 'avenir' | 'passe'>('avenir');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);

  const [formulaire, setFormulaire] = useState(false);
  const [aModifier, setAModifier] = useState<Evenement | null>(null);
  const [participants, setParticipants] = useState<Evenement | null>(null);
  const [aAnnuler, setAAnnuler] = useState<Evenement | null>(null);
  const [aSupprimer, setASupprimer] = useState<Evenement | null>(null);
  const [toast, setToast] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  // Un clic hors du menu le referme : sans cela, il resterait ouvert
  // et masquerait le tableau qu'il sert à filtrer.
  useEffect(() => {
    if (!menuOuvert) return;
    const auClic = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOuvert(false);
      }
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [menuOuvert]);

  const charger = async () => {
    try {
      setChargement(true);
      const res = await api.get('/evenements') as any;
      const liste: Evenement[] = res?.data?.evenements ?? [];

      // La liste nominative n'est renvoyee que sur le detail : on la
      // recupere pour permettre l'export sans second clic.
      const complets = await Promise.all(
        liste.map(async (e) => {
          try {
            const d = await api.get(`/evenements/${e.id}`) as any;
            return d?.data?.evenement ?? e;
          } catch {
            return e;
          }
        })
      );
      setEvenements(complets);
    } catch (e) {
      console.error('Chargement des événements :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(0); }, [recherche, filtreAudience, filtreType, filtrePeriode]);

  const annuler = async (e: Evenement, motif: string) => {
    try {
      await api.put(`/evenements/${e.id}/annuler`, { motif });
      setAAnnuler(null);
      charger();
      setToast(`« ${e.titre} » annulé, inscrits prévenus`);
    } catch (err: any) {
      setAAnnuler(null);
      setToast(err?.erreur ?? "Impossible d'annuler");
    }
  };

  const supprimer = async (e: Evenement) => {
    try {
      await api.delete(`/evenements/${e.id}`);
      setASupprimer(null);
      charger();
      setToast(`« ${e.titre} » supprimé`);
    } catch (err: any) {
      setASupprimer(null);
      setToast(err?.erreur ?? 'Suppression impossible');
    }
  };

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return evenements
      .filter((e) => {
        if (filtreAudience !== 'tous' && e.audience !== filtreAudience) return false;
        if (filtreType !== 'tous' && e.type !== filtreType) return false;
        if (filtrePeriode === 'avenir' && estPasse(e.dateDebut)) return false;
        if (filtrePeriode === 'passe' && !estPasse(e.dateDebut)) return false;
        if (!terme) return true;
        return `${e.titre} ${e.typeLibelle} ${e.lieu ?? ''} ${e.departement ?? ''}`
          .toLowerCase().includes(terme);
      })
      // Les plus proches d'abord : ce sont ceux qui demandent
      // une préparation.
      .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)));
  }, [evenements, recherche, filtreAudience, filtreType, filtrePeriode]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  const stats = useMemo(() => {
    const aVenir = evenements.filter((e) => !estPasse(e.dateDebut));
    return {
      aVenir: aVenir.length,
      internes: evenements.filter((e) => e.audience === 'INTERNE').length,
      publics: evenements.filter((e) => e.audience !== 'INTERNE').length,
      inscrits: evenements.reduce(
        (s, e) => s + (e.participants?.length ?? e.nbParticipants ?? 0), 0
      ),
    };
  }, [evenements]);

  const nbFiltres = (filtreAudience !== 'tous' ? 1 : 0)
    + (filtreType !== 'tous' ? 1 : 0)
    + (filtrePeriode !== 'avenir' ? 1 : 0);

  const champ =
    'w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un événement…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Vie de l'entreprise</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Événements</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Événements</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} événement{filtres.length > 1 ? 's' : ''}
                  {' · '}{stats.inscrits} inscription{stats.inscrits > 1 ? 's' : ''}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Titre, lieu…"
                className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
              />
              {recherche && (
                <button
                  onClick={() => setRecherche('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                >
                  <X className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOuvert(!menuOuvert)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border shadow-sm transition-colors ${
                  menuOuvert || nbFiltres > 0
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtrer
                {nbFiltres > 0 && (
                  <span className="bg-surface text-brand-texte text-[10px] font-bold px-1.5 rounded-full">
                    {nbFiltres}
                  </span>
                )}
              </button>

              {menuOuvert && (
                <div className="absolute end-0 top-full mt-2 w-72 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
                      Filtres
                    </span>
                    {nbFiltres > 0 && (
                      <button
                        onClick={() => {
                          setFiltreAudience('tous');
                          setFiltreType('tous');
                          setFiltrePeriode('avenir');
                        }}
                        className="text-xs font-medium text-stone-500 hover:text-stone-700"
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Période
                    </label>
                    <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
                      {([
                        ['avenir', 'À venir'],
                        ['passe', 'Passés'],
                        ['tous', 'Tous'],
                      ] as ['tous' | 'avenir' | 'passe', string][]).map(([cle, label]) => (
                        <button
                          key={cle}
                          onClick={() => setFiltrePeriode(cle)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            filtrePeriode === cle
                              ? 'bg-surface text-stone-800 shadow-sm'
                              : 'text-stone-500'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Audience
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ['tous', 'Toutes'],
                        ['INTERNE', 'Interne'],
                        ['MIXTE', 'Mixte'],
                        ['PUBLIC', 'Public'],
                      ] as [Audience | 'tous', string][]).map(([cle, label]) => (
                        <button
                          key={cle}
                          onClick={() => setFiltreAudience(cle)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                          style={{
                            backgroundColor: filtreAudience === cle ? ACCENT : 'white',
                            color: filtreAudience === cle ? 'white' : '#656C86',
                            borderColor: filtreAudience === cle ? ACCENT : '#DFE3F0',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Type
                    </label>
                    <select
                      value={filtreType}
                      onChange={(e) => setFiltreType(e.target.value)}
                      className={champ}
                    >
                      <option value="tous">Tous les types</option>
                      {Object.entries(TYPES).map(([cle, t]) => (
                        <option key={cle} value={cle}>{t.libelle}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setFormulaire(true)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Publier
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={CalendarClock}
              label="À venir"
              value={chargement ? '…' : stats.aVenir}
              sub={`sur ${evenements.length} publié${evenements.length > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={Building2}
              label="Réservés aux salariés"
              value={chargement ? '…' : stats.internes}
              sub="invisibles des candidats"
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={DoorOpen}
              label="Ouverts au public"
              value={chargement ? '…' : stats.publics}
              sub="visibles sur le site carrière"
              fond="bg-purple-50"
              texte="text-purple-600"
            />
            <StatCard
              icon={Users}
              label="Inscriptions"
              value={chargement ? '…' : stats.inscrits}
              sub="tous événements confondus"
              fond="bg-amber-50"
              texte="text-amber-600"
            />
          </div>

          {/* ── Tableau ── */}
          {chargement ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-40" />
                      <div className="h-3 bg-stone-100 rounded w-56" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtres.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {recherche || nbFiltres > 0 ? 'Aucun résultat' : 'Aucun événement'}
              </p>
              {!recherche && nbFiltres === 0 && (
                <button
                  onClick={() => setFormulaire(true)}
                  className="text-sm font-bold text-brand-texte hover:underline mt-2"
                >
                  Publier le premier événement
                </button>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[30%]">
                      Événement
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[17%]">
                      Date
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Lieu
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Audience
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Inscrits
                    </th>
                    <th className="text-end px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[13%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageCourante.map((e) => {
                    const Icone = TYPES[e.type]?.icone ?? Calendar;
                    const audience = STYLE_AUDIENCE[e.audience];
                    const inscrits = e.participants?.length ?? e.nbParticipants ?? 0;
                    const passe = estPasse(e.dateDebut);
                    const annule = e.statut === 'ANNULE';
                    const complet = e.capaciteMax != null && inscrits >= e.capaciteMax;

                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-stone-100 last:border-0 transition-colors ${
                          annule ? 'bg-red-50/30' : passe ? 'opacity-60' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
                              <Icone className="w-4 h-4 text-brand-texte" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-stone-800 truncate">
                                  {e.titre}
                                </span>
                                {e.obligatoire && (
                                  <Lock className="w-3 h-3 text-red-500 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] text-stone-400 truncate">
                                {e.typeLibelle}
                                {e.departement && ` · ${e.departement}`}
                              </div>
                              {annule && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500 mt-1">
                                  <Ban className="w-2.5 h-2.5" />
                                  Annulé
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-sm font-medium text-stone-800">
                            {new Date(e.dateDebut).toLocaleDateString('fr-FR', {
                              weekday: 'short', day: 'numeric', month: 'short',
                            })}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {new Date(e.dateDebut).toLocaleTimeString('fr-FR', {
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {passe && ' · passé'}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {e.lieu ? (
                            <div className="flex items-center gap-1 text-xs text-stone-700 truncate">
                              <MapPin className="w-3 h-3 shrink-0 text-stone-400" />
                              <span className="truncate">{e.lieu}</span>
                            </div>
                          ) : e.lienVisio ? (
                            <div className="flex items-center gap-1 text-xs text-blue-600">
                              <Video className="w-3 h-3 shrink-0" />
                              En ligne
                            </div>
                          ) : (
                            <span className="text-stone-300 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${audience.bg} ${audience.text}`}>
                            {audience.court}
                          </span>
                        </td>

                        {/* La jauge dit en un coup d'œil si l'événement
                            se remplit ou reste désert. */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setParticipants(e)}
                            className="w-full text-start group"
                            title="Voir les inscrits"
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className={`font-bold ${complet ? 'text-amber-600' : 'text-stone-800'}`}>
                                {inscrits}{e.capaciteMax ? ` / ${e.capaciteMax}` : ''}
                              </span>
                              {complet && (
                                <span className="text-[9px] font-bold text-amber-600">complet</span>
                              )}
                            </div>
                            {e.capaciteMax ? (
                              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${complet ? 'bg-amber-400' : 'bg-brand-500'}`}
                                  style={{
                                    width: `${Math.min(100, (inscrits / e.capaciteMax) * 100)}%`,
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-stone-400 group-hover:text-brand-texte">
                                capacité libre
                              </div>
                            )}
                          </button>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setParticipants(e)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Voir les inscrits"
                            >
                              <Users className="w-4 h-4 text-stone-400" />
                            </button>
                            <button
                              onClick={() => setAModifier(e)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4 text-stone-400 hover:text-blue-500" />
                            </button>
                            {!annule && !passe && (
                              <button
                                onClick={() => setAAnnuler(e)}
                                className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                                title="Annuler et prévenir les inscrits"
                              >
                                <Ban className="w-4 h-4 text-stone-400 hover:text-amber-500" />
                              </button>
                            )}
                            <button
                              onClick={() => setASupprimer(e)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-stone-400 hover:text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtres.length}
                onPage={setPage}
                libelle="événement"
                accent={ACCENT}
              />
            </div>
          )}
        </div>

        {(formulaire || aModifier) && (
          <ModalEvenement
            evenement={aModifier ?? undefined}
            onClose={() => { setFormulaire(false); setAModifier(null); }}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}

        {participants && (
          <ModalParticipants evenement={participants} onClose={() => setParticipants(null)} />
        )}

        {aAnnuler && (
          <ModalConfirmation
            titre="Annuler cet événement ?"
            message={
              `« ${aAnnuler.titre} » sera marqué comme annulé et les `
              + `${aAnnuler.participants?.length ?? 0} inscrit(s) seront prévenus.`
            }
            libelleAction="Annuler l'événement"
            avecMotif
            onConfirmer={(motif) => annuler(aAnnuler, motif)}
            onAnnuler={() => setAAnnuler(null)}
          />
        )}

        {aSupprimer && (
          <ModalConfirmation
            titre="Supprimer cet événement ?"
            message={
              (aSupprimer.participants?.length ?? 0) > 0
                ? `« ${aSupprimer.titre} » compte ${aSupprimer.participants!.length} inscrit(s). Annulez-le plutôt pour les prévenir.`
                : `« ${aSupprimer.titre} » sera définitivement supprimé.`
            }
            libelleAction="Supprimer"
            destructif
            onConfirmer={() => supprimer(aSupprimer)}
            onAnnuler={() => setASupprimer(null)}
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