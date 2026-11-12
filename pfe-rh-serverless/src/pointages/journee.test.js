// src/pointages/journee.test.js
//
// Tests des règles de pointage. Aucun réseau, aucun émulateur : ils
// tournent en une seconde.
//
//   node --test src/pointages/
//
// Les cas couverts ici sont ceux qu'une démonstration ne montre
// jamais : la pause qui ne doit pas compter comme du travail, la
// tolérance de retard qui doit vraiment tolérer, l'horloge client
// faussée, le double pointage, la journée commencée mais non finie.

const test = require("node:test");
const assert = require("node:assert/strict");

const J = require("./journee");

// Un jeudi, pour rester dans les jours ouvrés par défaut.
const jour = "2026-10-15";
const h = (hhmm) => `${jour}T${hhmm}:00.000Z`;

// Les heures des cas sont écrites en UTC ; le fuseau est donc passé
// explicitement à resume(). Laisser le fuseau implicite ferait
// dépendre le résultat du réglage de la machine qui lance les tests —
// c'est précisément le défaut que ces tests ont mis au jour.
const enUTC = { fuseau: "UTC" };

/** Journée construite à partir de couples [début, fin, type]. */
function journeeDe(...triplets) {
  return J.recalculer({
    employeId: "e1",
    date: jour,
    segments: triplets.map(([debut, fin, type = J.TRAVAIL]) => ({
      debut: h(debut), fin: fin ? h(fin) : null, type,
    })),
  });
}

// ── Cumul du travail ───────────────────────────────────────────────

test("le travail se cumule sur plusieurs segments", () => {
  const j = journeeDe(["08:00", "12:00"], ["13:00", "17:00"]);
  assert.equal(J.minutesTravaillees(j), 8 * 60);
});

test("la pause déjeuner ne compte pas comme du travail", () => {
  const j = journeeDe(
    ["08:00", "12:00"],
    ["12:00", "13:00", J.PAUSE_DEJEUNER],
    ["13:00", "17:00"],
  );

  assert.equal(J.minutesTravaillees(j), 8 * 60);
  assert.equal(J.minutesPause(j), 60);
});

test("une journée vide ne travaille rien", () => {
  assert.equal(J.minutesTravaillees(J.recalculer({ segments: [] })), 0);
  assert.equal(J.minutesTravaillees(null), 0);
});

// ── Compatibilité avec l'ancien modèle ─────────────────────────────

test("heureArrivee prend le premier travail, heureDepart le dernier", () => {
  const j = journeeDe(["08:30", "12:00"], ["13:00", "17:15"]);

  assert.equal(j.heureArrivee, h("08:30"));
  assert.equal(j.heureDepart, h("17:15"));
  assert.equal(j.dureeMinutes, 3 * 60 + 30 + 4 * 60 + 15);
});

test("heureDepart reste nulle tant qu'un segment est ouvert", () => {
  const j = journeeDe(["08:00", "12:00"], ["13:00", null]);

  assert.equal(j.heureDepart, null);
  assert.equal(j.statut, "EN_COURS");
});

test("une pause ne devient jamais l'heure d'arrivée", () => {
  const j = journeeDe(["07:50", "08:00", J.PAUSE_CAFE], ["08:00", "12:00"]);
  assert.equal(j.heureArrivee, h("08:00"));
});

// ── Ouverture ──────────────────────────────────────────────────────

test("première arrivée de la journée", () => {
  const r = J.ouvrir(null, { debut: h("08:05") });

  assert.equal(r.ok, true);
  assert.equal(r.journee.segments.length, 1);
  assert.equal(r.journee.statut, "EN_COURS");
});

test("repointer alors qu'un segment est ouvert est refusé", () => {
  const j = journeeDe(["08:00", null]);
  const r = J.ouvrir(j, { debut: h("09:00") });

  assert.equal(r.ok, false);
  assert.equal(r.statutHttp, 409);
  assert.match(r.motif, /déjà pointé/);
});

