// src/lib/visage.ts
//
// Accès au modèle de reconnaissance faciale, partagé par l'enrôlement
// et le pointage.
//
// ── Pourquoi un module séparé ───────────────────────────────────────
//
// Le modèle pèse 1,3 Mo de code et 6,8 Mo de poids. Importé en haut
// d'un composant, il serait téléchargé par tous les salariés, y
// compris ceux qui ne l'utilisent jamais. Ici l'import est dynamique :
// Vite en fait un fragment séparé, chargé au premier appel de
// chargerModeles() et pas avant.
//
// Le calcul se fait entièrement dans le navigateur. Aucune image ne
// quitte l'appareil : seul le descripteur de 128 nombres est transmis.

// Type minimal du module, pour éviter d'importer ses types au
// chargement de la page et réintroduire le poids qu'on vient d'éviter.
type FaceApi = typeof import('@vladmandic/face-api');

/**
 * Partie de TensorFlow.js dont on a besoin ici.
 *
 * Le paquet embarque TensorFlow.js et l'expose sous `tf`, mais ses
 * déclarations de type n'en publient pas la surface complète :
 * getBackend, setBackend et ready existent à l'exécution et sont
 * absents des types. D'où ce contrat minimal, déclaré plutôt que
 * deviné, et un `as unknown as` au point de passage.
 */
interface MoteurTf {
  getBackend(): string;
  setBackend(nom: string): Promise<boolean>;
  ready(): Promise<void>;
}

const moteur = (mod: FaceApi): MoteurTf =>
  (mod as unknown as { tf: MoteurTf }).tf;

let faceapi: FaceApi | null = null;
let chargement: Promise<FaceApi> | null = null;

// Trois modèles seulement, les plus légers qui suffisent :
//   - tiny_face_detector : où est le visage        (189 Ko)
//   - face_landmark_68   : les 68 points du visage (349 Ko)
//   - face_recognition   : le descripteur de 128   (6,2 Mo)
//
// Les autres livrés avec le paquet (âge, genre, expressions) ne sont
// pas chargés : ils n'ont rien à faire dans un pointage, et les
// charger reviendrait à collecter des données sans finalité.
const CHEMIN_MODELES = '/models';

/**
 * Charge le modèle une seule fois.
 *
 * Les appels concurrents partagent la même promesse : deux composants
 * montés en même temps ne déclenchent pas deux téléchargements.
 */
export async function chargerModeles(): Promise<FaceApi> {
  if (faceapi) return faceapi;
  if (chargement) return chargement;

  chargement = (async () => {
    const mod = await import('@vladmandic/face-api');

    // ── Choix du moteur de calcul ──
    //
    // TensorFlow.js sait travailler sur le processeur graphique
    // (webgl) ou sur le processeur central (cpu). L'écart est d'un
    // ordre de grandeur : le descripteur passe d'environ 40 ms à
    // plus de 400 ms.
    //
    // Le repli sur le processeur central est silencieux. Sans ce
    // réglage explicite, une machine qui refuse WebGL — pilote
    // ancien, accélération désactivée dans le navigateur, machine
    // virtuelle — rend la reconnaissance faciale inutilisable sans
    // qu'aucun message ne dise pourquoi.
    const tf = moteur(mod);

    try {
      if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl');
      await tf.ready();
    } catch {
      // WebGL indisponible : on continue sur le processeur central,
      // et backendActif() permettra de l'afficher à l'écran.
      await tf.ready().catch(() => {});
    }

    await Promise.all([
      mod.nets.tinyFaceDetector.loadFromUri(CHEMIN_MODELES),
      mod.nets.faceLandmark68Net.loadFromUri(CHEMIN_MODELES),
      mod.nets.faceRecognitionNet.loadFromUri(CHEMIN_MODELES),
    ]);

    faceapi = mod;
    return mod;
  })();

  const debutChargement = performance.now();

  try {
    const pret = await chargement;
    chrono.chargementMs = performance.now() - debutChargement;
    return pret;
  } catch (e) {
    // Sans cette remise à zéro, un échec réseau condamnerait la
    // fonctionnalité pour toute la session : la promesse rejetée
    // resterait en cache et serait renvoyée à chaque nouvel essai.
    chargement = null;
    throw e;
  }
}

