const axios = require('axios');

const API_URL = 'http://localhost:3000';

// ═══════════════════════════════════════════════
// 🧑‍💼 DONNÉES DES EMPLOYÉS DE TEST
// ═══════════════════════════════════════════════
const EMPLOYES_TEST = [
  {
    nom: 'Dupont',
    prenom: 'Marie',
    email: 'marie.dupont@exemple.com',
    motDePasse: 'Marie2026!',
    telephone: '+216 98 765 432',
    dateNaissance: '1990-05-15',
    adresse: '12 Rue de la Liberté, Tunis',
    poste: 'Développeur Frontend',
    departement: 'Informatique',
    dateEmbauche: '2023-01-10',
    salaire: 3200,
    role: 'EMPLOYE',
  },
  {
    nom: 'Martin',
    prenom: 'Lucas',
    email: 'lucas.martin@exemple.com',
    motDePasse: 'Lucas2026!',
    telephone: '+216 97 654 321',
    dateNaissance: '1988-08-22',
    adresse: '45 Avenue Habib Bourguiba, Tunis',
    poste: 'Développeur Backend',
    departement: 'Informatique',
    dateEmbauche: '2022-06-01',
    salaire: 3500,
    role: 'EMPLOYE',
  },
  {
    nom: 'Bernard',
    prenom: 'Sophie',
    email: 'sophie.bernard@exemple.com',
    motDePasse: 'Sophie2026!',
    telephone: '+216 96 543 210',
    dateNaissance: '1992-03-10',
    adresse: '78 Rue de Carthage, Tunis',
    poste: 'Chef de projet',
    departement: 'Informatique',
    dateEmbauche: '2021-09-15',
    salaire: 4200,
    role: 'EMPLOYE',
  },
  {
    nom: 'Dubois',
    prenom: 'Thomas',
    email: 'thomas.dubois@exemple.com',
    motDePasse: 'Thomas2026!',
    telephone: '+216 95 432 109',
    dateNaissance: '1985-11-30',
    adresse: '23 Boulevard Mohamed V, Tunis',
    poste: 'Comptable',
    departement: 'Finance',
    dateEmbauche: '2020-03-20',
    salaire: 2800,
    role: 'EMPLOYE',
  },
  {
    nom: 'Lefevre',
    prenom: 'Emma',
    email: 'emma.lefevre@exemple.com',
    motDePasse: 'Emma2026!',
    telephone: '+216 94 321 098',
    dateNaissance: '1995-07-18',
    adresse: '56 Rue de la République, Tunis',
    poste: 'Responsable RH',
    departement: 'Ressources Humaines',
    dateEmbauche: '2023-05-10',
    salaire: 3800,
    role: 'EMPLOYE',
  },
  {
    nom: 'Moreau',
    prenom: 'Pierre',
    email: 'pierre.moreau@exemple.com',
    motDePasse: 'Pierre2026!',
    telephone: '+216 93 210 987',
    dateNaissance: '1991-02-25',
    adresse: '89 Avenue de France, Tunis',
    poste: 'Commercial',
    departement: 'Ventes',
    dateEmbauche: '2022-11-01',
    salaire: 3000,
    role: 'EMPLOYE',
  },
  {
    nom: 'Laurent',
    prenom: 'Julie',
    email: 'julie.laurent@exemple.com',
    motDePasse: 'Julie2026!',
    telephone: '+216 92 109 876',
    dateNaissance: '1993-09-12',
    adresse: '34 Rue El Jazira, Tunis',
    poste: 'Designer UI/UX',
    departement: 'Design',
    dateEmbauche: '2023-02-14',
    salaire: 3300,
    role: 'EMPLOYE',
  },
  {
    nom: 'Simon',
    prenom: 'Alexandre',
    email: 'alexandre.simon@exemple.com',
    motDePasse: 'Alexandre2026!',
    telephone: '+216 91 098 765',
    dateNaissance: '1987-12-05',
    adresse: '67 Avenue de la Victoire, Tunis',
    poste: 'Analyste financier',
    departement: 'Finance',
    dateEmbauche: '2021-04-20',
    salaire: 3600,
    role: 'EMPLOYE',
  },
];

