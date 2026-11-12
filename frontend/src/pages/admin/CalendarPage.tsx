// src/pages/admin/CalendarPage.tsx
//
// Agenda unifié : entretiens, événements et congés approuvés sur le
// même calendrier. Trois sources, une seule vue, parce que la RH ne
// planifie pas un entretien sans savoir qui est absent ce jour-là.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Users, Video, MapPin,
  CalendarDays, X, ChevronRight as Fleche, Clock, Palmtree,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import api from '@/services/api';

const FOND = 'transparent';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

type TypeEntree = 'entretien' | 'evenement' | 'conge';

interface Entree {
  id: string;
  type: TypeEntree;
  date: string;
  dateFin?: string;
  titre: string;
  detail: string;
  heure?: string;
  lieu?: string;
  visio?: boolean;
  nbInscrits?: number;
}

const STYLE_TYPE: Record<TypeEntree, {
  libelle: string; bg: string; text: string; pastille: string; icone: any;
}> = {
  entretien: {
    libelle: 'Entretien', bg: 'bg-blue-50', text: 'text-blue-600',
    pastille: 'bg-blue-400', icone: Users,
  },
  evenement: {
    libelle: 'Événement', bg: 'bg-brand-500/10', text: 'text-brand-texte',
    pastille: 'bg-brand-500', icone: CalendarDays,
  },
  conge: {
    libelle: 'Congé', bg: 'bg-amber-50', text: 'text-amber-600',
    pastille: 'bg-amber-400', icone: Palmtree,
  },
};

const cleJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const estAujourdhui = (d: Date) => cleJour(d) === cleJour(new Date());

/** Un appel qui échoue ne doit pas vider l'agenda entier. */
const lister = (url: string, cle: string) =>
  api.get(url)
    .then((r: any) => (r?.data?.[cle] ?? []) as any[])
    .catch(() => [] as any[]);

