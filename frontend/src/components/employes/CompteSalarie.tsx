// src/components/employes/CompteSalarie.tsx
//
// Le compte de connexion d'un salarié, vu depuis la page Salariés.
//
// Trois pièces, utilisables séparément :
//
//   · <PastilleCompte>  — l'état, dans une colonne de tableau
//   · <BoutonCompte>    — l'action qui convient à cet état
//   · <PanneauAcces>    — les accès engendrés, à transmettre
//
// ── Pourquoi l'action dépend de l'adresse, et non du compte seul ───
//
// Une fiche encore sur `elkachaioumaima@gmail.com` ne peut PAS être
// invitée : le serveur refuse, parce que cette adresse n'appartient
// pas à l'entreprise. Proposer « Inviter » dans ce cas, c'est proposer
// un bouton qui échoue. Le bouton propose donc d'abord d'attribuer une
// adresse professionnelle — c'est la seule action qui mène quelque
// part.
//
// ── Sur le mot de passe affiché à l'écran ──────────────────────────
//
// Il est provisoire, expire sous quelques jours et doit être changé à
// la première connexion. Il n'est écrit nulle part : ni en base, ni
// dans l'état de React une fois le panneau fermé. Si la RH ferme sans
// l'avoir transmis, il faut réinviter — et le panneau le dit avant
// qu'elle ferme, pas après.

import { useState, useEffect } from 'react';
import {
  AtSign, Check, Copy, KeyRound, Mail, MailCheck, Send, ShieldAlert,
  ShieldCheck, UserPlus, X, Loader2, TriangleAlert, Clock,
} from 'lucide-react';
import api from '@/services/api';
import {
  comptesService, messageErreur,
  type AccesCrees, type EtatCompte,
} from '@/services/comptes';

// ── Les domaines de l'entreprise ───────────────────────────────────
//
// Ils décident si une adresse est « personnelle ». La page en a besoin
// une fois, pas une fois par ligne : le résultat est gardé au niveau du
// module, donc un seul appel quel que soit le nombre de salariés.

let domainesEnCache: string[] | null = null;
let demandeEnCours: Promise<string[]> | null = null;

async function chargerDomaines(): Promise<string[]> {
  if (domainesEnCache) return domainesEnCache;
  if (demandeEnCours) return demandeEnCours;

  demandeEnCours = (async () => {
    try {
      const r = await api.get('/entreprise') as any;
      // La forme exacte dépend de l'enveloppe du serveur : on accepte
      // les trois, plutôt que de parier sur une et de rendre [] en
      // silence si c'en est une autre.
      const d = r?.data?.entreprise?.domaines
        ?? r?.data?.domaines
        ?? r?.entreprise?.domaines
        ?? r?.domaines;
      domainesEnCache = Array.isArray(d) ? d.map(String) : [];
    } catch {
      // Pas de domaine → rien n'est marqué « à régulariser », et le
      // serveur ne refusera rien non plus. Même convention des deux
      // côtés : l'absence de réglage ne doit pas bloquer la RH.
      domainesEnCache = [];
    } finally {
      demandeEnCours = null;
    }
    return domainesEnCache;
  })();

  return demandeEnCours;
}

/** À rappeler après une modification des réglages de l'entreprise */
export function oublierDomaines() { domainesEnCache = null; }

/**
 * Les domaines de l'entreprise, chargés une fois pour toute la page.
 *
 * Utilise-le dans ta page Salariés et passe le résultat aux deux
 * composants ci-dessous — plutôt que de le laisser chacun le demander.
 */
export function useDomainesEntreprise(): string[] {
  const [domaines, setDomaines] = useState<string[]>(domainesEnCache ?? []);

  useEffect(() => {
    let vivant = true;
    chargerDomaines().then((d) => { if (vivant) setDomaines(d); });
    return () => { vivant = false; };
  }, []);

  return domaines;
}

// ── Ce que la page passe ───────────────────────────────────────────

export interface FicheCompte {
  id: string;
  prenom?: string;
  nom?: string;
  email?: string | null;
  emailPerso?: string | null;
  /** Écrit par le serveur à l'invitation */
  compteEtat?: EtatCompte | null;
}

