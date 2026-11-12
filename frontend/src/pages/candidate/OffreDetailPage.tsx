// src/pages/candidate/OffreDetailPage.tsx
//
// Une offre en entier.
//
// ── Pourquoi une page et pas une fenêtre ────────────────────────────
//
// Une offre se lit, se garde sous le coude, se montre à quelqu'un. Une
// fenêtre modale n'a pas d'adresse : on ne peut ni la mettre en
// favori, ni l'envoyer, ni y revenir avec le bouton « précédent ». Une
// page a tout cela gratuitement.
//
// ── Deux choses que la page sait et que la liste ignorait ───────────
//
// 1. Si le candidat a déjà postulé. Rien ne l'empêchait de le faire
//    deux fois ; le bouton disait « Postuler » dans tous les cas.
//    Ici, il affiche l'état du dossier et y renvoie.
//
// 2. Quelles autres offres ressemblent à celle-ci. Un candidat qui
//    lit une offre et ne la retient pas repart sans rien ; trois
//    voisines lui donnent une raison de rester.
//
// ── Les champs facultatifs ──────────────────────────────────────────
//
// Le détail d'une offre varie selon ce que la RH a rempli : missions,
// profil recherché, compétences, fourchette de salaire, date limite.
// Chaque bloc ne s'affiche que s'il a quelque chose à dire. Un
// intertitre « Missions » suivi d'un tiret est pire que rien.

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Briefcase, MapPin, Clock, ArrowLeft, Flame, Send, Share2, Check,
  CalendarClock, Users, GraduationCap, Wallet, ListChecks, Target,
  ChevronRight, AlertTriangle, FileText,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { Toast, Vide, CARTE, ton } from '../../components/ui/kit';
import ModalPostuler from '../../components/candidat/ModalPostuler';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

// ── Types ──────────────────────────────────────────────────────────

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description: string;
  statut: string;
  urgente?: boolean;
  creeLe: string;

  // Tout ce qui suit est facultatif : la RH le remplit ou non.
  missions?: string[] | string;
  profilRecherche?: string[] | string;
  avantages?: string[] | string;
  competencesRequises?: string[] | string;
  competences?: string[] | string;
  niveauEtude?: string;
  experience?: string;
  salaireMin?: number;
  salaireMax?: number;
  dateLimite?: string;
  nombrePostes?: number;
  lieu?: string;
}

interface MaCandidature {
  id: string;
  offreId?: string;
  statut: string;
  creeLe: string;
}

const STYLE_TYPE: Record<string, { bg: string; text: string }> = {
  CDI:        { bg: 'bg-brand-500/10', text: 'text-brand-texte' },
  CDD:        { bg: 'bg-blue-50',      text: 'text-blue-600' },
  STAGE:      { bg: 'bg-amber-50',     text: 'text-amber-600' },
  Stage:      { bg: 'bg-amber-50',     text: 'text-amber-600' },
  ALTERNANCE: { bg: 'bg-purple-50',    text: 'text-purple-600' },
  Freelance:  { bg: 'bg-purple-50',    text: 'text-purple-600' },
};

const styleType = (t: string) =>
  STYLE_TYPE[t] ?? { bg: 'bg-stone-100', text: 'text-stone-500' };

const LIBELLE_STATUT: Record<string, { texte: string; tonalite: string }> = {
  SOUMIS:          { texte: 'Candidature soumise', tonalite: 'bleu' },
  PRESELECTION:    { texte: 'Profil retenu',       tonalite: 'amber' },
  QUIZ_EN_ATTENTE: { texte: 'Quiz à passer',       tonalite: 'brand' },
  QUIZ_ENVOYE:     { texte: 'Quiz à passer',       tonalite: 'brand' },
  QUIZ_TERMINE:    { texte: 'Quiz passé',          tonalite: 'bleu' },
  ENTRETIEN:       { texte: 'Entretien prévu',     tonalite: 'violet' },
  OFFRE:           { texte: 'Offre reçue',         tonalite: 'brand' },
  EMBAUCHE:        { texte: 'Embauché',            tonalite: 'brand' },
  REFUSE:          { texte: 'Non retenu',          tonalite: 'red' },
};

const estFermee = (o: Offre) =>
  ['fermee', 'POURVUE', 'ARCHIVEE', 'FERMEE'].includes(String(o.statut));

const estUrgente = (o: Offre) => Boolean(o.urgente) || o.statut === 'urgente';

/**
 * La RH saisit parfois une liste, parfois un paragraphe à puces.
 * On accepte les deux plutôt que d'afficher « [object Object] ».
 */
