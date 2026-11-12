// src/pages/employee/EmployeeProfilePage.tsx
//
// Profil du salarié : ce qu'il peut consulter, et le peu qu'il peut
// changer lui-même.
//
// ── Ce qui a changé, et pourquoi ────────────────────────────────────
//
// 1. LE BOUTON « ENREGISTRER » NE POUVAIT PAS FONCTIONNER. La page
//    appelait « employesService.modifier(id, form) », c'est-à-dire
//    PUT /employes/:id — une route déclarée « autoriser("RH") ». Un
//    salarié recevait donc 403 à chaque enregistrement. La page passe
//    maintenant par PUT /auth/profil, la route libre-service.
//
// 2. LE SALARIÉ POUVAIT CHANGER SON PROPRE POSTE. Le formulaire
//    portait « poste » et « departement ». Si la route s'était
//    ouverte, chacun aurait pu se nommer directeur et changer de
//    service. Ce n'était pas une permission à élargir : ce sont deux
//    champs à sortir du formulaire. Ils restent affichés, en lecture
//    seule, avec la mention de qui les modifie.
//
//    ⚠ Le même trou existe CÔTÉ SERVEUR : PUT /auth/profil accepte
//    encore poste et departement. Voir CORRECTIF-profil-serveur.md —
//    la page seule ne suffit pas à le fermer.
//
// 3. DEUX RACCOURCIS SUR TROIS NE MENAIENT NULLE PART.
//      /employe/conges  → la route réelle est /employee/conges (deux « e »)
//      /employe/frais   → la route réelle est /notes-frais
//    Les chemins sont regroupés dans ROUTES, déclarés une fois.
//
// 4. AUCUNE COULEUR NE VENAIT DE LA PALETTE. Tout était écrit en
//    hexadécimal — « GREEN », « INK », « BORDER », et cinq teintes
//    d'accent. Rien ne basculait en mode sombre : la page restait
//    blanche sur une application passée en nuit. Et la constante
//    nommée GREEN valait #4338CA, un indigo : un reste de l'ancienne
//    charte verte, renommé à moitié.
//
// 5. LA PAGE RECALCULAIT LA FISCALITÉ. « 300 TND », « × 100 TND »,
//    « 9,68 % », « 5 000 TND » étaient écrits dans le JSX, alors que
//    BAREME dans src/paie/paie.js porte déjà ces valeurs. Deux
//    sources pour un même chiffre : le jour où la loi de finances
//    change, on corrige la paie et la page continue d'afficher
//    l'ancien montant. Elles sont rassemblées ici en attendant de
//    venir du serveur, et affichées comme indicatives.
//
// 6. « 21 JOURS » SORTAIT DE NULLE PART. Le droit à congés affichait
//    « solde?.total ?? 21 ». L'article 113 cité sur l'écran des congés
//    en annonce quinze. Plus de valeur inventée : si le serveur ne
//    donne pas le solde, la page le dit.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Calendar, Mail, Phone, Pencil, Users, X, Save,
  Briefcase, Wallet, Receipt, FileText, Award,
  TrendingUp, Baby, ShieldCheck, ArrowRight, Lock, AlertTriangle,
} from 'lucide-react';

import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { useI18n } from '@/i18n';

/** Routes réelles du routeur, déclarées une fois.
 *
 *  Deux des trois raccourcis pointaient à côté : « /employe/conges »
 *  au lieu de « /employee/conges », et « /employe/frais » au lieu de
 *  « /notes-frais ». Un chemin écrit en dur dans un appel finit
 *  toujours par ne plus correspondre à rien. */
const ROUTES = {
  conges: '/employee/conges',
  notesFrais: '/notes-frais',
  factures: '/employe/factures',
} as const;

// ── Barème ─────────────────────────────────────────────────────────
//
// Ces quatre valeurs DUPLIQUENT « BAREME » dans src/paie/paie.js, qui
// porte le commentaire : « Les taux sont regroupés dans BAREME afin
// qu'une évolution législative se traduise par une seule
// modification. » Une seule modification — sauf que cette page en
// contenait une deuxième copie, écrite dans le JSX.
//
// Elles sont ici en un seul endroit, en attendant de venir du serveur
// (voir ParametresPays dans CONCEPTION-paramétrage). D'ici là, la
// section les affiche comme INDICATIVES : le chiffre qui engage est
// celui du bulletin, calculé par paie.js.
const BAREME_INDICATIF = {
  cnssTaux: 0.0968,
  cnssPlafond: 5000,
  abattementChefDeFamille: 300,
  abattementParEnfant: 100,
  nbEnfantsMax: 4,
};