/**
 * L'adresse appartient-elle à l'entreprise ?
 *
 * Sans domaine déclaré, on ne juge pas : la même convention que le
 * serveur. Une entreprise qui n'a pas rempli ses réglages ne doit pas
 * voir toutes ses fiches marquées « à régulariser ».
 */
function estPersonnelle(email: string | null | undefined, domaines: string[]): boolean {
  const apres = String(email ?? '').trim().toLowerCase().split('@')[1];
  if (!apres || domaines.length === 0) return false;
  return !domaines.some((d) => {
    const dom = d.toLowerCase();
    return apres === dom || apres.endsWith(`.${dom}`);
  });
}

type Situation =
  | 'SANS_ADRESSE'        // rien à quoi rattacher un compte
  | 'ADRESSE_PERSO'       // adresse personnelle : à régulariser d'abord
  | 'A_INVITER'
  | 'INVITE'              // invité, n'a pas encore choisi son mot de passe
  | 'ACTIF'
  | 'DESACTIVE';

export function situationDe(fiche: FicheCompte, domaines: string[]): Situation {
  const email = String(fiche.email ?? '').trim();
  if (!email) return 'SANS_ADRESSE';

  // L'état du compte passe avant : un compte actif sur une adresse
  // personnelle existe bel et bien, et le dire « à régulariser »
  // laisserait croire que personne ne peut se connecter.
  if (fiche.compteEtat === 'ACTIF') return 'ACTIF';
  if (fiche.compteEtat === 'DESACTIVE') return 'DESACTIVE';

  if (estPersonnelle(email, domaines)) return 'ADRESSE_PERSO';
  if (fiche.compteEtat === 'INVITE') return 'INVITE';
  return 'A_INVITER';
}

// ── La pastille d'état ─────────────────────────────────────────────

const PASTILLES: Record<Situation, { texte: string; classe: string; Icone: any }> = {
  SANS_ADRESSE: {
    texte: 'Adresse manquante',
    classe: 'bg-stone-100 text-stone-500',
    Icone: TriangleAlert,
  },
  ADRESSE_PERSO: {
    texte: 'Adresse personnelle',
    classe: 'bg-amber-100 text-amber-800',
    Icone: AtSign,
  },
  A_INVITER: {
    texte: 'Sans compte',
    classe: 'bg-stone-100 text-stone-500',
    Icone: UserPlus,
  },
  INVITE: {
    texte: 'Invité',
    classe: 'bg-blue-100 text-blue-800',
    Icone: Clock,
  },
  ACTIF: {
    texte: 'Compte actif',
    classe: 'bg-emerald-100 text-emerald-800',
    Icone: ShieldCheck,
  },
  DESACTIVE: {
    texte: 'Désactivé',
    classe: 'bg-stone-200 text-stone-600',
    Icone: ShieldAlert,
  },
};

export function PastilleCompte({ fiche, domaines }: {
  fiche: FicheCompte;
  domaines: string[];
}) {
  const { texte, classe, Icone } = PASTILLES[situationDe(fiche, domaines)];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${classe}`}>
      <Icone className="w-3 h-3 shrink-0" />
      {texte}
    </span>
  );
}

// ── Un champ qu'on recopie ─────────────────────────────────────────

function ChampCopiable({ libelle, valeur, mono }: {
  libelle: string;
  valeur: string;
  mono?: boolean;
}) {
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      // Presse-papiers refusé hors HTTPS. La valeur reste
      // sélectionnable à la souris : c'est pour ça qu'elle est affichée
      // en clair et non masquée.
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {libelle}
        </div>
        <div className={`text-sm text-stone-800 break-all select-all ${mono ? 'font-mono tracking-tight' : ''}`}>
          {valeur}
        </div>
      </div>
      <button
        type="button"
        onClick={copier}
        className="p-2 rounded-lg hover:bg-surface border border-transparent hover:border-stone-200 transition-colors shrink-0"
        aria-label={`Copier ${libelle.toLowerCase()}`}
      >
        {copie
          ? <Check className="w-4 h-4 text-emerald-600" />
          : <Copy className="w-4 h-4 text-stone-400" />}
      </button>
    </div>
  );
}

// ── Le panneau des accès ───────────────────────────────────────────

function messagePret(acces: AccesCrees, prenom?: string) {
  return (
    `Bonjour${prenom ? ` ${prenom}` : ''},\n\n`
    + `Votre espace est ouvert.\n\n`
    + `Connexion : ${acces.urlConnexion}\n`
    + `Identifiant : ${acces.identifiant}\n`
    + `Mot de passe provisoire : ${acces.motDePasseProvisoire}\n\n`
    + `À votre première connexion, il vous sera demandé de choisir votre `
    + `propre mot de passe. Ce mot de passe provisoire expire sous `
    + `quelques jours.\n\n`
    + `Attention : votre identifiant est ${acces.identifiant}, et non `
    + `l'adresse à laquelle vous lisez ce message.`
  );
}

