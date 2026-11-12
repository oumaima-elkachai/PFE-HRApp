// src/pages/employee/CooptationPage.tsx
//
// Cooptation, côté salarié : recommander quelqu'un, et suivre ce que
// ses recommandations deviennent.
//
// ── Ce que cette page doit faire comprendre ─────────────────────────
//
// Personne ne connaît cette fonctionnalité. Une page qui s'ouvre sur
// une liste vide et un bouton ne dit pas pourquoi on cliquerait. Elle
// s'ouvre donc sur les trois étapes et sur ce qu'on y gagne, et la
// liste vient après.
//
// ── Le consentement de la personne recommandée ──────────────────────
//
// Le formulaire exige que le parrain confirme avoir prévenu la
// personne. Ce n'est pas une case de confort : transmettre le nom,
// l'adresse et parfois le CV de quelqu'un à son employeur est un
// traitement de données personnelles au sens de la loi organique
// n° 2004-63, et la personne concernée a le droit de le savoir.
//
// Le serveur refuse la demande sans cette confirmation. La case est
// donc ici pour que le refus n'arrive jamais, pas pour décorer.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Users, Award, Send, X, CheckCircle2, Clock, XCircle,
  ChevronRight, Paperclip, Search, Gift, ArrowRight, AlertTriangle,
  Briefcase,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

const PAR_PAGE = 6;

type Statut = 'ENVOYEE' | 'EN_COURS' | 'RECRUTEE' | 'ECARTEE';
type StatutPrime = 'AUCUNE' | 'ACCORDEE' | 'VERSEE';

interface Cooptation {
  id: string;
  candidatNom: string;
  candidatEmail: string;
  candidatTelephone?: string | null;
  relation: string;
  relationLibelle?: string;
  commentaire: string;
  offreTitre?: string | null;
  spontanee: boolean;
  statut: Statut;
  primeStatut: StatutPrime;
  primeMontant?: number | null;
  primeMois?: string | null;
  primeBulletin?: string | null;
  cvNom?: string | null;
  creeLe: string;
}

const STYLE_STATUT: Record<Statut, {
  libelle: string; bg: string; text: string;
  icone: React.ComponentType<{ className?: string }>;
}> = {
  ENVOYEE: { libelle: 'Transmise', bg: 'bg-stone-100', text: 'text-stone-500', icone: Send },
  EN_COURS: { libelle: 'En cours', bg: 'bg-amber-50', text: 'text-amber-600', icone: Clock },
  RECRUTEE: { libelle: 'Recrutée', bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: CheckCircle2 },
  ECARTEE: { libelle: 'Non retenue', bg: 'bg-red-50', text: 'text-red-500', icone: XCircle },
};

const RELATIONS: [string, string][] = [
  ['ANCIEN_COLLEGUE', 'Ancien collègue'],
  ['ETUDES', 'Rencontré pendant mes études'],
  ['CONNAISSANCE', 'Connaissance personnelle'],
  ['RESEAU', 'Repéré sur un réseau professionnel'],
  ['AUTRE', 'Autre'],
];

const tnd = (v: number) => `${Number(v).toFixed(3)} TND`;

const jourCourt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—';