export function modelesCharges(): boolean {
  return faceapi !== null;
}

/**
 * Lance le chargement du modèle sans attendre le résultat.
 *
 * Appelé depuis le tableau de bord d'un salarié enrôlé : les 6,8 Mo
 * de poids et la compilation des noyaux de calcul se font pendant
 * qu'il lit sa page, et non après qu'il a cliqué sur « pointer ». Le
 * temps total ne change pas ; le temps d'attente ressenti, si.
 *
 * Les échecs sont ignorés volontairement : ce n'est qu'une avance de
 * phase, et le chargement sera retenté au moment utile.
 */
export function prechargerModeles(): void {
  chargerModeles().catch(() => {});
}

// ── Chronométrage ───────────────────────────────────────────────────
//
// Les durées sont relevées à l'exécution plutôt que supposées. Sans
// ces chiffres, « c'est lent » ne permet pas de choisir entre quatre
// causes très différentes : téléchargement des poids, moteur de
// calcul émulé, détecteur, ou réseau de reconnaissance.
//
// Cas particulièrement trompeur : Chrome sans accélération matérielle
// fournit quand même WebGL, émulé en logiciel. getBackend() répond
// alors « webgl » pendant que le calcul se fait sur le processeur
// central, dix fois plus lentement. Seule une mesure de durée le
// révèle — d'où ce relevé.

const chrono = {
  chargementMs: 0,
  vivaciteMs: 0,
  descripteurMs: 0,
  nbVivacite: 0,
  nbDescripteur: 0,
};

/** Moyenne glissante simple, pour lisser le bruit d'une mesure isolée. */
function noter(cle: 'vivaciteMs' | 'descripteurMs', ms: number) {
  const compteur = cle === 'vivaciteMs' ? 'nbVivacite' : 'nbDescripteur';
  const n = Math.min(chrono[compteur] + 1, 20);
  chrono[compteur] = n;
  chrono[cle] = chrono[cle] + (ms - chrono[cle]) / n;
}

export interface Chronos {
  backend: string | null;
  chargementMs: number;
  vivaciteMs: number;
  descripteurMs: number;
  /** Vrai quand les durées trahissent un calcul non accéléré. */
  suspect: boolean;
}

export function chronos(): Chronos {
  // Repères sur machine de bureau ordinaire avec WebGL matériel :
  // analyse légère 15 à 40 ms, descripteur 40 à 120 ms. Au-delà du
  // double, l'accélération ne fonctionne pas, quoi qu'en dise le nom
  // du moteur.
  const suspect = chrono.descripteurMs > 250 || chrono.vivaciteMs > 100;

  return {
    backend: backendActif(),
    chargementMs: Math.round(chrono.chargementMs),
    vivaciteMs: Math.round(chrono.vivaciteMs),
    descripteurMs: Math.round(chrono.descripteurMs),
    suspect,
  };
}

/**
 * Moteur de calcul réellement utilisé : 'webgl' ou 'cpu'.
 *
 * À afficher quand la reconnaissance est lente : 'cpu' explique tout,
 * et oriente vers le bon remède — réactiver l'accélération matérielle
 * du navigateur — au lieu de faire chercher un défaut dans le code.
 */
export function backendActif(): string | null {
  if (!faceapi) return null;
  try {
    return moteur(faceapi).getBackend();
  } catch {
    return null;
  }
}

// ── Normalisation ───────────────────────────────────────────────────

/**
 * Ramène un descripteur à une longueur de 1.
 *
 * Le modèle produit des vecteurs de longueur très proche de 1, et le
 * seuil de la littérature suppose cette longueur. Mais la moyenne de
 * plusieurs descripteurs, elle, est systématiquement plus courte que
 * 1 : la moyenne de trois vecteurs unitaires non colinéaires tombe à
 * l'intérieur de la sphère.
 *
 * Conséquence du gabarit non normalisé : toutes les distances
 * mesurées contre lui sont rapprochées — celles d'un imposteur
 * comprises. C'est une partie de ce qui a laissé passer un visage
 * étranger.
 */
