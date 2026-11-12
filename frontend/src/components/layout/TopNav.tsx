// src/components/layout/TopNav.tsx
//
// En-tête de l'application : retour, horloge, langue, ambiance,
// notifications, identité.
//
// ── Ce qui change dans cette version ───────────────────────────────
//
// Toute la logique des notifications est conservée telle quelle —
// chargement, compteur rafraîchi à la minute, marquage optimiste,
// fermeture au clic extérieur. Trois choses seulement bougent :
//
//  · une flèche de retour en début de barre ;
//  · le bouton d'identité ouvre le profil au lieu de déconnecter ;
//  · la déconnexion disparaît donc d'ici — elle vit dans la barre
//    latérale, et elle y est seule.
//
// ── Pourquoi l'avatar ne doit pas déconnecter ──────────────────────
//
// Dans toutes les applications qu'un jury a déjà utilisées — Gmail,
// GitHub, AWS, Office — cliquer son avatar ouvre son compte. Faire
// l'inverse coûte une session à qui clique par réflexe, et ce réflexe
// est exactement celui que l'interface a appris ailleurs. La
// déconnexion reste accessible, en bas de la barre latérale, à
// l'endroit où elle est explicitement nommée.
//
// ── Pourquoi la flèche est conditionnelle ──────────────────────────
//
// React Router inscrit un `idx` dans l'état de l'historique : 0 pour
// la première page de l'onglet. Sans ce test, la flèche s'afficherait
// sur un onglet fraîchement ouvert — et `navigate(-1)` sortirait de
// l'application, vers la page précédente du navigateur. Une flèche qui
// renvoie ailleurs est pire qu'une flèche absente.
//
// ── Et en arabe ────────────────────────────────────────────────────
//
// `rtl:rotate-180` retourne l'icône : en lecture de droite à gauche,
// « précédent » pointe à droite. La flèche se place d'elle-même au bon
// bord, parce que le header est un `flex` et que le document est en
// `dir="rtl"` — aucune classe de position à inverser.
//
// ── Le fond de la barre (inchangé) ─────────────────────────────────
//
// `bg-stone-50` et non `bg-surface` : la barre prend la couleur du
// fond de page, exactement celle de la landing page. En blanc, elle
// formait une bande distincte en haut de chaque écran ; de la même
// couleur que la page, elle se fond et ce sont les cartes qui
// ressortent.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bell, Calendar, FileText, Briefcase,
  CheckCircle2, Loader2, CheckCheck, X,
  MessageSquare,
  Receipt,
  Users,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { BasculeTheme } from '../../theme';
import { BasculeLangue, useI18n } from '../../i18n';
import { routeProfil } from '../../routes-auth';

interface Notification {
  id: string;
  type: string;
  titre: string;
  message: string;
  lu: boolean;
  creeLe: string;
  metadata?: Record<string, any>;
}

// Chaque type de notification mène quelque part : une notification sur
// laquelle on ne peut pas agir n'a pas d'utilité. Les couleurs sont
// des classes de palette et non des valeurs : elles suivent donc
// l'ambiance.
const CONFIG: Record<string, {
  icone: any; teinte: string; fond: string; lien?: (m: any) => string;
}> = {
  ENTRETIEN_PLANIFIE: { icone: Calendar,     teinte: 'text-violet-600',  fond: 'bg-violet-50',  lien: () => '/candidat/agenda' },
  RAPPEL_ENTRETIEN:   { icone: Calendar,     teinte: 'text-violet-600',  fond: 'bg-violet-50',  lien: () => '/candidat/agenda' },
  QUIZ_ENVOYE:        { icone: FileText,     teinte: 'text-green-600',   fond: 'bg-green-50',   lien: (m) => `/candidat/quiz/${m?.quizId}` },
  RAPPEL_QUIZ:        { icone: FileText,     teinte: 'text-amber-600',   fond: 'bg-amber-50',   lien: (m) => `/candidat/quiz/${m?.quizId}` },
  QUIZ_TERMINE:       { icone: CheckCircle2, teinte: 'text-green-600',   fond: 'bg-green-50',   lien: () => '/candidatures' },
  CONGE_TRAITE:       { icone: Calendar,     teinte: 'text-green-600',   fond: 'bg-green-50',   lien: () => '/employe/conges' },
  CANDIDATURE:        { icone: Briefcase,    teinte: 'text-blue-600',    fond: 'bg-blue-50',    lien: () => '/candidatures' },


  // ── Messagerie ──

  MESSAGE:            { icone: MessageSquare, teinte: 'text-blue-600',   fond: 'bg-blue-50',
    lien: (m) => {
      const fil = m?.filId ?? m?.conversationId ?? m?.threadId;
      return fil ? `/messages?fil=${encodeURIComponent(String(fil))}` : '/messages';
    } },

  NOTE_FRAIS:         { icone: Receipt,       teinte: 'text-amber-600',  fond: 'bg-amber-50',  lien: () => '/notes-frais' },


  EVENEMENT:          { icone: Users,         teinte: 'text-blue-600',   fond: 'bg-blue-50',   lien: () => '/evenements' },

};



