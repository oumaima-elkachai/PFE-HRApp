// src/pages/LandingPage.tsx
//
// Page d'accueil publique de HR UP, d'après le système « Luminous HR
// Executive » : obsidienne, verre dépoli, dégradé indigo-violet, or
// impérial et émeraude. Trois langues avec passage automatique en
// écriture droite-à-gauche pour l'arabe, et deux ambiances.
//
// ── Ce que la maquette proposait et qui n'est pas repris ───────────
//
// Trois blocs ont été remplacés plutôt que construits :
//
//  · les témoignages signés de personnes nommées, avec notes et
//    fonctions. Ce sont des avis inventés présentés comme réels ;
//  · « +400 entreprises · 50 000 collaborateurs », des références
//    clientes qui n'existent pas ;
//  · l'essai gratuit de trente jours, une offre commerciale qui
//    n'existe pas non plus.
//
// À la place : les mesures réelles de la campagne biométrique, les
// défauts trouvés par les tests, et un estimateur dont le visiteur
// fixe lui-même les hypothèses — un modèle affiché comme tel n'est pas
// une affirmation fausse.
//
// ── Deux corrections de contraste sur la maquette ──────────────────
//
// Le bouton principal posait du blanc sur un dégradé #6366F1 → #8B5CF6,
// soit 4,47 et 4,23 : sous le seuil de 4,5, et franchement insuffisant
// du côté violet. Le dégradé est assombri en #5A5CE8 → #7C4DEE, qui
// donne 5,08 et 5,06 tout en gardant la teinte voulue.
//
// Et en mode clair, l'or et l'émeraude de la maquette ne passaient pas
// non plus en texte. Ils sont assombris — seulement en mode clair,
// puisque sur fond obsidienne les valeurs d'origine sont excellentes.
//
// ── L'ambiance est locale, volontairement ──────────────────────────
//
// Le choix clair/sombre vit sur la racine de CETTE page, dans un
// attribut data-ambiance, et non sur <html>. Une page vitrine n'a
// aucune raison d'imposer son ambiance à l'application connectée, et
// l'isoler évite qu'elle se batte avec le ThemeProvider.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

// ════════════════════════════════════════════════════════════════════
// LANGUES
// ════════════════════════════════════════════════════════════════════

type Langue = 'fr' | 'en' | 'ar';

const LANGUES: { code: Langue; nom: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'fr', nom: 'FR', dir: 'ltr' },
  { code: 'en', nom: 'EN', dir: 'ltr' },
  { code: 'ar', nom: 'AR', dir: 'rtl' },
];

const FR = {
  'nav.modules': 'Modules',
  'nav.roles': 'Rôles',
  'nav.mesures': 'Mesures',
  'nav.impact': 'Impact',
  'nav.donnees': 'Confidentialité',
  'nav.connexion': 'Connexion',
  'nav.compte': 'Créer un compte',
  'nav.ambiance': 'Changer d’ambiance',
  'nav.langue': 'Langue',

  'annonce.texte': 'Pointage géolocalisé, reconnaissance faciale et oubli de pointage',
  'annonce.badge': 'Nouveau',

  'hero.accroche': 'Le travail tel qu’il s’est passé.',
  'hero.titre1': 'La gestion RH,',
  'hero.titre2': 'sans la paperasse',
  'hero.titre3': 'qui va avec.',
  'hero.chapeau': 'Pointage, congés, paie, recrutement et documents du '
    + 'personnel dans une seule application. Une journée s’y enregistre '
    + 'comme une suite de moments, pas comme deux heures dans une case.',
  'hero.cta1': 'Accéder à mon espace',
  'hero.cta2': 'Postuler à une offre',
  'hero.preuve': '8 modules · 30 tests sur les règles de temps · aucune photographie conservée',

  'demo.titre': 'Mardi 14 octobre',
  'demo.sous': 'Journée d’exemple, en direct',
  'demo.encours': 'En cours',
  'demo.travaillees': 'travaillées, pauses déduites',
  'demo.objectif': 'de l’objectif de 8 h',
  'demo.travail': 'Travail',
  'demo.dejeuner': 'Déjeuner',
  'demo.pause': 'Pause',
  'demo.verif': 'Visage vérifié',
  'demo.distance': 'Distance au gabarit',
  'demo.site': 'Site · 34 m du point de référence',

  'mod.sur': 'Architecture tout-en-un',
  'mod.titre': 'Huit modules, un seul endroit où chercher',
  'mod.texte': 'Un salarié y suit son temps, ses congés, ses bulletins et '
    + 'ses remboursements. Les ressources humaines y mènent le '
    + 'recrutement, la paie et les demandes.',

  'mod.1.t': 'Pointage et temps de travail',
  'mod.1.d': 'Arrivée, départ, pauses. La journée se lit comme elle s’est passée.',
  'mod.1.tag': 'QR · Géolocalisation · Visage',
  'mod.2.t': 'Recrutement et classement',
  'mod.2.d': 'Offres, candidatures, entretiens, et un classement par offre.',
  'mod.2.tag': 'Pipeline · Bedrock',
  'mod.3.t': 'Paie et documents',
  'mod.3.d': 'Bulletins et attestations générés en PDF, à la demande.',
  'mod.3.tag': 'PDF · Archivage',
  'mod.4.t': 'Congés et absences',
  'mod.4.d': 'Soldes recalculés, justificatifs joints, décisions tracées.',
  'mod.4.tag': 'Soldes · Validation',
  'mod.5.t': 'Notes de frais',
  'mod.5.d': 'Justificatif photographié, remboursement suivi jusqu’au virement.',
  'mod.5.tag': 'Pièces jointes',
  'mod.6.t': 'Agenda et entretiens',
  'mod.6.d': 'Rendez-vous partagés, exportables vers le calendrier personnel.',
  'mod.6.tag': 'Export iCalendar',
  'mod.7.t': 'Évaluations',
  'mod.7.d': 'Quiz techniques générés, passés en ligne, corrigés automatiquement.',
  'mod.7.tag': 'Quiz · Sessions',
  'mod.8.t': 'Messagerie interne',
  'mod.8.d': 'Les échanges restent attachés au dossier qui les concerne.',
  'mod.8.tag': 'Fils · Notifications',

  'role.sur': 'Une vue par métier',
  'role.titre': 'Chacun voit ce qui le concerne, et rien d’autre',
  'role.texte': 'Les rôles sont portés par des groupes et revérifiés côté '
    + 'serveur à chaque appel — jamais seulement masqués dans l’interface.',
  'role.rh': 'Ressources humaines',
  'role.sal': 'Salariés',
  'role.cand': 'Candidats',
  'role.rh.1': 'Tableau de bord des présences, retards et absences du jour',
  'role.rh.2': 'Validation des congés, des oublis de pointage et des notes de frais',
  'role.rh.3': 'Recrutement de l’offre à la décision, avec classement des candidatures',
  'role.rh.4': 'Génération des bulletins et des attestations',
  'role.sal.1': 'Pointer son arrivée, ses pauses et son départ',
  'role.sal.2': 'Suivre ses heures de la semaine et du mois',
  'role.sal.3': 'Demander un congé, une attestation, un remboursement',
  'role.sal.4': 'Activer ou effacer sa reconnaissance faciale, librement',
  'role.cand.1': 'Consulter les offres ouvertes et postuler en ligne',
  'role.cand.2': 'Passer les évaluations techniques',
  'role.cand.3': 'Suivre l’avancement de sa candidature sans relancer',
  'role.cand.4': 'Recevoir ses convocations d’entretien dans son calendrier',
  'role.graphe': 'Taux de présence, six derniers mois',

  'jeu.sur': 'Engagement',
  'jeu.titre': 'La ponctualité reconnue, pas surveillée',
  'jeu.texte': 'Les distinctions portent sur des faits que le salarié peut '
    + 'vérifier lui-même dans son propre relevé. Rien n’est calculé sur '
    + 'des données qu’il ne voit pas.',
  'jeu.1.t': 'Maître du timing',
  'jeu.1.d': 'Quatre semaines consécutives sans retard au-delà de la tolérance.',
  'jeu.2.t': 'Zéro oubli',
  'jeu.2.d': 'Un mois complet sans demande de correction de pointage.',
  'jeu.3.t': 'Régularité',
  'jeu.3.d': 'Des heures stables d’une semaine à l’autre, sur un trimestre.',

  'calc.sur': 'Estimation',
  'calc.titre': 'Combien de temps le pointage vous coûte-t-il ?',
  'calc.texte': 'Un modèle, pas une mesure. Les hypothèses sont les vôtres '
    + 'et restent affichées : c’est à cette condition qu’un chiffre de ce '
    + 'genre veut dire quelque chose.',
  'calc.salaries': 'Salariés',
  'calc.secondes': 'Secondes par pointage',
  'calc.cout': 'Coût horaire chargé',
  'calc.res1': 'Heures par mois',
  'calc.res2': 'Coût mensuel',
  'calc.res3': 'Économie si le geste tombe à 4 s',
  'calc.note': 'Base : deux pointages par jour ouvré, vingt-deux jours par '
    + 'mois. Les quatre secondes du second calcul correspondent à la voie '
    + 'faciale mesurée en conditions d’essai.',

  'mes.sur': 'Mesures relevées pendant la mise au point',
  'mes.titre': 'Déplacez le seuil, et voyez qui entre',
  'mes.texte': 'Le modèle ne décide rien : il mesure une distance entre deux '
    + 'visages. C’est nous qui choisissons à partir de quelle distance deux '
    + 'visages sont la même personne. La documentation propose 0,60.',
  'mes.acceptes': 'personnes non autorisées acceptées',
  'mes.refuses': 'titulaires refusés à tort',
  'mes.aucun': 'Aucune personne non autorisée ne passe.',
  'mes.passerait': 'passerait à ce seuil.',
  'mes.lunettes': 'Les titulaires refusés portent des lunettes.',
  'mes.retenu': 'Seuil retenu — 0,30',
  'mes.doc': 'Documentation — 0,60',
  'mes.reglage': 'Seuil d’acceptation',
  'mes.doc.court': '0,60 — documentation',
  'mes.1': 'Titulaire, sans lunettes',
  'mes.2': 'Titulaire, autre séance',
  'mes.3': 'Titulaire, avec lunettes',
  'mes.4': 'Tiers, meilleur cas',
  'mes.5': 'Personne ressemblante',
  'mes.6': 'Tiers, barbe',
  'mes.l1.t': '0,60 acceptait une sosie',
  'mes.l1.d': 'À la valeur de la documentation, la personne la plus '
    + 'ressemblante du jeu d’essai — 0,4509 — passait pour la titulaire.',
  'mes.l2.t': 'Les lunettes déplacent la mesure',
  'mes.l2.d': 'La titulaire avec lunettes se mesure à 0,3913, plus loin '
    + 'd’elle-même que le meilleur tiers à 0,3587.',
  'mes.l3.t': 'D’où les gabarits par apparence',
  'mes.l3.d': 'Un gabarit par situation habituelle, et la comparaison '
    + 'retient la meilleure. Un constat, pas une intuition.',

  'don.sur': 'Données personnelles',
  'don.titre': 'Six engagements tenus par le code',
  'don.texte': 'Le traitement de données biométriques relève de la loi '
    + 'tunisienne 2004-63 et demande l’autorisation de l’INPDP. Chacun de '
    + 'ces points correspond à une décision technique vérifiable.',
  'don.1.t': 'Aucune image conservée',
  'don.1.d': 'Seul le gabarit — 128 nombres — est enregistré. On ne '
    + 'reconstruit pas un visage à partir de ces nombres.',
  'don.2.t': 'Aucune recherche par visage',
  'don.2.d': 'La table biométrique n’a pas d’index secondaire. La question '
    + '« à qui ressemble ce visage ? » ne peut pas être posée.',
  'don.3.t': 'Invisible pour les RH',
  'don.3.d': 'Le gabarit n’est lisible par aucun écran d’administration. '
    + 'Le salarié seul l’enregistre et l’efface.',
  'don.4.t': 'Effacement à la sortie',
  'don.4.d': 'La fin de contrat déclenche la suppression du gabarit, après '
    + 'l’archivage du dossier.',
  'don.5.t': 'Consentement dissociable',
  'don.5.d': 'Refuser la reconnaissance faciale ne prive de rien : le code '
    + 'et la géolocalisation restent la voie principale.',
  'don.6.t': 'Notice versionnée',
  'don.6.d': 'Une modification du dispositif invalide les consentements '
    + 'antérieurs et les redemande.',

  'fin.titre': 'Entrer dans votre espace',
  'fin.sal.t': 'Je travaille dans l’entreprise',
  'fin.sal.d': 'Votre compte est créé par les ressources humaines. Vous y '
    + 'trouvez votre pointage, vos congés, vos bulletins et vos frais.',
  'fin.sal.b': 'Accéder à mon espace',
  'fin.sal.l': 'Mot de passe oublié',
  'fin.can.t': 'Je cherche un poste',
  'fin.can.d': 'Créez un compte candidat pour postuler, passer les '
    + 'évaluations et suivre votre candidature sans relancer personne.',
  'fin.can.b': 'Créer un compte candidat',
  'fin.can.l': 'Voir les offres ouvertes',

  'pied.produit': 'Produit',
  'pied.confiance': 'Confiance',
  'pied.acces': 'Accès',
  'pied.mention': 'Projet de fin d’études — gestion des ressources humaines '
    + 'sans serveur sur AWS. Tunis, ',
};

