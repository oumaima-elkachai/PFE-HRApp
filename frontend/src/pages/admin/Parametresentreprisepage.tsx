/**
 * Réglages › Entreprise — l'identité qui s'imprime sur les documents.
 *
 * Ces mentions étaient des variables d'environnement. Elles sont
 * maintenant saisies ici, pour une raison simple : une adresse change,
 * un capital est augmenté, un gérant est remplacé, et rien de tout cela
 * ne justifie un redéploiement.
 *
 * L'aperçu de droite reproduit l'en-tête tel que `attestation-pdf.js`
 * le dessine — mêmes couleurs, même disposition, même ordre. Il utilise
 * donc le bleu ardoise du document imprimé (#2F4858) et non l'indigo de
 * l'application : un aperçu qui ne ressemble pas au résultat est pire
 * qu'une absence d'aperçu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, MapPin, FileBadge, PenLine, AtSign, Save, RotateCcw,
  TriangleAlert, Info, Check, X, Loader2, Upload,
} from 'lucide-react';

import api from '@/services/api';
import Layout from '@/components/layout/Layout';
import { CARTE, CHAMP, EnTete, Section, Toast } from '@/components/ui/kit';

// ── Les champs, dans l'ordre où ils se lisent sur un en-tête ───────

type Nom =
  | 'nom' | 'formeJuridique' | 'capital' | 'gerant'
  | 'adresse' | 'codePostal' | 'ville' | 'telephone' | 'email'
  | 'mf' | 'rne' | 'cnss'
  | 'signataire';

interface Champ {
  nom: Nom;
  libelle: string;
  exemple: string;
  /** Obligatoire : une attestation sans cette mention se fait refuser. */
  requis?: boolean;
  /** Largeur dans la grille à deux colonnes. */
  large?: boolean;
  aide?: string;
}

const IDENTITE: Champ[] = [
  { nom: 'nom', libelle: 'Raison sociale', exemple: 'TERRA SARL', requis: true, large: true },
  { nom: 'formeJuridique', libelle: 'Forme juridique', exemple: 'Société à responsabilité limitée', large: true },
  { nom: 'capital', libelle: 'Capital social', exemple: '100 000 TND' },
  { nom: 'gerant', libelle: 'Gérant', exemple: 'Mehdi Trabelsi' },
];

const COORDONNEES: Champ[] = [
  { nom: 'adresse', libelle: 'Adresse', exemple: 'Rue du Lac Léman, Les Berges du Lac', requis: true, large: true },
  { nom: 'codePostal', libelle: 'Code postal', exemple: '1053' },
  { nom: 'ville', libelle: 'Ville', exemple: 'Tunis', requis: true },
  { nom: 'telephone', libelle: 'Téléphone', exemple: '+216 71 000 000' },
  { nom: 'email', libelle: 'Courriel', exemple: 'contact@terra.tn' },
];

const IMMATRICULATIONS: Champ[] = [
  {
    nom: 'mf', libelle: 'Matricule fiscal', exemple: '1234567/A/M/000', requis: true,
    aide: "Mention obligatoire sur les attestations et les bulletins.",
  },
  {
    nom: 'cnss', libelle: 'Affiliation CNSS', exemple: '12345678-19', requis: true,
    aide: "Imposée sur le bulletin de paie par l'article 143 du code du travail.",
  },
  { nom: 'rne', libelle: 'Identifiant RNE', exemple: 'B01234562026' },
];

const SIGNATURE: Champ[] = [
  {
    nom: 'signataire', libelle: "Signataire des attestations", exemple: 'Direction des ressources humaines',
    large: true,
    aide: "Ce qui s'imprime au-dessus du cachet, en bas du document.",
  },
];

const TOUS = [...IDENTITE, ...COORDONNEES, ...IMMATRICULATIONS, ...SIGNATURE];

type Formulaire = Record<Nom, string>;

const VIDE = Object.fromEntries(TOUS.map((c) => [c.nom, ''])) as Formulaire;

interface Remarque { champ: string; message: string }

// ── Contrôles de format ────────────────────────────────────────────
//
// Ils avertissent sans bloquer. Une règle plus stricte que
// l'administration ferait refuser un matricule valide que l'application
// serait seule à juger mal formé, sans aucun moyen de passer outre.

