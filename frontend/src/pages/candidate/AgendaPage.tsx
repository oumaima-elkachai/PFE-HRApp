// src/pages/candidate/AgendaPage.tsx
//
// Entretiens, échéances de quiz et événements auxquels le candidat
// s'est inscrit, sur un même agenda. Une fois inscrit, un événement
// engage autant qu'un entretien : il a sa place ici.
//
// La page Événements reste le catalogue de ce qui est proposé.
//
// ── Ce qui a changé ─────────────────────────────────────────────────
//
// Les composants recopiés viennent du kit, et les trois couleurs de
// nature de rendez-vous aussi : elles étaient déclarées ici en
// hexadécimal, et une deuxième fois dans le tableau de bord.
//
// Le nom « hr-up » subsistait dans la clé de stockage local et
// dans le nom du fichier exporté. La clé change donc de nom : les
// rappels masqués avant la mise à jour réapparaissent une fois, puis
// se masquent à nouveau. C'est préférable à deux clés qui coexistent.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, ChevronLeft, ChevronRight, Video, MapPin, Phone, FileText,
  Clock, AlertTriangle, Download, CalendarDays, List, X, Search,
  Hourglass, CalendarCheck, ArrowRight,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import {
  EnTete, StatCard, Section, Toast, Vide, Squelette, CARTE, ton,
} from '../../components/ui/kit';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

type TypeEvenement = 'ENTRETIEN' | 'QUIZ' | 'EVENEMENT';

interface EvenementAgenda {
  id: string;
  type: TypeEvenement;
  titre: string;
  dateHeure: string;
  dureeMinutes: number;
  sousType?: 'TELEPHONE' | 'VIDEO' | 'SUR_SITE';
  lieu?: string | null;
  lienVideo?: string | null;
  quizId?: string | null;
  offreTitre?: string;
  nombreQuestions?: number;
  statut: string;
  jours: number;
  passe: boolean;
  alerte?: { niveau: 'urgent' | 'attention' | 'info'; texte: string } | null;
}

interface Alerte {
  id: string;
  type: string;
  niveau: 'urgent' | 'attention' | 'info';
  texte: string;
  dateHeure: string;
  quizId: string | null;
}

// Les niveaux d'alerte, rapportés aux tons communs.
const TON_ALERTE: Record<string, string> = {
  urgent: 'red', attention: 'amber', info: 'bleu',
};

const ICONE_ENTRETIEN: Record<string, React.ComponentType<{ className?: string }>> = {
  TELEPHONE: Phone, VIDEO: Video, SUR_SITE: MapPin,
};

// Trois natures, trois tons : un quiz n'est pas un entretien, et un
// événement auquel on s'est inscrit n'est ni l'un ni l'autre.
const NATURE: Record<TypeEvenement, {
  libelle: string; icone: React.ComponentType<{ className?: string }>; tonalite: string;
}> = {
  ENTRETIEN: { libelle: 'Entretien',  icone: Video,         tonalite: 'violet' },
  QUIZ:      { libelle: 'Quiz',       icone: FileText,      tonalite: 'brand' },
  EVENEMENT: { libelle: 'Événement',  icone: CalendarCheck, tonalite: 'bleu' },
};

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Date calendaire sans conversion UTC : toISOString décalerait d'un
// jour dans le fuseau tunisien.
const cleJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Jours calendaires, pas horaires : « demain à 9 h » reste demain. */
const joursAvant = (iso: string) => {
  const cible = new Date(iso);
  const jour = new Date();
  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate());
  return Math.round((a - b) / 86400000);
};

// Les rappels masqués sont retenus d'une session à l'autre : les
// revoir à chaque visite leur ferait perdre leur valeur d'alerte.
const CLE_MASQUES = 'hrup-rappels-masques';

function lireMasques(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_MASQUES) ?? '[]');
  } catch {
    return [];
  }
}

// ── Ligne d'un événement ───────────────────────────────────────────

