// src/utils/geolocalisation.js
//
// Vérification de présence au pointage. Le QR dit quel site ; la
// position dit si le salarié y est. Un QR photographié se partage,
// une position ne se falsifie pas depuis un navigateur ordinaire.

const { GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./dynamodb");

const TABLE_SITES = process.env.TABLE_SITES || "Sites-local";

// Au-delà, la position vient du réseau et non du GPS : elle ne prouve
// plus rien. Un portable en intérieur tourne autour de 100 m.
const PRECISION_MAX_M = 300;

// Rayon par défaut, quand le site n'en déclare pas.
const RAYON_DEFAUT_M = 150;

/**
 * Distance orthodromique entre deux points, en mètres.
 *
 * La formule plate (différence de degrés × 111 km) fausse de plusieurs
 * centaines de mètres sous nos latitudes, car un degré de longitude
 * vaut 111 km à l'équateur mais seulement 89 km à 36°.
 */
function distanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function siteParCode(code) {
  if (!code) return null;
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_SITES,
    Key: { code },
  })).catch(() => ({ Item: null }));
  return res.Item ?? null;
}

async function tousLesSites() {
  const res = await docClient.send(new ScanCommand({
    TableName: TABLE_SITES,
  })).catch(() => ({ Items: [] }));
  return res.Items ?? [];
}

/**
 * Vérifie qu'un pointage est plausible.
 *
 * Ne lève jamais : un pointage douteux est accepté et marqué, car
 * refuser bloquerait un salarié dont le GPS est capricieux. C'est la
 * RH qui tranche sur les cas signalés.
 *
 * @returns {Promise<{
 *   valide: boolean,
 *   site: object|null,
 *   distanceMetres: number|null,
 *   motif: string|null,
 *   aVerifier: boolean,
 * }>}
 */
async function verifierPresence({ latitude, longitude, precisionMetres, siteCode }) {
  // Sans position, le pointage reste possible mais non attesté : un
  // poste fixe sans GPS doit continuer de fonctionner.
  if (latitude == null || longitude == null) {
    return {
      valide: true,
      site: null,
      distanceMetres: null,
      motif: "Position non transmise",
      aVerifier: true,
    };
  }

  const precision = Number(precisionMetres) || 0;

  if (precision > PRECISION_MAX_M) {
    return {
      valide: true,
      site: null,
      distanceMetres: null,
      motif: `Position imprécise (${precision} m)`,
      aVerifier: true,
    };
  }

  // Le QR désigne un site ; sans lui, on cherche le plus proche parmi
  // ceux déclarés.
  const candidats = siteCode
    ? [await siteParCode(siteCode)].filter(Boolean)
    : await tousLesSites();

  if (candidats.length === 0) {
    return {
      valide: true,
      site: null,
      distanceMetres: null,
      motif: siteCode
        ? `Site inconnu : ${siteCode}`
        : "Aucun site déclaré",
      aVerifier: true,
    };
  }

  // Le plus proche, et sa distance
  let meilleur = null;
  let meilleureDistance = Infinity;

  for (const site of candidats) {
    const d = distanceMetres(
      Number(latitude), Number(longitude),
      Number(site.latitude), Number(site.longitude)
    );
    if (d < meilleureDistance) {
      meilleureDistance = d;
      meilleur = site;
    }
  }

  const rayon = Number(meilleur.rayonMetres) || RAYON_DEFAUT_M;

  // La marge de précision s'ajoute au rayon : à 97 m d'incertitude,
  // exiger moins de 150 m refuserait un salarié réellement présent.
  const seuil = rayon + precision;
  const dansLaZone = meilleureDistance <= seuil;

  return {
    valide: dansLaZone,
    site: meilleur,
    distanceMetres: meilleureDistance,
    motif: dansLaZone
      ? null
      : `À ${meilleureDistance} m de ${meilleur.nom}, hors zone de ${rayon} m`,
    // Un pointage accepté grâce à la seule marge de précision mérite
    // un œil : il est dans la zone, mais de justesse.
    aVerifier: dansLaZone && meilleureDistance > rayon,
  };
}

/**
 * Trace à joindre au pointage. Ce qui est stocké doit permettre à la
 * RH de comprendre une décision six mois plus tard.
 */
function traceGeo(verification, corps) {
  return {
    latitude: corps.latitude ?? null,
    longitude: corps.longitude ?? null,
    precisionMetres: corps.precisionMetres ?? null,
    siteCode: verification.site?.code ?? corps.siteCode ?? null,
    siteNom: verification.site?.nom ?? null,
    distanceMetres: verification.distanceMetres,
    qrScanne: Boolean(corps.siteCode),
    presenceValidee: verification.valide,
    aVerifier: verification.aVerifier,
    motifVerification: verification.motif,
  };
}

module.exports = {
  distanceMetres,
  verifierPresence,
  traceGeo,
  PRECISION_MAX_M,
  RAYON_DEFAUT_M,
};