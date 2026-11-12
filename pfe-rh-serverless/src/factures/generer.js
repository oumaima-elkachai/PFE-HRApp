// src/factures/generer.js
// POST /factures — génération d'un bulletin de paie

const { GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs/promises");
const path = require("path");
const PDFDocument = require("pdfkit");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { partiesLocales } = require("../utils/contexte");
const { calculerBulletin, HEURES_MENSUELLES, MAJORATIONS } = require("../utils/paie");
const notesFrais = require("../frais/notes");
const { genererBulletinPdf } = require("./bulletin-pdf");
const entreprise = require("./entreprise");
const cooptations = require("../cooptation/cooptations");

const TABLE_EMPLOYES  = process.env.TABLE_EMPLOYES  || "Employes-local";
const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";
const TABLE_CONGES    = process.env.TABLE_CONGES    || "Conges-local";
const TABLE_FACTURES  = process.env.TABLE_FACTURES  || "Factures-local";
const BUCKET          = process.env.DOCUMENTS_BUCKET;

const s3 = BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

const JOURS_FERIES = [
  "2026-01-01", "2026-01-14", "2026-03-20", "2026-04-09",
  "2026-05-01", "2026-07-25", "2026-08-13", "2026-10-15",
];

const TYPES_CONGE_NON_PAYES = new Set(["sans_solde"]);
const STATUT_CONGE_VALIDE = "APPROUVE";

const HEURE_ARRIVEE_NORMALE = "08:30";
const TOLERANCE_RETARD_MIN = 15;

const MOIS_LABELS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ── Dates ──────────────────────────────────────────────────────────
// Aucune conversion UTC sur les dates calendaires : toISOString()
// décalerait d'un jour dans le fuseau tunisien.

const pad = (n) => String(n).padStart(2, "0");

const enChaine = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function estWeekend(jour) {
  const [a, m, j] = jour.split("-").map(Number);
  const n = new Date(a, m - 1, j).getDay();
  return n === 0 || n === 6;
}

const estFerie = (jour) => JOURS_FERIES.includes(jour);
const estOuvrable = (jour) => !estWeekend(jour) && !estFerie(jour);

function joursDuMois(mois, annee) {
  const dernier = new Date(annee, mois, 0).getDate();
  return Array.from({ length: dernier }, (_, i) => `${annee}-${pad(mois)}-${pad(i + 1)}`);
}

function minutesDeRetard(heureArriveeIso) {
  const { heures, minutes } = partiesLocales(heureArriveeIso);
  const [hs, ms] = HEURE_ARRIVEE_NORMALE.split(":").map(Number);
  return Math.max(0, (heures * 60 + minutes) - (hs * 60 + ms) - TOLERANCE_RETARD_MIN);
}

// ── Lectures ───────────────────────────────────────────────────────

async function chargerPointages(employeId, periode) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_POINTAGES,
    KeyConditionExpression: "employeId = :e AND begins_with(#d, :p)",
    ExpressionAttributeNames: { "#d": "date" },
    ExpressionAttributeValues: { ":e": employeId, ":p": periode },
  }));
  return (res.Items || []).filter((p) => p.statut === "TERMINE");
}

async function chargerConges(employeId, premierJour, dernierJour) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: "employe-index",
    KeyConditionExpression: "employeId = :e",
    ExpressionAttributeValues: { ":e": employeId },
  }));

  return (res.Items || []).filter(
    (c) => c.statut === STATUT_CONGE_VALIDE &&
           c.dateDebut <= dernierJour &&
           c.dateFin >= premierJour
  );
}

function joursDeConge(conges, premierJour, dernierJour) {
  const payes = new Set();
  const nonPayes = new Set();

  for (const conge of conges) {
    const debut = conge.dateDebut > premierJour ? conge.dateDebut : premierJour;
    const fin = conge.dateFin < dernierJour ? conge.dateFin : dernierJour;

    const [ad, md, jd] = debut.split("-").map(Number);
    const [af, mf, jf] = fin.split("-").map(Number);
    const curseur = new Date(ad, md - 1, jd);
    const borne = new Date(af, mf - 1, jf);

    while (curseur <= borne) {
      const jour = enChaine(curseur);
      if (estOuvrable(jour) && !payes.has(jour) && !nonPayes.has(jour)) {
        if (TYPES_CONGE_NON_PAYES.has(conge.type)) nonPayes.add(jour);
        else payes.add(jour);
      }
      curseur.setDate(curseur.getDate() + 1);
    }
  }

  return { payes, nonPayes };
}

async function stockerPdf(cle, buffer) {
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: cle,
      Body: buffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }));
    return cle;
  }
  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  console.log(`PDF local : ${destination}`);
  return cle;
}