test("un second passage est refusé en exploitation", () => {
  const j = journeeDe(["08:00", "12:00"]);
  const r = J.ouvrir(j, { debut: h("13:00") });

  assert.equal(r.ok, false);
  assert.equal(r.statutHttp, 409);
});

test("un second passage est accepté quand les multiples sont autorisés", () => {
  const j = journeeDe(["08:00", "12:00"]);
  const r = J.ouvrir(j, { debut: h("13:00"), multiplesAutorises: true });

  assert.equal(r.ok, true);
  assert.equal(r.journee.segments.length, 2);

  // Le second segment est ouvert : son temps court jusqu'à l'instant
  // de la mesure, donc on fixe cet instant au lieu de le laisser
  // dépendre de l'heure à laquelle les tests tournent.
  assert.equal(J.minutesTravaillees(r.journee, new Date(h("15:00"))), 6 * 60);

  // Le champ stocké, lui, ne compte que le segment fermé.
  assert.equal(r.journee.dureeMinutes, 4 * 60);
});

test("un type de segment inconnu est refusé", () => {
  const r = J.ouvrir(null, { type: "SIESTE" });

  assert.equal(r.ok, false);
  assert.equal(r.statutHttp, 400);
});

test("la trace est conservée sur le segment", () => {
  const r = J.ouvrir(null, {
    debut: h("08:00"),
    trace: { methode: "FACIAL", latitude: 36.73 },
  });

  assert.equal(r.journee.segments[0].methode, "FACIAL");
  assert.equal(r.journee.segments[0].latitude, 36.73);
});

// ── Fermeture ──────────────────────────────────────────────────────

test("fermer sans arrivée renvoie 404", () => {
  const r = J.fermer(J.recalculer({ segments: [] }), { fin: h("17:00") });

  assert.equal(r.ok, false);
  assert.equal(r.statutHttp, 404);
});

test("fermer deux fois renvoie 409", () => {
  const j = journeeDe(["08:00", "17:00"]);
  const r = J.fermer(j, { fin: h("18:00") });

  assert.equal(r.ok, false);
  assert.equal(r.statutHttp, 409);
});

test("fermeture normale : durée et statut", () => {
  const j = journeeDe(["08:00", null]);
  const r = J.fermer(j, { fin: h("16:30") });

  assert.equal(r.ok, true);
  assert.equal(r.dureeMinutes, 8 * 60 + 30);
  assert.equal(r.journee.statut, "TERMINE");
  assert.equal(r.journee.heureDepart, h("16:30"));
});

test("une fin antérieure au début donne zéro, jamais une durée négative", () => {
  // Cas réel : horloge du poste client désynchronisée. Le salarié n'y
  // est pour rien, et une durée négative se retrancherait du mois.
  const j = journeeDe(["14:00", null]);
  const r = J.fermer(j, { fin: h("13:00") });

  assert.equal(r.ok, true);
  assert.equal(r.dureeMinutes, 0);
  assert.equal(J.minutesTravaillees(r.journee), 0);
});

test("fermer une pause ne ferme pas le travail", () => {
  const j = journeeDe(["08:00", "12:00"], ["12:00", null, J.PAUSE_DEJEUNER]);
  const r = J.fermer(j, { fin: h("13:00") });

  assert.equal(r.ok, true);
  assert.equal(J.minutesTravaillees(r.journee), 4 * 60);
  assert.equal(J.minutesPause(r.journee), 60);
});

// ── Retard ─────────────────────────────────────────────────────────

test("une arrivée dans la tolérance n'est pas un retard", () => {
  // 8h12 avec quinze minutes de tolérance : zéro, et non douze.
  // Sinon la tolérance ne tolère rien.
  const r = J.resume(journeeDe(["08:12", "17:00"]), null, enUTC);

  assert.equal(r.estRetard, false);
  assert.equal(r.minutesRetard, 0);
});

