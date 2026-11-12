// src/components/layout/Sidebar.tsx
//
// Navigation groupée par domaine métier. Une liste plate de douze
// entrées oblige à lire chaque libellé pour trouver la bonne ; les
// sections réduisent la recherche à deux coups d'œil.
//
// ── Ce qui change par rapport à la version précédente ──────────────
//
// 1. Un chemin cassé. `'/admin/entreprise"'` portait un guillemet
//    parasite : le lien existait, il était visible, et il ne menait
//    nulle part. C'est pour ça que la page Entreprise restait
//    introuvable.
//
// 2. Deux entrées s'appelaient « Documents ». L'une reçoit ce que le
//    salarié dépose — sa CIN, son contrat, son diplôme —, l'autre
//    produit ce que l'entreprise lui délivre — attestations,
//    certificats. Même mot, sens opposés. Elles s'appellent maintenant
//    « Pièces à valider » et « Attestations ».
//
// 3. Les libellés passent par `t()`. Les trois rôles sont traduits en
//    français, anglais et arabe.
//
// 4. L'arabe s'écrit de droite à gauche, donc la barre se pose à
//    droite. `start-0` et `border-e` suivent la direction du document
//    au lieu de la forcer à gauche.
//
// 5. La barre de défilement est masquée. Elle défile toujours — à la
//    molette, au doigt, au clavier — mais on ne la voit plus.
//
// NAV_CONFIG, les rôles et les permissions sont inchangés pour le
// reste.

import { NavLink, useNavigate } from 'react-router-dom';
import {
  Briefcase, Clock, FileText, Users, HelpCircle, LogOut, Plus,
  Calendar, Send, LayoutDashboard, UserSearch, MessageSquare,
  BookUser, CalendarCheck, Wallet, Receipt, FileSignature,
  CalendarDays, Sparkles, History, ScanFace, FolderCheck,
  Settings, Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useI18n, type Cle } from '../../i18n';
import { ROUTE_DECONNEXION } from '../../routes-auth';

interface Entree {
  /**
   * Clé de traduction, et non le libellé : la barre change de langue.
   *
   * Typée `Cle` et non `string`. C'est volontairement strict : avec
   * `string`, une clé mal orthographiée compile sans rien dire et
   * s'affiche telle quelle à l'écran — « nav.salaires » au lieu de
   * « Salariés ». Typée `Cle`, la faute est une erreur de compilation.
   */
  cle: Cle;
  // `LucideIcon` plutôt qu'un type écrit à la main : lucide a changé
  // la signature de `strokeWidth` entre deux versions, et le type
  // maison ne l'acceptait plus.
  icon: LucideIcon;
  path: string;
}

interface Section {
  cle: Cle;
  entrees: Entree[];
}

