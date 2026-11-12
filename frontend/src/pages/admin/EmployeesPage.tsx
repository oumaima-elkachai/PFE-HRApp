// src/pages/admin/EmployeesPage.tsx
//
// Gestion des dossiers salariés, réservée à la RH. L'annuaire est un
// écran distinct : il montre les coordonnées professionnelles à tous,
// sans le salaire ni la situation familiale. Ici, la RH crée, modifie
// et désactive les fiches.

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Briefcase, Eye, X, Mail, Phone, Plus, Pencil, Trash2,
  Calendar as CalendarIcon, Users, UserCheck, Wallet, ChevronRight,
  CheckCircle2, AlertTriangle, Baby, ShieldCheck, KeyRound,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Pagination from '@/components/ui/Pagination';
import { employesService, type FicheSalarie } from '@/services/employes';
import {
  BoutonCompte, PastilleCompte, useDomainesEntreprise,
} from '@/components/employes/CompteSalarie';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 10;

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];

// Style uniquement : trois états de dossier, pas davantage.
const STYLE_STATUT: Record<string, { bg: string; text: string; dot: string; libelle: string }> = {
  actif:    { bg: 'bg-brand-500/10', text: 'text-brand-texte', dot: 'bg-brand-500', libelle: 'En poste' },
  conge:    { bg: 'bg-amber-50',     text: 'text-amber-600',  dot: 'bg-amber-400', libelle: 'En congé' },
  inactif:  { bg: 'bg-stone-100',    text: 'text-stone-500',  dot: 'bg-stone-400', libelle: 'Sorti·e' },
};

const STYLE_DEFAUT = { bg: 'bg-stone-50', text: 'text-stone-500', dot: 'bg-stone-400', libelle: '—' };

const styleStatut = (s: string) => STYLE_STATUT[s] ?? STYLE_DEFAUT;

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (prenom: string) =>
  PALETTE[(prenom?.charCodeAt(0) ?? 0) % PALETTE.length];

