const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const succes = (data, code = 200) => ({
  statusCode: code,
  headers,
  body: JSON.stringify({ succes: true, data }),
});

const erreur = (message, code = 500) => ({
  statusCode: code,
  headers,
  body: JSON.stringify({ succes: false, erreur: message }),
});

const nonTrouve   = (r) => erreur(`${r} introuvable`, 404);
const nonAutorise = ()  => erreur("Accès non autorisé", 401);

module.exports = { succes, erreur, nonTrouve, nonAutorise };