// src/services/courriel.js
//
// Envoi de courriels via Amazon SES.
//
// SES demarre en mode bac a sable : seules les adresses verifiees
// peuvent recevoir un message. La sortie du bac a sable se demande
// depuis la console et prend 24 a 48 heures.
//
// Un echec d'envoi ne doit jamais faire echouer l'action metier : un
// entretien reste planifie meme si la notification n'est pas partie.

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const REGION = process.env.REGION_SES || process.env.AWS_REGION || "eu-west-3";
const EXPEDITEUR = process.env.COURRIEL_EXPEDITEUR;
const URL_APPLICATION = process.env.URL_APPLICATION || "https://d2cc1fkfzt3nok.cloudfront.net";

// En developpement, les messages sont journalises plutot qu'envoyes :
// inutile de consommer le quota SES a chaque test.
const ACTIF = !!EXPEDITEUR && process.env.COURRIEL_SIMULE !== "true";

const ses = ACTIF ? new SESClient({ region: REGION }) : null;

const VERT = "#2d6a4f";
const BEIGE = "#f5f0e8";
const ENCRE = "#1a1a1a";
const ENCRE_DOUCE = "#6b7280";

/**
 * Gabarit commun. Le style est en ligne : les clients de messagerie
 * ignorent largement les feuilles de style externes et les selecteurs
 * complexes.
 */
function gabarit({ titre, corps, actionTexte, actionUrl, pied }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${BEIGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BEIGE};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;">

        <tr><td style="background-color:${VERT};padding:28px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">HR UP</div>
          <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${titre}</div>
        </td></tr>

        <tr><td style="padding:32px;color:${ENCRE};font-size:15px;line-height:1.6;">
          ${corps}
          ${actionUrl ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
            <tr><td style="background-color:${VERT};border-radius:12px;">
              <a href="${actionUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${actionTexte}</a>
            </td></tr>
          </table>` : ""}
        </td></tr>

        <tr><td style="padding:20px 32px;border-top:1px solid #e5e0d8;color:${ENCRE_DOUCE};font-size:12px;line-height:1.5;">
          ${pied || "Ce message est envoyé automatiquement, merci de ne pas y répondre."}
        </td></tr>

      </table>
      <div style="color:${ENCRE_DOUCE};font-size:11px;margin-top:16px;">HR UP · Tunisie</div>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Version texte, obligatoire : certains clients refusent le HTML seul */
const enTexte = (html) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

async function envoyer({ destinataire, sujet, html }) {
  if (!ACTIF) {
    console.log(`[courriel simulé] → ${destinataire} : ${sujet}`);
    return { envoye: false, simule: true };
  }

  try {
    await ses.send(new SendEmailCommand({
      Source: EXPEDITEUR,
      Destination: { ToAddresses: [destinataire] },
      Message: {
        Subject: { Data: sujet, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: enTexte(html), Charset: "UTF-8" },
        },
      },
    }));
    return { envoye: true };
  } catch (e) {
    // MessageRejected survient en bac a sable quand l'adresse du
    // destinataire n'est pas verifiee : c'est la cause la plus
    // frequente, autant la nommer.
    if (e.name === "MessageRejected") {
      console.warn(`Courriel refusé pour ${destinataire} — adresse non vérifiée (bac à sable SES)`);
    } else {
      console.error(`Échec d'envoi vers ${destinataire}:`, e.message);
    }
    return { envoye: false, erreur: e.message };
  }
}

const dateLisible = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis",
  });

// ── Messages ───────────────────────────────────────────────────────

exports.entretienPlanifie = ({ destinataire, prenom, offreTitre, entretien }) => {
  const modalite = entretien.lienVideo
    ? `en visioconférence`
    : entretien.lieu
      ? `sur site — ${entretien.lieu}`
      : "par téléphone";

  return envoyer({
    destinataire,
    sujet: `Entretien planifié — ${offreTitre}`,
    html: gabarit({
      titre: "Votre entretien est confirmé",
      corps: `
        <p>Bonjour ${prenom},</p>
        <p>Votre candidature pour le poste de <strong>${offreTitre}</strong> a retenu notre attention.
        Nous vous proposons un entretien :</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${BEIGE};border-radius:12px;padding:16px;margin:20px 0;">
          <tr><td style="padding:6px 0;color:${ENCRE_DOUCE};font-size:13px;">Date</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;">${dateLisible(entretien.dateHeure)}</td></tr>
          <tr><td style="padding:6px 0;color:${ENCRE_DOUCE};font-size:13px;">Durée</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;">${entretien.dureeMinutes || 60} minutes</td></tr>
          <tr><td style="padding:6px 0;color:${ENCRE_DOUCE};font-size:13px;">Modalité</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;">${modalite}</td></tr>
        </table>
        ${entretien.lienVideo ? `<p style="font-size:13px;color:${ENCRE_DOUCE};">Le lien de connexion : <a href="${entretien.lienVideo}" style="color:${VERT};">${entretien.lienVideo}</a></p>` : ""}
        <p>Vous retrouverez ce rendez-vous dans votre agenda, où vous pourrez également l'exporter vers votre calendrier personnel.</p>`,
      actionTexte: "Voir mon agenda",
      actionUrl: `${URL_APPLICATION}/candidat/agenda`,
    }),
  });
};