test("le retard se compte au-delà de la tolérance", () => {
  // 8h46 pour une référence à 8h00 : quarante-six minutes après
  // l'heure, dont quinze tolérées, donc trente-et-une comptées.
  //
  // Les deux chiffres sont renvoyés séparément : confondre « en
  // retard de » et « retard compté » est ce qui avait produit un
  // affichage de « +16 min » dans une version antérieure.
  const r = J.resume(journeeDe(["08:46", "17:00"]), null, enUTC);

  assert.equal(r.estRetard, true);
  assert.equal(r.minutesApresReference, 46);
  assert.equal(r.minutesRetard, 31);
});

test("une arrivée en avance ne donne pas de retard négatif", () => {
  const r = J.resume(journeeDe(["07:30", "17:00"]), null, enUTC);

  assert.equal(r.estRetard, false);
  assert.equal(r.minutesRetard, 0);
  assert.equal(r.minutesApresReference, 0);
});

test("le retard se mesure sur la première arrivée, pas sur un retour de pause", () => {
  const j = journeeDe(
    ["08:05", "12:00"],
    ["12:00", "13:30", J.PAUSE_DEJEUNER],
    ["13:30", "17:00"],
  );

  assert.equal(J.resume(j, null, enUTC).estRetard, false);
});

test("l'horaire de la fiche l'emporte sur le défaut", () => {
  const fiche = {
    horaireReference: { arrivee: "09:00", depart: "18:00", pauseMinutes: 60, toleranceMinutes: 5 },
  };

  const r = J.resume(journeeDe(["09:10", "18:00"]), fiche, enUTC);

  assert.equal(r.estRetard, true);
  assert.equal(r.minutesRetard, 5);
  assert.equal(r.minutesPrevues, 8 * 60);
});

// ── Heures supplémentaires ─────────────────────────────────────────

test("les heures supplémentaires ne se comptent qu'une journée terminée", () => {
  const ouverte = J.resume(journeeDe(["08:00", null]), null, enUTC);
  assert.equal(ouverte.minutesSupplementaires, 0);

  const fermee = J.resume(journeeDe(["08:00", "19:00"]), null, enUTC);
  assert.equal(fermee.minutesSupplementaires, 3 * 60);
});

test("un écart négatif ne devient pas des heures supplémentaires", () => {
  const r = J.resume(journeeDe(["08:00", "12:00"]), null, enUTC);

  assert.equal(r.ecartMinutes, -4 * 60);
  assert.equal(r.minutesSupplementaires, 0);
});

// ── Horaire de référence ───────────────────────────────────────────

test("minutesPrevues déduit la pause", () => {
  assert.equal(J.minutesPrevues(J.horaireDe(null)), 8 * 60);
});

test("un horaire mal formé retombe sur le défaut", () => {
  const h2 = J.horaireDe({ horaireReference: { arrivee: "25:99", depart: "" } });

  assert.equal(h2.arrivee, "08:00");
  assert.equal(h2.depart, "17:00");
});

test("jours ouvrés : samedi et dimanche hors planning par défaut", () => {
  assert.equal(J.estJourOuvre("2026-10-15", null), true);  // jeudi
  assert.equal(J.estJourOuvre("2026-10-17", null), false); // samedi
  assert.equal(J.estJourOuvre("2026-10-18", null), false); // dimanche
});

test("un horaire peut déclarer le samedi ouvré", () => {
  const fiche = { horaireReference: { joursOuvres: [1, 2, 3, 4, 5, 6] } };
  assert.equal(J.estJourOuvre("2026-10-17", fiche), true);
});

// ── Segment ouvert ─────────────────────────────────────────────────

test("un segment ouvert compte jusqu'à maintenant", () => {
  const j = journeeDe(["08:00", null]);
  const minutes = J.minutesTravaillees(j, new Date(h("10:30")));

  assert.equal(minutes, 2 * 60 + 30);
});

test("segmentOuvert ne rend que le segment sans fin", () => {
  assert.equal(J.segmentOuvert(journeeDe(["08:00", "12:00"])), null);
  assert.ok(J.segmentOuvert(journeeDe(["08:00", "12:00"], ["13:00", null])));
});