// src/offres/recommandations.js
//
// Correspondance entre un profil candidat et les offres publiees.
//
// Aucun modele de langage n'est necessaire ici : l'adequation se
// mesure par recoupement de competences, de niveau et d'experience.
// Un calcul deterministe est plus rapide, gratuit, et surtout
// explicable au candidat — ce qu'une reponse de modele n'est pas.

const { GetCommand, PutCommand, QueryCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite } = require("../utils/contexte");

const TABLE_OFFRES = process.env.TABLE_OFFRES || "Offres-local";
const TABLE_PROFILS = process.env.TABLE_PROFILS_CANDIDATS || "ProfilsCandidats-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";
const TABLE_ALERTES = process.env.TABLE_ALERTES_OFFRES || "AlertesOffres-local";

// Ponderation des criteres. Les competences pesent le plus : c'est
// ce qui determine reellement la capacite a tenir le poste.
const POIDS = {
  competences: 55,
  poste: 25,
  niveau: 10,
  departement: 10,
};

const NIVEAUX = ["bac", "bac+2", "bac+3", "licence", "master", "bac+5", "ingenieur", "doctorat"];

/** Comparaison souple : accents, casse et ponctuation ignores */
function normaliser(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rangNiveau(niveau) {
  const n = normaliser(niveau);
  const trouve = NIVEAUX.findIndex((v) => n.includes(v));
  return trouve === -1 ? 0 : trouve;
}

/**
 * Score d'adequation entre un profil et une offre, de 0 a 100.
 *
 * Le detail est retourne avec le score : un candidat doit pouvoir
 * comprendre pourquoi une offre lui est proposee, et ce qui lui
 * manque pour une autre.
 */
function calculerAdequation(profil, offre) {
  const detail = { competences: 0, poste: 0, niveau: 0, departement: 0 };

  // ── Compétences ──
  const miennes = (profil.competences || []).map(normaliser).filter(Boolean);
  const requises = (offre.competences || []).map(normaliser).filter(Boolean);

  const communes = [];
  const manquantes = [];

  if (requises.length > 0) {
    for (const r of requises) {
      // La correspondance partielle capture « React » dans
      // « React Native », ce qu'une egalite stricte manquerait.
      const trouvee = miennes.some((m) => m === r || m.includes(r) || r.includes(m));
      if (trouvee) communes.push(r);
      else manquantes.push(r);
    }
    detail.competences = Math.round((communes.length / requises.length) * POIDS.competences);
  } else {
    // Offre sans compétences déclarées : on ne peut ni valoriser ni
    // pénaliser, la moitié du poids est attribuée.
    detail.competences = Math.round(POIDS.competences / 2);
  }

  // ── Intitulé du poste ──
  const vise = normaliser(profil.posteVise);
  const titre = normaliser(offre.titre);

  if (vise && titre) {
    const motsVises = vise.split(" ").filter((m) => m.length > 3);
    const communs = motsVises.filter((m) => titre.includes(m));
    detail.poste = motsVises.length
      ? Math.round((communs.length / motsVises.length) * POIDS.poste)
      : 0;
  }

  // ── Niveau d'étude ──
  const rangProfil = rangNiveau(profil.niveauEtude);
  const rangOffre = rangNiveau(offre.niveauRequis);

  if (rangOffre === 0) detail.niveau = POIDS.niveau;
  else if (rangProfil >= rangOffre) detail.niveau = POIDS.niveau;
  // Un niveau legerement inferieur reste jouable : la penalite est
  // progressive plutot que binaire.
  else detail.niveau = Math.max(0, POIDS.niveau - (rangOffre - rangProfil) * 3);

  // ── Département ──
  if (!profil.departementSouhaite) detail.departement = Math.round(POIDS.departement / 2);
  else if (normaliser(profil.departementSouhaite) === normaliser(offre.departement)) {
    detail.departement = POIDS.departement;
  }

  const score = Object.values(detail).reduce((s, v) => s + v, 0);

  return {
    score: Math.min(100, score),
    detail,
    competencesCommunes: communes,
    competencesManquantes: manquantes,
  };
}

/** Explication lisible, destinee a l'affichage */
function expliquer(adequation) {
  const { score, competencesCommunes, competencesManquantes } = adequation;

  if (score >= 75) {
    return competencesCommunes.length
      ? `Votre maîtrise de ${competencesCommunes.slice(0, 3).join(", ")} correspond aux attentes.`
      : "Votre profil correspond fortement à cette offre.";
  }
  if (score >= 50) {
    return competencesManquantes.length
      ? `Profil proche. À renforcer : ${competencesManquantes.slice(0, 2).join(", ")}.`
      : "Votre profil correspond partiellement à cette offre.";
  }
  return competencesManquantes.length
    ? `Écart sur ${competencesManquantes.slice(0, 3).join(", ")}.`
    : "Correspondance limitée avec votre profil.";
}

// ── GET /offres/recommandations ────────────────────────────────────

exports.recommander = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: moi.userId },
    }));

    const profil = res.Item;

    // Sans profil renseigne, aucune recommandation n'a de sens :
    // mieux vaut le dire que proposer des offres au hasard.
    if (!profil || (profil.competences || []).length === 0) {
      return succes({
        recommandations: [],
        profilIncomplet: true,
        message: "Complétez vos compétences dans votre profil pour recevoir des recommandations.",
      });
    }

    const offresRes = await docClient.send(new QueryCommand({
      TableName: TABLE_OFFRES,
      IndexName: "statut-index",
      KeyConditionExpression: "statut = :s",
      ExpressionAttributeValues: { ":s": "ACTIVE" },
    }));

    // Les offres deja candidatees sont ecartees : les reproposer
    // serait une impasse pour le candidat.
    const dejaRes = await docClient.send(new QueryCommand({
      TableName: TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ProjectionExpression: "offreId",
      ExpressionAttributeValues: { ":e": moi.email },
    }));

    const deja = new Set((dejaRes.Items || []).map((c) => c.offreId).filter(Boolean));

    const recommandations = (offresRes.Items || [])
      .filter((o) => !deja.has(o.id))
      .map((offre) => {
        const adequation = calculerAdequation(profil, offre);
        return {
          offre: {
            id: offre.id,
            titre: offre.titre,
            departement: offre.departement,
            type: offre.type,
            modeTravail: offre.modeTravail,
            creeLe: offre.creeLe,
          },
          ...adequation,
          explication: expliquer(adequation),
        };
      })
      // Sous 35, la proposition n'apporte rien au candidat
      .filter((r) => r.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return succes({
      recommandations,
      profilIncomplet: false,
      nbOffresAnalysees: (offresRes.Items || []).length,
    });
  } catch (e) {
    console.error("Erreur recommandations:", e);
    return erreur("Impossible de calculer les recommandations");
  }
};

