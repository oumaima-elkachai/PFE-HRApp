// lambda.js
//
// Point d'entrée de la fonction Lambda.
//
// serverless-http traduit l'évènement de l'API Gateway HTTP en requête
// Express, puis la réponse Express en réponse Lambda. L'application
// reste identique en local et sur AWS : un seul code à maintenir.

const serverless = require("serverless-http");
const app = require("./server");

const gestionnaire = serverless(app, {
  // Rend l'évènement brut accessible depuis les routes, afin que
  // identite() puisse lire les revendications Cognito validées par
  // l'autorisation de l'API.
  request(request, event, context) {
    request.evenementLambda = event;
    request.contexteLambda = context;
  },

  // Le PDF des bulletins est binaire : sans cette liste, il serait
  // renvoyé en UTF-8 et le fichier arriverait corrompu.
  binary: ["application/pdf", "application/octet-stream", "image/*"],
});

exports.handler = async (event, context) => {
  // Évite d'attendre la fin de la boucle d'évènements Node avant de
  // renvoyer la réponse : réduit sensiblement la latence perçue.
  context.callbackWaitsForEmptyEventLoop = false;

  return gestionnaire(event, context);
};