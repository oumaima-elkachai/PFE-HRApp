const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const userId = event.user?.sub;

    const resultat = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_USERS,
      Key: { id: userId },
    }));

    if (!resultat.Item) {
      return erreur("Utilisateur introuvable", 404);
    }

    const { motDePasse: _, ...userSansPassword } = resultat.Item;
    return succes({ user: userSansPassword });

  } catch (e) {
    console.error("Erreur profil:", e);
    return erreur("Impossible de recuperer le profil");
  }
};