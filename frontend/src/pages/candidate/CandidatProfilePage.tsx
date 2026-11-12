// src/pages/candidate/CandidatProfilePage.tsx
//
// Le profil du candidat : ses informations, son CV, ses candidatures
// récentes.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// 1. L'échelle de couleurs n'était pas la même qu'ailleurs :
//    `brand-600`, `brand-800`, `brand-100` ici, `brand-500`,
//    `brand-600` et `bg-brand-500/10` sur toutes les autres pages.
//    Deux indigos légèrement différents, côte à côte, et le pied de
//    page portait encore « HR UP ».
//
// 2. La suppression du CV passait par `confirm()`, la boîte native du
//    navigateur. Aucune autre page de l'application n'en utilise, et
//    elle ne ressemble à rien du reste. Remplacée par une
//    confirmation au même endroit que l'action.
//
// 3. Deux colonnes figées quelle que soit la largeur : illisible en
//    dessous de 900 px.
//
// ── Pourquoi le CV s'affiche et ne se télécharge pas ────────────────
//
// Le candidat doit pouvoir vérifier ce que le recruteur verra. Un
// téléchargement l'oblige à ouvrir un fichier hors de l'application
// pour s'en assurer.

import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Phone, Briefcase, Calendar, Pencil, X, Save, CheckCircle,
  ExternalLink, Clock, FileText, XCircle, Upload, Trash2, Eye,
  Loader2, AlertTriangle,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { EnTete, Toast, CARTE, CHAMP } from '../../components/ui/kit';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

// ── Types ──────────────────────────────────────────────────────────

interface ProfilCandidat {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  telephone: string;
  posteVise: string;
  niveauEtude: string;
  experience: string;
  linkedin: string;
  competences: string[];
  cvKey?: string | null;
  cvFileName?: string | null;
  cvTailleOctets?: number;
  cvDeposeLe?: string;
}

interface Candidature {
  id: string;
  posteVise?: string;
  offreTitre?: string;
  statut: string;
  creeLe: string;
  scoreTotal?: number;
}

const STYLE_STATUT: Record<string, {
  libelle: string; bg: string; text: string;
  icone: React.ComponentType<{ className?: string }>;
}> = {
  SOUMIS:          { libelle: 'Soumise',         bg: 'bg-blue-50',      text: 'text-blue-600',    icone: FileText },
  PRESELECTION:    { libelle: 'Présélectionné',  bg: 'bg-amber-50',     text: 'text-amber-600',   icone: CheckCircle },
  QUIZ_EN_ATTENTE: { libelle: 'Quiz à venir',    bg: 'bg-amber-50',     text: 'text-amber-600',   icone: Clock },
  QUIZ_ENVOYE:     { libelle: 'Quiz envoyé',     bg: 'bg-amber-50',     text: 'text-amber-600',   icone: Clock },
  QUIZ_TERMINE:    { libelle: 'Quiz passé',      bg: 'bg-purple-50',    text: 'text-purple-600',  icone: CheckCircle },
  ENTRETIEN:       { libelle: 'Entretien',       bg: 'bg-purple-50',    text: 'text-purple-600',  icone: Clock },
  OFFRE:           { libelle: 'Offre reçue',     bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: CheckCircle },
  EMBAUCHE:        { libelle: 'Embauché',        bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: CheckCircle },
  REFUSE:          { libelle: 'Non retenu',      bg: 'bg-red-50',       text: 'text-red-500',     icone: XCircle },
};

const styleStatut = (s: string) =>
  STYLE_STATUT[s] ?? { libelle: 'En cours', bg: 'bg-stone-100', text: 'text-stone-500', icone: Clock };

const TAILLE_MAX = 5 * 1024 * 1024;

const formaterTaille = (octets?: number) =>
  !octets ? ''
    : octets > 1048576 ? `${(octets / 1048576).toFixed(1)} Mo`
    : `${Math.round(octets / 1024)} Ko`;

// ── Avatar ──────────────────────────────────────────────────────────

