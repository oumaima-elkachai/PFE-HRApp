// dedoublonner-fiches.js
//
// À poser à la RACINE de pfe-rh-serverless.
//
//   node dedoublonner-fiches.js              → simulation, ne supprime RIEN
//   node dedoublonner-fiches.js --appliquer   → supprime les doublons sûrs
//
// Deux fiches qui portent le même e-mail empêchent de savoir à qui
// attribuer un message, un congé ou un bulletin. Mais une suppression
// est irréversible : le script compte d'abord combien de données
// renvoient à chaque fiche, et ne supprime que celles auxquelles RIEN ne
// renvoie. Par défaut il ne fait que montrer ce qu'il ferait.

const { ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

if (!process.env.DYNAMODB_ENDPOINT && !process.argv.includes("--aws")) {
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
}

const { docClient } = require("./src/utils/dynamodb");

const APPLIQUER = process.argv.includes("--appliquer");
const TABLE_FICHES = process.env.TABLE_EMPLOYES || "Employes-local";

// Les tables où une fiche peut être référencée. Une table absente est
// ignorée sans bruit : toutes ne sont pas forcément créées.
const TABLES_LIEES = [
  process.env.TABLE_CONGES || "Conges-local",
  process.env.TABLE_FACTURES || "Factures-local",
  process.env.TABLE_POINTAGES || "Pointages-local",
  process.env.TABLE_NOTES_FRAIS || "NotesFrais-local",
  process.env.TABLE_MESSAGES_INTERNES || "MessagesInternes-local",
  "Biometrie-local", "DemandesDocuments-local", "Corrections-local",
  "Evenements-local", "DemandesSituation-local",
];

const norm = (e) => String(e || "").trim().toLowerCase();

/** Scan complet : un Scan s'arrête à 1 Mo, la boucle est obligatoire. */
async function toutLire(TableName) {
  const items = [];
  let depart;
  do {
    const page = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey: depart }));
    items.push(...(page.Items || []));
    depart = page.LastEvaluatedKey;
  } while (depart);
  return items;
}

/**
 * Compte les références à chaque identifiant de fiche.
 *
 * On ne devine pas les noms de champs (`employeId`, `expediteurId`,
 * `destinataireId`…) : on compare toutes les valeurs textuelles. Plus lent,
 * mais aucune référence ne passe à travers parce qu'un champ s'appelle
 * autrement que prévu.
 */
function compterDans(items, ids) {
  const compte = new Map([...ids].map((id) => [id, 0]));
  for (const item of items) {
    const vues = new Set();
    for (const v of Object.values(item)) {
      if (typeof v === "string" && compte.has(v)) vues.add(v);
    }
    for (const id of vues) compte.set(id, compte.get(id) + 1);
  }
  return compte;
}

(async () => {
  console.log(`\nMode : ${APPLIQUER ? "SUPPRESSION EFFECTIVE" : "simulation (aucune suppression)"}\n`);

  const fiches = await toutLire(TABLE_FICHES);

  const groupes = new Map();
  for (const f of fiches) {
    const e = norm(f.email);
    if (!e) continue;
    if (!groupes.has(e)) groupes.set(e, []);
    groupes.get(e).push(f);
  }

  const doublons = [...groupes.entries()].filter(([, v]) => v.length > 1);
  if (doublons.length === 0) {
    console.log("Aucun e-mail n'est porté par plusieurs fiches. Rien à faire.");
    return;
  }

  const idsConcernes = new Set(doublons.flatMap(([, v]) => v.map((f) => f.id)));

  // Références, table par table.
  const references = new Map([...idsConcernes].map((id) => [id, 0]));
  const detail = new Map([...idsConcernes].map((id) => [id, []]));

  for (const table of TABLES_LIEES) {
    let items;
    try {
      items = await toutLire(table);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") continue;
      throw e;
    }
    const compte = compterDans(items, idsConcernes);
    for (const [id, n] of compte) {
      if (n > 0) {
        references.set(id, references.get(id) + n);
        detail.get(id).push(`${table.replace("-local", "")}:${n}`);
      }
    }
  }

  let aSupprimer = [];
  let groupesBloques = 0;

  for (const [email, liste] of doublons) {
    // On garde la fiche la plus référencée ; à égalité la plus ancienne ;
    // à égalité encore, le plus petit identifiant, pour que deux
    // exécutions donnent le même résultat.
    const classees = [...liste].sort((a, b) =>
      (references.get(b.id) - references.get(a.id))
      || String(a.creeLe || "").localeCompare(String(b.creeLe || ""))
      || String(a.id).localeCompare(String(b.id)));

    const garde = classees[0];
    const autres = classees.slice(1);
    const liees = autres.filter((f) => references.get(f.id) > 0);

    console.log(`${email}`);
    console.log(`  garder   ${garde.id}  ${garde.prenom || ""} ${garde.nom || ""}`.trimEnd()
      + `  (${references.get(garde.id)} référence(s)${detail.get(garde.id).length ? " — " + detail.get(garde.id).join(" ") : ""})`);

    for (const f of autres) {
      const n = references.get(f.id);
      console.log(`  ${n > 0 ? "GARDÉE  " : "supprimer"} ${f.id}  ${f.prenom || ""} ${f.nom || ""}`.trimEnd()
        + `  (${n} référence(s)${detail.get(f.id).length ? " — " + detail.get(f.id).join(" ") : ""})`);
    }

    if (liees.length > 0) {
      groupesBloques++;
      console.log(`  ⚠ ${liees.length} doublon(s) portent des données. Supprimer une de ces fiches`);
      console.log(`    orphelinerait des congés, bulletins ou pointages. À reprendre à la main.`);
    }

    aSupprimer.push(...autres.filter((f) => references.get(f.id) === 0));
    console.log("");
  }

  console.log(`${doublons.length} e-mail(s) en doublon, ${aSupprimer.length} fiche(s) supprimables sans risque`
    + (groupesBloques ? `, ${groupesBloques} groupe(s) à reprendre à la main.` : "."));

  if (!APPLIQUER) {
    console.log(`\nRien n'a été supprimé. Pour appliquer :\n\n    node dedoublonner-fiches.js --appliquer\n`);
    return;
  }

  if (aSupprimer.length === 0) { console.log("\nRien à supprimer."); return; }

  for (const f of aSupprimer) {
    await docClient.send(new DeleteCommand({ TableName: TABLE_FICHES, Key: { id: f.id } }));
    console.log(`  supprimée : ${f.id}  ${f.prenom || ""} ${f.nom || ""}`.trimEnd());
  }
  console.log(`\n✓ ${aSupprimer.length} fiche(s) supprimée(s).`);
})().catch((e) => { console.error(`\n✗ ${e.name} : ${e.message}`); process.exit(1); });