// src/pages/shared/EvenementsPage.tsx
//
// Vue participant, commune aux employes et aux candidats. Le serveur
// filtre selon l'audience : un candidat ne voit jamais un evenement
// purement interne.
//
// Cette page est un catalogue : on parcourt et on s'inscrit. Une fois
// inscrit, l'événement rejoint l'agenda, qui ne porte que ce qui
// engage.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, MapPin, Video, Users, Clock, Check, X, GraduationCap,
  PartyPopper, DoorOpen, Presentation, Building2, AlertCircle, Lock,
  CalendarCheck, ChevronRight, Search, CheckCircle2, ArrowRight,
  Info, Download,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Pagination from '@/components/ui/Pagination';
import api from '@/services/api';
import { telechargerIcs } from '@/utils/ics';
import { useAuth } from '@/context/AuthContext';

const ACCENT = '#4F46E5';
const FOND = 'transparent';
const PAR_PAGE = 8;

interface Evenement {
  id: string;
  titre: string;
  description: string;
  type: string;
  typeLibelle: string;
  audience: 'INTERNE' | 'PUBLIC' | 'MIXTE';
  dateDebut: string;
  dateFin: string;
  lieu?: string | null;
  adresse?: string | null;
  lienVisio?: string | null;
  capaciteMax?: number | null;
  dateLimiteInscription?: string | null;
  inscriptionRequise: boolean;
  obligatoire: boolean;
  organisateur?: string;
  departement?: string | null;
  nbParticipants: number;
  placesRestantes: number | null;
  inscrit: boolean;
  complet: boolean;
  inscriptionsFermees: boolean;
}

// Style uniquement : le libellé métier vient du serveur.
const STYLE_TYPE: Record<string, { icone: any; bg: string; text: string; barre: string }> = {
  FORMATION:       { icone: GraduationCap, bg: 'bg-blue-50',      text: 'text-blue-600',   barre: 'bg-blue-400' },
  SEMINAIRE:       { icone: Presentation,  bg: 'bg-purple-50',    text: 'text-purple-600', barre: 'bg-purple-400' },
  TEAM_BUILDING:   { icone: Users,         bg: 'bg-brand-500/10', text: 'text-brand-texte',  barre: 'bg-brand-500' },
  REUNION:         { icone: Building2,     bg: 'bg-stone-100',    text: 'text-stone-500',  barre: 'bg-stone-300' },
  FESTIVAL:        { icone: PartyPopper,   bg: 'bg-rose-50',      text: 'text-rose-600',   barre: 'bg-rose-400' },
  PORTES_OUVERTES: { icone: DoorOpen,      bg: 'bg-amber-50',     text: 'text-amber-600',  barre: 'bg-amber-400' },
  SALON:           { icone: Users,         bg: 'bg-amber-50',     text: 'text-amber-600',  barre: 'bg-amber-400' },
  WEBINAIRE:       { icone: Video,         bg: 'bg-purple-50',    text: 'text-purple-600', barre: 'bg-purple-400' },
};

const TYPE_DEFAUT = {
  icone: Calendar, bg: 'bg-stone-100', text: 'text-stone-500', barre: 'bg-stone-300',
};

const styleType = (t: string) => STYLE_TYPE[t] ?? TYPE_DEFAUT;

/**
 * Nom de fichier lisible à partir d'un titre.
 *
 * normalize('NFD') sépare la lettre de son accent, qu'on retire
 * ensuite : « sécurité » devient « securite » et non « s-curit ».
 */
