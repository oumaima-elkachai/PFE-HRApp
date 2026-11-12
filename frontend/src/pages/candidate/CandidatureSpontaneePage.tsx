// src/pages/candidate/CandidatureSpontaneePage.tsx
//
// Le candidat postule sans cibler d'offre. Le formulaire est
// pré-rempli depuis son profil : il ne ressaisit que la lettre de
// motivation et le poste visé.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// L'en-tête et la carte latérale passent au kit, et la mise en page
// se replie en dessous de 1280 px. Les deux grilles à deux colonnes
// du formulaire tenaient sur une ligne même à 360 px de large.
//
// La logique du dépôt de CV, des conditions d'envoi et de l'écran de
// confirmation n'a pas bougé.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, FileText, Upload, CheckCircle2, AlertTriangle, Sparkles,
  ArrowLeft, Briefcase, X, Target,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { EnTete, Jauge, CARTE, CHAMP } from '../../components/ui/kit';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

const TAILLE_MAX = 5 * 1024 * 1024;
const LETTRE_MIN = 100;

// Au-delà, le recruteur ne lit plus : autant le dire pendant la saisie.
const LETTRE_CONFORT = 1500;

const NIVEAUX = ['Bac', 'Bac+2 / BTS / DUT', 'Licence', 'Master', 'Ingénieur', 'Doctorat'];

interface ProfilCandidat {
  telephone?: string;
  posteVise?: string;
  niveauEtude?: string;
  experience?: string;
  linkedin?: string;
  competences?: string[];
  cvKey?: string | null;
  cvFileName?: string | null;
}

interface ResultatSoumission {
  id: string;
  scoreCV: number;
  statut: string;
  recommendation?: string;
  pointsForts?: string[];
  message: string;
}

