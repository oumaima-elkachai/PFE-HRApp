// src/situations/commun.js
//
// Ce module ne contient plus de logique : il réexporte les helpers
// communs du projet. Il reste comme point d'entrée pour que les quatre
// fichiers du module n'aient pas à changer leurs imports.

const { succes, erreur } = require("../utils/reponse");
const { identite, estRh, corpsDe } = require("../utils/identite");

module.exports = { succes, erreur, identite, estRh, corpsDe };