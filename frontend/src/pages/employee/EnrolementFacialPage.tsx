// src/pages/employe/EnrolementFacialPage.tsx
//
// Enrôlement facial pour le pointage : notice, consentement, prises de
// vue, révocation.
//
// ── Ce que cette page défend ────────────────────────────────────────
//
// Le visage est une donnée biométrique. Son traitement ne repose pas
// sur la même base qu'un nom ou une adresse : il exige un consentement
// spécifique, éclairé, et dissociable du reste. Une case cochée à
// l'inscription parmi les conditions générales ne vaut rien ici.
//
// D'où la structure en deux temps : on lit, puis on accepte. Le bouton
// d'acceptation ne s'active qu'après le déroulement de la notice, et
// l'alternative — pointer par QR et géolocalisation — est affichée
// avec le même poids visuel, pas reléguée en petits caractères.
//
// Dans une relation de travail, le consentement n'est jamais
// pleinement libre : un salarié hésite à refuser ce que son employeur
// propose. C'est précisément ce qui fait juger la biométrie au pointage
// disproportionnée par plusieurs autorités de protection des données.
// La page ne peut pas effacer ce déséquilibre ; elle peut rendre le
// refus concret et sans conséquence, ce qui est le minimum.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ScanFace, ShieldCheck, Camera, Check, X, AlertTriangle, Trash2,
  ChevronRight, Loader2, Eye, QrCode, Info, Lock,
} from 'lucide-react';
import {
  chargerModeles, analyser, analyserVivacite,
  ouvrirCamera, fermerCamera, detecteurClignement, distance,
  SEUIL_COHERENCE, PROPORTION_MIN, VIVACITE_EXIGEE,
} from '../../lib/visage';
import api from '../../services/api';
import Chronometre from '@/components/pointages/Chronometre';
import Layout from '@/components/layout/Layout';

const ACCENT = '#4F46E5';

// Version de la notice affichée par CETTE page.
//
// ── Source unique de vérité : le serveur ────────────────────────────
//
// Le serveur refuse un consentement portant sur une autre version que
// la sienne — on ne peut pas consentir à un traitement qu'on n'a pas
// lu. Mais faire porter cette version par une constante côté client
// obligeait deux fichiers à s'accorder sur une chaîne de caractères,
// sans rien pour signaler le désaccord : une mise à jour de la page
// sans mise à jour du serveur, ou l'inverse, bloquait tout enrôlement
// en 409 sans qu'on sache pourquoi.
//
// La page lit donc la version courante dans GET /biometrie/etat et la
// renvoie telle quelle. Le désaccord devient impossible.
//
// Cette constante ne sert plus que de repli si l'état n'a pas pu être
// lu, et d'étiquette affichée en haut de la notice.
//
// Limite assumée : la page pourrait afficher un texte ancien tout en
// renvoyant la version du serveur, si le navigateur sert un paquet
// mis en cache. La correction propre serait de servir le texte de la
// notice depuis le serveur, ce qui n'est pas fait ici.
const VERSION_NOTICE = '2026-10-2';

const NB_PRISES = 3;

// Espacement minimal entre deux prises retenues. 600 ms suffisent
// pour que le visage ait bougé entre les vues ; 900 ms allongeaient
// l'enrôlement sans rendre le gabarit plus robuste.
const ESPACEMENT_MS = 600;

interface Etat {
  enrole: boolean;
  enroleLe: string | null;
  consentementLe: string | null;
  nbVerifications: number;
  derniereVerification: string | null;
  noticeAJour: boolean;
  versionNoticeCourante: string;
}

type Etape = 'chargement' | 'notice' | 'prises' | 'termine' | 'deja_enrole';

/**
 * Message d'erreur tel que le serveur l'a formulé.
 *
 * L'API de ce projet renvoie ses erreurs sous la clé `erreur` ; axios
 * expose aussi `message`. Lire une seule des deux fait tomber dans le
 * texte de repli — et un « réessayez » générique cache la vraie
 * raison, qui est souvent précise et actionnable : notice périmée,
 * apparence redondante, maximum atteint.
 */
