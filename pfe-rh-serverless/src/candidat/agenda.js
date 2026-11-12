// src/candidat/agenda.js
//
// Agenda du candidat : entretiens planifies et echeances de quiz,
// reunis en une seule liste d'evenements datés.
//
// L'export iCalendar permet au candidat d'ajouter ses rendez-vous a
// Google Agenda ou Outlook. Le format est un standard ouvert : aucune
// cle, aucune authentification tierce, contrairement a l'API Google
// Calendar qui imposerait un consentement OAuth par candidat.

const { QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite } = require("../utils/contexte");

const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";
const TABLE_ENTRETIENS = process.env.TABLE_ENTRETIENS || "Entretiens-local";
const TABLE_QUIZ = process.env.TABLE_QUIZ || "Quiz-local";

const JOUR_MS = 86_400_000;

function joursRestants(iso) {
  const cible = new Date(iso);
  const aujourdhui = new Date();

  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());

  return Math.round((a - b) / JOUR_MS);
}

/**
 * Message d'accompagnement selon l'echeance.
 * Un rappel n'a d'interet que s'il dit quoi faire : « dans 2 jours »
 * sans conseil n'apporte rien.
 */
function alerte(type, jours) {
  if (jours < 0) return null;

  if (type === "ENTRETIEN") {
    if (jours === 0) return { niveau: "urgent", texte: "Votre entretien a lieu aujourd'hui" };
    if (jours === 1) return { niveau: "urgent", texte: "Entretien demain — relisez l'offre et préparez vos questions" };
    if (jours <= 3) return { niveau: "attention", texte: `Entretien dans ${jours} jours — pensez à préparer vos exemples concrets` };
    if (jours <= 7) return { niveau: "info", texte: `Entretien dans ${jours} jours` };
    return null;
  }

  if (type === "QUIZ") {
    if (jours === 0) return { niveau: "urgent", texte: "Dernier jour pour passer ce quiz" };
    if (jours === 1) return { niveau: "urgent", texte: "Il vous reste 1 jour pour passer ce quiz" };
    if (jours <= 3) return { niveau: "attention", texte: `Il vous reste ${jours} jours pour passer ce quiz` };
    if (jours <= 7) return { niveau: "info", texte: `Quiz à passer sous ${jours} jours` };
    return null;
  }

  return null;
}

async function candidaturesDuCandidat(email) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CANDIDATURES,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": email },
  }));
  return res.Items || [];
}

/**
 * Construit la liste des evenements a venir et passes.
 * Les deux sources — entretiens et quiz — sont normalisees dans une
 * structure commune, ce qui permet au front de les afficher sans
 * distinguer leur origine.
 */
async function construireEvenements(email) {
  const candidatures = await candidaturesDuCandidat(email);
  const evenements = [];

  for (const c of candidatures) {
    // ── Entretiens ──
    if (c.entretienId || c.entretien) {
      const res = await docClient.send(new QueryCommand({
        TableName: TABLE_ENTRETIENS,
        IndexName: "candidature-index",
        KeyConditionExpression: "candidatureId = :c",
        ExpressionAttributeValues: { ":c": c.id },
      }));

      for (const e of res.Items || []) {
        if (e.statut === "ANNULE") continue;

        const jours = joursRestants(e.dateHeure);
        evenements.push({
          id: `entretien-${e.id}`,
          type: "ENTRETIEN",
          titre: `Entretien — ${e.offreTitre || c.offreTitre || c.posteVise}`,
          dateHeure: e.dateHeure,
          dureeMinutes: e.dureeMinutes || 60,
          sousType: e.type,
          lieu: e.lieu || null,
          lienVideo: e.lienVideo || null,
          interviewers: e.interviewers || [],
          candidatureId: c.id,
          offreTitre: c.offreTitre || c.posteVise,
          statut: e.statut,
          jours,
          passe: jours < 0,
          alerte: alerte("ENTRETIEN", jours),
        });
      }
    }

    // ── Echeances de quiz ──
    // Seuls les quiz encore a passer ont une echeance utile : un quiz
    // termine n'appelle aucune action.
    if (c.quizId && ["ENVOYE", "EN_COURS"].includes(c.quizStatus)) {
      const q = await docClient.send(new GetCommand({
        TableName: TABLE_QUIZ, Key: { id: c.quizId },
      }));
      if (!q.Item) continue;

      const echeance = c.quizExpirationDate
        || new Date(Date.now() + 7 * JOUR_MS).toISOString();
      const jours = joursRestants(echeance);

      evenements.push({
        id: `quiz-${c.quizId}`,
        type: "QUIZ",
        titre: `Quiz technique — ${c.offreTitre || c.posteVise}`,
        dateHeure: echeance,
        dureeMinutes: q.Item.dureeMinutes || 30,
        quizId: c.quizId,
        candidatureId: c.id,
        offreTitre: c.offreTitre || c.posteVise,
        nombreQuestions: (q.Item.questions || []).length,
        statut: c.quizStatus,
        jours,
        passe: jours < 0,
        alerte: alerte("QUIZ", jours),
      });
    }
  }

  evenements.sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure)));
  return evenements;
}

