// src/shared/MessageriePage.tsx
//
// Deux natures de conversation dans un seul écran.
//
//   · recrutement — un fil par candidature, entre un candidat et la RH
//   · interne     — un fil par binôme de salariés, ouvert depuis
//                   l'annuaire
//
// Elles partagent tout sauf leur en-tête et leur source : mêmes bulles,
// même regroupement par jour, même saisie. Les séparer en deux écrans
// aurait obligé à chercher un message à deux endroits.
//
// ⚠️ ORDRE DES ROUTES dans App.tsx — `/messages/collegue/:employeId`
// DOIT être déclarée AVANT `/messages/:candidatureId`, sinon le mot
// « collegue » est capturé comme un identifiant de candidature et le
// fil interne ne s'ouvre jamais.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send, ArrowLeft, Loader2, MessageSquare, Briefcase, AlertCircle,
  Lock, User, ChevronRight, Search, CheckCheck, Inbox, X, Users,
} from 'lucide-react';
import api from '@/services/api';
import Layout from '@/components/layout/Layout';
import Pagination from '@/components/ui/Pagination';
import { useAuth } from '@/context/AuthContext';
import { LIBELLES_STATUT_CANDIDATURE, libelle } from '@/types/domaine';

// ⚠️ SEULE LIGNE À ADAPTER si ton hook de traduction porte un autre nom.
import { useI18n, type Cle } from '@/i18n';

const LONGUEUR_MAX = 2000;
const PAR_PAGE = 8;
const RAFRAICHISSEMENT_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────

type Nature = 'recrutement' | 'interne';
type Souci = { cle: Cle } | { texte: string } | null;

interface Message {
  id: string;
  auteurNom: string;
  contenu: string;
  envoyeLe: string;
  lu: boolean;
  deMoi: boolean;
}

/** Résumé commun aux deux natures, pour la colonne de gauche */
interface FilResume {
  cle: string;          // identifiant utilisé dans l'adresse
  nature: Nature;
  titre: string;        // l'interlocuteur
  sousTitre?: string;   // l'offre, ou le poste du collègue
  contenu: string;
  envoyeLe: string;
  deMoi: boolean;
  nonLus: number;
  statut?: string;      // recrutement seulement
}

// Style uniquement : les libellés viennent de types/domaine.ts
const STYLE_STATUT: Record<string, { fond: string; texte: string; point: string }> = {
  SOUMIS:          { fond: 'bg-cyan-50',       texte: 'text-cyan-700',   point: 'bg-cyan-400' },
  PRESELECTION:    { fond: 'bg-amber-50',      texte: 'text-amber-700',  point: 'bg-amber-400' },
  QUIZ_EN_ATTENTE: { fond: 'bg-orange-50',     texte: 'text-orange-700', point: 'bg-orange-400' },
  QUIZ_ENVOYE:     { fond: 'bg-indigo-50',     texte: 'text-indigo-700', point: 'bg-indigo-400' },
  QUIZ_TERMINE:    { fond: 'bg-teal-50',       texte: 'text-teal-700',   point: 'bg-teal-400' },
  ENTRETIEN:       { fond: 'bg-violet-50',     texte: 'text-violet-700', point: 'bg-violet-400' },
  OFFRE:           { fond: 'bg-brand-500/10',  texte: 'text-brand-texte', point: 'bg-brand-500' },
  EMBAUCHE:        { fond: 'bg-brand-500/10',  texte: 'text-brand-texte', point: 'bg-brand-500' },
  REFUSE:          { fond: 'bg-red-50',        texte: 'text-red-600',    point: 'bg-red-400' },
};

const STYLE_DEFAUT = { fond: 'bg-stone-100', texte: 'text-stone-600', point: 'bg-stone-400' };
const styleStatut = (s?: string) => (s && STYLE_STATUT[s]) || STYLE_DEFAUT;

// ── Dates ──────────────────────────────────────────────────────────

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const localeDe = (langue: string) => LOCALES[langue] ?? 'fr-FR';

const heure = (iso: string, langue: string) =>
  new Date(iso).toLocaleTimeString(localeDe(langue), { hour: '2-digit', minute: '2-digit' });

