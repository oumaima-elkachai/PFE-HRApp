// src/pointages/journee.js
//
// Règles métier d'une journée de pointage. Aucune entrée-sortie, aucun
// accès à DynamoDB : des fonctions pures qui prennent une journée et
// en renvoient une autre.
//
// ── Pourquoi un module séparé ───────────────────────────────────────
//
// Les règles étaient dispersées dans arrivee.js et depart.js, mêlées
// aux appels à la base. Impossible de les tester sans émulateur, donc
// impossible de les tester vraiment. Ici elles sont isolées : le
// fichier de tests qui les accompagne tourne en une seconde, sans
// réseau, et couvre les cas limites qu'une démonstration ne montre
// jamais.
//
// ── Le changement de modèle ─────────────────────────────────────────
//
// Avant : une journée portait un seul couple heureArrivee /
// heureDepart. Un salarié qui sortait déjeuner et revenait ne pouvait
// rien enregistrer, et la durée comptait sa pause comme du travail.
//
// Maintenant : une journée porte une LISTE de segments, chacun avec
// son début, sa fin et son type. Le travail se cumule, les pauses se
// comptent à part, et la frise de la journée devient affichable.
//
// Les champs heureArrivee, heureDepart et dureeMinutes sont conservés
// et recalculés à chaque écriture : la paie, l'historique et les
// indicateurs existants continuent de les lire sans modification.

// ── Types de segment ────────────────────────────────────────────────

const TRAVAIL = "TRAVAIL";
const PAUSE_DEJEUNER = "PAUSE_DEJEUNER";
const PAUSE_CAFE = "PAUSE_CAFE";

const TYPES_SEGMENT = [TRAVAIL, PAUSE_DEJEUNER, PAUSE_CAFE];

/** Seuls les segments de travail comptent dans les heures dues. */
const COMPTE_COMME_TRAVAIL = new Set([TRAVAIL]);

// ── Horaire de référence ────────────────────────────────────────────
//
// Sert au calcul du retard et des heures prévues. Porté par la fiche
// du salarié quand elle le déclare, sinon ces valeurs.

const HORAIRE_DEFAUT = {
  arrivee: "08:00",
  depart: "17:00",
  pauseMinutes: 60,
  // Tolérance avant qu'une arrivée tardive compte comme un retard.
  // Quinze minutes correspondent à l'usage, et évitent de compter un
  // retard pour un ascenseur lent.
  toleranceMinutes: 15,
  // Jours ouvrés, 1 = lundi. Le week-end tunisien est samedi-dimanche
  // dans le tertiaire.
  joursOuvres: [1, 2, 3, 4, 5],
};

// Fuseau de l'entreprise. Les heures de référence — « 08:00 » — sont
// exprimées dedans, et non dans celui du serveur.
//
// S'appuyer sur getHours(), donc sur le fuseau du processus, marche
// tant que le serveur tourne dans le bon fuseau et casse
// silencieusement le jour où il tourne ailleurs : un retard de
// soixante minutes apparaît pour tout le monde, sans que rien ne
// l'explique. Un test l'a révélé, le fuseau est désormais une donnée
// du calcul.
const FUSEAU_DEFAUT = process.env.FUSEAU_ENTREPRISE || "Africa/Tunis";

/**
 * Minutes depuis minuit d'un instant, lues dans un fuseau donné.
 *
 * Intl plutôt qu'un décalage codé en dur : il connaît l'heure d'été,
 * que la Tunisie n'applique pas mais que la France applique, et le
 * même code doit pouvoir servir aux deux.
 */
function minutesLocales(instant, fuseau = FUSEAU_DEFAUT) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;

  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: fuseau,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const valeur = (type) =>
    Number(parties.find((p) => p.type === type)?.value ?? NaN);

  const h = valeur("hour");
  const min = valeur("minute");
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;

  // Intl rend « 24 » pour minuit dans certaines implémentations.
  return (h % 24) * 60 + min;
}

/** Minutes depuis minuit pour « HH:MM ». */
function minutesDepuisMinuit(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ""));
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;

  return h * 60 + min;
}