function Avatar({ nom }: { nom: string }) {
  const initiales = nom.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-brand-500 flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-md shrink-0">
      {initiales}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function CandidatProfilePage() {
  const { user } = useAuth();

  const [profil, setProfil] = useState<ProfilCandidat | null>(null);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [toast, setToast] = useState('');
  const [erreur, setErreur] = useState('');

  const [cvOccupe, setCvOccupe] = useState(false);
  const [cvASupprimer, setCvASupprimer] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);

  const [form, setForm] = useState({
    telephone: '',
    posteVise: '',
    niveauEtude: '',
    experience: '',
    linkedin: '',
    competences: '',
  });

  const remplir = (p: ProfilCandidat) => {
    setForm({
      telephone: p.telephone || '',
      posteVise: p.posteVise || '',
      niveauEtude: p.niveauEtude || '',
      experience: p.experience || '',
      linkedin: p.linkedin || '',
      competences: (p.competences || []).join(', '),
    });
  };

  const charger = useCallback(async () => {
    try {
      setChargement(true);
      const [resProfil, resCandidatures] = await Promise.allSettled([
        api.get('/candidat/profil') as any,
        api.get('/mes-candidatures') as any,
      ]);

      if (resProfil.status === 'fulfilled') {
        const p = resProfil.value?.data?.profil;
        if (p) { setProfil(p); remplir(p); }
      }
      // Le serveur renvoie `candidatures` depuis la fusion des tables :
      // lire `candidats` donnait systématiquement une liste vide.
      if (resCandidatures.status === 'fulfilled') {
        setCandidatures(resCandidatures.value?.data?.candidatures ?? []);
      }
    } catch (e) {
      console.error('Chargement du profil :', e);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Le CV est affiché dans la page, pas téléchargé. L'adresse
  // temporaire est révoquée au démontage pour ne pas fuir de mémoire.
  useEffect(() => {
    if (!profil?.cvKey) { setApercu(null); return; }

    let url: string | null = null;
    let annule = false;

    (async () => {
      try {
        const blob = await api.get('/candidat/profil/cv', {
          responseType: 'blob',
        }) as unknown as Blob;
        if (annule) return;
        url = URL.createObjectURL(blob);
        setApercu(url);
      } catch {
        setApercu(null);
      }
    })();

    return () => {
      annule = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [profil?.cvKey]);

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreur('');
    try {
      const res = await api.put('/candidat/profil', form) as any;
      const p = res?.data?.profil;
      if (p) { setProfil(p); remplir(p); }
      setEdition(false);
      setToast('Profil enregistré');
    } catch (e: any) {
      setErreur(e?.erreur ?? "Impossible d'enregistrer le profil");
    } finally {
      setEnregistrement(false);
    }
  };

  const deposerCv = async (fichier: File) => {
    if (fichier.size > TAILLE_MAX) {
      setErreur('Le fichier dépasse 5 Mo');
      return;
    }
    setCvOccupe(true);
    setErreur('');
    try {
      const donnees = new FormData();
      donnees.append('cv', fichier);
      const res = await api.post('/candidat/profil/cv', donnees) as any;
      const p = res?.data?.profil;
      if (p) setProfil(p);
      setToast('CV enregistré');
    } catch (e: any) {
      setErreur(e?.erreur ?? "Impossible d'enregistrer le CV");
    } finally {
      setCvOccupe(false);
    }
  };

  const supprimerCv = async () => {
    setCvOccupe(true);
    setCvASupprimer(false);
    try {
      const res = await api.delete('/candidat/profil/cv') as any;
      const p = res?.data?.profil;
      if (p) setProfil(p);
      setToast('CV supprimé');
    } catch (e: any) {
      setErreur(e?.erreur ?? 'Impossible de supprimer le CV');
    } finally {
      setCvOccupe(false);
    }
  };

  const nomComplet = user
    ? `${(user as any).prenom ?? ''} ${(user as any).nom ?? ''}`.trim() || 'Candidat'
    : 'Candidat';

  const stats = {
    total: candidatures.length,
    enCours: candidatures.filter((c) => !['EMBAUCHE', 'REFUSE'].includes(c.statut)).length,
    embauche: candidatures.filter((c) => c.statut === 'EMBAUCHE').length,
  };

  const competences = form.competences.split(',').map((c) => c.trim()).filter(Boolean);

  // ── Chargement ──

  if (chargement) {
    return (
      <Layout>
        <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl animate-pulse space-y-5">
          <div className="h-8 bg-stone-100 rounded w-48 mb-7" />
          <div className={`${CARTE} h-40`} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`${CARTE} h-64`} />
            <div className={`${CARTE} h-64`} />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Espace candidat', 'Mon profil']}
          titre="Mon profil"
          sousTitre="Ces informations sont celles que le recruteur consulte."
        >
          {edition && (
            <button
              onClick={() => { setEdition(false); if (profil) remplir(profil); }}
              className="flex items-center gap-2 border border-stone-200 bg-surface text-stone-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-stone-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Annuler
            </button>
          )}
          <button
            onClick={() => (edition ? enregistrer() : setEdition(true))}
            disabled={enregistrement}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
          >
            {enregistrement
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : edition ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            {enregistrement ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Modifier'}
          </button>
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl space-y-5">

          {erreur && (
            <div className="flex items-start gap-2 bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Carte d'identité ── */}
          <div className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <Avatar nom={nomComplet} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    Candidat
                  </span>
                  {stats.embauche > 0 && (
                    <span className="bg-brand-500/10 text-brand-texte text-xs px-2.5 py-0.5 rounded-full font-bold">
                      Embauché
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-stone-800 mt-1">{nomComplet}</h2>
                <p className="text-sm text-stone-500 mb-2">
                  {form.posteVise ? `Recherche : ${form.posteVise}` : "En recherche d'emploi"}
                </p>

                <div className="flex items-center gap-4 text-xs text-stone-500 flex-wrap">
                  <span className="flex items-center gap-1 min-w-0">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{(user as any)?.email ?? profil?.email}</span>
                  </span>
                  {form.telephone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {form.telephone}
                    </span>
                  )}
                  {form.linkedin && (
                    <a
                      href={form.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-brand-texte hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>

              <div className="bg-stone-50 rounded-xl p-4 text-center border border-stone-200 w-full sm:w-auto sm:min-w-[9rem] shrink-0">
                <div className="text-2xl font-bold text-brand-texte mb-1">{stats.total}</div>
                <div className="text-xs font-bold text-stone-600">
                  Candidature{stats.total > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-stone-400 mt-1">{stats.enCours} en cours</div>
              </div>
            </div>
          </div>

          {/* ── Informations et contact ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            <div style={{ animationDelay: '60ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
              <div className="flex items-center gap-2 mb-5">
                <Briefcase className="w-4 h-4 text-brand-texte" />
                <h3 className="font-bold text-stone-800">Informations</h3>
              </div>

              <div className="space-y-4">
                {([
                  ['posteVise', 'Poste visé', 'Développeur back-end'],
                  ['niveauEtude', "Niveau d'étude", 'Licence, Master, Ingénieur…'],
                  ['experience', 'Expérience', '2 ans en développement web'],
                  ['linkedin', 'Profil LinkedIn', 'https://linkedin.com/in/…'],
                ] as [keyof typeof form, string, string][]).map(([cle, libelle, exemple]) => (
                  <div key={cle}>
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                      {libelle}
                    </div>
                    {edition ? (
                      <input
                        value={form[cle]}
                        onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
                        placeholder={exemple}
                        className={CHAMP}
                      />
                    ) : (
                      <div className="text-sm font-medium text-stone-800 truncate">
                        {form[cle] || '—'}
                      </div>
                    )}
                  </div>
                ))}

                <div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    Compétences
                  </div>
                  {edition ? (
                    <>
                      <input
                        value={form.competences}
                        onChange={(e) => setForm({ ...form, competences: e.target.value })}
                        placeholder="React, Node.js, AWS…"
                        className={CHAMP}
                      />
                      <p className="text-xs text-stone-400 mt-1.5">
                        Séparées par des virgules. Ce sont elles qui déterminent
                        votre score de correspondance avec les offres.
                      </p>
                    </>
                  ) : competences.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {competences.map((c, i) => (
                        <span
                          key={`${c}-${i}`}
                          className="text-xs bg-brand-500/10 text-brand-texte px-2.5 py-0.5 rounded-full font-bold"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-stone-400">—</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ animationDelay: '120ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
              <div className="flex items-center gap-2 mb-5">
                <Mail className="w-4 h-4 text-brand-texte" />
                <h3 className="font-bold text-stone-800">Contact</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-brand-texte" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Adresse électronique
                    </div>
                    <div className="text-sm text-stone-800 truncate">
                      {(user as any)?.email ?? profil?.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-brand-texte" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Téléphone
                    </div>
                    {edition ? (
                      <input
                        value={form.telephone}
                        onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                        placeholder="+216 XX XXX XXX"
                        className={`${CHAMP} mt-1`}
                      />
                    ) : (
                      <div className="text-sm text-stone-800">{form.telephone || '—'}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-brand-texte" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Candidatures déposées
                    </div>
                    <div className="text-sm text-stone-800">
                      {stats.total} candidature{stats.total > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── CV ── */}
          <div style={{ animationDelay: '180ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
            <div className="flex items-start sm:items-center justify-between gap-3 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-texte" />
                <h3 className="font-bold text-stone-800">Mon CV</h3>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors">
                  {cvOccupe
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Upload className="w-4 h-4" />}
                  {profil?.cvKey ? 'Remplacer' : 'Déposer un CV'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    disabled={cvOccupe}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) deposerCv(f);
                      e.target.value = '';
                    }}
                  />
                </label>

                {profil?.cvKey && (
                  <button
                    onClick={() => setCvASupprimer(true)}
                    disabled={cvOccupe}
                    className="p-2 rounded-xl border border-stone-200 hover:bg-red-50 transition-colors"
                    title="Supprimer le CV"
                  >
                    <Trash2 className="w-4 h-4 text-stone-400 hover:text-red-500" />
                  </button>
                )}
              </div>
            </div>

            {/* La confirmation reste dans la page, à côté de l'action
                qu'elle concerne. */}
            {cvASupprimer && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4 flex items-start gap-3 flex-wrap">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                <p className="text-sm text-stone-700 flex-1 min-w-[12rem]">
                  Supprimer votre CV ? Vos candidatures déjà envoyées gardent le
                  leur ; seules les prochaines seront concernées.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCvASupprimer(false)}
                    className="text-sm font-medium px-3 py-1.5 rounded-xl border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={supprimerCv}
                    className="text-sm font-bold px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )}

            {!profil?.cvKey ? (
              <div className="border-2 border-dashed border-stone-200 rounded-xl py-10 sm:py-12 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3 text-stone-300" />
                <p className="text-sm text-stone-500 mb-1">Aucun CV enregistré</p>
                <p className="text-xs text-stone-400">PDF ou Word, 5 Mo maximum</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50 rounded-xl mb-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-brand-texte" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-800 truncate">
                        {profil.cvFileName ?? 'Curriculum vitae'}
                      </div>
                      <div className="text-xs text-stone-400">
                        {formaterTaille(profil.cvTailleOctets)}
                        {profil.cvDeposeLe
                          && ` · déposé le ${new Date(profil.cvDeposeLe).toLocaleDateString('fr-FR')}`}
                      </div>
                    </div>
                  </div>

                  {apercu && (
                    <a
                      href={apercu}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-bold text-brand-texte hover:underline shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Plein écran
                    </a>
                  )}
                </div>

                {apercu ? (
                  // Seul un PDF s'affiche dans un cadre : un document
                  // Word n'est pas lisible par le navigateur.
                  profil.cvFileName?.toLowerCase().endsWith('.pdf') !== false ? (
                    <iframe
                      src={apercu}
                      title="Aperçu du CV"
                      className="w-full rounded-xl border border-stone-200"
                      style={{ height: 520 }}
                    />
                  ) : (
                    <div className="border border-stone-200 rounded-xl py-10 text-center">
                      <p className="text-sm text-stone-500">
                        L'aperçu n'est disponible que pour les fichiers PDF
                      </p>
                    </div>
                  )
                ) : (
                  <div className="border border-stone-200 rounded-xl py-16 flex flex-col items-center">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-texte mb-2" />
                    <p className="text-xs text-stone-400">Chargement de l'aperçu…</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Candidatures récentes ── */}
          <div style={{ animationDelay: '240ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
            <div className="flex items-center gap-2 mb-5">
              <Briefcase className="w-4 h-4 text-brand-texte" />
              <h3 className="font-bold text-stone-800">Mes candidatures récentes</h3>
            </div>

            {candidatures.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">
                Aucune candidature déposée.
              </p>
            ) : (
              <div className="space-y-3">
                {candidatures.slice(0, 4).map((c) => {
                  const st = styleStatut(c.statut);
                  const Icone = st.icone;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl flex-wrap"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center shrink-0">
                          <Briefcase className="w-4 h-4 text-brand-texte" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-stone-800 truncate">
                            {c.offreTitre ?? c.posteVise ?? 'Candidature spontanée'}
                          </div>
                          <div className="text-xs text-stone-400">
                            {new Date(c.creeLe).toLocaleDateString('fr-FR')}
                            {c.scoreTotal != null && ` · score ${c.scoreTotal}`}
                          </div>
                        </div>
                      </div>

                      <span className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full shrink-0 ${st.bg} ${st.text}`}>
                        <Icone className="w-3.5 h-3.5" />
                        {st.libelle}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-stone-400 pt-2">
            <span className="text-brand-texte font-semibold">HR UP</span>
            {' · Espace candidat · Tunisie 2026'}
          </p>
        </div>

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}