function messageErreur(e: any, repli: string): string {
  return e?.response?.data?.erreur
    ?? e?.response?.data?.message
    ?? e?.erreur
    ?? (typeof e?.message === 'string' && !e.message.startsWith('Request failed')
      ? e.message
      : null)
    ?? repli;
}

const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : '—';

export default function EnrolementFacialPage() {
  const [etape, setEtape] = useState<Etape>('chargement');
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');

  // Consentement : deux conditions, volontairement distinctes. Avoir
  // déroulé la notice n'est pas l'avoir acceptée.
  const [noticeLue, setNoticeLue] = useState(false);
  const [accepte, setAccepte] = useState(false);

  const [envoi, setEnvoi] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);

  // ── État courant ──────────────────────────────────────────────────

  const chargerEtat = useCallback(async () => {
    try {
      const { data } = await api.get('/biometrie/etat');
      setEtat(data);
      setEtape(data.enrole ? 'deja_enrole' : 'notice');
    } catch (e: any) {
      setErreur(messageErreur(e, "L'état de votre enrôlement n'a pas pu être lu."));
      setEtape('notice');
    }
  }, []);

  useEffect(() => { chargerEtat(); }, [chargerEtat]);

  // ── Révocation ────────────────────────────────────────────────────

  const revoquer = async () => {
    setSuppression(true);
    setErreur('');
    try {
      await api.delete('/biometrie');
      setConfirmeSuppression(false);
      await chargerEtat();
    } catch (e: any) {
      setErreur(messageErreur(e, "Le gabarit n'a pas pu être supprimé. Réessayez."));
    } finally {
      setSuppression(false);
    }
  };

  // ── Envoi de l'enrôlement ─────────────────────────────────────────

  const envoyer = async (descripteurs: number[][]) => {
    setEnvoi(true);
    setErreur('');
    try {
      await api.post('/biometrie/enroler', {
        descripteurs,
        consentement: {
          accepte: true,
          // La version vient du serveur, pas de cette page.
          versionNotice: etat?.versionNoticeCourante ?? VERSION_NOTICE,
        },
      });
      setEtape('termine');
      await chargerEtat();
    } catch (e: any) {
      setErreur(messageErreur(e, "L'enrôlement n'a pas abouti. Réessayez."));
      setEtape('notice');
    } finally {
      setEnvoi(false);
    }
  };

  // ── Rendu ─────────────────────────────────────────────────────────

    return (
    <Layout>
      {/* La page suivait sa propre règle : enfermée dans une colonne
          de 768 pixels centrée, elle laissait deux larges marges vides
          alors que toutes les autres pages occupent la largeur. Le
          même rembourrage qu'ailleurs supprime l'écart. Seule la
          notice reste bornée, parce qu'un texte en lignes de cent
          quatre-vingts caractères ne se lit pas.
          Pour revenir à l'ancien cadrage, remettre ici
          « max-w-3xl mx-auto ». */}
      <div className="px-4 sm:px-8 py-6 sm:py-8">

        {/* Fil d'Ariane */}
        <nav className="flex items-center gap-1.5 text-xs text-stone-400 mb-4 flex-wrap">
          <Link to="/employe" className="hover:text-brand-texte">Tableau de bord</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/employe/profile" className="hover:text-brand-texte">Mon profil</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-stone-600 font-medium">Reconnaissance faciale</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-800">
            Reconnaissance faciale
          </h1>
          <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">
            Une seconde manière de pointer, facultative. Le pointage par QR
            et géolocalisation reste disponible, et suffit.
          </p>
        </header>

        {erreur && (
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 mb-5 border border-red-100">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{erreur}</span>
          </div>
        )}

        {etape === 'chargement' && (
          <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-12 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
          </div>
        )}

        {etape === 'notice' && (
          <PanneauNotice
            noticeLue={noticeLue}
            surNoticeLue={() => setNoticeLue(true)}
            accepte={accepte}
            surAccepte={setAccepte}
            envoi={envoi}
            surContinuer={() => setEtape('prises')}
            version={etat?.versionNoticeCourante ?? VERSION_NOTICE}
          />
        )}

        {etape === 'prises' && (
          <PanneauPrises
            envoi={envoi}
            surTermine={envoyer}
            surAnnule={() => setEtape('notice')}
            surErreur={(m) => { setErreur(m); setEtape('notice'); }}
          />
        )}

        {etape === 'termine' && (
          <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-stone-800">
              Reconnaissance faciale activée
            </h2>
            <p className="text-sm text-stone-500 mt-2 leading-relaxed max-w-md mx-auto">
              Vous pouvez désormais pointer par reconnaissance faciale. Le QR
              et la géolocalisation restent disponibles, et vous pouvez
              désactiver la reconnaissance à tout moment depuis cette page.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
              <Link
                to="/employe"
                className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors"
              >
                Retour au tableau de bord
              </Link>
              <button
                onClick={() => setEtape('deja_enrole')}
                className="px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
              >
                Voir les détails
              </button>
            </div>
          </div>
        )}

        {etape === 'deja_enrole' && etat && (
          <PanneauEnrole
            etat={etat}
            suppression={suppression}
            confirme={confirmeSuppression}
            surDemandeSuppression={() => setConfirmeSuppression(true)}
            surAnnuleSuppression={() => setConfirmeSuppression(false)}
            surRevoque={revoquer}
            surReenroler={() => {
              setNoticeLue(false);
              setAccepte(false);
              setEtape('notice');
            }}
          />
        )}

       
      </div>
    </Layout>
  );
}