const EN: Partial<Record<keyof typeof FR, string>> = {
  'nav.modules': 'Modules', 'nav.roles': 'Roles', 'nav.mesures': 'Measurements',
  'nav.impact': 'Impact', 'nav.donnees': 'Privacy', 'nav.connexion': 'Sign in',
  'nav.compte': 'Create account', 'nav.ambiance': 'Switch appearance',
  'nav.langue': 'Language',

  'annonce.texte': 'Location-checked clock-in, face recognition and missed-entry requests',
  'annonce.badge': 'New',

  'hero.accroche': 'Work as it actually happened.',
  'hero.titre1': 'HR management,',
  'hero.titre2': 'without the paperwork',
  'hero.titre3': 'that comes with it.',
  'hero.chapeau': 'Time, leave, payroll, recruitment and staff documents in '
    + 'one application. A day is recorded as a series of moments, not as '
    + 'two hours in a box.',
  'hero.cta1': 'Go to my workspace',
  'hero.cta2': 'Apply for a job',
  'hero.preuve': '8 modules · 30 tests on the time rules · no photograph kept',

  'demo.titre': 'Tuesday 14 October', 'demo.sous': 'Example day, live',
  'demo.encours': 'Running', 'demo.travaillees': 'worked, breaks deducted',
  'demo.objectif': 'of the 8 h target', 'demo.travail': 'Work',
  'demo.dejeuner': 'Lunch', 'demo.pause': 'Break',
  'demo.verif': 'Face verified', 'demo.distance': 'Distance to template',
  'demo.site': 'Site · 34 m from the reference point',

  'mod.sur': 'All-in-one architecture',
  'mod.titre': 'Eight modules, one place to look',
  'mod.texte': 'Employees follow their time, leave, payslips and expense '
    + 'claims. HR runs recruitment, payroll and requests.',
  'mod.1.t': 'Time and attendance',
  'mod.1.d': 'In, out, breaks. The day reads the way it happened.',
  'mod.1.tag': 'QR · Location · Face',
  'mod.2.t': 'Recruitment and ranking',
  'mod.2.d': 'Jobs, applications, interviews, and a ranking per job.',
  'mod.2.tag': 'Pipeline · Bedrock',
  'mod.3.t': 'Payroll and documents',
  'mod.3.d': 'Payslips and certificates generated as PDF, on request.',
  'mod.3.tag': 'PDF · Archive',
  'mod.4.t': 'Leave and absence',
  'mod.4.d': 'Balances recomputed, proof attached, decisions traced.',
  'mod.4.tag': 'Balances · Approval',
  'mod.5.t': 'Expense claims',
  'mod.5.d': 'Receipt photographed, reimbursement followed to the transfer.',
  'mod.5.tag': 'Attachments',
  'mod.6.t': 'Calendar and interviews',
  'mod.6.d': 'Shared appointments, exportable to a personal calendar.',
  'mod.6.tag': 'iCalendar export',
  'mod.7.t': 'Assessments',
  'mod.7.d': 'Technical quizzes generated, taken online, marked automatically.',
  'mod.7.tag': 'Quizzes · Sessions',
  'mod.8.t': 'Internal messaging',
  'mod.8.d': 'Conversations stay attached to the file they concern.',
  'mod.8.tag': 'Threads · Notifications',

  'role.sur': 'One view per role',
  'role.titre': 'Everyone sees what concerns them, and nothing else',
  'role.texte': 'Roles are carried by groups and re-checked server-side on '
    + 'every call — never merely hidden in the interface.',
  'role.rh': 'Human resources', 'role.sal': 'Employees', 'role.cand': 'Candidates',
  'role.rh.1': 'Dashboard of today’s attendance, lateness and absence',
  'role.rh.2': 'Approval of leave, missed entries and expense claims',
  'role.rh.3': 'Recruitment from job post to decision, with ranking',
  'role.rh.4': 'Generation of payslips and certificates',
  'role.sal.1': 'Clock in, take breaks, clock out',
  'role.sal.2': 'Follow hours for the week and the month',
  'role.sal.3': 'Request leave, a certificate, a reimbursement',
  'role.sal.4': 'Turn face recognition on or erase it, freely',
  'role.cand.1': 'Browse open jobs and apply online',
  'role.cand.2': 'Take the technical assessments',
  'role.cand.3': 'Follow the application without chasing anyone',
  'role.cand.4': 'Receive interview invitations in a personal calendar',
  'role.graphe': 'Attendance rate, last six months',

  'jeu.sur': 'Engagement',
  'jeu.titre': 'Punctuality recognised, not policed',
  'jeu.texte': 'Awards rest on facts an employee can check in their own '
    + 'record. Nothing is computed from data they cannot see.',
  'jeu.1.t': 'Timing master',
  'jeu.1.d': 'Four consecutive weeks with no lateness beyond the tolerance.',
  'jeu.2.t': 'No missed entry',
  'jeu.2.d': 'A full month without a correction request.',
  'jeu.3.t': 'Steadiness',
  'jeu.3.d': 'Stable hours week to week, across a quarter.',

  'calc.sur': 'Estimate',
  'calc.titre': 'What does clocking in cost you?',
  'calc.texte': 'A model, not a measurement. The assumptions are yours and '
    + 'stay on screen: that is the only condition under which a figure like '
    + 'this means anything.',
  'calc.salaries': 'Employees', 'calc.secondes': 'Seconds per entry',
  'calc.cout': 'Loaded hourly cost', 'calc.res1': 'Hours per month',
  'calc.res2': 'Monthly cost', 'calc.res3': 'Saved if the gesture drops to 4 s',
  'calc.note': 'Basis: two entries per working day, twenty-two days a month. '
    + 'The four seconds in the second figure match the face route measured '
    + 'under test conditions.',

  'mes.sur': 'Measurements taken during development',
  'mes.titre': 'Move the threshold, and see who gets in',
  'mes.texte': 'The model decides nothing: it measures a distance between '
    + 'two faces. We choose the distance below which two faces are the same '
    + 'person. The documentation suggests 0.60.',
  'mes.acceptes': 'unauthorised people accepted',
  'mes.refuses': 'holders wrongly refused',
  'mes.aucun': 'No unauthorised person gets through.',
  'mes.passerait': 'would get through at this threshold.',
  'mes.lunettes': 'The refused holders wear glasses.',
  'mes.retenu': 'Chosen threshold — 0.30', 'mes.doc': 'Documentation — 0.60',
  'mes.reglage': 'Acceptance threshold', 'mes.doc.court': '0.60 — documentation',
  'mes.1': 'Holder, no glasses', 'mes.2': 'Holder, another session',
  'mes.3': 'Holder, with glasses', 'mes.4': 'Third party, best case',
  'mes.5': 'Look-alike', 'mes.6': 'Third party, beard',
  'mes.l1.t': '0.60 accepted a look-alike',
  'mes.l1.d': 'At the documented value, the closest look-alike in the test '
    + 'set — 0.4509 — passed as the holder.',
  'mes.l2.t': 'Glasses move the measurement',
  'mes.l2.d': 'The holder with glasses measures 0.3913, further from herself '
    + 'than the best third party at 0.3587.',
  'mes.l3.t': 'Hence templates per appearance',
  'mes.l3.d': 'One template per usual situation, and the comparison keeps '
    + 'the best. A finding, not a hunch.',

  'don.sur': 'Personal data', 'don.titre': 'Six commitments held by the code',
  'don.texte': 'Biometric processing falls under Tunisian law 2004-63 and '
    + 'requires INPDP authorisation. Each point below matches a verifiable '
    + 'technical decision.',
  'don.1.t': 'No image kept',
  'don.1.d': 'Only the template — 128 numbers — is stored. A face cannot be '
    + 'reconstructed from those numbers.',
  'don.2.t': 'No search by face',
  'don.2.d': 'The biometric table has no secondary index. The question '
    + '“who looks like this face?” cannot be asked.',
  'don.3.t': 'Invisible to HR',
  'don.3.d': 'No administration screen can read the template. The employee '
    + 'alone stores and erases it.',
  'don.4.t': 'Erased on departure',
  'don.4.d': 'End of contract triggers deletion of the template, after the '
    + 'file is archived.',
  'don.5.t': 'Separable consent',
  'don.5.d': 'Refusing face recognition costs nothing: code and location '
    + 'remain the main route.',
  'don.6.t': 'Versioned notice',
  'don.6.d': 'A change to the system invalidates earlier consent and asks '
    + 'again.',

  'fin.titre': 'Enter your workspace',
  'fin.sal.t': 'I work at the company',
  'fin.sal.d': 'Your account is created by HR. It holds your time, leave, '
    + 'payslips and expenses.',
  'fin.sal.b': 'Go to my workspace', 'fin.sal.l': 'Forgot password',
  'fin.can.t': 'I am looking for a job',
  'fin.can.d': 'Create a candidate account to apply, take the assessments '
    + 'and follow your application without chasing anyone.',
  'fin.can.b': 'Create a candidate account', 'fin.can.l': 'See open jobs',

  'pied.produit': 'Product', 'pied.confiance': 'Trust', 'pied.acces': 'Access',
  'pied.mention': 'Final-year project — serverless human resources management '
    + 'on AWS. Tunis, ',
};