// ═══════════════════════════════════════════════
// 🔑 FONCTION : Connexion admin RH
// ═══════════════════════════════════════════════
async function connexionAdmin() {
  try {
    const response = await axios.post(`${API_URL}/auth/connexion`, {
      email: 'rh@entreprise.tn',
      motDePasse: 'admin123',
    });
    console.log('✅ Admin RH connecté');
    return response.data.data.token;
  } catch (error) {
    console.error('❌ Erreur connexion admin:', error.response?.data || error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════
// 👤 FONCTION : Créer un employé
// ═══════════════════════════════════════════════
async function creerEmploye(tokenRH, employe) {
  try {
    const response = await axios.post(
      `${API_URL}/employes`,
      employe,
      {
        headers: { Authorization: `Bearer ${tokenRH}` },
      }
    );
    console.log(`✅ Employé créé: ${employe.prenom} ${employe.nom} (${employe.email})`);
    return response.data.data.employe;
  } catch (error) {
    console.error(`❌ Erreur création ${employe.email}:`, error.response?.data || error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
// 🔐 FONCTION : Connexion employé
// ═══════════════════════════════════════════════
async function connexionEmploye(email, motDePasse) {
  try {
    const response = await axios.post(`${API_URL}/auth/connexion`, {
      email,
      motDePasse,
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`❌ Erreur connexion ${email}:`, error.response?.data || error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
// ⏰ FONCTION : Check-in
// ═══════════════════════════════════════════════
async function checkin(tokenEmploye, nom) {
  try {
    const response = await axios.post(
      `${API_URL}/pointages/arrivee`,
      {},
      {
        headers: { Authorization: `Bearer ${tokenEmploye}` },
      }
    );
    
    const pointageId = response.data.data.pointage.id;
    const heureArrivee = response.data.data.pointage.heureArrivee;
    
    console.log(`  ⏰ Check-in: ${nom} à ${new Date(heureArrivee).toLocaleTimeString('fr-FR')}`);
    return pointageId;
  } catch (error) {
    console.error(`  ❌ Erreur check-in ${nom}:`, error.response?.data || error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
// 🏁 FONCTION : Check-out
// ═══════════════════════════════════════════════
async function checkout(tokenEmploye, nom) {
  try {
    const response = await axios.post(
      `${API_URL}/pointages/depart`,
      {},
      {
        headers: { Authorization: `Bearer ${tokenEmploye}` },
      }
    );
    
    const duree = response.data.data.dureeMinutes;
    const h = Math.floor(duree / 60);
    const m = duree % 60;
    
    console.log(`  🏁 Check-out: ${nom} — Durée: ${h}h${String(m).padStart(2, '0')}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Erreur check-out ${nom}:`, error.response?.data || error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
// 📅 FONCTION : Créer pointage historique
// ═══════════════════════════════════════════════
async function creerPointageHistorique(tokenRH, employeId, date, heureArrivee, heureDepart) {
  try {
    const response = await axios.post(
      `${API_URL}/pointages/historique/create`,
      {
        employeId,
        date,
        heureArrivee,
        heureDepart,
      },
      {
        headers: { Authorization: `Bearer ${tokenRH}` },
      }
    );
    return true;
  } catch (error) {
    console.error('Erreur création pointage historique:', error.response?.data || error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
// 🎲 FONCTION : Générer heure aléatoire
// ═══════════════════════════════════════════════
function randomTime(minH, minM, maxH, maxM) {
  const min = minH * 60 + minM;
  const max = maxH * 60 + maxM;
  const random = Math.floor(Math.random() * (max - min + 1)) + min;
  const h = Math.floor(random / 60);
  const m = random % 60;
  return { h, m };
}

// ═══════════════════════════════════════════════
// 🎯 FONCTION : Attendre X secondes
// ═══════════════════════════════════════════════
function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// ═══════════════════════════════════════════════
// 🚀 SCRIPT PRINCIPAL
// ═══════════════════════════════════════════════
async function main() {
  console.log('\n🚀 ═══════════════════════════════════════════════');
  console.log('   CRÉATION EMPLOYÉS + CHECK-IN/OUT DE TEST');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // 1️⃣ Connexion admin
    console.log('1️⃣ Connexion admin RH...');
    const tokenRH = await connexionAdmin();
    console.log('');

    // 2️⃣ Créer les employés
    console.log('2️⃣ Création des employés...');
    const employes = [];
    for (const emp of EMPLOYES_TEST) {
      const created = await creerEmploye(tokenRH, emp);
      if (created) {
        employes.push({ ...emp, id: created.id });
      }
      await sleep(0.5);
    }
    console.log(`\n✅ ${employes.length} employés créés avec succès\n`);

    // 3️⃣ Simuler des pointages pour aujourd'hui
    console.log('3️⃣ Simulation pointages du jour...\n');
    
    for (const emp of employes) {
      console.log(`👤 ${emp.prenom} ${emp.nom}:`);
      
      const token = await connexionEmploye(emp.email, emp.motDePasse);
      if (!token) continue;

      const scenario = Math.random();

      if (scenario < 0.7) {
        // 70% : Check-in + Check-out (journée complète)
        await checkin(token, emp.prenom);
        await sleep(2);
        await checkout(token, emp.prenom);
      } else if (scenario < 0.9) {
        // 20% : Check-in seulement (en cours)
        await checkin(token, emp.prenom);
        console.log(`  🔵 Statut: EN_COURS`);
      } else {
        // 10% : Pas de pointage (absent)
        console.log(`  ⚠️ Absent aujourd'hui`);
      }

      console.log('');
      await sleep(0.5);
    }

    // 4️⃣ Génération pointages historiques (7 derniers jours)
    console.log('4️⃣ Génération pointages historiques (7 derniers jours)...\n');

    for (let i = 1; i <= 7; i++) { // Commencer à 1 pour éviter aujourd'hui
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      console.log(`📅 ${dateStr}:`);
      
      for (const emp of employes) {
        if (Math.random() > 0.2) { // 80% de présence
          const arrivee = randomTime(8, 0, 9, 30);
          const depart = randomTime(17, 0, 19, 0);
          
          const heureArrivee = new Date(date);
          heureArrivee.setHours(arrivee.h, arrivee.m, 0, 0);
          
          const heureDepart = new Date(date);
          heureDepart.setHours(depart.h, depart.m, 0, 0);
          
          await creerPointageHistorique(
            tokenRH,
            emp.id,
            dateStr,
            heureArrivee.toISOString(),
            heureDepart.toISOString()
          );
          
          console.log(`  ✅ ${emp.prenom}: ${arrivee.h}:${String(arrivee.m).padStart(2,'0')} → ${depart.h}:${String(depart.m).padStart(2,'0')}`);
        }
      }
      console.log('');
    }

    // 5️⃣ Afficher récapitulatif
    console.log('\n✅ ═══════════════════════════════════════════════');
    console.log('   RÉCAPITULATIF DES COMPTES CRÉÉS');
    console.log('═══════════════════════════════════════════════\n');
    
    console.log('📧 ADMIN RH:');
    console.log('   Email        : rh@entreprise.tn');
    console.log('   Mot de passe : admin123\n');
    
    console.log('👥 EMPLOYÉS:');
    employes.forEach(emp => {
      console.log(`   ${emp.prenom} ${emp.nom} (${emp.poste})`);
      console.log(`   Email        : ${emp.email}`);
      console.log(`   Mot de passe : ${emp.motDePasse}`);
      console.log(`   Département  : ${emp.departement}\n`);
    });

    console.log('✅ Script terminé avec succès !');
    console.log('🌐 Vous pouvez maintenant vous connecter sur http://localhost:5173\n');

  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════
// 🎬 EXÉCUTION
// ═══════════════════════════════════════════════
main();