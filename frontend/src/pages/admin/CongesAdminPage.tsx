// src/pages/admin/CongesAdminPage.tsx

import { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, Clock,
  Search, SlidersHorizontal, Users,
  ChevronDown, MessageSquare, X,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { congesService, type Conge, type DecisionConge } from '../../services/conges';
import { LIBELLES_STATUT_CONGE, LIBELLES_TYPE_CONGE, libelle } from '../../types/domaine';
import type { StatutConge } from '../../types/domaine';

// Le style reste ici (préoccupation d'affichage), le vocabulaire métier
// vit dans types/domaine.ts.
const STYLE_STATUT: Record<StatutConge, {
  bg: string; text: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  EN_ATTENTE: { bg: 'bg-amber-50',  text: 'text-amber-600', icon: Clock },
  APPROUVE:   { bg: 'bg-[#d8f3dc]', text: 'text-[#2d6a4f]', icon: CheckCircle2 },
  REFUSE:     { bg: 'bg-red-50',    text: 'text-red-500',   icon: XCircle },
};

// Un statut inattendu venu du serveur ne doit jamais faire tomber la page
const STYLE_DEFAUT = { bg: 'bg-gray-50', text: 'text-gray-500', icon: Clock };

// ── Modale de traitement ──────────────────────────────────────────
function ModalTraitement({
  conge,
  onClose,
  onSuccess,
}: {
  conge: Conge;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [statut, setStatut] = useState<DecisionConge>('APPROUVE');
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErreur('');
    try {
      await congesService.traiter(conge.id, statut, commentaire);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || 'Erreur lors du traitement');
    } finally {
      setLoading(false);
    }
  };

  const approuve = statut === 'APPROUVE';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">

        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8]">
          <div>
            <h2 className="font-bold text-lg text-[#1a1a1a]">Traiter la demande</h2>
            <p className="text-sm text-[#6b7280]">
              {conge.employeNom} — {libelle(LIBELLES_TYPE_CONGE, conge.type)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#f5f0e8] rounded-xl">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          <div className="bg-[#f5f0e8] rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Employé</span>
              <span className="font-semibold text-[#1a1a1a]">{conge.employeNom}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Type</span>
              <span className="font-semibold text-[#1a1a1a]">
                {libelle(LIBELLES_TYPE_CONGE, conge.type)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Période</span>
              <span className="font-semibold text-[#1a1a1a]">
                {new Date(conge.dateDebut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                {' → '}
                {new Date(conge.dateFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Durée</span>
              <span className="font-bold text-[#2d6a4f]">
                {conge.nbJours} jour{conge.nbJours > 1 ? 's' : ''} ouvrable{conge.nbJours > 1 ? 's' : ''}
              </span>
            </div>
            {conge.motif && (
              <div className="pt-2 border-t border-[#e5e0d8]">
                <span className="text-xs text-[#6b7280]">Motif : </span>
                <span className="text-xs text-[#374151]">{conge.motif}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wider block mb-2">
              Décision
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatut('APPROUVE')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  approuve
                    ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Approuver
              </button>
              <button
                type="button"
                onClick={() => setStatut('REFUSE')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  !approuve
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-red-400'
                }`}
              >
                <XCircle className="w-4 h-4" />
                Refuser
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wider block mb-2">
              Commentaire {approuve ? '(optionnel)' : '(requis)'}
            </label>
            <textarea
              required={!approuve}
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              rows={3}
              placeholder={approuve ? 'Ajouter un commentaire…' : 'Expliquer le motif du refus…'}
              className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                approuve ? 'bg-[#2d6a4f] hover:bg-[#1b4332]' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {loading ? 'Traitement…' : approuve ? "Confirmer l'approbation" : 'Confirmer le refus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ligne du tableau ──────────────────────────────────────────────
function CongeRow({
  conge,
  onTraiter,
}: {
  conge: Conge;
  onTraiter: (c: Conge) => void;
}) {
  const style = STYLE_STATUT[conge.statut] ?? STYLE_DEFAUT;
  const StatutIcon = style.icon;

  const initiales = conge.employeNom
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <tr className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#fafaf8] transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2d6a4f] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initiales}
          </div>
          <div>
            <div className="font-semibold text-sm text-[#1a1a1a]">{conge.employeNom}</div>
            <div className="text-xs text-[#9ca3af]">
              Demandé le {new Date(conge.demandeLe).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-4">
        <span className="text-sm text-[#374151]">
          {libelle(LIBELLES_TYPE_CONGE, conge.type)}
        </span>
      </td>

      <td className="px-4 py-4">
        <div className="text-sm text-[#374151]">
          {new Date(conge.dateDebut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          {' → '}
          {new Date(conge.dateFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </div>
        <div className="text-xs text-[#9ca3af]">
          {conge.nbJours} jour{conge.nbJours > 1 ? 's' : ''}
        </div>
      </td>

      <td className="px-4 py-4">
        <span className="text-sm text-[#6b7280] line-clamp-1 max-w-37.5">
          {conge.motif || '—'}
        </span>
      </td>

      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${style.bg} ${style.text}`}>
          <StatutIcon className="w-3.5 h-3.5" />
          {libelle(LIBELLES_STATUT_CONGE, conge.statut)}
        </span>
      </td>

      <td className="px-4 py-4">
        {conge.statut === 'EN_ATTENTE' ? (
          <button
            onClick={() => onTraiter(conge)}
            className="flex items-center gap-1.5 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Traiter
          </button>
        ) : (
          <div className="text-xs text-[#9ca3af]">
            {conge.traitePar && <span>Par {conge.traitePar}</span>}
            {conge.commentaireRH && (
              <div className="flex items-center gap-1 mt-0.5">
                <MessageSquare className="w-3 h-3" />
                <span className="line-clamp-1 max-w-25">{conge.commentaireRH}</span>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────
type FiltreStatut = StatutConge | 'tous';

const FILTRES: { cle: FiltreStatut; label: string }[] = [
  { cle: 'tous', label: 'Tous' },
  { cle: 'EN_ATTENTE', label: 'En attente' },
  { cle: 'APPROUVE', label: 'Approuvés' },
  { cle: 'REFUSE', label: 'Refusés' },
];

export default function CongesAdminPage() {
  const [conges, setConges] = useState<Conge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous');
  const [congeATraiter, setCongeATraiter] = useState<Conge | null>(null);
  const [flash, setFlash] = useState('');

  const charger = async () => {
    try {
      setLoading(true);
      const res = await congesService.lister();
      setConges(res?.data?.conges ?? []);
    } catch (e) {
      console.error('Chargement des congés :', e);
      setConges([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 4000);
  };

  const filtres = conges.filter(c => {
    const correspondRecherche = c.employeNom.toLowerCase().includes(search.toLowerCase());
    const correspondStatut = filtreStatut === 'tous' || c.statut === filtreStatut;
    return correspondRecherche && correspondStatut;
  });

  const stats = {
    total: conges.length,
    attente: conges.filter(c => c.statut === 'EN_ATTENTE').length,
    approuve: conges.filter(c => c.statut === 'APPROUVE').length,
    refuse: conges.filter(c => c.statut === 'REFUSE').length,
    joursAccordes: conges
      .filter(c => c.statut === 'APPROUVE')
      .reduce((s, c) => s + (c.nbJours || 0), 0),
  };

  const cartes = [
    { label: 'Total demandes', value: stats.total, icone: '📋', couleur: 'bg-[#f5f0e8]' },
    { label: 'En attente', value: stats.attente, icone: '⏳', couleur: 'bg-amber-50', urgent: stats.attente > 0 },
    { label: 'Approuvés', value: stats.approuve, icone: '✅', couleur: 'bg-[#d8f3dc]' },
    { label: 'Refusés', value: stats.refuse, icone: '❌', couleur: 'bg-red-50' },
    { label: 'Jours accordés', value: stats.joursAccordes, icone: '📅', couleur: 'bg-blue-50' },
  ];

  return (
    <Layout searchPlaceholder="Rechercher...">
      <div>
        {flash && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white px-5 py-3 rounded-xl shadow-lg text-sm">
            {flash}
          </div>
        )}

        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Gestion des congés</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Gérez et traitez les demandes de congés des employés
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-7">
          {cartes.map(c => (
            <div
              key={c.label}
              className={`bg-white border rounded-2xl p-5 ${
                c.urgent ? 'border-amber-300 ring-2 ring-amber-100' : 'border-[#e5e0d8]'
              }`}
            >
              <div className={`w-11 h-11 ${c.couleur} rounded-xl flex items-center justify-center text-xl mb-3`}>
                {c.icone}
              </div>
              <div className="text-2xl font-bold text-[#1a1a1a]">{loading ? '…' : c.value}</div>
              <div className="text-xs text-[#6b7280] font-medium mt-0.5">{c.label}</div>
              {c.urgent && (
                <div className="text-xs text-amber-600 font-semibold mt-1">Action requise</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Rechercher un employé…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30"
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1">
            {FILTRES.map(f => (
              <button
                key={f.cle}
                onClick={() => setFiltreStatut(f.cle)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filtreStatut === f.cle
                    ? 'bg-[#2d6a4f] text-white'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 border border-[#e5e0d8] bg-white px-4 py-2.5 rounded-xl text-sm hover:bg-[#f5f0e8]">
            <SlidersHorizontal className="w-4 h-4 text-[#6b7280]" />
            Filtres
          </button>
        </div>

        {stats.attente > 0 && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-5 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-semibold text-amber-700">
                {stats.attente} demande{stats.attente > 1 ? 's' : ''} en attente
              </span>
              <span className="text-amber-600 text-sm ml-2">
                — à traiter dans les meilleurs délais.
              </span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#e5e0d8]">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#1a1a1a] text-lg">Demandes de congés</h3>
              <span className="text-xs bg-[#f0ebe0] text-[#6b7280] px-2.5 py-0.5 rounded-full font-medium">
                {filtres.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
              <Users className="w-4 h-4" />
              {loading ? '…' : `${conges.length} au total`}
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0] bg-[#fafaf8]">
                {['Employé', 'Type', 'Période', 'Motif', 'Statut', 'Actions'].map(h => (
                  <th
                    key={h}
                    className={`text-left ${h === 'Employé' ? 'px-6' : 'px-4'} py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-28 animate-pulse" />
                          <div className="h-2.5 bg-gray-100 rounded w-20 animate-pulse" />
                        </div>
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-gray-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtres.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm text-[#6b7280]">
                      {search ? `Aucun résultat pour « ${search} »` : 'Aucune demande de congé.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtres.map(conge => (
                  <CongeRow key={conge.id} conge={conge} onTraiter={setCongeATraiter} />
                ))
              )}
            </tbody>
          </table>

          {!loading && filtres.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#fafaf8]">
              <span className="text-xs text-[#6b7280]">
                <strong>{filtres.length}</strong> demande{filtres.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {congeATraiter && (
        <ModalTraitement
          conge={congeATraiter}
          onClose={() => setCongeATraiter(null)}
          onSuccess={() => {
            showFlash(`Demande de ${congeATraiter.employeNom} traitée`);
            charger();
          }}
        />
      )}
    </Layout>
  );
}