const AR: Partial<Record<keyof typeof FR, string>> = {
  'nav.modules': 'الوحدات', 'nav.roles': 'الأدوار', 'nav.mesures': 'القياسات',
  'nav.impact': 'الأثر', 'nav.donnees': 'الخصوصية', 'nav.connexion': 'تسجيل الدخول',
  'nav.compte': 'إنشاء حساب', 'nav.ambiance': 'تغيير المظهر', 'nav.langue': 'اللغة',

  'annonce.texte': 'تسجيل الحضور بتحديد الموقع، والتعرّف على الوجه، وطلب تصحيح النسيان',
  'annonce.badge': 'جديد',

  'hero.accroche': 'العمل كما جرى فعلاً.',
  'hero.titre1': 'إدارة الموارد البشرية،',
  'hero.titre2': 'بلا الأوراق',
  'hero.titre3': 'التي ترافقها.',
  'hero.chapeau': 'الحضور والإجازات والأجور والتوظيف ووثائق الموظفين في '
    + 'تطبيق واحد. يُسجَّل اليوم كسلسلة لحظات، لا كساعتين في خانة.',
  'hero.cta1': 'الدخول إلى مساحتي',
  'hero.cta2': 'التقدّم إلى وظيفة',
  'hero.preuve': '٨ وحدات · ٣٠ اختباراً على قواعد الوقت · لا صورة محفوظة',

  'demo.titre': 'الثلاثاء ١٤ أكتوبر', 'demo.sous': 'يوم نموذجي، مباشر',
  'demo.encours': 'جارٍ', 'demo.travaillees': 'ساعات عمل، بعد خصم الاستراحات',
  'demo.objectif': 'من هدف ٨ ساعات', 'demo.travail': 'عمل',
  'demo.dejeuner': 'غداء', 'demo.pause': 'استراحة',
  'demo.verif': 'تم التحقّق من الوجه', 'demo.distance': 'المسافة إلى البصمة',
  'demo.site': 'الموقع · ٣٤ متراً من النقطة المرجعية',

  'mod.sur': 'بنية متكاملة',
  'mod.titre': 'ثماني وحدات، ومكان واحد للبحث',
  'mod.texte': 'يتابع الموظف وقته وإجازاته وكشوف أجره ومصاريفه. وتدير '
    + 'الموارد البشرية التوظيف والأجور والطلبات.',
  'mod.1.t': 'الحضور ووقت العمل',
  'mod.1.d': 'الدخول والخروج والاستراحات. يُقرأ اليوم كما جرى.',
  'mod.1.tag': 'رمز · موقع · وجه',
  'mod.2.t': 'التوظيف والترتيب',
  'mod.2.d': 'عروض وطلبات ومقابلات، وترتيب لكل عرض.',
  'mod.2.tag': 'مسار · Bedrock',
  'mod.3.t': 'الأجور والوثائق',
  'mod.3.d': 'كشوف وشهادات تُولَّد بصيغة PDF عند الطلب.',
  'mod.3.tag': 'PDF · أرشفة',
  'mod.4.t': 'الإجازات والغياب',
  'mod.4.d': 'أرصدة تُحتسب، ومبرّرات مرفقة، وقرارات موثّقة.',
  'mod.4.tag': 'أرصدة · مصادقة',
  'mod.5.t': 'مصاريف المهام',
  'mod.5.d': 'تصوير الوصل، ومتابعة التعويض حتى التحويل.',
  'mod.5.tag': 'مرفقات',
  'mod.6.t': 'المفكّرة والمقابلات',
  'mod.6.d': 'مواعيد مشتركة، قابلة للتصدير إلى التقويم الشخصي.',
  'mod.6.tag': 'تصدير iCalendar',
  'mod.7.t': 'التقييمات',
  'mod.7.d': 'اختبارات تقنية تُولَّد وتُجرى وتُصحَّح آلياً.',
  'mod.7.tag': 'اختبارات · جلسات',
  'mod.8.t': 'المراسلة الداخلية',
  'mod.8.d': 'تبقى المراسلات مرتبطة بالملف الذي تخصّه.',
  'mod.8.tag': 'خيوط · إشعارات',

  'role.sur': 'عرض لكل دور',
  'role.titre': 'كلٌّ يرى ما يخصّه، ولا شيء سواه',
  'role.texte': 'تُحمَل الأدوار عبر المجموعات ويُعاد التحقّق منها في الخادم '
    + 'عند كل نداء — لا إخفاء في الواجهة فحسب.',
  'role.rh': 'الموارد البشرية', 'role.sal': 'الموظفون', 'role.cand': 'المترشّحون',
  'role.rh.1': 'لوحة حضور اليوم والتأخّر والغياب',
  'role.rh.2': 'المصادقة على الإجازات والنسيان والمصاريف',
  'role.rh.3': 'التوظيف من العرض إلى القرار، مع الترتيب',
  'role.rh.4': 'توليد كشوف الأجور والشهادات',
  'role.sal.1': 'تسجيل الدخول والاستراحات والخروج',
  'role.sal.2': 'متابعة ساعات الأسبوع والشهر',
  'role.sal.3': 'طلب إجازة أو شهادة أو تعويض',
  'role.sal.4': 'تفعيل التعرّف على الوجه أو محوه بحرّية',
  'role.cand.1': 'تصفّح العروض المفتوحة والتقدّم إليها',
  'role.cand.2': 'اجتياز التقييمات التقنية',
  'role.cand.3': 'متابعة الترشّح دون مراسلة أحد',
  'role.cand.4': 'تلقّي الدعوات في التقويم الشخصي',
  'role.graphe': 'نسبة الحضور، آخر ستة أشهر',

  'jeu.sur': 'التحفيز',
  'jeu.titre': 'الانضباط يُقدَّر، لا يُراقَب',
  'jeu.texte': 'تستند الأوسمة إلى وقائع يستطيع الموظف التحقّق منها في سجلّه. '
    + 'لا شيء يُحتسب من بيانات لا يراها.',
  'jeu.1.t': 'إتقان التوقيت',
  'jeu.1.d': 'أربعة أسابيع متتالية دون تأخّر يتجاوز السماح.',
  'jeu.2.t': 'بلا نسيان',
  'jeu.2.d': 'شهر كامل دون طلب تصحيح.',
  'jeu.3.t': 'الانتظام',
  'jeu.3.d': 'ساعات مستقرّة من أسبوع إلى آخر، على مدى فصل.',

  'calc.sur': 'تقدير',
  'calc.titre': 'كم يكلّفك تسجيل الحضور من وقت؟',
  'calc.texte': 'نموذج، لا قياس. الفرضيات فرضياتك وتبقى ظاهرة: بهذا الشرط '
    + 'وحده يعني رقم كهذا شيئاً.',
  'calc.salaries': 'الموظفون', 'calc.secondes': 'ثوانٍ لكل تسجيل',
  'calc.cout': 'الكلفة بالساعة', 'calc.res1': 'ساعات في الشهر',
  'calc.res2': 'الكلفة الشهرية', 'calc.res3': 'الوفر إذا نزل الإجراء إلى ٤ ثوانٍ',
  'calc.note': 'الأساس: تسجيلان في كل يوم عمل، اثنان وعشرون يوماً في الشهر. '
    + 'الثواني الأربع في الحساب الثاني تطابق مسار الوجه المقيس في ظروف اختبار.',

  'mes.sur': 'قياسات أُخذت أثناء الضبط',
  'mes.titre': 'حرّك العتبة، وانظر من يدخل',
  'mes.texte': 'النموذج لا يقرّر شيئاً: يقيس مسافة بين وجهين. ونحن من يختار '
    + 'المسافة التي يصير دونها الوجهان شخصاً واحداً. التوثيق يقترح ٠٫٦٠.',
  'mes.acceptes': 'أشخاص غير مخوّلين قُبِلوا',
  'mes.refuses': 'أصحاب حقّ رُفِضوا خطأً',
  'mes.aucun': 'لا يمرّ أيّ شخص غير مخوّل.',
  'mes.passerait': 'سيمرّ عند هذه العتبة.',
  'mes.lunettes': 'المرفوضون خطأً يضعون نظّارات.',
  'mes.retenu': 'العتبة المعتمدة — ٠٫٣٠', 'mes.doc': 'التوثيق — ٠٫٦٠',
  'mes.reglage': 'عتبة القبول', 'mes.doc.court': '٠٫٦٠ — التوثيق',
  'mes.1': 'صاحبة الحقّ، دون نظّارات', 'mes.2': 'صاحبة الحقّ، جلسة أخرى',
  'mes.3': 'صاحبة الحقّ، بنظّارات', 'mes.4': 'شخص آخر، أفضل حالة',
  'mes.5': 'شخص شديد الشبه', 'mes.6': 'شخص آخر، بلحية',
  'mes.l1.t': '٠٫٦٠ كانت تقبل شبيهة',
  'mes.l1.d': 'عند القيمة الموثّقة، مرّت أشدّ الأشخاص شبهاً في العيّنة — '
    + '٠٫٤٥٠٩ — على أنّها صاحبة الحقّ.',
  'mes.l2.t': 'النظّارات تزيح القياس',
  'mes.l2.d': 'صاحبة الحقّ بنظّارات تُقاس عند ٠٫٣٩١٣، أبعد عن نفسها من أقرب '
    + 'شخص آخر عند ٠٫٣٥٨٧.',
  'mes.l3.t': 'ومن هنا بصمات لكل مظهر',
  'mes.l3.d': 'بصمة لكل حالة معتادة، وتُعتمد أفضل مقارنة. استنتاج، لا حدس.',

  'don.sur': 'البيانات الشخصية', 'don.titre': 'ستّة التزامات يحفظها الرمز',
  'don.texte': 'تخضع معالجة البيانات البيومترية للقانون التونسي ٢٠٠٤-٦٣ '
    + 'وتستوجب ترخيص الهيئة الوطنية لحماية المعطيات الشخصية. كل نقطة أدناه '
    + 'تقابل قراراً تقنياً يمكن التحقّق منه.',
  'don.1.t': 'لا صورة محفوظة',
  'don.1.d': 'تُخزَّن البصمة وحدها — ١٢٨ رقماً. ولا يُعاد بناء وجه من هذه الأرقام.',
  'don.2.t': 'لا بحث بالوجه',
  'don.2.d': 'لا فهرس ثانوياً للجدول البيومتري. فسؤال «من يشبه هذا الوجه؟» '
    + 'لا يمكن طرحه.',
  'don.3.t': 'محجوبة عن الموارد البشرية',
  'don.3.d': 'لا تقرأ البصمةَ أيّ شاشة إدارة. الموظف وحده يسجّلها ويمحوها.',
  'don.4.t': 'المحو عند المغادرة',
  'don.4.d': 'تُطلق نهايةُ العقد حذفَ البصمة، بعد أرشفة الملفّ.',
  'don.5.t': 'موافقة منفصلة',
  'don.5.d': 'رفض التعرّف على الوجه لا يحرم من شيء: يبقى الرمز والموقع '
    + 'المسار الأساسي.',
  'don.6.t': 'إشعار مُؤرَّخ',
  'don.6.d': 'أيّ تغيير في المنظومة يُبطل الموافقات السابقة ويطلبها من جديد.',

  'fin.titre': 'ادخل إلى مساحتك',
  'fin.sal.t': 'أعمل في المؤسّسة',
  'fin.sal.d': 'تُنشئ الموارد البشرية حسابك. تجد فيه حضورك وإجازاتك وكشوفك '
    + 'ومصاريفك.',
  'fin.sal.b': 'الدخول إلى مساحتي', 'fin.sal.l': 'نسيت كلمة السرّ',
  'fin.can.t': 'أبحث عن وظيفة',
  'fin.can.d': 'أنشئ حساب مترشّح للتقدّم واجتياز التقييمات ومتابعة ترشّحك '
    + 'دون مراسلة أحد.',
  'fin.can.b': 'إنشاء حساب مترشّح', 'fin.can.l': 'عرض الوظائف المفتوحة',

  'pied.produit': 'المنتج', 'pied.confiance': 'الثقة', 'pied.acces': 'الدخول',
  'pied.mention': 'مشروع تخرّج — إدارة الموارد البشرية دون خوادم على AWS. '
    + 'تونس، ',
};

