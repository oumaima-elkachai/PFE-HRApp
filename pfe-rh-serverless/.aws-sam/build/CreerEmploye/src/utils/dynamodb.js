const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const config = {
  region: process.env.AWS_REGION || "us-east-1",
};

// Si on est en local → pointer vers DynamoDB Local
if (process.env.DYNAMODB_ENDPOINT) {
  config.endpoint = process.env.DYNAMODB_ENDPOINT;
  config.credentials = {
    accessKeyId: "local",
    secretAccessKey: "local",
  };
}

const client = new DynamoDBClient(config);
const docClient = DynamoDBDocumentClient.from(client);

module.exports = { docClient };