const FORMATS: Partial<Record<Nom, { motif: RegExp; attendu: string }>> = {
  mf: {
    motif: /^\d{7}\/[A-Z]\/[A-Z]\/\d{3}$/,
    attendu: 'sept chiffres puis trois groupes, par exemple 1234567/A/M/000',
  },
  cnss: {
    motif: /^\d{8}-\d{2}$/,
    attendu: 'huit chiffres, un tiret, deux chiffres, par exemple 12345678-19',
  },
  email: {
    motif: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    attendu: 'une adresse de la forme contact@exemple.tn',
  },
  telephone: {
    motif: /^\+?[\d\s().-]{8,}$/,
    attendu: 'un numéro, par exemple +216 71 000 000',
  },
};

function remarquesLocales(f: Formulaire): Remarque[] {
  const liste: Remarque[] = [];
  for (const [nom, regle] of Object.entries(FORMATS) as [Nom, { motif: RegExp; attendu: string }][]) {
    const valeur = (f[nom] ?? '').trim();
    if (valeur && !regle.motif.test(valeur)) {
      const libelle = TOUS.find((c) => c.nom === nom)?.libelle ?? nom;
      liste.push({ champ: nom, message: `${libelle} : format inhabituel. On attend ${regle.attendu}.` });
    }
  }
  return liste;
}

function manquants(f: Formulaire): Champ[] {
  return TOUS.filter((c) => c.requis && !(f[c.nom] ?? '').trim());
}

// ── Domaines de messagerie ─────────────────────────────────────────