const DEFAUT = { icone: Bell, teinte: 'text-stone-500', fond: 'bg-stone-100' };

function depuis(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function PanneauNotifications({ onFermer }: { onFermer: () => void }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/notifications/me') as any;
        setNotifications(res?.data?.notifications ?? []);
      } catch (e) {
        console.error('Chargement des notifications :', e);
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const ouvrir = async (n: Notification) => {
    // Marquée localement sans attendre la réponse : l'utilisateur ne
    // doit pas patienter pour naviguer.
    if (!n.lu) {
      setNotifications((liste) =>
        liste.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
      api.put(`/notifications/${n.id}/lue`).catch(() => {});
    }

    const config = CONFIG[n.type];
    const lien = config?.lien?.(n.metadata);
    if (lien && !lien.includes('undefined')) {
      onFermer();
      navigate(lien);
    }
  };

  const toutMarquer = async () => {
    setNotifications((liste) => liste.map((n) => ({ ...n, lu: true })));
    api.put('/notifications/lire-tout').catch(() => {});
  };

  const nonLues = notifications.filter((n) => !n.lu).length;

  return (
    <div
      className="absolute end-0 top-12 w-96 z-50 overflow-hidden
        bg-surface rounded-2xl border border-stone-200 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3
        border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-stone-800">Notifications</h3>
          {nonLues > 0 && (
            <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full
              bg-brand-500">
              {nonLues}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {nonLues > 0 && (
            <button
              onClick={toutMarquer}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1
                text-brand-texte hover:underline"
              title="Tout marquer comme lu"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tout lire
            </button>
          )}
          <button onClick={onFermer} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {chargement ? (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="w-5 h-5 animate-spin mb-2 text-brand-texte" />
            <p className="text-xs text-stone-400">Chargement…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="w-7 h-7 mx-auto mb-2 text-stone-300" />
            <p className="text-sm text-stone-400">Aucune notification</p>
          </div>
        ) : (
          notifications.map((n) => {
            const config = CONFIG[n.type] ?? DEFAUT;
            const Icone = config.icone;
            const cliquable = !!(config as any).lien;

            return (
              <div
                key={n.id}
                onClick={() => ouvrir(n)}
                className={'flex items-start gap-3 px-4 py-3 border-b border-stone-100 '
                  + 'last:border-0 transition-colors '
                  + (cliquable ? 'cursor-pointer hover:bg-stone-50 ' : '')
                  // Une notification non lue se distingue par un fond
                  // teinté plutôt que par la seule graisse du titre :
                  // la graisse seule se repère mal sur fond sombre.
                  + (n.lu ? '' : 'bg-brand-50/60')}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                  shrink-0 ${config.fond}`}>
                  <Icone className={`w-4 h-4 ${config.teinte}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className={'text-sm truncate text-stone-800 '
                      + (n.lu ? 'font-normal' : 'font-semibold')}>
                      {n.titre}
                    </span>
                    {!n.lu && (
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5 bg-brand-500" />
                    )}
                  </div>
                  <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-stone-400 mt-1">{depuis(n.creeLe)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function TopNav() {
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const [horloge, setHorloge] = useState(() => new Date());

  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const { key } = useLocation();
  const conteneur = useRef<HTMLDivElement>(null);

  const initials = user
    ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase()
    : 'RH';

  // `fmt.heure` rend « 15:53 » en français et « 03:53 م » en arabe.
  // On sépare les chiffres du marqueur matin/après-midi pour pouvoir
  // insérer les secondes au bon endroit.
  const [chiffres, suffixe] = useMemo(() => {
    const brut = fmt.heure(horloge);
    const i = brut.search(/[^\d\s:\u0660-\u0669]/);
    return i === -1 ? [brut, ''] : [brut.slice(0, i).trim(), brut.slice(i).trim()];
  }, [fmt, horloge]);

  // Y a-t-il une page précédente DANS l'application ? Recalculé à
  // chaque navigation : `key` change à chaque entrée d'historique.
  const peutReculer = useMemo(
    () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0,
    [key],
  );

  // Seul le compteur est rafraîchi périodiquement : recharger la liste
  // entière toutes les minutes serait inutilement coûteux.
  const compter = useCallback(async () => {
    try {
      const res = await api.get('/notifications/me') as any;
      setNonLues(res?.data?.nonLues ?? 0);
    } catch {
      /* silencieux : un échec ne doit pas perturber la navigation */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    compter();
    const intervalle = setInterval(compter, 60_000);
    return () => clearInterval(intervalle);
  }, [user, compter]);

  useEffect(() => {
    const t = setInterval(() => setHorloge(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!panneauOuvert) return;
    const surClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) {
        setPanneauOuvert(false);
      }
    };
    document.addEventListener('mousedown', surClic);
    return () => document.removeEventListener('mousedown', surClic);
  }, [panneauOuvert]);

  const basculer = () => {
    setPanneauOuvert((ouvert) => {
      // Le compteur se remet à jour à la fermeture : les notifications
      // consultées viennent d'être marquées comme lues.
      if (ouvert) compter();
      return !ouvert;
    });
  };

  return (
    <header
          className="fixed top-0 start-64 end-0 h-16 z-30 flex items-center gap-3 px-6
        bg-stone-50 border-b border-stone-200"
    >
      {/* ── Retour ──
          Affichée seulement s'il existe une page précédente dans
          l'application ; voir l'en-tête du fichier. */}
      {peutReculer && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-stone-100 transition-colors shrink-0"
          title={t('nav.retour')}
          aria-label={t('nav.retour')}
        >
          <ArrowLeft className="w-5 h-5 text-stone-500 rtl:rotate-180" />
        </button>
      )}

      {/* ── Horloge ──
          L'heure du poste, et c'est écrit : le pointage est horodaté
          par le serveur, et laisser croire le contraire ferait
          contester un retard d'une minute. */}
      <div className="hidden md:flex items-center gap-2.5 ps-3 pe-4 py-1.5 rounded-full
        bg-stone-100 border border-stone-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 pouls" />
        <span className="text-[11px] text-stone-500">{t('nav.heurePoste')}</span>
        {/* Une heure se lit de gauche à droite dans toutes les
            langues, d'où `dir="ltr"`. Et les secondes se glissent
            juste après les minutes, AVANT le « م » de l'arabe :
            collées à la fin de la chaîne traduite, elles s'affichaient
            « 03:53 م :50 ». */}
        <time dir="ltr" className="text-sm font-semibold text-stone-800">
          {chiffres}
          <span className="text-stone-400">
            :{String(horloge.getSeconds()).padStart(2, '0')}
          </span>
          {suffixe && <span className="ms-1 text-stone-500">{suffixe}</span>}
        </time>
      </div>

      <div className="flex-1" />

      <BasculeLangue />
      <BasculeTheme />

      <div className="flex items-center gap-2">
        <div className="relative" ref={conteneur}>
          <button
            onClick={basculer}
            className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors"
            title={nonLues > 0 ? `${nonLues} notification(s) non lue(s)` : 'Notifications'}
          >
            <Bell className="w-5 h-5 text-stone-500" />
            {nonLues > 0 && (
              <span className="absolute -top-0.5 -end-0.5 min-w-4 h-4 px-1 rounded-full
                flex items-center justify-center text-[10px] font-bold text-white
                bg-red-500">
                {nonLues > 9 ? '9+' : nonLues}
              </span>
            )}
          </button>

          {panneauOuvert && (
            <PanneauNotifications onFermer={() => { setPanneauOuvert(false); compter(); }} />
          )}
        </div>

        {/* ── Identité ──
            Ouvre le profil. La déconnexion est dans la barre latérale,
            et nulle part ailleurs. */}
        <button
          type="button"
          onClick={() => navigate(routeProfil(user?.role))}
          className="flex items-center gap-2.5 ps-1 pe-3 py-1 rounded-full
            hover:bg-stone-100 transition-colors"
          title={t('nav.monProfil')}
        >
          <span className="w-8 h-8 rounded-full flex items-center justify-center
            text-white text-xs font-bold
            bg-linear-to-br from-brand-500 to-violet-500">
            {initials}
          </span>
          <span className="text-start hidden sm:block">
            <span className="block text-xs font-semibold text-stone-800 leading-tight">
              {user ? `${user.prenom} ${user.nom}` : 'Utilisateur'}
            </span>
            <span className="block text-[10px] text-stone-500 leading-tight">
              {user?.role === 'RH' ? 'Ressources humaines'
                : user?.role === 'EMPLOYE' ? (user?.departement || 'Employé')
                  : 'Candidat'}
            </span>
          </span>
        </button>
      </div>
    </header>
  );
}