/** Horaire de référence d'un salarié, complété par les valeurs par défaut. */
function horaireDe(fiche) {
  const h = fiche?.horaireReference ?? {};

  return {
    arrivee: minutesDepuisMinuit(h.arrivee) !== null ? h.arrivee : HORAIRE_DEFAUT.arrivee,
    depart: minutesDepuisMinuit(h.depart) !== null ? h.depart : HORAIRE_DEFAUT.depart,
    pauseMinutes: Number.isFinite(h.pauseMinutes) ? h.pauseMinutes : HORAIRE_DEFAUT.pauseMinutes,
    toleranceMinutes: Number.isFinite(h.toleranceMinutes)
      ? h.toleranceMinutes : HORAIRE_DEFAUT.toleranceMinutes,
    joursOuvres: Array.isArray(h.joursOuvres) && h.joursOuvres.length
      ? h.joursOuvres : HORAIRE_DEFAUT.joursOuvres,
  };
}

/** Minutes prévues par jour ouvré, pauses déduites. */
function minutesPrevues(horaire) {
  const debut = minutesDepuisMinuit(horaire.arrivee);
  const fin = minutesDepuisMinuit(horaire.depart);
  if (debut === null || fin === null) return 0;

  return Math.max(0, fin - debut - horaire.pauseMinutes);
}

// ── Segments ────────────────────────────────────────────────────────

const segments = (journee) =>
  Array.isArray(journee?.segments) ? journee.segments : [];

/** Segment en cours, ou null. Il ne peut y en avoir qu'un. */
function segmentOuvert(journee) {
  return segments(journee).find((s) => !s.fin) ?? null;
}

/** Durée d'un segment en minutes. Un segment ouvert compte jusqu'à `maintenant`. */
function dureeSegment(s, maintenant = new Date()) {
  const debut = new Date(s.debut);
  if (Number.isNaN(debut.getTime())) return 0;

  const fin = s.fin ? new Date(s.fin) : maintenant;
  if (Number.isNaN(fin.getTime())) return 0;

  // Jamais négatif : une horloge client désynchronisée ne doit pas
  // produire une durée qui se retranche du total.
  return Math.max(0, Math.round((fin - debut) / 60000));
}

/** Minutes cumulées, par type. */
function minutesPar(journee, type, maintenant = new Date()) {
  return segments(journee)
    .filter((s) => (s.type ?? TRAVAIL) === type)
    .reduce((t, s) => t + dureeSegment(s, maintenant), 0);
}

const minutesTravaillees = (journee, maintenant) =>
  segments(journee)
    .filter((s) => COMPTE_COMME_TRAVAIL.has(s.type ?? TRAVAIL))
    .reduce((t, s) => t + dureeSegment(s, maintenant), 0);

const minutesPause = (journee, maintenant) =>
  minutesPar(journee, PAUSE_DEJEUNER, maintenant)
  + minutesPar(journee, PAUSE_CAFE, maintenant);

// ── Ouverture et fermeture ──────────────────────────────────────────

/**
 * Ouvre un segment.
 *
 * @param journee  journée existante, ou null pour une première ouverture
 * @param options  { debut, type, multiplesAutorises, trace }
 * @returns { ok: true, journee } ou { ok: false, motif, statutHttp }
 */