function LigneEvenement({ evenement, onOuvrir, delai }: {
  evenement: EvenementAgenda;
  onOuvrir: (e: EvenementAgenda) => void;
  delai: number;
}) {
  const nature = NATURE[evenement.type] ?? NATURE.ENTRETIEN;
  const t = ton(nature.tonalite);

  const Icone = evenement.type === 'ENTRETIEN'
    ? (ICONE_ENTRETIEN[evenement.sousType ?? 'VIDEO'] ?? Calendar)
    : nature.icone;

  const urgent = evenement.alerte?.niveau === 'urgent';
  const date = new Date(evenement.dateHeure);

  return (
    <div
      onClick={() => onOuvrir(evenement)}
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter bg-surface rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${
        urgent ? 'border-red-200' : 'border-stone-100'
      } ${evenement.passe ? 'opacity-60' : ''}`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${urgent ? 'bg-red-400' : t.barre}`} />

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* La date en pavé : repérer un jour dans une liste est
                  plus rapide qu'en lisant une phrase complète. */}
              <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${t.bg}`}>
                <span className={`text-sm font-bold leading-none ${t.text}`}>
                  {date.getDate()}
                </span>
                <span className="text-[8px] text-stone-400 uppercase mt-0.5">
                  {MOIS[date.getMonth()].slice(0, 3)}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-stone-800">{evenement.titre}</h4>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
                    <Icone className="w-2.5 h-2.5" />
                    {nature.libelle}
                  </span>
                </div>
                {/* Le sous-titre est tu quand il répète le titre :
                    un événement porte son type ici, et le type vaut
                    souvent le titre. */}
                {(() => {
                  const sousTitre = evenement.offreTitre
                    ?? (evenement.type === 'QUIZ' ? 'Quiz technique' : 'Entretien de recrutement');
                  if (sousTitre === evenement.titre) return null;
                  return (
                    <p className="text-xs text-brand-texte font-semibold mt-0.5 truncate">
                      {sousTitre}
                    </p>
                  );
                })()}
              </div>
            </div>

            {!evenement.passe && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 shrink-0">
                {evenement.jours === 0 ? "Aujourd'hui"
                  : evenement.jours === 1 ? 'Demain'
                  : `J-${evenement.jours}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-x-5 gap-y-2 text-xs text-stone-500 flex-wrap">
            <span className="font-medium text-stone-700 first-letter:uppercase">
              {date.toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              {evenement.dureeMinutes} min
            </span>
            {evenement.lieu && (
              <span className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span className="truncate">{evenement.lieu}</span>
              </span>
            )}
            {evenement.lienVideo && (
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-stone-400" />
                En ligne
              </span>
            )}
            {evenement.type === 'QUIZ' && evenement.nombreQuestions && (
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-stone-400" />
                {evenement.nombreQuestions} questions
              </span>
            )}
          </div>

          {evenement.alerte && (() => {
            const ta = ton(TON_ALERTE[evenement.alerte.niveau] ?? 'stone');
            return (
              <div className={`flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 mt-3 ${ta.bg} ${ta.text}`}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {evenement.alerte.texte}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function AgendaPage() {
  const navigate = useNavigate();

  const [evenements, setEvenements] = useState<EvenementAgenda[]>([]);
  const [passes, setPasses] = useState<EvenementAgenda[]>([]);
  const [inscriptions, setInscriptions] = useState<EvenementAgenda[]>([]);
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [masques, setMasques] = useState<string[]>(lireMasques);
  const [chargement, setChargement] = useState(true);
  const [toast, setToast] = useState('');

  const [affichage, setAffichage] = useState<'liste' | 'mois'>('liste');
  const [recherche, setRecherche] = useState('');

  const [moisAffiche, setMoisAffiche] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    (async () => {
      // Deux sources, tolérantes à l'échec de l'une : un événement
      // indisponible ne doit pas masquer les entretiens.
      const [resAgenda, resEvenements] = await Promise.allSettled([
        api.get('/candidat/agenda') as any,
        api.get('/evenements') as any,
      ]);

      if (resAgenda.status === 'fulfilled') {
        setEvenements(resAgenda.value?.data?.evenements ?? []);
        setPasses(resAgenda.value?.data?.passes ?? []);
        setAlertes(resAgenda.value?.data?.alertes ?? []);
      }

      // Seules les inscriptions entrent dans l'agenda : le reste du
      // catalogue appartient à la page Événements.
      if (resEvenements.status === 'fulfilled') {
        const liste: any[] = [
          ...(resEvenements.value?.data?.evenements ?? []),
          ...(resEvenements.value?.data?.passes ?? []),
        ];

        setInscriptions(
          liste
            .filter((e) => e.inscrit)
            .map((e): EvenementAgenda => ({
              id: `evenement-${e.id}`,
              type: 'EVENEMENT',
              titre: e.titre,
              dateHeure: e.dateDebut,
              dureeMinutes: Math.max(
                0,
                Math.round(
                  (new Date(e.dateFin).getTime() - new Date(e.dateDebut).getTime()) / 60000
                )
              ),
              lieu: e.lieu,
              lienVideo: e.lienVisio,
              offreTitre: e.typeLibelle,
              statut: e.statut,
              jours: joursAvant(e.dateDebut),
              passe: new Date(e.dateDebut).getTime() < Date.now(),
              alerte: e.obligatoire && new Date(e.dateDebut).getTime() >= Date.now()
                ? { niveau: 'attention' as const, texte: 'Participation obligatoire' }
                : null,
            }))
        );
      }

      setChargement(false);
    })();
  }, []);

  // Un rappel masqué ne revient pas : le revoir à chaque visite lui
  // ferait perdre sa valeur d'alerte.
  const masquer = (id: string) => {
    const suivants = [...masques, id];
    setMasques(suivants);
    try {
      localStorage.setItem(CLE_MASQUES, JSON.stringify(suivants));
    } catch {
      // Stockage indisponible : le masquage vaut pour cette session.
    }
  };

  const alertesVisibles = useMemo(
    () => alertes.filter((a) => !masques.includes(a.id)),
    [alertes, masques]
  );

  const aVenir = useMemo(
    () => [...evenements, ...inscriptions.filter((e) => !e.passe)]
      .sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure))),
    [evenements, inscriptions]
  );

  const tousPasses = useMemo(
    () => [...passes, ...inscriptions.filter((e) => e.passe)]
      .sort((a, b) => String(b.dateHeure).localeCompare(String(a.dateHeure))),
    [passes, inscriptions]
  );

  // Regroupement par jour, calculé une seule fois par changement de
  // liste plutôt qu'à chaque rendu du calendrier.
  const parJour = useMemo(() => {
    const carte = new Map<string, EvenementAgenda[]>();
    for (const e of [...aVenir, ...tousPasses]) {
      const cle = cleJour(new Date(e.dateHeure));
      carte.set(cle, [...(carte.get(cle) ?? []), e]);
    }
    return carte;
  }, [aVenir, tousPasses]);

  const ouvrir = (e: EvenementAgenda) => {
    if (e.type === 'QUIZ' && e.quizId) navigate(`/candidat/quiz/${e.quizId}`);
    else if (e.type === 'EVENEMENT' && !e.lienVideo) navigate('/evenements');
    else if (e.lienVideo) window.open(e.lienVideo, '_blank', 'noopener');
  };

  const telechargerIcs = async () => {
    try {
      const blob = await api.get('/candidat/agenda.ics', {
        responseType: 'blob',
      }) as unknown as Blob;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hrup-agenda.ics';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setToast('Agenda exporté');
    } catch {
      // Un alert() natif romprait la cohérence de l'interface.
      setToast("Impossible de générer le fichier d'agenda");
    }
  };

  // Grille du mois, commençant un lundi.
  const grille = useMemo(() => {
    const premier = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
    const dernier = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0);

    // getDay() renvoie 0 pour dimanche : décalage pour une semaine
    // commençant le lundi, comme en France et en Tunisie.
    const decalage = (premier.getDay() + 6) % 7;

    const cases: (Date | null)[] = Array(decalage).fill(null);
    for (let j = 1; j <= dernier.getDate(); j += 1) {
      cases.push(new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), j));
    }
    while (cases.length % 7 !== 0) cases.push(null);

    return cases;
  }, [moisAffiche]);

  const aujourdhui = cleJour(new Date());

  const correspond = (e: EvenementAgenda) => {
    const terme = recherche.trim().toLowerCase();
    return !terme || `${e.titre} ${e.offreTitre ?? ''} ${e.lieu ?? ''}`
      .toLowerCase().includes(terme);
  };

  const aVenirFiltres = useMemo(() => aVenir.filter(correspond), [aVenir, recherche]);
  const passesFiltres = useMemo(() => tousPasses.filter(correspond), [tousPasses, recherche]);

  const nbEntretiens = aVenir.filter((e) => e.type === 'ENTRETIEN').length;
  const nbQuiz = aVenir.filter((e) => e.type === 'QUIZ').length;
  const nbInscriptions = aVenir.filter((e) => e.type === 'EVENEMENT').length;
  const urgents = alertesVisibles.filter((a) => a.niveau === 'urgent').length;
  const prochain = aVenir[0];

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <EnTete
          fil={['Mon suivi', 'Mon agenda']}
          titre="Mon agenda"
          sousTitre={chargement ? 'Chargement…' : prochain ? (
            <>
              Prochain rendez-vous :{' '}
              <span className="text-brand-texte font-semibold">{prochain.titre}</span>
              {' '}
              {prochain.jours === 0 ? "aujourd'hui"
                : prochain.jours === 1 ? 'demain'
                : `dans ${prochain.jours} jours`}
            </>
          ) : 'Aucun rendez-vous à venir'}
        >
          {affichage === 'mois' && (
            <button
              onClick={() => {
                const d = new Date();
                setMoisAffiche(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Aujourd'hui
            </button>
          )}

          <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1">
            {([['liste', List], ['mois', CalendarDays]] as
              ['liste' | 'mois', React.ComponentType<{ className?: string }>][])
              .map(([mode, Icone]) => (
                <button
                  key={mode}
                  onClick={() => setAffichage(mode)}
                  aria-label={mode === 'liste' ? 'Affichage en liste' : 'Affichage par mois'}
                  className={`p-2 rounded-lg transition-colors ${
                    affichage === mode ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  <Icone className="w-4 h-4" />
                </button>
              ))}
          </div>

          <button
            onClick={telechargerIcs}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 sm:px-5 py-2 rounded-xl transition-colors"
            title="Ajouter à Google Agenda, Outlook ou Apple Calendrier"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </EnTete>

        <div className="px-4 sm:px-8 py-6 sm:py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Calendar}
              label="Rendez-vous à venir"
              value={chargement ? '…' : aVenir.length}
              sub="entretiens, quiz et événements"
              tonalite="brand"
              delai={0}
            />
            <StatCard
              icon={Video}
              label="Entretiens"
              value={chargement ? '…' : nbEntretiens}
              sub="téléphone, visio ou sur site"
              tonalite="violet"
              delai={60}
            />
            <StatCard
              icon={CalendarCheck}
              label="Mes inscriptions"
              value={chargement ? '…' : nbInscriptions}
              sub="événements rejoints"
              tonalite="bleu"
              delai={120}
            />
            <StatCard
              icon={Hourglass}
              label="Échéances de quiz"
              value={chargement ? '…' : nbQuiz}
              sub={urgents > 0
                ? `${urgents} rappel${urgents > 1 ? 's' : ''} urgent${urgents > 1 ? 's' : ''}`
                : "rien d’urgent"}
              tonalite="amber"
              alerte={urgents > 0}
              delai={180}
            />
          </div>

          {/* Les rappels sont placés en tête : c'est l'information qui
              demande une action, elle ne doit pas être à chercher.
              Chacun se masque, et le masquage est retenu. */}
          {alertesVisibles.length > 0 && (
            <div className="space-y-2 mb-6">
              {alertesVisibles.map((a) => {
                const t = ton(TON_ALERTE[a.niveau] ?? 'stone');
                return (
                  <div
                    key={a.id}
                    className={`hrup-monter flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border ${t.bg} ${t.text} ${t.bord}`}
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />

                    <button
                      onClick={() => a.quizId && navigate(`/candidat/quiz/${a.quizId}`)}
                      disabled={!a.quizId}
                      className="flex-1 flex items-center gap-2 text-start font-medium disabled:cursor-default min-w-0"
                    >
                      <span className="flex-1">{a.texte}</span>
                      {a.quizId && <ChevronRight className="w-4 h-4 shrink-0" />}
                    </button>

                    <button
                      onClick={() => masquer(a.id)}
                      className="p-1 rounded-lg hover:bg-surface/60 shrink-0 transition-colors"
                      title="Masquer ce rappel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {chargement ? (
            <Squelette nombre={4} hauteur="h-28" />
          ) : affichage === 'mois' ? (
            <div className={`${CARTE} overflow-hidden`}>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                <button
                  onClick={() => setMoisAffiche(
                    new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() - 1, 1)
                  )}
                  aria-label="Mois précédent"
                  className="p-2 hover:bg-surface rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-500" />
                </button>

                <h3 className="font-bold text-stone-800">
                  {MOIS[moisAffiche.getMonth()]} {moisAffiche.getFullYear()}
                </h3>

                <button
                  onClick={() => setMoisAffiche(
                    new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 1)
                  )}
                  aria-label="Mois suivant"
                  className="p-2 hover:bg-surface rounded-xl transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-stone-100">
                {JOURS.map((j) => (
                  <div
                    key={j}
                    className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-stone-400"
                  >
                    {j}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {grille.map((jour, i) => {
                  if (!jour) {
                    return (
                      <div
                        key={`vide-${i}`}
                        className="min-h-20 sm:min-h-26 bg-stone-50/40 border-b border-e border-stone-100"
                      />
                    );
                  }

                  const cle = cleJour(jour);
                  const duJour = parJour.get(cle) ?? [];
                  const estAujourdhui = cle === aujourdhui;
                  const weekend = [5, 6].includes((jour.getDay() + 6) % 7);

                  return (
                    <div
                      key={cle}
                      className={`min-h-20 sm:min-h-26 p-1.5 sm:p-2 border-b border-e border-stone-100 ${
                        weekend ? 'bg-stone-50/50' : ''
                      }`}
                    >
                      <div
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold mb-1.5 ${
                          estAujourdhui ? 'bg-brand-500 text-white' : 'text-stone-600'
                        }`}
                      >
                        {jour.getDate()}
                      </div>

                      {/* Les cases portent le titre, pas une pastille
                          de six pixels : un calendrier se lit. */}
                      <div className="space-y-1">
                        {duJour.slice(0, 2).map((e) => {
                          const t = ton((NATURE[e.type] ?? NATURE.ENTRETIEN).tonalite);
                          return (
                            <button
                              key={e.id}
                              onClick={() => ouvrir(e)}
                              className={`w-full flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold truncate text-start ${t.bg} ${t.text}`}
                              title={`${e.titre} — ${new Date(e.dateHeure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                            >
                              <span
                                className="w-1 h-1 rounded-full shrink-0"
                                style={{ backgroundColor: t.pastille }}
                              />
                              <span className="truncate">{e.titre}</span>
                            </button>
                          );
                        })}

                        {duJour.length > 2 && (
                          <div className="text-[9px] text-stone-400 font-bold ps-1.5">
                            +{duJour.length - 2} autre{duJour.length - 2 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 px-5 py-3 border-t border-stone-100 bg-stone-50 text-[10px] text-stone-400 flex-wrap">
                {(['ENTRETIEN', 'QUIZ', 'EVENEMENT'] as TypeEvenement[]).map((type) => (
                  <span key={type} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: ton(NATURE[type].tonalite).pastille }}
                    />
                    {NATURE[type].libelle}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">

              {/* Recherche au-dessus de la liste, quand il y a de quoi
                  chercher : un champ sur une liste vide est du bruit. */}
              {(aVenir.length + tousPasses.length) > 3 && (
                <div className="relative w-full max-w-sm">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Poste, lieu…"
                    className="w-full ps-9 pe-8 py-2.5 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  {recherche && (
                    <button
                      onClick={() => setRecherche('')}
                      aria-label="Effacer la recherche"
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                    >
                      <X className="w-3.5 h-3.5 text-stone-400" />
                    </button>
                  )}
                </div>
              )}

              <Section icone={Calendar} titre="À venir" compteur={aVenirFiltres.length}>
                {aVenirFiltres.length === 0 ? (
                  <Vide
                    icone={Calendar}
                    message={recherche
                      ? `Aucun rendez-vous ne correspond à « ${recherche} »`
                      : 'Aucun rendez-vous à venir'}
                    action={!recherche && (
                      <button
                        onClick={() => navigate('/evenements')}
                        className="text-sm font-bold text-brand-texte hover:underline"
                      >
                        Parcourir les événements
                      </button>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {aVenirFiltres.map((e, i) => (
                      <LigneEvenement
                        key={e.id}
                        evenement={e}
                        onOuvrir={ouvrir}
                        delai={i * 60}
                      />
                    ))}
                  </div>
                )}
              </Section>

              {passesFiltres.length > 0 && (
                <Section icone={Clock} titre="Passés" compteur={passesFiltres.length}>
                  <div className="space-y-3">
                    {passesFiltres.slice(0, 5).map((e, i) => (
                      <LigneEvenement
                        key={e.id}
                        evenement={e}
                        onOuvrir={ouvrir}
                        delai={i * 60}
                      />
                    ))}
                  </div>

                  {passesFiltres.length > 5 && (
                    <p className="text-xs text-stone-400 mt-3 text-center">
                      {passesFiltres.length - 5} rendez-vous plus anciens non affichés
                    </p>
                  )}
                </Section>
              )}

              {/* ── Export et lien vers le catalogue ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${CARTE} p-5`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Download className="w-4 h-4 text-brand-texte" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Synchroniser
                    </h4>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Le fichier exporté s'ouvre dans Google Agenda, Outlook ou Apple
                    Calendrier, avec vos rappels.
                  </p>
                </div>

                {/* Cet agenda porte ce qui engage ; le catalogue vit
                    sur la page Événements. */}
                <div className={`${CARTE} p-5 flex items-start justify-between gap-3`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarCheck className="w-4 h-4 text-brand-texte" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        Événements proposés
                      </h4>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      Cet agenda ne montre que ce qui vous engage. Les formations et
                      rencontres ouvertes sont sur la page Événements.
                    </p>
                  </div>

                  <button
                    onClick={() => navigate('/evenements')}
                    className="p-2 rounded-xl bg-stone-50 hover:bg-brand-500 hover:text-white text-stone-500 transition-colors shrink-0"
                    title="Parcourir les événements"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}