// ── GET /candidat/agenda ───────────────────────────────────────────

exports.lister = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const evenements = await construireEvenements(moi.email);

    const aVenir = evenements.filter((e) => !e.passe);
    const passes = evenements.filter((e) => e.passe).reverse();

    return succes({
      evenements: aVenir,
      passes,
      // Les alertes sont extraites a part : le front les affiche en
      // tete de page sans reparcourir la liste.
      alertes: aVenir
        .filter((e) => e.alerte)
        .map((e) => ({
          id: e.id,
          type: e.type,
          niveau: e.alerte.niveau,
          texte: e.alerte.texte,
          dateHeure: e.dateHeure,
          quizId: e.quizId ?? null,
        })),
      resume: {
        total: aVenir.length,
        entretiens: aVenir.filter((e) => e.type === "ENTRETIEN").length,
        quiz: aVenir.filter((e) => e.type === "QUIZ").length,
        urgents: aVenir.filter((e) => e.alerte?.niveau === "urgent").length,
      },
    });
  } catch (e) {
    console.error("Erreur agenda candidat:", e);
    return erreur("Impossible de charger l'agenda");
  }
};

// ── GET /candidat/agenda.ics ───────────────────────────────────────

/** Horodatage iCalendar : AAAAMMJJTHHMMSSZ, en UTC */
const horodatage = (iso) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Le format iCalendar impose l'echappement de quatre caracteres et
 * des lignes de 75 octets maximum, repliees par un espace.
 */
function echapper(texte) {
  return String(texte ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function plier(ligne) {
  if (ligne.length <= 75) return ligne;
  const morceaux = [ligne.slice(0, 75)];
  let reste = ligne.slice(75);
  while (reste.length > 74) {
    morceaux.push(" " + reste.slice(0, 74));
    reste = reste.slice(74);
  }
  if (reste) morceaux.push(" " + reste);
  return morceaux.join("\r\n");
}

exports.exporterIcs = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const evenements = (await construireEvenements(moi.email)).filter((e) => !e.passe);
    const maintenant = horodatage(new Date().toISOString());

    const lignes = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HR UP//Agenda candidat//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:HR UP — mes rendez-vous",
      "X-WR-TIMEZONE:Africa/Tunis",
    ];

    for (const e of evenements) {
      const debut = new Date(e.dateHeure);
      const fin = new Date(debut.getTime() + (e.dureeMinutes || 60) * 60000);

      const description = e.type === "ENTRETIEN"
        ? `Entretien pour le poste : ${e.offreTitre}.`
          + (e.lienVideo ? `\nLien : ${e.lienVideo}` : "")
          + (e.lieu ? `\nLieu : ${e.lieu}` : "")
        : `Quiz technique à passer avant cette date.`
          + `\n${e.nombreQuestions} questions, ${e.dureeMinutes} minutes.`;

      lignes.push(
        "BEGIN:VEVENT",
        plier(`UID:${e.id}@hr-up`),
        `DTSTAMP:${maintenant}`,
        `DTSTART:${horodatage(debut.toISOString())}`,
        `DTEND:${horodatage(fin.toISOString())}`,
        plier(`SUMMARY:${echapper(e.titre)}`),
        plier(`DESCRIPTION:${echapper(description)}`),
        plier(`LOCATION:${echapper(e.lienVideo || e.lieu || "À distance")}`),
        "STATUS:CONFIRMED",
        // Rappel 24 h avant, gere par le client de messagerie
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        plier(`DESCRIPTION:${echapper(`Rappel : ${e.titre}`)}`),
        "END:VALARM",
        "END:VEVENT"
      );
    }

    lignes.push("END:VCALENDAR");

    // Les sauts de ligne doivent etre CRLF, c'est une exigence du
    // format : un simple LF est refuse par certains clients.
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hr-up-agenda.ics"',
        "Access-Control-Allow-Origin": "*",
      },
      body: lignes.join("\r\n"),
    };
  } catch (e) {
    console.error("Erreur export iCalendar:", e);
    return erreur("Impossible de générer le fichier");
  }
};

module.exports.construireEvenements = construireEvenements;