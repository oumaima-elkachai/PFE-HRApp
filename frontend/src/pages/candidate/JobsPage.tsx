// src/pages/candidate/JobsPage.tsx
import { useState, useEffect, useRef } from 'react';
import {
  Briefcase, MapPin, Clock, Search,
  SlidersHorizontal, X, ChevronRight,
  CheckCircle, Send, Upload, FileText,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description: string;
  statut: 'active' | 'urgente' | 'fermee';
  creeLe: string;
}

// ── Badge type offre ──────────────────────────
function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CDI:       'bg-[#d8f3dc] text-[#2d6a4f]',
    CDD:       'bg-[#dbeafe] text-[#1e40af]',
    Stage:     'bg-[#fef3c7] text-[#92400e]',
    Freelance: 'bg-[#f3e8ff] text-[#7c3aed]',
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  );
}

// ── Badge statut ──────────────────────────────
function StatutBadge({ statut }: { statut: Offre['statut'] }) {
  if (statut === 'urgente') return (
    <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
      🔥 Urgent
    </span>
  );
  return null;
}

// ── Modal Postuler ────────────────────────────
function ModalPostuler({
  offre,
  onClose,
  onSuccess,
}: {
  offre: Offre;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    nom:              user?.nom        ?? '',
    prenom:           user?.prenom     ?? '',
    email:            user?.email      ?? '',
    telephone:        '',
    niveauEtude:      '',
    experience:       '',
    competences:      '',
    lettreMotivation: '',
    linkedin:         '',
    portfolio:        '',
  });
  
  // ✅ État pour le CV
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvPreview, setCvPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading,  setLoading]  = useState(false);
  const [erreur,   setErreur]   = useState('');
  const [success,  setSuccess]  = useState(false);

  // ✅ Gestion upload CV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const maxSize = 5 * 1024 * 1024; // 5 MB

    if (!allowedTypes.includes(file.type)) {
      setErreur('Format non supporté. Utilisez PDF ou DOCX.');
      return;
    }

    if (file.size > maxSize) {
      setErreur('Le fichier est trop volumineux (max 5 MB).');
      return;
    }

    setCvFile(file);
    setCvPreview(file.name);
    setErreur('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation CV obligatoire
    if (!cvFile) {
      setErreur('⚠️ Le CV est obligatoire');
      return;
    }

    setLoading(true);
    setErreur('');
    
    try {
      // ✅ Créer FormData pour upload multipart
      const formData = new FormData();
      
      // Fichier CV
      formData.append('cv', cvFile);
      
      // Données du formulaire
      formData.append('offreId', offre.id);
      formData.append('nom', form.nom);
      formData.append('prenom', form.prenom);
      formData.append('email', form.email);
      formData.append('telephone', form.telephone);
      formData.append('niveauEtude', form.niveauEtude);
      formData.append('experience', form.experience);
      formData.append('lettreMotivation', form.lettreMotivation);
      formData.append('linkedin', form.linkedin || '');
      formData.append('portfolio', form.portfolio || '');
      
      // Compétences (convertir en JSON)
      const competencesArray = form.competences
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      formData.append('competences', JSON.stringify(competencesArray));

      // ✅ Envoyer avec axios
      const response = await api.post('/candidatures', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log('✅ Candidature envoyée:', response.data);
      setSuccess(true);

    } catch (err: any) {
      console.error('❌ Erreur:', err);
      setErreur(err.response?.data?.erreur || 'Erreur lors de l\'envoi. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  // Écran succès
  if (success) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-[#d8f3dc] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[#2d6a4f]" />
          </div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-2">
            Candidature envoyée !
          </h2>
          <p className="text-sm text-[#6b7280] mb-6">
            Votre candidature pour <strong>{offre.titre}</strong> a bien été reçue.
            Notre équipe RH vous contactera prochainement.
          </p>
          <button
            onClick={() => { onSuccess(); onClose(); }}
            className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8] sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-[#6b7280] mb-0.5">Postuler pour</p>
            <h2 className="font-bold text-lg text-[#1a1a1a]">{offre.titre}</h2>
            <p className="text-sm text-[#2d6a4f]">{offre.departement} • {offre.type}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          {/* Infos personnelles */}
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
              Informations personnelles
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Prénom *</label>
                <input
                  required
                  value={form.prenom}
                  onChange={e => setForm({ ...form, prenom: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Nom *</label>
                <input
                  required
                  value={form.nom}
                  onChange={e => setForm({ ...form, nom: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={form.telephone}
                  onChange={e => setForm({ ...form, telephone: e.target.value })}
                  placeholder="+216 XX XXX XXX"
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
            </div>
          </div>

          {/* ✅ Upload CV */}
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
              📄 Curriculum Vitae *
            </h3>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
            />

            {!cvFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#e5e0d8] rounded-xl p-6 hover:border-[#2d6a4f] hover:bg-[#f5f0e8] transition-all text-center"
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-[#2d6a4f]" />
                  <div>
                    <p className="text-sm font-medium text-[#1a1a1a]">
                      Cliquez pour télécharger votre CV
                    </p>
                    <p className="text-xs text-[#6b7280] mt-1">
                      PDF ou DOCX (max 5 MB)
                    </p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex items-center justify-between bg-[#d8f3dc] border border-[#2d6a4f]/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-[#2d6a4f]" />
                  <div>
                    <p className="text-sm font-medium text-[#1a1a1a]">{cvPreview}</p>
                    <p className="text-xs text-[#6b7280]">
                      {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCvFile(null);
                    setCvPreview('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Supprimer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Parcours */}
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">Parcours</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Niveau d'étude</label>
                <select
                  value={form.niveauEtude}
                  onChange={e => setForm({ ...form, niveauEtude: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                >
                  <option value="">Sélectionner...</option>
                  {['Bac','Bac+2','Licence (Bac+3)','Master (Bac+5)','Doctorat'].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">Expérience</label>
                <select
                  value={form.experience}
                  onChange={e => setForm({ ...form, experience: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                >
                  <option value="">Sélectionner...</option>
                  {['Débutant','1-2 ans','3-5 ans','5-10 ans','10+ ans'].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-3">
              <label className="text-xs font-medium text-[#6b7280] block mb-1">
                Compétences <span className="text-[#9ca3af]">(séparées par des virgules)</span>
              </label>
              <input
                value={form.competences}
                onChange={e => setForm({ ...form, competences: e.target.value })}
                placeholder="React, Node.js, DynamoDB..."
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
              />
            </div>

            {/* Liens professionnels */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">
                  LinkedIn (optionnel)
                </label>
                <input
                  type="url"
                  value={form.linkedin}
                  onChange={e => setForm({ ...form, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1">
                  Portfolio (optionnel)
                </label>
                <input
                  type="url"
                  value={form.portfolio}
                  onChange={e => setForm({ ...form, portfolio: e.target.value })}
                  placeholder="https://monportfolio.com"
                  className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
                />
              </div>
            </div>
          </div>

          {/* Lettre motivation */}
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
              Lettre de motivation *
            </h3>
            <textarea
              required
              rows={6}
              value={form.lettreMotivation}
              onChange={e => setForm({ ...form, lettreMotivation: e.target.value })}
              placeholder="Expliquez pourquoi vous êtes le candidat idéal pour ce poste..."
              maxLength={2000}
              className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none"
            />
            <p className="text-xs text-[#9ca3af] mt-1 text-right">
              {form.lettreMotivation.length} / 2000 caractères
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-3 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !cvFile}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Envoyer ma candidature
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card Offre ────────────────────────────────
function OffreCard({
  offre,
  onPostuler,
}: {
  offre: Offre;
  onPostuler: (o: Offre) => void;
}) {
  const daysSince = Math.floor(
    (Date.now() - new Date(offre.creeLe).getTime()) / 86400000
  );

  return (
    <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 hover:shadow-md transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-[#d8f3dc] rounded-xl flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-[#2d6a4f]" />
        </div>
        <div className="flex items-center gap-2">
          <StatutBadge statut={offre.statut} />
          <TypeBadge type={offre.type} />
        </div>
      </div>

      {/* Titre */}
      <h3 className="font-bold text-[#1a1a1a] text-lg mb-1 group-hover:text-[#2d6a4f] transition-colors">
        {offre.titre}
      </h3>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-[#6b7280] mb-4">
        <span className="flex items-center gap-1">
          <Briefcase className="w-3.5 h-3.5" />
          {offre.departement}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          {offre.modeTravail}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {daysSince === 0 ? "Aujourd'hui" : `Il y a ${daysSince}j`}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[#6b7280] line-clamp-3 mb-5 leading-relaxed">
        {offre.description || 'Rejoignez notre équipe dynamique pour ce poste passionnant.'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[#f0ebe0]">
        <span className="text-xs text-[#9ca3af]">
          Publié le {new Date(offre.creeLe).toLocaleDateString('fr-FR')}
        </span>
        <button
          onClick={() => onPostuler(offre)}
          disabled={offre.statut === 'fermee'}
          className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] disabled:bg-gray-200 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          {offre.statut === 'fermee' ? 'Fermée' : 'Postuler'}
          {offre.statut !== 'fermee' && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function JobsPage() {
  const [offres,          setOffres]          = useState<Offre[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [filterType,      setFilterType]      = useState('Tous');
  const [filterMode,      setFilterMode]      = useState('Tous');
  const [offreSelectionnee, setOffreSelectionnee] = useState<Offre | null>(null);

  const types = ['Tous', 'CDI', 'CDD', 'Stage', 'Freelance'];
  const modes = ['Tous', 'On-site', 'Hybrid', 'Remote'];

  const charger = async () => {
    try {
      setLoading(true);
      const res = await api.get('/offres');
      const data = res?.data?.offres ?? res?.data ?? [];
      setOffres(data.filter((o: Offre) => o.statut !== 'fermee'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const filtered = offres.filter(o => {
    const matchSearch = o.titre.toLowerCase().includes(search.toLowerCase()) ||
      o.departement.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'Tous' || o.type === filterType;
    const matchMode = filterMode === 'Tous' || o.modeTravail === filterMode;
    return matchSearch && matchType && matchMode;
  });

  return (
    <Layout searchPlaceholder="Rechercher une offre...">
      <div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1a1a1a]">
            Opportunités d'emploi
          </h1>
          <p className="text-sm text-[#6b7280] mt-1">
            {loading ? '...' : `${filtered.length} offre${filtered.length > 1 ? 's' : ''} disponible${filtered.length > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Rechercher un poste, département..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30"
            />
          </div>

          {/* Type */}
          <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1">
            {types.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterType === t
                    ? 'bg-[#2d6a4f] text-white'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Mode */}
          <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1">
            {modes.map(m => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterMode === m
                    ? 'bg-[#2d6a4f] text-white'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] px-4 py-2.5 rounded-xl text-sm hover:bg-[#f5f0e8]">
            <SlidersHorizontal className="w-4 h-4" />
            Filtres avancés
          </button>
        </div>

        {/* Grille offres */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5e0d8] p-6 animate-pulse">
                <div className="w-12 h-12 bg-gray-100 rounded-xl mb-4" />
                <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
                <div className="h-16 bg-gray-100 rounded mb-4" />
                <div className="h-9 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="font-semibold text-[#1a1a1a] mb-2">Aucune offre trouvée</h3>
            <p className="text-sm text-[#6b7280]">
              Essayez d'autres mots-clés ou filtres.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(offre => (
              <OffreCard
                key={offre.id}
                offre={offre}
                onPostuler={setOffreSelectionnee}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal Postuler */}
      {offreSelectionnee && (
        <ModalPostuler
          offre={offreSelectionnee}
          onClose={() => setOffreSelectionnee(null)}
          onSuccess={charger}
        />
      )}
    </Layout>
  );
}