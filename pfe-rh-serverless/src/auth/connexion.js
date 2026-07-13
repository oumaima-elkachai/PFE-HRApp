const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "pfe-rh-secret-local-2026";

exports.handler = async (event) => {
  try {
    const { email, motDePasse } = JSON.parse(event.body || "{}");

    if (!email || !motDePasse) {
      return erreur("Email et mot de passe requis", 400);
    }

    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_USERS,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
    }));

    if (resultat.Count === 0) {
      return erreur("Email ou mot de passe incorrect", 401);
    }

    const user = resultat.Items[0];

    const motDePasseValide = await bcrypt.compare(motDePasse, user.motDePasse);
    if (!motDePasseValide) {
      return erreur("Email ou mot de passe incorrect", 401);
    }

    if (user.statut !== "actif") {
      return erreur("Compte desactive", 403);
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { motDePasse: _, ...userSansPassword } = user;

    return succes({ token, expiresIn: "7d", user: userSansPassword });
    console.log("TABLE:", process.env.TABLE_USERS);
    console.log("Résultat scan:", resultat);

  } catch (e) {
    console.error("Erreur connexion:", e);
    return erreur("Erreur lors de la connexion");
  }
};