const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./src/utils/dynamodb");
const tout = async (TableName) => {
  const out = []; let k;
  do { const p = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey: k })); out.push(...(p.Items || [])); k = p.LastEvaluatedKey; } while (k);
  return out;
};
const norm = (e) => String(e || "").trim().toLowerCase();
Promise.all([tout("Users-local"), tout(process.env.TABLE_EMPLOYES || "Employes-local")]).then(([users, fiches]) => {
  const parEmail = new Map();
  for (const f of fiches) { const e = norm(f.email); if (!parEmail.has(e)) parEmail.set(e, []); parEmail.get(e).push(f); }
  const sansFiche = users.filter((u) => !parEmail.has(norm(u.email)));
  const doublonsFiches = [...parEmail.entries()].filter(([, v]) => v.length > 1);
  const uParEmail = new Map();
  for (const u of users) { const e = norm(u.email); if (!uParEmail.has(e)) uParEmail.set(e, []); uParEmail.get(e).push(u); }
  const doublonsComptes = [...uParEmail.entries()].filter(([, v]) => v.length > 1);
  console.log(`comptes : ${users.length}   fiches : ${fiches.length}`);
  // Un candidat n'a pas à avoir de fiche employé : il passe par la
  // messagerie de recrutement. Le signaler serait du bruit.
  const bloques = sansFiche.filter((u) => String(u.role || "").toUpperCase() !== "CANDIDAT");
  const candidats = sansFiche.length - bloques.length;

  console.log(`\nComptes SANS fiche employé — messagerie, congés et bulletins bloqués : ${bloques.length}`);
  bloques.forEach((u) => console.log(`  ${u.role || "?"}  ${u.email}  ${u.prenom || ""} ${u.nom || ""}`.trimEnd()));
  if (candidats) console.log(`  (+ ${candidats} candidat(s), normal : ils n'ont pas de fiche)`);
  console.log(`\nE-mails portés par plusieurs FICHES : ${doublonsFiches.length}`);
  doublonsFiches.forEach(([e, v]) => console.log(`  ${e} → ${v.map((f) => `${f.id} (${f.statut || "?"})`).join("  ")}`));
  console.log(`\nE-mails portés par plusieurs COMPTES : ${doublonsComptes.length}`);
  doublonsComptes.forEach(([e, v]) => console.log(`  ${e} → ${v.map((u) => `${u.id} (${u.prenom} ${u.nom})`).join("  ")}`));
}, (e) => console.log(e.name + " : " + e.message));