exports.quizEnvoye = ({ destinataire, prenom, offreTitre, quizId, dureeMinutes, echeance }) =>
  envoyer({
    destinataire,
    sujet: `Évaluation technique — ${offreTitre}`,
    html: gabarit({
      titre: "Une évaluation vous attend",
      corps: `
        <p>Bonjour ${prenom},</p>
        <p>Dans le cadre de votre candidature pour le poste de <strong>${offreTitre}</strong>,
        nous vous invitons à passer une évaluation technique.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${BEIGE};border-radius:12px;padding:16px;margin:20px 0;">
          <tr><td style="padding:6px 0;color:${ENCRE_DOUCE};font-size:13px;">Durée</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;">${dureeMinutes} minutes</td></tr>
          <tr><td style="padding:6px 0;color:${ENCRE_DOUCE};font-size:13px;">À passer avant le</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;">${dateLisible(echeance)}</td></tr>
        </table>
        <p style="font-size:13px;color:${ENCRE_DOUCE};">Le chronomètre démarre dès l'ouverture du quiz :
        prévoyez un moment au calme avant de commencer.</p>`,
      actionTexte: "Passer l'évaluation",
      actionUrl: `${URL_APPLICATION}/candidat/quiz/${quizId}`,
    }),
  });

/** Rappel automatique, envoye par la tache planifiee */
exports.rappel = ({ destinataire, prenom, type, titre, dateHeure, jours, lien }) => {
  const quand = jours === 0 ? "aujourd'hui" : jours === 1 ? "demain" : `dans ${jours} jours`;

  const conseil = type === "ENTRETIEN"
    ? `<p style="font-size:13px;color:${ENCRE_DOUCE};">Quelques minutes de préparation font la différence :
       relisez l'offre, préparez deux ou trois exemples concrets de vos réalisations,
       et notez les questions que vous souhaitez poser.</p>`
    : `<p style="font-size:13px;color:${ENCRE_DOUCE};">Au-delà de cette date, l'évaluation ne sera plus accessible
       et votre candidature ne pourra pas poursuivre son parcours.</p>`;

  return envoyer({
    destinataire,
    sujet: type === "ENTRETIEN"
      ? `Rappel : votre entretien ${quand}`
      : `Rappel : votre évaluation expire ${quand}`,
    html: gabarit({
      titre: "Rappel",
      corps: `
        <p>Bonjour ${prenom},</p>
        <p>${type === "ENTRETIEN" ? "Votre entretien" : "Votre évaluation technique"}
        pour <strong>${titre}</strong> ${type === "ENTRETIEN" ? "a lieu" : "expire"} <strong>${quand}</strong>,
        le ${dateLisible(dateHeure)}.</p>
        ${conseil}`,
      actionTexte: type === "ENTRETIEN" ? "Voir mon agenda" : "Passer l'évaluation",
      actionUrl: lien,
    }),
  });
};

exports.candidatureRecue = ({ destinataire, prenom, offreTitre }) =>
  envoyer({
    destinataire,
    sujet: `Candidature bien reçue — ${offreTitre}`,
    html: gabarit({
      titre: "Candidature enregistrée",
      corps: `
        <p>Bonjour ${prenom},</p>
        <p>Nous avons bien reçu votre candidature pour le poste de <strong>${offreTitre}</strong>.</p>
        <p>Votre dossier va être étudié. Vous pouvez suivre son avancement depuis votre espace
        candidat, où chaque changement d'étape apparaîtra.</p>`,
      actionTexte: "Suivre ma candidature",
      actionUrl: `${URL_APPLICATION}/candidat/mes-candidatures`,
    }),
  });

exports.decision = ({ destinataire, prenom, offreTitre, retenu, commentaire }) =>
  envoyer({
    destinataire,
    sujet: retenu
      ? `Suite favorable — ${offreTitre}`
      : `Réponse à votre candidature — ${offreTitre}`,
    html: gabarit({
      titre: retenu ? "Bonne nouvelle" : "Réponse à votre candidature",
      corps: retenu
        ? `<p>Bonjour ${prenom},</p>
           <p>Nous avons le plaisir de vous informer que votre candidature pour le poste de
           <strong>${offreTitre}</strong> a été retenue.</p>
           ${commentaire ? `<p>${commentaire}</p>` : ""}
           <p>Nous reviendrons rapidement vers vous pour la suite.</p>`
        : `<p>Bonjour ${prenom},</p>
           <p>Nous vous remercions de l'intérêt porté au poste de <strong>${offreTitre}</strong>
           et du temps consacré à votre candidature.</p>
           <p>Après examen, nous ne donnons pas suite. ${commentaire || ""}</p>
           <p>Votre profil reste dans notre vivier, et nous vous recontacterons si une opportunité
           correspond mieux à votre parcours.</p>`,
      actionTexte: "Voir les offres",
      actionUrl: `${URL_APPLICATION}/candidat/offres`,
    }),
  });

exports.actif = ACTIF;