// ── Accents par domaine ────────────────────────────────────────────
//
// Une application d'une seule couleur est monotone, et chaque famille
// d'information gagne à être repérable. Mais ces teintes passent
// maintenant par la palette, donc elles basculent en mode sombre.
//
// « contact » est en cyan et non en bleu : dans cette palette,
// --color-blue-500 vaut exactement --color-brand-500. Un accent bleu
// aurait été indiscernable de la couleur de marque.
const ACCENTS = {
  identite: { fond: 'bg-brand-500/10', texte: 'text-brand-texte' },
  contact: { fond: 'bg-cyan-50', texte: 'text-cyan-700' },
  contrat: { fond: 'bg-violet-50', texte: 'text-violet-600' },
  temps: { fond: 'bg-amber-50', texte: 'text-amber-600' },
  paie: { fond: 'bg-green-50', texte: 'text-green-700' },
};

type Accent = { fond: string; texte: string };
type IconeLucide = React.ComponentType<{ className?: string }>;

/** Langue des formats de date et de nombre. */
const loc = (langue: string) => (langue === 'ar' ? 'ar-TN' : langue);

// ── Composants ─────────────────────────────────────────────────────

function Avatar({ nom }: { nom: string }) {
  const initiales = nom.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="w-20 h-20 rounded-full flex items-center justify-center bg-brand-500 text-white text-2xl font-bold border-4 border-surface shadow-md shrink-0"
    >
      {initiales}
    </div>
  );
}

function Section({ titre, icone: Icone, accent, action, children }: {
  titre: string;
  icone: IconeLucide;
  accent: Accent;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-stone-200 rounded-2xl p-6 panneau">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2.5 text-[15px] text-stone-800">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent.fond}`}>
            <Icone className={`w-3.5 h-3.5 ${accent.texte}`} />
          </span>
          {titre}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Champ({ label, valeur, accent }: {
  label: string;
  valeur: React.ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-stone-400">
        {label}
      </div>
      <div className={`text-sm font-medium ${accent ?? 'text-stone-800'}`}>{valeur}</div>
    </div>
  );
}

function LigneContact({ icone: Icone, label, valeur, accent, children }: {
  icone: IconeLucide;
  label: string;
  valeur?: React.ReactNode;
  accent: Accent;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent.fond}`}>
        <Icone className={`w-4 h-4 ${accent.texte}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          {label}
        </div>
        {children ?? <div className="text-sm truncate text-stone-800">{valeur}</div>}
      </div>
    </div>
  );
}

/** Raccourci vers un autre écran, avec sa propre teinte. */
function Raccourci({ icone: Icone, titre, valeur, accent, onClick }: {
  icone: IconeLucide;
  titre: string;
  valeur: string;
  accent: Accent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border border-stone-200 text-start hover:shadow-sm transition-shadow w-full ${accent.fond}`}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-surface">
        <Icone className={`w-4 h-4 ${accent.texte}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold truncate ${accent.texte}`}>{valeur}</div>
        <div className="text-xs truncate text-stone-500">{titre}</div>
      </div>
      <ArrowRight className={`w-4 h-4 shrink-0 rtl:rotate-180 ${accent.texte}`} />
    </button>
  );
}