export function PanneauAcces({ acces, prenom, onFermer }: {
  acces: AccesCrees;
  prenom?: string;
  onFermer: () => void;
}) {
  const [copieTout, setCopieTout] = useState(false);
  const parCourriel = acces.envoi === 'COURRIEL';

  const copierMessage = async () => {
    try {
      await navigator.clipboard.writeText(messagePret(acces, prenom));
      setCopieTout(true);
      setTimeout(() => setCopieTout(false), 2200);
    } catch { /* presse-papiers refusé */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Accès du salarié"
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto">

        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-stone-200">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            parCourriel ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {parCourriel
              ? <MailCheck className="w-5 h-5 text-emerald-700" />
              : <KeyRound className="w-5 h-5 text-amber-700" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-stone-800">
              {parCourriel ? 'Accès envoyés' : 'Accès à remettre'}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
              {parCourriel
                ? <>Envoyés à <span className="font-bold break-all">{acces.envoyeA}</span>.</>
                : <>Aucun courriel n’est parti — {acces.raison}. Transmettez-les vous-même.</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onFermer}
            className="p-2 rounded-xl hover:bg-stone-100 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {/* L'avertissement AVANT les champs, pas après : une fois le
              panneau fermé, le mot de passe est perdu. */}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <TriangleAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900 leading-relaxed">
              Ce mot de passe n’est affiché <strong>qu’une fois</strong> : il
              n’est conservé nulle part. Si vous fermez sans l’avoir
              transmis, il faudra réinviter la personne.
            </p>
          </div>

          <ChampCopiable libelle="Identifiant de connexion" valeur={acces.identifiant} />
          <ChampCopiable libelle="Mot de passe provisoire" valeur={acces.motDePasseProvisoire} mono />
          <ChampCopiable libelle="Adresse de connexion" valeur={acces.urlConnexion} />

          <button
            type="button"
            onClick={copierMessage}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white transition-colors"
          >
            {copieTout
              ? <><Check className="w-4 h-4" /> Message copié</>
              : <><Copy className="w-4 h-4" /> Copier le message complet</>}
          </button>

          <p className="text-[11px] text-stone-400 leading-relaxed">
            Le message copié contient l’identifiant, le mot de passe et la
            marche à suivre — prêt à coller dans un courriel ou une
            messagerie.
          </p>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onFermer}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
          >
            J’ai transmis les accès
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Un message qui doit être lu avant le rechargement ──────────────

function PanneauMessage({ texte, onFermer }: {
  texte: string;
  onFermer: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <TriangleAlert className="w-5 h-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {texte.split('\n').filter((l) => l.trim()).map((ligne, i) => (
              <p key={i} className="text-sm text-stone-700 leading-relaxed break-words">
                {ligne}
              </p>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onFermer}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
        >
          J’ai noté
        </button>
      </div>
    </div>
  );
}

// ── Le bouton ──────────────────────────────────────────────────────