// ── Panneau du jour sélectionné ────────────────────────────────────
function PanneauJour({ date, entrees, onFermer }: {
  date: Date;
  entrees: Entree[];
  onFermer: () => void;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 shrink-0 flex items-start justify-between">
        <div>
          <h3 className="font-bold text-stone-800 text-sm">
            {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {entrees.length === 0
              ? 'Rien de prévu'
              : `${entrees.length} élément${entrees.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={onFermer} className="p-1.5 hover:bg-surface rounded-lg transition-colors">
          <X className="w-4 h-4 text-stone-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {entrees.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="w-7 h-7 mx-auto mb-2 text-stone-300" />
            <p className="text-xs text-stone-400">Journée libre</p>
          </div>
        ) : (
          entrees.map((e) => {
            const style = STYLE_TYPE[e.type];
            const Icone = style.icone;
            return (
              <div
                key={e.id}
                className={`rounded-xl p-3 border border-stone-100 ${style.bg}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${style.text}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-stone-800">{e.titre}</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">{e.detail}</div>

                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-stone-400 flex-wrap">
                      {e.heure && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {e.heure}
                        </span>
                      )}
                      {e.lieu && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {e.lieu}
                        </span>
                      )}
                      {e.visio && (
                        <span className="flex items-center gap-1">
                          <Video className="w-2.5 h-2.5" />
                          En ligne
                        </span>
                      )}
                      {e.nbInscrits != null && (
                        <span className="flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" />
                          {e.nbInscrits} inscrit{e.nbInscrits > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function CalendarPage() {
  const navigate = useNavigate();

  const maintenant = new Date();
  const [mois, setMois] = useState(
    new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
  );
  const [jourChoisi, setJourChoisi] = useState<Date | null>(null);
  const [chargement, setChargement] = useState(true);
  const [visibles, setVisibles] = useState<Record<TypeEntree, boolean>>({
    entretien: true, evenement: true, conge: true,
  });

  const [brut, setBrut] = useState({
    entretiens: [] as any[],
    evenements: [] as any[],
    conges: [] as any[],
  });

  useEffect(() => {
    (async () => {
      try {
        const [entretiens, evenements, conges] = await Promise.all([
          lister('/entretiens', 'entretiens'),
          lister('/evenements', 'evenements'),
          lister('/conges', 'conges'),
        ]);
        setBrut({ entretiens, evenements, conges });
      } catch (e) {
        console.error("Chargement de l'agenda :", e);
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  // Les trois sources sont converties en un format commun : le
  // calendrier n'a pas à connaître leurs différences.
  const entrees = useMemo((): Entree[] => {
    const liste: Entree[] = [];

    for (const e of brut.entretiens) {
      const date = e.dateHeure ?? e.date;
      if (!date) continue;
      liste.push({
        id: `entretien-${e.id}`,
        type: 'entretien',
        date,
        titre: e.candidatNom ?? 'Entretien',
        detail: e.offreTitre ?? 'Entretien de recrutement',
        heure: new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        lieu: e.lieu ?? undefined,
        visio: Boolean(e.lienVisio),
      });
    }

    for (const e of brut.evenements) {
      if (!e.dateDebut || e.statut === 'ANNULE') continue;
      liste.push({
        id: `evenement-${e.id}`,
        type: 'evenement',
        date: e.dateDebut,
        dateFin: e.dateFin,
        titre: e.titre,
        detail: e.typeLibelle ?? 'Événement',
        heure: new Date(e.dateDebut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        lieu: e.lieu ?? undefined,
        visio: Boolean(e.lienVisio),
        nbInscrits: e.participants?.length ?? e.nbParticipants ?? 0,
      });
    }

    // Un congé s'étale sur plusieurs jours : il doit apparaître sur
    // chacun, pas seulement au premier.
    for (const c of brut.conges) {
      if (c.statut !== 'APPROUVE' || !c.dateDebut) continue;
      liste.push({
        id: `conge-${c.id}`,
        type: 'conge',
        date: c.dateDebut,
        dateFin: c.dateFin,
        titre: c.employeNom ?? 'Congé',
        detail: `${c.nbJours ?? '?'} jour${(c.nbJours ?? 0) > 1 ? 's' : ''} de congé`,
      });
    }

    return liste;
  }, [brut]);

  // Index par jour : chaque entrée est inscrite sur toute sa durée.
  const parJour = useMemo(() => {
    const carte = new Map<string, Entree[]>();

    for (const e of entrees) {
      if (!visibles[e.type]) continue;

      const debut = new Date(e.date);
      const fin = e.dateFin ? new Date(e.dateFin) : debut;

      const curseur = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());
      const borne = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

      // Garde-fou : une date de fin aberrante ne doit pas boucler
      // indéfiniment.
      let securite = 0;
      while (curseur <= borne && securite < 400) {
        const cle = cleJour(curseur);
        carte.set(cle, [...(carte.get(cle) ?? []), e]);
        curseur.setDate(curseur.getDate() + 1);
        securite += 1;
      }
    }

    return carte;
  }, [entrees, visibles]);

  // La grille commence au lundi, convention française : getDay()
  // renvoie 0 pour dimanche, d'où le décalage.
  const cellules = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const decalage = (premier.getDay() + 6) % 7;
    const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();

    const liste: (Date | null)[] = [];
    for (let i = 0; i < decalage; i += 1) liste.push(null);
    for (let i = 1; i <= nbJours; i += 1) {
      liste.push(new Date(mois.getFullYear(), mois.getMonth(), i));
    }
    // Compléter la dernière semaine pour une grille régulière
    while (liste.length % 7 !== 0) liste.push(null);

    return liste;
  }, [mois]);

  const changerMois = (delta: number) => {
    setMois(new Date(mois.getFullYear(), mois.getMonth() + delta, 1));
    setJourChoisi(null);
  };

  const revenirAujourdhui = () => {
    const d = new Date();
    setMois(new Date(d.getFullYear(), d.getMonth(), 1));
    setJourChoisi(d);
  };

  const basculer = (type: TypeEntree) =>
    setVisibles((v) => ({ ...v, [type]: !v[type] }));

  // Compteurs du mois affiché, pour l'en-tête.
  const statsMois = useMemo(() => {
    const debut = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const fin = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);

    const dansLeMois = (e: Entree) => {
      const d = new Date(e.date);
      return d >= debut && d <= fin;
    };

    return {
      entretien: entrees.filter((e) => e.type === 'entretien' && dansLeMois(e)).length,
      evenement: entrees.filter((e) => e.type === 'evenement' && dansLeMois(e)).length,
      conge: entrees.filter((e) => e.type === 'conge' && dansLeMois(e)).length,
    };
  }, [entrees, mois]);

  const entreesDuJour = jourChoisi ? (parJour.get(cleJour(jourChoisi)) ?? []) : [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Pilotage</span>
              <Fleche className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Agenda</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Agenda</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {statsMois.entretien} entretien{statsMois.entretien > 1 ? 's' : ''}
                  {' · '}{statsMois.evenement} événement{statsMois.evenement > 1 ? 's' : ''}
                  {' · '}{statsMois.conge} congé{statsMois.conge > 1 ? 's' : ''} ce mois-ci
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={revenirAujourdhui}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 shadow-sm transition-colors"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => navigate('/evenementsAdmin')}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Publier un événement
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Légende cliquable ── */}
          {/* Chaque type se masque d'un clic : un mois chargé de congés
              cache les entretiens, et inversement. */}
          <div className="flex items-center gap-2 mb-4">
            {(['entretien', 'evenement', 'conge'] as TypeEntree[]).map((type) => {
              const style = STYLE_TYPE[type];
              const Icone = style.icone;
              const actif = visibles[type];
              return (
                <button
                  key={type}
                  onClick={() => basculer(type)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    actif
                      ? `${style.bg} ${style.text} border-transparent`
                      : 'bg-surface text-stone-400 border-stone-200'
                  }`}
                >
                  <Icone className="w-3.5 h-3.5" />
                  {style.libelle}s
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    actif ? 'bg-surface/70' : 'bg-stone-100'
                  }`}>
                    {statsMois[type]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`grid gap-4 items-start ${jourChoisi ? 'grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>

            {/* ── Calendrier ── */}
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">

              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                <button
                  onClick={() => changerMois(-1)}
                  className="p-2 hover:bg-surface rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-500" />
                </button>

                <h3 className="font-bold text-stone-800">
                  {MOIS[mois.getMonth()]} {mois.getFullYear()}
                </h3>

                <button
                  onClick={() => changerMois(1)}
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
                {cellules.map((date, i) => {
                  if (!date) {
                    return <div key={`vide-${i}`} className="min-h-27 bg-stone-50/40 border-b border-e border-stone-100" />;
                  }

                  const cle = cleJour(date);
                  const duJour = parJour.get(cle) ?? [];
                  const aujourdhui = estAujourdhui(date);
                  const choisi = jourChoisi && cleJour(jourChoisi) === cle;
                  const weekend = [5, 6].includes((date.getDay() + 6) % 7);

                  return (
                    <button
                      key={cle}
                      onClick={() => setJourChoisi(choisi ? null : date)}
                      className={`min-h-27 p-2 border-b border-e border-stone-100 text-start transition-colors ${
                        choisi ? 'bg-brand-500/5'
                          : weekend ? 'bg-stone-50/50 hover:bg-stone-50'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold mb-1.5 ${
                          aujourdhui ? 'bg-brand-500 text-white'
                            : choisi ? 'bg-brand-500/15 text-brand-texte'
                            : 'text-stone-600'
                        }`}
                      >
                        {date.getDate()}
                      </div>

                      <div className="space-y-1">
                        {duJour.slice(0, 3).map((e) => {
                          const style = STYLE_TYPE[e.type];
                          return (
                            <div
                              key={e.id}
                              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold truncate ${style.bg} ${style.text}`}
                              title={`${e.titre} — ${e.detail}`}
                            >
                              <span className={`w-1 h-1 rounded-full shrink-0 ${style.pastille}`} />
                              <span className="truncate">{e.titre}</span>
                            </div>
                          );
                        })}

                        {duJour.length > 3 && (
                          <div className="text-[9px] text-stone-400 font-bold ps-1.5">
                            +{duJour.length - 3} autre{duJour.length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Détail du jour ── */}
            {jourChoisi && (
              <PanneauJour
                date={jourChoisi}
                entrees={entreesDuJour}
                onFermer={() => setJourChoisi(null)}
              />
            )}
          </div>

          {/* ── Ce que l'agenda rassemble ── */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-brand-texte" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Sources de l'agenda
              </h4>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {([
                ['entretien', 'Entretiens de recrutement', 'Planifiés depuis le pipeline', '/pipeline'],
                ['evenement', 'Événements internes et publics', 'Formations, séminaires, portes ouvertes', '/evenementsAdmin'],
                ['conge', 'Congés approuvés', 'Qui est absent, et jusqu\u2019à quand', '/admin/conges'],
              ] as [TypeEntree, string, string, string][]).map(([type, label, detail, route]) => {
                const style = STYLE_TYPE[type];
                const Icone = style.icone;
                return (
                  <button
                    key={type}
                    onClick={() => navigate(route)}
                    className="flex items-start gap-2.5 text-start hover:bg-stone-50 rounded-xl p-2 -m-2 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                      <Icone className={`w-4 h-4 ${style.text}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-700">{label}</div>
                      <p className="text-[10px] text-stone-400">{detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-stone-400 mt-4 pt-3 border-t border-stone-50">
              Un congé s'affiche sur toute sa durée, pas seulement au premier jour :
              planifier un entretien demande de savoir qui est présent ce jour-là.
            </p>
          </div>
        </div>

        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #DFE3F0;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}