// ── Handler ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const user = event.user;

    const { employeId, mois, annee, regenerer = false, deduireRetards = false } = body;

    if (!employeId || !mois || !annee) {
      return erreur("employeId, mois et annee sont requis", 400);
    }

    const moisNum = parseInt(mois, 10);
    const anneeNum = parseInt(annee, 10);
    if (moisNum < 1 || moisNum > 12) return erreur("mois doit être compris entre 1 et 12", 400);

    const periode = `${anneeNum}-${pad(moisNum)}`;
    const jours = joursDuMois(moisNum, anneeNum);
    const premierJour = jours[0];
    const dernierJour = jours[jours.length - 1];
    const joursOuvrables = jours.filter(estOuvrable);

    // 1. Employé
    const empRes = await docClient.send(new GetCommand({
      TableName: TABLE_EMPLOYES, Key: { id: employeId },
    }));
    if (!empRes.Item) return erreur("Employé introuvable", 404);
    const employe = empRes.Item;

    // La rémunération contractuelle est mensuelle et fixe. Elle ne
    // dépend pas du nombre de jours ouvrables du mois — c'est le
    // nombre d'heures travaillées qui varie, pas le salaire de base.
    const salaireBrutMensuel =
      body.salaireBrutMensuel ?? employe.salaireBrutMensuel ?? employe.salaireBase;

    if (!salaireBrutMensuel || salaireBrutMensuel <= 0) {
      return erreur(
        `Aucun salaire mensuel défini pour ${employe.prenom} ${employe.nom}. ` +
        `Renseignez salaireBrutMensuel sur sa fiche.`,
        400
      );
    }

    const heuresContratJour = employe.heuresContrat || 8;
    const heuresMensuelles = employe.heuresMensuelles || HEURES_MENSUELLES.r48;

    // 2. Temps de travail, absences et frais
    const [pointages, conges, frais] = await Promise.all([
      chargerPointages(employeId, periode),
      chargerConges(employeId, premierJour, dernierJour),
      notesFrais.remboursementsEnAttente(employeId),
    ]);

    const { payes: congesPayes, nonPayes: congesNonPayes } =
      joursDeConge(conges, premierJour, dernierJour);

    let heuresSupplementaires = 0, heuresWeekend = 0, heuresFeries = 0;
    let minutesRetard = 0;
    const joursPresents = new Set();
    const lignes = [];

    for (const p of pointages) {
      const jour = p.date;
      const heures = p.dureeMinutes
        ? p.dureeMinutes / 60
        : (new Date(p.heureDepart) - new Date(p.heureArrivee)) / 3600000;
      if (!(heures > 0)) continue;

      joursPresents.add(jour);

      const ferie = estFerie(jour);
      const weekend = estWeekend(jour);
      const retard = ferie || weekend ? 0 : minutesDeRetard(p.heureArrivee);
      minutesRetard += retard;

      if (ferie) heuresFeries += heures;
      else if (weekend) heuresWeekend += heures;
      else heuresSupplementaires += Math.max(0, heures - heuresContratJour);

      const arrivee = partiesLocales(p.heureArrivee);
      lignes.push({
        date: jour,
        arrivee: arrivee.hhmm,
        depart: p.heureDepart ? partiesLocales(p.heureDepart).hhmm : "—",
        heures: heures.toFixed(2),
        type: ferie ? "Férié" : weekend ? "Weekend" : retard > 0 ? "Retard" : "Normal",
        retard: retard > 0 ? `${retard} min` : "—",
      });
    }

    lignes.sort((a, b) => a.date.localeCompare(b.date));

    // Une absence non justifiée est un jour ouvrable sans pointage et
    // sans congé accordé. Les congés payés et les jours fériés sont
    // rémunérés : ils ne se déduisent jamais.
    const joursAbsenceNonJustifiee = joursOuvrables.filter(
      (j) => !joursPresents.has(j) && !congesPayes.has(j) && !congesNonPayes.has(j)
    ).length;

    // ── Primes de cooptation ──
    //
    // Accordées par la RH, affectées à un mois, et reportées ici.
    //
    // La lecture renvoie aussi les primes DÉJÀ versées pour ce mois.
    // Sans cela, régénérer un bulletin — ce que permet `regenerer`,
    // pour corriger une absence ou un taux — produirait un net
    // inférieur à l'original, sans erreur et sans que rien ne
    // l'explique. Le bulletin reste ainsi une fonction de son mois :
    // deux générations donnent le même montant.
    const primesCooptation = await cooptations.primesDues(employeId, periode);

    // 3. Calcul
    const bulletin = calculerBulletin({
      salaireBrutMensuel,
      heuresMensuelles,
      nbJoursOuvrables: joursOuvrables.length,
      heuresSupplementaires,
      heuresWeekend,
      heuresFeries,
      primes: (body.primes || 0) + primesCooptation.total,
      remboursementsFrais: frais.total,
      // Le congé sans solde se retient comme une absence
      joursAbsenceNonJustifiee: joursAbsenceNonJustifiee + congesNonPayes.size,
      minutesRetard,
      deduireRetards,
      situationFamiliale: {
        chefDeFamille: employe.chefDeFamille ?? false,
        nbEnfants: employe.nbEnfants ?? 0,
      },
    });

    // 4. Enregistrement — identifiant déterministe, un bulletin par mois
    const id = `${employeId}_${periode}`;
    const numero = `BP-${periode}-${employeId.slice(0, 6).toUpperCase()}`;

    const donneesPdf = {
      employe, mois: moisNum, annee: anneeNum, numero, bulletin,
      nbJoursOuvrables: joursOuvrables.length,
      joursPresents: joursPresents.size,
      joursAbsenceNonJustifiee,
      congesPayes: congesPayes.size,
      congesNonPayes: congesNonPayes.size,
      heuresSupplementaires, heuresWeekend, heuresFeries, minutesRetard,
      notesFrais: frais.notes,
      lignes,
    };

    const pdfKey = `factures/${anneeNum}/${employeId}_${periode}.pdf`;
        await stockerPdf(pdfKey, await genererBulletinPdf({
      bulletin: {
        ...bulletin,
        numero, mois: moisNum, annee: anneeNum,
        moisLabel: `${MOIS_LABELS[moisNum]} ${anneeNum}`,
        nbJoursOuvrables: joursOuvrables.length,
        joursPresents: joursPresents.size,
        joursAbsenceNonJustifiee,
        congesPayes: congesPayes.size,
        congesNonPayes: congesNonPayes.size,
        heuresSupplementaires, heuresWeekend, heuresFeries, minutesRetard,
        majorations: MAJORATIONS,
        notesFrais: frais.notes,
        lignes,
        genereLe: new Date().toISOString(),
      },
      employe,
      entreprise,
    }));

    const facture = {
      id, numero, employeId, periode,

      // Le détail des primes de cooptation, et non le seul total : un
      // salarié qui lit « primes : 500,000 » trois mois plus tard ne
      // sait pas d'où cela vient. Ici il retrouve le nom de la
      // personne qu'il a recommandée.
      primesCooptation: primesCooptation.lignes,
      employeNom: `${employe.prenom} ${employe.nom}`,
      employePoste: employe.poste || "",
      mois: moisNum, annee: anneeNum,
      moisLabel: `${MOIS_LABELS[moisNum]} ${anneeNum}`,

      nbJoursOuvrables: joursOuvrables.length,
      joursPresents: joursPresents.size,
      joursAbsents: joursAbsenceNonJustifiee,
      congesPayes: congesPayes.size,
      congesNonPayes: congesNonPayes.size,
      heuresSupplementaires: Math.round(heuresSupplementaires * 100) / 100,
      heuresWeekend: Math.round(heuresWeekend * 100) / 100,
      heuresFeries: Math.round(heuresFeries * 100) / 100,
      minutesRetard,

      salaireBase: bulletin.salaireBase,
      tauxHoraire: bulletin.tauxHoraire,
      gains: bulletin.gains,
      retenues: bulletin.retenues,
      totalBrut: bulletin.brut,
      cotisations: bulletin.cotisations,
      netImposable: bulletin.netImposable,
      remboursements: bulletin.remboursements,
      nbNotesFrais: frais.notes.length,
      salaireNet: bulletin.net,
      fiscal: bulletin.fiscal,

      pdfKey,
      statut: "GENERE",
      genereLe: new Date().toISOString(),
      genereParId: user?.sub || user?.id || "system",
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_FACTURES,
        Item: facture,
        ...(regenerer ? {} : { ConditionExpression: "attribute_not_exists(id)" }),
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur(
          `Un bulletin existe déjà pour ${MOIS_LABELS[moisNum]} ${anneeNum}. ` +
          `Envoyez regenerer: true pour le remplacer.`,
          409
        );
      }
      throw e;
    }

    // 5. Les notes de frais sont marquées remboursées après l'écriture
    // du bulletin. Sans ce passage, elles seraient remboursées à
    // chaque génération.
    if (frais.notes.length > 0) {
      await notesFrais.marquerRemboursees(frais.notes, periode);
    }

    // Les primes de cooptation sont marquées versées au même moment et
    // pour la même raison. Marquées avant l'écriture, elles
    // disparaîtraient du bulletin suivant si la génération échouait
    // ensuite.
    //
    // Le numéro du bulletin est conservé sur chaque prime : six mois
    // plus tard, un parrain qui demande où est passée la sienne a la
    // réponse en une lecture.
    if (primesCooptation.lignes.length > 0) {
      await cooptations.marquerVersees(primesCooptation.lignes, numero);
    }

    return succes({
      facture,
      message: `Bulletin généré : ${bulletin.net.toFixed(3)} TND net`
        + (frais.total > 0 ? ` dont ${frais.total.toFixed(3)} TND de frais remboursés` : ""),
    }, 201);

  } catch (e) {
    console.error("Erreur génération bulletin:", e);
    return erreur("Erreur lors de la génération : " + e.message);
  }
};