import { useState, useEffect } from 'react';
import { Mail, Phone, Briefcase, Calendar, Pencil, X, Save, CheckCircle, Clock, FileText, XCircle } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Candidat } from '../../types';

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-[#2d6a4f] flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-md">
      {initials}
    </div>
  );
}

const statutConfig: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{className?: string}> }> = {
  SOUMIS:       { label: 'Soumise',        color: 'text-blue-600',   bg: 'bg-blue-50',       icon: FileText    },
  PRESELECTION: { label: 'Présélectionné', color: 'text-amber-600',  bg: 'bg-amber-50',      icon: CheckCircle },
  ENTRETIEN:    { label: 'Entretien',      color: 'text-purple-600', bg: 'bg-purple-50',     icon: Clock       },
  OFFRE:        { label: 'Offre reçue',    color: 'text-[#2d6a4f]',  bg: 'bg-[#d8f3dc]',    icon: CheckCircle },
  EMBAUCHE:     { label: 'Embauché 🎉',   color: 'text-[#2d6a4f]',  bg: 'bg-[#d8f3dc]',    icon: CheckCircle },
  REFUSE:       { label: 'Non retenu',     color: 'text-red-600',    bg: 'bg-red-50',        icon: XCircle     },
};

export default function CandidatProfilePage() {
  const { user }                      = useAuth();
  const [candidatures, setCandidatures] = useState<Candidat[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editMode, setEditMode]         = useState(false);
  const [saving]             = useState(false);
  const [message]           = useState('');
  const [form, setForm] = useState({
    telephone: '',
    posteVise: '',
    niveauEtude: '',
    experience: '',
    competences: '',
  });

  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        const res = await api.get('/mes-candidatures') as any;
        const data: Candidat[] = res?.data?.candidats ?? [];
        setCandidatures(data);
        if (data.length > 0) {
          const c = data[0];
          setForm({
            telephone:   c.telephone  || '',
            posteVise:   c.posteVise  || '',
            niveauEtude: c.niveauEtude || '',
            experience:  c.experience  || '',
            competences: (c.competences || []).join(', '),
          });
        }
      } catch (e) {
        console.error('Erreur chargement:', e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  const fullName = user ? `${user.prenom} ${user.nom}` : 'Candidat';

  const stats = {
    total:    candidatures.length,
    enCours:  candidatures.filter(c => !['EMBAUCHE','REFUSE'].includes(c.statut)).length,
    embauche: candidatures.filter(c => c.statut === 'EMBAUCHE').length,
    refuse:   candidatures.filter(c => c.statut === 'REFUSE').length,
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl animate-pulse space-y-5">
          <div className="h-8 bg-gray-100 rounded w-48 mb-7" />
          <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 h-40" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl">

        {message && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white text-sm px-4 py-3 rounded-xl shadow-lg">
            ✅ {message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Mon Profil</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">Gérez vos informations de candidature.</p>
          </div>
          <div className="flex gap-2">
            {editMode && (
              <button onClick={() => setEditMode(false)}
                className="flex items-center gap-2 border border-[#e5e0d8] text-[#374151] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors">
                <X className="w-4 h-4" />Annuler
              </button>
            )}
            <button
              onClick={() => setEditMode(!editMode)}
              disabled={saving}
              className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {editMode ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              {editMode ? 'Sauvegarder' : 'Modifier'}
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 mb-5">
          <div className="flex items-start gap-5">
            <Avatar name={fullName} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full font-medium">Candidat</span>
                {stats.embauche > 0 && (
                  <span className="bg-[#d8f3dc] text-[#2d6a4f] text-xs px-2.5 py-0.5 rounded-full font-medium">🎉 Embauché</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-[#1a1a1a] mt-1">{fullName}</h2>
              <p className="text-sm text-[#6b7280] mb-2">
                {form.posteVise ? `Cherche : ${form.posteVise}` : 'En recherche d\'emploi'}
              </p>
              <div className="flex items-center gap-4 text-xs text-[#6b7280]">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{user?.email}</span>
                {form.telephone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{form.telephone}</span>}
              </div>
            </div>

            {/* Stats candidatures */}
            <div className="bg-[#f5f0e8] rounded-xl p-4 text-center min-w-35 border border-[#e5e0d8]">
              <div className="text-2xl font-bold text-[#2d6a4f] mb-1">{stats.total}</div>
              <div className="text-xs font-semibold text-[#8b7355]">Candidature{stats.total > 1 ? 's' : ''}</div>
              <div className="text-xs text-[#9ca3af] mt-1">{stats.enCours} en cours</div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-5 mb-5">

          {/* Informations */}
          <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Briefcase className="w-4 h-4 text-[#2d6a4f]" />
              <h3 className="font-semibold text-[#1a1a1a]">Informations</h3>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Poste visé', key: 'posteVise', placeholder: 'Développeur Full Stack' },
                { label: 'Niveau d\'étude', key: 'niveauEtude', placeholder: 'Licence / Master / Ingénieur' },
                { label: 'Expérience', key: 'experience', placeholder: '2 ans en développement web' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">{label}</div>
                  {editMode ? (
                    <input
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm({...form, [key]: e.target.value})}
                      placeholder={placeholder}
                      className="w-full px-3 py-1.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-lg focus:outline-none focus:border-[#2d6a4f]"
                    />
                  ) : (
                    <div className="text-sm font-medium text-[#1a1a1a]">{form[key as keyof typeof form] || '—'}</div>
                  )}
                </div>
              ))}

              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Compétences</div>
                {editMode ? (
                  <input
                    value={form.competences}
                    onChange={e => setForm({...form, competences: e.target.value})}
                    placeholder="React, Node.js, AWS..."
                    className="w-full px-3 py-1.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-lg focus:outline-none focus:border-[#2d6a4f]"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {form.competences ? form.competences.split(',').map((c,i) => (
                      <span key={`competence-${i}`} className="text-xs bg-[#d8f3dc] text-[#2d6a4f] px-2.5 py-0.5 rounded-full font-medium">
                        {c.trim()}
                      </span>
                    )) : <span className="text-sm text-[#9ca3af]">—</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Mail className="w-4 h-4 text-[#2d6a4f]" />
              <h3 className="font-semibold text-[#1a1a1a]">Contact</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[#2d6a4f]" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Email</div>
                  <div className="text-sm text-[#2d6a4f]">{user?.email}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[#2d6a4f]" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Téléphone</div>
                  {editMode ? (
                    <input
                      value={form.telephone}
                      onChange={e => setForm({...form, telephone: e.target.value})}
                      placeholder="+216 XX XXX XXX"
                      className="w-full px-3 py-1.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-lg focus:outline-none focus:border-[#2d6a4f] mt-0.5"
                    />
                  ) : (
                    <div className="text-sm text-[#2d6a4f]">{form.telephone || '—'}</div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[#2d6a4f]" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Candidatures soumises</div>
                  <div className="text-sm text-[#2d6a4f]">{stats.total} candidature{stats.total > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Résumé candidatures */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Briefcase className="w-4 h-4 text-[#2d6a4f]" />
            <h3 className="font-semibold text-[#1a1a1a]">Mes candidatures récentes</h3>
          </div>
          {candidatures.length === 0 ? (
            <p className="text-sm text-[#9ca3af] text-center py-6">Aucune candidature soumise.</p>
          ) : (
            <div className="space-y-3">
              {candidatures.slice(0, 4).map(c => {
                const cfg = statutConfig[c.statut] ?? statutConfig['SOUMIS'];
                const Icon = cfg.icon;
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-[#f5f0e8] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#d8f3dc] rounded-xl flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-[#2d6a4f]" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#1a1a1a]">{c.posteVise}</div>
                        <div className="text-xs text-[#9ca3af]">
                          {new Date(c.soumisLe).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-center mt-6 text-xs text-[#9ca3af]">
          <span className="text-[#2d6a4f]">Terra HR</span> · Espace Candidat · Tunisie 2026
        </div>
      </div>
    </Layout>
  );
}