export function BoutonCompte({ fiche, domaines, onChange, compact }: {
  fiche: FicheCompte;
  domaines: string[];
  /** Appelé après toute opération réussie, pour recharger la liste */
  onChange?: () => void;
  compact?: boolean;
}) {
  const [occupe, setOccupe] = useState<null | 'adresse' | 'invitation'>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [acces, setAcces] = useState<AccesCrees | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const situation = situationDe(fiche, domaines);

  // ── Pourquoi `onChange` n'est PAS appelé ici ─────────────────────
  //
  // `onChange` recharge la liste, et pendant ce rechargement la page
  // affiche son squelette : la ligne est démontée, ce composant aussi,
  // et le mot de passe qu'il tient à l'écran disparaît avec lui. La RH
  // clique « Inviter » et ne voit jamais les accès.
  //
  // Le rechargement est donc déclenché à la FERMETURE du panneau. La
  // ligne reste brièvement dans son ancien état, ce qui est sans
  // conséquence, et les accès restent lisibles tant qu'on ne les a pas
  // fermés.

  const attribuer = async () => {
    setOccupe('adresse'); setErreur(null); setAvertissement(null);
    try {
      const r = await comptesService.attribuerAdresse(fiche.id);
      if (r.ancienCompte) {
        // Un compte existe encore sur l'ancienne adresse : à lire avant
        // que la ligne se recharge.
        setAvertissement(`${r.message}\n\n${r.ancienCompte.avertissement}`);
      } else {
        // La nouvelle adresse s'affiche dans la ligne : c'est la
        // confirmation, inutile d'en ajouter une qui disparaîtrait.
        onChange?.();
      }
    } catch (e) {
      setErreur(messageErreur(e, "L'attribution de l'adresse a échoué"));
    } finally {
      setOccupe(null);
    }
  };

  const inviter = async () => {
    setOccupe('invitation'); setErreur(null); setAvertissement(null);
    try {
      setAcces(await comptesService.inviter(fiche.id));
    } catch (e) {
      setErreur(messageErreur(e, "L'invitation a échoué"));
    } finally {
      setOccupe(null);
    }
  };

  const base = compact
    ? 'px-2.5 py-1.5 text-[11px]'
    : 'px-3.5 py-2 text-xs';
  const commun = `inline-flex items-center gap-1.5 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${base}`;

  const action = (() => {
    switch (situation) {
      case 'SANS_ADRESSE':
        return (
          <span className="text-[11px] text-stone-400">
            Renseignez une adresse sur la fiche
          </span>
        );

      case 'ADRESSE_PERSO':
        return (
          <button
            type="button"
            onClick={attribuer}
            disabled={occupe !== null}
            className={`${commun} bg-amber-600 hover:bg-amber-700 text-white`}
            title={`${fiche.email} n’appartient pas à l’entreprise`}
          >
            {occupe === 'adresse'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <AtSign className="w-3.5 h-3.5" />}
            Attribuer une adresse pro
          </button>
        );

      case 'A_INVITER':
        return (
          <button
            type="button"
            onClick={inviter}
            disabled={occupe !== null}
            className={`${commun} bg-brand-500 hover:bg-brand-600 text-white`}
          >
            {occupe === 'invitation'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />}
            Inviter
          </button>
        );

      case 'INVITE':
        return (
          <button
            type="button"
            onClick={inviter}
            disabled={occupe !== null}
            className={`${commun} bg-stone-100 hover:bg-stone-200 text-stone-700`}
            title="Engendre un nouveau mot de passe provisoire"
          >
            {occupe === 'invitation'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Mail className="w-3.5 h-3.5" />}
            Renvoyer les accès
          </button>
        );

      case 'ACTIF':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Se connecte déjà
          </span>
        );

      case 'DESACTIVE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            Compte fermé
          </span>
        );
    }
  })();

  return (
    <div className="inline-flex flex-col items-start gap-1.5 max-w-xs">
      {action}

      {erreur && (
        <p className="text-[11px] text-red-600 leading-relaxed break-words">
          {erreur}
        </p>
      )}

      {acces && (
        <PanneauAcces
          acces={acces}
          prenom={fiche.prenom}
          onFermer={() => { setAcces(null); onChange?.(); }}
        />
      )}

      {avertissement && (
        <PanneauMessage
          texte={avertissement}
          onFermer={() => { setAvertissement(null); onChange?.(); }}
        />
      )}
    </div>
  );
}