// Les icônes portent le sens de l'entrée : un même FileText répété
// sur six rubriques n'aide personne à les distinguer.
const NAV_CONFIG: Record<string, Section[]> = {

  RH: [
    {
      cle: 'nav.sec.pilotage',
      entrees: [
        { cle: 'nav.tableauBord',   icon: LayoutDashboard, path: '/admin' },
      ],
    },
    {
      cle: 'nav.sec.recrutement',
      entrees: [
        { cle: 'nav.offres',        icon: Briefcase,     path: '/job-offers' },
        { cle: 'nav.candidatures',  icon: UserSearch,    path: '/candidatures' },
        { cle: 'nav.messages',      icon: MessageSquare, path: '/messages' },
        { cle: 'nav.cooptations',   icon: Users,         path: '/admin/cooptations' },
      ],
    },
    {
      cle: 'nav.sec.personnel',
      entrees: [
        // L'icône était un calendrier, ce qui n'évoque rien d'un import
        // de fichier. Et le libellé portait « import emloyees ».
        { cle: 'nav.importSalaries', icon: Upload,       path: '/admin/import' },
        { cle: 'nav.salaries',      icon: Users,         path: '/allemployees' },
        { cle: 'nav.annuaire',      icon: BookUser,      path: '/annuaire' },
        { cle: 'nav.tempsTravail',  icon: Clock,         path: '/time-tracking' },
        { cle: 'nav.conges',        icon: CalendarCheck, path: '/admin/conges' },
        // Ce que le salarié DÉPOSE : CIN, contrat, diplôme, RIB.
        // La RH les relit et les valide.
        { cle: 'nav.piecesAValider', icon: FolderCheck,  path: '/admin/dossiers' },
      ],
    },
    {
      cle: 'nav.sec.administration',
      entrees: [
        { cle: 'nav.paie',          icon: Wallet,        path: '/payroll' },
        { cle: 'nav.notesFrais',    icon: Receipt,       path: '/frais-rh' },
        // Ce que l'entreprise DÉLIVRE : attestations de travail, de
        // salaire, de congés, certificat de travail.
        { cle: 'nav.attestations',  icon: FileSignature, path: '/documents-rh' },
        // Le guillemet parasite était ici.
        { cle: 'nav.parametresEntreprise', icon: Settings, path: '/admin/entreprise' },
      ],
    },
    {
      cle: 'nav.sec.vieEntreprise',
      entrees: [
        { cle: 'nav.evenements',    icon: CalendarDays,  path: '/evenementsAdmin' },
        { cle: 'nav.calendrier',    icon: Calendar,      path: '/calendar' },
      ],
    },
  ],

  EMPLOYE: [
    {
      cle: 'nav.sec.monEspace',
      entrees: [
        { cle: 'nav.tableauBord',   icon: LayoutDashboard, path: '/employe' },
        { cle: 'nav.facial',        icon: ScanFace,      path: '/employe/reconnaissance-faciale' },
        { cle: 'nav.mesMessages',   icon: MessageSquare, path: '/messages' },
        { cle: 'nav.monAgenda',     icon: Calendar,      path: '/employe/agenda' },
        { cle: 'nav.profil',        icon: BookUser,      path: '/employe/profile' },
      ],
    },
    {
      cle: 'nav.sec.monTemps',
      entrees: [
        { cle: 'nav.pointage',      icon: Clock,         path: '/employe/pointage' },
        { cle: 'nav.mesPointages',  icon: History,       path: '/employe/historique-pointage' },
        { cle: 'nav.mesConges',     icon: CalendarCheck, path: '/employee/conges' },
      ],
    },
    {
      cle: 'nav.sec.remuneration',
      entrees: [
        { cle: 'nav.paie',          icon: Wallet,        path: '/employe/factures' },
        { cle: 'nav.notesFrais',    icon: Receipt,       path: '/notes-frais' },
        { cle: 'nav.documents',     icon: FileSignature, path: '/employe/documents' },
      ],
    },
    {
      cle: 'nav.sec.entreprise',
      entrees: [
        { cle: 'nav.cooptations',   icon: Users,         path: '/employe/cooptation' },
        { cle: 'nav.annuaire',      icon: BookUser,      path: '/annuaire' },
        { cle: 'nav.evenements',    icon: CalendarDays,  path: '/evenements' },
      ],
    },
  ],

  CANDIDAT: [
    {
      cle: 'nav.sec.maRecherche',
      entrees: [
        { cle: 'nav.tableauBord',   icon: LayoutDashboard, path: '/dashboard' },
        { cle: 'nav.offresCandidat', icon: Briefcase,    path: '/candidat/offres' },
        { cle: 'nav.pourVous',      icon: Sparkles,      path: '/candidat/recommandations' },
        { cle: 'nav.candidatureSpontanee', icon: Send,   path: '/candidat/candidature-spontanee' },
      ],
    },
    {
      cle: 'nav.sec.monSuivi',
      entrees: [
        { cle: 'nav.mesCandidatures', icon: UserSearch,  path: '/candidat/mes-candidatures' },
        { cle: 'nav.mesEvaluations', icon: FileText,     path: '/candidat/quizzes' },
        { cle: 'nav.monAgenda',     icon: Calendar,      path: '/candidat/agenda' },
        { cle: 'nav.messages',      icon: MessageSquare, path: '/messages' },
      ],
    },
    {
      cle: 'nav.sec.monCompte',
      entrees: [
        { cle: 'nav.evenements',    icon: CalendarDays,  path: '/evenements' },
        { cle: 'nav.profil',        icon: BookUser,      path: '/candidat/profile' },
      ],
    },
  ],
};

