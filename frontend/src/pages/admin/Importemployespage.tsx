/**
 * Réglages › Importer des salariés — reprendre un tableur existant.
 *
 * ── Le cas que ça couvre ───────────────────────────────────────────
 *
 * Une PME qui tient ses salariés dans Excel depuis dix ans. Lui
 * demander de ressaisir quarante fiches à la main, c'est garantir
 * qu'elle ne passera jamais à l'application.
 *
 * ── Pourquoi quatre étapes ─────────────────────────────────────────
 *
 * Le tableur d'une entreprise réelle n'a jamais les bonnes colonnes.
 * Elles s'appellent « Nom et prénom », « Date d'entrée », « Salaire
 * brut », il y a trois lignes de titre avant les données, et une
 * colonne vide au milieu. Un import qui exige un format précis est un
 * import qu'on n'utilise pas.
 *
 *   1. Dépôt           le fichier, ou le modèle à télécharger
 *   2. Correspondance  quelle colonne du tableur va dans quel champ
 *   3. Aperçu          ce qui passera, ce qui bloquera, et pourquoi
 *   4. Résultat        ce qui a été créé, et les invitations
 *
 * L'aperçu appelle le serveur en mode `verifierSeulement` : c'est la
 * MÊME validation que l'import réel, donc ce qui est annoncé vert
 * passera. Un import à moitié fait sur une base de salariés est très
 * pénible à défaire.
 *
 * ── Le fichier ne quitte pas le navigateur ─────────────────────────
 *
 * Il est lu ici, et seules les lignes retenues partent en JSON. Un
 * classeur de 2 Mo n'a aucune raison de traverser le réseau pour qu'on
 * en garde quarante lignes — et le serveur n'a pas à connaître le
 * format d'Excel ni ses dates comptées depuis 1900.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, Check, X, AlertTriangle, Download,
  ArrowRight, ArrowLeft, Loader2, Table2, UserPlus, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import api from '@/services/api';
import Layout from '@/components/layout/Layout';
import { CARTE, EnTete, Section, Toast } from '@/components/ui/kit';

// ── Les colonnes attendues ─────────────────────────────────────────

interface Colonne {
  cle: string;
  libelle: string;
  obligatoire: boolean;
  type: string;
}

/** Repli si le serveur ne répond pas : la page reste utilisable. */
const COLONNES_DEFAUT: Colonne[] = [
  { cle: 'prenom', libelle: 'Prénom', obligatoire: true, type: 'texte' },
  { cle: 'nom', libelle: 'Nom', obligatoire: true, type: 'texte' },
  { cle: 'email', libelle: 'Adresse pro', obligatoire: true, type: 'texte' },
  { cle: 'poste', libelle: 'Poste', obligatoire: false, type: 'texte' },
  { cle: 'departement', libelle: 'Département', obligatoire: false, type: 'texte' },
  { cle: 'dateEmbauche', libelle: "Date d'embauche", obligatoire: false, type: 'date' },
  { cle: 'typeContrat', libelle: 'Type de contrat', obligatoire: false, type: 'contrat' },
  { cle: 'salaireBrutMensuel', libelle: 'Salaire brut mensuel', obligatoire: false, type: 'nombre' },
  { cle: 'telephone', libelle: 'Téléphone', obligatoire: false, type: 'texte' },
  { cle: 'matriculeCnss', libelle: 'Matricule CNSS', obligatoire: false, type: 'texte' },
];

/**
 * Les noms qu'une colonne porte dans la vraie vie.
 *
 * Reconnaître « Date d'entrée » évite à la RH de régler dix listes
 * déroulantes. Elle garde la main : la détection ne fait que
 * pré-remplir.
 */