/** Carte de la situation familiale. */
function CarteSituation({ icone: Icone, label, valeur, detail }: {
  icone: IconeLucide;
  label: string;
  valeur: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-stone-50">
      <div className="flex items-center gap-2 mb-2">
        <Icone className="w-4 h-4 text-green-700" />
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <div className="text-sm font-semibold text-stone-800">{valeur}</div>
      {detail && <div className="text-xs mt-1 text-green-700">{detail}</div>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function EmployeeProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, tn, langue } = useI18n();

  const [employe, setEmploye] = useState<any>(null);
  const [solde, setSolde] = useState<any>(null);
  const [frais, setFrais] = useState<any>(null);
  const [nbBulletins, setNbBulletins] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  // Le formulaire ne porte QUE ce qu'un salarié a le droit de changer.
  // « poste » et « departement » en sont sortis : ils restent visibles,
  // en lecture seule.
  const [form, setForm] = useState({ telephone: '', adresse: '' });

  const devise = useCallback((v?: number) => (
    typeof v === 'number'
      ? new Intl.NumberFormat(loc(langue), {
        style: 'currency', currency: 'TND', minimumFractionDigits: 3,
      }).format(v)
      : '—'
  ), [langue]);

  const dateLongue = useCallback((iso?: string) => (
    iso ? new Date(iso).toLocaleDateString(loc(langue), {
      day: 'numeric', month: 'long', year: 'numeric',
    }) : '—'
  ), [langue]);

  /** Ancienneté en mois révolus.
   *
   *  Une soustraction d'années donnerait « 1 an » dès janvier à un
   *  salarié embauché en décembre. */
  const anciennete = useCallback((dateEmbauche?: string): string => {
    if (!dateEmbauche) return '—';

    const debut = new Date(dateEmbauche);
    const maintenant = new Date();

    let mois = (maintenant.getFullYear() - debut.getFullYear()) * 12
      + (maintenant.getMonth() - debut.getMonth());
    if (maintenant.getDate() < debut.getDate()) mois -= 1;
    mois = Math.max(0, mois);

    if (mois < 1) return t('pr.arriveCeMois');
    if (mois < 12) return tn('pr.nMois', mois);

    const annees = Math.floor(mois / 12);
    const reste = mois % 12;
    if (reste === 0) return tn('pr.nAns', annees);
    return t('pr.ansEtMois', { a: tn('pr.nAns', annees), m: tn('pr.nMois', reste) });
  }, [t, tn]);

  const charger = useCallback(async () => {
    try {
      setChargement(true);
      setErreur('');

      // La fiche employé est la source de vérité : le jeton ne porte
      // ni le poste, ni le salaire, ni la date d'embauche.
      //
      // Elle est lue par /auth/profil, qui résout par e-mail. Lire par
      // /employes/:id échouerait en 404 si l'identifiant du jeton ne
      // correspondait plus — ce qui est arrivé.
      const [ficheRes, congesRes, fraisRes, facturesRes] = await Promise.allSettled([
        api.get('/auth/profil') as any,
        api.get('/conges') as any,
        api.get('/frais/notes') as any,
        api.get('/factures') as any,
      ]);

      const valeur = (r: PromiseSettledResult<any>) =>
        (r.status === 'fulfilled' ? r.value : null);

      const fiche = valeur(ficheRes)?.data?.employe
        ?? valeur(ficheRes)?.data
        ?? null;

      if (fiche) {
        setEmploye(fiche);
        setForm({
          telephone: fiche.telephone || '',
          adresse: fiche.adresse || '',
        });
      }

      setSolde(valeur(congesRes)?.data?.solde ?? null);
      setFrais(valeur(fraisRes)?.data?.resume ?? null);
      setNbBulletins((valeur(facturesRes)?.data?.factures ?? []).length);
    } catch (e) {
      console.error('Chargement du profil :', e);
      setErreur(t('pr.erreurChargement'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffect(() => { void charger(); }, [charger]);

  useEffect(() => {
    if (!message) return undefined;
    const minuterie = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(minuterie);
  }, [message]);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      // PUT /auth/profil, et non PUT /employes/:id : la seconde est
      // réservée à la RH et répondait 403 à tous les coups.
      await api.put('/auth/profil', {
        telephone: form.telephone,
        adresse: form.adresse,
      });
      setEmploye((prec: any) => ({ ...prec, ...form }));
      setEdition(false);
      setMessage(t('pr.profilMisAJour'));
    } catch (e: any) {
      setErreur(e?.erreur ?? e?.response?.data?.erreur ?? t('pr.erreurSauvegarde'));
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = () => {
    setEdition(false);
    setErreur('');
    if (employe) {
      setForm({
        telephone: employe.telephone || '',
        adresse: employe.adresse || '',
      });
    }
  };

  if (chargement) {
    return (
      <Layout>
        <div className="max-w-5xl animate-pulse space-y-5">
          <div className="h-8 rounded w-48 mb-7 bg-stone-100" />
          <div className="rounded-2xl border border-stone-200 bg-stone-50 h-40" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-stone-200 bg-stone-50 h-24" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const nomComplet = employe
    ? `${employe.prenom} ${employe.nom}`
    : user ? `${user.prenom} ${user.nom}` : '—';

  const champ = 'w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 '
    + 'bg-stone-50 text-stone-800 focus:outline-none focus:border-brand-500 transition-colors';

  const nbEnfants = employe?.nbEnfants ?? 0;
  const abattementEnfants = Math.min(nbEnfants, BAREME_INDICATIF.nbEnfantsMax)
    * BAREME_INDICATIF.abattementParEnfant;

  return (
    <Layout>
      <div className="max-w-5xl">

        {message && (
          <div
            role="status"
            className="fixed top-20 end-6 z-50 bg-brand-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg"
          >
            {message}
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">{t('pr.titre')}</h1>
            <p className="text-sm mt-0.5 text-stone-500">{t('pr.sousTitre')}</p>
          </div>

          <div className="flex gap-2">
            {edition && (
              <button
                type="button"
                onClick={annuler}
                className="flex items-center gap-2 border border-stone-200 text-stone-800 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-stone-50 transition-colors"
              >
                <X className="w-4 h-4" />
                {t('pt.annuler')}
              </button>
            )}
            <button
              type="button"
              onClick={edition ? enregistrer : () => setEdition(true)}
              disabled={envoi || !employe}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : edition ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              {envoi ? t('pr.enregistrement') : edition ? t('pr.enregistrer') : t('pr.modifier')}
            </button>
          </div>
        </div>

        {erreur && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-5 bg-red-50 text-red-600">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{erreur}</span>
          </div>
        )}

        {/* Sans fiche, le reste de la page n'a rien à montrer : le dire
            vaut mieux que d'afficher une page de tirets. */}
        {!employe && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-5 bg-amber-50 text-amber-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t('pr.aucuneFiche')}</span>
          </div>
        )}

        {/* ── Carte d'identité ── */}
        <div className="bg-surface rounded-2xl border border-stone-200 p-6 mb-5 panneau">
          <div className="flex items-start gap-5 flex-wrap">
            <Avatar nom={nomComplet} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ACCENTS.identite.fond} ${ACCENTS.identite.texte}`}>
                  {t('pr.actif')}
                </span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ACCENTS.contact.fond} ${ACCENTS.contact.texte}`}>
                  {user?.role === 'EMPLOYE' ? t('pr.salarie') : user?.role}
                </span>
                {employe?.departement && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ACCENTS.contrat.fond} ${ACCENTS.contrat.texte}`}>
                    {employe.departement}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-semibold text-stone-800">{nomComplet}</h2>
              <p className="text-sm text-stone-500">{employe?.poste || '—'}</p>

              <div className="flex items-center gap-4 text-xs mt-2 flex-wrap text-stone-500">
                <span className="flex items-center gap-1 min-w-0">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{employe?.email || user?.email}</span>
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {anciennete(employe?.dateEmbauche)}
                </span>
              </div>
            </div>

            {/* Rémunération : la donnée que le salarié consulte le plus */}
            <div className={`rounded-xl p-4 text-center min-w-40 shrink-0 ${ACCENTS.paie.fond}`}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 bg-surface">
                <Wallet className={`w-5 h-5 ${ACCENTS.paie.texte}`} />
              </div>
              <div className={`text-lg font-semibold ${ACCENTS.paie.texte}`}>
                {devise(employe?.salaireBrutMensuel)}
              </div>
              <div className="text-xs mt-0.5 text-stone-500">{t('pr.brutMensuel')}</div>
            </div>
          </div>
        </div>

        {/* ── Raccourcis ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <Raccourci
            icone={Calendar}
            titre={t('pr.soldeConges')}
            valeur={solde
              ? t('pr.surNJours', { a: solde.restants, b: solde.total })
              : '—'}
            accent={ACCENTS.temps}
            onClick={() => navigate(ROUTES.conges)}
          />
          <Raccourci
            icone={Receipt}
            titre={t('pr.fraisARembourser')}
            valeur={devise(frais?.aRembourser)}
            accent={ACCENTS.contact}
            onClick={() => navigate(ROUTES.notesFrais)}
          />
          <Raccourci
            icone={FileText}
            titre={t('pr.fichesPaie')}
            valeur={tn('pr.nBulletins', nbBulletins)}
            accent={ACCENTS.identite}
            onClick={() => navigate(ROUTES.factures)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

          {/* ── Contrat ── */}
          {/* Poste et département sont en LECTURE SEULE, même en mode
              édition : laisser un salarié changer son intitulé de poste
              ou son service n'a pas de sens. */}
          <Section
            titre={t('pr.monContrat')}
            icone={Briefcase}
            accent={ACCENTS.contrat}
            action={
              <span className="flex items-center gap-1.5 text-xs text-stone-400">
                <Lock className="w-3 h-3" />
                {t('pr.modifiableRH')}
              </span>
            }
          >
            <div className="space-y-4">
              <Champ label={t('pr.poste')} valeur={employe?.poste || '—'} />
              <Champ label={t('pr.departement')} valeur={employe?.departement || '—'} />

              <div className="grid grid-cols-2 gap-4">
                <Champ label={t('pr.dateEmbauche')} valeur={dateLongue(employe?.dateEmbauche)} />
                <Champ
                  label={t('pr.anciennete')}
                  valeur={anciennete(employe?.dateEmbauche)}
                  accent={ACCENTS.contrat.texte}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Champ
                  label={t('pr.horaireMensuel')}
                  valeur={employe?.heuresMensuelles ? `${employe.heuresMensuelles} h` : '—'}
                />
                <Champ
                  label={t('pr.horaireJournalier')}
                  valeur={employe?.heuresContrat ? `${employe.heuresContrat} h` : '—'}
                />
              </div>

              <p className="text-xs text-stone-400 pt-1">{t('pr.posteLectureSeule')}</p>
            </div>
          </Section>

          {/* ── Contact ── */}
          <Section titre={t('pr.mesCoordonnees')} icone={Mail} accent={ACCENTS.contact}>
            <div className="space-y-4">
              <LigneContact
                icone={Mail}
                label={t('pr.emailPro')}
                accent={ACCENTS.contact}
                valeur={employe?.email || user?.email}
              />

              <LigneContact icone={Phone} label={t('pr.telephone')} accent={ACCENTS.contact}>
                {edition ? (
                  <input
                    type="tel"
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    placeholder={t('pr.telPlaceholder')}
                    aria-label={t('pr.telephone')}
                    className={`${champ} mt-0.5`}
                  />
                ) : (
                  <div className="text-sm text-stone-800">{employe?.telephone || '—'}</div>
                )}
              </LigneContact>

              <LigneContact icone={MapPin} label={t('pr.adresse')} accent={ACCENTS.contact}>
                {edition ? (
                  <input
                    value={form.adresse}
                    onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                    placeholder={t('pr.adressePlaceholder')}
                    aria-label={t('pr.adresse')}
                    className={`${champ} mt-0.5`}
                  />
                ) : (
                  <div className="text-sm text-stone-800">{employe?.adresse || '—'}</div>
                )}
              </LigneContact>

              {/* L'employeur venait d'une chaîne écrite en dur dans le
                  JSX — « HR UP — Tunisie ». Il vient maintenant de
                  la fiche, et vaudra ParametresEntreprise le jour où
                  l'application servira plusieurs sociétés. */}
              <LigneContact
                icone={Users}
                label={t('pr.employeur')}
                accent={ACCENTS.contact}
                valeur={employe?.entreprise || employe?.employeur || '—'}
              />

              <p className="text-xs text-stone-400">{t('pr.champsModifiables')}</p>
            </div>
          </Section>
        </div>

        {/* ── Situation familiale ── */}
        {/* Elle conditionne les abattements fiscaux : le salarié doit
            pouvoir vérifier qu'elle est à jour, même s'il ne la modifie
            pas lui-même. */}
        <Section
          titre={t('pr.situationTitre')}
          icone={ShieldCheck}
          accent={ACCENTS.paie}
          action={
            <span className="flex items-center gap-1.5 text-xs text-stone-400">
              <Lock className="w-3 h-3" />
              {t('pr.modifiableRH')}
            </span>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <CarteSituation
              icone={Users}
              label={t('pr.chefDeFamille')}
              valeur={employe?.chefDeFamille ? t('pr.oui') : t('pr.non')}
              detail={employe?.chefDeFamille
                ? t('pr.abattementAnnuel', {
                  v: devise(BAREME_INDICATIF.abattementChefDeFamille),
                })
                : undefined}
            />

            <CarteSituation
              icone={Baby}
              label={t('pr.enfantsACharge')}
              valeur={nbEnfants}
              detail={nbEnfants > 0
                ? t('pr.abattementAnnuel', { v: devise(abattementEnfants) })
                : undefined}
            />

            <CarteSituation
              icone={Wallet}
              label={t('pr.cotisationCnss')}
              valeur={new Intl.NumberFormat(loc(langue), {
                style: 'percent', minimumFractionDigits: 2,
              }).format(BAREME_INDICATIF.cnssTaux)}
              detail={t('pr.basePlafonnee', { v: devise(BAREME_INDICATIF.cnssPlafond) })}
            />

            {/* Plus de « ?? 21 » : l'article 113 cité sur l'écran des
                congés en annonce quinze, et une valeur inventée dans
                une page de fiscalité est pire qu'une valeur absente. */}
            <CarteSituation
              icone={Award}
              label={t('pr.droitConges')}
              valeur={solde?.total != null
                ? tn('pr.nJoursParAn', solde.total)
                : t('pr.nonRenseigne')}
            />
          </div>

          <p className="text-[10px] text-stone-400 mt-4">{t('pr.indicatif')}</p>
        </Section>
      </div>
    </Layout>
  );
}