function jour(iso: string, langue: string, t: (c: Cle) => string) {
  const d = new Date(iso);
  const aujourdhui = new Date();
  const hier = new Date(Date.now() - 86400000);

  if (d.toDateString() === aujourdhui.toDateString()) return t('ms.aujourdhui');
  if (d.toDateString() === hier.toDateString()) return t('ms.hier');
  return d.toLocaleDateString(localeDe(langue), {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/** Dans la liste, l'heure suffit pour aujourd'hui */
function dateCourte(iso: string, langue: string, t: (c: Cle) => string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return heure(iso, langue);
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return t('ms.hier');
  return d.toLocaleDateString(localeDe(langue), { day: 'numeric', month: 'short' });
}

const initiales = (nom: string) =>
  nom.split(' ').map((m) => m[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

// ── Colonne de gauche : les conversations ──────────────────────────

type Filtre = 'tous' | Nature;

function PanneauFils({ fils, actif, chargement, estRh, langue, t }: {
  fils: FilResume[];
  actif?: string;
  chargement: boolean;
  estRh: boolean;
  langue: string;
  t: (c: Cle) => string;
}) {
  const navigate = useNavigate();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [page, setPage] = useState(0);

  const aDesDeuxNatures = useMemo(
    () => new Set(fils.map((f) => f.nature)).size > 1,
    [fils]
  );

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return fils.filter((f) => {
      if (filtre !== 'tous' && f.nature !== filtre) return false;
      if (!terme) return true;
      return `${f.titre} ${f.sousTitre ?? ''} ${f.contenu}`.toLowerCase().includes(terme);
    });
  }, [fils, recherche, filtre]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  useEffect(() => { setPage(0); }, [recherche, filtre]);

  const route = (f: FilResume) =>
    f.nature === 'interne' ? `/messages/collegue/${f.cle}` : `/messages/${f.cle}`;

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 flex flex-col overflow-hidden h-full">

      <div className="px-4 py-3 border-b border-stone-100 bg-stone-50 shrink-0 space-y-2.5">
        <div className="relative">
          <Search
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
            style={{ insetInlineStart: '0.75rem' }}
          />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t('ms.rechercher')}
            className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500 transition-colors text-start"
          />
          {recherche && (
            <button
              onClick={() => setRecherche('')}
              className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
              style={{ insetInlineEnd: '0.6rem' }}
              aria-label={t('ms.effacer')}
            >
              <X className="w-3.5 h-3.5 text-stone-400" />
            </button>
          )}
        </div>

        {/* Le filtre n'apparaît que s'il a quelque chose à filtrer */}
        {aDesDeuxNatures && (
          <div className="flex items-center gap-1">
            {([['tous', 'ms.filtreTous'], ['interne', 'ms.filtreCollegues'],
              ['recrutement', 'ms.filtreRecrutement']] as [Filtre, Cle][]).map(([cle, label]) => (
              <button
                key={cle}
                onClick={() => setFiltre(cle)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  filtre === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-100'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto ascenseur-discret">
        {chargement ? (
          <div className="p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-10 h-10 bg-stone-100 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-stone-100 rounded w-28" />
                  <div className="h-2.5 bg-stone-100 rounded w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : fils.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-8 h-8 mx-auto mb-3 text-stone-300" />
            <p className="text-sm font-bold text-stone-800 mb-1">{t('ms.aucuneConversation')}</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              {estRh ? t('ms.videRh') : t('ms.videSalarie')}
            </p>
          </div>
        ) : filtrees.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-stone-500">{t('ms.aucunResultat')}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {pageCourante.map((f) => {
              const selectionne = actif === f.cle;
              const nonLu = f.nonLus > 0;

              return (
                <button
                  key={`${f.nature}-${f.cle}`}
                  onClick={() => navigate(route(f))}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-start transition-colors ${
                    selectionne ? 'bg-brand-500/10'
                      : nonLu ? 'bg-stone-50 hover:bg-stone-100'
                        : 'hover:bg-stone-50'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      selectionne || nonLu
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-500/10 text-brand-texte'
                    }`}
                  >
                    {f.nature === 'interne'
                      ? initiales(f.titre)
                      : estRh ? initiales(f.titre) : <Briefcase className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm truncate text-stone-800"
                        style={{ fontWeight: nonLu ? 700 : 600 }}
                      >
                        {f.titre}
                      </span>
                      <span className="text-[10px] font-bold text-stone-400 shrink-0">
                        {dateCourte(f.envoyeLe, langue, t)}
                      </span>
                    </div>

                    {f.sousTitre && (
                      <p className={`text-[11px] truncate font-semibold ${
                        f.nature === 'interne' ? 'text-stone-400' : 'text-brand-texte'
                      }`}>
                        {f.sousTitre}
                      </p>
                    )}

                    <p className="text-xs truncate text-stone-500 mt-0.5">
                      {f.deMoi ? `${t('ms.vous')} ` : ''}{f.contenu}
                    </p>
                  </div>

                  {nonLu && (
                    <span className="min-w-5 h-5 px-1 flex items-center justify-center text-[10px] font-bold text-white rounded-full shrink-0 mt-1 bg-brand-500 tabular-nums">
                      {f.nonLus}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!chargement && filtrees.length > PAR_PAGE && (
        <Pagination
          page={page}
          taillePage={PAR_PAGE}
          total={filtrees.length}
          onPage={setPage}
          libelle={t('ms.libellePagination')}
        />
      )}
    </div>
  );
}

// ── Le fil, commun aux deux natures ────────────────────────────────

interface SourceFil {
  nature: Nature;
  cle: string;
  charger: () => Promise<{ messages: Message[]; entete: Entete }>;
  envoyer: (contenu: string) => Promise<void>;
}

interface Entete {
  titre: string;
  sousTitre?: string;
  statut?: string;
  clos?: boolean;
}

function Fil({ source, estRh, onChange, langue, t }: {
  source: SourceFil;
  estRh: boolean;
  onChange: () => void;
  langue: string;
  t: (c: Cle) => string;
}) {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [entete, setEntete] = useState<Entete | null>(null);
  const [chargement, setChargement] = useState(true);
  const [brouillon, setBrouillon] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [souci, setSouci] = useState<Souci>(null);

  const basDuFil = useRef<HTMLDivElement>(null);

  // `source` est recréé à chaque rendu du parent : en dépendre
  // relancerait la requête sans fin. La nature et la clé suffisent à
  // identifier le fil, et une référence porte la version courante.
  const refSource = useRef(source);
  refSource.current = source;

  const charger = useCallback(async () => {
    try {
      const { messages: m, entete: e } = await refSource.current.charger();
      setMessages(m);
      setEntete(e);
      setSouci(null);
    } catch (err: any) {
      const duServeur = err?.erreur ?? err?.response?.data?.erreur;
      setSouci(duServeur ? { texte: duServeur } : { cle: 'ms.erreurFil' });
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    setChargement(true);
    setBrouillon('');
    setMessages([]);
    charger();
  }, [charger, source.nature, source.cle]);

  // Rafraîchissement périodique : sans WebSocket, c'est le moyen le
  // plus simple de voir arriver une réponse. Trente secondes suffisent
  // pour un échange asynchrone comme celui-ci.
  useEffect(() => {
    const intervalle = setInterval(charger, RAFRAICHISSEMENT_MS);
    return () => clearInterval(intervalle);
  }, [charger]);

  useEffect(() => {
    basDuFil.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    const contenu = brouillon.trim();
    if (!contenu || envoi) return;

    setEnvoi(true);
    setSouci(null);
    try {
      await refSource.current.envoyer(contenu);
      setBrouillon('');
      await charger();
      onChange();
    } catch (err: any) {
      const duServeur = err?.erreur ?? err?.response?.data?.erreur;
      setSouci(duServeur ? { texte: duServeur } : { cle: 'ms.erreurEnvoi' });
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) {
    return (
      <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center h-full">
        <Loader2 className="w-7 h-7 animate-spin mb-3 text-brand-texte" />
        <p className="text-sm text-stone-500">{t('ms.chargement')}</p>
      </div>
    );
  }

  const style = styleStatut(entete?.statut);
  const clos = entete?.clos && !estRh;

  // Les messages sont regroupés par jour pour rendre le fil lisible
  const groupes: [string, Message[]][] = [];
  for (const m of messages) {
    const cle = jour(m.envoyeLe, langue, t);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier[0] === cle) dernier[1].push(m);
    else groupes.push([cle, [m]]);
  }

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 flex flex-col overflow-hidden h-full">

      {/* ── En-tête ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-stone-100 bg-stone-50 shrink-0">
        <button
          onClick={() => navigate('/messages')}
          className="p-2 rounded-xl hover:bg-surface transition-colors lg:hidden"
          aria-label={t('ms.retour')}
        >
          <ArrowLeft className="w-4 h-4 text-stone-500 rtl:rotate-180" />
        </button>

        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold bg-brand-500/10 text-brand-texte">
          {entete?.titre ? initiales(entete.titre) : <User className="w-4 h-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm truncate text-stone-800">
            {entete?.titre ?? '—'}
          </h2>
          <p className={`text-xs truncate font-semibold ${
            source.nature === 'interne' ? 'text-stone-400' : 'text-brand-texte'
          }`}>
            {entete?.sousTitre ?? (source.nature === 'interne' ? t('ms.filInterne') : '')}
          </p>
        </div>

        {source.nature === 'interne' ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 bg-stone-100 text-stone-600">
            <Users className="w-3 h-3" />
            {t('ms.badgeInterne')}
          </span>
        ) : entete?.statut ? (
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${style.fond} ${style.texte}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.point}`} />
            {libelle(LIBELLES_STATUT_CANDIDATURE, entete.statut)}
          </span>
        ) : null}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 ascenseur-discret">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">{t('ms.pasCommence')}</p>
            <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
              {source.nature === 'interne' ? t('ms.pasCommenceInterne')
                : estRh ? t('ms.pasCommenceRh') : t('ms.pasCommenceCandidat')}
            </p>
          </div>
        ) : (
          groupes.map(([date, groupe]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-stone-100" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  {date}
                </span>
                <div className="flex-1 h-px bg-stone-100" />
              </div>

              <div className="space-y-2.5">
                {groupe.map((m, i) => {
                  // Les messages consécutifs du même auteur forment un
                  // bloc : le nom n'est répété qu'au premier.
                  const precedent = groupe[i - 1];
                  const enchaine = precedent && precedent.deMoi === m.deMoi;

                  return (
                    <div key={m.id} className={`flex ${m.deMoi ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%]">
                        {!m.deMoi && !enchaine && (
                          <div className="text-[10px] font-bold mb-1 px-1 text-stone-400">
                            {m.auteurNom}
                          </div>
                        )}

                        <div
                          className={`px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-sm ${
                            m.deMoi ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-800'
                          }`}
                          style={{
                            borderRadius: 18,
                            borderEndEndRadius: m.deMoi ? 5 : 18,
                            borderEndStartRadius: m.deMoi ? 18 : 5,
                          }}
                        >
                          {m.contenu}
                        </div>

                        <div className={`flex items-center gap-1 text-[10px] mt-1 px-1 text-stone-400 ${
                          m.deMoi ? 'justify-end' : ''
                        }`}>
                          {heure(m.envoyeLe, langue)}
                          {m.deMoi && m.lu && (
                            <>
                              <CheckCheck className="w-3 h-3 text-brand-texte" />
                              <span className="text-brand-texte">{t('ms.lu')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={basDuFil} />
      </div>

      {souci && (
        <div className="flex items-start gap-2 mx-5 mb-3 rounded-xl px-4 py-2.5 text-sm bg-red-50 text-red-600 shrink-0">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {'cle' in souci ? t(souci.cle) : souci.texte}
        </div>
      )}

      {/* ── Saisie ── */}
      {/* Une candidature close reste consultable, mais la discussion
          est terminée côté candidat : le champ disparaît plutôt que
          d'échouer. La RH garde la main pour un dernier message. */}
      {clos ? (
        <div className="flex items-center gap-2 px-5 py-4 border-t border-stone-100 bg-stone-50 text-sm text-stone-500 shrink-0">
          <Lock className="w-4 h-4 shrink-0" />
          {t('ms.candidatureClose')}
        </div>
      ) : (
        <form
          onSubmit={envoyer}
          className="flex items-end gap-2 px-5 py-4 border-t border-stone-100 bg-stone-50 shrink-0"
        >
          <div className="flex-1">
            <textarea
              value={brouillon}
              onChange={(e) => setBrouillon(e.target.value.slice(0, LONGUEUR_MAX))}
              onKeyDown={(e) => {
                // Entrée envoie, Maj+Entrée passe à la ligne :
                // convention attendue dans une messagerie.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  envoyer(e as unknown as React.FormEvent);
                }
              }}
              rows={2}
              placeholder={source.nature === 'interne' ? t('ms.saisieInterne')
                : estRh ? t('ms.saisieRh') : t('ms.saisieCandidat')}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-stone-200 bg-surface resize-none focus:outline-none focus:border-brand-500 transition-colors text-start"
            />
            <div className="flex items-center justify-between mt-1 px-1 gap-2">
              <span className="text-[10px] text-stone-400">{t('ms.aideClavier')}</span>
              {brouillon.length > LONGUEUR_MAX - 200 && (
                <span className="text-[10px] text-amber-700 tabular-nums shrink-0">
                  {LONGUEUR_MAX - brouillon.length}
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={envoi || !brouillon.trim()}
            className="p-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-30 shrink-0 mb-5 transition-colors"
            aria-label={t('ms.envoyer')}
          >
            {envoi
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4 rtl:rotate-180" />}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Panneau d'accueil, quand aucun fil n'est ouvert ────────────────

function AucunFilOuvert({ estRh, vide, t }: {
  estRh: boolean;
  vide: boolean;
  t: (c: Cle) => string;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center text-center h-full px-8">
      <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mb-5">
        <MessageSquare className="w-7 h-7 text-stone-300" />
      </div>
      <p className="text-base font-bold text-stone-800 mb-2">
        {vide ? t('ms.aucuneConversation') : t('ms.choisirConversation')}
      </p>
      <p className="text-sm text-stone-500 max-w-sm leading-relaxed">
        {vide ? (estRh ? t('ms.videRh') : t('ms.videSalarie')) : t('ms.choisirAide')}
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function MessageriePage() {
  const { candidatureId, employeId } = useParams<{
    candidatureId?: string; employeId?: string;
  }>();
  const { user } = useAuth();
  const { t, tn, langue } = useI18n();

  const estRh = user?.role === 'RH';

  const [fils, setFils] = useState<FilResume[]>([]);
  const [chargement, setChargement] = useState(true);

  /**
   * Les deux sources en parallèle, fusionnées.
   *
   * L'échec de l'une ne doit pas vider l'autre : un candidat n'a pas de
   * fils internes, un salarié sans candidature n'a pas de fils de
   * recrutement, et l'absence de route renvoie une erreur. On ignore
   * donc chaque échec séparément.
   */
  const charger = useCallback(async () => {
    const [recrutement, internes] = await Promise.allSettled([
      api.get('/messages/conversations'),
      api.get('/messages/internes'),
    ]);

    const liste: FilResume[] = [];

    if (recrutement.status === 'fulfilled') {
      const data = (recrutement.value as any)?.data ?? recrutement.value ?? {};
      for (const c of data.conversations ?? []) {
        liste.push({
          cle: c.candidatureId,
          nature: 'recrutement',
          titre: c.interlocuteur,
          sousTitre: c.offreTitre,
          contenu: c.dernierMessage?.contenu ?? '',
          envoyeLe: c.dernierMessage?.envoyeLe ?? '',
          deMoi: c.dernierMessage?.auteurRole === (estRh ? 'RH' : 'CANDIDAT'),
          nonLus: c.nonLus ?? 0,
          statut: c.statut,
        });
      }
    }

    if (internes.status === 'fulfilled') {
      const data = (internes.value as any)?.data ?? internes.value ?? {};
      for (const f of data.fils ?? []) {
        liste.push({
          cle: f.autreId,
          nature: 'interne',
          titre: f.autreNom,
          contenu: f.dernierMessage?.contenu ?? '',
          envoyeLe: f.dernierMessage?.envoyeLe ?? '',
          deMoi: !!f.dernierMessage?.deMoi,
          nonLus: f.nonLus ?? 0,
        });
      }
    }

    liste.sort((a, b) => String(b.envoyeLe).localeCompare(String(a.envoyeLe)));
    setFils(liste);
    setChargement(false);
  }, [estRh]);

  useEffect(() => { charger(); }, [charger]);

  // Ouvrir un fil marque ses messages comme lus : le compteur de la
  // liste doit suivre.
  useEffect(() => {
    if (candidatureId || employeId) charger();
  }, [candidatureId, employeId, charger]);

  // La source est reconstruite à chaque rendu, mais `Fil` ne s'y fie
  // que par sa nature et sa clé — voir la référence dans ce composant.
  const source: SourceFil | null = employeId
    ? {
      nature: 'interne',
      cle: employeId,
      charger: async () => {
        const res = await api.get(`/messages/internes/${employeId}`) as any;
        const d = res?.data ?? res ?? {};
        return {
          messages: d.messages ?? [],
          entete: {
            titre: d.interlocuteur?.nom ?? '—',
            sousTitre: [d.interlocuteur?.poste, d.interlocuteur?.departement]
              .filter(Boolean).join(' · ') || undefined,
          },
        };
      },
      envoyer: async (contenu) => {
        await api.post(`/messages/internes/${employeId}`, { contenu });
      },
    }
    : candidatureId
      ? {
        nature: 'recrutement',
        cle: candidatureId,
        charger: async () => {
          const res = await api.get(`/messages/${candidatureId}`) as any;
          const d = res?.data ?? res ?? {};
          const c = d.candidature ?? {};
          return {
            messages: d.messages ?? [],
            entete: {
              titre: estRh ? (c.candidatNom ?? t('ms.candidat')) : t('ms.serviceRecrutement'),
              sousTitre: c.offreTitre ?? t('ms.candidatureSpontanee'),
              statut: c.statut,
              clos: ['EMBAUCHE', 'REFUSE'].includes(c.statut),
            },
          };
        },
        envoyer: async (contenu) => {
          await api.post(`/messages/${candidatureId}`, { contenu });
        },
      }
      : null;

  const totalNonLus = fils.reduce((s, f) => s + f.nonLus, 0);
  const cleActive = employeId ?? candidatureId;

  return (
    <Layout>
      {/* ── En-tête ── */}
      <div className="px-6 sm:px-8 py-6 border-b border-stone-200">
        <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
          <span>{estRh ? t('ms.filRecrutement') : t('ms.filMonEspace')}</span>
          <ChevronRight className="w-3 h-3 rtl:rotate-180" />
          <span className="text-brand-texte font-semibold">{t('ms.titre')}</span>
        </nav>
        <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">{t('ms.titre')}</h2>
        <p className="text-stone-500 mt-1 text-sm">
          {chargement ? t('ms.chargement') : (
            <>
              {tn('ms.conversations', fils.length)}
              {totalNonLus > 0 && (
                <span className="text-brand-texte font-semibold">
                  {' · '}{tn('ms.nonLus', totalNonLus)}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* ── Deux colonnes ── */}
      {/* La liste reste visible pendant la lecture : passer d'un fil à
          l'autre est un clic, pas un aller-retour. En écran étroit,
          seule la colonne utile est affichée. */}
      <div className="px-6 sm:px-8 py-6">
        <div
          className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5"
          style={{ height: 'calc(100vh - 220px)', minHeight: 480 }}
        >
          <div className={cleActive ? 'hidden lg:block' : ''}>
            <PanneauFils
              fils={fils}
              actif={cleActive}
              chargement={chargement}
              estRh={estRh}
              langue={langue}
              t={t}
            />
          </div>

          <div className={cleActive ? '' : 'hidden lg:block'}>
            {source ? (
              <Fil
                key={`${source.nature}-${source.cle}`}
                source={source}
                estRh={estRh}
                onChange={charger}
                langue={langue}
                t={t}
              />
            ) : (
              <AucunFilOuvert
                estRh={estRh}
                vide={!chargement && fils.length === 0}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      {/* L'ascenseur suit le thème : l'ancienne couleur était figée. */}
      <style>{`
        .ascenseur-discret::-webkit-scrollbar { width: 6px; height: 6px; }
        .ascenseur-discret::-webkit-scrollbar-track { background: transparent; }
        .ascenseur-discret::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, currentColor 18%, transparent);
          border-radius: 10px;
        }
        .ascenseur-discret { scrollbar-width: thin; }
      `}</style>
    </Layout>
  );
}