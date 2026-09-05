// src/pages/auth/RegisterCandidatPage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Lock, Phone, Briefcase,
  Eye, EyeOff, CheckCircle, ArrowRight,
} from 'lucide-react';
import api from '../../services/api';

export default function RegisterCandidatPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading]   = useState(false);
  const [erreur,  setErreur]    = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [success, setSuccess]   = useState(false);

  const [form, setForm] = useState({
    prenom:       '',
    nom:          '',
    email:        '',
    telephone:    '',
    motDePasse:   '',
    confirmPwd:   '',
    posteVise:    '',
    niveauEtude:  '',
    experience:   '',
    competences:  '',
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // ── Étape 1 : Infos de base ──
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    if (form.motDePasse !== form.confirmPwd) {
      setErreur('Les mots de passe ne correspondent pas.');
      return;
    }
    if (form.motDePasse.length < 6) {
      setErreur('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setStep(2);
  };

  // ── Étape 2 : Profil + Soumission ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErreur('');
    try {
      // 1️⃣ Créer le compte utilisateur
      await api.post('/auth/inscription', {
        prenom:     form.prenom,
        nom:        form.nom,
        email:      form.email,
        telephone:  form.telephone,
        motDePasse: form.motDePasse,
        role:       'CANDIDAT',
      });

      // 2️⃣ Créer la fiche candidat
      await api.post('/candidats', {
        prenom:      form.prenom,
        nom:         form.nom,
        email:       form.email,
        telephone:   form.telephone,
        posteVise:   form.posteVise,
        niveauEtude: form.niveauEtude,
        experience:  form.experience,
        competences: form.competences
          .split(',')
          .map(c => c.trim())
          .filter(Boolean),
      });

      setSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.erreur ?? err?.message ?? 'Erreur lors de la création du compte.';
      setErreur(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Écran succès ──
  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 bg-[#d8f3dc] rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-[#2d6a4f]" />
          </div>
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">
            Compte créé !
          </h2>
          <p className="text-sm text-[#6b7280] mb-6 leading-relaxed">
            Votre compte candidat a été créé avec succès.
            Vous pouvez maintenant vous connecter et consulter les offres disponibles.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
          >
            Se connecter
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-[#2d6a4f] px-8 py-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Créer un compte</h1>
              <p className="text-white/70 text-sm">Espace candidat</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-3">
            {[
              { n: 1, label: 'Compte' },
              { n: 2, label: 'Profil' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step >= s.n
                      ? 'bg-white text-[#2d6a4f]'
                      : 'bg-white/20 text-white/60'
                  }`}>
                    {step > s.n ? '✓' : s.n}
                  </div>
                  <span className={`text-sm font-medium ${
                    step >= s.n ? 'text-white' : 'text-white/50'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < 1 && (
                  <div className={`flex-1 h-0.5 rounded w-12 ${
                    step > s.n ? 'bg-white' : 'bg-white/30'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-8 py-7">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
              ❌ {erreur}
            </div>
          )}

          {/* ── ÉTAPE 1 ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <h2 className="text-lg font-bold text-[#1a1a1a] mb-1">
                Informations de connexion
              </h2>
              <p className="text-sm text-[#6b7280] mb-5">
                Ces informations seront utilisées pour vous connecter.
              </p>

              {/* Prénom / Nom */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#374151] block mb-1.5">
                    Prénom *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                    <input
                      required
                      type="text"
                      value={form.prenom}
                      onChange={e => set('prenom', e.target.value)}
                      placeholder="Prénom"
                      className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] block mb-1.5">
                    Nom *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                    <input
                      required
                      type="text"
                      value={form.nom}
                      onChange={e => set('nom', e.target.value)}
                      placeholder="Nom"
                      className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                  />
                </div>
              </div>

              {/* Téléphone */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Téléphone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    type="tel"
                    value={form.telephone}
                    onChange={e => set('telephone', e.target.value)}
                    placeholder="+216 XX XXX XXX"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    required
                    type={showPwd ? 'text' : 'password'}
                    value={form.motDePasse}
                    onChange={e => set('motDePasse', e.target.value)}
                    placeholder="Min. 6 caractères"
                    className="w-full pl-10 pr-10 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmer mot de passe */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    required
                    type={showPwd ? 'text' : 'password'}
                    value={form.confirmPwd}
                    onChange={e => set('confirmPwd', e.target.value)}
                    placeholder="Répéter le mot de passe"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 mt-2"
              >
                Continuer
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ── ÉTAPE 2 ── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-bold text-[#1a1a1a] mb-1">
                Votre profil professionnel
              </h2>
              <p className="text-sm text-[#6b7280] mb-5">
                Ces informations aideront les recruteurs à mieux vous connaître.
              </p>

              {/* Poste visé */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Poste visé *
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    required
                    type="text"
                    value={form.posteVise}
                    onChange={e => set('posteVise', e.target.value)}
                    placeholder="ex: Développeur Full Stack"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                  />
                </div>
              </div>

              {/* Niveau + Expérience */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#374151] block mb-1.5">
                    Niveau d'étude
                  </label>
                  <select
                    value={form.niveauEtude}
                    onChange={e => set('niveauEtude', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f]"
                  >
                    <option value="">Sélectionner</option>
                    {['Bac','Bac+2','Bac+3','Bac+5','Doctorat'].map(n => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] block mb-1.5">
                    Expérience
                  </label>
                  <select
                    value={form.experience}
                    onChange={e => set('experience', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f]"
                  >
                    <option value="">Sélectionner</option>
                    {['Débutant','1-2 ans','3-5 ans','5-10 ans','10+ ans'].map(n => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compétences */}
              <div>
                <label className="text-xs font-medium text-[#374151] block mb-1.5">
                  Compétences{' '}
                  <span className="text-[#9ca3af] font-normal">
                    (séparées par des virgules)
                  </span>
                </label>
                <input
                  type="text"
                  value={form.competences}
                  onChange={e => set('competences', e.target.value)}
                  placeholder="React, Node.js, DynamoDB, AWS..."
                  className="w-full px-3 py-2.5 text-sm border border-[#e5e0d8] rounded-xl bg-[#f5f0e8] focus:outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/20"
                />
                {/* Preview compétences */}
                {form.competences && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {form.competences.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <span key={c} className="text-xs bg-[#d8f3dc] text-[#2d6a4f] px-2.5 py-1 rounded-full font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 border border-[#e5e0d8] rounded-xl py-3 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
                >
                  ← Retour
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? 'Création...' : (
                    <>
                      Créer mon compte
                      <CheckCircle className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Lien login */}
          <p className="text-center text-sm text-[#6b7280] mt-6">
            Déjà un compte ?{' '}
            <Link
              to="/login"
              className="text-[#2d6a4f] font-semibold hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}