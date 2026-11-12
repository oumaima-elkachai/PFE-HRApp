// src/employes/lister.js
//
// GET /employes — la liste des fiches, pour la RH.
//
// ── Ce qui a été corrigé ───────────────────────────────────────────
//
// La version précédente était :
//
//     exports.handler = async (event) => {
//       const resultat = await docClient.send(new ScanCommand({
//         TableName: process.env.TABLE_EMPLOYES,
//       }));
//       return succes({ employes: resultat.Items, total: resultat.Count });
//     };
//
// Trois problèmes, dont deux graves.
//
// 1. **Aucun contrôle d'identité.** Pas de `identite(event)`, pas de
//    rôle. Tout porteur d'un jeton valide — donc n'importe quel
//    salarié — recevait la table entière. Et le `Scan` sans projection
//    rend TOUS les champs : salaire brut, CIN, matricule CNSS. Il
//    suffisait d'ouvrir l'onglet Réseau du navigateur pour lire la
//    paie de toute l'entreprise.
//
// 2. **Pas de pagination.** Un `Scan` rend au plus 1 Mo, puis un
//    `LastEvaluatedKey` qui était ignoré. Au-delà d'environ 1 500
//    fiches la liste s'arrêtait en silence, sans erreur et sans que
//    rien ne l'indique.
//
// 3. **`resultat.Count` n'est pas le total de la table**, c'est le
//    nombre d'éléments de la page renvoyée. Le compteur affiché était
//    donc faux dès la première page pleine.
//
// ── Pourquoi réservé à la RH, et non « filtré » ────────────────────
//
// On pourrait rendre à chacun une version allégée. Ce serait un second
// annuaire, avec sa propre liste de champs à tenir à jour — et le jour
// où un champ est oublié, la fuite revient.
//
// Une seule route, un seul public : la RH. Pour les autres, il y a
// `GET /annuaire`, dont la liste de champs est écrite en dur et qui ne
// peut pas rendre un salaire même si quelqu'un l'ajoute à la fiche.

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRh } = require("../utils/identite");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

exports.handler = async (event = {}) => {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  if (!estRh(moi)) {
    return erreur(
      "La liste des salariés est réservée aux ressources humaines : "
      + "elle contient les salaires et les numéros de pièce d'identité. "
      + "Pour joindre un collègue, utilisez l'annuaire.",
      403
    );
  }

  try {
    const employes = [];
    let depart;
    let tours = 0;

    // La boucle qui manquait. Sans elle, au-delà de 1 Mo de fiches la
    // réponse était tronquée sans le dire.
    do {
      const r = await docClient.send(new ScanCommand({
        TableName: TABLE_EMPLOYES,
        ...(depart ? { ExclusiveStartKey: depart } : {}),
      }));
      employes.push(...(r.Items ?? []));
      depart = r.LastEvaluatedKey;
      tours += 1;
    } while (depart && tours < 100);

    return succes({
      employes,
      // Le vrai total : la longueur de ce qu'on rend, et non le Count
      // de la dernière page.
      total: employes.length,
      // Signale une table anormalement grande plutôt que de tronquer en
      // silence : la RH voit que la liste est incomplète.
      ...(depart ? { tronque: true } : {}),
    });
  } catch (e) {
    console.error("Erreur lister employés:", e);
    return erreur("Impossible de récupérer les employés", 500);
  }
};