const nomDeFichier = (titre: string) =>
  titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'evenement';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formaterPeriode(debut: string, fin: string): string {
  const d = new Date(debut);
  const f = new Date(fin);
  const memeJour = d.toDateString() === f.toDateString();

  const jour = d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const heureDebut = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const heureFin = f.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (memeJour) return `${jour}, ${heureDebut} – ${heureFin}`;
  return `Du ${jour} au ${f.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/** Jours calendaires, pas horaires : « demain à 9 h » reste demain */
function joursAvant(iso: string): number {
  const cible = new Date(iso);
  const jour = new Date();
  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate());
  return Math.round((a - b) / 86400000);
}

// ── Composants partagés ────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, fond, texte }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  fond: string;
  texte: string;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-[280px]">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Section({ icone: Icone, titre, compteur, children }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  compteur?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
        <Icone className="w-4 h-4 text-brand-texte" />
        {titre}
        {compteur != null && compteur > 0 && (
          <span className="text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
            {compteur}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

// ── Fiche détaillée ────────────────────────────────────────────────
//
// La carte d'une liste doit rester lisible : elle tronque la
// description et tait l'adresse, le département et le public visé.
// Le serveur renvoie pourtant tout cela. La fiche l'affiche en entier
// et porte les actions — s'inscrire, se désinscrire, rejoindre la
// visio, mettre l'événement dans son propre agenda.

const LIBELLE_AUDIENCE: Record<string, string> = {
  INTERNE: 'Réservé au personnel',
  PUBLIC: 'Ouvert à l’extérieur',
  MIXTE: 'Personnel et public externe',
};

function Champ({ icone: Icone, libelle, children }: {
  icone: React.ComponentType<{ className?: string }>;
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
        <Icone className="w-4 h-4 text-stone-400" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {libelle}
        </div>
        <div className="text-sm text-stone-700 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function ModalEvenement({ evenement, occupe, erreur, onBasculer, onAgenda, onFermer }: {
  evenement: Evenement;
  occupe: boolean;
  erreur: string;
  onBasculer: (e: Evenement) => void;
  onAgenda: (e: Evenement) => void;
  onFermer: () => void;
}) {
  const [confirmation, setConfirmation] = useState(false);

  const style = styleType(evenement.type);
  const Icone = style.icone;
  const jours = joursAvant(evenement.dateDebut);
  const passe = jours < 0;

  const bloque = evenement.complet || evenement.inscriptionsFermees;
  const places = evenement.placesRestantes ?? 0;

  // Fermer avec Échap : un panneau qui se ferme au clavier évite
  // d'aller chercher la croix à la souris.
  useEffect(() => {
    const auClavier = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onFermer]);

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={onFermer}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={evenement.titre}
      >
        {/* ── En-tête ── */}
        <div className={`px-6 py-5 border-b border-stone-100 ${style.bg}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface ${style.text}`}>
                  <Icone className="w-2.5 h-2.5" />
                  {evenement.typeLibelle}
                </span>

                {evenement.obligatoire && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                    <Lock className="w-2.5 h-2.5" />
                    Obligatoire
                  </span>
                )}

                {evenement.inscrit && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-texte">
                    <CalendarCheck className="w-2.5 h-2.5" />
                    Vous êtes inscrit
                  </span>
                )}

                {passe && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
                    Terminé
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold text-stone-800">{evenement.titre}</h3>
            </div>

            <button
              onClick={onFermer}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-surface/60 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="px-6 py-5 space-y-5 max-h-[55vh] overflow-y-auto">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Champ icone={Calendar} libelle="Quand">
              <span className="capitalize">
                {formaterPeriode(evenement.dateDebut, evenement.dateFin)}
              </span>
              {!passe && jours >= 0 && jours <= 30 && (
                <span className="block text-[10px] text-stone-400 mt-0.5">
                  {jours === 0 ? "C'est aujourd'hui"
                    : jours === 1 ? "C'est demain"
                    : `Dans ${jours} jours`}
                </span>
              )}
            </Champ>

            <Champ icone={evenement.lienVisio ? Video : MapPin} libelle="Où">
              {evenement.lieu ?? (evenement.lienVisio ? 'En ligne' : 'Lieu non précisé')}
              {evenement.adresse && (
                <span className="block text-[10px] text-stone-400 mt-0.5">
                  {evenement.adresse}
                </span>
              )}
            </Champ>

            {evenement.organisateur && (
              <Champ icone={Building2} libelle="Organisé par">
                {evenement.organisateur}
                {evenement.departement && (
                  <span className="block text-[10px] text-stone-400 mt-0.5">
                    {evenement.departement}
                  </span>
                )}
              </Champ>
            )}

            <Champ icone={Users} libelle="Participation">
              {evenement.nbParticipants} inscrit{evenement.nbParticipants > 1 ? 's' : ''}
              {evenement.capaciteMax && ` sur ${evenement.capaciteMax} places`}
              <span className="block text-[10px] text-stone-400 mt-0.5">
                {LIBELLE_AUDIENCE[evenement.audience] ?? evenement.audience}
              </span>
            </Champ>
          </div>

          {/* La description en entier : c'est ce que la carte coupe. */}
          {evenement.description && (
            <div className="pt-4 border-t border-stone-100">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Description
              </div>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                {evenement.description}
              </p>
            </div>
          )}

          {/* Jauge : une place restante se voit mieux qu'elle ne se lit. */}
          {evenement.capaciteMax != null && !passe && (
            <div className="pt-4 border-t border-stone-100">
              <div className="h-1.5 rounded-full overflow-hidden bg-stone-100">
                <div
                  className={`h-full rounded-full ${
                    evenement.complet ? 'bg-red-400'
                      : places <= 3 ? 'bg-amber-400'
                      : 'bg-brand-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (evenement.nbParticipants / evenement.capaciteMax) * 100)}%`,
                  }}
                />
              </div>
              <p className={`text-[10px] mt-1.5 font-bold ${
                evenement.complet ? 'text-red-500'
                  : places <= 3 ? 'text-amber-600'
                  : 'text-stone-400'
              }`}>
                {evenement.complet
                  ? 'Complet'
                  : `${places} place${places > 1 ? 's' : ''} restante${places > 1 ? 's' : ''}`}
              </p>
            </div>
          )}

          {evenement.dateLimiteInscription && !passe && (
            <div className={`flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 ${
              evenement.inscriptionsFermees
                ? 'bg-red-50 text-red-500'
                : 'bg-stone-100 text-stone-500'
            }`}>
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {evenement.inscriptionsFermees
                ? 'Les inscriptions sont closes'
                : `Inscriptions jusqu'au ${new Date(evenement.dateLimiteInscription)
                  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </div>
          )}

          {erreur && (
            <div className="flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-50 text-red-500">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50 flex items-center gap-3 flex-wrap">

          {confirmation ? (
            // Se désinscrire efface une place que quelqu'un d'autre
            // attend peut-être : la question se pose une fois.
            <>
              <span className="text-xs font-bold text-stone-700 flex-1 min-w-[12rem]">
                Confirmer la désinscription ?
              </span>
              <button
                onClick={() => setConfirmation(false)}
                className="text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-surface transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmation(false); onBasculer(evenement); }}
                disabled={occupe}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-40 transition-colors"
              >
                {occupe
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <X className="w-4 h-4" />}
                Oui, me désinscrire
              </button>
            </>
          ) : (
            <>
              {/* L'événement dans l'agenda personnel du salarié —
                  Google Agenda, Outlook, Apple Calendrier. */}
              <button
                onClick={() => onAgenda(evenement)}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-surface transition-colors"
                title="Télécharger un fichier .ics"
              >
                <Download className="w-4 h-4" />
                Mettre dans mon agenda
              </button>

              {evenement.lienVisio && evenement.inscrit && (
                <a
                  href={evenement.lienVisio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
                >
                  <Video className="w-4 h-4" />
                  Rejoindre
                </a>
              )}

              <div className="flex-1" />

              {!passe && evenement.inscriptionRequise && (
                evenement.inscrit ? (
                  <button
                    onClick={() => setConfirmation(true)}
                    disabled={occupe || evenement.obligatoire}
                    title={evenement.obligatoire
                      ? 'Événement obligatoire, désinscription impossible'
                      : 'Se désinscrire'}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Se désinscrire
                  </button>
                ) : (
                  <button
                    onClick={() => onBasculer(evenement)}
                    disabled={occupe || bloque}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors"
                  >
                    {occupe
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Check className="w-4 h-4" />}
                    {evenement.complet ? 'Complet'
                      : evenement.inscriptionsFermees ? 'Inscriptions closes'
                      : "S'inscrire"}
                  </button>
                )
              )}

              {!passe && !evenement.inscriptionRequise && (
                <span className="text-xs text-stone-400">
                  Participation libre, aucune inscription nécessaire.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ligne d'événement ──────────────────────────────────────────────
function LigneEvenement({ evenement, onBasculer, onFiche, occupe, passe }: {
  evenement: Evenement;
  onBasculer: (e: Evenement) => void;
  onFiche: (e: Evenement) => void;
  occupe: boolean;
  passe?: boolean;
}) {
  const style = styleType(evenement.type);
  const Icone = style.icone;
  const jours = joursAvant(evenement.dateDebut);
  const date = new Date(evenement.dateDebut);

  const bloque = evenement.complet || evenement.inscriptionsFermees;
  const places = evenement.placesRestantes ?? 0;

  // Moins de trois places restantes : c'est le moment où la rareté
  // devient une information utile, pas un argument de vente.
  const presqueComplet = evenement.capaciteMax != null
    && !evenement.complet
    && places <= 3;

  return (
    <div
      className={`bg-surface rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md ${
        evenement.inscrit ? 'border-brand-500/40' : 'border-stone-100'
      } ${passe ? 'opacity-60' : ''}`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${evenement.inscrit ? 'bg-brand-500' : style.barre}`} />

        <div className="flex-1 p-5">

          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* La date en pavé : repérer un jour dans une liste est
                  plus rapide qu'en lisant une phrase complète. */}
              <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${style.bg}`}>
                <span className={`text-sm font-bold leading-none ${style.text}`}>
                  {date.getDate()}
                </span>
                <span className="text-[8px] text-stone-400 uppercase mt-0.5">
                  {MOIS_COURTS[date.getMonth()].slice(0, 4)}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-stone-800">{evenement.titre}</h4>

                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                    <Icone className="w-2.5 h-2.5" />
                    {evenement.typeLibelle}
                  </span>

                  {evenement.obligatoire && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                      <Lock className="w-2.5 h-2.5" />
                      Obligatoire
                    </span>
                  )}

                  {evenement.inscrit && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-texte">
                      <CalendarCheck className="w-2.5 h-2.5" />
                      Inscrit
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-500 mt-1 capitalize">
                  {formaterPeriode(evenement.dateDebut, evenement.dateFin)}
                </p>
              </div>
            </div>

            {!passe && jours >= 0 && jours <= 7 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 shrink-0">
                {jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `J-${jours}`}
              </span>
            )}
          </div>

          {evenement.description && (
            <p className="text-sm text-stone-500 mb-3 line-clamp-2 leading-relaxed">
              {evenement.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-stone-500 flex-wrap mb-3">
            {evenement.lieu && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400" />
                {evenement.lieu}
              </span>
            )}
            {evenement.lienVisio && (
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-stone-400" />
                En ligne
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-stone-400" />
              {evenement.nbParticipants} inscrit{evenement.nbParticipants > 1 ? 's' : ''}
              {evenement.capaciteMax && ` sur ${evenement.capaciteMax}`}
            </span>
            {evenement.organisateur && (
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-stone-400" />
                {evenement.organisateur}
              </span>
            )}
          </div>

          {/* Jauge de remplissage : une place restante se voit mieux
              qu'elle ne se lit. */}
          {evenement.capaciteMax && !passe && (
            <div className="mb-3">
              <div className="h-1.5 rounded-full overflow-hidden bg-stone-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    evenement.complet ? 'bg-red-400'
                      : presqueComplet ? 'bg-amber-400'
                      : 'bg-brand-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (evenement.nbParticipants / evenement.capaciteMax) * 100)}%`,
                  }}
                />
              </div>
              <p className={`text-[10px] mt-1 font-bold ${
                evenement.complet ? 'text-red-500'
                  : presqueComplet ? 'text-amber-600'
                  : 'text-stone-400'
              }`}>
                {evenement.complet
                  ? 'Complet'
                  : `${places} place${places > 1 ? 's' : ''} restante${places > 1 ? 's' : ''}`}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">

            {/* Toujours présent, même sur un événement passé ou sans
                inscription : c'est la porte vers la description
                complète, l'adresse et le public visé, que la carte
                ne peut pas montrer sans devenir illisible. */}
            <button
              onClick={() => onFiche(evenement)}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
            >
              <Info className="w-4 h-4" />
              Détails
            </button>

            {!passe && evenement.inscriptionRequise && (
              <>
              {evenement.inscrit ? (
                <>
                  {evenement.lienVisio && (
                    <a
                      href={evenement.lienVisio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      Rejoindre
                    </a>
                  )}
                  <button
                    onClick={() => onBasculer(evenement)}
                    disabled={occupe || evenement.obligatoire}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                    title={evenement.obligatoire
                      ? 'Événement obligatoire, désinscription impossible'
                      : 'Se désinscrire'}
                  >
                    {occupe
                      ? <span className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                      : <X className="w-4 h-4" />}
                    Se désinscrire
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onBasculer(evenement)}
                  disabled={occupe || bloque}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-40 transition-colors"
                >
                  {occupe
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                  {evenement.complet ? 'Complet'
                    : evenement.inscriptionsFermees ? 'Inscriptions closes'
                    : "S'inscrire"}
                </button>
              )}

              {evenement.dateLimiteInscription
                && !evenement.inscrit
                && !evenement.inscriptionsFermees && (
                <span className="flex items-center gap-1.5 text-[10px] text-stone-400">
                  <Clock className="w-3 h-3" />
                  Inscriptions jusqu'au{' '}
                  {new Date(evenement.dateLimiteInscription).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long',
                  })}
                </span>
              )}
              </>
            )}

            {/* Un événement sans inscription requise n'a pas de bouton
                d'inscription : le dire évite de chercher ce qui
                n'existe pas. */}
            {!passe && !evenement.inscriptionRequise && (
              <span className="text-xs text-stone-400">
                Participation libre, aucune inscription nécessaire.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function EvenementsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Page partagée entre candidats et salariés, qui n'ont pas le même
  // agenda. Le discriminant est la fiche employé : un candidat n'en a
  // pas. Si ton AuthContext expose un rôle, il est plus explicite.
  const routeAgenda = (user as any)?.employeId
    ? '/employe/agenda'
    : '/candidat/agenda';

  // L'événement dont la fiche est ouverte. On garde l'identifiant et
  // non l'objet : après une inscription la liste est rechargée, et un
  // objet figé afficherait encore l'ancien état — le bouton dirait
  // toujours « S'inscrire ».
  const [ficheId, setFicheId] = useState<string | null>(null);

  const [pageAVenir, setPageAVenir] = useState(1);
  const [pagePasses, setPagePasses] = useState(1);

  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [passes, setPasses] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<string>('tous');
  const [recherche, setRecherche] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = async () => {
    try {
      setChargement(true);
      const res = await api.get('/evenements') as any;
      setEvenements(res?.data?.evenements ?? []);
      setPasses(res?.data?.passes ?? []);
    } catch (e) {
      console.error('Chargement des événements :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const basculer = async (e: Evenement) => {
    setOccupe(e.id);
    setErreur('');
    try {
      if (e.inscrit) {
        await api.delete(`/evenements/${e.id}/inscription`);
        setToast('Désinscription enregistrée');
      } else {
        await api.post(`/evenements/${e.id}/inscription`);
        setToast(`Inscription confirmée, ajoutée à votre agenda`);
      }
      await charger();
    } catch (err: any) {
      setErreur(err?.erreur ?? 'Opération impossible');
    } finally {
      setOccupe(null);
    }
  };

  // Les filtres n'affichent que les types réellement présents :
  // proposer un filtre vide est une impasse pour l'utilisateur.
  const typesPresents = useMemo(() => {
    const types = new Map<string, string>();
    for (const e of evenements) types.set(e.type, e.typeLibelle);
    return [...types.entries()];
  }, [evenements]);

  const correspond = (e: Evenement) => {
    const terme = recherche.trim().toLowerCase();
    return !terme || `${e.titre} ${e.description} ${e.lieu ?? ''} ${e.typeLibelle}`
      .toLowerCase().includes(terme);
  };

  const filtres = useMemo(
    () => evenements
      .filter((e) => filtre === 'tous' || e.type === filtre)
      .filter(correspond)
      // Les inscriptions d'abord, puis par date : ce qui m'engage
      // passe avant ce qui m'est proposé.
      .sort((a, b) => {
        if (a.inscrit !== b.inscrit) return a.inscrit ? -1 : 1;
        return String(a.dateDebut).localeCompare(String(b.dateDebut));
      }),
    [evenements, filtre, recherche]
  );

  const passesFiltres = useMemo(() => passes.filter(correspond), [passes, recherche]);

  // Filtrer en étant page 3 laisse une liste vide avec « 0 résultat » :
  // on revient au début dès que le filtre ou la recherche change.
  useEffect(() => { setPageAVenir(1); setPagePasses(1); }, [filtre, recherche]);

  const fiche = ficheId
    ? [...evenements, ...passes].find((e) => e.id === ficheId) ?? null
    : null;

  // Un seul événement dans un fichier .ics : le salarié le dépose dans
  // Google Agenda, Outlook ou Apple Calendrier sans passer par
  // l'export complet de son agenda.
  const ajouterAgenda = (e: Evenement) => {
    const ok = telechargerIcs([{
      id: `evenement-${e.id}`,
      titre: e.titre,
      description: e.description,
      lieu: e.adresse ?? e.lieu,
      url: e.lienVisio,
      debut: e.dateDebut,
      fin: e.dateFin,
      journeeEntiere: false,
    }], `${nomDeFichier(e.titre)}.ics`);

    setToast(ok
      ? 'Événement téléchargé, ouvrez-le dans votre agenda'
      : 'Impossible de générer le fichier');
  };

  const pageFiltres = filtres.slice((pageAVenir - 1) * PAR_PAGE, pageAVenir * PAR_PAGE);
  const pagePassesFiltres = passesFiltres.slice(
    (pagePasses - 1) * PAR_PAGE, pagePasses * PAR_PAGE
  );

  const mesInscriptions = evenements.filter((e) => e.inscrit).length;
  const obligatoires = evenements.filter((e) => e.obligatoire && !e.inscrit).length;
  const presqueComplets = evenements.filter(
    (e) => !e.inscrit && !e.complet && e.capaciteMax != null && (e.placesRestantes ?? 0) <= 3
  ).length;

  const prochain = evenements.filter((e) => e.inscrit)[0];

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un événement…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Entreprise</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Événements</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Événements</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  Formations, rencontres et journées organisées par l'entreprise
                  {mesInscriptions > 0 && (
                    <span className="text-brand-texte font-semibold">
                      {' · '}{mesInscriptions} inscription{mesInscriptions > 1 ? 's' : ''}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Titre, lieu…"
                className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
              />
              {recherche && (
                <button
                  onClick={() => setRecherche('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                >
                  <X className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>

            
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Calendar}
              label="Événements à venir"
              value={chargement ? '…' : evenements.length}
              sub={`${typesPresents.length} type${typesPresents.length > 1 ? 's' : ''} proposé${typesPresents.length > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={CalendarCheck}
              label="Mes inscriptions"
              value={chargement ? '…' : mesInscriptions}
              sub={prochain
                ? `prochain le ${new Date(prochain.dateDebut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                : 'aucune pour le moment'}
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={Lock}
              label="Obligatoires"
              value={chargement ? '…' : obligatoires}
              sub={obligatoires > 0 ? 'inscription requise' : 'rien d\u2019obligatoire'}
              fond="bg-red-50"
              texte="text-red-500"
            />
            <StatCard
              icon={Users}
              label="Bientôt complets"
              value={chargement ? '…' : presqueComplets}
              sub="trois places ou moins"
              fond="bg-amber-50"
              texte="text-amber-600"
            />
          </div>

          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-sm bg-red-50 text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Filtres par type ── */}
          {typesPresents.length > 1 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setFiltre('tous')}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                style={{
                  backgroundColor: filtre === 'tous' ? ACCENT : 'white',
                  color: filtre === 'tous' ? 'white' : '#656C86',
                  borderColor: filtre === 'tous' ? ACCENT : '#DFE3F0',
                }}
              >
                Tous
              </button>
              {typesPresents.map(([cle, libelle]) => (
                <button
                  key={cle}
                  onClick={() => setFiltre(cle)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  style={{
                    backgroundColor: filtre === cle ? ACCENT : 'white',
                    color: filtre === cle ? 'white' : '#656C86',
                    borderColor: filtre === cle ? ACCENT : '#DFE3F0',
                  }}
                >
                  {libelle}
                </button>
              ))}
            </div>
          )}

          {chargement ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-56" />
                      <div className="h-3 bg-stone-100 rounded w-40" />
                    </div>
                  </div>
                  <div className="h-9 bg-stone-50 rounded-xl w-32" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">

              <Section icone={Calendar} titre="À venir" compteur={filtres.length}>
                {filtres.length === 0 ? (
                  <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
                      <Calendar className="w-5 h-5 text-stone-300" />
                    </div>
                    <p className="text-sm text-stone-500">
                      {recherche ? `Aucun événement ne correspond à « ${recherche} »`
                        : filtre !== 'tous' ? 'Aucun événement de ce type'
                        : 'Aucun événement à venir'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {pageFiltres.map((e) => (
                        <LigneEvenement
                          key={e.id}
                          evenement={e}
                          onBasculer={basculer}
                          onFiche={(ev) => setFicheId(ev.id)}
                          occupe={occupe === e.id}
                        />
                      ))}
                    </div>

                    {filtres.length > PAR_PAGE && (
                      <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 mt-4 overflow-hidden">
                        <Pagination
                          page={pageAVenir}
                          taillePage={PAR_PAGE}
                          total={filtres.length}
                          onPage={setPageAVenir}
                          libelle="événement"
                          accent={ACCENT}
                        />
                      </div>
                    )}
                  </>
                )}
              </Section>

              {passesFiltres.length > 0 && (
                <Section icone={Clock} titre="Événements passés" compteur={passesFiltres.length}>
                  <div className="space-y-3">
                    {pagePassesFiltres.map((e) => (
                      <LigneEvenement
                        key={e.id}
                        evenement={e}
                        onBasculer={basculer}
                        onFiche={(ev) => setFicheId(ev.id)}
                        occupe={false}
                        passe
                      />
                    ))}
                  </div>

                  {/* Les anciens sont désormais atteignables, au lieu
                      d'être annoncés comme « non affichés ». */}
                  {passesFiltres.length > PAR_PAGE && (
                    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 mt-4 overflow-hidden">
                      <Pagination
                        page={pagePasses}
                        taillePage={PAR_PAGE}
                        total={passesFiltres.length}
                        onPage={setPagePasses}
                        libelle="événement passé"
                        accent={ACCENT}
                      />
                    </div>
                  )}
                </Section>
              )}

              {/* ── Lien vers l'agenda ── */}
              {/* Cette page est un catalogue ; l'agenda porte ce qui
                  engage. Le dire évite de chercher au mauvais endroit. */}
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                      <CalendarCheck className="w-4 h-4 text-brand-texte" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-800">
                        Vos inscriptions rejoignent votre agenda
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5 leading-relaxed max-w-xl">
                        Cette page présente ce qui vous est proposé. Une fois inscrit,
                        l'événement apparaît dans votre agenda, aux côtés de
                        {(user as any)?.employeId
                          ? ' vos congés et des échéances de votre dossier.'
                          : ' vos entretiens et échéances de quiz.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(routeAgenda)}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shrink-0"
                  >
                    Ouvrir l'agenda
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {fiche && (
          <ModalEvenement
            evenement={fiche}
            occupe={occupe === fiche.id}
            erreur={erreur}
            onBasculer={basculer}
            onAgenda={ajouterAgenda}
            onFermer={() => { setFicheId(null); setErreur(''); }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </Layout>
    </div>
  );
}