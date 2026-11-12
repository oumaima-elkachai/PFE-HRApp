// src/pointages/corrections.js
//
// Oubli de pointage : le salarié déclare les heures d'un jour passé,
// la RH accepte ou refuse.
//
// ── Pourquoi ce n'est pas une simple saisie ─────────────────────────
//
// La saisie rétroactive existait déjà, réservée à la RH. Mais c'est le
// salarié qui constate l'oubli, et le faire passer par un courriel ou
// un couloir laisse la demande sans trace : on ne sait plus qui a
// demandé quoi, ni sur quelle base la RH a tranché.
//
// Ici la demande est un objet. Elle porte son auteur, sa date, les
// heures déclarées, le motif, puis la décision et son auteur. Six mois
// plus tard, une journée corrigée s'explique.
//
// ── Ce que le salarié ne peut pas faire ─────────────────────────────
//
// Déclarer ses propres heures et les voir appliquées sans contrôle
// reviendrait à supprimer le pointage. Le salarié DEMANDE ; la RH
// décide. Et le pointage n'est écrit qu'au moment de l'acceptation,
// jamais à la demande : une demande en attente ne compte pas dans les
// heures du mois.

const { randomUUID } = require("node:crypto");
const {
  GetCommand, PutCommand, QueryCommand, UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, dateAujourdhui } = require("../utils/contexte");
const employes = require("../utils/employe");
const journee = require("./journee");

const TABLE_CORRECTIONS = process.env.TABLE_CORRECTIONS || "Corrections-local";
const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

const EN_ATTENTE = "EN_ATTENTE";
const APPROUVE = "APPROUVE";
const REFUSE = "REFUSE";

// Au-delà, la demande n'est plus recevable.
//
// Trente jours couvrent l'oubli ordinaire — on s'aperçoit d'un trou en
// consultant son mois — sans permettre de reconstituer un trimestre
// entier de mémoire. Une paie déjà émise ne se corrige pas par une
// déclaration tardive : elle se corrige par un avenant, qui n'est pas
// du ressort de cet écran.
const ANCIENNETE_MAX_JOURS = 30;

/** Rôle porté par le jeton, pas par la fiche. */
function estRH(moi) {
  const roles = moi?.groups ?? moi?.roles ?? [];
  const liste = Array.isArray(roles) ? roles : [roles];
  return liste.includes("RH") || moi?.role === "RH";
}

const toJour = (v) => String(v ?? "").slice(0, 10);