const SYNONYMES: Record<string, string[]> = {
  prenom: ['prenom', 'firstname', 'first', 'given'],
  nom: ['nom', 'lastname', 'last', 'famille', 'surname', 'patronyme'],
  email: ['email', 'mail', 'courriel', 'adressemail', 'adressepro',
    'adresseprofessionnelle', 'emailpro'],
  poste: ['poste', 'fonction', 'emploi', 'job', 'intitule', 'position', 'metier'],
  departement: ['departement', 'service', 'direction', 'dept', 'equipe', 'pole'],
  dateEmbauche: ['dateembauche', 'dateentree', 'embauche', 'entree', 'datedebut',
    'debut', 'hiredate', 'anciennete', 'recrutement'],
  typeContrat: ['typecontrat', 'contrat', 'typedecontrat', 'contract', 'nature'],
  salaireBrutMensuel: ['salaire', 'salairebrut', 'salairebase', 'brut',
    'remuneration', 'salairemensuel', 'salairedebase', 'paie'],
  telephone: ['telephone', 'tel', 'mobile', 'gsm', 'phone', 'portable', 'numero'],
  // Pas de « matricule » seul : dans un tableur de PME, c'est le
  // numéro interne du salarié, pas son affiliation CNSS. La
  // détection le rattachait au mauvais champ, et un numéro d'ordre
  // « 001 » finissait en matricule de sécurité sociale.
  matriculeCnss: ['cnss', 'matriculecnss', 'numerocnss', 'securitesociale',
    'affiliationcnss'],
};

