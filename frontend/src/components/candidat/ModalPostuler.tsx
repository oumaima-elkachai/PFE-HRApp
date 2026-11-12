// src/components/candidat/ModalPostuler.tsx
//
// Le formulaire de candidature à une offre.
//
// ── Pourquoi ce fichier existe ──────────────────────────────────────
//
// Deux écrans y mènent : la liste des offres et la page de détail.
// Recopié dans les deux, il aurait divergé en une semaine — c'est ce
// qui était arrivé à StatCard et à Toast.

import { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, Send, Upload, FileText, AlertTriangle } from 'lucide-react';
import { CHAMP } from '../ui/kit';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export interface OffreCandidature {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
}

const TAILLE_MAX = 5 * 1024 * 1024;

const FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function ModalPostuler({ offre, onClose, onSucces }: {
  offre: OffreCandidature;
  onClose: () => void;
  onSucces: () => void;
}) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    nom: (user as any)?.nom ?? '',
    prenom: (user as any)?.prenom ?? '',
    email: (user as any)?.email ?? '',
    telephone: '',
    niveauEtude: '',
    experience: '',
    competences: '',
    lettreMotivation: '',
    linkedin: '',
    portfolio: '',
  });

  const [cv, setCv] = useState<File | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [reussi, setReussi] = useState(false);

  // Échap ferme la modale, sauf pendant l'envoi : interrompre à ce
  // moment-là laisserait le candidat sans savoir si c'est parti.
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !envoi) onClose();
    };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onClose, envoi]);

  const choisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    if (!FORMATS.includes(fichier.type)) {
      setErreur('Format non supporté. Utilisez PDF ou DOCX.');
      return;
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur('Le fichier dépasse 5 Mo.');
      return;
    }

    setCv(fichier);
    setErreur('');
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cv) {
      setErreur('Le CV est obligatoire');
      return;
    }

    setEnvoi(true);
    setErreur('');

    try {
      const donnees = new FormData();
      donnees.append('cv', cv);
      donnees.append('offreId', offre.id);
      donnees.append('nom', form.nom);
      donnees.append('prenom', form.prenom);
      donnees.append('email', form.email);
      donnees.append('telephone', form.telephone);
      donnees.append('niveauEtude', form.niveauEtude);
      donnees.append('experience', form.experience);
      donnees.append('lettreMotivation', form.lettreMotivation);
      donnees.append('linkedin', form.linkedin || '');
      donnees.append('portfolio', form.portfolio || '');
      donnees.append(
        'competences',
        JSON.stringify(form.competences.split(',').map((c) => c.trim()).filter(Boolean))
      );

      await api.post('/candidatures', donnees);
      setReussi(true);
    } catch (err: any) {
      setErreur(
        err?.response?.data?.erreur ?? err?.erreur
          ?? "Erreur lors de l'envoi. Veuillez réessayer."
      );
    } finally {
      setEnvoi(false);
    }
  };

  // ── Confirmation ──

  if (reussi) {
    return (
      <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl p-7 sm:p-8 text-center">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-brand-texte" />
          </div>
          <h2 className="text-xl font-bold text-stone-800 mb-2">Candidature envoyée</h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">
            Votre candidature pour{' '}
            <strong className="text-stone-800">{offre.titre}</strong>{' '}
            a bien été reçue. Vous suivrez son avancement depuis votre espace.
          </p>
          <button
            onClick={() => { onSucces(); onClose(); }}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4"
      onClick={() => { if (!envoi) onClose(); }}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-stone-100 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-stone-500 mb-0.5">Postuler pour</p>
            <h2 className="font-bold text-lg text-stone-800 truncate">{offre.titre}</h2>
            <p className="text-sm text-brand-texte truncate">
              {offre.departement} · {offre.type} · {offre.modeTravail}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={soumettre} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {erreur && (
            <div className="flex items-start gap-2 bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Identité ── */}
          <div>
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">
              Informations personnelles
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['prenom', 'Prénom *', 'text', true, undefined],
                ['nom', 'Nom *', 'text', true, undefined],
                ['email', 'Adresse électronique *', 'email', true, undefined],
                ['telephone', 'Téléphone', 'tel', false, '+216 XX XXX XXX'],
              ] as [keyof typeof form, string, string, boolean, string | undefined][])
                .map(([cle, libelle, type, requis, exemple]) => (
                  <div key={cle}>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      {libelle}
                    </label>
                    <input
                      required={requis}
                      type={type}
                      value={form[cle]}
                      onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
                      placeholder={exemple}
                      className={CHAMP}
                    />
                  </div>
                ))}
            </div>
          </div>

          {/* ── CV ── */}
          <div>
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Curriculum vitae *
            </h3>

            <input
              ref={champFichier}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={choisirFichier}
              className="hidden"
            />

            {!cv ? (
              <button
                type="button"
                onClick={() => champFichier.current?.click()}
                className="w-full border-2 border-dashed border-stone-200 rounded-xl p-6 hover:border-brand-500 hover:bg-brand-500/5 transition-all text-center"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-brand-texte" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      Cliquez pour déposer votre CV
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">PDF ou DOCX, 5 Mo maximum</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-brand-texte" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{cv.name}</p>
                    <p className="text-xs text-stone-500">
                      {(cv.size / 1024 / 1024).toFixed(2)} Mo
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCv(null);
                    if (champFichier.current) champFichier.current.value = '';
                  }}
                  className="p-2 hover:bg-surface rounded-lg transition-colors shrink-0"
                  title="Retirer"
                >
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </div>
            )}
          </div>

          {/* ── Parcours ── */}
          <div>
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">
              Parcours
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  Niveau d'étude
                </label>
                <select
                  value={form.niveauEtude}
                  onChange={(e) => setForm({ ...form, niveauEtude: e.target.value })}
                  className={CHAMP}
                >
                  <option value="">Sélectionner…</option>
                  {['Bac', 'Bac+2', 'Licence (Bac+3)', 'Master (Bac+5)', 'Ingénieur', 'Doctorat']
                    .map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  Expérience
                </label>
                <select
                  value={form.experience}
                  onChange={(e) => setForm({ ...form, experience: e.target.value })}
                  className={CHAMP}
                >
                  <option value="">Sélectionner…</option>
                  {['Débutant', '1 à 2 ans', '3 à 5 ans', '5 à 10 ans', 'Plus de 10 ans']
                    .map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Compétences <span className="text-stone-400">(séparées par des virgules)</span>
              </label>
              <input
                value={form.competences}
                onChange={(e) => setForm({ ...form, competences: e.target.value })}
                placeholder="React, Node.js, DynamoDB…"
                className={CHAMP}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {([
                ['linkedin', 'LinkedIn (facultatif)', 'https://linkedin.com/in/…'],
                ['portfolio', 'Portfolio (facultatif)', 'https://monportfolio.com'],
              ] as [keyof typeof form, string, string][]).map(([cle, libelle, exemple]) => (
                <div key={cle}>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">
                    {libelle}
                  </label>
                  <input
                    type="url"
                    value={form[cle]}
                    onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
                    placeholder={exemple}
                    className={CHAMP}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Lettre ── */}
          <div>
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">
              Lettre de motivation *
            </h3>
            <textarea
              required
              rows={6}
              value={form.lettreMotivation}
              onChange={(e) => setForm({ ...form, lettreMotivation: e.target.value })}
              placeholder="Expliquez ce qui vous motive pour ce poste, et ce que vous pourriez y apporter…"
              maxLength={2000}
              className={`${CHAMP} resize-none leading-relaxed`}
            />
            <p className="text-xs text-stone-400 mt-1 text-end">
              {form.lettreMotivation.length} / 2000 caractères
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="sm:flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi || !cv}
              className="sm:flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {envoi ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Envoyer ma candidature
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}