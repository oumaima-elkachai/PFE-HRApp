// src/pages/auth/RegisterCandidatPage.tsx

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Lock, Phone, Briefcase, KeyRound,
  Eye, EyeOff, CheckCircle, ArrowRight, Loader2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Politique du pool Cognito : 8 caracteres, majuscule, minuscule,
// chiffre et symbole. La verifier ici evite un aller-retour reseau
// pour un message d'erreur previsible.
const POLITIQUE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

type Etape = 'compte' | 'profil' | 'confirmation' | 'succes';

export default function RegisterCandidatPage() {
  const navigate = useNavigate();
  const { inscription, confirmerInscription } = useAuth();

  const [etape, setEtape] = useState<Etape>('compte');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [code, setCode] = useState('');

  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    motDePasse: '',
    confirmPwd: '',
    posteVise: '',
    niveauEtude: '',
    experience: '',
    competences: '',
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // ── Étape 1 : compte ──
  const validerCompte = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (form.motDePasse !== form.confirmPwd) {
      setErreur('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!POLITIQUE.test(form.motDePasse)) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule, un chiffre et un symbole.');
      return;
    }
    setEtape('profil');
  };

  // ── Étape 2 : profil et création du compte ──
  const creerCompte = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setLoading(true);
    try {
      await inscription({
        email: form.email,
        motDePasse: form.motDePasse,
        prenom: form.prenom,
        nom: form.nom,
      });

      // Le profil professionnel est enregistré à la première
      // connexion : l'utilisateur n'est pas encore authentifié ici,
      // donc aucun jeton ne permettrait d'écrire côté serveur.
      sessionStorage.setItem('terra.profil.initial', JSON.stringify({
        telephone: form.telephone,
        posteVise: form.posteVise,
        niveauEtude: form.niveauEtude,
        experience: form.experience,
        competences: form.competences,
      }));

      setEtape('confirmation');
    } catch (e: any) {
      setErreur(e?.message ?? 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 3 : confirmation du code ──
  const confirmer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setLoading(true);
    try {
      await confirmerInscription(form.email, code.trim());
      setEtape('succes');
    } catch (e: any) {
      setErreur(e?.message ?? 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const champ =
    'w-full ps-10 pe-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-stone-100 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20';

  // ── Écran de succès ──
  if (etape === 'succes') {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-brand-texte" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Compte activé</h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">
            Votre compte candidat est prêt. Connectez-vous pour consulter les offres
            et déposer votre candidature.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-brand-600 hover:bg-brand-800 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
          >
            Se connecter
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const numeroEtape = etape === 'compte' ? 1 : etape === 'profil' ? 2 : 3;

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        <div className="bg-brand-600 px-8 py-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-surface/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Créer un compte</h1>
              <p className="text-white/70 text-sm">Espace candidat</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {[
              { n: 1, label: 'Compte' },
              { n: 2, label: 'Profil' },
              { n: 3, label: 'Activation' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-3 flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      numeroEtape >= s.n ? 'bg-surface text-brand-texte' : 'bg-surface/20 text-white/60'
                    }`}
                  >
                    {numeroEtape > s.n ? '✓' : s.n}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      numeroEtape >= s.n ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-0.5 rounded ${
                      numeroEtape > s.n ? 'bg-surface' : 'bg-surface/30'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-8 py-7">
          {erreur && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Étape 1 ── */}
          {etape === 'compte' && (
            <form onSubmit={validerCompte} className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 mb-1">
                Informations de connexion
              </h2>
              <p className="text-sm text-stone-500 mb-5">
                Ces informations seront utilisées pour vous connecter.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {([['prenom', 'Prénom'], ['nom', 'Nom']] as const).map(([cle, label]) => (
                  <div key={cle}>
                    <label className="text-xs font-medium text-stone-700 block mb-1.5">
                      {label} *
                    </label>
                    <div className="relative">
                      <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                      <input
                        required
                        type="text"
                        value={form[cle]}
                        onChange={(e) => set(cle, e.target.value)}
                        placeholder={label}
                        className={champ}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">Email *</label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="votre@email.com"
                    className={champ}
                  />
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  Un code d'activation y sera envoyé.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="tel"
                    value={form.telephone}
                    onChange={(e) => set('telephone', e.target.value)}
                    placeholder="+216 XX XXX XXX"
                    className={champ}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">
                  Mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    required
                    type={showPwd ? 'text' : 'password'}
                    value={form.motDePasse}
                    onChange={(e) => set('motDePasse', e.target.value)}
                    placeholder="8 caractères minimum"
                    className={`${champ} pe-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-500"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p
                  className="text-xs mt-1"
                  style={{
                    color: !form.motDePasse ? '#9298B0'
                      : POLITIQUE.test(form.motDePasse) ? '#10B981' : '#D4193C',
                  }}
                >
                  Au moins 8 caractères, une majuscule, une minuscule, un chiffre et un symbole.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    required
                    type={showPwd ? 'text' : 'password'}
                    value={form.confirmPwd}
                    onChange={(e) => set('confirmPwd', e.target.value)}
                    placeholder="Répéter le mot de passe"
                    className={champ}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-800 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 mt-2"
              >
                Continuer
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ── Étape 2 ── */}
          {etape === 'profil' && (
            <form onSubmit={creerCompte} className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 mb-1">
                Votre profil professionnel
              </h2>
              <p className="text-sm text-stone-500 mb-5">
                Ces informations pré-rempliront vos futures candidatures.
              </p>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">
                  Poste visé *
                </label>
                <div className="relative">
                  <Briefcase className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    required
                    type="text"
                    value={form.posteVise}
                    onChange={(e) => set('posteVise', e.target.value)}
                    placeholder="ex : Développeur full stack"
                    className={champ}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-700 block mb-1.5">
                    Niveau d'étude
                  </label>
                  <select
                    value={form.niveauEtude}
                    onChange={(e) => set('niveauEtude', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-stone-100 focus:outline-none focus:border-brand-600"
                  >
                    <option value="">Sélectionner</option>
                    {['Bac', 'Bac+2', 'Bac+3', 'Bac+5', 'Doctorat'].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-700 block mb-1.5">
                    Expérience
                  </label>
                  <select
                    value={form.experience}
                    onChange={(e) => set('experience', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-stone-100 focus:outline-none focus:border-brand-600"
                  >
                    <option value="">Sélectionner</option>
                    {['Débutant', '1-2 ans', '3-5 ans', '5-10 ans', '10+ ans'].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">
                  Compétences{' '}
                  <span className="text-stone-400 font-normal">(séparées par des virgules)</span>
                </label>
                <input
                  type="text"
                  value={form.competences}
                  onChange={(e) => set('competences', e.target.value)}
                  placeholder="React, Node.js, AWS…"
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-stone-100 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
                {form.competences && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {form.competences.split(',').map((c) => c.trim()).filter(Boolean).map((c) => (
                      <span
                        key={c}
                        className="text-xs bg-brand-100 text-brand-texte px-2.5 py-1 rounded-full font-medium"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEtape('compte')}
                  className="flex-1 border border-stone-200 rounded-xl py-3 text-sm font-medium hover:bg-stone-100 transition-colors"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 hover:bg-brand-800 text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle className="w-4 h-4" />}
                  {loading ? 'Création…' : 'Créer mon compte'}
                </button>
              </div>
            </form>
          )}

          {/* ── Étape 3 ── */}
          {etape === 'confirmation' && (
            <form onSubmit={confirmer} className="space-y-4">
              <h2 className="text-lg font-bold text-stone-900 mb-1">Activez votre compte</h2>
              <p className="text-sm text-stone-500 mb-5">
                Un code à six chiffres vient d'être envoyé à{' '}
                <strong className="text-stone-900">{form.email}</strong>.
                Pensez à regarder dans vos indésirables.
              </p>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1.5">
                  Code d'activation *
                </label>
                <div className="relative">
                  <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className={`${champ} tracking-[0.4em] text-center font-mono text-lg`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full bg-brand-600 hover:bg-brand-800 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle className="w-4 h-4" />}
                {loading ? 'Vérification…' : 'Activer mon compte'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-stone-500 mt-6">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-brand-texte font-semibold hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}