/** « 2026-12 » → « décembre 2026 ». */
const moisLong = (m?: string | null) => {
  if (!m) return '';
  const [a, mois] = m.split('-');
  const noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${noms[Number(mois) - 1] ?? m} ${a}`;
};

// ── Formulaire ──────────────────────────────────────────────────────

function ModalRecommander({ offres, onFermer, onSucces }: {
  offres: { id: string; titre: string }[];
  onFermer: () => void;
  onSucces: (message: string) => void;
}) {
  const [form, setForm] = useState({
    candidatNom: '',
    candidatEmail: '',
    candidatTelephone: '',
    relation: 'ANCIEN_COLLEGUE',
    offreId: '',
    commentaire: '',
  });

  const [cv, setCv] = useState<File | null>(null);
  const [prevenu, setPrevenu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const champ = 'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 '
    + 'rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  // Le serveur exige vingt caractères. L'afficher évite un aller-retour
  // pour une règle qu'on ne pouvait pas deviner.
  const resteCommentaire = Math.max(0, 20 - form.commentaire.trim().length);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (!prevenu) {
      setErreur('Confirmez que vous avez prévenu cette personne.');
      return;
    }

    setEnvoi(true);

    try {
      // multipart, parce qu'un CV peut être joint. Le navigateur pose
      // lui-même la frontière du message : la fixer à la main casse
      // l'envoi.
      const corps = new FormData();
      corps.append('candidatNom', form.candidatNom.trim());
      corps.append('candidatEmail', form.candidatEmail.trim());
      corps.append('candidatTelephone', form.candidatTelephone.trim());
      corps.append('relation', form.relation);
      corps.append('commentaire', form.commentaire.trim());
      corps.append('candidatPrevenu', 'true');

      if (form.offreId) {
        corps.append('offreId', form.offreId);
        const offre = offres.find((o) => o.id === form.offreId);
        if (offre) corps.append('offreTitre', offre.titre);
      }

      if (cv) corps.append('cv', cv);

      const res = await api.post('/cooptations', corps) as any;
      onSucces(res?.data?.message ?? 'Recommandation transmise.');
      onFermer();
    } catch (err: any) {
      setErreur(
        err?.response?.data?.erreur ?? err?.erreur
        ?? "La recommandation n'a pas pu être transmise."
      );
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">

        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-200 sticky top-0 bg-surface rounded-t-2xl">
          <h2 className="font-bold text-lg text-stone-800">Recommander quelqu'un</h2>
          <button onClick={onFermer} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={envoyer} className="p-5 sm:p-6 space-y-4">

          {erreur && (
            <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{erreur}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Nom et prénom
            </label>
            <input
              required
              value={form.candidatNom}
              onChange={(e) => setForm({ ...form, candidatNom: e.target.value })}
              placeholder="Amine Ben Salah"
              className={champ}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Adresse e-mail
              </label>
              <input
                required
                type="email"
                value={form.candidatEmail}
                onChange={(e) => setForm({ ...form, candidatEmail: e.target.value })}
                placeholder="amine@exemple.tn"
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Téléphone <span className="text-stone-400">(facultatif)</span>
              </label>
              <input
                value={form.candidatTelephone}
                onChange={(e) => setForm({ ...form, candidatTelephone: e.target.value })}
                className={champ}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Comment la connaissez-vous ?
            </label>
            <select
              value={form.relation}
              onChange={(e) => setForm({ ...form, relation: e.target.value })}
              className={champ}
            >
              {RELATIONS.map(([cle, libelle]) => (
                <option key={cle} value={cle}>{libelle}</option>
              ))}
            </select>
            <p className="text-[11px] text-stone-400 mt-1.5">
              Les ressources humaines lisent très différemment une
              recommandation selon qu'elle vient d'un ancien collègue ou d'un
              profil repéré en ligne.
            </p>
          </div>

          {/* Le poste n'est proposé que s'il y a des offres ouvertes.
              Un sélecteur vide ferait croire à une panne. */}
          {offres.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Pour quel poste ?
              </label>
              <select
                value={form.offreId}
                onChange={(e) => setForm({ ...form, offreId: e.target.value })}
                className={champ}
              >
                <option value="">Candidature spontanée</option>
                {offres.map((o) => (
                  <option key={o.id} value={o.id}>{o.titre}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Pourquoi la recommandez-vous ?
            </label>
            <textarea
              required
              rows={4}
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              placeholder="Nous avons travaillé deux ans ensemble. Elle a repris seule la migration du parc applicatif, et a formé trois personnes dessus."
              className={`${champ} resize-none`}
            />
            <p className={`text-[11px] mt-1.5 ${
              resteCommentaire > 0 ? 'text-amber-600' : 'text-stone-400'
            }`}>
              {resteCommentaire > 0
                ? `Encore ${resteCommentaire} caractère${resteCommentaire > 1 ? 's' : ''} — c'est sur ce texte que la RH se décide.`
                : "C'est sur ce texte que la RH se décide."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Son CV <span className="text-stone-400">(facultatif)</span>
            </label>
            <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-stone-300 cursor-pointer hover:bg-stone-50 transition-colors">
              <Paperclip className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-sm text-stone-600 truncate">
                {cv ? cv.name : 'Joindre un fichier'}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>

          {/* ── La case qui n'est pas une formalité ── */}
          <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
            prevenu
              ? 'bg-brand-500/5 border-brand-500/30'
              : 'bg-stone-50 border-stone-200'
          }`}>
            <input
              type="checkbox"
              checked={prevenu}
              onChange={(e) => setPrevenu(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-stone-300 accent-brand-texte"
            />
            <span className="text-xs text-stone-700 leading-relaxed">
              <strong>J'ai prévenu cette personne</strong> que je transmets ses
              coordonnées aux ressources humaines. Je sais que ses données ne
              peuvent pas être communiquées à son insu.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onFermer}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi || !prevenu}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-4 h-4" />}
              Transmettre
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 start-4 end-4 sm:start-auto sm:top-6 sm:end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-start gap-3 sm:max-w-md">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-medium flex-1 leading-relaxed">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function CooptationPage() {
  const navigate = useNavigate();

  const [liste, setListe] = useState<Cooptation[]>([]);
  const [offres, setOffres] = useState<{ id: string; titre: string }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);

  const charger = async () => {
    // allSettled : les offres sont un confort, leur absence ne doit
    // pas vider la page des recommandations.
    const [resCoop, resOffres] = await Promise.allSettled([
      api.get('/cooptations') as any,
      api.get('/offres') as any,
    ]);

    if (resCoop.status === 'fulfilled') {
      setListe(resCoop.value?.data?.cooptations ?? []);
    }

    if (resOffres.status === 'fulfilled') {
      const brut = resOffres.value?.data?.offres ?? [];
      setOffres(
        brut
          .filter((o: any) => !o.statut || o.statut === 'OUVERTE' || o.statut === 'PUBLIEE')
          .map((o: any) => ({ id: o.id, titre: o.titre }))
      );
    }

    setChargement(false);
  };

  useEffect(() => { charger(); }, []);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return liste;
    return liste.filter((c) =>
      `${c.candidatNom} ${c.candidatEmail} ${c.offreTitre ?? ''}`
        .toLowerCase().includes(terme));
  }, [liste, recherche]);

  useEffect(() => { setPage(1); }, [recherche]);

  const affichees = filtrees.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

  const recrutees = liste.filter((c) => c.statut === 'RECRUTEE').length;

  // Primes acquises : accordées ou déjà versées. N'additionner que les
  // versées sous-estimerait ce que le salarié va toucher.
  const primes = liste
    .filter((c) => c.primeStatut !== 'AUCUNE')
    .reduce((s, c) => s + Number(c.primeMontant ?? 0), 0);

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <div className="px-4 sm:px-8 py-5 sm:py-6 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 border-b border-stone-200">
          <div className="ps-12 lg:ps-0 min-w-0">
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Mon espace</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Cooptation</span>
            </nav>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">
              Recommander quelqu'un
            </h2>
            <p className="text-stone-500 mt-1 text-sm leading-relaxed">
              Vous connaissez quelqu'un de bien ? Présentez-le. Si la personne
              est recrutée, vous touchez une prime.
            </p>
          </div>

          <button
            onClick={() => setModal(true)}
            className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Nouvelle recommandation
          </button>
        </div>

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-4">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              [Users, 'Recommandations', chargement ? '…' : String(liste.length), 'bg-brand-500/10', 'text-brand-texte'],
              [Award, 'Personnes recrutées', chargement ? '…' : String(recrutees), 'bg-brand-500/10', 'text-brand-texte'],
              [Gift, 'Primes acquises', chargement ? '…' : tnd(primes), 'bg-amber-50', 'text-amber-600'],
            ] as [any, string, string, string, string][]).map(([Icone, libelle, valeur, fond, texte], i) => (
              <div
                key={libelle}
                style={{ animationDelay: `${i * 60}ms` }}
                className="hrup-monter hrup-carte bg-surface rounded-2xl shadow-sm border border-stone-100 p-5"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
                  <Icone className={`w-4 h-4 ${texte}`} />
                </div>
                <div className={`text-2xl font-bold leading-tight ${texte}`}>{valeur}</div>
                <div className="text-xs text-stone-500 mt-0.5">{libelle}</div>
              </div>
            ))}
          </div>

          {/* ── Comment ça marche ── */}
          {/* Affiché tant qu'aucune recommandation n'a abouti : une fois
              le mécanisme compris, il n'a plus à occuper le haut de la
              page. */}
          {recrutees === 0 && (
            <div
              className="hrup-monter bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6"
              style={{ animationDelay: '180ms' }}
            >
              <h3 className="text-sm font-bold text-stone-800 mb-4">
                Comment ça marche
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {([
                  ['1', 'Vous présentez quelqu’un', "Un ancien collègue, une connaissance, un profil repéré. Vous expliquez pourquoi."],
                  ['2', 'Les RH examinent', "Votre recommandation passe avant une candidature reçue sans introduction."],
                  ['3', 'La personne est recrutée', "Vous touchez une prime, versée sur votre bulletin de paie."],
                ] as [string, string, string][]).map(([n, titre, texte]) => (
                  <div key={n} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-500/10 text-brand-texte text-xs font-bold flex items-center justify-center shrink-0">
                      {n}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-800">{titre}</div>
                      <p className="text-xs text-stone-500 mt-1 leading-relaxed">{texte}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-stone-400 mt-5 pt-4 border-t border-stone-50 leading-relaxed">
                Le montant de la prime est fixé par les ressources humaines au
                cas par cas : il dépend du poste et de sa difficulté à
                pourvoir. Prévenez toujours la personne avant de transmettre
                ses coordonnées.
              </p>
            </div>
          )}

          {/* ── Mes recommandations ── */}
          <div
            className="hrup-monter bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6"
            style={{ animationDelay: '240ms' }}
          >
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-texte" />
                Mes recommandations
                {liste.length > 0 && (
                  <span className="text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
                    {liste.length}
                  </span>
                )}
              </h3>

              {liste.length > PAR_PAGE && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Nom, poste…"
                    className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>

            {chargement ? (
              <div className="space-y-2.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 rounded-xl bg-stone-50 animate-pulse" />
                ))}
              </div>
            ) : filtrees.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
                  <UserPlus className="w-5 h-5 text-stone-300" />
                </div>
                <p className="text-sm text-stone-500">
                  {recherche
                    ? `Rien ne correspond à « ${recherche} »`
                    : "Vous n'avez encore recommandé personne."}
                </p>
                {!recherche && (
                  <button
                    onClick={() => setModal(true)}
                    className="text-sm font-bold text-brand-texte hover:underline mt-3"
                  >
                    Recommander quelqu'un
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {affichees.map((c, i) => {
                    const style = STYLE_STATUT[c.statut] ?? STYLE_STATUT.ENVOYEE;
                    const Icone = style.icone;

                    return (
                      <div
                        key={c.id}
                        style={{ animationDelay: `${280 + i * 60}ms` }}
                        className="hrup-monter rounded-xl border border-stone-100 bg-stone-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-stone-800">
                                {c.candidatNom}
                              </span>
                              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                                <Icone className="w-2.5 h-2.5" />
                                {style.libelle}
                              </span>
                            </div>

                            <p className="text-xs text-stone-500 mt-1">
                              {c.spontanee
                                ? 'Candidature spontanée'
                                : <span className="inline-flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />{c.offreTitre}
                                  </span>}
                              {' · '}{c.relationLibelle ?? c.relation}
                              {' · '}{jourCourt(c.creeLe)}
                            </p>
                          </div>

                          {c.cvNom && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-stone-400 shrink-0">
                              <Paperclip className="w-3 h-3" />
                              CV joint
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-600 mt-2.5 leading-relaxed line-clamp-2">
                          {c.commentaire}
                        </p>

                        {/* ── La prime ── */}
                        {c.primeStatut !== 'AUCUNE' && (
                          <div className={`flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 mt-3 ${
                            c.primeStatut === 'VERSEE'
                              ? 'bg-brand-500/10 text-brand-texte'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            <Gift className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="leading-relaxed">
                              {c.primeStatut === 'VERSEE'
                                ? `Prime de ${tnd(c.primeMontant ?? 0)} versée`
                                  + (c.primeBulletin ? ` — bulletin ${c.primeBulletin}` : '')
                                : `Prime de ${tnd(c.primeMontant ?? 0)} accordée, `
                                  + `sur votre bulletin de ${moisLong(c.primeMois)}`}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filtrees.length > PAR_PAGE && (
                  <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-stone-100">
                    <span className="text-xs text-stone-400">
                      {(page - 1) * PAR_PAGE + 1}–{Math.min(page * PAR_PAGE, filtrees.length)}
                      {' sur '}{filtrees.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                      >
                        Précédent
                      </button>
                      <button
                        onClick={() => setPage((p) =>
                          p * PAR_PAGE < filtrees.length ? p + 1 : p)}
                        disabled={page * PAR_PAGE >= filtrees.length}
                        className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Vers les offres ── */}
          {offres.length > 0 && (
            <button
              onClick={() => navigate('/offres')}
              className="hrup-monter hrup-carte w-full bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 flex items-center gap-4 text-start"
              style={{ animationDelay: '340ms' }}
            >
              <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-brand-texte" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-stone-800">
                  {offres.length} poste{offres.length > 1 ? 's' : ''} ouvert{offres.length > 1 ? 's' : ''}
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Voyez ce que l'entreprise cherche avant de recommander
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
            </button>
          )}
        </div>

        {modal && (
          <ModalRecommander
            offres={offres}
            onFermer={() => setModal(false)}
            onSucces={(m) => { setToast(m); charger(); }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}