/** Minuscules, sans accent ni ponctuation : « Date d'entrée » → dateentree */
function normaliser(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Devine à quelle colonne attendue correspond un en-tête.
 *
 * L'égalité l'emporte sur l'inclusion, et le synonyme le plus long
 * l'emporte sur le plus court — sans quoi « prenom » serait reconnu
 * comme « nom », qu'il contient.
 */
function deviner(entete: string): { cle: string; score: number } | null {
  const e = normaliser(entete);
  if (!e) return null;

  let meilleur: { cle: string; score: number } | null = null;

  for (const [cle, mots] of Object.entries(SYNONYMES)) {
    for (const mot of mots) {
      let score = 0;
      if (e === mot) score = 1000;
      else if (e.startsWith(mot)) score = 500 + mot.length;
      else if (mot.length >= 4 && e.includes(mot)) score = 100 + mot.length;
      if (score > (meilleur?.score ?? 0)) meilleur = { cle, score };
    }
  }
  return meilleur;
}

/**
 * Traduit un échec d'appel en phrase qui dit quoi faire.
 *
 * « La vérification a échoué » n'apprend rien : la cause la plus
 * fréquente, de loin, est que les deux routes ne sont pas encore
 * posées dans `server.js`. Le dire évite une demi-heure à chercher du
 * côté du fichier Excel.
 */
function messageErreur(e: any, quoi: string): string {
  const reponse = e?.response;
  const statut = reponse?.status;
  const duServeur = reponse?.data?.message ?? reponse?.data?.erreur ?? e?.erreur;

  if (statut === 404) {
    return `La route n'existe pas sur le serveur (404). Ajoute les deux `
      + `routes de l'import dans server.js : POST /employes/import et `
      + `GET /employes/import/modele.`;
  }
  if (statut === 401) return 'Session expirée. Reconnecte-toi.';
  if (statut === 403) return "Cette page est réservée aux ressources humaines.";
  if (statut === 413) {
    return 'Le fichier est trop gros pour le serveur. Coupe-le en deux.';
  }
  if (statut === 503 || statut === 500) {
    // Le message du serveur d'abord : `invitations.js` renvoie en 503
    // des phrases qui disent exactement quoi configurer — le pool
    // Cognito manquant, ou les droits IAM à ajouter.
    return duServeur
      ?? `Le serveur a répondu ${statut}. Regarde sa console : l'erreur `
        + `exacte y est écrite.`;
  }
  // Pas de réponse du tout : serveur éteint, mauvaise adresse, CORS.
  if (!reponse) {
    return `Le serveur n'a pas répondu. Vérifie qu'il tourne, et que `
      + `VITE_API_URL pointe au bon endroit.`;
  }
  return duServeur ?? `${quoi} a échoué (${statut ?? 'erreur inconnue'}).`;
}

type Etape = 'depot' | 'correspondance' | 'apercu' | 'fini';

interface LigneRapport {
  ligne: number;
  nom: string;
  email: string | null;
  etat: 'PRETE' | 'REFUSEE';
  erreurs: string[];
  avertissements: string[];
}

interface Cree { id: string; nom: string; email: string }

// ── La page ────────────────────────────────────────────────────────

export default function ImportEmployesPage() {
  const [etape, setEtape] = useState<Etape>('depot');
  const [toast, setToast] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const [colonnes, setColonnes] = useState<Colonne[]>(COLONNES_DEFAUT);

  const [nomFichier, setNomFichier] = useState('');
  /** Le classeur entier, tel quel : chaque case est une chaîne. */
  const [grille, setGrille] = useState<string[][]>([]);
  const [ligneEntete, setLigneEntete] = useState(0);
  /** cle de colonne attendue → index de colonne du tableur, ou -1 */
  const [liaison, setLiaison] = useState<Record<string, number>>({});

  const [rapport, setRapport] = useState<LigneRapport[]>([]);
  const [crees, setCrees] = useState<Cree[]>([]);
  const [invites, setInvites] = useState<string[]>([]);

  const champFichier = useRef<HTMLInputElement | null>(null);

  // ── Lecture du classeur ──

  const lire = useCallback(async (f: File) => {
    setErreur(null);
    setOccupe(true);
    try {
      const octets = await f.arrayBuffer();
      const classeur = XLSX.read(octets, {
        // Les dates arrivent en objets Date plutôt qu'en nombre de
        // jours depuis 1900 : c'est la source d'erreur numéro un des
        // imports de tableurs.
        cellDates: true,
      });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      if (!feuille) throw new Error('vide');

      // Le type est écrit à la main plutôt que déduit de SheetJS :
      // selon la version, `sheet_to_json` rend `unknown[]`, et tout ce
      // qui en découle devient implicitement `any`. Cinq erreurs de
      // compilation en cascade pour une seule cause.
      const lignes: unknown[][] = XLSX.utils.sheet_to_json(feuille, {
        header: 1, blankrows: false, defval: '', raw: false,
      }) as unknown[][];

      if (lignes.length < 2) {
        setErreur(
          "Ce fichier ne contient qu'une ligne ou aucune. Il faut une "
          + "ligne de titres et au moins une ligne de salarié."
        );
        return;
      }

      setNomFichier(f.name);
      setGrille(lignes.map((l: unknown[]) => l.map((c: unknown) => String(c ?? ''))));

      // La ligne de titres est la première qui reconnaît au moins deux
      // colonnes. Une PME met souvent un logo et un titre avant.
      let entete = 0;
      let meilleur = 0;
      for (let i = 0; i < Math.min(lignes.length, 10); i++) {
        const trouves = lignes[i]
          .map((c: unknown) => deviner(String(c)))
          .filter((d): d is { cle: string; score: number } => !!d && d.score >= 500)
          .length;
        if (trouves > meilleur) { meilleur = trouves; entete = i; }
      }
      setLigneEntete(entete);
      setLiaison(devinerLiaison((lignes[entete] ?? []).map((c: unknown) => String(c ?? ''))));
      setEtape('correspondance');
    } catch {
      setErreur(
        "Ce fichier n'a pas pu être lu. Attendu : un classeur .xlsx, "
        + ".xls ou .csv."
      );
    } finally {
      setOccupe(false);
    }
  }, []);

  /** Une colonne du tableur ne sert qu'une fois. */
  function devinerLiaison(entetes: string[]): Record<string, number> {
    const propositions: { cle: string; i: number; score: number }[] = [];
    entetes.forEach((e, i) => {
      const d = deviner(e);
      if (d) propositions.push({ ...d, i });
    });
    propositions.sort((a, b) => b.score - a.score);

    const pris = new Set<number>();
    const faite: Record<string, number> = {};
    for (const p of propositions) {
      if (faite[p.cle] !== undefined || pris.has(p.i)) continue;
      faite[p.cle] = p.i;
      pris.add(p.i);
    }
    return faite;
  }

  // Quand la RH change la ligne de titres, la correspondance se refait.
  const changerEntete = (i: number) => {
    setLigneEntete(i);
    setLiaison(devinerLiaison((grille[i] ?? []).map(String)));
  };

  const entetes = grille[ligneEntete] ?? [];
  const donnees = useMemo(
    () => grille.slice(ligneEntete + 1).filter((l) => l.some((c) => String(c).trim())),
    [grille, ligneEntete],
  );

  const manquantes = colonnes.filter(
    (c) => c.obligatoire && (liaison[c.cle] === undefined || liaison[c.cle] < 0));

  /** Les lignes à envoyer, dans le vocabulaire du serveur. */
  const lignesAEnvoyer = useMemo(() => donnees.map((l, i) => {
    const o: Record<string, unknown> = { __ligne: ligneEntete + 2 + i };
    for (const c of colonnes) {
      const j = liaison[c.cle];
      if (j === undefined || j < 0) continue;
      o[c.cle] = l[j] ?? '';
    }
    return o;
  }), [donnees, liaison, colonnes, ligneEntete]);

  // ── Serveur ──

  const verifier = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const { data } = await api.post('/employes/import', {
        lignes: lignesAEnvoyer, verifierSeulement: true,
      });
      setRapport(data?.lignes ?? []);
      setEtape('apercu');
    } catch (e: any) {
      setErreur(messageErreur(e, 'La vérification'));
    } finally {
      setOccupe(false);
    }
  };

  const importer = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const { data } = await api.post('/employes/import', { lignes: lignesAEnvoyer });
      setCrees(data?.crees ?? []);
      setRapport(data?.lignes ?? rapport);
      setToast(data?.message ?? 'Import terminé.');
      setEtape('fini');
    } catch (e: any) {
      // « Rien n'a été créé » n'est vrai que si le serveur a refusé
      // avant d'écrire. Un 500 en cours d'écriture laisse des fiches
      // derrière lui, et le promettre serait un mensonge.
      const statut = e?.response?.status;
      setErreur(
        messageErreur(e, "L'import")
        + (statut === 400 || statut === 403 || statut === 404
          ? " Rien n'a été créé."
          : ' Vérifie la liste des salariés avant de recommencer.'),
      );
    } finally {
      setOccupe(false);
    }
  };

  const inviterTous = async () => {
    setOccupe(true);
    setErreur(null);
    const reussis: string[] = [];
    const rates: string[] = [];
    let premiereRaison = '';

    // Une par une, et non en bloc : Cognito limite le débit, et un
    // refus sur l'un ne doit pas annuler les autres.
    for (const c of crees) {
      try {
        await api.post(`/employes/${c.id}/invitation`, {});
        reussis.push(c.email);
      } catch (e: any) {
        rates.push(c.email);
        // La raison du PREMIER échec, et rien de plus : vingt
        // invitations qui échouent pour la même cause donnent vingt
        // fois le même message. Sans elle, l'écran annonçait « 2 en
        // échec » sans dire pourquoi — et le serveur, lui, l'avait
        // écrit dans sa réponse.
        if (!premiereRaison) premiereRaison = messageErreur(e, "L'invitation");
      }
    }

    setInvites(reussis);
    setOccupe(false);

    if (rates.length > 0) {
      setErreur(
        `${rates.length} invitation(s) n'ont pas pu partir. ${premiereRaison}`,
      );
    }
    setToast(
      rates.length === 0
        ? `${reussis.length} invitation${reussis.length > 1 ? 's' : ''} envoyée${reussis.length > 1 ? 's' : ''}.`
        : `${reussis.length} invitation(s) envoyée(s), ${rates.length} en échec.`,
    );
  };

  const telechargerModele = async () => {
    setOccupe(true);
    try {
      let cols = colonnes;
      let exemple: Record<string, unknown>[] = [];
      try {
        const { data } = await api.get('/employes/import/modele');
        if (data?.colonnes?.length) { cols = data.colonnes; setColonnes(data.colonnes); }
        exemple = data?.exemple ?? [];
      } catch {
        // Le serveur n'a pas répondu : le modèle par défaut fait
        // l'affaire, et le fichier se télécharge quand même. Inutile
        // d'alarmer pour un exemple.
      }

      const entete = cols.map((c) => c.libelle + (c.obligatoire ? ' *' : ''));
      const lignes = exemple.map((e) => cols.map((c) => e[c.cle] ?? ''));

      const feuille = XLSX.utils.aoa_to_sheet([entete, ...lignes]);
      feuille['!cols'] = cols.map((c) => ({ wch: Math.max(14, c.libelle.length + 4) }));

      const classeur = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(classeur, feuille, 'Salariés');
      XLSX.writeFile(classeur, 'modele-salaries-hrup.xlsx');
    } finally {
      setOccupe(false);
    }
  };

  const recommencer = () => {
    setEtape('depot');
    setGrille([]); setNomFichier(''); setLiaison({});
    setRapport([]); setCrees([]); setInvites([]); setErreur(null);
  };

  const pretes = rapport.filter((l) => l.etat === 'PRETE').length;
  const refusees = rapport.length - pretes;

  // ── Rendu ──

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">
        <EnTete
          fil={['Salariés', 'Import']}
          titre="Importer des salariés"
          sousTitre="Reprendre un tableur existant, sans ressaisir les fiches"
        />

        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <Etapes courante={etape} />

          {erreur && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{erreur}</p>
            </div>
          )}

          {/* ── 1. Dépôt ── */}
          {etape === 'depot' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void lire(f);
                  }}
                  className={`${CARTE} flex flex-col items-center justify-center px-6 py-16 text-center`}
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
                    {occupe
                      ? <Loader2 className="h-6 w-6 animate-spin text-brand-texte" />
                      : <FileSpreadsheet className="h-6 w-6 text-brand-texte" />}
                  </div>
                  <p className="text-sm font-bold text-stone-800">
                    Glissez votre fichier ici
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    .xlsx, .xls ou .csv — il ne quitte pas votre navigateur
                  </p>

                  <button
                    type="button"
                    onClick={() => champFichier.current?.click()}
                    disabled={occupe}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Choisir un fichier
                  </button>

                  <input
                    ref={champFichier}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void lire(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              <Section icone={Download} titre="Pas de fichier ?">
                <p className="mb-4 text-sm text-stone-500">
                  Téléchargez le modèle : il porte les bonnes colonnes et
                  deux lignes d'exemple. Les colonnes marquées d'une
                  étoile sont obligatoires.
                </p>
                <button
                  type="button"
                  onClick={telechargerModele}
                  disabled={occupe}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Modèle Excel
                </button>

                <p className="mt-4 flex items-start gap-1.5 text-xs text-stone-400">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  Votre fichier n'a pas besoin de ressembler au modèle :
                  vous ferez correspondre les colonnes à l'étape suivante.
                </p>
              </Section>
            </div>
          )}

          {/* ── 2. Correspondance ── */}
          {etape === 'correspondance' && (
            <div className="space-y-5">
              <Section icone={Table2} titre={nomFichier}>
                <div className="mb-5">
                  <label htmlFor="entete" className="mb-1.5 block text-sm font-medium text-stone-700">
                    Ligne des titres
                  </label>
                  <select
                    id="entete"
                    value={ligneEntete}
                    onChange={(e) => changerEntete(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none sm:max-w-md"
                  >
                    {grille.slice(0, 10).map((l, i) => (
                      <option key={i} value={i}>
                        Ligne {i + 1} — {l.slice(0, 4).filter(Boolean).join(' · ').slice(0, 60) || '(vide)'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-stone-400">
                    {donnees.length} ligne{donnees.length > 1 ? 's' : ''} de données en dessous.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {colonnes.map((c) => {
                    const j = liaison[c.cle];
                    const lie = j !== undefined && j >= 0;
                    const absent = c.obligatoire && !lie;

                    return (
                      <div key={c.cle}>
                        <label
                          htmlFor={`col-${c.cle}`}
                          className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-stone-700"
                        >
                          {c.libelle}
                          {c.obligatoire && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          id={`col-${c.cle}`}
                          value={lie ? j : -1}
                          onChange={(e) => setLiaison((l) => ({
                            ...l, [c.cle]: Number(e.target.value),
                          }))}
                          className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm transition-colors focus:outline-none ${
                            absent
                              ? 'border-red-300 bg-red-50/40'
                              : 'border-stone-200 focus:border-brand-500'
                          }`}
                        >
                          <option value={-1}>— ne pas importer —</option>
                          {entetes.map((e, i) => (
                            <option key={i} value={i}>
                              {String(e).trim() || `Colonne ${i + 1}`}
                            </option>
                          ))}
                        </select>

                        {/* La première valeur réelle : la RH vérifie
                            d'un coup d'œil qu'elle a lié la bonne
                            colonne, sans ouvrir le tableur. */}
                        {lie && donnees[0]?.[j] !== undefined && (
                          <p className="mt-1 truncate text-xs text-stone-400">
                            ex. {String(donnees[0][j]).trim() || '(vide)'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={recommencer}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Changer de fichier
                </button>

                <div className="flex items-center gap-3">
                  {manquantes.length > 0 && (
                    <p className="text-xs text-red-600">
                      À relier : {manquantes.map((c) => c.libelle).join(', ')}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={verifier}
                    disabled={occupe || manquantes.length > 0 || donnees.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                  >
                    {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Vérifier les {donnees.length} ligne{donnees.length > 1 ? 's' : ''}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 3. Aperçu ── et ── 4. Résultat ── */}
          {(etape === 'apercu' || etape === 'fini') && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Compteur
                  valeur={etape === 'fini' ? crees.length : pretes}
                  libelle={etape === 'fini' ? 'salariés créés' : 'lignes prêtes'}
                  ton="brand"
                />
                <Compteur valeur={refusees} libelle="lignes refusées" ton="red" />
                <Compteur
                  valeur={etape === 'fini' ? invites.length : rapport.length}
                  libelle={etape === 'fini' ? 'invitations envoyées' : 'lignes lues'}
                  ton="stone"
                />
              </div>

              {etape === 'fini' && crees.length > 0 && (
                <Section icone={UserPlus} titre="Et maintenant, les comptes">
                  <p className="mb-4 text-sm text-stone-500">
                    Les fiches existent, mais personne ne peut encore se
                    connecter. Une invitation envoie à chacun un mot de
                    passe temporaire ; ils choisiront le leur à la
                    première connexion.
                  </p>
                  <button
                    type="button"
                    onClick={inviterTous}
                    disabled={occupe || invites.length > 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                  >
                    {occupe
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <UserPlus className="h-4 w-4" />}
                    {invites.length > 0
                      ? `${invites.length} invitation(s) envoyée(s)`
                      : `Inviter les ${crees.length} salariés`}
                  </button>
                </Section>
              )}

              <div className={`${CARTE} overflow-hidden`}>
                <div className="border-b border-stone-100 bg-stone-50 px-4 py-3">
                  <h3 className="text-sm font-bold text-stone-800">
                    {etape === 'fini' ? 'Ce qui a été fait' : 'Ce qui se passera'}
                  </h3>
                </div>

                <div className="max-h-[28rem] divide-y divide-stone-50 overflow-y-auto">
                  {rapport.map((l) => (
                    <div key={l.ligne} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          l.etat === 'PRETE' ? 'bg-emerald-50' : 'bg-red-50'
                        }`}
                      >
                        {l.etat === 'PRETE'
                          ? <Check className="h-3 w-3 text-emerald-600" />
                          : <X className="h-3 w-3 text-red-500" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-medium text-stone-800">{l.nom}</span>
                          {l.email && (
                            <span className="truncate text-xs text-stone-400">{l.email}</span>
                          )}
                          <span className="text-[10px] text-stone-300">ligne {l.ligne}</span>
                        </p>

                        {l.erreurs.map((e) => (
                          <p key={e} className="mt-0.5 text-xs text-red-600">{e}</p>
                        ))}
                        {l.avertissements.map((a) => (
                          <p key={a} className="mt-0.5 text-xs text-amber-600">{a}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={etape === 'fini' ? recommencer : () => setEtape('correspondance')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {etape === 'fini' ? 'Importer un autre fichier' : 'Revoir les colonnes'}
                </button>

                {etape === 'apercu' && (
                  <button
                    type="button"
                    onClick={importer}
                    disabled={occupe || pretes === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                  >
                    {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Importer {pretes} salarié{pretes > 1 ? 's' : ''}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {etape === 'apercu' && refusees > 0 && (
                <p className="text-xs text-stone-500">
                  Les {refusees} ligne{refusees > 1 ? 's' : ''} refusée{refusees > 1 ? 's' : ''}
                  {' '}ne {refusees > 1 ? 'seront' : 'sera'} pas importée{refusees > 1 ? 's' : ''}.
                  Vous pouvez importer le reste maintenant et corriger le
                  fichier pour une seconde passe : les adresses déjà
                  présentes seront alors reconnues et ignorées.
                </p>
              )}
            </div>
          )}
        </div>

        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </Layout>
    </div>
  );
}

// ── Petits morceaux ────────────────────────────────────────────────

function Etapes({ courante }: { courante: Etape }) {
  const liste: { cle: Etape; libelle: string }[] = [
    { cle: 'depot', libelle: 'Fichier' },
    { cle: 'correspondance', libelle: 'Colonnes' },
    { cle: 'apercu', libelle: 'Aperçu' },
    { cle: 'fini', libelle: 'Terminé' },
  ];
  const i = liste.findIndex((e) => e.cle === courante);

  return (
    <div className="mb-6 flex items-center gap-2 overflow-x-auto">
      {liste.map((e, j) => (
        <div key={e.cle} className="flex shrink-0 items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
              j < i ? 'bg-brand-500 text-white'
                : j === i ? 'bg-brand-500/15 text-brand-texte ring-2 ring-brand-500/30'
                : 'bg-stone-100 text-stone-400'
            }`}
          >
            {j < i ? <Check className="h-3 w-3" /> : j + 1}
          </span>
          <span className={`text-xs ${j <= i ? 'font-medium text-stone-700' : 'text-stone-400'}`}>
            {e.libelle}
          </span>
          {j < liste.length - 1 && (
            <span className={`h-px w-6 ${j < i ? 'bg-brand-500' : 'bg-stone-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Compteur({ valeur, libelle, ton }: {
  valeur: number; libelle: string; ton: 'brand' | 'red' | 'stone';
}) {
  const couleur = ton === 'brand' ? 'text-brand-texte'
    : ton === 'red' ? 'text-red-500' : 'text-stone-500';
  return (
    <div className={`${CARTE} p-5`}>
      <p className={`text-2xl font-bold leading-tight ${couleur}`}>{valeur}</p>
      <p className="mt-0.5 text-xs text-stone-500">{libelle}</p>
    </div>
  );
}