export default function CandidatureSpontaneePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profil, setProfil] = useState<ProfilCandidat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<ResultatSoumission | null>(null);

  // Le CV du profil sert par défaut ; ce champ ne contient un fichier
  // que si le candidat choisit d'en joindre un autre pour cette
  // candidature précise.
  const [cvRemplacement, setCvRemplacement] = useState<File | null>(null);
  const [utiliserCvProfil, setUtiliserCvProfil] = useState(true);

  const [form, setForm] = useState({
    posteVise: '',
    telephone: '',
    niveauEtude: '',
    experience: '',
    competences: '',
    lettreMotivation: '',
    linkedin: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/candidat/profil') as any;
        const p: ProfilCandidat = res?.data?.profil ?? {};
        setProfil(p);
        setForm((f) => ({
          ...f,
          posteVise: p.posteVise || '',
          telephone: p.telephone || '',
          niveauEtude: p.niveauEtude || '',
          experience: p.experience || '',
          linkedin: p.linkedin || '',
          competences: (p.competences || []).join(', '),
        }));
      } catch {
        // Un profil absent n'empêche pas de postuler : le formulaire
        // reste vide, le candidat le remplit.
        setProfil({});
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  // Sans CV au profil, le dépôt de fichier est le seul choix : laisser
  // la case sur « CV du profil » grisait un bloc pourtant obligatoire.
  useEffect(() => {
    if (profil && !profil.cvKey) setUtiliserCvProfil(false);
  }, [profil]);

  const cvUtilise = utiliserCvProfil && profil?.cvKey
    ? profil.cvFileName ?? 'CV du profil'
    : cvRemplacement?.name ?? null;

  const longueurLettre = form.lettreMotivation.trim().length;
  const competences = form.competences.split(',').map((c) => c.trim()).filter(Boolean);

  // Les quatre conditions d'envoi, affichées pendant la saisie : un
  // formulaire qui ne révèle ses exigences qu'au clic décourage.
  const conditions = [
    { libelle: 'Poste visé', remplie: Boolean(form.posteVise.trim()) },
    { libelle: 'CV joint', remplie: Boolean(cvUtilise) },
    { libelle: `Lettre de ${LETTRE_MIN} caractères`, remplie: longueurLettre >= LETTRE_MIN },
    { libelle: 'Compétences renseignées', remplie: competences.length > 0, facultative: true },
  ];

  const pret = conditions.filter((c) => !c.facultative).every((c) => c.remplie);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (!form.posteVise.trim()) {
      setErreur('Indiquez le poste que vous visez');
      return;
    }
    if (longueurLettre < LETTRE_MIN) {
      setErreur(`La lettre de motivation doit faire au moins ${LETTRE_MIN} caractères`);
      return;
    }
    if (!cvUtilise) {
      setErreur('Joignez un CV, ou déposez-en un dans votre profil');
      return;
    }

    setEnvoi(true);
    try {
      const donnees = new FormData();
      donnees.append('nom', (user as any)?.nom ?? '');
      donnees.append('prenom', (user as any)?.prenom ?? '');
      donnees.append('email', (user as any)?.email ?? '');
      donnees.append('telephone', form.telephone);
      donnees.append('posteVise', form.posteVise);
      donnees.append('niveauEtude', form.niveauEtude);
      donnees.append('experience', form.experience);
      donnees.append('lettreMotivation', form.lettreMotivation);
      donnees.append('linkedin', form.linkedin);
      donnees.append('competences', JSON.stringify(competences));

      // Aucun offreId : c'est ce qui distingue une candidature
      // spontanée. Le serveur omet alors l'attribut, ce qui l'exclut
      // de l'index par offre.
      if (cvRemplacement) {
        donnees.append('cv', cvRemplacement);
      } else {
        donnees.append('reutiliserCvProfil', 'true');
      }

      const res = await api.post('/candidatures', donnees) as any;
      setResultat(res?.data?.candidature ?? null);
    } catch (e: any) {
      setErreur(e?.erreur ?? "Impossible d'envoyer la candidature");
      setEnvoi(false);
    }
  };

  // ── Chargement ───────────────────────────────────────────────

  if (chargement) {
    return (
      <Layout>
        <div className="px-4 sm:px-8 py-16 sm:py-20 flex flex-col items-center">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-stone-500">Chargement de votre profil…</p>
        </div>
      </Layout>
    );
  }

  // ── Confirmation ─────────────────────────────────────────────

  if (resultat) {
    const retenu = resultat.statut !== 'REFUSE';

    return (
      <Layout>
        <div className="max-w-xl mx-auto px-4 sm:px-8 py-8 sm:py-12">

          <div
            className="rounded-2xl p-7 sm:p-8 text-center text-white mb-4"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)' }}
          >
            <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-white/90" />
            <h1 className="text-xl font-bold mb-2">Candidature envoyée</h1>
            <p className="text-sm text-white/80 leading-relaxed">{resultat.message}</p>
          </div>

          <div className={`${CARTE} p-5 sm:p-6 mb-4`}>
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Analyse de votre dossier
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-purple-50 text-purple-600">
                <Sparkles className="w-2.5 h-2.5" />
                Automatique
              </span>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 ${
                  resultat.scoreCV >= 65
                    ? 'bg-brand-500/10 text-brand-texte'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                {resultat.scoreCV}
              </div>
              <div className="flex-1 min-w-0">
                <Jauge
                  valeur={resultat.scoreCV}
                  tonalite={resultat.scoreCV >= 65 ? 'brand' : 'amber'}
                />
                <p className="text-xs text-stone-500 mt-1.5">
                  Score d'adéquation avec le poste visé
                </p>
              </div>
            </div>

            {(resultat.pointsForts?.length ?? 0) > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                  Points forts relevés
                </div>
                <ul className="space-y-1.5">
                  {resultat.pointsForts!.map((p) => (
                    <li key={p} className="text-sm flex items-start gap-2 text-stone-700">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-texte" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Un score modeste n'est pas un rejet : le dire évite
                qu'un candidat se décourage à tort. */}
            {!retenu && (
              <p className="text-xs text-stone-500 mt-4 pt-4 border-t border-stone-100 leading-relaxed">
                Ce score est une première lecture automatique. Votre dossier reste
                consultable par l'équipe de recrutement et sera conservé pour nos
                prochains besoins.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate('/candidat/mes-candidatures')}
              className="sm:flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-3 text-sm font-bold transition-colors"
            >
              Voir mes candidatures
            </button>
            <button
              onClick={() => navigate('/candidat/offres')}
              className="sm:flex-1 border border-stone-200 bg-surface rounded-xl py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Parcourir les offres
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Formulaire ───────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <Layout>

        <EnTete
          fil={['Ma recherche', 'Candidature spontanée']}
          titre="Candidature spontanée"
          sousTitre="Aucune offre ne correspond à votre profil ? Envoyez votre dossier : il sera étudié et conservé pour nos futurs recrutements."
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4 items-start">

            {/* ── Formulaire ── */}
            <form onSubmit={soumettre} className="space-y-4 min-w-0">

              {erreur && (
                <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-500">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {erreur}
                </div>
              )}

              <div className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
                <div className="flex items-center gap-2 mb-5">
                  <Briefcase className="w-4 h-4 text-brand-texte" />
                  <h3 className="font-bold text-stone-800">Votre projet</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Poste visé *
                    </label>
                    <input
                      value={form.posteVise}
                      onChange={(e) => setForm({ ...form, posteVise: e.target.value })}
                      placeholder="Développeur full stack, Chef de projet…"
                      className={CHAMP}
                    />
                  </div>

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
                        {NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        Expérience
                      </label>
                      <input
                        value={form.experience}
                        onChange={(e) => setForm({ ...form, experience: e.target.value })}
                        placeholder="2 ans en développement web"
                        className={CHAMP}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Compétences
                    </label>
                    <input
                      value={form.competences}
                      onChange={(e) => setForm({ ...form, competences: e.target.value })}
                      placeholder="React, Node.js, AWS…"
                      className={CHAMP}
                    />

                    {/* Les compétences deviennent des jetons visibles :
                        le candidat vérifie sa saisie sans relire. */}
                    {competences.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {competences.map((c, i) => (
                          <span
                            key={`${c}-${i}`}
                            className="text-[10px] font-bold px-2 py-1 rounded-full bg-brand-500/10 text-brand-texte"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                      Séparées par des virgules. Ce sont elles qui déterminent votre
                      score de correspondance.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        Téléphone
                      </label>
                      <input
                        value={form.telephone}
                        onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                        placeholder="+216 XX XXX XXX"
                        className={CHAMP}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1.5">
                        LinkedIn
                      </label>
                      <input
                        value={form.linkedin}
                        onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                        placeholder="https://linkedin.com/in/…"
                        className={CHAMP}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── CV ── */}
              <div style={{ animationDelay: '60ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
                <div className="flex items-center gap-2 mb-5">
                  <FileText className="w-4 h-4 text-brand-texte" />
                  <h3 className="font-bold text-stone-800">Votre CV</h3>
                </div>

                {profil?.cvKey && (
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl mb-2.5 cursor-pointer border transition-colors ${
                      utiliserCvProfil
                        ? 'bg-brand-500/10 border-brand-500'
                        : 'bg-stone-50 border-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={utiliserCvProfil}
                      onChange={() => { setUtiliserCvProfil(true); setCvRemplacement(null); }}
                      className="mt-0.5 accent-brand-texte"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-800">
                        Utiliser le CV de mon profil
                      </div>
                      <div className="text-xs text-stone-500 truncate">
                        {profil.cvFileName ?? 'Curriculum vitae'}
                      </div>
                    </div>
                  </label>
                )}

                {/* Un bloc absent sans explication laisse croire à un
                    défaut : dire pourquoi il manque vaut mieux. */}
                {profil && !profil.cvKey && (
                  <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-2.5 text-xs bg-amber-50 text-amber-700 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Aucun CV n'est enregistré sur votre profil. Déposez-en un ici,
                      ou ajoutez-le à votre profil pour le réutiliser à chaque
                      candidature.
                    </span>
                  </div>
                )}

                {/* Un div, pas un label : imbriqué dans un autre label,
                    le clic sur « Parcourir » basculait le bouton radio
                    au lieu d'ouvrir le sélecteur de fichier. */}
                <div
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    !utiliserCvProfil
                      ? 'bg-brand-500/10 border-brand-500'
                      : 'bg-stone-50 border-transparent'
                  }`}
                >
                  {profil?.cvKey && (
                    <input
                      type="radio"
                      checked={!utiliserCvProfil}
                      onChange={() => setUtiliserCvProfil(false)}
                      className="mt-0.5 accent-brand-texte cursor-pointer"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-800 mb-2">
                      {profil?.cvKey ? 'Joindre un autre CV' : 'Joindre mon CV *'}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors shrink-0">
                        <Upload className="w-4 h-4" />
                        Parcourir
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > TAILLE_MAX) {
                              setErreur('Le fichier dépasse 5 Mo');
                              return;
                            }
                            setCvRemplacement(f);
                            setUtiliserCvProfil(false);
                            setErreur('');
                          }}
                        />
                      </label>

                      {cvRemplacement && (
                        <div className="flex items-center gap-2 bg-surface border border-stone-200 rounded-xl px-3 py-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-brand-texte shrink-0" />
                          <span className="text-xs text-stone-700 truncate">
                            {cvRemplacement.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCvRemplacement(null)}
                            aria-label="Retirer le fichier"
                            className="shrink-0"
                          >
                            <X className="w-3.5 h-3.5 text-stone-400 hover:text-stone-600" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-stone-400 mt-2">PDF ou Word, 5 Mo maximum</p>
                  </div>
                </div>
              </div>

              {/* ── Lettre ── */}
              <div style={{ animationDelay: '120ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
                <div className="flex items-center gap-2 mb-5">
                  <Send className="w-4 h-4 text-brand-texte" />
                  <h3 className="font-bold text-stone-800">Lettre de motivation</h3>
                </div>

                <textarea
                  value={form.lettreMotivation}
                  onChange={(e) => setForm({ ...form, lettreMotivation: e.target.value })}
                  rows={10}
                  placeholder="Expliquez ce qui vous motive, ce que vous recherchez, et ce que vous pourriez apporter…"
                  className={`${CHAMP} resize-none leading-relaxed`}
                />

                <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                  <span className={`text-xs ${
                    longueurLettre < LETTRE_MIN || longueurLettre > LETTRE_CONFORT
                      ? 'text-amber-600' : 'text-stone-400'
                  }`}>
                    {longueurLettre} caractères
                    {longueurLettre < LETTRE_MIN && ` · ${LETTRE_MIN - longueurLettre} restants`}
                  </span>

                  {/* Une lettre trop longue n'est pas lue en entier :
                      le signaler vaut mieux qu'un refus silencieux. */}
                  {longueurLettre > LETTRE_CONFORT && (
                    <span className="text-xs text-amber-600">
                      Au-delà de {LETTRE_CONFORT} caractères, l'essentiel se perd
                    </span>
                  )}
                </div>

                <div className="mt-2">
                  <Jauge
                    valeur={Math.min(100, (longueurLettre / LETTRE_CONFORT) * 100)}
                    hauteur="h-1"
                    tonalite={longueurLettre < LETTRE_MIN ? 'amber' : 'brand'}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={envoi || !pret}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
              >
                {envoi
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4" />}
                {envoi ? 'Envoi en cours…' : 'Envoyer ma candidature'}
              </button>
            </form>

            {/* ── Liste de contrôle ── */}
            {/* Les conditions d'envoi affichées pendant la saisie : un
                formulaire qui ne les révèle qu'au clic décourage. */}
            <div className="xl:sticky xl:top-6 space-y-4 min-w-0">

              <div style={{ animationDelay: '60ms' }} className={`hrup-monter ${CARTE} overflow-hidden`}>
                <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                  <h3 className="font-bold text-stone-800 text-sm">Avant d'envoyer</h3>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {conditions.filter((c) => c.remplie).length} sur {conditions.length}
                  </p>
                </div>

                <div className="p-3 space-y-1.5">
                  {conditions.map((c) => (
                    <div
                      key={c.libelle}
                      className={`flex items-center gap-2.5 p-2 rounded-xl ${
                        c.remplie ? 'bg-brand-500/5' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                        c.remplie ? 'bg-brand-500' : 'bg-stone-100'
                      }`}>
                        {c.remplie && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-medium ${
                          c.remplie ? 'text-stone-800' : 'text-stone-400'
                        }`}>
                          {c.libelle}
                        </div>
                        {c.facultative && (
                          <div className="text-[10px] text-stone-400">facultatif</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ animationDelay: '120ms' }} className={`hrup-monter ${CARTE} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-brand-texte" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    Ce qui suit
                  </h4>
                </div>

                <ol className="space-y-2.5">
                  {([
                    'Votre CV est analysé automatiquement',
                    "Un score d’adéquation est calculé",
                    "L’équipe de recrutement examine le dossier",
                    'Vous êtes informé à chaque étape',
                  ] as string[]).map((etape, i) => (
                    <li key={etape} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-lg bg-stone-50 text-[10px] font-bold text-stone-500 flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-stone-600 leading-relaxed">{etape}</span>
                    </li>
                  ))}
                </ol>

                <p className="text-xs text-stone-400 mt-3 pt-3 border-t border-stone-50 leading-relaxed">
                  Une candidature spontanée est conservée et ressortie dès qu'une offre
                  correspond à votre profil.
                </p>
              </div>
            </div>
          </div>
        </div>

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}