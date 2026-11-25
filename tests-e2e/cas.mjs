// Les cas de test, sous forme déclarative.
//
// Ajouter un test = ajouter une ligne. Aucun code à écrire.
//
//   id        identifiant court, repris dans le rapport
//   titre     ce que le test vérifie, en français
//   role      null (sans jeton) | "rh" | "salarie" | "candidat"
//   methode   GET par défaut
//   route     chemin après l'URL de l'API, ex. "/employes"
//   attendu   un code HTTP, ou un tableau de codes acceptables
//   corps     objet JSON à envoyer (POST/PUT)
//   vide      true si la réponse ne doit contenir aucune donnée
//   verifier  fonction (donnees, reponse) => string|null  — null = succès
//   actif     false pour désactiver sans supprimer

export const cas = [

  // ══════════════════════════════════════════════════════════════
  // DISPONIBILITÉ — l'application répond
  // ══════════════════════════════════════════════════════════════

  {
    id: "DIS-01",
    titre: "La route publique des offres répond",
    role: null,
    route: "/offres",
    attendu: 200,
  },

  // ══════════════════════════════════════════════════════════════
  // SÉCURITÉ — le cloisonnement, la série la plus importante
  // Elle automatise SEC-01 à SEC-09 du cahier de recettes.
  // ══════════════════════════════════════════════════════════════

  {
    id: "SEC-01",
    titre: "Une route protégée est refusée sans jeton",
    role: null,
    route: "/employes",
    attendu: 401,
    vide: true,
  },
  {
    id: "SEC-02",
    titre: "Un jeton malformé est refusé",
    role: null,
    route: "/employes",
    jetonBrut: "eyJhbGciOiJIUzI1NiJ9.ceci-nest-pas-un-jeton.signature",
    attendu: 401,
    vide: true,
  },
  {
    id: "SEC-03",
    titre: "Un jeton altéré d'un caractère est refusé",
    role: "rh",
    altererJeton: true,
    route: "/employes",
    attendu: 401,
    vide: true,
  },
  {
    id: "SEC-04",
    titre: "La RH accède à la liste des employés",
    role: "rh",
    route: "/employes",
    attendu: 200,
    verifier: (d) =>
      Array.isArray(d) || Array.isArray(d?.employes) || Array.isArray(d?.donnees)
        ? null
        : "la réponse ne contient pas de liste d'employés",
  },
  {
    id: "SEC-05",
    titre: "Un salarié ne peut pas lister tous les employés",
    role: "salarie",
    route: "/employes",
    attendu: [401, 403],
    vide: true,
  },
  {
    id: "SEC-06",
    titre: "Un candidat ne peut pas lister les employés",
    role: "candidat",
    route: "/employes",
    attendu: [401, 403],
    vide: true,
  },

  // ─── À compléter avec tes routes réelles ─────────────────────
  // Décommente et corrige les chemins. Mets `actif: false` sur
  // celles qui n'existent pas chez toi plutôt que de les effacer.

  {
    id: "SEC-07",
    titre: "Un candidat ne peut pas accéder aux bulletins de paie",
    role: "candidat",
    route: "/bulletins",
    attendu: [401, 403],
    vide: true,
    actif: false,            // ← passe à true quand la route est confirmée
  },
  {
    id: "SEC-08",
    titre: "Un salarié ne peut pas valider un congé",
    role: "salarie",
    methode: "POST",
    route: "/conges/TEST-ID/valider",
    corps: {},
    attendu: [401, 403, 404],
    actif: false,
  },

  // ══════════════════════════════════════════════════════════════
  // MÉTIER — les routes de chaque rôle
  // Complète les chemins depuis ton routeur Express.
  // ══════════════════════════════════════════════════════════════

  {
    id: "RH-01",
    titre: "La RH consulte les congés",
    role: "rh",
    route: "/conges",
    attendu: 200,
    actif: false,
  },
  {
    id: "RH-02",
    titre: "La RH consulte les pointages",
    role: "rh",
    route: "/pointages",
    attendu: 200,
    actif: false,
  },
  {
    id: "RH-03",
    titre: "La RH consulte les candidatures",
    role: "rh",
    route: "/candidatures",
    attendu: 200,
    actif: false,
  },
  {
    id: "RH-04",
    titre: "Le tableau de bord répond",
    role: "rh",
    route: "/tableau-de-bord",
    attendu: 200,
    actif: false,
  },

  {
    id: "EMP-01",
    titre: "Le salarié consulte son propre dossier",
    role: "salarie",
    route: "/mon-dossier",
    attendu: 200,
    actif: false,
  },
  {
    id: "EMP-02",
    titre: "Le salarié consulte ses bulletins",
    role: "salarie",
    route: "/mes-bulletins",
    attendu: 200,
    actif: false,
  },
  {
    id: "EMP-03",
    titre: "Le salarié consulte ses congés",
    role: "salarie",
    route: "/mes-conges",
    attendu: 200,
    actif: false,
  },

  {
    id: "CAN-01",
    titre: "Le candidat consulte ses candidatures",
    role: "candidat",
    route: "/mes-candidatures",
    attendu: 200,
    actif: false,
  },
  {
    id: "CAN-02",
    titre: "Le candidat voit les offres recommandées",
    role: "candidat",
    route: "/offres/recommandees",
    attendu: 200,
    actif: false,
  },

  // ══════════════════════════════════════════════════════════════
  // COHÉRENCE — ce que la réponse doit contenir
  // ══════════════════════════════════════════════════════════════

  {
    id: "COH-01",
    titre: "Les offres publiées ne contiennent aucune offre fermée",
    role: null,
    route: "/offres",
    attendu: 200,
    verifier: (d) => {
      const liste = Array.isArray(d) ? d : d?.offres ?? d?.donnees ?? [];
      if (!Array.isArray(liste)) return "format de réponse inattendu";
      const fermees = liste.filter(
        (o) => String(o?.etat ?? o?.statut ?? "").toLowerCase().includes("ferm"));
      return fermees.length
        ? `${fermees.length} offre(s) fermée(s) exposée(s) publiquement`
        : null;
    },
  },
  {
    id: "COH-02",
    titre: "La route publique des offres ne divulgue aucune donnée personnelle",
    role: null,
    route: "/offres",
    attendu: 200,
    verifier: (_d, reponse) => {
      const brut = reponse.toLowerCase();
      const fuites = ["cin", "salaire", "matricule", "motdepasse", "mot_de_passe"]
        .filter((m) => brut.includes(`"${m}"`));
      return fuites.length ? `champs sensibles exposés : ${fuites.join(", ")}` : null;
    },
  },
];