// ── Alertes sur nouvelles offres ───────────────────────────────────

exports.lireAlerte = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_ALERTES, Key: { id: moi.userId },
    }));

    return succes({
      alerte: res.Item ?? {
        id: moi.userId,
        email: moi.email,
        active: false,
        scoreMinimum: 60,
        departements: [],
        typesContrat: [],
      },
    });
  } catch (e) {
    console.error("Erreur lecture alerte:", e);
    return erreur("Impossible de charger vos préférences");
  }
};

exports.enregistrerAlerte = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const { active, scoreMinimum, departements, typesContrat } = body;

    const alerte = {
      id: moi.userId,
      email: moi.email,
      prenom: moi.prenom || "",
      active: active === true,
      // Un seuil trop bas noierait le candidat sous les messages
      scoreMinimum: Math.min(100, Math.max(40, Number(scoreMinimum) || 60)),
      departements: Array.isArray(departements) ? departements : [],
      typesContrat: Array.isArray(typesContrat) ? typesContrat : [],
      misAJourLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLE_ALERTES, Item: alerte }));

    return succes({
      alerte,
      message: alerte.active
        ? "Vous serez averti des nouvelles offres correspondantes"
        : "Alertes désactivées",
    });
  } catch (e) {
    console.error("Erreur enregistrement alerte:", e);
    return erreur("Impossible d'enregistrer vos préférences");
  }
};

/**
 * Candidats a prevenir pour une offre donnee.
 * Appelee par la tache planifiee, jamais depuis l'API.
 */
async function destinatairesPour(offre) {
  const alertesRes = await docClient.send(new ScanCommand({
    TableName: TABLE_ALERTES,
    FilterExpression: "active = :vrai",
    ExpressionAttributeValues: { ":vrai": true },
  }));

  const destinataires = [];

  for (const alerte of alertesRes.Items || []) {
    // Filtres explicites du candidat, appliques avant le calcul
    if (alerte.departements.length && !alerte.departements.includes(offre.departement)) continue;
    if (alerte.typesContrat.length && !alerte.typesContrat.includes(offre.type)) continue;

    const profilRes = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: alerte.id },
    }));
    if (!profilRes.Item) continue;

    const adequation = calculerAdequation(profilRes.Item, offre);
    if (adequation.score < alerte.scoreMinimum) continue;

    destinataires.push({
      email: alerte.email,
      prenom: alerte.prenom || profilRes.Item.prenom || "",
      score: adequation.score,
      explication: expliquer(adequation),
    });
  }

  return destinataires;
}

module.exports.calculerAdequation = calculerAdequation;
module.exports.expliquer = expliquer;
module.exports.destinatairesPour = destinatairesPour;
module.exports.POIDS = POIDS;