function ouvrir(journee, options = {}) {
  const {
    debut = new Date().toISOString(),
    type = TRAVAIL,
    multiplesAutorises = false,
    trace = {},
  } = options;

  if (!TYPES_SEGMENT.includes(type)) {
    return { ok: false, motif: `Type de pointage inconnu : ${type}`, statutHttp: 400 };
  }

  const ouvert = segmentOuvert(journee);

  if (ouvert) {
    // Un segment déjà ouvert : c'est une fermeture qu'il faut, pas une
    // ouverture. Le dire précisément évite au salarié de croire que
    // son pointage n'a pas été pris.
    return {
      ok: false,
      motif: ouvert.type === TRAVAIL
        ? "Vous êtes déjà pointé. Pointez votre départ avant de repointer."
        : "Une pause est en cours. Terminez-la avant de repointer.",
      statutHttp: 409,
    };
  }

  const dejaFait = segments(journee).length > 0;

  // Un seul passage par jour en exploitation ; plusieurs en
  // développement, sans quoi aucun essai n'est possible après le
  // premier pointage de la journée.
  if (dejaFait && !multiplesAutorises) {
    return {
      ok: false,
      motif: "Vous avez déjà pointé votre arrivée aujourd'hui",
      statutHttp: 409,
    };
  }

  const nouveau = {
    debut,
    fin: null,
    type,
    ...trace,
  };

  return {
    ok: true,
    journee: recalculer({
      ...(journee ?? {}),
      segments: [...segments(journee), nouveau],
    }),
  };
}

/**
 * Ferme le segment ouvert.
 *
 * @returns { ok: true, journee, dureeMinutes } ou { ok: false, motif, statutHttp }
 */
function fermer(journee, options = {}) {
  const { fin = new Date().toISOString(), trace = {} } = options;

  const ouvert = segmentOuvert(journee);

  if (!ouvert) {
    return {
      ok: false,
      motif: segments(journee).length === 0
        ? "Aucun pointage d'arrivée trouvé pour aujourd'hui"
        : "Vous avez déjà pointé votre départ aujourd'hui",
      statutHttp: segments(journee).length === 0 ? 404 : 409,
    };
  }

  // Une fin antérieure au début viendrait d'une horloge faussée. On ne
  // refuse pas — le salarié n'y est pour rien — mais on cale la fin
  // sur le début, ce qui donne une durée nulle plutôt que négative.
  const finUtile = new Date(fin) < new Date(ouvert.debut) ? ouvert.debut : fin;

  const misAJour = segments(journee).map((s) =>
    s === ouvert ? { ...s, fin: finUtile, ...trace } : s
  );

  const journeeFermee = recalculer({ ...journee, segments: misAJour });

  return {
    ok: true,
    journee: journeeFermee,
    dureeMinutes: dureeSegment({ ...ouvert, fin: finUtile }),
  };
}

// ── Champs dérivés ──────────────────────────────────────────────────

/**
 * Recalcule les champs dérivés, y compris les trois champs de l'ancien
 * modèle.
 *
 * Conserver heureArrivee, heureDepart et dureeMinutes n'est pas de la
 * dette : c'est ce qui permet à la paie, à l'historique et aux
 * indicateurs de continuer à lire la même chose qu'avant, sans
 * migration et sans double écriture à maintenir à la main.
 */
function recalculer(journee) {
  const liste = segments(journee);
  const travail = liste.filter((s) => (s.type ?? TRAVAIL) === TRAVAIL);

  const premier = travail[0] ?? null;
  const dernierFerme = [...travail].reverse().find((s) => s.fin) ?? null;
  const enCours = liste.some((s) => !s.fin);

  // Seuls les segments FERMÉS alimentent les champs stockés.
  //
  // Un segment ouvert compte jusqu'à l'instant du calcul : stocker ce
  // total donnerait un nombre qui grandit tout seul entre deux
  // écritures, et la paie lirait une valeur dépendant de l'heure à
  // laquelle elle a été calculée. Le temps vivant est l'affaire de
  // l'affichage, qui appelle minutesTravaillees avec « maintenant ».
  const fermes = { segments: liste.filter((s) => s.fin) };

  return {
    ...journee,
    segments: liste,

    // ── Compatibilité avec l'ancien modèle ──
    heureArrivee: premier?.debut ?? null,
    heureDepart: enCours ? null : (dernierFerme?.fin ?? null),
    dureeMinutes: minutesTravaillees(fermes),

    minutesPause: minutesPause(fermes),
    nbSegments: liste.length,
    statut: enCours ? "EN_COURS" : (liste.length ? "TERMINE" : "VIDE"),
  };
}

// ── Résumé pour l'affichage ─────────────────────────────────────────