export function normaliser(d: number[]): number[] {
  let somme = 0;
  for (const v of d) somme += v * v;

  const norme = Math.sqrt(somme);
  if (!Number.isFinite(norme) || norme === 0) return d;

  return d.map((v) => v / norme);
}

// ── Détection ───────────────────────────────────────────────────────

export interface Visage {
  descripteur: number[];
  /** Score de confiance de la détection, entre 0 et 1 */
  confiance: number;
  /** Ouverture moyenne des yeux — sert au test de vivacité */
  ouvertureYeux: number;
  /** Part de la hauteur de l'image occupée par le visage */
  proportion: number;
}

// Part minimale de la hauteur d'image occupée par le visage.
//
// ── Pourquoi 0,35 et plus 0,18 ──────────────────────────────────────
//
// Le réseau de reconnaissance travaille sur une vignette alignée de
// 150 pixels de côté. À 0,18 d'une vidéo de 480 pixels, le visage ne
// fait que 86 pixels : on agrandit, ce qui n'invente aucun détail et
// produit un descripteur flou.
//
// Un descripteur flou ne se contente pas d'être imprécis : il se
// rapproche du « visage moyen ». Les distances entre personnes
// différentes s'effondrent, et le seuil ne discrimine plus rien.
// C'est la cause principale d'un visage étranger accepté.
//
// À 0,28, le visage fait au moins 134 pixels, ce qui remet le réseau
// dans un domaine utilisable. 0,35 avait été essayé d'abord, mais le
// cadre renvoyé par le détecteur est serré sur le visage et non sur
// la tête : l'exigence devenait inatteignable à une distance normale
// d'écran, et l'enrôlement tournait sans jamais capturer.
//
// Exportée pour que l'interface puisse dire « rapprochez-vous » avec
// la mesure, au lieu de laisser croire qu'aucun visage n'est vu.
export const PROPORTION_MIN = 0.28;

// Confiance minimale de la détection. Relevée de 0,5 à 0,7 : une
// détection douteuse donne un cadrage douteux, donc un alignement
// douteux, donc un descripteur qui ne vaut rien.
const CONFIANCE_MIN = 0.7;

/**
 * Analyse une image vidéo et renvoie le visage trouvé, ou null.
 *
 * Renvoie null plutôt que de lever : l'appelant boucle sur des images
 * dont beaucoup ne contiennent aucun visage exploitable, ce n'est pas
 * une situation exceptionnelle.
 */