const initiales = (prenom: string, nom: string) =>
  `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();

const tnd = (v?: number) => (v ? `${v.toFixed(3)} TND` : '—');

const dateCourte = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—';

/**
 * Ancienneté en mois révolus. Une soustraction d'années donnerait
 * « 1 an » dès janvier à un salarié embauché en décembre.
 */
function anciennete(iso?: string): string {
  if (!iso) return '—';

  const debut = new Date(iso);
  const maintenant = new Date();

  let mois = (maintenant.getFullYear() - debut.getFullYear()) * 12
    + (maintenant.getMonth() - debut.getMonth());
  if (maintenant.getDate() < debut.getDate()) mois -= 1;
  mois = Math.max(0, mois);

  if (mois < 1) return 'Arrivé ce mois-ci';
  if (mois < 12) return `${mois} mois`;

  const annees = Math.floor(mois / 12);
  const reste = mois % 12;
  if (reste === 0) return `${annees} an${annees > 1 ? 's' : ''}`;
  return `${annees} an${annees > 1 ? 's' : ''} et ${reste} mois`;
}

// ── Composants partagés ────────────────────────────────────────────
function Avatar({ prenom, nom, taille = 'md' }: {
  prenom: string; nom: string; taille?: 'sm' | 'md' | 'lg';
}) {
  const classe = taille === 'sm' ? 'w-9 h-9 text-xs'
               : taille === 'lg' ? 'w-16 h-16 text-xl'
               : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${classe} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}
      style={{ backgroundColor: couleurDe(prenom) }}
    >
      {initiales(prenom, nom)}
    </div>
  );
}

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

// ── Confirmation ───────────────────────────────────────────────────
// Le confirm() natif affiche la boîte du navigateur, étrangère au
// design et impossible à styler.
function ModalConfirmation({
  titre, message, libelleAction, onConfirmer, onAnnuler,
}: {
  titre: string;
  message: string;
  libelleAction: string;
  onConfirmer: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);

  const confirmer = async () => {
    setEnvoi(true);
    await onConfirmer();
    setEnvoi(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">{titre}</h2>
            <p className="text-sm text-stone-500 mt-1">{message}</p>
          </div>
        </div>

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
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {envoi
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            {envoi ? 'En cours…' : libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dossier d'un salarié ───────────────────────────────────────────
function DossierSalarie({ employe, onClose, onModifier, domaines, onChange }: {
  employe: any;
  onClose: () => void;
  onModifier: () => void;
  /** Domaines de l'entreprise, pour savoir si l'adresse est professionnelle */
  domaines: string[];
  /** Rechargement de la liste après une invitation ou une attribution */
  onChange: () => void;
}) {
  const style = styleStatut(employe.statut);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-start justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar prenom={employe.prenom} nom={employe.nom} taille="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-bold text-lg text-stone-800 truncate">
                  {employe.prenom} {employe.nom}
                </h2>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {style.libelle}
                </span>
              </div>
              <p className="text-sm text-stone-500 truncate">{employe.poste || '—'}</p>
              <p className="text-xs text-brand-texte font-semibold">{employe.departement || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">

          {/* Coordonnées */}
          <div className="space-y-2">
            <a
              href={`mailto:${employe.email}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-surface">
                <Mail className="w-4 h-4 text-brand-texte" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Email</div>
                <div className="text-sm text-stone-800 truncate">{employe.email}</div>
              </div>
            </a>

            {employe.telephone && (
              <a
                href={`tel:${employe.telephone}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-surface">
                  <Phone className="w-4 h-4 text-brand-texte" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Téléphone</div>
                  <div className="text-sm text-stone-800">{employe.telephone}</div>
                </div>
              </a>
            )}
          </div>

          {/* Contrat */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ["Date d'embauche", dateCourte(employe.dateEmbauche), CalendarIcon],
              ['Ancienneté', anciennete(employe.dateEmbauche), Briefcase],
            ] as [string, string, any][]).map(([label, valeur, Icone]) => (
              <div key={label} className="bg-stone-50 rounded-xl p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1 mb-1">
                  <Icone className="w-3 h-3" />
                  {label}
                </div>
                <div className="text-sm font-medium text-stone-800">{valeur}</div>
              </div>
            ))}
          </div>

          {/* Rémunération : la raison d'être de cet écran face à
              l'annuaire, qui ne transmet jamais ces montants. */}
          <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-brand-texte" />
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Rémunération et fiscalité
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface rounded-lg p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Brut mensuel
                </div>
                <div className="text-lg font-bold text-brand-texte">
                  {tnd(employe.salaireBrutMensuel)}
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Horaire mensuel
                </div>
                <div className="text-lg font-bold text-stone-800">
                  {employe.heuresMensuelles ?? 208} h
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-surface rounded-lg p-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-stone-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-stone-400">Chef de famille</div>
                  <div className="text-sm font-medium text-stone-800">
                    {employe.chefDeFamille ? 'Oui' : 'Non'}
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3 flex items-center gap-2">
                <Baby className="w-4 h-4 text-stone-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-stone-400">Enfants à charge</div>
                  <div className="text-sm font-medium text-stone-800">
                    {employe.nbEnfants ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Accès à l'application.
              Séparé de la rémunération parce que ce n'est pas la même
              question : ici on ne regarde pas ce que la personne gagne,
              mais si elle peut entrer. */}
          <div className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-brand-texte" />
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Accès à l'application
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <PastilleCompte fiche={employe} domaines={domaines} />
              {employe.compteInviteLe && (
                <span className="text-[11px] text-stone-400">
                  invité·e le {dateCourte(employe.compteInviteLe)}
                </span>
              )}
            </div>

            {employe.emailPerso && (
              <div className="text-xs text-stone-500 mb-3 break-all">
                Adresse personnelle : {employe.emailPerso}
              </div>
            )}

            {employe.statut === 'inactif' ? (
              <p className="text-xs text-stone-400">
                Dossier sorti des effectifs. Réactivez-le avant d'ouvrir un accès.
              </p>
            ) : (
              <BoutonCompte fiche={employe} domaines={domaines} onChange={onChange} />
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={onModifier}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



function ModalSalarie({ employe, onClose, onSuccess }: {
  employe?: any;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const modification = !!employe;

    const [form, setForm] = useState<FicheSalarie>({
    prenom: employe?.prenom ?? '',
    nom: employe?.nom ?? '',
    email: employe?.email ?? '',
    telephone: employe?.telephone ?? '',
    poste: employe?.poste ?? '',
    departement: employe?.departement ?? 'Informatique',
    dateEmbauche: employe?.dateEmbauche?.slice(0, 10) ?? '',
    salaireBrutMensuel: employe?.salaireBrutMensuel ?? 0,
    heuresMensuelles: employe?.heuresMensuelles ?? 208,
    chefDeFamille: employe?.chefDeFamille ?? false,
    nbEnfants: employe?.nbEnfants ?? 0,
    statut: employe?.statut ?? 'actif',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.prenom.trim() || !form.nom.trim()) {
      setErreur('Le prénom et le nom sont requis');
      return;
    }
    if (!form.email.trim()) {
      setErreur("L'email est requis");
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      if (modification) {
        await employesService.modifier(employe.id, form);
        onSuccess(`Dossier de ${form.prenom} ${form.nom} mis à jour`);
      } else {
        await employesService.creer(form);
        onSuccess(`${form.prenom} ${form.nom} a rejoint l'effectif`);
      }
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur ?? "Erreur lors de l'enregistrement");
    } finally {
      setEnvoi(false);
    }
  };

  const champ =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800">
              {modification ? 'Modifier le dossier' : 'Nouveau salarié'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {modification
                ? `${employe.prenom} ${employe.nom}`
                : "Création d'une fiche dans l'effectif"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Prénom *</label>
              <input
                required
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Nom *</label>
              <input
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className={champ}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="prenom.nom@hrup.tn"
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Téléphone</label>
              <input
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="+216 XX XXX XXX"
                className={champ}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Poste</label>
              <input
                value={form.poste}
                onChange={(e) => setForm({ ...form, poste: e.target.value })}
                placeholder="ex : Développeur full stack"
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
                {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Date d'embauche
              </label>
              <input
                type="date"
                value={form.dateEmbauche}
                onChange={(e) => setForm({ ...form, dateEmbauche: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Statut</label>
              <select
                value={form.statut}
                onChange={(e) => setForm({ ...form, statut: e.target.value })}
                className={champ}
              >
                <option value="actif">En poste</option>
                <option value="conge">En congé</option>
                <option value="inactif">Sorti·e des effectifs</option>
              </select>
            </div>
          </div>

          {/* Rémunération : ces champs alimentent le moteur de paie,
              d'où le besoin de les saisir ici et non dans l'annuaire. */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
              Rémunération et fiscalité
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  Brut mensuel (TND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.salaireBrutMensuel}
                  onChange={(e) => setForm({ ...form, salaireBrutMensuel: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 text-sm bg-surface border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  Horaire mensuel
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.heuresMensuelles}
                  onChange={(e) => setForm({ ...form, heuresMensuelles: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 text-sm bg-surface border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer bg-surface rounded-xl px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.chefDeFamille}
                  onChange={(e) => setForm({ ...form, chefDeFamille: e.target.checked })}
                  className="accent-brand-texte"
                />
                <span className="text-sm text-stone-800">Chef de famille</span>
              </label>

              <div>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={form.nbEnfants}
                  onChange={(e) => setForm({ ...form, nbEnfants: Number(e.target.value) })}
                  placeholder="Enfants"
                  className="w-full px-3 py-2.5 text-sm bg-surface border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <p className="text-xs text-stone-400">
              Ces données ouvrent droit aux abattements fiscaux : 300 TND par an pour
              un chef de famille, 100 TND par enfant jusqu'à quatre.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
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
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
            >
              {envoi ? 'Enregistrement…' : modification ? 'Enregistrer' : 'Créer la fiche'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function EmployeesPage() {
  // Les domaines de l'entreprise, lus une seule fois pour toute la page.
  // Ils décident si l'adresse d'une fiche est professionnelle ou encore
  // personnelle.
  const domaines = useDomainesEntreprise();

  const [employes, setEmployes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreDept, setFiltreDept] = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [page, setPage] = useState(0);

  const [creation, setCreation] = useState(false);
  const [aModifier, setAModifier] = useState<any>(null);
  const [dossier, setDossier] = useState<any>(null);
  const [aDesactiver, setADesactiver] = useState<any>(null);
  const [toast, setToast] = useState('');

  const charger = async () => {
    try {
      setChargement(true);
      const res = await employesService.lister() as any;
      // La RH doit voir tous les dossiers, y compris les sorties :
      // filtrer sur « actif » lui retirerait précisément ceux qu'elle
      // a besoin de consulter ou de réactiver.
      setEmployes(res?.data?.employes ?? res?.employes ?? []);
    } catch (e) {
      console.error('Chargement des salariés :', e);
      setEmployes([]);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const handleDesactiver = async (employe: any) => {
    try {
      // Désactivation plutôt que suppression : les bulletins, congés
      // et pointages passés référencent cette fiche.
      await employesService.modifier(employe.id, { statut: 'inactif' });
      setADesactiver(null);
      charger();
      setToast(`${employe.prenom} ${employe.nom} est sorti·e des effectifs`);
    } catch (e: any) {
      setADesactiver(null);
      setToast('Impossible de modifier le dossier');
    }
  };

  const departements = useMemo(() => {
    const liste = new Set(employes.map((e) => e.departement).filter(Boolean));
    return [...liste].sort() as string[];
  }, [employes]);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return employes
      .filter((e) => {
        if (filtreDept !== 'tous' && e.departement !== filtreDept) return false;
        if (filtreStatut !== 'tous' && e.statut !== filtreStatut) return false;
        if (!terme) return true;
        return `${e.prenom} ${e.nom} ${e.email} ${e.poste ?? ''}`
          .toLowerCase()
          .includes(terme);
      })
      .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
  }, [employes, recherche, filtreDept, filtreStatut]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  useEffect(() => { setPage(0); }, [recherche, filtreDept, filtreStatut]);

  const parStatut = (s: string) => employes.filter((e) => e.statut === s).length;

  const masseSalariale = employes
    .filter((e) => e.statut !== 'inactif')
    .reduce((s, e) => s + (e.salaireBrutMensuel ?? 0), 0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un salarié…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Personnel</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Salariés</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Salariés</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} dossier{filtres.length > 1 ? 's' : ''} sur {employes.length}
                  {' · '}{departements.length} département{departements.length > 1 ? 's' : ''}
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
                placeholder="Nom, poste, email…"
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className={`px-3 py-2 text-sm bg-surface border rounded-xl shadow-sm focus:outline-none transition-colors ${
                filtreStatut !== 'tous'
                  ? 'border-brand-500 text-brand-texte font-medium'
                  : 'border-stone-200 text-stone-600'
              }`}
            >
              <option value="tous">Tous les statuts</option>
              <option value="actif">En poste</option>
              <option value="conge">En congé</option>
              <option value="inactif">Sorti·e</option>
            </select>

            <button
              onClick={() => setCreation(true)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Users}
              label="Effectif total"
              value={chargement ? '…' : employes.length}
              sub={`${parStatut('inactif')} sortie${parStatut('inactif') > 1 ? 's' : ''}`}
              fond="bg-purple-50"
              texte="text-purple-600"
            />
            <StatCard
              icon={UserCheck}
              label="En poste"
              value={chargement ? '…' : parStatut('actif')}
              sub="présents aujourd'hui"
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={CalendarIcon}
              label="En congé"
              value={chargement ? '…' : parStatut('conge')}
              sub="absences en cours"
              fond="bg-amber-50"
              texte="text-amber-600"
            />
            <StatCard
              icon={Wallet}
              label="Masse salariale"
              value={chargement ? '…' : `${Math.round(masseSalariale)} TND`}
              sub="brut mensuel, hors sorties"
              fond="bg-blue-50"
              texte="text-blue-600"
            />
          </div>

          {/* ── Filtres par département ── */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setFiltreDept('tous')}
              className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
              style={{
                backgroundColor: filtreDept === 'tous' ? ACCENT : 'white',
                color: filtreDept === 'tous' ? 'white' : '#656C86',
                borderColor: filtreDept === 'tous' ? ACCENT : '#DFE3F0',
              }}
            >
              Tous
            </button>
            {departements.map((d) => (
              <button
                key={d}
                onClick={() => setFiltreDept(d)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                style={{
                  backgroundColor: filtreDept === d ? ACCENT : 'white',
                  color: filtreDept === d ? 'white' : '#656C86',
                  borderColor: filtreDept === d ? ACCENT : '#DFE3F0',
                }}
              >
                {d}
              </button>
            ))}
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
                <Users className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {recherche ? `Aucun résultat pour « ${recherche} »` : 'Aucun salarié'}
              </p>
              {!recherche && filtreDept === 'tous' && filtreStatut === 'tous' && (
                <button
                  onClick={() => setCreation(true)}
                  className="text-sm font-bold text-brand-texte hover:underline mt-2"
                >
                  Créer la première fiche
                </button>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              {/* Une colonne de plus : sur un écran étroit, mieux vaut
                  faire défiler le tableau que déborder toute la page. */}
              <div className="overflow-x-auto">
              <table className="w-full min-w-200">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    {['Salarié', 'Département', 'Poste', 'Ancienneté', 'Brut mensuel', 'Statut', 'Compte', ''].map((h) => (
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
                  {pageCourante.map((e) => {
                    const style = styleStatut(e.statut);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setDossier(e)}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar prenom={e.prenom} nom={e.nom} taille="sm" />
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-stone-800 truncate">
                                {e.prenom} {e.nom}
                              </div>
                              <div className="text-xs text-stone-400 truncate">{e.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-700">{e.departement || '—'}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-700">{e.poste || '—'}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-500">
                            {anciennete(e.dateEmbauche)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-stone-800">
                            {tnd(e.salaireBrutMensuel)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {style.libelle}
                          </span>
                        </td>

                        {/* Le compte de connexion. Les clics ne doivent pas
                            ouvrir le dossier : on agit depuis la ligne. */}
                        <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex flex-col items-start gap-1.5">
                            <PastilleCompte fiche={e} domaines={domaines} />
                            {e.statut !== 'inactif' && (
                              <BoutonCompte
                                fiche={e}
                                domaines={domaines}
                                onChange={charger}
                                compact
                              />
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setDossier(e)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Voir le dossier"
                            >
                              <Eye className="w-4 h-4 text-stone-400" />
                            </button>
                            <button
                              onClick={() => setAModifier(e)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4 text-stone-400 hover:text-blue-500" />
                            </button>
                            {e.statut !== 'inactif' && (
                              <button
                                onClick={() => setADesactiver(e)}
                                className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                                title="Sortie des effectifs"
                              >
                                <Trash2 className="w-4 h-4 text-stone-400 hover:text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtres.length}
                onPage={setPage}
                libelle="salarié"
                accent={ACCENT}
              />
            </div>
          )}
        </div>

        {creation && (
          <ModalSalarie
            onClose={() => setCreation(false)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}
        {aModifier && (
          <ModalSalarie
            employe={aModifier}
            onClose={() => setAModifier(null)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}
        {dossier && (
          <DossierSalarie
            employe={dossier}
            domaines={domaines}
            onChange={() => { charger(); setDossier(null); }}
            onClose={() => setDossier(null)}
            onModifier={() => { setAModifier(dossier); setDossier(null); }}
          />
        )}
        {aDesactiver && (
          <ModalConfirmation
            titre="Sortie des effectifs ?"
            message={
              `Le dossier de ${aDesactiver.prenom} ${aDesactiver.nom} sera marqué comme sorti. `
              + `Ses bulletins et son historique restent consultables.`
            }
            libelleAction="Confirmer la sortie"
            onConfirmer={() => handleDesactiver(aDesactiver)}
            onAnnuler={() => setADesactiver(null)}
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