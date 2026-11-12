// src/pages/RegisterPage.tsx
//
// ══ Le défaut principal de ta version ══════════════════════════════
//
// `handleSubmit` faisait ceci, et rien de plus :
//
//     const handleSubmit = (e) => { e.preventDefault();
//       navigate('/dashboard'); };
//
// Aucun appel à Cognito. Aucun compte créé. Et `/dashboard` n'est pas
// une de tes routes — le visiteur arrivait sur une page vide, sans
// message d'erreur, en croyant son compte créé.
//
// C'est le genre de chose qu'un juré trouve en trente secondes s'il
// demande à s'inscrire lui-même, et ça coûte plus cher qu'un défaut
// d'affichage : ça met en doute tout le reste de la démonstration.
//
// ── L'inscription réelle se fait en deux étapes ────────────────────
//
// Ton `cognito.ts` le prévoyait déjà, la page ne s'en servait pas :
//
//   1. `inscription({ email, motDePasse, prenom, nom })`  → SignUp
//      Cognito envoie alors un code à 6 chiffres par e-mail.
//   2. `confirmerInscription(email, code)`                → ConfirmSignUp
//      Le compte devient utilisable, et seulement là.
//
// Sauter l'étape 2 donne un compte créé mais `UNCONFIRMED`, qui ne
// peut pas se connecter : c'est pour ça que les deux étapes vivent
// dans cette page, avec `etape` pour passer de l'une à l'autre.
//
// ── Les boutons Google et SSO sont partis ──────────────────────────
//
// Ils n'avaient pas de `onClick`. Un bouton qui ne fait rien est pire
// qu'un bouton absent : le visiteur clique, rien ne se passe, et il
// conclut que l'application est cassée. Les brancher demanderait un
// fournisseur d'identité fédéré configuré dans ton pool Cognito —
// un vrai travail, pas une case à cocher. À la soutenance, mieux vaut
// une inscription qui marche qu'un bouton Google qui mime.
//
// ── La flèche de retour ────────────────────────────────────────────
//
// Écrite dans la page, sans composant ni fichier supplémentaire. Elle
// fait deux choses différentes selon l'étape : sur le formulaire elle
// revient à la page précédente (ou à l'accueil s'il n'y en a pas), sur
// l'écran du code elle revient au formulaire sans toucher à
// l'historique — reculer là laisserait un compte Cognito créé mais non
// confirmé, et ferait perdre la saisie.
//
// ── Et le reste ────────────────────────────────────────────────────
//
// Le témoignage « Elena Rodriguez » est parti (inventé, cf.
// AuthLayout). Le champ « téléphone » aussi : ton schéma Cognito ne
// déclare que `email`, `given_name` et `family_name`, donc le numéro
// était saisi puis jeté. Anglais → fr/en/ar, couleurs → palette.

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import AuthLayout, { CHAMP_AUTH, CHAMP_AUTH_ICONE } from '@/components/layout/AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { inscription, confirmerInscription } = useAuth();
  const { t } = useI18n();

  const [etape, setEtape] = useState<'saisie' | 'code'>('saisie');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

  /** Étape 1 — création du compte dans Cognito. */
  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');

    if (!prenom.trim() || !nom.trim() || !email.trim() || !motDePasse) {
      setErreur(t('login.champsRequis'));
      return;
    }
    // Vérifié ici pour éviter un aller-retour réseau sur une faute de
    // frappe ; la règle réelle reste celle du pool Cognito, dont
    // l'erreur est affichée telle quelle plus bas.
    if (motDePasse.length < 8) {
      setErreur(t('inscr.mdpCourt'));
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur(t('inscr.mdpDifferent'));
      return;
    }

    setEnvoi(true);
    try {
      await inscription({
        email: email.trim(),
        motDePasse,
        prenom: prenom.trim(),
        nom: nom.trim(),
      });
      setEtape('code');
    } catch (err: any) {
      // Les messages Cognito sont en anglais mais précis (« Password
      // did not conform with policy », « User already exists ») : les
      // afficher vaut mieux qu'un « une erreur est survenue » qui
      // n'aide personne à corriger.
      setErreur(err?.message || t('login.erreur'));
    } finally {
      setEnvoi(false);
    }
  }

  /** Étape 2 — validation du code reçu par e-mail. */
  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');

    if (code.trim().length !== 6) {
      setErreur(t('inscr.codeCourt'));
      return;
    }

    setEnvoi(true);
    try {
      await confirmerInscription(email.trim(), code.trim());
      // Vers la connexion, pas vers un tableau de bord : le compte
      // existe mais la session n'est pas ouverte, `ConfirmSignUp` ne
      // délivre aucun jeton.
      navigate('/login', { state: { inscrit: true } });
    } catch (err: any) {
      setErreur(err?.message || t('inscr.codeInvalide'));
    } finally {
      setEnvoi(false);
    }
  }

  const Alerte = () => erreur ? (
    <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl
      bg-red-50 border border-red-200">
      <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{erreur}</p>
    </div>
  ) : null;

  // ─────────────────────────── Étape 2 ───────────────────────────
  if (etape === 'code') {
    return (
      <AuthLayout
        titre={t('inscr.codeTitre')}
        sousTitre={t('inscr.codeSousTitre').replace('{email}', email.trim())}
      >
        <form onSubmit={valider} className="space-y-4" noValidate>
          {/* Retour au formulaire, et non dans l'historique : reculer
              ici laisserait un compte Cognito créé mais non confirmé,
              et ferait perdre la saisie. */}
          <button type="button"
            onClick={() => { setErreur(''); setInfo(''); setEtape('saisie'); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold
              text-stone-500 hover:text-stone-700 transition-colors"
          >
            <ArrowLeft size={15} className="rtl:rotate-180" />
            {t('nav.retour')}
          </button>

          <Alerte />

          {info && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200
              rounded-xl p-3">{info}</p>
          )}

          <div>
            <label htmlFor="code" className="block text-xs font-bold text-stone-600 mb-1.5">
              {t('inscr.code')}
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              // `dir="ltr"` et `text-center` : un code numérique se lit
              // de gauche à droite même en arabe.
              dir="ltr"
              className={CHAMP_AUTH + ' text-center text-2xl font-bold tracking-[0.4em] font-mono'}
            />
          </div>

          <button
            type="submit"
            disabled={envoi}
            className="w-full py-3 rounded-xl text-white text-sm font-bold
              flex items-center justify-center gap-2
              bg-linear-to-r from-brand-500 to-violet-500
              hover:brightness-110 disabled:opacity-60
              transition-all shadow-lg shadow-brand-500/20"
          >
            <ShieldCheck size={16} />
            {envoi ? t('inscr.enCours') : t('inscr.valider')}
          </button>

          <button
            type="button"
            onClick={async () => {
              // Re-déclenche SignUp : Cognito renvoie un code pour un
              // compte encore non confirmé.
              setErreur(''); setInfo('');
              try {
                await inscription({
                  email: email.trim(), motDePasse,
                  prenom: prenom.trim(), nom: nom.trim(),
                });
                setInfo(t('inscr.renvoye'));
              } catch (err: any) {
                setErreur(err?.message || t('login.erreur'));
              }
            }}
            className="w-full text-xs font-semibold text-brand-texte hover:underline"
          >
            {t('inscr.renvoyer')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  // ─────────────────────────── Étape 1 ───────────────────────────
  return (
    <AuthLayout
      titre={t('inscr.titre')}
      sousTitre={t('inscr.sousTitre')}
      pied={
        <div className="text-center text-sm text-stone-500">
          {t('inscr.dejaCompte')}{' '}
          <Link to="/login" className="font-semibold text-brand-texte hover:underline">
            {t('inscr.seConnecter')}
          </Link>
        </div>
      }
    >
      <form onSubmit={creer} className="space-y-4" noValidate>
        {/* `-1` s'il y a une page précédente, l'accueil sinon : un
            visiteur arrivé droit sur /register depuis un lien n'a rien
            derrière lui, et `navigate(-1)` le ferait sortir du site. */}
        <button type="button"
          onClick={() => {
            // Deux appels et non un ternaire : les surcharges de
            // `navigate` n'acceptent pas `number | string`.
            const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
            if (idx > 0) navigate(-1);
            else navigate('/');
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold
            text-stone-500 hover:text-stone-700 transition-colors"
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
          {t('nav.retour')}
        </button>

        <Alerte />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="prenom" className="block text-xs font-bold text-stone-600 mb-1.5">
              {t('inscr.prenom')}
            </label>
            <div className="relative">
              <User size={16} className="absolute start-3.5 top-1/2
                -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                id="prenom" value={prenom} autoComplete="given-name"
                onChange={(e) => setPrenom(e.target.value)}
                className={CHAMP_AUTH_ICONE}
              />
            </div>
          </div>
          <div>
            <label htmlFor="nom" className="block text-xs font-bold text-stone-600 mb-1.5">
              {t('inscr.nom')}
            </label>
            <div className="relative">
              <User size={16} className="absolute start-3.5 top-1/2
                -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                id="nom" value={nom} autoComplete="family-name"
                onChange={(e) => setNom(e.target.value)}
                className={CHAMP_AUTH_ICONE}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-bold text-stone-600 mb-1.5">
            {t('login.email')}
          </label>
          <div className="relative">
            <Mail size={16} className="absolute start-3.5 top-1/2
              -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              id="email" type="email" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.tn"
              className={CHAMP_AUTH_ICONE}
            />
          </div>
        </div>

        <div>
          <label htmlFor="mdp" className="block text-xs font-bold text-stone-600 mb-1.5">
            {t('login.motDePasse')}
          </label>
          <div className="relative">
            <Lock size={16} className="absolute start-3.5 top-1/2
              -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              id="mdp" type={visible ? 'text' : 'password'} value={motDePasse}
              autoComplete="new-password"
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="••••••••"
              className={CHAMP_AUTH_ICONE + ' pe-11'}
            />
            <button
              type="button" onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute end-3 top-1/2 -translate-y-1/2
                text-stone-400 hover:text-stone-600 transition-colors"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="conf" className="block text-xs font-bold text-stone-600 mb-1.5">
            {t('inscr.confirmer')}
          </label>
          <div className="relative">
            <Lock size={16} className="absolute start-3.5 top-1/2
              -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              id="conf" type={visible ? 'text' : 'password'} value={confirmation}
              autoComplete="new-password"
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="••••••••"
              className={CHAMP_AUTH_ICONE}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={envoi}
          className="w-full py-3 rounded-xl text-white text-sm font-bold
            flex items-center justify-center gap-2
            bg-linear-to-r from-brand-500 to-violet-500
            hover:brightness-110 active:brightness-95
            disabled:opacity-60 disabled:cursor-not-allowed
            transition-all shadow-lg shadow-brand-500/20"
        >
          {envoi ? t('inscr.enCours') : t('inscr.creer')}
          {!envoi && <ArrowRight size={16} className="rtl:rotate-180" />}
        </button>

        <p className="text-[11px] text-stone-400 leading-relaxed text-center">
          {t('inscr.note')}
        </p>
      </form>
    </AuthLayout>
  );
}