// ── Notice et consentement ──────────────────────────────────────────

function PanneauNotice({
  noticeLue, surNoticeLue, accepte, surAccepte, envoi, surContinuer, version,
}: {
  noticeLue: boolean;
  surNoticeLue: () => void;
  accepte: boolean;
  surAccepte: (v: boolean) => void;
  envoi: boolean;
  surContinuer: () => void;
  /** Version en vigueur, telle que le serveur la déclare. */
  version: string;
}) {
  const zone = useRef<HTMLDivElement>(null);

  // La notice doit avoir défilé jusqu'au bout pour que la case
  // s'active. Un consentement donné sans avoir vu ce qu'on accepte
  // n'est pas éclairé — et c'est la première chose qu'un jury
  // interroge.
  const surDefilement = () => {
    const el = zone.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) surNoticeLue();
  };

  // Une notice plus courte que la zone n'engendre aucun défilement :
  // sans ce contrôle, la case resterait bloquée sur grand écran.
  useEffect(() => {
    const el = zone.current;
    if (el && el.scrollHeight <= el.clientHeight + 24) surNoticeLue();
  }, [surNoticeLue]);

  return (
    <div className="space-y-5">

      {/* Notice d'information */}
      <section className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-stone-100 flex items-center gap-2.5">
          <Info className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
          <h2 className="text-sm font-bold text-stone-800">
            Notice d'information
          </h2>
          <span className="ms-auto text-[10px] text-stone-400 font-mono shrink-0">
            v{version}
          </span>
        </div>

        <div
          ref={zone}
          onScroll={surDefilement}
          className="px-5 sm:px-6 py-5 max-h-80 overflow-y-auto text-sm text-stone-600 space-y-4 leading-relaxed max-w-3xl"
        >
          <Article titre="Ce qui est enregistré">
            Un <strong>gabarit numérique</strong> : une suite de 128 nombres
            calculée à partir de votre visage. Ce n'est pas une
            photographie, et on ne peut pas reconstituer votre image à
            partir de lui par les moyens courants.
            <br />
            <strong>Aucune photographie n'est transmise ni conservée.</strong> Le
            calcul est fait par votre navigateur ; l'image reste sur votre
            appareil et disparaît dès la fin de la prise de vue.
          </Article>

          <Article titre="À quoi cela sert">
            À attester votre présence au moment du pointage, et à rien
            d'autre. Le gabarit n'est pas utilisé pour vous reconnaître sur
            d'autres images, ni pour analyser vos expressions, votre âge ou
            votre état. Les modèles qui le permettraient ne sont pas chargés.
          </Article>

          <Article titre="Qui y a accès">
            Personne ne consulte le gabarit. La comparaison est faite par le
            serveur au moment du pointage. Les ressources humaines voient
            combien de salariés ont activé la reconnaissance, pas lesquels.
          </Article>

          <Article titre="Combien de temps">
            Jusqu'à ce que vous le supprimiez, ou jusqu'à la fin de votre
            contrat — le gabarit est alors effacé automatiquement.
          </Article>

          <Article titre="Ce que vous pouvez refuser">
            Tout. La reconnaissance faciale est facultative. Le pointage par
            QR et géolocalisation reste disponible, donne exactement les
            mêmes droits, et <strong>le refus n'est signalé à personne</strong> :
            les ressources humaines ne voient pas qui a refusé.
            <br />
            Vous pouvez aussi revenir sur votre accord à tout moment, depuis
            cette page, sans avoir à vous justifier. Le gabarit est alors
            supprimé immédiatement.
          </Article>

          <Article titre="Les limites, dites franchement">
            <strong>Il n'y a pas de vérification de vivacité.</strong> Une
            photographie de votre visage présentée à la caméra produit la
            même mesure que votre visage. Un test par clignement avait été
            mis en place puis retiré : il n'écartait qu'une photographie
            imprimée, pas une vidéo rejouée sur un écran, pour un temps
            d'attente et un taux d'échec importants. Une vivacité sérieuse
            demande une caméra infrarouge ou à profondeur, que les postes de
            travail ordinaires n'ont pas.
            <br />
            La reconnaissance faciale n'est donc <strong>pas plus sûre</strong> que
            le QR : elle est plus rapide. C'est son seul avantage réel, et
            c'est la raison pour laquelle elle reste facultative. Ce qui
            atteste votre présence sur le lieu de travail, dans les deux cas,
            c'est la géolocalisation.
          </Article>

          <Article titre="Base juridique">
            Votre consentement, et lui seul. Les données biométriques
            relèvent en Tunisie de la loi organique n° 2004-63 relative à la
            protection des données à caractère personnel, et leur traitement
            est soumis à l'autorisation de l'Instance nationale de protection
            des données personnelles.
            <br />
            Dans une relation de travail, un consentement n'est jamais
            pleinement libre : refuser ce que propose son employeur n'est pas
            anodin. C'est pourquoi l'alternative existe, est équivalente, et
            n'est pas tracée.
          </Article>
        </div>

        {!noticeLue && (
          <div className="px-5 sm:px-6 py-2.5 bg-stone-50 border-t border-stone-100 text-[11px] text-stone-400 text-center">
            Faites défiler jusqu'au bout pour pouvoir donner votre accord.
          </div>
        )}
      </section>

      {/* Consentement — séparé, explicite, dissociable */}
      <section className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6">
        <label
          className={`flex items-start gap-3 cursor-pointer ${
            noticeLue ? '' : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <input
            type="checkbox"
            checked={accepte}
            disabled={!noticeLue}
            onChange={(e) => surAccepte(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-stone-300 accent-brand-texte"
          />
          <span className="text-sm text-stone-700 leading-relaxed">
            J'ai lu la notice et j'accepte que mon gabarit facial soit
            enregistré pour attester ma présence au pointage. Je sais que je
            peux revenir sur cet accord à tout moment.
          </span>
        </label>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
          <button
            onClick={surContinuer}
            disabled={!accepte || envoi}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ScanFace className="w-4 h-4" />
            Continuer vers les prises de vue
          </button>

          {/* L'alternative a le même poids visuel que l'acceptation.
              Reléguée en petits caractères, elle rendrait le refus
              théorique. */}
          <Link
            to="/employe"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Je préfère le QR et la géolocalisation
          </Link>
        </div>
      </section>
    </div>
  );
}

function Article({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
        {titre}
      </h3>
      <p>{children}</p>
    </div>
  );
}

// ── Prises de vue ───────────────────────────────────────────────────

function PanneauPrises({
  envoi, surTermine, surAnnule, surErreur,
}: {
  envoi: boolean;
  surTermine: (d: number[][]) => void;
  surAnnule: () => void;
  surErreur: (m: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const boucle = useRef<number | null>(null);
  const clignement = useRef(detecteurClignement());

  // Les descripteurs vivent dans une référence et non dans l'état :
  // la boucle d'analyse lirait une copie figée d'un état capturé à sa
  // création, et resterait bloquée à la première prise.
  const pris = useRef<number[][]>([]);

  // Garde-fou contre le double envoi.
  //
  // `pris` survit aux réexécutions de l'effet. Dès qu'elle contient
  // le compte voulu, chaque nouveau passage voyait la liste pleine et
  // relançait l'envoi — et React en mode strict double toujours les
  // effets au montage. L'enrôlement partait donc deux à trois fois,
  // et les envois suivants échouaient en 409 puisque le premier avait
  // déjà créé ou complété le gabarit.
  const envoye = useRef(false);

  const [prets, setPrets] = useState(0);
  const [phase, setPhase] = useState<'chargement' | 'cligner' | 'capture'>('chargement');
  const [message, setMessage] = useState('Chargement du modèle…');
  const [visagePresent, setVisagePresent] = useState(false);

  // Mesures affichées à l'écran. Un test de vivacité qui échoue sans
  // rien montrer est indébogable : on ne peut pas dire si le visage
  // est trop loin, trop sombre, ou si le clignement n'a pas été vu.
  const [mesure, setMesure] = useState<{ ouverture: number; reference: number } | null>(null);

  // Au bout de quinze secondes sans clignement constaté, on le dit.
  const [bloque, setBloque] = useState(false);

  // ── Démarrage ──
  useEffect(() => {
    let vivant = true;

    (async () => {
      try {
        // Le modèle d'abord : ouvrir la caméra pour faire ensuite
        // patienter devant son propre reflet est désagréable.
        await chargerModeles();
        if (!vivant) return;

        setMessage('Ouverture de la caméra…');
        const s = await ouvrirCamera();
        if (!vivant) { fermerCamera(s); return; }

        flux.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }

        setPhase(VIVACITE_EXIGEE ? 'cligner' : 'capture');
        setMessage(VIVACITE_EXIGEE
          ? 'Regardez l\'objectif et clignez des yeux'
          : 'Regardez l\'objectif');
      } catch (e: any) {
        if (vivant) surErreur(e?.message ?? "La caméra n'a pas pu être ouverte.");
      }
    })();

    return () => {
      vivant = false;
      if (boucle.current) window.clearTimeout(boucle.current);
      fermerCamera(flux.current);
      flux.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Boucle d'analyse ──
  useEffect(() => {
    if (phase === 'chargement') return;

    let vivant = true;
    let dernierePrise = 0;

    const debutAnalyse = Date.now();

    const tour = async () => {
      if (!vivant || !video.current || video.current.readyState < 2) {
        if (vivant) boucle.current = window.setTimeout(tour, 200);
        return;
      }

      // ── Étape 1 : vivacité ──
      //
      // Analyse légère, sans descripteur. Le calcul du descripteur
      // coûte 150 à 300 ms et ferait manquer le clignement, qui dure
      // 100 à 150 ms. Une photographie, elle, garde une ouverture
      // constante et ne produit jamais la chute attendue.
      if (VIVACITE_EXIGEE && !clignement.current.valide) {
        const leger = await analyserVivacite(video.current).catch(() => null);
        if (!vivant) return;

        setVisagePresent(Boolean(leger));

        if (!leger) {
          setMessage('Aucun visage détecté — rapprochez-vous du cadre');
          setMesure(null);
          boucle.current = window.setTimeout(tour, 150);
          return;
        }

        clignement.current.observer(leger.ouvertureYeux);
        setMesure({
          ouverture: leger.ouvertureYeux,
          reference: clignement.current.reference,
        });

        if (clignement.current.valide) {
          setPhase('capture');
          setMessage('Vivacité confirmée — ne bougez plus');
        } else if (clignement.current.phase === 'calibrage') {
          setMessage('Gardez les yeux ouverts un instant…');
        } else {
          setMessage('Clignez des yeux');
        }

        if (Date.now() - debutAnalyse > 15000) setBloque(true);

        // Aucune attente ajoutée : chaque pause supplémentaire
        // augmente le risque de rater le clignement.
        boucle.current = window.setTimeout(tour, 0);
        return;
      }

      // ── Étape 2 : les prises ──
      //
      // Le cadrage est contrôlé par l'analyse légère ; le descripteur
      // n'est calculé qu'au moment précis de retenir une vue. Le
      // calculer à chaque tour pour le jeter ensuite multipliait la
      // durée de l'enrôlement par cinq, sans rien apporter.
      const cadre = await analyserVivacite(video.current).catch(() => null);
      if (!vivant) return;

      setVisagePresent(Boolean(cadre));

      if (!cadre) {
        setMessage('Aucun visage détecté — placez-vous face à la caméra');
        boucle.current = window.setTimeout(tour, 120);
        return;
      }

      // Un visage trop petit donne un descripteur flou. On le dit
      // avec sa mesure : « aucun visage détecté » envoyait chercher
      // au mauvais endroit alors que le visage était bien vu, mais
      // trop loin.
      if (cadre.proportion < PROPORTION_MIN) {
        setMessage(
          `Rapprochez-vous — visage à ${Math.round(cadre.proportion * 100)} % `
          + `du cadre, il en faut ${Math.round(PROPORTION_MIN * 100)} %`,
        );
        boucle.current = window.setTimeout(tour, 120);
        return;
      }

      // Les prises sont espacées dans le temps : trois images
      // consécutives de la même seconde donneraient trois
      // descripteurs quasi identiques, et un gabarit moyenné sur
      // elles n'aurait pas plus de robustesse qu'une prise unique.
      const maintenant = Date.now();

      if (maintenant - dernierePrise < ESPACEMENT_MS) {
        boucle.current = window.setTimeout(tour, 100);
        return;
      }

      const v = await analyser(video.current).catch(() => null);
      if (!vivant) return;

      if (!v) {
        setMessage('Gardez le visage immobile dans le cadre');
        boucle.current = window.setTimeout(tour, 150);
        return;
      }

      // Une prise qui ne ressemble pas aux précédentes est écartée
      // avant l'envoi : le serveur la refuserait de toute façon, et
      // le dire ici évite un aller-retour pour rien. Le seuil de
      // cohérence est plus strict que celui de reconnaissance — un
      // gabarit bâti sur des prises qui divergent déjà entre elles
      // accepte ensuite tout le monde.
      const incoherente = pris.current.some(
        (d) => distance(d, v.descripteur) > SEUIL_COHERENCE,
      );

      if (incoherente) {
        setMessage('Prise écartée — gardez le visage dans le cadre');
      } else {
        pris.current.push(v.descripteur);
        dernierePrise = maintenant;
        setPrets(pris.current.length);

        const reste = NB_PRISES - pris.current.length;
        setMessage(
          reste > 0
            ? `Prise ${pris.current.length} sur ${NB_PRISES} — tournez légèrement la tête`
            : 'Prises terminées',
        );
      }

      if (pris.current.length >= NB_PRISES) {
        if (envoye.current) return;
        envoye.current = true;

        fermerCamera(flux.current);
        flux.current = null;

        // L'envoi est décalé d'un battement : appelé dans la foulée,
        // il remplace le panneau avant que React n'ait peint la
        // troisième pastille, et le salarié lit « 2 sur 3 » sur un
        // enrôlement qui en a bien pris trois.
        window.setTimeout(() => surTermine(pris.current), 350);
        return;
      }

      boucle.current = window.setTimeout(tour, 200);
    };

    tour();

    return () => {
      vivant = false;
      if (boucle.current) window.clearTimeout(boucle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-stone-100 flex items-center gap-2.5">
        <Camera className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
        <h2 className="text-sm font-bold text-stone-800">Prises de vue</h2>
        <span className="ms-auto text-xs text-stone-400">
          {prets} / {NB_PRISES}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {/* Cadre vidéo. Le miroir rend le cadrage intuitif : sans lui,
            se recentrer demande d'inverser mentalement ses gestes. */}
        <div className="relative mx-auto w-full max-w-sm aspect-[4/3] rounded-xl overflow-hidden bg-stone-900">
          <video
            ref={video}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Repère de cadrage */}
          <div
            className={`absolute inset-0 m-auto w-[55%] aspect-[3/4] rounded-[50%] border-2 transition-colors ${
              visagePresent ? 'border-white/70' : 'border-white/25'
            }`}
            style={{ marginTop: '8%' }}
          />

          {phase === 'chargement' && (
            <div className="absolute inset-0 bg-stone-900/80 flex flex-col items-center justify-center gap-2.5">
              <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
              <p className="text-xs text-white/60">{message}</p>
            </div>
          )}

          {envoi && (
            <div className="absolute inset-0 bg-stone-900/80 flex flex-col items-center justify-center gap-2.5">
              <Loader2 className="w-5 h-5 text-white/60 animate-spin" />
              <p className="text-xs text-white/60">Enregistrement…</p>
            </div>
          )}

          {/* Pastilles de progression */}
          <div className="absolute bottom-3 start-0 end-0 flex justify-center gap-1.5">
            {Array.from({ length: NB_PRISES }).map((_, i) => (
              <span
                key={i}
                className={`w-6 h-1 rounded-full transition-colors ${
                  i < prets ? 'bg-surface' : 'bg-surface/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Consigne */}
        <div className="mt-4 flex items-start justify-center gap-2 text-center">
          {phase === 'cligner' && !message.startsWith('Aucun')
            ? <Eye className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
            : null}
          <p className="text-sm text-stone-600">{message}</p>
        </div>

        {/* Mesures en clair. Ce que la caméra voit doit être lisible :
            sinon un échec de vivacité ne se distingue pas d'un bogue. */}
        {mesure && (
          <p className="text-[10px] text-stone-400 text-center mt-1.5 font-mono">
            ouverture {mesure.ouverture.toFixed(3)}
            {mesure.reference > 0 && ` · référence ${mesure.reference.toFixed(3)}`}
            {mesure.reference > 0 && ` · seuil ${(mesure.reference * 0.72).toFixed(3)}`}
          </p>
        )}

        {bloque && phase === 'cligner' && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-800 mt-4">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="leading-relaxed">
              Le clignement n'est pas détecté. Rapprochez-vous, placez-vous
              face à la lumière, et retirez vos lunettes si elles reflètent
              l'écran. Vous pouvez aussi annuler : le pointage par QR donne
              exactement les mêmes droits.
            </span>
          </div>
        )}

        <Chronometre />

        <p className="text-[11px] text-stone-400 text-center mt-2 leading-relaxed">
          L'image ne quitte pas votre appareil. Seuls les 128 nombres calculés
          par votre navigateur sont transmis.
        </p>

        <button
          onClick={surAnnule}
          disabled={envoi}
          className="w-full mt-5 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-40"
        >
          <X className="w-4 h-4" />
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Déjà enrôlé ─────────────────────────────────────────────────────

function PanneauEnrole({
  etat, suppression, confirme,
  surDemandeSuppression, surAnnuleSuppression, surRevoque,
  surReenroler,
}: {
  etat: Etat;
  suppression: boolean;
  confirme: boolean;
  surDemandeSuppression: () => void;
  surAnnuleSuppression: () => void;
  surRevoque: () => void;
  surReenroler: () => void;
}) {
  return (
    <div className="space-y-5">

      <section className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-stone-100 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 text-green-600" />
          <h2 className="text-sm font-bold text-stone-800">Reconnaissance active</h2>
        </div>

        <dl className="divide-y divide-stone-100">
          <Ligne libelle="Activée le" valeur={dateFr(etat.enroleLe)} />
          <Ligne libelle="Accord donné le" valeur={dateFr(etat.consentementLe)} />
          {/* « Reconnaissances » et non « pointages » : le compteur est
              incrémenté dès que le visage correspond, avant l'écriture du
              pointage — qui peut encore être refusée ensuite (arrivée déjà
              pointée, position hors zone). Les deux nombres divergent donc
              légitimement, et annoncer des pointages ici mettrait cette
              page en contradiction avec la table des pointages.

              Ce compteur sert à repérer un gabarit qui se dégrade, pas à
              compter des présences : le nombre de reconnaissances est bien
              la grandeur utile. */}
          {/* Le serveur ne compte plus une reconnaissance, mais un
              pointage effectivement enregistré par reconnaissance :
              biometrie.consigner() est appelé après l'écriture, et le
              panneau de mesures n'y touche plus. L'étiquette peut donc
              annoncer des pointages, et ce nombre se vérifie ligne à
              ligne dans la table des pointages. */}
          <Ligne libelle="Pointages par reconnaissance" valeur={String(etat.nbVerifications)} />
          <Ligne
            libelle="Dernier pointage facial"
            valeur={etat.derniereVerification
              ? new Date(etat.derniereVerification).toLocaleString('fr-FR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })
              : 'Jamais'}
          />
        </dl>

        <div className="px-5 sm:px-6 py-3.5 bg-stone-50 border-t border-stone-100 flex items-start gap-2.5">
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-stone-400" />
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Seul le gabarit — 128 nombres — est conservé. Aucune photographie
            n'a été enregistrée. Les ressources humaines ne peuvent pas le
            consulter.
          </p>
        </div>
      </section>

      {/* Notice révisée : le consentement portait sur une version
          précise de l'information. Elle change, il doit être redonné. */}
      {!etat.noticeAJour && (
        <section className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-amber-900">
                La notice d'information a été mise à jour
              </h3>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Votre accord portait sur la version précédente. Relisez la
                nouvelle notice pour le confirmer, ou désactivez la
                reconnaissance.
              </p>
              <button
                onClick={surReenroler}
                className="mt-3 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
              >
                Relire la notice
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Révocation. Un seul écran de confirmation, aucune
          justification demandée : un accord qu'on ne peut pas retirer
          librement n'est pas un accord. */}
      <section className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6">
        <h3 className="text-sm font-bold text-stone-800">
          Désactiver la reconnaissance faciale
        </h3>
        <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
          Votre gabarit sera supprimé immédiatement. Vous continuerez à
          pointer par QR et géolocalisation, sans démarche à faire et sans
          conséquence.
        </p>

        {!confirme ? (
          <button
            onClick={surDemandeSuppression}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer mon gabarit facial
          </button>
        ) : (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100">
            <p className="text-sm text-red-800 font-medium">
              Confirmer la suppression ?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={surRevoque}
                disabled={suppression}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {suppression
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                Supprimer définitivement
              </button>
              <button
                onClick={surAnnuleSuppression}
                disabled={suppression}
                className="px-4 py-2.5 rounded-xl border border-stone-200 bg-surface text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-4">
      <dt className="text-xs text-stone-500">{libelle}</dt>
      <dd className="text-sm font-medium text-stone-700 text-end">{valeur}</dd>
    </div>
  );
}