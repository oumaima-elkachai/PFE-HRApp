import { useState, useEffect } from 'react';
import {
  Search, Briefcase, MapPin, Clock, ArrowRight,
  CheckCircle, X, UploadCloud, Paperclip, Sparkles, Send
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
//import { offresService } from '@/services/offres';
import { candidaturesService } from '@/services/candidatures';
import type { JobOffer } from '@/types';

// Badges de filtres rapides
const DEPARTEMENTS = ['Tous', 'Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];

export default function CandidateCareersPage() {
  const [offres] = useState<JobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtres
  const [recherche, setRecherche] = useState('');
  const [deptSelectionne, setDeptSelectionne] = useState('Tous');

  // Modal candidature
  const [offreActive, setOffreActive] = useState<JobOffer | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [candidatureReussie, setCandidatureReussie] = useState(false);

  // Formulaire State
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', telephone: '', linkedin: '', lettre: ''
  });
  const [cvFile, setCvFile] = useState<File | null>(null);

  // 1. Charger les offres publiques
  useEffect(() => {
    async function chargerOffres() {
      try {
        setLoading(true);
        //const data = await offresService.publiques();
        // Fallback de sécurité si l'API renvoie vide pendant tes tests :
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    chargerOffres();
  }, []);

  // Filtrage dynamique
  const offresFiltrees = offres.filter(o => {
    const matchRecherche = o.titre.toLowerCase().includes(recherche.toLowerCase()) ||
                           o.description.toLowerCase().includes(recherche.toLowerCase());
    const matchDept = deptSelectionne === 'Tous' || o.departement === deptSelectionne;
    return matchRecherche && matchDept;
  });

  // Soumission du formulaire
  const handleSoumettreCandidature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offreActive) return;

    try {
      setEnvoiEnCours(true);
      await candidaturesService.creer({
        offreId: offreActive.id,
        prenom: form.prenom,
        nom: form.nom,
        email: form.email,
        telephone: form.telephone,
        linkedin: form.linkedin,
        lettreMotivation: form.lettre,
        cv: cvFile ? cvFile.name : 'cv_non_fourni.pdf', // Simulé pour l'instant
        statut: 'nouveau',
        etape: 'Applied'
      });

      setCandidatureReussie(true);
      setTimeout(() => {
        setCandidatureReussie(false);
        setOffreActive(null);
        setForm({ prenom: '', nom: '', email: '', telephone: '', linkedin: '', lettre: '' });
      }, 2500);

    } catch (error) {
      alert("Erreur lors de l'envoi de la candidature");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        
        {/* HERO SECTION CANDIDAT */}
        <div className="bg-[#f5f0e8] rounded-3xl p-8 mb-10 border border-[#e5e0d8] relative overflow-hidden">
          <div className="max-w-xl">
            <span className="text-xs font-bold uppercase tracking-widest text-[#2d6a4f] bg-[#d8f3dc] px-3 py-1 rounded-full">
              Portail Carrières
            </span>
            <h1 className="text-3xl font-serif font-bold text-[#1a1a1a] mt-3 mb-2">
              Écrivez votre prochaine page avec nous.
            </h1>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              Découvrez nos offres actives, trouvez l'équipe qui correspond à vos ambitions et postulez en moins de 2 minutes.
            </p>
          </div>
          <Sparkles className="absolute -right-6 -bottom-6 w-64 h-64 text-[#2d6a4f]/5 pointer-events-none" />
        </div>

        {/* BARRE DE RECHERCHE & FILTRES */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between items-center">
          
          {/* Input Recherche */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#9ca3af]" />
            <input 
              type="text" 
              placeholder="Rechercher un poste, une techno..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="w-full bg-white border border-[#e5e0d8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#2d6a4f] transition-colors"
            />
          </div>

          {/* Catégories Départements */}
          <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {DEPARTEMENTS.map(dept => (
              <button
                key={dept}
                onClick={() => setDeptSelectionne(dept)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                  deptSelectionne === dept 
                    ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' 
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#9ca3af]'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* GRILLE DES OFFRES */}
        {loading ? (
          <div className="text-center py-12 text-[#9ca3af] text-sm">Chargement des opportunités...</div>
        ) : offresFiltrees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-[#e5e0d8] p-12 text-center">
            <p className="text-[#1a1a1a] font-medium text-base mb-1">Aucun poste ne correspond à votre recherche</p>
            <p className="text-xs text-[#9ca3af]">Essayez de modifier vos filtres ou revenez plus tard.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {offresFiltrees.map((offre) => (
              <div 
                key={offre.id} 
                className="bg-white rounded-2xl border border-[#e5e0d8] p-6 hover:border-[#2d6a4f] transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold text-[#2d6a4f] bg-[#d8f3dc] px-2.5 py-1 rounded-lg">
                      {offre.departement}
                    </span>
                    {offre.statut === 'urgente' && (
                      <span className="text-[10px] font-bold text-[#92400e] bg-[#fef3c7] px-2 py-0.5 rounded">
                        URGENT
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-[#1a1a1a] group-hover:text-[#2d6a4f] transition-colors">
                    {offre.titre}
                  </h3>

                  <div className="flex gap-4 my-3 text-xs text-[#6b7280]">
                    <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5 text-[#9ca3af]"/> {offre.type}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#9ca3af]"/> {offre.modetravail}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#9ca3af]"/> {offre.datePublication}</span>
                  </div>

                  <p className="text-xs text-[#6b7280] line-clamp-2 mb-4 leading-relaxed">
                    {offre.description}
                  </p>

                  <div className="flex flex-wrap gap-1 mb-6">
                    {offre.competences.map(c => (
                      <span key={c} className="text-[11px] bg-[#fafaf8] border border-[#f0ebe0] text-[#374151] px-2 py-0.5 rounded-md">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setOffreActive(offre)}
                  className="w-full mt-2 bg-[#fafaf8] hover:bg-[#2d6a4f] text-[#1a1a1a] hover:text-white border border-[#e5e0d8] hover:border-[#2d6a4f] py-2.5 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all"
                >
                  Postuler à cette offre <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DE POSTULATION */}
        {offreActive && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#e5e0d8]">
              
              {/* Header Modal */}
              <div className="p-6 bg-[#f5f0e8] border-b border-[#e5e0d8] flex justify-between items-start sticky top-0 z-10">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#2d6a4f] tracking-wider">Candidature directe</span>
                  <h2 className="text-lg font-serif font-bold text-[#1a1a1a] mt-0.5">{offreActive.titre}</h2>
                  <p className="text-xs text-[#6b7280]">{offreActive.departement} • {offreActive.type}</p>
                </div>
                <button onClick={() => setOffreActive(null)} className="p-1.5 bg-white rounded-full hover:bg-gray-100 text-[#6b7280]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Corps Formulaire */}
              {candidatureReussie ? (
                <div className="p-12 text-center space-y-3">
                  <CheckCircle className="w-16 h-16 text-[#2d6a4f] mx-auto animate-bounce" />
                  <h3 className="text-xl font-bold text-[#1a1a1a]">Candidature transmise !</h3>
                  <p className="text-xs text-[#6b7280]">Notre équipe RH a bien reçu votre dossier.<br/>Nous vous recontacterons sous 5 jours ouvrés.</p>
                </div>
              ) : (
                <form onSubmit={handleSoumettreCandidature} className="p-6 space-y-4">
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">Prénom *</label>
                      <input required type="text" placeholder="Jean"
                        value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})}
                        className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2d6a4f]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">Nom *</label>
                      <input required type="text" placeholder="Dupont"
                        value={form.nom} onChange={e => setForm({...form, nom: e.target.value})}
                        className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2d6a4f]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">Email *</label>
                      <input required type="email" placeholder="jean.d@email.com"
                        value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                        className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2d6a4f]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">Téléphone *</label>
                      <input required type="tel" placeholder="+33 6 00 00 00 00"
                        value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})}
                        className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2d6a4f]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">Lien LinkedIn ou Portfolio</label>
                    <input type="url" placeholder="https://linkedin.com/in/..."
                      value={form.linkedin} onChange={e => setForm({...form, linkedin: e.target.value})}
                      className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#2d6a4f]" />
                  </div>

                  {/* Upload CV stylisé */}
                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">CV (PDF) *</label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-[#e5e0d8] hover:border-[#2d6a4f] rounded-2xl cursor-pointer bg-[#fafaf8] hover:bg-[#f5f0e8]/50 transition-colors">
                      <div className="flex items-center gap-2 text-[#6b7280]">
                        {cvFile ? <Paperclip className="w-5 h-5 text-[#2d6a4f]"/> : <UploadCloud className="w-5 h-5 text-[#9ca3af]"/>}
                        <span className="text-xs font-medium">
                          {cvFile ? cvFile.name : "Cliquez pour joindre votre CV"}
                        </span>
                      </div>
                      <input required={!cvFile} type="file" accept=".pdf,.doc,.docx" className="hidden" 
                        onChange={e => setCvFile(e.target.files ? e.target.files[0] : null)} />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#374151] mb-1">Motivation (Optionnel)</label>
                    <textarea rows={3} placeholder="Pourquoi rejoindre notre entreprise ?"
                      value={form.lettre} onChange={e => setForm({...form, lettre: e.target.value})}
                      className="w-full bg-[#fafaf8] border border-[#e5e0d8] rounded-xl p-3 text-xs focus:outline-none focus:border-[#2d6a4f] resize-none" />
                  </div>

                  <button 
                    disabled={envoiEnCours}
                    type="submit" 
                    className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                  >
                    {envoiEnCours ? 'Transmission en cours...' : (
                      <>Transmettre ma candidature <Send className="w-3.5 h-3.5" /></>
                    )}
                  </button>

                </form>
              )}

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}