/** Nombre de jours entre deux dates au format AAAA-MM-JJ. */
function ecartJours(depuis, jusqua) {
  const a = new Date(`${depuis}T12:00:00Z`);
  const b = new Date(`${jusqua}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/** « AAAA-MM-JJ » + « HH:MM » → instant ISO dans le fuseau de l'entreprise. */
function instant(jour, hhmm) {
  const minutes = journee.minutesDepuisMinuit(hhmm);
  if (minutes === null) return null;

  // Construit l'instant en interprétant l'heure dans le fuseau de
  // l'entreprise : « 08:00 » un jour donné ne désigne pas le même
  // instant à Tunis et à Londres, et c'est l'heure locale que le
  // salarié déclare.
  const naif = new Date(`${jour}T${String(hhmm).padStart(5, "0")}:00Z`);
  if (Number.isNaN(naif.getTime())) return null;

  // Décalage du fuseau ce jour-là, déduit par comparaison.
  const lues = journee.minutesLocales(naif, journee.FUSEAU_DEFAUT);
  const decalage = lues === null ? 0 : lues - minutes;

  return new Date(naif.getTime() - decalage * 60000).toISOString();
}

// ── Demande ─────────────────────────────────────────────────────────

/**
 * POST /pointages/corrections
 *
 * Corps : { date, heureArrivee: "08:00", heureDepart: "17:00", motif }
 */
exports.demander = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const date = toJour(corps.date);
    const { heureArrivee, heureDepart } = corps;
    const motif = String(corps.motif ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return erreur("Date invalide", 400);
    }

    const aujourdhui = dateAujourdhui();
    const age = ecartJours(date, aujourdhui);

    // Une demande pour aujourd'hui ou pour demain n'a pas de sens :
    // le salarié peut encore pointer.
    if (age === null || age < 1) {
      return erreur(
        "Une correction ne se demande que pour un jour passé. Pour aujourd'hui, pointez normalement.",
        400
      );
    }

    if (age > ANCIENNETE_MAX_JOURS) {
      return erreur(
        `Ce jour date de ${age} jours. Au-delà de ${ANCIENNETE_MAX_JOURS}, `
        + "adressez-vous directement aux ressources humaines.",
        400
      );
    }

    const debut = instant(date, heureArrivee);
    const fin = instant(date, heureDepart);

    if (!debut || !fin) {
      return erreur("Heures invalides. Format attendu : 08:00", 400);
    }

    if (new Date(fin) <= new Date(debut)) {
      return erreur("L'heure de départ doit suivre l'heure d'arrivée", 400);
    }

    if (motif.length < 3) {
      // Le motif n'est pas une formalité : c'est sur lui que la RH
      // tranche, et une demande sans motif la met en position de
      // refuser sans savoir pourquoi.
      return erreur("Expliquez brièvement l'oubli", 400);
    }

    // La journée existe-t-elle déjà et est-elle complète ?
    const existante = (await docClient.send(new GetCommand({
      TableName: TABLE_POINTAGES,
      Key: { employeId: fiche.id, date },
    })).catch(() => ({ Item: null }))).Item;

    // Une journée close automatiquement porte le statut TERMINE, mais
    // son heure de départ a été posée par le système faute de
    // pointage — c'est exactement le cas que cet écran doit corriger.
    // La refuser ici fermerait la seule issue au salarié qui a oublié
    // son départ, qui est l'oubli le plus fréquent.
    if (existante?.statut === "TERMINE" && !existante.clotureAutomatique) {
      return erreur(
        "Ce jour est déjà pointé et complet. Pour le corriger, adressez-vous aux ressources humaines.",
        409
      );
    }

    // Une seule demande en attente par jour : deux demandes
    // concurrentes pour la même date mettraient la RH devant un choix
    // qui n'existe pas.
    const dejaDemande = await docClient.send(new QueryCommand({
      TableName: TABLE_CORRECTIONS,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      FilterExpression: "#d = :date AND statut = :attente",
      ExpressionAttributeNames: { "#d": "date" },
      ExpressionAttributeValues: {
        ":e": fiche.id, ":date": date, ":attente": EN_ATTENTE,
      },
    })).catch(() => ({ Items: [] }));

    if (dejaDemande.Items?.length) {
      return erreur("Une demande est déjà en attente pour ce jour", 409);
    }

    const demande = {
      id: randomUUID(),
      employeId: fiche.id,
      employeNom: employes.nomComplet(fiche, moi),
      employeEmail: fiche.email,
      date,
      heureArriveeDeclaree: debut,
      heureDepartDeclaree: fin,
      motif: motif.slice(0, 500),
      statut: EN_ATTENTE,
      demandeLe: new Date().toISOString(),
      decideLe: null,
      decidePar: null,
      commentaireRH: null,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_CORRECTIONS,
      Item: demande,
    }));

    return succes({
      demande,
      message: "Demande transmise aux ressources humaines.",
    }, 201);

  } catch (e) {
    console.error("Erreur demande de correction:", e);
    return erreur("Impossible d'enregistrer la demande");
  }
};

// ── Consultation ────────────────────────────────────────────────────

/**
 * GET /pointages/corrections
 *
 * Un salarié voit les siennes. La RH voit celles en attente, ou toutes
 * avec ?statut=TOUTES. Le filtrage est fait ici, pas par le client.
 */
exports.lister = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters ?? {};

    if (estRH(moi)) {
      const statut = params.statut ?? EN_ATTENTE;

      if (statut === "TOUTES") {
        const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
        const res = await docClient.send(new ScanCommand({
          TableName: TABLE_CORRECTIONS,
        }));
        return succes({
          demandes: (res.Items ?? [])
            .sort((a, b) => String(b.demandeLe).localeCompare(a.demandeLe)),
        });
      }

      const res = await docClient.send(new QueryCommand({
        TableName: TABLE_CORRECTIONS,
        IndexName: "statut-index",
        KeyConditionExpression: "statut = :s",
        ExpressionAttributeValues: { ":s": statut },
        // Les plus récentes d'abord
        ScanIndexForward: false,
      }));

      return succes({ demandes: res.Items ?? [] });
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_CORRECTIONS,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      ExpressionAttributeValues: { ":e": fiche.id },
      ScanIndexForward: false,
    }));

    return succes({ demandes: res.Items ?? [] });

  } catch (e) {
    console.error("Erreur liste des corrections:", e);
    return erreur("Impossible de lire les demandes");
  }
};

// ── Décision ────────────────────────────────────────────────────────

/**
 * POST /pointages/corrections/:id/decision — réservé à la RH
 *
 * Corps : { approuve: true|false, commentaire }
 *
 * L'acceptation écrit le pointage. Le refus n'écrit rien, mais est
 * conservé : une demande refusée sans trace laisse le salarié sans
 * explication et la RH sans justification.
 */
exports.decider = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRH(moi)) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant de demande manquant", 400);

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const approuve = corps.approuve === true;
    const commentaire = String(corps.commentaire ?? "").trim().slice(0, 500);

    // Un refus sans explication est incompréhensible pour le salarié.
    if (!approuve && commentaire.length < 3) {
      return erreur("Expliquez le refus", 400);
    }

    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_CORRECTIONS,
      Key: { id },
    }));

    const demande = lu.Item;
    if (!demande) return erreur("Demande introuvable", 404);

    if (demande.statut !== EN_ATTENTE) {
      return erreur(`Cette demande a déjà été traitée (${demande.statut})`, 409);
    }

    const maintenant = new Date().toISOString();

    if (approuve) {
      // Le pointage est construit par les mêmes règles que le pointage
      // ordinaire : un seul segment de travail, et les champs dérivés
      // calculés par recalculer(). Écrire l'item à la main ici
      // produirait un enregistrement subtilement différent des autres,
      // que la paie traiterait autrement sans que personne ne le voie.
      const resultat = journee.ouvrir(null, {
        debut: demande.heureArriveeDeclaree,
        type: journee.TRAVAIL,
        trace: {
          methode: "CORRECTION",
          // La trace de la décision vit dans le segment : la journée
          // porte ainsi la preuve de son origine.
          correctionId: demande.id,
          declarePar: demande.employeId,
          validePar: moi.sub ?? moi.email ?? "RH",
        },
      });

      const ferme = journee.fermer(resultat.journee, {
        fin: demande.heureDepartDeclaree,
      });

      const fiche = await employes.parId?.(demande.employeId) ?? null;

      // ── Trois situations, pas une ──
      //
      // La version précédente n'écrivait que sous
      // « attribute_not_exists », c'est-à-dire seulement quand AUCUNE
      // journée n'existait. Or l'oubli le plus courant n'est pas la
      // journée entière : c'est le départ. Dans ce cas la journée
      // existe, l'écriture échouait, et la RH voyait sa validation
      // partir en erreur sans comprendre pourquoi.
      //
      //   a. Aucune journée        → création, comme avant.
      //   b. Journée ouverte, ou close automatiquement
      //                            → remplacement sous verrou de version.
      //   c. Journée réellement pointée et terminée
      //                            → refus : on n'écrase pas un pointage.
      const actuelle = (await docClient.send(new GetCommand({
        TableName: TABLE_POINTAGES,
        Key: { employeId: demande.employeId, date: demande.date },
      })).catch(() => ({ Item: null }))).Item;

      const remplacable = actuelle
        && (actuelle.statut === "EN_COURS" || actuelle.clotureAutomatique === true);

      if (actuelle && !remplacable) {
        throw Object.assign(
          new Error("Ce jour a été pointé entre-temps. Refusez la demande."),
          { statutHttp: 409 }
        );
      }

      const version = actuelle?.version ?? 0;

      await docClient.send(new PutCommand({
        TableName: TABLE_POINTAGES,
        Item: {
          employeId: demande.employeId,
          date: demande.date,

          employeNom: demande.employeNom,
          employeEmail: demande.employeEmail,
          poste: fiche?.poste ?? "",
          departement: fiche?.departement ?? "",

          creeLe: actuelle?.creeLe ?? maintenant,
          modifieLe: maintenant,
          version: version + 1,

          // Signalé comme rétroactif : une journée reconstituée après
          // coup ne doit pas se confondre avec une journée pointée.
          saisieRetroactive: true,
          correctionId: demande.id,

          // La décision de la RH remplace la clôture automatique : les
          // deux marqueurs tombent, sinon la journée resterait
          // signalée alors qu'elle vient d'être validée.
          clotureAutomatique: false,
          aVerifier: false,
          motifVerification: null,

          ...ferme.journee,
        },
        // Verrou optimiste quand la journée existe, protection contre
        // une création concurrente sinon. Dans les deux cas, personne
        // n'écrase une écriture plus récente que ce qu'il a lu.
        ConditionExpression: actuelle
          ? "version = :attendue"
          : "attribute_not_exists(employeId)",
        ...(actuelle
          ? { ExpressionAttributeValues: { ":attendue": version } }
          : {}),
      })).catch((e) => {
        if (e.name === "ConditionalCheckFailedException") {
          throw Object.assign(
            new Error("Ce jour a été pointé entre-temps. Refusez la demande."),
            { statutHttp: 409 }
          );
        }
        throw e;
      });
    }

    const majour = await docClient.send(new UpdateCommand({
      TableName: TABLE_CORRECTIONS,
      Key: { id },
      UpdateExpression:
        "SET statut = :s, decideLe = :d, decidePar = :p, commentaireRH = :c",
      // Protège contre deux décisions simultanées : la seconde échoue
      // plutôt que d'écraser la première.
      ConditionExpression: "statut = :attente",
      ExpressionAttributeValues: {
        ":s": approuve ? APPROUVE : REFUSE,
        ":d": maintenant,
        ":p": moi.email ?? moi.sub ?? "RH",
        ":c": commentaire || null,
        ":attente": EN_ATTENTE,
      },
      ReturnValues: "ALL_NEW",
    }));

    return succes({
      demande: majour.Attributes,
      message: approuve
        ? `Journée du ${demande.date} enregistrée pour ${demande.employeNom}.`
        : "Demande refusée. Le salarié en est informé.",
    });

  } catch (e) {
    if (e.statutHttp) return erreur(e.message, e.statutHttp);
    console.error("Erreur décision de correction:", e);
    return erreur("Impossible d'enregistrer la décision");
  }
};

module.exports.EN_ATTENTE = EN_ATTENTE;
module.exports.APPROUVE = APPROUVE;
module.exports.REFUSE = REFUSE;
module.exports.ANCIENNETE_MAX_JOURS = ANCIENNETE_MAX_JOURS;
module.exports.instant = instant;
module.exports.ecartJours = ecartJours;