type Cle = keyof typeof FR;
const DICOS: Record<Langue, Partial<Record<Cle, string>>> = { fr: FR, en: EN, ar: AR };

// ════════════════════════════════════════════════════════════════════
// DONNÉES
// ════════════════════════════════════════════════════════════════════

const FENETRE_DEBUT = 7 * 60;
const FENETRE_FIN = 19 * 60;

type Nature = 'travail' | 'dejeuner' | 'cafe';

const JOURNEE: { debut: number; fin: number | null; nature: Nature }[] = [
  { debut: 8 * 60 + 12, fin: 12 * 60 + 30, nature: 'travail' },
  { debut: 12 * 60 + 30, fin: 13 * 60 + 20, nature: 'dejeuner' },
  { debut: 13 * 60 + 20, fin: 15 * 60 + 45, nature: 'travail' },
  { debut: 15 * 60 + 45, fin: 15 * 60 + 58, nature: 'cafe' },
  { debut: 15 * 60 + 58, fin: null, nature: 'travail' },
];

const COULEURS: Record<Nature, string> = {
  travail: 'var(--x-emeraude)',
  dejeuner: 'var(--x-or)',
  cafe: 'var(--x-indigo-clair)',
};

const MESURES: { d: number; legitime: boolean; cle: Cle }[] = [
  { d: 0.2677, legitime: true, cle: 'mes.1' },
  { d: 0.3528, legitime: true, cle: 'mes.2' },
  { d: 0.3913, legitime: true, cle: 'mes.3' },
  { d: 0.3587, legitime: false, cle: 'mes.4' },
  { d: 0.4509, legitime: false, cle: 'mes.5' },
  { d: 0.5639, legitime: false, cle: 'mes.6' },
];

const SEUIL_RETENU = 0.30;
const SEUIL_DOC = 0.60;
const AXE_MAX = 0.7;

const PRESENCE = [94, 96, 93, 97, 95, 98];
const MOIS = ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M'];

// ════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════

export default function LandingPage() {
  const [langue, setLangue] = useState<Langue>(() => lire('hrup-langue', ['fr', 'en', 'ar'], 'fr') as Langue);
  const [ambiance, setAmbiance] = useState<'sombre' | 'clair'>(
    () => lire('hrup-ambiance', ['sombre', 'clair'], 'sombre') as 'sombre' | 'clair',
  );

  const dir = LANGUES.find((l) => l.code === langue)!.dir;

  const t = useMemo(() => (cle: Cle) => DICOS[langue][cle] ?? FR[cle], [langue]);

  useEffect(() => { ecrire('hrup-langue', langue); }, [langue]);
  useEffect(() => { ecrire('hrup-ambiance', ambiance); }, [ambiance]);

  return (
    // dir est posé ICI et non sur <html> : la page vitrine passe en
    // écriture droite-à-gauche pour l'arabe sans retourner le reste de
    // l'application, qui a sa propre langue.
    <div className="x" data-ambiance={ambiance} dir={dir} lang={langue}>
      <style>{CSS}</style>

      <Barre
        t={t} langue={langue} setLangue={setLangue}
        ambiance={ambiance} setAmbiance={setAmbiance}
      />

      <main>
        <Haut t={t} />
        <Modules t={t} />
        <Roles t={t} />
        <Jeu t={t} />
        <Calculateur t={t} langue={langue} />
        <Seuil t={t} />
        <Donnees t={t} />
        <Fin t={t} />
      </main>

      <Pied t={t} />
    </div>
  );
}

type T = (cle: Cle) => string;

/** Lecture d'un choix mémorisé. En navigation privée le stockage lève,
 *  d'où le try : une page vitrine ne doit pas tomber pour ça. */
function lire(cle: string, permis: string[], defaut: string): string {
  try {
    const v = localStorage.getItem(cle);
    if (v && permis.includes(v)) return v;
  } catch { /* stockage indisponible */ }
  return defaut;
}

function ecrire(cle: string, valeur: string) {
  try { localStorage.setItem(cle, valeur); } catch { /* sans gravité */ }
}

const hhmm = (m: number) =>
  `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;

const duree = (m: number) => {
  const n = Math.max(0, Math.round(m));
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`;
};

// ════════════════════════════════════════════════════════════════════
// COMPOSANTS
// ════════════════════════════════════════════════════════════════════

function Bouton({ a, variante = 'verre', petit, children }: {
  a: string; variante?: 'degrade' | 'verre'; petit?: boolean; children: ReactNode;
}) {
  return (
    <Link
      to={a}
      className={`x-bouton x-bouton--${variante}${petit ? ' x-bouton--petit' : ''}`}
    >
      {children}
    </Link>
  );
}

function Puce({ ton = 'indigo', children }: {
  ton?: 'indigo' | 'or' | 'emeraude'; children: ReactNode;
}) {
  return <span className={`x-puce x-puce--${ton}`}>{children}</span>;
}

function Carte({ niveau = 1, className = '', children }: {
  niveau?: 1 | 2; className?: string; children: ReactNode;
}) {
  return (
    <div className={`x-carte x-carte--${niveau} ${className}`.trim()}>
      {children}
    </div>
  );
}

function Entete({ sur, titre, texte, centre }: {
  sur: string; titre: string; texte: string; centre?: boolean;
}) {
  return (
    <div className={'x-entete' + (centre ? ' x-entete--centre' : '')}>
      <p className="x-sur">{sur}</p>
      <h2>{titre}</h2>
      <p className="x-entete-texte">{texte}</p>
    </div>
  );
}

function Stat({ valeur, legende, ton }: {
  valeur: ReactNode; legende: string; ton?: 'or' | 'emeraude' | 'rubis';
}) {
  return (
    <div className="x-stat">
      <strong className={ton ? `x-${ton}` : undefined}>{valeur}</strong>
      <span>{legende}</span>
    </div>
  );
}

/** Vrai dès que l'élément a été vu une fois. Une fois, et non « tant
 *  qu'il est visible » : une animation qui se rejoue à chaque passage
 *  de la molette agace au lieu d'attirer. */
function useVu<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [vu, setVu] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVu(true);
      return;
    }
    const o = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { setVu(true); o.disconnect(); }
    }, { threshold: 0.3 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  return { ref, vu };
}

// ════════════════════════════════════════════════════════════════════
// BARRE
// ════════════════════════════════════════════════════════════════════