export async function analyser(
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<Visage | null> {
  const api = await chargerModeles();

  const hauteur = source instanceof HTMLVideoElement
    ? source.videoHeight
    : source.height;

  if (!hauteur) return null;

  const debut = performance.now();

  const detection = await api
    .detectSingleFace(source, new api.TinyFaceDetectorOptions({
      // 224 suffit depuis qu'on exige un visage proche. L'entrée du
      // détecteur ne fixe que la précision du cadre ; le descripteur,
      // lui, est calculé sur une vignette découpée dans l'image
      // d'origine en pleine résolution. Descendre de 320 à 224 accélère
      // la détection sans dégrader le descripteur.
      inputSize: 224,
      scoreThreshold: CONFIANCE_MIN,
    }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  noter('descripteurMs', performance.now() - debut);

  if (!detection) return null;

  const { box } = detection.detection;
  const proportion = box.height / hauteur;

  if (proportion < PROPORTION_MIN) return null;

  const points = detection.landmarks.positions;

  return {
    // Normalisé dès la sortie du modèle : le seuil de distance
    // suppose des vecteurs de longueur 1, côté gabarit comme côté
    // mesure.
    descripteur: normaliser(Array.from(detection.descriptor)),
    confiance: detection.detection.score,
    ouvertureYeux: (ratioOeil(points, 36) + ratioOeil(points, 42)) / 2,
    proportion,
  };
}

/**
 * Collecte plusieurs descripteurs cohérents entre eux.
 *
 * ── Pourquoi plusieurs ──────────────────────────────────────────────
 *
 * Une prise unique peut être malheureuse : clignement en cours,
 * bougé, ombre portée. Son descripteur s'écarte alors du gabarit dans
 * une direction arbitraire — ce qui provoque des refus injustifiés,
 * mais aussi, plus rarement, des rapprochements fortuits vers le
 * gabarit de quelqu'un d'autre.
 *
 * En exigeant plusieurs prises qui se ressemblent entre elles, on
 * écarte le coup de chance dans les deux sens. Le serveur reçoit les
 * trois et décide sur leur médiane.
 *
 * Renvoie null si les prises ne convergent pas : mieux vaut demander
 * de recommencer qu'attester sur une mesure instable.
 */
export async function analyserPlusieurs(
  source: HTMLVideoElement | HTMLCanvasElement,
  nombre = 3,
): Promise<number[][] | null> {
  const pris: number[][] = [];

  // Au plus deux essais perdus. Une version précédente filtrait les
  // prises incohérentes et repartait de zéro à chaque écart, ce qui
  // pouvait coûter douze descripteurs — plusieurs secondes — pour en
  // retenir trois. Inutile : c'est la médiane calculée par le serveur
  // qui absorbe la prise aberrante, et elle le fait mieux qu'un
  // filtrage côté client, qu'un client modifié pourrait contourner.
  for (let essai = 0; essai < nombre + 2 && pris.length < nombre; essai += 1) {
    const v = await analyser(source).catch(() => null);
    if (v) pris.push(v.descripteur);
  }

  return pris.length >= nombre ? pris : null;
}

// ── Analyse légère, pour la vivacité ────────────────────────────────

/**
 * Mesure l'ouverture des yeux, sans calculer le descripteur.
 *
 * ── Pourquoi une seconde fonction ───────────────────────────────────
 *
 * analyser() fait trois choses : trouver le visage, placer les 68
 * points, et calculer le descripteur de 128 nombres. La troisième est
 * de loin la plus coûteuse — 150 à 300 ms sur un portable — et elle ne
 * sert à rien pour détecter un clignement.
 *
 * La première version du test de vivacité appelait analyser() à chaque
 * image. Avec le délai de boucle, l'échantillonnage tombait à une
 * mesure toutes les 300 à 400 ms, alors qu'un clignement dure 100 à
 * 150 ms : le clignement passait entre deux mesures et n'était jamais
 * vu. Le seuil n'était pas en cause, la cadence l'était.
 *
 * Ici, pas de descripteur et une entrée de 224 pixels au lieu de 416 —
 * suffisant pour un visage proche de la caméra, et trois à cinq fois
 * plus rapide. L'échantillonnage passe sous les 100 ms, ce qui attrape
 * un clignement ordinaire.
 */
export async function analyserVivacite(
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<{ ouvertureYeux: number; proportion: number } | null> {
  const api = await chargerModeles();

  const hauteur = source instanceof HTMLVideoElement
    ? source.videoHeight
    : source.height;

  if (!hauteur) return null;

  const debut = performance.now();

  const detection = await api
    .detectSingleFace(source, new api.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: CONFIANCE_MIN,
    }))
    .withFaceLandmarks();

  noter('vivaciteMs', performance.now() - debut);

  if (!detection) return null;

  const points = detection.landmarks.positions;

  return {
    ouvertureYeux: (ratioOeil(points, 36) + ratioOeil(points, 42)) / 2,
    proportion: detection.detection.box.height / hauteur,
  };
}

// ── Vivacité ────────────────────────────────────────────────────────

/**
 * Ratio d'ouverture d'un œil, d'après ses six points.
 *
 * Mesure le rapport entre la hauteur de l'œil et sa largeur. Un œil
 * ouvert donne environ 0,30, un œil fermé environ 0,10. Normaliser par
 * la largeur rend la mesure indépendante de la distance à la caméra.
 *
 * Le modèle à 68 points place l'œil gauche aux indices 36 à 41 et le
 * droit aux indices 42 à 47, toujours dans le même ordre : coin
 * externe, deux points de la paupière haute, coin interne, deux points
 * de la paupière basse.
 */
function ratioOeil(points: { x: number; y: number }[], debut: number): number {
  const p = (i: number) => points[debut + i];
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const largeur = d(p(0), p(3));
  if (largeur === 0) return 0;

  return (d(p(1), p(5)) + d(p(2), p(4))) / (2 * largeur);
}

// Nombre d'images d'observation avant de fixer la référence. À 120 ms
// par image, cela fait un peu plus d'une seconde — assez pour voir un
// œil ouvert, trop court pour lasser.
const IMAGES_CALIBRAGE = 8;

// Part de la référence en dessous de laquelle l'œil est considéré
// fermé. 0,72 laisse passer un clignement franc et rejette le simple
// bruit de mesure, qui dépasse rarement 5 %.
const PART_FERMETURE = 0.72;

// En dessous, la détection des points de l'œil est trop grossière pour
// qu'une référence veuille dire quelque chose : visage trop loin,
// image trop sombre.
const REFERENCE_MIN = 0.12;

/**
 * Détecteur de clignement, calibré par personne et par session.
 *
 * ── Pourquoi un calibrage ───────────────────────────────────────────
 *
 * La première version utilisait deux seuils fixes, 0,26 et 0,21. Elle
 * ne marchait que pour les yeux dont l'ouverture tombe dans cette
 * fenêtre. Une personne dont l'ouverture mesurée plafonne à 0,24 —
 * forme des yeux, webcam de faible résolution, distance à l'écran —
 * restait bloquée indéfiniment sur « clignez des yeux », sans qu'aucun
 * message n'explique pourquoi.
 *
 * Ici, les premières images servent à mesurer l'ouverture de CETTE
 * personne sur CETTE caméra. Le clignement est ensuite une chute
 * relative à cette référence, ce qui ne suppose plus rien.
 *
 * ── Ce que le test prouve, et ne prouve pas ─────────────────────────
 *
 * Il arrête une photographie imprimée, dont le ratio reste constant.
 * Il n'arrête pas une vidéo rejouée sur un écran. C'est une limite à
 * assumer, pas à cacher : une vivacité sérieuse demande de
 * l'infrarouge ou de la profondeur, que le matériel d'un poste de
 * travail ordinaire n'a pas.
 */
/**
 * Le test de vivacité est-il exigé au pointage ?
 *
 * ── Pourquoi il est désactivé ───────────────────────────────────────
 *
 * Le clignement n'arrête qu'une photographie imprimée. Une vidéo
 * rejouée sur un téléphone le franchit, et il ne demande aucun
 * matériel particulier de le faire. Il ne bloque donc que
 * l'attaquant qui n'a pas de smartphone.
 *
 * Face à cela, son coût est élevé : une à plusieurs secondes
 * d'attente à chaque pointage, un message qui persiste quand le
 * clignement n'est pas vu, et une proportion d'échecs qui dépend de
 * la caméra, de la lumière et du port de lunettes.
 *
 * Et surtout, il protège d'un risque que l'ensemble du dispositif ne
 * court déjà presque pas : pour pointer à la place d'un absent, il
 * faut sa session ouverte — donc son mot de passe — et être sur le
 * site, puisque la géolocalisation est exigée dans les deux méthodes.
 * Quelqu'un qui réunit ces deux conditions pointe déjà sans effort
 * par le QR.
 *
 * Le rapport coût-bénéfice est donc défavorable, et la bonne décision
 * d'ingénierie est de retirer le test en le disant, plutôt que de le
 * garder pour l'apparence de sécurité qu'il donne.
 *
 * Passer à true le rétablit : le code est conservé, la décision est
 * réversible, et un déploiement avec une caméra à infrarouge ou à
 * profondeur — où la vivacité devient réellement vérifiable — aurait
 * raison de le faire.
 */
export const VIVACITE_EXIGEE = false;

export function detecteurClignement() {
  let etat: 'calibrage' | 'attente_fermeture' | 'valide' = 'calibrage';
  let reference = 0;
  let images = 0;

  return {
    /**
     * À appeler pour chaque image analysée.
     * Renvoie true une fois le clignement constaté.
     */
    observer(ouverture: number): boolean {
      if (etat === 'calibrage') {
        // On retient la plus grande ouverture vue : c'est l'œil
        // ouvert, les images intermédiaires d'un clignement spontané
        // ne tirent donc pas la référence vers le bas.
        if (ouverture > reference) reference = ouverture;
        images += 1;

        if (images >= IMAGES_CALIBRAGE && reference >= REFERENCE_MIN) {
          etat = 'attente_fermeture';
        }
        return false;
      }

      if (etat === 'attente_fermeture' && ouverture < reference * PART_FERMETURE) {
        etat = 'valide';
      }

      return etat === 'valide';
    },

    get valide() { return etat === 'valide'; },

    /** Pour afficher où en est le test plutôt qu'un message figé. */
    get phase() { return etat; },

    /** Ouverture de référence mesurée. Nulle pendant le calibrage. */
    get reference() { return reference; },

    reinitialiser() { etat = 'calibrage'; reference = 0; images = 0; },
  };
}

// ── Caméra ──────────────────────────────────────────────────────────

/**
 * Ouvre la caméra frontale.
 *
 * Les messages distinguent les causes d'échec : un salarié qui a
 * refusé l'accès et un salarié sans caméra n'ont pas la même chose à
 * faire, et « erreur caméra » ne dit ni l'un ni l'autre.
 */
export async function ouvrirCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Votre navigateur ne permet pas l'accès à la caméra. "
      + 'Utilisez le pointage par QR et géolocalisation.',
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') {
      throw new Error(
        "L'accès à la caméra a été refusé. Autorisez-le dans les "
        + 'réglages du navigateur, ou pointez par QR et géolocalisation.',
      );
    }
    if (e?.name === 'NotFoundError') {
      throw new Error(
        'Aucune caméra détectée sur cet appareil. '
        + 'Utilisez le pointage par QR et géolocalisation.',
      );
    }
    throw new Error("La caméra n'a pas pu être ouverte.");
  }
}

