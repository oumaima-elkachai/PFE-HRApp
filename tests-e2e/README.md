# Vérification de bout en bout — HR UP

Teste l'API **réellement déployée**, comme un vrai utilisateur : par HTTP, avec de vrais jetons Cognito, sur les trois rôles.

Ces tests **complètent** les tests unitaires du moteur de paie, ils ne les remplacent pas.

---

## Installation

Pose le dossier `tests-e2e/` à la racine de ton dépôt, puis :

```powershell
cd tests-e2e
npm install
copy .env.exemple .env
```

Ouvre `.env` et remplis les six valeurs. `.gitignore` empêche déjà `.env` d'être versionné — **vérifie-le avant ton premier commit**.

### Où trouver l'URL de l'API

Dans le récapitulatif de ta dernière livraison GitHub Actions, ou :

```powershell
aws cloudformation describe-stacks --stack-name PfeRh-dev-Api `
  --query "Stacks[0].Outputs[?OutputKey=='UrlApi'].OutputValue" --output text
```

### Un préalable côté Cognito

Le script se connecte par `USER_PASSWORD_AUTH`. Ce flux doit être autorisé sur ton client Cognito. Console AWS → Cognito → ton groupement → App clients → *Authentication flows* → coche **ALLOW_USER_PASSWORD_AUTH**.

Si un compte est encore en `FORCE_CHANGE_PASSWORD`, connecte-toi une fois dans l'application pour fixer son mot de passe — le script te le dira explicitement.

---

## Utilisation

```powershell
npm run verifier     # tous les cas actifs
npm run securite     # seulement le cloisonnement (SEC-*)
npm run tout         # y compris les cas désactivés
node verifier.mjs --bavard        # affiche le corps des réponses
node verifier.mjs --filtre RH-02  # un seul cas
```

Le script sort en **code 1** si un cas échoue. Il est donc utilisable tel quel dans le pipeline.

---

## Adapter les cas à ton application

Tout se passe dans `cas.mjs`. Ajouter un test = ajouter une ligne.

**Neuf cas sont actifs** — ceux dont je connais les routes avec certitude : `/offres`, `/employes`, et la série de cloisonnement.

**Onze cas sont écrits mais désactivés** (`actif: false`). Ce sont des hypothèses sur tes routes métier. Ouvre ton routeur Express, relève les chemins réels, corrige-les et passe-les à `actif: true`.

Mets `actif: false` plutôt que de supprimer : un cas désactivé reste une trace de ce qui n'est pas couvert.

### La forme d'un cas

```js
{
  id: "RH-05",
  titre: "La RH consulte un bulletin précis",
  role: "rh",                       // null | "rh" | "salarie" | "candidat"
  methode: "GET",                   // GET par défaut
  route: "/bulletins/OCT-2023-001/2026-01",
  attendu: 200,                     // ou [401, 403]
  vide: false,                      // true : la réponse ne doit rien contenir
  verifier: (donnees) =>            // null = succès, sinon le message d'erreur
    donnees?.net > 0 ? null : "le net devrait être positif",
}
```

---

## Ce que ces tests prouvent

Les cas `SEC-*` sont les plus importants. Ils automatisent la série de cloisonnement du cahier de recettes :

- une route protégée refuse sans jeton ;
- un jeton malformé est refusé ;
- un jeton dont un caractère a été modifié est refusé — donc la signature est bien vérifiée ;
- la RH accède à la liste des employés ;
- un salarié et un candidat ne le peuvent pas ;
- **et le refus ne renvoie aucune donnée métier** — ce dernier point va plus loin qu'un simple contrôle de code HTTP.

Les cas `COH-*` vérifient que la route publique des offres n'expose ni offre fermée, ni champ sensible.

En soutenance, pouvoir lancer `npm run securite` devant le jury et montrer six lignes vertes vaut mieux qu'une affirmation.

---

## Brancher sur le pipeline

Deux possibilités.

**En complément de l'étape 4**, après le déploiement. Ajoute dans le job `fumee` de ton workflow :

```yaml
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - name: Verification de bout en bout
        working-directory: tests-e2e
        env:
          URL_API: ${{ needs.infrastructure.outputs.url_api }}
          COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
          RH_UTILISATEUR: ${{ secrets.TEST_RH_UTILISATEUR }}
          RH_MOTDEPASSE: ${{ secrets.TEST_RH_MOTDEPASSE }}
          SALARIE_UTILISATEUR: ${{ secrets.TEST_SALARIE_UTILISATEUR }}
          SALARIE_MOTDEPASSE: ${{ secrets.TEST_SALARIE_MOTDEPASSE }}
          CANDIDAT_UTILISATEUR: ${{ secrets.TEST_CANDIDAT_UTILISATEUR }}
          CANDIDAT_MOTDEPASSE: ${{ secrets.TEST_CANDIDAT_MOTDEPASSE }}
        run: npm ci && node verifier.mjs
```

Les mots de passe passent par les secrets du dépôt — **jamais** dans le fichier du workflow.

**Ou en local seulement**, lancé à la main avant la soutenance. C'est le plus prudent à quelques jours de l'échéance : tu ajoutes des secrets au dépôt et une étape au pipeline sans avoir le temps de les éprouver.

> ⚠️ **Mon conseil** : commence en local. Branche sur le pipeline une fois que les cas passent tous, et seulement si tu as le temps de voir une livraison complète se dérouler ensuite.

---

## Ce que ces tests ne couvrent pas

- **L'interface.** Rien n'est vérifié côté navigateur : ni affichage, ni navigation, ni reconnaissance faciale. Cela demanderait Playwright, et ce n'est pas le moment de l'ajouter.
- **Le calcul de paie.** Il reste couvert par les tests unitaires existants, qui sont plus adaptés : ils testent la fonction, pas la route.
- **La charge.** Aucun test de montée en charge.
- **Les traitements planifiés.** Le déclenchement de 8 h n'est pas vérifié ici.