function Barre({ t, langue, setLangue, ambiance, setAmbiance }: {
  t: T; langue: Langue; setLangue: (l: Langue) => void;
  ambiance: 'sombre' | 'clair'; setAmbiance: (a: 'sombre' | 'clair') => void;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <header className="x-barre">
      <div className="x-cadre x-barre-i">
        <Link to="/" className="x-marque" aria-label="HR UP">
          <Glyphe />
          <span>HR<em>UP</em></span>
        </Link>

        <nav className={'x-nav' + (ouvert ? ' x-nav--ouverte' : '')}>
          <a href="#modules" onClick={() => setOuvert(false)}>{t('nav.modules')}</a>
          <a href="#roles" onClick={() => setOuvert(false)}>{t('nav.roles')}</a>
          <a href="#impact" onClick={() => setOuvert(false)}>{t('nav.impact')}</a>
          <a href="#mesures" onClick={() => setOuvert(false)}>{t('nav.mesures')}</a>
          <a href="#donnees" onClick={() => setOuvert(false)}>{t('nav.donnees')}</a>
        </nav>

        <div className="x-barre-fin">
          <div className="x-langues" role="group" aria-label={t('nav.langue')}>
            {LANGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLangue(l.code)}
                aria-pressed={l.code === langue}
                className={l.code === langue ? 'x-langue x-langue--on' : 'x-langue'}
              >
                {l.nom}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="x-icone"
            onClick={() => setAmbiance(ambiance === 'sombre' ? 'clair' : 'sombre')}
            aria-label={t('nav.ambiance')}
            title={t('nav.ambiance')}
          >
            {ambiance === 'sombre' ? <Soleil /> : <Lune />}
          </button>

          <Link to="/login" className="x-lien-nu">{t('nav.connexion')}</Link>
          <Bouton a="/register" variante="degrade" petit>{t('nav.compte')}</Bouton>

          <button
            type="button" className="x-hamburger"
            aria-expanded={ouvert} aria-label="Menu"
            onClick={() => setOuvert((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════
// HAUT DE PAGE
// ════════════════════════════════════════════════════════════════════

function Haut({ t }: { t: T }) {
  return (
    <section className="x-haut">
      <div className="x-aura" aria-hidden="true" />

      <div className="x-cadre x-haut-i">
        <Link to="/register" className="x-annonce">
          <i aria-hidden="true" />
          <span>{t('annonce.texte')}</span>
          <b>{t('annonce.badge')}</b>
        </Link>

        <p className="x-accroche">{t('hero.accroche')}</p>

        <h1>
          {t('hero.titre1')}{' '}
          <span className="x-degrade-texte">{t('hero.titre2')}</span>{' '}
          {t('hero.titre3')}
        </h1>

        <p className="x-chapeau">{t('hero.chapeau')}</p>

        <div className="x-actions">
          <Bouton a="/login" variante="degrade">{t('hero.cta1')}</Bouton>
          <Bouton a="/register">{t('hero.cta2')}</Bouton>
        </div>

        <p className="x-preuve">{t('hero.preuve')}</p>

        <Vitrine t={t} />
      </div>
    </section>
  );
}

/** Le panneau de démonstration. Il montre le mécanisme du produit — une
 *  journée en segments, une vérification de visage — plutôt qu'une
 *  illustration de ce mécanisme. */
function Vitrine({ t }: { t: T }) {
  const [maintenant, setMaintenant] = useState(16 * 60 + 4);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(
      () => setMaintenant((m) => Math.min(18 * 60 + 30, m + 1 / 60)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const place = (m: number) =>
    ((m - FENETRE_DEBUT) / (FENETRE_FIN - FENETRE_DEBUT)) * 100;

  const segments = JOURNEE.map((s) => {
    const fin = s.fin ?? maintenant;
    return {
      ...s,
      fine: fin,
      gauche: place(s.debut),
      // Un segment de treize minutes vaut 1,8 % de la journée : sans
      // plancher il devient invisible, et une pause invisible est une
      // pause dont le salarié croit qu'elle n'a pas été prise en compte.
      largeur: Math.max(1.6, place(fin) - place(s.debut)),
    };
  });

  const travail = segments.filter((s) => s.nature === 'travail')
    .reduce((a, s) => a + (s.fine - s.debut), 0);
  const objectif = 8 * 60;

  return (
    <Carte niveau={2} className="x-vitrine">
      <div className="x-vitrine-g">
        <div className="x-vitrine-tete">
          <div>
            <h3>{t('demo.titre')}</h3>
            <p className="x-mention">{t('demo.sous')}</p>
          </div>
          <Puce ton="emeraude">
            <i className="x-vivant" aria-hidden="true" />
            {t('demo.encours')}
          </Puce>
        </div>

        <div className="x-compte">
          <strong>{duree(travail)}</strong>
          <span>{t('demo.travaillees')}</span>
        </div>

        <div className="x-jauge" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (travail / objectif) * 100)}%` }} />
        </div>
        <p className="x-mention">
          {Math.round((travail / objectif) * 100)} % {t('demo.objectif')}
        </p>

        <div
          className="x-frise"
          role="img"
          aria-label={`${duree(travail)} — ${t('demo.travaillees')}`}
        >
          {segments.map((s, i) => (
            <div
              key={i} className="x-seg"
              style={{
                insetInlineStart: `${s.gauche}%`,
                width: `${s.largeur}%`,
                background: COULEURS[s.nature],
              }}
            />
          ))}
          <div className="x-curseur" style={{ insetInlineStart: `${place(maintenant)}%` }}>
            <span>{hhmm(maintenant)}</span>
          </div>
        </div>

        <ul className="x-legende">
          <li><i style={{ background: COULEURS.travail }} />{t('demo.travail')}</li>
          <li><i style={{ background: COULEURS.dejeuner }} />{t('demo.dejeuner')}</li>
          <li><i style={{ background: COULEURS.cafe }} />{t('demo.pause')}</li>
        </ul>
      </div>

      <div className="x-vitrine-d">
        <Carte className="x-visage">
          <div className="x-visage-tete">
            <span className="x-avatar" aria-hidden="true">NT</span>
            <div>
              <strong>{t('demo.verif')}</strong>
              <p className="x-mention">{t('demo.site')}</p>
            </div>
          </div>

          <p className="x-mention x-mt">{t('demo.distance')}</p>
          <div className="x-mesure-barre" aria-hidden="true">
            <i className="x-mesure-zone" style={{ width: `${(0.30 / 0.7) * 100}%` }} />
            <i className="x-mesure-point" style={{ insetInlineStart: `${(0.2677 / 0.7) * 100}%` }} />
            <i className="x-mesure-seuil" style={{ insetInlineStart: `${(0.30 / 0.7) * 100}%` }} />
          </div>
          <div className="x-mesure-chiffres">
            <strong className="x-emeraude">0,2677</strong>
            <span>/ 0,30</span>
          </div>
        </Carte>

        <div className="x-mini-stats">
          <Stat valeur="8" legende={t('nav.modules')} ton="or" />
          <Stat valeur="30" legende="tests" ton="emeraude" />
        </div>
      </div>
    </Carte>
  );
}

// ════════════════════════════════════════════════════════════════════
// MODULES
// ════════════════════════════════════════════════════════════════════

function Modules({ t }: { t: T }) {
  const tons: ('indigo' | 'or' | 'emeraude')[] =
    ['emeraude', 'indigo', 'or', 'emeraude', 'indigo', 'or', 'indigo', 'emeraude'];

  return (
    <section id="modules" className="x-section">
      <div className="x-cadre">
        <Entete sur={t('mod.sur')} titre={t('mod.titre')} texte={t('mod.texte')} />

        <div className="x-modules">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
            <Carte key={n} className="x-module">
              <span className={`x-tuile x-tuile--${tons[i]}`} aria-hidden="true">
                <IconeModule n={n} />
              </span>
              <h3>{t(`mod.${n}.t` as Cle)}</h3>
              <p>{t(`mod.${n}.d` as Cle)}</p>
              <p className="x-module-tag">{t(`mod.${n}.tag` as Cle)}</p>
            </Carte>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// RÔLES
// ════════════════════════════════════════════════════════════════════

function Roles({ t }: { t: T }) {
  const [actif, setActif] = useState<'rh' | 'sal' | 'cand'>('rh');
  const { ref, vu } = useVu<HTMLDivElement>();

  const onglets: { cle: 'rh' | 'sal' | 'cand'; libelle: string }[] = [
    { cle: 'rh', libelle: t('role.rh') },
    { cle: 'sal', libelle: t('role.sal') },
    { cle: 'cand', libelle: t('role.cand') },
  ];

  return (
    <section id="roles" className="x-section x-section--creuse">
      <div className="x-cadre">
        <Entete sur={t('role.sur')} titre={t('role.titre')} texte={t('role.texte')} />

        <div className="x-onglets" role="tablist" aria-label={t('role.sur')}>
          {onglets.map((o) => (
            <button
              key={o.cle} type="button" role="tab"
              aria-selected={o.cle === actif}
              className={o.cle === actif ? 'x-onglet x-onglet--on' : 'x-onglet'}
              onClick={() => setActif(o.cle)}
            >
              {o.libelle}
            </button>
          ))}
        </div>

        <Carte niveau={2} className="x-roles-corps">
          <ul className="x-roles-liste">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>
                <i aria-hidden="true"><Coche /></i>
                {t(`role.${actif}.${n}` as Cle)}
              </li>
            ))}
          </ul>

          <div className="x-graphe" ref={ref}>
            <p className="x-mention">{t('role.graphe')}</p>
            <div className="x-barres">
              {PRESENCE.map((p, i) => (
                <div key={i} className="x-barre-col">
                  {/* La hauteur part de zéro et monte une fois, à
                      l'entrée dans le champ de vision. Une barre qui
                      pousse dit qu'on lit une quantité. */}
                  <i style={{ height: vu ? `${(p - 88) * 8}%` : '0%' }} />
                  <span>{MOIS[i]}</span>
                  <b>{p} %</b>
                </div>
              ))}
            </div>
          </div>
        </Carte>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// RECONNAISSANCE
// ════════════════════════════════════════════════════════════════════

function Jeu({ t }: { t: T }) {
  const tons: ('or' | 'indigo' | 'emeraude')[] = ['or', 'emeraude', 'indigo'];

  return (
    <section className="x-section">
      <div className="x-cadre">
        <Entete sur={t('jeu.sur')} titre={t('jeu.titre')} texte={t('jeu.texte')} centre />

        <div className="x-jeu">
          {[1, 2, 3].map((n, i) => (
            <Carte key={n} className="x-badge">
              <span className={`x-halo x-halo--${tons[i]}`} aria-hidden="true">
                <IconeBadge n={n} />
              </span>
              <h3>{t(`jeu.${n}.t` as Cle)}</h3>
              <p>{t(`jeu.${n}.d` as Cle)}</p>
            </Carte>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// CALCULATEUR
// ════════════════════════════════════════════════════════════════════

function Calculateur({ t, langue }: { t: T; langue: Langue }) {
  const [salaries, setSalaries] = useState(150);
  const [secondes, setSecondes] = useState(25);
  const [cout, setCout] = useState(18);

  // Deux pointages par jour ouvré, vingt-deux jours par mois. Les
  // hypothèses restent affichées sous le résultat : un chiffre de ce
  // genre ne vaut que par elles.
  const heures = (salaries * 2 * 22 * secondes) / 3600;
  const heuresFacial = (salaries * 2 * 22 * 4) / 3600;
  const nf = new Intl.NumberFormat(
    langue === 'ar' ? 'ar-TN' : langue === 'en' ? 'en-GB' : 'fr-FR',
    { maximumFractionDigits: 0 },
  );

  return (
    <section id="impact" className="x-section x-section--creuse">
      <div className="x-cadre">
        <Entete sur={t('calc.sur')} titre={t('calc.titre')} texte={t('calc.texte')} />

        <Carte niveau={2} className="x-calc">
          <div className="x-calc-reglages">
            <Reglage
              libelle={t('calc.salaries')} valeur={nf.format(salaries)}
              min={10} max={1000} pas={10} v={salaries} set={setSalaries}
            />
            <Reglage
              libelle={t('calc.secondes')} valeur={`${secondes} s`}
              min={4} max={90} pas={1} v={secondes} set={setSecondes}
            />
            <Reglage
              libelle={t('calc.cout')} valeur={`${cout} DT`}
              min={5} max={80} pas={1} v={cout} set={setCout}
            />
          </div>

          <div className="x-calc-sorties">
            <Stat valeur={`${nf.format(heures)} h`} legende={t('calc.res1')} ton="or" />
            <Stat
              valeur={`${nf.format(heures * cout)} DT`}
              legende={t('calc.res2')} ton="rubis"
            />
            <Stat
              valeur={`${nf.format((heures - heuresFacial) * cout)} DT`}
              legende={t('calc.res3')} ton="emeraude"
            />
          </div>

          <p className="x-calc-note">{t('calc.note')}</p>
        </Carte>
      </div>
    </section>
  );
}

function Reglage({ libelle, valeur, min, max, pas, v, set }: {
  libelle: string; valeur: string; min: number; max: number; pas: number;
  v: number; set: (n: number) => void;
}) {
  return (
    <label className="x-reglage">
      <span className="x-reglage-tete">
        <span>{libelle}</span>
        <b>{valeur}</b>
      </span>
      <input
        type="range" min={min} max={max} step={pas} value={v}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════
// LE SEUIL
// ════════════════════════════════════════════════════════════════════

function Seuil({ t }: { t: T }) {
  const [seuil, setSeuil] = useState(SEUIL_RETENU);

  const refuses = MESURES.filter((m) => m.legitime && m.d >= seuil).length;
  const acceptes = MESURES.filter((m) => !m.legitime && m.d < seuil).length;
  const nbLeg = MESURES.filter((m) => m.legitime).length;
  const nbTiers = MESURES.length - nbLeg;

  const pos = (d: number) => (d / AXE_MAX) * 100;

  return (
    <section id="mesures" className="x-section">
      <div className="x-cadre">
        <Entete sur={t('mes.sur')} titre={t('mes.titre')} texte={t('mes.texte')} />

        <Carte niveau={2} className="x-mesures">
          <div className="x-axe">
            <div className="x-zone-ok" style={{ width: `${pos(seuil)}%` }} />

            {MESURES.map((m, i) => {
              const accepte = m.d < seuil;
              const faux = accepte !== m.legitime;
              return (
                <div
                  key={i} tabIndex={0} role="img"
                  className={'x-point'
                    + (m.legitime ? ' x-point--leg' : ' x-point--tiers')
                    + (faux ? ' x-point--faux' : '')}
                  style={{ insetInlineStart: `${pos(m.d)}%` }}
                  aria-label={`${t(m.cle)} — ${m.d.toFixed(4)}`}
                >
                  <span className="x-bulle">
                    {t(m.cle)}<b>{m.d.toFixed(4)}</b>
                  </span>
                </div>
              );
            })}

            <div className="x-seuil-trait" style={{ insetInlineStart: `${pos(seuil)}%` }}>
              <span>{seuil.toFixed(2)}</span>
            </div>
            <div className="x-repere" style={{ insetInlineStart: `${pos(SEUIL_DOC)}%` }}>
              <span>{t('mes.doc.court')}</span>
            </div>
          </div>

          <div className="x-graduations" aria-hidden="true">
            {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((g) => (
              <span key={g} style={{ insetInlineStart: `${pos(g)}%` }}>
                {g.toFixed(1)}
              </span>
            ))}
          </div>

          <label className="x-reglage x-reglage--seul">
            <span className="x-cache">{t('mes.reglage')}</span>
            <input
              type="range" min={0.15} max={0.7} step={0.005} value={seuil}
              onChange={(e) => setSeuil(Number(e.target.value))}
              aria-valuetext={`${seuil.toFixed(3)} — ${acceptes} / ${nbTiers}`}
            />
          </label>

          <div className="x-verdict">
            <Stat
              valeur={`${acceptes} / ${nbTiers}`} legende={t('mes.acceptes')}
              ton={acceptes ? 'rubis' : 'emeraude'}
            />
            <Stat
              valeur={`${refuses} / ${nbLeg}`} legende={t('mes.refuses')}
              ton={refuses ? 'or' : 'emeraude'}
            />
            <p className="x-verdict-dire">
              {acceptes > 0
                ? `${acceptes} — ${t('mes.passerait')}`
                : t('mes.aucun')}
              {refuses > 0 && ` ${t('mes.lunettes')}`}
            </p>
          </div>

          <div className="x-presets">
            <button type="button" onClick={() => setSeuil(SEUIL_RETENU)}>
              {t('mes.retenu')}
            </button>
            <button type="button" onClick={() => setSeuil(SEUIL_DOC)}>
              {t('mes.doc')}
            </button>
          </div>
        </Carte>

        <div className="x-lecons">
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <h4>{t(`mes.l${n}.t` as Cle)}</h4>
              <p>{t(`mes.l${n}.d` as Cle)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// DONNÉES
// ════════════════════════════════════════════════════════════════════

function Donnees({ t }: { t: T }) {
  return (
    <section id="donnees" className="x-section x-section--creuse">
      <div className="x-cadre">
        <Entete sur={t('don.sur')} titre={t('don.titre')} texte={t('don.texte')} />

        <div className="x-garanties">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Carte key={n} className="x-garantie">
              <h3>{t(`don.${n}.t` as Cle)}</h3>
              <p>{t(`don.${n}.d` as Cle)}</p>
            </Carte>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// FIN
// ════════════════════════════════════════════════════════════════════

function Fin({ t }: { t: T }) {
  return (
    <section className="x-section x-fin">
      <div className="x-cadre">
        <h2 className="x-fin-titre">{t('fin.titre')}</h2>

        <div className="x-portes">
          <Carte niveau={2} className="x-porte">
            <h3>{t('fin.sal.t')}</h3>
            <p>{t('fin.sal.d')}</p>
            <Bouton a="/login" variante="degrade">{t('fin.sal.b')}</Bouton>
            <Link to="/login" className="x-lien-nu x-bloc">{t('fin.sal.l')}</Link>
          </Carte>

          <Carte niveau={2} className="x-porte x-porte--cand">
            <h3>{t('fin.can.t')}</h3>
            <p>{t('fin.can.d')}</p>
            <Bouton a="/register" variante="degrade">{t('fin.can.b')}</Bouton>
            <Link to="/offres" className="x-lien-nu x-bloc">{t('fin.can.l')}</Link>
          </Carte>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// PIED
// ════════════════════════════════════════════════════════════════════

function Pied({ t }: { t: T }) {
  return (
    <footer className="x-pied">
      <div className="x-cadre x-pied-i">
        <div>
          <span className="x-marque"><Glyphe /><span>HR<em>UP</em></span></span>
          <p className="x-pied-mention">
            {t('pied.mention')}{new Date().getFullYear()}.
          </p>
        </div>

        <div className="x-pied-col">
          <h4>{t('pied.produit')}</h4>
          <a href="#modules">{t('nav.modules')}</a>
          <a href="#roles">{t('nav.roles')}</a>
          <a href="#impact">{t('nav.impact')}</a>
        </div>

        <div className="x-pied-col">
          <h4>{t('pied.confiance')}</h4>
          <a href="#donnees">{t('nav.donnees')}</a>
          <a href="#mesures">{t('nav.mesures')}</a>
        </div>

        <div className="x-pied-col">
          <h4>{t('pied.acces')}</h4>
          <Link to="/login">{t('nav.connexion')}</Link>
          <Link to="/register">{t('nav.compte')}</Link>
        </div>
      </div>
    </footer>
  );
}

// ════════════════════════════════════════════════════════════════════
// ICÔNES
// ════════════════════════════════════════════════════════════════════

const tr = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

function Glyphe() {
  return (
    <svg viewBox="0 0 30 30" width="28" height="28" aria-hidden="true">
      <defs>
        <linearGradient id="hrup-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="28" height="28" rx="9" fill="url(#hrup-g)" />
      <path d="M5 21h20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
      <path d="M10 21h10" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="21" cy="11" r="3" fill="#fff" />
    </svg>
  );
}

const Soleil = () => (
  <svg {...tr} width="18" height="18">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
);

const Lune = () => (
  <svg {...tr} width="18" height="18">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const Coche = () => (
  <svg {...tr} width="14" height="14" strokeWidth={2.6}><path d="M4 12.5l5 5L20 6.5" /></svg>
);

function IconeModule({ n }: { n: number }) {
  const d: Record<number, ReactNode> = {
    1: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>,
    2: <><circle cx="10" cy="8.5" r="3.5" /><path d="M3.8 19.5a6.5 6.5 0 0 1 12.4 0M17 7l2 2 3.5-3.5" /></>,
    3: <><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
    4: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M9.5 15.5l1.8 1.8 3.4-3.6" /></>,
    5: <><path d="M4 7.5h16v12H4z" /><path d="M4 11.5h16M8.5 4v3.5M15.5 4v3.5" /></>,
    6: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
    7: <><path d="M4.5 5.5h15v13h-15z" /><path d="M8.5 10l2.2 2.2L15.5 7.5M8.5 15.5h7" /></>,
    8: <><path d="M20.5 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 4V6a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5z" /></>,
  };
  return <svg {...tr} width="20" height="20">{d[n]}</svg>;
}

function IconeBadge({ n }: { n: number }) {
  const d: Record<number, ReactNode> = {
    1: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>,
    2: <><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" /></>,
    3: <><path d="M4 17l4.5-5 3.5 3.5L20 7" /><path d="M15.5 7H20v4.5" /></>,
  };
  return <svg {...tr} width="22" height="22">{d[n]}</svg>;
}

// ════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Plus+Jakarta+Sans:wght@500;600;700&family=Inter:wght@400;500&family=Noto+Sans+Arabic:wght@400;600;700&display=swap');

.x {
  --x-r-sm: 8px; --x-r: 12px; --x-r-lg: 18px; --x-r-xl: 24px;
  --x-max: 1200px;

  --x-titre: 'Sora', system-ui, sans-serif;
  --x-label: 'Plus Jakarta Sans', system-ui, sans-serif;
  --x-corps: 'Inter', system-ui, sans-serif;

  /* Le dégradé du bouton principal est ASSOMBRI par rapport à la
     maquette : #6366F1 → #8B5CF6 donnait 4,47 et 4,23 pour du blanc,
     donc sous le seuil, nettement du côté violet. */
  --x-cta: linear-gradient(135deg, #5A5CE8, #7C4DEE);
  --x-cta-f: linear-gradient(135deg, #4F46E5, #6D28D9);

  font-family: var(--x-corps);
  font-size: 16px; line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  background: var(--x-fond); color: var(--x-texte);
  transition: background-color .25s, color .25s;
}

/* L'arabe reçoit sa propre pile : les polices latines ci-dessus n'ont
   pas de glyphes arabes, et le repli système donne des hauteurs
   incohérentes d'un poste à l'autre. */
.x[lang="ar"] {
  --x-titre: 'Noto Sans Arabic', system-ui, sans-serif;
  --x-label: 'Noto Sans Arabic', system-ui, sans-serif;
  --x-corps: 'Noto Sans Arabic', system-ui, sans-serif;
  line-height: 1.85;
}

.x[data-ambiance="sombre"] {
  --x-fond:        #0B0F19;
  --x-fond-2:      #0F1420;
  --x-carte:       rgba(21, 27, 43, .72);
  --x-carte-2:     rgba(30, 41, 59, .78);
  --x-bord:        rgba(255, 255, 255, .09);
  --x-bord-fort:   rgba(255, 255, 255, .15);
  --x-texte:       #F8FAFC;
  --x-texte-2:     #AEB6CC;
  --x-texte-3:     #8A93AD;
  --x-indigo:      #6366F1;
  --x-indigo-clair:#A5B4FC;
  --x-violet:      #8B5CF6;
  --x-or:          #F59E0B;
  --x-or-clair:    #FBBF24;
  --x-emeraude:    #10B981;
  --x-emeraude-c:  #34D399;
  --x-rubis:       #F43F5E;
  --x-voile-i:     rgba(99, 102, 241, .16);
  --x-voile-o:     rgba(245, 158, 11, .16);
  --x-voile-e:     rgba(16, 185, 129, .16);
  --x-ombre:       0 14px 38px -12px rgba(0, 0, 0, .66);
}

.x[data-ambiance="clair"] {
  --x-fond:        #F5F6FC;
  --x-fond-2:      #EDEFF8;
  --x-carte:       rgba(255, 255, 255, .86);
  --x-carte-2:     #FFFFFF;
  --x-bord:        rgba(19, 23, 41, .10);
  --x-bord-fort:   rgba(19, 23, 41, .17);
  --x-texte:       #131729;
  --x-texte-2:     #565D78;
  --x-texte-3:     #656C86;
  --x-indigo:      #4F46E5;
  --x-indigo-clair:#4F46E5;
  --x-violet:      #7C3AED;
  /* L'or et l'émeraude de la maquette ne passent pas en texte sur fond
     clair — 4,10 et 4,36. Assombris ici seulement : sur l'obsidienne,
     les valeurs d'origine sont excellentes. */
  --x-or:          #9A6005;
  --x-or-clair:    #9A6005;
  --x-emeraude:    #067653;
  --x-emeraude-c:  #067653;
  --x-rubis:       #D4193C;
  --x-voile-i:     rgba(79, 70, 229, .10);
  --x-voile-o:     rgba(154, 96, 5, .12);
  --x-voile-e:     rgba(6, 118, 83, .11);
  --x-ombre:       0 10px 30px -14px rgba(19, 23, 41, .22);
}

.x *, .x *::before, .x *::after { box-sizing: border-box; }
.x h1, .x h2, .x h3, .x h4 { margin: 0; font-family: var(--x-titre); }
.x p { margin: 0; }
.x ul, .x ol { margin: 0; padding: 0; list-style: none; }

.x-cadre { max-width: var(--x-max); margin: 0 auto; padding: 0 24px; }
.x-cache {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.x-mt { margin-top: 14px; }
.x-or { color: var(--x-or); }
.x-emeraude { color: var(--x-emeraude-c); }
.x-rubis { color: var(--x-rubis); }

/* ── Barre ───────────────────────────────────────────────────────── */

.x-barre {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--x-fond) 82%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--x-bord);
}
.x-barre-i { display: flex; align-items: center; gap: 20px; height: 72px; }

.x-marque {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--x-titre); font-size: 19px; font-weight: 700;
  letter-spacing: -.03em; color: var(--x-texte); text-decoration: none;
  white-space: nowrap;
}
.x-marque em {
  font-style: normal;
  background: var(--x-cta); -webkit-background-clip: text;
  background-clip: text; color: transparent;
}

.x-nav { margin-inline-start: auto; display: flex; gap: 20px; }
.x-nav a {
  font-family: var(--x-label); font-size: 14px; font-weight: 600;
  color: var(--x-texte-2); text-decoration: none; transition: color .15s;
}
.x-nav a:hover { color: var(--x-texte); }

.x-barre-fin { display: flex; align-items: center; gap: 12px; }

.x-langues {
  display: inline-flex; padding: 3px; gap: 2px;
  background: var(--x-carte); border: 1px solid var(--x-bord);
  border-radius: 999px;
}
.x-langue {
  font-family: var(--x-label); font-size: 11.5px; font-weight: 700;
  color: var(--x-texte-3); background: none; border: 0;
  padding: 5px 10px; border-radius: 999px; cursor: pointer;
  transition: background .18s, color .18s;
}
.x-langue--on { color: #fff; background: var(--x-cta); }

.x-icone {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: var(--x-r-sm);
  color: var(--x-texte-2); background: var(--x-carte);
  border: 1px solid var(--x-bord); cursor: pointer; transition: color .15s;
}
.x-icone:hover { color: var(--x-texte); }

.x-lien-nu {
  font-family: var(--x-label); font-size: 14px; font-weight: 600;
  color: var(--x-texte-2); text-decoration: none; white-space: nowrap;
}
.x-lien-nu:hover { color: var(--x-texte); }
.x-bloc { display: inline-block; margin-top: 14px; }

.x-hamburger {
  display: none; flex-direction: column; gap: 4px;
  background: none; border: 0; padding: 8px; cursor: pointer;
}
.x-hamburger span {
  display: block; width: 20px; height: 2px;
  background: var(--x-texte); border-radius: 2px;
}

/* ── Boutons ─────────────────────────────────────────────────────── */

.x-bouton {
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--x-label); font-size: 15px; font-weight: 700;
  padding: 13px 24px; border-radius: var(--x-r);
  text-decoration: none; border: 1px solid transparent;
  cursor: pointer; transition: transform .14s, box-shadow .18s, background .18s;
}
.x-bouton--degrade {
  color: #fff; background: var(--x-cta);
  box-shadow: 0 4px 20px -4px rgba(99, 102, 241, .45);
  border-top-color: rgba(255, 255, 255, .25);
}
.x-bouton--degrade:hover {
  background: var(--x-cta-f); transform: translateY(-1px);
  box-shadow: 0 8px 26px -6px rgba(99, 102, 241, .55);
}
.x-bouton--verre {
  color: var(--x-texte); background: var(--x-carte);
  border-color: var(--x-bord-fort);
}
.x-bouton--verre:hover { border-color: var(--x-texte-3); }
.x-bouton--petit { padding: 9px 16px; font-size: 13.5px; }

.x a:focus-visible, .x button:focus-visible, .x input:focus-visible,
.x [tabindex]:focus-visible {
  outline: 2.5px solid var(--x-violet); outline-offset: 3px;
  border-radius: var(--x-r-sm);
}

/* ── Puces ───────────────────────────────────────────────────────── */

.x-puce {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--x-label); font-size: 11.5px; font-weight: 700;
  padding: 4px 11px; border-radius: 999px; white-space: nowrap;
}
.x-puce--indigo {
  color: var(--x-indigo-clair); background: var(--x-voile-i);
  border: 1px solid color-mix(in srgb, var(--x-indigo) 28%, transparent);
}
.x-puce--or {
  color: var(--x-or-clair); background: var(--x-voile-o);
  border: 1px solid color-mix(in srgb, var(--x-or) 30%, transparent);
}
.x-puce--emeraude {
  color: var(--x-emeraude-c); background: var(--x-voile-e);
  border: 1px solid color-mix(in srgb, var(--x-emeraude) 30%, transparent);
}
.x-vivant {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor;
  animation: x-battre 2.4s ease-in-out infinite;
}
@keyframes x-battre { 50% { opacity: .28; } }

/* ── Cartes de verre ─────────────────────────────────────────────── */

.x-carte {
  background: var(--x-carte);
  border: 1px solid var(--x-bord);
  border-radius: var(--x-r-lg);
  backdrop-filter: blur(16px);
}
.x-carte--2 {
  background: var(--x-carte-2); border-color: var(--x-bord-fort);
  border-radius: var(--x-r-xl); box-shadow: var(--x-ombre);
  backdrop-filter: blur(24px);
}

/* ── Haut de page ────────────────────────────────────────────────── */

.x-haut { position: relative; overflow: hidden; padding: 68px 0 88px; }
.x-aura {
  position: absolute; inset-block-start: -360px; inset-inline-start: 50%;
  width: 1200px; height: 760px; transform: translateX(-50%);
  pointer-events: none;
  background:
    radial-gradient(ellipse 50% 50% at 35% 40%, var(--x-voile-i), transparent 72%),
    radial-gradient(ellipse 45% 45% at 68% 48%, rgba(139, 92, 246, .13), transparent 70%);
}
.x-haut-i { position: relative; text-align: center; }

.x-annonce {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--x-label); font-size: 13px; font-weight: 600;
  color: var(--x-texte-2); background: var(--x-carte);
  border: 1px solid var(--x-bord); border-radius: 999px;
  padding: 5px 6px; padding-inline-start: 14px;
  text-decoration: none; margin-bottom: 22px; transition: border-color .15s;
}
.x-annonce:hover { border-color: var(--x-bord-fort); color: var(--x-texte); }
.x-annonce i {
  width: 6px; height: 6px; border-radius: 50%; background: var(--x-emeraude-c);
  animation: x-battre 2.4s ease-in-out infinite; flex-shrink: 0;
}
.x-annonce b {
  font-size: 11px; font-weight: 700; color: #fff;
  background: var(--x-cta); border-radius: 999px; padding: 3px 10px;
}

/* Les trois règles ci-dessous sont préfixées par « .x-haut » à
   dessein, et il ne faut pas les simplifier.

   « .x p { margin: 0 } », plus haut, pèse 0,1,1 — une classe et un
   type. Une règle de classe seule pèse 0,1,0 : elle perd. Le
   « margin: 0 auto » du chapeau n'a donc JAMAIS été appliqué, et le
   paragraphe est resté collé au bord gauche depuis le début — au bord
   droit en arabe. Le titre, lui, était centré : « .x-haut h1 » pèse
   0,2,1 et gagnait.

   Le préfixe porte ces règles à 0,2,0, au-dessus de la remise à zéro.
   Mesuré : centre du chapeau à 406 px avant, 640 px après, dans un
   cadre dont le centre est à 640. */

.x-haut .x-accroche {
  font-family: var(--x-titre); font-weight: 600;
  font-size: clamp(1rem, 2.1vw, 1.2rem);
  color: var(--x-texte-2); letter-spacing: -.01em;
  max-width: 30ch; margin: 0 auto 12px;
}

.x-haut h1 {
  font-size: clamp(2.3rem, 5.4vw, 3.9rem); font-weight: 700;
  line-height: 1.08; letter-spacing: -.035em;
  max-width: 17ch; margin: 0 auto 22px;
}
.x-degrade-texte {
  background: linear-gradient(135deg, var(--x-indigo), var(--x-violet));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.x-haut .x-chapeau {
  font-size: 17.5px; color: var(--x-texte-2);
  max-width: 62ch; margin: 0 auto;
}
.x-actions {
  display: flex; flex-wrap: wrap; gap: 12px;
  justify-content: center; margin-top: 30px;
}
.x-haut .x-preuve {
  margin-top: 16px; font-family: var(--x-label);
  font-size: 13px; color: var(--x-texte-3);
}

/* ── Vitrine ─────────────────────────────────────────────────────── */

.x-vitrine {
  display: grid; grid-template-columns: 1.5fr 1fr; gap: 22px;
  padding: 24px; margin-top: 52px; text-align: start;
}
.x-vitrine-g { min-width: 0; }
.x-vitrine-d { display: flex; flex-direction: column; gap: 14px; }

.x-vitrine-tete {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 14px; margin-bottom: 18px;
}
.x-vitrine-tete h3 { font-size: 16.5px; font-weight: 600; }
.x-mention { font-family: var(--x-label); font-size: 12.5px; color: var(--x-texte-3); }

.x-compte { display: flex; align-items: baseline; gap: 11px; margin-bottom: 14px; }
.x-compte strong {
  font-family: var(--x-titre); font-size: 2.4rem; font-weight: 700;
  letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums;
}
.x-compte span { font-size: 13px; color: var(--x-texte-3); }

.x-jauge {
  height: 6px; background: var(--x-fond-2); border-radius: 999px;
  overflow: hidden; margin-bottom: 6px;
}
.x-jauge i {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--x-emeraude), var(--x-indigo));
}

.x-frise {
  position: relative; height: 42px; margin-top: 16px;
  background: var(--x-fond-2); border-radius: var(--x-r-sm); overflow: hidden;
}
/* Pas de transition sur la largeur : le segment ouvert grandit d'un
   soixantième de minute par seconde, et une transition par-dessus
   rendrait le mouvement flou au lieu de régulier. */
.x-seg { position: absolute; top: 0; bottom: 0; }
.x-curseur {
  position: absolute; top: -2px; bottom: -2px; width: 2px;
  background: var(--x-texte); z-index: 2;
}
.x-curseur span {
  position: absolute; top: 3px; inset-inline-start: 6px;
  font-family: var(--x-label); font-size: 10.5px; font-weight: 700;
  color: var(--x-fond); background: var(--x-texte);
  padding: 1px 5px; border-radius: 4px; white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.x-legende { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; }
.x-legende li {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--x-label); font-size: 12px; color: var(--x-texte-3);
}
.x-legende i { width: 10px; height: 10px; border-radius: 3px; }

.x-visage { padding: 18px; }
.x-visage-tete { display: flex; align-items: center; gap: 12px; }
.x-visage-tete strong { font-family: var(--x-label); font-size: 14px; }
.x-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  font-family: var(--x-label); font-size: 13px; font-weight: 700;
  color: #fff; background: var(--x-cta);
}

.x-mesure-barre {
  position: relative; height: 8px; margin-top: 8px;
  background: var(--x-fond-2); border-radius: 999px;
}
.x-mesure-zone {
  position: absolute; inset-block: 0; inset-inline-start: 0;
  background: var(--x-voile-e); border-radius: 999px;
}
.x-mesure-point {
  position: absolute; top: -3px; width: 14px; height: 14px;
  margin-inline-start: -7px; border-radius: 50%;
  background: var(--x-emeraude-c); border: 2px solid var(--x-carte-2);
}
.x-mesure-seuil {
  position: absolute; inset-block: -3px; width: 2px;
  background: var(--x-or);
}
.x-mesure-chiffres {
  display: flex; align-items: baseline; gap: 7px; margin-top: 12px;
}
.x-mesure-chiffres strong {
  font-family: var(--x-titre); font-size: 1.5rem; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.x-mesure-chiffres span { font-size: 13px; color: var(--x-texte-3); }

.x-mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.x-mini-stats .x-stat {
  background: var(--x-carte); border: 1px solid var(--x-bord);
  border-radius: var(--x-r); padding: 14px 16px;
}

/* ── Statistiques ────────────────────────────────────────────────── */

.x-stat { display: flex; flex-direction: column; gap: 3px; }
.x-stat strong {
  font-family: var(--x-titre); font-size: 1.85rem; font-weight: 700;
  letter-spacing: -.04em; line-height: 1.1; font-variant-numeric: tabular-nums;
}
.x-stat span {
  font-family: var(--x-label); font-size: 12.5px; color: var(--x-texte-3);
  max-width: 22ch;
}

/* ── Sections ────────────────────────────────────────────────────── */

.x-section { padding: 92px 0; }
.x-section--creuse {
  background: var(--x-fond-2);
  border-block: 1px solid var(--x-bord);
}

.x-entete { max-width: 60ch; margin-bottom: 46px; }
.x-entete--centre { margin-inline: auto; text-align: center; }
.x-sur {
  font-family: var(--x-label); font-size: 12px; font-weight: 700;
  letter-spacing: .05em; color: var(--x-indigo-clair); margin-bottom: 13px;
}
.x-entete h2 {
  font-size: clamp(1.75rem, 3.1vw, 2.35rem); font-weight: 600;
  line-height: 1.14; letter-spacing: -.025em; margin-bottom: 14px;
}
.x-entete-texte { font-size: 17px; color: var(--x-texte-2); }

/* ── Modules ─────────────────────────────────────────────────────── */

.x-modules { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.x-module {
  padding: 22px; display: flex; flex-direction: column;
  transition: border-color .18s, transform .18s;
}
.x-module:hover { border-color: var(--x-bord-fort); transform: translateY(-2px); }
.x-module h3 {
  font-family: var(--x-label); font-size: 15.5px; font-weight: 700;
  margin: 15px 0 8px;
}
.x-module p { font-size: 14px; color: var(--x-texte-2); }
.x-module-tag {
  font-family: var(--x-label); font-size: 11.5px !important;
  color: var(--x-texte-3) !important; margin-top: auto; padding-top: 16px;
}

.x-tuile {
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px; border-radius: var(--x-r);
}
.x-tuile--indigo { color: var(--x-indigo-clair); background: var(--x-voile-i); }
.x-tuile--or { color: var(--x-or-clair); background: var(--x-voile-o); }
.x-tuile--emeraude { color: var(--x-emeraude-c); background: var(--x-voile-e); }

/* ── Rôles ───────────────────────────────────────────────────────── */

.x-onglets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
.x-onglet {
  font-family: var(--x-label); font-size: 13.5px; font-weight: 600;
  color: var(--x-texte-2); background: var(--x-carte);
  border: 1px solid var(--x-bord); border-radius: 999px;
  padding: 9px 18px; cursor: pointer; transition: all .18s;
}
.x-onglet:hover { border-color: var(--x-bord-fort); color: var(--x-texte); }
.x-onglet--on {
  color: #fff; background: var(--x-cta); border-color: transparent;
  box-shadow: 0 4px 16px -5px rgba(99, 102, 241, .5);
}

.x-roles-corps {
  display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 30px;
}
.x-roles-liste { display: flex; flex-direction: column; gap: 15px; }
.x-roles-liste li {
  display: flex; align-items: flex-start; gap: 12px;
  font-size: 15.5px; color: var(--x-texte-2);
}
.x-roles-liste i {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  margin-top: 2px; color: var(--x-emeraude-c); background: var(--x-voile-e);
}

.x-graphe { min-width: 0; }
.x-barres {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 10px; align-items: end; height: 190px; margin-top: 14px;
}
.x-barre-col { display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.x-barre-col i {
  display: block; width: 100%; border-radius: var(--x-r-sm) var(--x-r-sm) 0 0;
  background: var(--x-cta); min-height: 6px;
  transition: height .9s cubic-bezier(.22, 1, .36, 1);
}
.x-barre-col span {
  font-family: var(--x-label); font-size: 11px; color: var(--x-texte-3);
  margin-top: 7px;
}
.x-barre-col b {
  font-family: var(--x-label); font-size: 12px; font-weight: 700;
  color: var(--x-texte-2); font-variant-numeric: tabular-nums;
}

/* ── Reconnaissance ──────────────────────────────────────────────── */

.x-jeu { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.x-badge { padding: 26px; text-align: center; }
.x-badge h3 {
  font-family: var(--x-label); font-size: 16px; font-weight: 700;
  margin: 16px 0 8px;
}
.x-badge p { font-size: 14.5px; color: var(--x-texte-2); }
.x-halo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 58px; height: 58px; border-radius: 50%;
}
.x-halo--or {
  color: var(--x-or-clair); background: var(--x-voile-o);
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--x-or) 9%, transparent);
}
.x-halo--emeraude {
  color: var(--x-emeraude-c); background: var(--x-voile-e);
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--x-emeraude) 9%, transparent);
}
.x-halo--indigo {
  color: var(--x-indigo-clair); background: var(--x-voile-i);
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--x-indigo) 9%, transparent);
}

/* ── Calculateur ─────────────────────────────────────────────────── */

.x-calc { padding: 30px; }
.x-calc-reglages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }

.x-reglage { display: block; }
.x-reglage-tete {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin-bottom: 9px;
}
.x-reglage-tete span { font-family: var(--x-label); font-size: 13px; color: var(--x-texte-2); }
.x-reglage-tete b {
  font-family: var(--x-titre); font-size: 17px; font-weight: 700;
  color: var(--x-texte); font-variant-numeric: tabular-nums;
}
.x-reglage input { width: 100%; accent-color: var(--x-violet); cursor: grab; }
.x-reglage--seul { margin: 4px 0 26px; }

.x-calc-sorties {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px;
  margin-top: 30px; padding-top: 26px; border-top: 1px solid var(--x-bord);
}
.x-calc-note {
  margin-top: 22px; padding-inline-start: 14px;
  border-inline-start: 2.5px solid var(--x-or);
  font-size: 14px; color: var(--x-texte-3); max-width: 76ch;
}

/* ── Le seuil ────────────────────────────────────────────────────── */

.x-mesures { padding: 32px 30px 26px; }
.x-axe { position: relative; height: 108px; border-bottom: 1px solid var(--x-bord-fort); }
.x-zone-ok {
  position: absolute; inset-block: 0; inset-inline-start: 0;
  background: var(--x-voile-e);
  border-inline-end: 1px solid var(--x-emeraude);
  transition: width .07s linear;
}
.x-point {
  position: absolute; bottom: 0; width: 15px; height: 15px;
  margin-inline-start: -7.5px; margin-bottom: -7.5px; border-radius: 50%;
  border: 2.5px solid var(--x-carte-2); z-index: 3; cursor: help;
}
.x-point--leg { background: var(--x-emeraude-c); }
.x-point--tiers { background: var(--x-rubis); }
/* Une décision fausse au seuil courant : cerclée d'or, pas recolorée.
   La couleur dit QUI est la personne, l'anneau dit si le système se
   trompe — les confondre rendrait le graphique illisible. */
.x-point--faux { box-shadow: 0 0 0 3.5px var(--x-or); }

.x-bulle {
  position: absolute; bottom: 24px; inset-inline-start: 50%;
  transform: translateX(-50%);
  font-family: var(--x-label); font-size: 11.5px; font-weight: 600;
  color: var(--x-texte); background: var(--x-fond);
  border: 1px solid var(--x-bord-fort); border-radius: var(--x-r-sm);
  padding: 5px 9px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.x-bulle b {
  display: block; color: var(--x-or-clair); font-variant-numeric: tabular-nums;
}
.x-point:hover .x-bulle, .x-point:focus-visible .x-bulle { opacity: 1; }

.x-seuil-trait {
  position: absolute; top: -8px; bottom: -1px; width: 2px;
  background: var(--x-or); z-index: 4; transition: inset-inline-start .07s linear;
}
.x-seuil-trait span {
  position: absolute; top: -25px; inset-inline-start: 50%;
  transform: translateX(-50%);
  font-family: var(--x-label); font-size: 12px; font-weight: 700;
  color: #fff; background: var(--x-or);
  padding: 2px 8px; border-radius: 5px; font-variant-numeric: tabular-nums;
}
.x[data-ambiance="sombre"] .x-seuil-trait span { color: #3E2400; }

.x-repere {
  position: absolute; top: 16px; bottom: -1px; width: 1px;
  background: var(--x-bord-fort); z-index: 1;
}
.x-repere span {
  position: absolute; top: -5px; inset-inline-start: 8px;
  font-family: var(--x-label); font-size: 11px;
  color: var(--x-texte-3); white-space: nowrap;
}

.x-graduations { position: relative; height: 24px; }
.x-graduations span {
  position: absolute; top: 6px; transform: translateX(-50%);
  font-family: var(--x-label); font-size: 11px; color: var(--x-texte-3);
  font-variant-numeric: tabular-nums;
}

.x-verdict {
  display: grid; grid-template-columns: auto auto 1fr; gap: 30px;
  align-items: start; padding-top: 24px; border-top: 1px solid var(--x-bord);
}
.x-verdict-dire { font-size: 15px; color: var(--x-texte); align-self: center; max-width: 44ch; }

.x-presets { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.x-presets button {
  font-family: var(--x-label); font-size: 13px; font-weight: 600;
  color: var(--x-texte-2); background: none;
  border: 1px solid var(--x-bord); border-radius: var(--x-r-sm);
  padding: 8px 14px; cursor: pointer; transition: all .15s;
}
.x-presets button:hover { border-color: var(--x-or); color: var(--x-or-clair); }

.x-lecons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 44px; }
.x-lecons h4 {
  font-family: var(--x-label); font-size: 15px; font-weight: 700;
  margin-bottom: 8px; padding-top: 14px; border-top: 2px solid var(--x-or);
}
.x-lecons p { font-size: 14.5px; color: var(--x-texte-2); }

/* ── Garanties ───────────────────────────────────────────────────── */

.x-garanties { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.x-garantie { padding: 24px; }
.x-garantie h3 {
  font-family: var(--x-label); font-size: 15.5px; font-weight: 700;
  color: var(--x-or-clair); margin-bottom: 9px;
}
.x-garantie p { font-size: 14.5px; color: var(--x-texte-2); }

/* ── Fin ─────────────────────────────────────────────────────────── */

/* La dernière section respire davantage : c'est le seul endroit où la
   page demande une décision. */
.x-fin { padding-bottom: 104px; }
.x-fin-titre {
  font-size: clamp(1.8rem, 3.3vw, 2.5rem); font-weight: 700;
  letter-spacing: -.03em; text-align: center; margin-bottom: 40px;
}
.x-portes { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.x-porte { padding: 34px; }
.x-porte h3 {
  font-size: 1.4rem; font-weight: 600; letter-spacing: -.025em;
  margin-bottom: 12px;
}
.x-porte p { font-size: 15.5px; color: var(--x-texte-2); margin-bottom: 24px; max-width: 42ch; }
.x-porte--cand {
  background:
    linear-gradient(160deg, var(--x-voile-i), transparent 62%), var(--x-carte-2);
}

/* ── Pied ────────────────────────────────────────────────────────── */

.x-pied { border-top: 1px solid var(--x-bord); padding: 52px 0 42px; }
.x-pied-i { display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr; gap: 34px; }
.x-pied-mention {
  font-size: 13.5px; color: var(--x-texte-3); margin-top: 14px; max-width: 40ch;
}
.x-pied-col { display: flex; flex-direction: column; gap: 10px; }
.x-pied-col h4 {
  font-family: var(--x-label); font-size: 12.5px; font-weight: 700;
  color: var(--x-texte); margin-bottom: 2px;
}
.x-pied-col a {
  font-family: var(--x-label); font-size: 13.5px;
  color: var(--x-texte-3); text-decoration: none;
}
.x-pied-col a:hover { color: var(--x-texte); }

/* ── Adaptation ──────────────────────────────────────────────────── */

@media (max-width: 1080px) {
  .x-modules { grid-template-columns: repeat(2, 1fr); }
  .x-garanties, .x-jeu, .x-lecons { grid-template-columns: repeat(2, 1fr); }
  .x-vitrine, .x-roles-corps, .x-portes { grid-template-columns: 1fr; }
  .x-pied-i { grid-template-columns: 1fr 1fr; }
  .x-verdict { grid-template-columns: auto auto; }
  .x-verdict-dire { grid-column: 1 / -1; }

  .x-hamburger { display: flex; }
  .x-nav {
    position: absolute; top: 72px; inset-inline: 0;
    flex-direction: column; gap: 0; margin: 0;
    background: var(--x-fond); border-bottom: 1px solid var(--x-bord);
    max-height: 0; overflow: hidden; transition: max-height .25s ease;
  }
  .x-nav--ouverte { max-height: 340px; }
  .x-nav a { padding: 15px 24px; border-bottom: 1px solid var(--x-bord); }
}

@media (max-width: 720px) {
  .x-cadre { padding: 0 16px; }
  .x-section, .x-haut { padding-top: 56px; padding-bottom: 56px; }
  .x-modules, .x-garanties, .x-jeu, .x-lecons,
  .x-calc-reglages, .x-calc-sorties, .x-pied-i { grid-template-columns: 1fr; }
  .x-verdict { grid-template-columns: 1fr; gap: 18px; }
  .x-mini-stats { grid-template-columns: 1fr 1fr; }
  .x-actions .x-bouton, .x-porte .x-bouton { flex: 1 1 100%; }
  .x-compte strong { font-size: 2rem; }
  .x-vitrine, .x-calc, .x-mesures, .x-roles-corps { padding: 20px 16px; }
  .x-barre-fin .x-lien-nu { display: none; }
  .x-repere span { display: none; }
  .x-annonce span { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .x *, .x *::before, .x *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
`;