function enListe(valeur: string[] | string | undefined): string[] {
  if (!valeur) return [];
  if (Array.isArray(valeur)) return valeur.map(String).filter((v) => v.trim());
  return String(valeur)
    .split(/\r?\n|·|•|;/)
    .map((v) => v.replace(/^[-–—*\s]+/, '').trim())
    .filter(Boolean);
}

/** Jours calendaires, comme partout ailleurs : une limite fixée au 12
 *  à 23 h 59 est « dans 6 jours » le 6, pas dans 7. */
function joursAvant(iso: string): number {
  const cible = new Date(iso);
  const maintenant = new Date();
  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  return Math.round((a - b) / 86400000);
}

const jourLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

const tnd = (v: number) => `${Number(v).toLocaleString('fr-FR')} TND`;

// ── Un bloc de texte ou de liste ───────────────────────────────────

function Bloc({ icone: Icone, titre, elements, texte, delai }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  elements?: string[];
  texte?: string;
  delai: number;
}) {
  const aDesElements = (elements?.length ?? 0) > 0;
  if (!aDesElements && !texte?.trim()) return null;

  return (
    <div style={{ animationDelay: `${delai}ms` }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
      <div className="flex items-center gap-2 mb-4">
        <Icone className="w-4 h-4 text-brand-texte" />
        <h3 className="font-bold text-stone-800">{titre}</h3>
      </div>

      {aDesElements ? (
        <ul className="space-y-2.5">
          {elements!.map((e, i) => (
            <li key={`${e}-${i}`} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-[0.45rem] shrink-0" />
              <span className="text-sm text-stone-600 leading-relaxed">{e}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
          {texte}
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function OffreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [offre, setOffre] = useState<Offre | null>(null);
  const [toutes, setToutes] = useState<Offre[]>([]);
  const [candidatures, setCandidatures] = useState<MaCandidature[]>([]);
  const [chargement, setChargement] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [postuler, setPostuler] = useState(false);
  const [toast, setToast] = useState('');

  const charger = async () => {
    if (!id) return;
    setChargement(true);
    setIntrouvable(false);

    // Trois sources, et la deuxième rattrape la première : certaines
    // installations n'exposent pas GET /offres/:id. Plutôt que
    // d'exiger une route côté serveur, on retombe sur la liste.
    const [resUne, resToutes, resCand] = await Promise.allSettled([
      api.get(`/offres/${id}`) as any,
      api.get('/offres') as any,
      api.get('/mes-candidatures') as any,
    ]);

    const liste: Offre[] = resToutes.status === 'fulfilled'
      ? (resToutes.value?.data?.offres ?? resToutes.value?.data ?? [])
      : [];
    setToutes(liste);

    const depuisRoute = resUne.status === 'fulfilled'
      ? (resUne.value?.data?.offre ?? resUne.value?.data ?? null)
      : null;

    const trouvee = (depuisRoute && depuisRoute.id)
      ? depuisRoute
      : liste.find((o) => String(o.id) === String(id)) ?? null;

    if (!trouvee) setIntrouvable(true);
    setOffre(trouvee);

    if (resCand.status === 'fulfilled') {
      setCandidatures(resCand.value?.data?.candidatures ?? []);
    }

    setChargement(false);
  };

  useEffect(() => { charger(); }, [id]);

  // Remonter en haut au changement d'offre : sans cela, passer d'une
  // offre similaire à une autre laisse la page au milieu.
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const dejaPostule = useMemo(
    () => candidatures.find((c) => String(c.offreId) === String(id)) ?? null,
    [candidatures, id]
  );

  // Même département d'abord, puis même type de contrat.
  const similaires = useMemo(() => {
    if (!offre) return [];
    return toutes
      .filter((o) => String(o.id) !== String(offre.id) && !estFermee(o))
      .map((o) => ({
        offre: o,
        proximite: (o.departement === offre.departement ? 2 : 0)
          + (o.type === offre.type ? 1 : 0),
      }))
      .filter((x) => x.proximite > 0)
      .sort((a, b) => b.proximite - a.proximite
        || String(b.offre.creeLe).localeCompare(String(a.offre.creeLe)))
      .slice(0, 3)
      .map((x) => x.offre);
  }, [toutes, offre]);

  const partager = async () => {
    const lien = window.location.href;
    try {
      // navigator.share n'existe pas partout ; le presse-papiers si.
      if ((navigator as any).share) {
        await (navigator as any).share({ title: offre?.titre, url: lien });
        return;
      }
      await navigator.clipboard.writeText(lien);
      setToast('Lien copié');
    } catch {
      setToast('Impossible de copier le lien');
    }
  };

  // ── Chargement ──

  if (chargement) {
    return (
      <Layout>
        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-5 animate-pulse">
          <div className="h-5 bg-stone-100 rounded w-64" />
          <div className="h-10 bg-stone-100 rounded w-96" />
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
            <div className="space-y-5">
              <div className={`${CARTE} h-48`} />
              <div className={`${CARTE} h-64`} />
            </div>
            <div className={`${CARTE} h-80`} />
          </div>
        </div>
      </Layout>
    );
  }

  if (introuvable || !offre) {
    return (
      <Layout>
        <div className="px-4 sm:px-8 py-10 sm:py-16 max-w-xl mx-auto">
          <Vide
            icone={Briefcase}
            message="Offre introuvable"
            detail="Cette offre n'existe plus, ou elle a été retirée de la publication."
            action={(
              <button
                onClick={() => navigate('/candidat/offres')}
                className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                Voir les offres ouvertes
              </button>
            )}
          />
        </div>
      </Layout>
    );
  }

  const st = styleType(offre.type);
  const fermee = estFermee(offre);
  const urgente = estUrgente(offre);
  const jours = -joursAvant(offre.creeLe);

  const competences = enListe(offre.competencesRequises ?? offre.competences);
  const missions = enListe(offre.missions);
  const profil = enListe(offre.profilRecherche);
  const avantages = enListe(offre.avantages);

  // Le délai de candidature compte double quand il approche.
  const joursRestants = offre.dateLimite ? joursAvant(offre.dateLimite) : null;

  const faits: [React.ComponentType<{ className?: string }>, string, string][] = [
    [Briefcase, 'Département', offre.departement],
    [MapPin, 'Lieu de travail', offre.lieu || offre.modeTravail],
    ...(offre.experience ? [[Clock, 'Expérience attendue', offre.experience]] as typeof faits : []),
    ...(offre.niveauEtude ? [[GraduationCap, "Niveau d'étude", offre.niveauEtude]] as typeof faits : []),
    ...(offre.nombrePostes && offre.nombrePostes > 1
      ? [[Users, 'Postes à pourvoir', String(offre.nombrePostes)]] as typeof faits : []),
    ...(offre.salaireMin || offre.salaireMax
      ? [[Wallet, 'Rémunération',
          offre.salaireMin && offre.salaireMax
            ? `${tnd(offre.salaireMin)} à ${tnd(offre.salaireMax)}`
            : tnd((offre.salaireMin ?? offre.salaireMax)!)]] as typeof faits
      : []),
    ...(offre.dateLimite
      ? [[CalendarClock, 'Candidatures jusqu’au', jourLong(offre.dateLimite)]] as typeof faits
      : []),
  ];

  const tonCandidature = dejaPostule
    ? ton((LIBELLE_STATUT[dejaPostule.statut] ?? { tonalite: 'stone' }).tonalite)
    : null;

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher une offre…">

        {/* ── En-tête ── */}
        <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-stone-200">
          <nav className="flex text-xs text-stone-500 mb-3 gap-2 items-center flex-wrap">
            <button
              onClick={() => navigate('/candidat/offres')}
              className="hover:text-stone-700 transition-colors"
            >
              Offres d'emploi
            </button>
            <ChevronRight className="w-3 h-3" />
            <span className="text-brand-texte font-semibold truncate max-w-[16rem] sm:max-w-none">
              {offre.titre}
            </span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${st.bg} ${st.text}`}>
                  {offre.type}
                </span>
                {urgente && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500">
                    <Flame className="w-3 h-3" />
                    Recrutement urgent
                  </span>
                )}
                {fermee && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">
                    Offre fermée
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">{offre.titre}</h2>

              <div className="flex items-center gap-x-4 gap-y-1.5 text-sm text-stone-500 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  {offre.departement}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {offre.lieu || offre.modeTravail}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Publiée {jours === 0 ? "aujourd'hui" : `il y a ${jours} jour${jours > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/candidat/offres')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-stone-200 bg-surface text-stone-600 hover:bg-stone-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <button
                onClick={partager}
                aria-label="Partager cette offre"
                className="p-2 rounded-xl border border-stone-200 bg-surface text-stone-500 hover:bg-stone-50 transition-colors"
                title="Copier le lien de l'offre"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">

            {/* ── Colonne de lecture ── */}
            <div className="space-y-5 min-w-0">

              {joursRestants != null && joursRestants >= 0 && joursRestants <= 7 && (
                <div className="hrup-monter flex items-start gap-2.5 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    {joursRestants === 0
                      ? "Dernier jour pour postuler."
                      : `Plus que ${joursRestants} jour${joursRestants > 1 ? 's' : ''} pour postuler.`}
                  </p>
                </div>
              )}

              <Bloc
                icone={FileText}
                titre="Le poste"
                texte={offre.description || "Aucune description n'a été fournie pour cette offre."}
                delai={0}
              />

              <Bloc icone={ListChecks} titre="Missions" elements={missions} delai={60} />
              <Bloc icone={Target} titre="Profil recherché" elements={profil} delai={120} />

              {competences.length > 0 && (
                <div style={{ animationDelay: '180ms' }} className={`hrup-monter ${CARTE} p-5 sm:p-6`}>
                  <div className="flex items-center gap-2 mb-4">
                    <GraduationCap className="w-4 h-4 text-brand-texte" />
                    <h3 className="font-bold text-stone-800">Compétences attendues</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {competences.map((c, i) => (
                      <span
                        key={`${c}-${i}`}
                        className="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-texte"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Bloc icone={Check} titre="Ce que nous offrons" elements={avantages} delai={240} />

              {/* ── Offres similaires ── */}
              {similaires.length > 0 && (
                <div style={{ animationDelay: '300ms' }} className={`hrup-monter ${CARTE} overflow-hidden`}>
                  <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50">
                    <h3 className="font-bold text-stone-800 text-sm">
                      Ces offres pourraient aussi vous intéresser
                    </h3>
                  </div>

                  <div className="divide-y divide-stone-50">
                    {similaires.map((o) => {
                      const s = styleType(o.type);
                      return (
                        <button
                          key={o.id}
                          onClick={() => navigate(`/candidat/offres/${o.id}`)}
                          className="w-full text-start px-5 py-4 hover:bg-stone-50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                            <Briefcase className="w-4 h-4 text-brand-texte" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-stone-800 truncate">
                              {o.titre}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5 truncate">
                              {o.departement} · {o.modeTravail}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.bg} ${s.text}`}>
                            {o.type}
                          </span>
                          <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Colonne d'action ── */}
            <div className="space-y-5 min-w-0 xl:sticky xl:top-6">

              <div className={`hrup-monter ${CARTE} overflow-hidden`}>
                <div className="p-5 space-y-4">
                  {faits.map(([Icone, libelle, valeur]) => (
                    <div key={libelle} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                        <Icone className="w-4 h-4 text-stone-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                          {libelle}
                        </div>
                        <div className="text-sm font-medium text-stone-800 mt-0.5 break-words">
                          {valeur}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Le bouton, et ses trois états ── */}
                <div className="px-5 pb-5">
                  {dejaPostule ? (
                    <div className={`rounded-xl p-4 ${tonCandidature!.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Check className={`w-4 h-4 shrink-0 ${tonCandidature!.text}`} />
                        <span className={`text-sm font-bold ${tonCandidature!.text}`}>
                          Vous avez déjà postulé
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed mb-3">
                        Déposée le {jourLong(dejaPostule.creeLe)} —{' '}
                        {(LIBELLE_STATUT[dejaPostule.statut] ?? { texte: 'en cours' }).texte.toLowerCase()}.
                      </p>
                      <button
                        onClick={() => navigate('/candidat/mes-candidatures')}
                        className="w-full flex items-center justify-center gap-2 bg-surface border border-stone-200 text-stone-700 text-sm font-bold py-2.5 rounded-xl hover:bg-stone-50 transition-colors"
                      >
                        Suivre ma candidature
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : fermee ? (
                    <div className="rounded-xl bg-stone-50 p-4 text-center">
                      <p className="text-sm font-bold text-stone-600 mb-1">
                        Cette offre est fermée
                      </p>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Vous pouvez envoyer une candidature spontanée : elle sera
                        conservée pour les prochains recrutements.
                      </p>
                      <button
                        onClick={() => navigate('/candidat/candidature-spontanee')}
                        className="w-full mt-3 bg-surface border border-stone-200 text-stone-700 text-sm font-bold py-2.5 rounded-xl hover:bg-surface transition-colors"
                      >
                        Candidature spontanée
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPostuler(true)}
                      className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold py-3 rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Postuler à cette offre
                    </button>
                  )}
                </div>
              </div>

              <div className={`${CARTE} p-5`}>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">
                  Avant de postuler
                </h4>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Votre CV est analysé automatiquement et comparé aux compétences
                  attendues. Prenez le temps de la lettre de motivation : elle pèse
                  autant que la correspondance technique.
                </p>
              </div>
            </div>
          </div>
        </div>

        {postuler && (
          <ModalPostuler
            offre={offre}
            onClose={() => setPostuler(false)}
            onSucces={() => {
              setToast('Votre candidature a été envoyée');
              charger();
            }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}