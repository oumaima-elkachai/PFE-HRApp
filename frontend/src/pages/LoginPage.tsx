// src/pages/Login.tsx
//
// Garde le nom de fichier et le nom du composant que tu avais : tes
// routes importent `Login`, et renommer obligerait à toucher au
// routeur pour rien.
//
// ── Ce qui est préservé de ta version ──────────────────────────────
//
//   useAuth().connexion(email, motDePasse)
//   l'aiguillage par rôle : RH → /admin, EMPLOYE → /employe,
//   le reste → /candidat/offres
//   le panneau d'arguments, les couleurs de la palette
//
// ── Ce qui a été retiré ────────────────────────────────────────────
//
// Le bloc des comptes de démonstration. Il était déjà absent du
// paquet de production, puisqu'il vivait derrière
// `import.meta.env.DEV`, mais il s'affichait en développement — donc
// pendant une démonstration lancée avec `npm run dev`. Des
// identifiants à l'écran le jour d'une soutenance, c'est une question
// qu'on n'a pas envie de se voir poser.
//
// Les clés `login.comptesDemo`, `login.comptesDemoAide` et
// `login.remplir` ne servent plus. Elles ne gênent pas ; tu peux les
// laisser ou les retirer de ton dictionnaire.
//
// ── Ce qui s'ajoute ────────────────────────────────────────────────
//
// L'écran porte maintenant quatre états, et un seul à la fois :
//
//   connexion      l'entrée ordinaire
//   defi           première connexion d'un compte créé par la RH
//   oubliDemande   « envoyez-moi un code »
//   oubliCode      « voici le code, et mon nouveau mot de passe »
//
// Quatre écrans successifs plutôt qu'un formulaire qui s'allonge : on
// ne demande jamais à quelqu'un de lire six champs pour en remplir
// deux.
//
// ── Pourquoi l'état `defi` existe ──────────────────────────────────
//
// Un compte créé par la RH avec `AdminCreateUser` reçoit un mot de
// passe TEMPORAIRE. À la première connexion, Cognito ne délivre aucun
// jeton : il répond par un défi `NEW_PASSWORD_REQUIRED`. L'ancienne
// version lisait `AuthenticationResult`, le trouvait absent et levait
// « Authentification incomplète » — donc aucun salarié invité ne
// pouvait entrer.
//
// ── Pourquoi le lien « Mot de passe oublié » revient ───────────────
//
// Il avait été retiré parce que la page n'existait pas. Elle existe
// maintenant : `cognito.ts` exposait déjà `demanderReinitialisation` et
// `confirmerReinitialisation`, il ne manquait que les deux écrans.

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  KeyRound, Check, MailCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import AuthLayout, { CHAMP_AUTH_ICONE } from '@/components/layout/AuthLayout';

type Mode = 'connexion' | 'defi' | 'oubliDemande' | 'oubliCode';

/** Les règles du pool Cognito. Une seule définition : elles servent à
 *  la première connexion ET à la réinitialisation, et deux copies
 *  finiraient par diverger de la politique du pool. */
function reglesDe(mdp: string, t: (c: any) => string) {
  return [
    { libelle: t('login.regleLongueur'), satisfaite: mdp.length >= 8 },
    { libelle: t('login.regleMajuscule'), satisfaite: /[A-Z]/.test(mdp) },
    { libelle: t('login.regleMinuscule'), satisfaite: /[a-z]/.test(mdp) },
    { libelle: t('login.regleChiffre'), satisfaite: /\d/.test(mdp) },
    { libelle: t('login.regleSymbole'), satisfaite: /[^A-Za-z0-9]/.test(mdp) },
  ];
}

// ── Morceaux partagés ──────────────────────────────────────────────