function normaliserDomaine(valeur: string): string {
  return valeur.trim().toLowerCase()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

// ── L'aperçu : l'en-tête tel qu'il sera imprimé ────────────────────

/** Les couleurs de `bulletin-pdf.js`, reprises à l'identique. */
const PDF = {
  marque: '#2F4858',
  marqueClair: '#F2F5F7',
  encre: '#1A1D24',
  encreDouce: '#6B7280',
  surLeBandeau: '#D7E0E6',
  libelleBandeau: '#A9BAC4',
  trait: '#DDE3E8',
};

function Apercu({ f, domaines, cachet }: {
  f: Formulaire; domaines: string[]; cachet: string | null;
}) {
  const ligneVille = [f.codePostal, f.ville].filter(Boolean).join(' ');
  const adresse = [f.adresse, ligneVille].filter(Boolean).join(' — ');
  const pied = [
    f.nom,
    f.mf && `MF ${f.mf}`,
    f.cnss && `CNSS ${f.cnss}`,
    f.telephone,
  ].filter(Boolean).join('  ·  ');

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {/* Le bandeau : raison sociale à gauche, immatriculations à droite */}
      <div className="px-4 pt-4 pb-3.5" style={{ backgroundColor: PDF.marque }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold leading-tight text-white">
              {f.nom || '—'}
            </p>
            <p
              className="mt-1.5 line-clamp-2 text-[8.5px] leading-snug"
              style={{ color: PDF.surLeBandeau }}
            >
              {adresse || ' '}
            </p>
          </div>

          <div className="shrink-0 text-end">
            <p className="text-[7px] tracking-wide" style={{ color: PDF.libelleBandeau }}>
              MATRICULE FISCAL
            </p>
            <p className="text-[9px] font-bold text-white">{f.mf || '—'}</p>
            <p className="mt-1.5 text-[7px] tracking-wide" style={{ color: PDF.libelleBandeau }}>
              AFFILIATION CNSS
            </p>
            <p className="text-[9px] font-bold text-white">{f.cnss || '—'}</p>
          </div>
        </div>
      </div>

      {/* Le bandeau clair du titre */}
      <div className="py-2 text-center" style={{ backgroundColor: PDF.marqueClair }}>
        <p
          className="text-[10px] font-bold"
          style={{ color: PDF.marque, letterSpacing: '0.12em' }}
        >
          ATTESTATION DE TRAVAIL
        </p>
      </div>

      {/* Un aperçu du corps, pour que le bandeau ne flotte pas seul */}
      <div className="space-y-2 px-4 py-4">
        <div className="space-y-1">
          <div className="h-1.5 w-1/3 rounded-full bg-stone-200" />
          <div className="h-1.5 w-full rounded-full bg-stone-100" />
          <div className="h-1.5 w-11/12 rounded-full bg-stone-100" />
          <div className="h-1.5 w-2/3 rounded-full bg-stone-100" />
        </div>

        {/* Le cartouche de signature, tel que `blocSignature` le
            dessine : le cachet déposé s'y imprime, sinon le cadre en
            pointillés reste à tamponner à la main. */}
        <div className="flex justify-end pt-3">
          <div className="w-1/2 text-center">
            <p className="text-[8px] font-bold" style={{ color: PDF.encre }}>
              Pour la société
            </p>
            <p className="text-[7px]" style={{ color: PDF.encreDouce }}>
              Signature et cachet
            </p>
            <div
              className={`mt-1 flex h-11 items-center justify-center rounded ${
                cachet ? '' : 'border border-dashed'
              }`}
              style={cachet ? undefined : { borderColor: PDF.trait }}
            >
              {cachet && (
                <img
                  src={`data:image/png;base64,${cachet}`}
                  alt=""
                  className="max-h-11 max-w-full object-contain"
                />
              )}
            </div>
            {(f.signataire || f.gerant) && (
              <p className="mt-0.5 text-[7px]" style={{ color: PDF.encreDouce }}>
                {f.signataire || f.gerant}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Le pied de page, sur chaque feuille */}
      <div className="px-4 pb-3">
        <div className="mb-2 h-px w-full" style={{ backgroundColor: PDF.trait }} />
        <p className="text-[7px] leading-snug" style={{ color: PDF.encreDouce }}>
          {pied || ' '}
        </p>
      </div>

      {domaines.length > 0 && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-2.5">
          <p className="text-[10px] text-stone-400">
            Salariés rattachés par courriel
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-stone-600">
            {domaines.map((d) => `@${d}`).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────

export default function ParametresEntreprisePage() {
  const [form, setForm] = useState<Formulaire>(VIDE);
  const [domaines, setDomaines] = useState<string[]>([]);
  const [saisieDomaine, setSaisieDomaine] = useState('');

  const [initial, setInitial] = useState<Formulaire>(VIDE);
  const [domainesInitiaux, setDomainesInitiaux] = useState<string[]>([]);

  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modifieLe, setModifieLe] = useState<string | null>(null);
  const [modifiePar, setModifiePar] = useState<string | null>(null);

  // Le cachet. `undefined` = inchangé, `null` = retiré, chaîne =
  // nouvelle image. Les trois états sont distincts parce que le serveur
  // conserve l'ancien cachet quand le champ est absent du corps.
  const [cachet, setCachet] = useState<string | null | undefined>(undefined);
  const [cachetExistant, setCachetExistant] = useState<string | null>(null);
  const [cachetErreur, setCachetErreur] = useState<string | null>(null);

  const premierManquant = useRef<HTMLInputElement | null>(null);
  const champCachet = useRef<HTMLInputElement | null>(null);

  // Ce qui doit s'afficher : la nouvelle image, ou l'ancienne, ou rien.
  const cachetAffiche = cachet === undefined ? cachetExistant : cachet;

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const { data } = await api.get('/entreprise');
      const e = data?.entreprise ?? {};

      // `villeNom` et non `ville` : le serveur compose « 1053 Tunis »
      // dans `ville` pour le PDF, et le formulaire doit retrouver les
      // deux champs séparés.
      const rempli: Formulaire = { ...VIDE };
      for (const c of TOUS) rempli[c.nom] = String(e[c.nom] ?? '');
      rempli.ville = String(e.villeNom ?? e.ville ?? '');

      setForm(rempli);
      setInitial(rempli);

      const d: string[] = Array.isArray(e.domaines) ? e.domaines : [];
      setDomaines(d);
      setDomainesInitiaux(d);

      setCachetExistant(e.cachet ?? null);
      setCachet(undefined);
      setCachetErreur(null);

      setModifieLe(e.modifieLe ?? null);
      setModifiePar(e.modifiePar ?? null);
    } catch {
      setErreur(
        "Impossible de lire l'identité de l'entreprise. Si la table "
        + "n'existe pas encore, lancez « node creer-table-entreprise.js »."
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const absents = useMemo(() => manquants(form), [form]);
  const remarques = useMemo(() => remarquesLocales(form), [form]);

  const modifie = useMemo(() => {
    if (TOUS.some((c) => (form[c.nom] ?? '') !== (initial[c.nom] ?? ''))) return true;
    if (cachet !== undefined) return true;
    return domaines.join(',') !== domainesInitiaux.join(',');
  }, [form, initial, domaines, domainesInitiaux, cachet]);

  const majChamp = (nom: Nom, valeur: string) =>
    setForm((f) => ({ ...f, [nom]: valeur }));

  /**
   * Réduit l'image à 600 px de côté avant de l'envoyer.
   *
   * Un scan de cachet fait couramment 3 000 px et deux mégaoctets, pour
   * une empreinte qui s'imprime sur 25 mm. La réduction se fait ici et
   * non au serveur : elle évite de téléverser deux mégaoctets pour en
   * garder quarante kilo-octets, et elle supprime la seule cause de
   * refus que la RH ne saurait pas corriger.
   */
  const reduire = (f: File) => new Promise<string>((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('lecture'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image'));
      img.onload = () => {
        const COTE = 600;
        const ratio = Math.min(1, COTE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        const ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        // Pas de fond blanc : un cachet se pose sur le document, et un
        // rectangle blanc masquerait la ligne de signature dessous.
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png').replace(/^data:[^,]+,/, ''));
      };
      img.src = String(lecteur.result);
    };
    lecteur.readAsDataURL(f);
  });

  const deposerCachet = async (f: File | null) => {
    if (!f) return;
    setCachetErreur(null);

    if (!['image/png', 'image/jpeg'].includes(f.type)) {
      setCachetErreur('Déposez une image PNG ou JPEG.');
      return;
    }
    // Cinq mégaoctets en entrée : au-delà c'est une photo d'appareil,
    // et le navigateur peine à la décoder avant de la réduire.
    if (f.size > 5 * 1024 * 1024) {
      setCachetErreur(`${(f.size / 1024 / 1024).toFixed(1)} Mo — 5 Mo au maximum.`);
      return;
    }

    try {
      setCachet(await reduire(f));
    } catch {
      setCachetErreur("Cette image n'a pas pu être lue.");
    }
  };

  const ajouterDomaine = () => {
    const d = normaliserDomaine(saisieDomaine);
    setSaisieDomaine('');
    // Un domaine sans point n'est pas un domaine : « terra » laisserait
    // passer n'importe quel courriel interne mal saisi.
    if (!d || !d.includes('.') || domaines.includes(d)) return;
    if (domaines.length >= 10) return;
    setDomaines((liste) => [...liste, d]);
  };

  const enregistrer = async () => {
    if (absents.length > 0) {
      // On ne bloque pas silencieusement : on amène la RH au champ.
      premierManquant.current?.focus();
      premierManquant.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    setEnregistrement(true);
    setErreur(null);
    try {
      const { data } = await api.put('/entreprise', {
        ...form,
        domaines,
        // Absent quand rien n'a bougé : le serveur garde alors le
        // cachet déjà déposé au lieu de l'effacer.
        ...(cachet === undefined
          ? {}
          : { cachet, cachetTypeMime: cachet ? 'image/png' : null }),
      });
      setInitial(form);
      setDomainesInitiaux(domaines);
      if (cachet !== undefined) { setCachetExistant(cachet); setCachet(undefined); }
      setModifieLe(data?.entreprise?.modifieLe ?? new Date().toISOString());
      setModifiePar(data?.entreprise?.modifiePar ?? null);
      setToast(
        data?.message
        ?? "Identité enregistrée. Les prochains documents la porteront."
      );
    } catch {
      setErreur("L'enregistrement a échoué. Rien n'a été modifié.");
    } finally {
      setEnregistrement(false);
    }
  };

  const annuler = () => {
    setForm(initial);
    setDomaines(domainesInitiaux);
    setSaisieDomaine('');
    setCachet(undefined);
    setCachetErreur(null);
    setErreur(null);
  };

  // Le premier champ obligatoire vide, pour le focus et le liseré rouge.
  const premierAbsent = absents[0]?.nom ?? null;

  const Groupe = ({ liste }: { liste: Champ[] }) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {liste.map((c) => {
        const remarque = remarques.find((r) => r.champ === c.nom);
        const vide = !!c.requis && !(form[c.nom] ?? '').trim();

        return (
          <div key={c.nom} className={c.large ? 'sm:col-span-2' : ''}>
            <label
              htmlFor={`ent-${c.nom}`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-stone-700"
            >
              <span className="truncate">{c.libelle}</span>
              {c.requis && (
                <span
                  className="shrink-0 text-red-500"
                  title="Mention obligatoire sur les documents"
                  aria-label="obligatoire"
                >
                  *
                </span>
              )}
            </label>

            <input
              id={`ent-${c.nom}`}
              ref={c.nom === premierAbsent ? premierManquant : undefined}
              type="text"
              value={form[c.nom] ?? ''}
              onChange={(e) => majChamp(c.nom, e.target.value)}
              placeholder={c.exemple}
              aria-invalid={vide || !!remarque}
              aria-describedby={remarque ? `ent-${c.nom}-remarque` : undefined}
              className={`${CHAMP} ${
                vide
                  ? 'border-red-200 bg-red-50/40'
                  : remarque
                    ? 'border-amber-200 bg-amber-50/40'
                    : ''
              }`}
            />

            {remarque ? (
              <p
                id={`ent-${c.nom}-remarque`}
                className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600"
              >
                <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  {remarque.message.replace(`${c.libelle} : `, '')}
                  {' '}L'enregistrement reste possible.
                </span>
              </p>
            ) : c.aide ? (
              <p className="mt-1.5 text-xs text-stone-400">{c.aide}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Réglages', 'Entreprise']}
          titre="Entreprise"
          sousTitre="L'identité qui s'imprime sur les bulletins de paie et les attestations"
        >
          {modifieLe && (
            <p className="text-xs text-stone-400">
              Modifiée le{' '}
              {new Date(modifieLe).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
              {modifiePar ? ` par ${modifiePar}` : ''}
            </p>
          )}
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">

      {erreur && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{erreur}</p>
        </div>
      )}

      {!chargement && absents.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {absents.length === 1
                ? 'Une mention obligatoire manque'
                : `${absents.length} mentions obligatoires manquent`}
              {' : '}
              {absents.map((c) => c.libelle).join(', ')}.
            </p>
            <p className="mt-0.5 text-amber-700">
              {absents.length === 1
                ? "Tant qu'elle est vide, l'en-tête des attestations imprime « — » à sa place"
                : "Tant qu'elles sont vides, l'en-tête des attestations imprime « — » à leur place"}
              , et un salarié peut se faire refuser le document au guichet.
            </p>
          </div>
        </div>
      )}

      {chargement ? (
        <div className={`${CARTE} flex items-center justify-center gap-3 py-16`}>
          <Loader2 className="h-4 w-4 animate-spin text-stone-300" />
          <p className="text-sm text-stone-400">Lecture de l'identité…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* ── Le formulaire ── */}
          <div className="space-y-5 xl:col-span-2">
            <Section icone={Building2} titre="Identité juridique">
              <Groupe liste={IDENTITE} />
            </Section>

            <Section icone={MapPin} titre="Coordonnées">
              <Groupe liste={COORDONNEES} />
            </Section>

            <Section icone={FileBadge} titre="Immatriculations">
              <Groupe liste={IMMATRICULATIONS} />
            </Section>

            <Section icone={PenLine} titre="Attestations">
              <Groupe liste={SIGNATURE} />

              <div className="mt-5 border-t border-stone-100 pt-5">
                <p className="mb-1.5 text-sm font-medium text-stone-700">
                  Cachet de la société
                </p>
                <p className="mb-4 text-sm text-stone-500">
                  Sans cachet déposé, l'attestation sort avec un cadre en
                  pointillés à tamponner à la main. Avec, il s'imprime
                  dedans et le document part signé.
                </p>

                <div className="flex flex-wrap items-start gap-4">
                  {/* Le cadre de signature, à l'échelle du document */}
                  <div
                    className={`flex h-28 w-44 shrink-0 items-center justify-center rounded-lg ${
                      cachetAffiche
                        ? 'border border-stone-200 bg-white'
                        : 'border-2 border-dashed border-stone-200 bg-stone-50'
                    }`}
                  >
                    {cachetAffiche ? (
                      <img
                        src={`data:image/png;base64,${cachetAffiche}`}
                        alt="Cachet de la société"
                        className="max-h-24 max-w-40 object-contain"
                      />
                    ) : (
                      <p className="px-3 text-center text-xs text-stone-400">
                        Signature et cachet
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => champCachet.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {cachetAffiche ? 'Remplacer' : 'Déposer une image'}
                      </button>

                      {cachetAffiche && (
                        <button
                          type="button"
                          onClick={() => { setCachet(null); setCachetErreur(null); }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                          Retirer
                        </button>
                      )}
                    </div>

                    <input
                      ref={champCachet}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(ev) => {
                        void deposerCachet(ev.target.files?.[0] ?? null);
                        // Sans cette remise à zéro, redéposer le même
                        // fichier après l'avoir retiré ne déclenche rien.
                        ev.target.value = '';
                      }}
                      className="hidden"
                    />

                    {cachetErreur ? (
                      <p className="mt-2.5 flex items-start gap-1.5 text-xs text-red-500">
                        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                        {cachetErreur}
                      </p>
                    ) : (
                      <p className="mt-2.5 text-xs text-stone-400">
                        PNG de préférence, sur fond transparent. L'image est
                        réduite à 600 px avant l'envoi, vous pouvez déposer
                        un scan tel quel.
                      </p>
                    )}

                    {cachet !== undefined && (
                      <p className="mt-2 text-xs text-brand-texte">
                        {cachet
                          ? "Nouveau cachet — il sera appliqué à l'enregistrement."
                          : "Le cachet sera retiré à l'enregistrement."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section icone={AtSign} titre="Rattachement des salariés">
              <p className="mb-4 text-sm text-stone-500">
                Les domaines de messagerie de l'entreprise. Un salarié dont
                le courriel professionnel finit par l'un d'eux lui est
                rattaché automatiquement, et une adresse qui n'y correspond
                pas est signalée à la création de la fiche — ce qui attrape
                les fautes de frappe, première cause de salarié qui ne
                reçoit jamais ses notifications.
              </p>

              <div className="flex flex-wrap gap-2">
                {domaines.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 py-1 ps-2.5 pe-1.5 text-sm font-medium text-brand-texte"
                  >
                    @{d}
                    <button
                      type="button"
                      onClick={() => setDomaines((l) => l.filter((x) => x !== d))}
                      className="rounded p-0.5 text-brand-texte/60 transition-colors hover:bg-brand-500/15 hover:text-brand-texte"
                      aria-label={`Retirer ${d}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}

                {domaines.length === 0 && (
                  <p className="text-sm text-stone-400">
                    Aucun domaine déclaré : aucune adresse n'est refusée.
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={saisieDomaine}
                  onChange={(e) => setSaisieDomaine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      ajouterDomaine();
                    }
                  }}
                  placeholder="terra.tn"
                  disabled={domaines.length >= 10}
                  className={CHAMP}
                  aria-label="Ajouter un domaine"
                />
                <button
                  type="button"
                  onClick={ajouterDomaine}
                  disabled={!saisieDomaine.trim() || domaines.length >= 10}
                  className="shrink-0 rounded-xl border border-stone-200 px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>
            </Section>
          </div>

          {/* ── L'aperçu ── */}
          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-6">
              <div className={`${CARTE} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-stone-800">
                    Aperçu du document
                  </h2>
                  <span className="shrink-0 text-xs text-stone-400">en direct</span>
                </div>

                <Apercu f={form} domaines={domaines} cachet={cachetAffiche} />

                <p className="mt-3 text-xs text-stone-400">
                  Les couleurs sont celles du PDF, pas celles de
                  l'application : cet aperçu montre ce qui sort à
                  l'impression.
                </p>
              </div>

              {remarques.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
                    <Info className="h-4 w-4 shrink-0" />
                    {remarques.length === 1
                      ? 'Un format à vérifier'
                      : `${remarques.length} formats à vérifier`}
                  </p>
                  <ul className="space-y-1.5">
                    {remarques.map((r) => (
                      <li key={r.champ} className="text-xs text-amber-700">
                        {r.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-600">
                    Ce sont des avertissements : si le document officiel
                    porte bien cette forme, enregistrez.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── La barre d'action ── */}
      {!chargement && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-stone-100 bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            {/* Masqué sur téléphone : les deux boutons y laissent une
                centaine de pixels, et le bandeau du haut dit déjà ce qui
                manque. */}
            <p className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-stone-400 sm:flex">
              {!modifie && absents.length === 0 && (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              {modifie
                ? 'Modifications non enregistrées'
                : absents.length > 0
                  ? 'Identité incomplète'
                  : 'Identité complète'}
            </p>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={annuler}
                disabled={!modifie || enregistrement}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Annuler
              </button>

              <button
                type="button"
                onClick={enregistrer}
                disabled={!modifie || enregistrement}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
              >
                {enregistrement ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : absents.length > 0 ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast} onClose={() => setToast(null)} />
      )}

        </div>
      </Layout>
    </div>
  );
}