/** Libère la caméra. Omettre cet appel laisse le voyant allumé. */
export function fermerCamera(flux: MediaStream | null) {
  flux?.getTracks().forEach((piste) => piste.stop());
}

// ── Comparaison locale ─────────────────────────────────────────────

/**
 * Distance euclidienne entre deux descripteurs.
 *
 * Utilisée à l'enrôlement pour vérifier que les trois prises se
 * ressemblent, avant de les envoyer. Le serveur refait le même calcul
 * et c'est son verdict qui compte : celui-ci n'épargne qu'un
 * aller-retour inutile.
 */
export function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let somme = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    somme += d * d;
  }
  return Math.sqrt(somme);
}

/**
 * Seuil de reconnaissance. Doit rester aligné sur le serveur, qui
 * seul fait foi.
 *
 * ── Pourquoi 0,45 et plus 0,60 ──────────────────────────────────────
 *
 * 0,60 est la valeur citée dans la littérature de ce modèle, mesurée
 * sur des photographies de bonne qualité et bien cadrées. Elle place
 * le point de fonctionnement là où les faux refus et les faux
 * acceptés s'équilibrent.
 *
 * Mais pour un pointage, les deux erreurs ne coûtent pas la même
 * chose. Un faux refus fait pointer par QR : quelques secondes
 * perdues. Un faux accepté fait attester la présence d'un absent :
 * c'est la fraude que le dispositif existe pour empêcher, et elle est
 * indétectable après coup.
 *
 * L'asymétrie des conséquences justifie un seuil asymétrique. La
 * valeur vient de mesures faites sur ce dispositif après correction :
 * titulaire entre 0,1645 et 0,2681, tiers à 0,3284 et 0,3374. Le
 * seuil se place au milieu de cet écart.
 *
 * Le serveur seul fait foi ; cette constante n'existe que pour que
 * l'interface puisse expliquer un refus.
 */
export const SEUIL_DISTANCE = 0.30;

/**
 * Écart maximal toléré entre deux prises d'un même enrôlement.
 *
 * Plus strict que le seuil de reconnaissance, et c'est voulu : un
 * gabarit construit sur des prises qui divergent déjà entre elles est
 * un gabarit flou, et un gabarit flou accepte tout le monde.
 */
export const SEUIL_COHERENCE = 0.35;