export default function Sidebar() {
  const navigate = useNavigate();
  const { deconnexion } = useAuth();
  const { role, isRH } = usePermissions();
  const { t } = useI18n();

  const sections = NAV_CONFIG[role] ?? NAV_CONFIG.CANDIDAT;

  const handleLogout = () => {
    // On ferme la session AVANT de naviguer : si la page de
    // déconnexion ne le faisait pas elle-même, l'utilisateur
    // resterait connecté derrière un écran qui annonce le contraire.
    // Appeler `deconnexion()` deux fois est sans effet.
    deconnexion();
    navigate(ROUTE_DECONNEXION);
  };

  return (
    <aside
      // `start-0` et non `start-0` : en arabe, `document.dir` passe à
      // `rtl` et la barre doit se poser à droite. `left` l'aurait
      // clouée à gauche, par-dessus le début du texte.
      className="fixed start-0 top-0 h-screen w-64 z-40 flex flex-col
        bg-stone-100 border-e border-stone-200"
    >
      {/* ── Marque ── */}
      <div className="px-4 py-4 shrink-0">
        <NavLink
          to={isRH ? '/admin' : `/${role.toLowerCase()}`}
          className="flex items-center gap-3 px-1"
        >
          <span
            className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center
              bg-linear-to-br from-brand-500 to-violet-500
              shadow-lg shadow-brand-500/25"
          >
            <Marque />
          </span>
          <span className="min-w-0">
            {/* Le nom du produit ne se traduit pas. */}
            <span className="block font-bold text-[15px] leading-tight text-stone-800">
              HR UP
            </span>
          </span>
        </NavLink>
      </div>

      {/* ── Navigation ── */}
      <nav className="hrup-sans-ascenseur flex-1 px-3 pb-4 overflow-y-auto space-y-5">
        {sections.map((section) => (
          <div key={section.cle}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400">
              {t(section.cle)}
            </div>

            <ul className="space-y-0.5">
              {section.entrees.map(({ cle, icon: Icon, path }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    // end évite qu'une route parente reste active sur
                    // toutes ses sous-routes.
                    end={path === '/admin' || path === '/employe'}
                    className={({ isActive }) =>
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium '
                      + 'transition-all duration-150 '
                      + (isActive
                        ? 'bg-linear-to-r from-brand-500 to-violet-500 text-white '
                          + 'shadow-md shadow-brand-500/25'
                        : 'text-stone-600 hover:bg-stone-200 hover:text-stone-800')
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t(cle)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Action principale, réservée à la RH ── */}
      {isRH && (
        <div className="px-4 pb-3 shrink-0">
          <button
            onClick={() => navigate('/job-offers')}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
              text-sm font-semibold text-white
              bg-linear-to-r from-brand-500 to-violet-500
              shadow-md shadow-brand-500/25
              hover:from-brand-600 hover:to-violet-600 transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">{t('nav.publierOffre')}</span>
          </button>
        </div>
      )}

      {/* ── Pied ── */}
      <div className="px-3 py-3 border-t border-stone-200 space-y-0.5 shrink-0">
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm
            text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-all"
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('nav.aide')}</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm
            text-stone-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('nav.deconnexion')}</span>
        </button>
      </div>

      {/*
        L'ascenseur disparaît, le défilement reste : molette, doigt,
        clavier et barre d'espace fonctionnent comme avant. Les trois
        règles couvrent les trois familles de navigateurs — Firefox,
        les moteurs WebKit et Blink, et les anciens Edge.
      */}
      <style>{`
        .hrup-sans-ascenseur {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hrup-sans-ascenseur::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      `}</style>
    </aside>
  );
}

/** Un horizon, une barre de présence et un repère. Le produit mesure
 *  un passage — pas d'engrenage, pas de feuille. */
function Marque() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M3 17h18" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
      <path d="M7.5 17h9" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="17" cy="8.5" r="2.4" fill="#fff" />
    </svg>
  );
}