/**
 * Retard, heures prévues, écart à l'objectif.
 *
 * ── Deux chiffres, parce qu'il y a deux questions ───────────────────
 *
 * « Quel retard ? » est ambigu, et cette ambiguïté a déjà produit un
 * bogue : une version antérieure jugeait le retard avec une tolérance
 * de quinze minutes mais le comptait depuis une autre heure, et
 * affichait « +16 min » pour une arrivée à 8h46.
 *
 * Deux grandeurs distinctes sont donc renvoyées :
 *
 *   minutesApresReference  l'écart brut à l'heure de référence.
 *                          8h46 pour une référence à 8h00 donne 46.
 *                          C'est le fait, indépendant de toute règle.
 *
 *   minutesRetard          ce qui est effectivement compté, tolérance
 *                          déduite. 46 − 15 = 31. C'est la règle.
 *
 * Et le retard se mesure sur la PREMIÈRE arrivée du jour, jamais sur
 * un retour de pause : un salarié arrivé à l'heure et reparti
 * déjeuner n'est pas en retard à 14h.
 */
function resume(journee, fiche, options = {}) {
  const {
    maintenant = new Date(),
    fuseau = FUSEAU_DEFAUT,
  } = options instanceof Date ? { maintenant: options } : options;

  const horaire = horaireDe(fiche);
  const prevues = minutesPrevues(horaire);

  const travaillees = minutesTravaillees(journee, maintenant);
  const pauses = minutesPause(journee, maintenant);

  const premier = segments(journee).find((s) => (s.type ?? TRAVAIL) === TRAVAIL);

  let minutesRetard = 0;
  let minutesApresReference = 0;
  let estRetard = false;

  if (premier) {
    const minutesArrivee = minutesLocales(premier.debut, fuseau);
    const reference = minutesDepuisMinuit(horaire.arrivee) ?? 0;
    const depassement = (minutesArrivee ?? reference) - reference;

    // Une arrivée en avance ne crée pas un retard négatif.
    minutesApresReference = Math.max(0, depassement);

    if (depassement > horaire.toleranceMinutes) {
      estRetard = true;
      minutesRetard = depassement - horaire.toleranceMinutes;
    }
  }

  // Les heures supplémentaires ne se comptent qu'une journée terminée :
  // à 9h du matin, « −7h00 » n'est pas un retard de travail, c'est une
  // journée qui commence.
  const terminee = journee?.statut === "TERMINE";

  return {
    minutesTravaillees: travaillees,
    minutesPause: pauses,
    minutesPrevues: prevues,
    ecartMinutes: travaillees - prevues,
    minutesSupplementaires: terminee ? Math.max(0, travaillees - prevues) : 0,
    estRetard,
    minutesRetard,
    minutesApresReference,
    enCours: Boolean(segmentOuvert(journee)),
    horaire,
    fuseau,
    pourcentage: prevues > 0
      ? Math.min(100, Math.round((travaillees / prevues) * 100))
      : 0,
  };
}

/** Le jour est-il ouvré selon l'horaire de référence ? */
function estJourOuvre(dateIso, fiche) {
  // Midi plutôt que minuit : à minuit, un décalage de fuseau d'une
  // heure fait basculer la date d'un jour, et un lundi devient un
  // dimanche. À midi, aucun fuseau habité ne change le jour.
  const d = new Date(`${String(dateIso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;

  // getUTCDay() rend 0 pour dimanche ; on travaille en 1 = lundi.
  const jour = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return horaireDe(fiche).joursOuvres.includes(jour);
}

module.exports = {
  TRAVAIL,
  PAUSE_DEJEUNER,
  PAUSE_CAFE,
  TYPES_SEGMENT,
  HORAIRE_DEFAUT,

  FUSEAU_DEFAUT,
  minutesDepuisMinuit,
  minutesLocales,
  horaireDe,
  minutesPrevues,

  segmentOuvert,
  dureeSegment,
  minutesTravaillees,
  minutesPause,

  ouvrir,
  fermer,
  recalculer,
  resume,
  estJourOuvre,
};