function Erreur({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 p-3 rounded-xl
        bg-red-50 border border-red-200"
    >
      <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

function Succes({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 p-3 rounded-xl
        bg-emerald-50 border border-emerald-200"
    >
      <Check size={16} className="text-emerald-600 mt-0.5 shrink-0" />
      <p className="text-sm text-emerald-800">{message}</p>
    </div>
  );
}

/** Un champ mot de passe avec son œil. Cinq fois dans cet écran. */
function ChampMotDePasse({
  id, libelle, valeur, onChange, visible, setVisible, autoComplete, autoFocus,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  visible: boolean;
  setVisible: (f: (v: boolean) => boolean) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-stone-600 mb-1.5">
        {libelle}
      </label>
      <div className="relative">
        <Lock
          size={16}
          className="absolute start-3.5 top-1/2 -translate-y-1/2
            text-stone-400 pointer-events-none"
        />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className={CHAMP_AUTH_ICONE + ' pe-11'}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute end-3 top-1/2 -translate-y-1/2
            text-stone-400 hover:text-stone-600 transition-colors"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function ListeRegles({ regles }: {
  regles: { libelle: string; satisfaite: boolean }[];
}) {
  return (
    <ul className="space-y-1">
      {regles.map((r) => (
        <li
          key={r.libelle}
          className={`flex items-center gap-2 text-xs transition-colors ${
            r.satisfaite ? 'text-emerald-600' : 'text-stone-400'
          }`}
        >
          <Check size={13} className={`shrink-0 ${r.satisfaite ? 'opacity-100' : 'opacity-30'}`} />
          {r.libelle}
        </li>
      ))}
    </ul>
  );
}

/** Le champ du code : pas d'icône, des chiffres espacés et centrés. */
const CHAMP_CODE =
  'w-full px-4 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl '
  + 'text-stone-800 placeholder-stone-300 text-center tracking-[0.4em] font-mono '
  + 'focus:outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 '
  + 'transition-colors';

const BOUTON_PRINCIPAL =
  'w-full py-3 rounded-xl text-white text-sm font-bold '
  + 'flex items-center justify-center gap-2 '
  + 'bg-linear-to-r from-brand-500 to-violet-500 '
  + 'hover:brightness-110 active:brightness-95 '
  + 'disabled:opacity-60 disabled:cursor-not-allowed '
  + 'transition-all shadow-lg shadow-brand-500/20';

const BOUTON_RETOUR =
  'w-full flex items-center justify-center gap-1.5 text-xs '
  + 'text-stone-500 hover:text-stone-700 transition-colors';

// ── La page ────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const {
    connexion, choisirMotDePasse, motDePasseOublie, reinitialiserMotDePasse,
  } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>('connexion');

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  // Le défi de première connexion.
  const [defi, setDefi] = useState<{ session: string; email: string } | null>(null);

  // La réinitialisation.
  const [code, setCode] = useState('');

  // Partagés par le défi et la réinitialisation.
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const regles = reglesDe(nouveau, t);
  const motDePasseValide = regles.every((r) => r.satisfaite);
  const concordent = nouveau.length > 0 && nouveau === confirmation;

  /** Remet à zéro ce qui ne doit pas survivre à un changement d'écran. */
  function allerA(suivant: Mode) {
    setMode(suivant);
    setErreur('');
    setNouveau('');
    setConfirmation('');
    setCode('');
    setVisible(false);
  }

  /** Aiguillage après ouverture de session. */
  function aiguiller(role: 'RH' | 'EMPLOYE' | 'CANDIDAT') {
    // `utilisateurDepuisJeton` a déjà réduit les groupes Cognito à un
    // rôle unique, avec cette priorité : RH, puis EMPLOYE, sinon
    // CANDIDAT. Relire `groupes` ici dupliquerait cette règle — et
    // deux copies d'une même règle finissent toujours par diverger.
    switch (role) {
      case 'RH':      navigate('/admin'); break;
      case 'EMPLOYE': navigate('/employe'); break;
      default:        navigate('/candidat/offres');
    }
  }

  /** Traduit une erreur de Cognito en phrase utile. */
  function afficherErreur(err: any) {
    // Le message du service s'il est exploitable, sinon le nôtre :
    // « UserNotFoundException » n'apprend rien à l'utilisateur.
    const m = err?.message ?? '';
    setErreur(/mot de passe|password|incorrect|NotAuthorized/i.test(m)
      ? t('login.erreur')
      : m || t('login.erreur'));
    setEnvoi(false);
  }

  // ── Connexion ────────────────────────────────────────────────────

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !motDePasse) {
      setErreur(t('login.champsRequis'));
      return;
    }

    setEnvoi(true);
    setErreur('');
    setSucces('');

    try {
      const resultat = await connexion(email.trim(), motDePasse);

      // Le compte vient d'être créé par la RH : Cognito a délivré un
      // mot de passe temporaire et réclame le vrai avant d'ouvrir quoi
      // que ce soit.
      if (resultat.etat === 'motDePasseAChoisir') {
        setDefi({ session: resultat.session, email: resultat.email });
        setMotDePasse('');
        allerA('defi');
        setEnvoi(false);
        return;
      }

      aiguiller(resultat.utilisateur.role);
    } catch (err: any) {
      afficherErreur(err);
    }
  }

  // ── Première connexion ───────────────────────────────────────────

  async function poserMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    if (!defi) return;

    if (!motDePasseValide) { setErreur(t('login.regleNonRemplie')); return; }
    if (!concordent) { setErreur(t('login.motsDePasseDifferents')); return; }

    setEnvoi(true);
    setErreur('');

    try {
      const utilisateur = await choisirMotDePasse(defi.session, defi.email, nouveau);
      aiguiller(utilisateur.role);
    } catch (err: any) {
      // Une session de défi expire en quelques minutes. Dans ce cas on
      // renvoie à la saisie du mot de passe temporaire : réessayer avec
      // la même session échouerait indéfiniment.
      if (/[Ss]ession/.test(err?.message ?? '')) {
        setDefi(null);
        allerA('connexion');
      }
      afficherErreur(err);
    }
  }

  // ── Mot de passe oublié ──────────────────────────────────────────

  async function demanderCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setErreur(t('login.champsRequis')); return; }

    setEnvoi(true);
    setErreur('');

    try {
      await motDePasseOublie(email.trim());
      allerA('oubliCode');
    } catch (err: any) {
      // Ici on NE masque PAS le message du service : « ce compte n'est
      // pas encore activé » et « aucune adresse vérifiée » sont des
      // phrases que la personne doit lire en entier pour savoir quoi
      // faire. Les remplacer par « adresse ou mot de passe incorrect »
      // la laisserait tourner en rond.
      setErreur(err?.message ?? t('login.erreur'));
    } finally {
      setEnvoi(false);
    }
  }

  async function poserNouveauMotDePasse(e: React.FormEvent) {
    e.preventDefault();

    if (!code.trim()) { setErreur(t('login.codeRequis')); return; }
    if (!motDePasseValide) { setErreur(t('login.regleNonRemplie')); return; }
    if (!concordent) { setErreur(t('login.motsDePasseDifferents')); return; }

    setEnvoi(true);
    setErreur('');

    try {
      await reinitialiserMotDePasse(email.trim(), code.trim(), nouveau);

      // Cognito n'ouvre pas de session après une réinitialisation : on
      // revient à l'écran d'entrée avec le mot de passe à saisir. Le
      // dire plutôt que de laisser croire à un échec.
      const nouveauRetenu = '';
      allerA('connexion');
      setMotDePasse(nouveauRetenu);
      setSucces(t('login.motDePasseModifie'));
    } catch (err: any) {
      setErreur(err?.message ?? t('login.erreur'));
      setEnvoi(false);
    }
  }

  // ── Écran : première connexion ───────────────────────────────────
  //
  // Un écran à part plutôt qu'un champ de plus : la personne ne tente
  // plus d'entrer, elle prend possession de son compte. Mélanger les
  // deux dans un seul formulaire ferait croire à un échec de connexion.

  if (mode === 'defi' && defi) {
    return (
      <AuthLayout
        titre={t('login.premiereTitre')}
        sousTitre={t('login.premiereSousTitre')}
      >
        <form onSubmit={poserMotDePasse} className="space-y-4" noValidate>

          <div className="flex items-start gap-2.5 p-3 rounded-xl
            bg-brand-500/10 border border-brand-500/30">
            <KeyRound size={16} className="text-brand-texte mt-0.5 shrink-0" />
            <p className="text-sm text-stone-700">
              {t('login.premiereAide')}{' '}
              <span className="font-bold break-all">{defi.email}</span>
            </p>
          </div>

          {erreur && <Erreur message={erreur} />}

          <ChampMotDePasse
            id="nouveau"
            libelle={t('login.nouveauMotDePasse')}
            valeur={nouveau}
            onChange={(v) => { setNouveau(v); setErreur(''); }}
            visible={visible}
            setVisible={setVisible}
            autoComplete="new-password"
            autoFocus
          />

          <ListeRegles regles={regles} />

          <div>
            <ChampMotDePasse
              id="confirmation"
              libelle={t('login.confirmerMotDePasse')}
              valeur={confirmation}
              onChange={(v) => { setConfirmation(v); setErreur(''); }}
              visible={visible}
              setVisible={setVisible}
              autoComplete="new-password"
            />
            {confirmation.length > 0 && !concordent && (
              <p className="text-xs text-red-600 mt-1.5">
                {t('login.motsDePasseDifferents')}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={envoi || !motDePasseValide || !concordent}
            className={BOUTON_PRINCIPAL}
          >
            {envoi ? t('login.enCours') : t('login.activerCompte')}
            {!envoi && <ArrowRight size={16} className="rtl:rotate-180" />}
          </button>

          <button
            type="button"
            onClick={() => { setDefi(null); allerA('connexion'); }}
            className={BOUTON_RETOUR}
          >
            <ArrowLeft size={13} className="rtl:rotate-180" />
            {t('login.retourConnexion')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  // ── Écran : demander un code ─────────────────────────────────────

  if (mode === 'oubliDemande') {
    return (
      <AuthLayout
        titre={t('login.oubliTitre')}
        sousTitre={t('login.oubliSousTitre')}
      >
        <form onSubmit={demanderCode} className="space-y-4" noValidate>

          {erreur && <Erreur message={erreur} />}

          <p className="text-sm text-stone-500">{t('login.oubliAide')}</p>

          <div>
            <label htmlFor="email-oubli" className="block text-xs font-bold text-stone-600 mb-1.5">
              {t('login.email')}
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute start-3.5 top-1/2 -translate-y-1/2
                  text-stone-400 pointer-events-none"
              />
              <input
                id="email-oubli"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErreur(''); }}
                placeholder="prenom.nom@entreprise.tn"
                className={CHAMP_AUTH_ICONE}
              />
            </div>
          </div>

          <button type="submit" disabled={envoi || !email.trim()} className={BOUTON_PRINCIPAL}>
            {envoi ? t('login.enCours') : t('login.envoyerCode')}
            {!envoi && <ArrowRight size={16} className="rtl:rotate-180" />}
          </button>

          <button type="button" onClick={() => allerA('connexion')} className={BOUTON_RETOUR}>
            <ArrowLeft size={13} className="rtl:rotate-180" />
            {t('login.retourConnexion')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  // ── Écran : code + nouveau mot de passe ──────────────────────────

  if (mode === 'oubliCode') {
    return (
      <AuthLayout
        titre={t('login.codeTitre')}
        sousTitre={t('login.codeSousTitre')}
      >
        <form onSubmit={poserNouveauMotDePasse} className="space-y-4" noValidate>

          <div className="flex items-start gap-2.5 p-3 rounded-xl
            bg-brand-500/10 border border-brand-500/30">
            <MailCheck size={16} className="text-brand-texte mt-0.5 shrink-0" />
            <p className="text-sm text-stone-700">
              {t('login.codeAide')}{' '}
              <span className="font-bold break-all">{email.trim()}</span>
            </p>
          </div>

          {erreur && <Erreur message={erreur} />}

          <div>
            <label htmlFor="code" className="block text-xs font-bold text-stone-600 mb-1.5">
              {t('login.codeRecu')}
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 10)); setErreur(''); }}
              placeholder="123456"
              // `ltr` : un code chiffré se lit de gauche à droite même
              // quand la page est en arabe.
              dir="ltr"
              // Ses classes sont écrites, pas dérivées de
              // CHAMP_AUTH_ICONE : ce champ n'a pas d'icône, et un
              // `replace` sur une constante d'un autre fichier casse en
              // silence le jour où elle change.
              className={CHAMP_CODE}
            />
          </div>

          <ChampMotDePasse
            id="nouveau-oubli"
            libelle={t('login.nouveauMotDePasse')}
            valeur={nouveau}
            onChange={(v) => { setNouveau(v); setErreur(''); }}
            visible={visible}
            setVisible={setVisible}
            autoComplete="new-password"
          />

          <ListeRegles regles={regles} />

          <div>
            <ChampMotDePasse
              id="confirmation-oubli"
              libelle={t('login.confirmerMotDePasse')}
              valeur={confirmation}
              onChange={(v) => { setConfirmation(v); setErreur(''); }}
              visible={visible}
              setVisible={setVisible}
              autoComplete="new-password"
            />
            {confirmation.length > 0 && !concordent && (
              <p className="text-xs text-red-600 mt-1.5">
                {t('login.motsDePasseDifferents')}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={envoi || !code.trim() || !motDePasseValide || !concordent}
            className={BOUTON_PRINCIPAL}
          >
            {envoi ? t('login.enCours') : t('login.changerMotDePasse')}
            {!envoi && <ArrowRight size={16} className="rtl:rotate-180" />}
          </button>

          <button type="button" onClick={() => allerA('oubliDemande')} className={BOUTON_RETOUR}>
            <ArrowLeft size={13} className="rtl:rotate-180" />
            {t('login.renvoyerCode')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  // ── Écran : connexion ────────────────────────────────────────────

  return (
    <AuthLayout
      titre={t('login.titre')}
      sousTitre={t('login.sousTitre')}
      pied={
        <div className="text-center text-sm text-stone-500">
          {t('login.pasDeCompte')}{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-texte hover:underline"
          >
            {t('login.creerCandidat')}
          </Link>
        </div>
      }
    >
      <form onSubmit={soumettre} className="space-y-4" noValidate>

        {succes && <Succes message={succes} />}
        {erreur && <Erreur message={erreur} />}

        <div>
          <label
            htmlFor="email"
            className="block text-xs font-bold text-stone-600 mb-1.5"
          >
            {t('login.email')}
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="absolute start-3.5 top-1/2 -translate-y-1/2
                text-stone-400 pointer-events-none"
            />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@entreprise.tn"
              className={CHAMP_AUTH_ICONE}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <label htmlFor="mdp" className="block text-xs font-bold text-stone-600">
              {t('login.motDePasse')}
            </label>
            {/* Le lien revient : les deux écrans qu'il appelle existent
                maintenant. L'adresse déjà saisie est reprise, pour ne
                pas la redemander. */}
            <button
              type="button"
              onClick={() => allerA('oubliDemande')}
              className="text-xs font-semibold text-brand-texte hover:underline"
            >
              {t('login.oubli')}
            </button>
          </div>
          <div className="relative">
            <Lock
              size={16}
              className="absolute start-3.5 top-1/2 -translate-y-1/2
                text-stone-400 pointer-events-none"
            />
            <input
              id="mdp"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="••••••••"
              className={CHAMP_AUTH_ICONE + ' pe-11'}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute end-3 top-1/2 -translate-y-1/2
                text-stone-400 hover:text-stone-600 transition-colors"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={envoi} className={BOUTON_PRINCIPAL}>
          {envoi ? t('login.enCours') : t('login.entrer')}
          {!envoi && <ArrowRight size={16} className="rtl:rotate-180" />}
        </button>
      </form>

    </AuthLayout>
  );
}