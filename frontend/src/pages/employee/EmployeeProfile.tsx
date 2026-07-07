import { useState, useEffect } from 'react';
import { MapPin, Calendar, Mail, Phone, Pencil, Users, Leaf, X, Save } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Employe } from '../../types';

// ── Toggle simple ─────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-10 h-6 rounded-full transition-colors relative ${checked ? 'bg-[#2d6a4f]' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

// ── Avatar initiales ──────────────────────────
function Avatar({ name, size = 'lg' }: { name: string; size?: 'lg' | 'md' }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const sz = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-12 h-12 text-lg';
  return (
    <div className={`${sz} rounded-full bg-[#2d6a4f] flex items-center justify-center text-white font-bold border-4 border-white shadow-md`}>
      {initials}
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { user }                    = useAuth();
  const [employe, setEmploye]       = useState<Employe | null>(null);
  const [loading, setLoading]       = useState(true);
  const [editMode, setEditMode]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [message, setMessage]       = useState('');
  const [notifs, setNotifs]         = useState({ email: true, desktop: false, calendar: true });

  // Formulaire d'édition
  const [form, setForm] = useState({
    telephone: '',
    poste: '',
    departement: '',
  });

  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        const res = await api.get('/auth/profil') as any;
        const u = res?.data?.user ?? res?.user ?? res?.data ?? null;
        if (u) {
          setEmploye(u);
          setForm({
            telephone:   u.telephone  || '',
            poste:       u.poste      || '',
            departement: u.departement || '',
          });
        }
      } catch (e) {
        console.error('Erreur chargement profil:', e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  const handleSave = async () => {
  setSaving(true);
  try {
    // ✅ Route dédiée sans restriction RH
    await api.put('/auth/profil', form);
    setEmploye(prev => prev ? { ...prev, ...form } : prev);
    setEditMode(false);
    setMessage('Profil mis à jour !');
    setTimeout(() => setMessage(''), 3000);
  } catch (e: any) {
    console.error('Erreur sauvegarde:', e);
    setMessage('Erreur : ' + (e?.erreur || 'Impossible de sauvegarder'));
    setTimeout(() => setMessage(''), 3000);
  } finally {
    setSaving(false);
  }
};

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl animate-pulse space-y-5">
          <div className="h-8 bg-gray-100 rounded w-48 mb-7" />
          <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 h-40" />
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 h-60" />
            <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 h-60" />
          </div>
        </div>
      </Layout>
    );
  }

  const fullName = employe ? `${employe.prenom} ${employe.nom}` : user ? `${user.prenom} ${user.nom}` : 'Employé';
  const joinDate = employe?.creeLe ? new Date(employe.creeLe).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

  return (
    <Layout>
      <div className="max-w-5xl">

        {/* Message flash */}
        {message && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white text-sm px-4 py-3 rounded-xl shadow-lg">
            ✅ {message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Mon Profil</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">Gérez vos informations professionnelles.</p>
          </div>
          <div className="flex gap-2">
            {editMode && (
              <button onClick={() => setEditMode(false)}
                className="flex items-center gap-2 border border-[#e5e0d8] text-[#374151] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors">
                <X className="w-4 h-4" />
                Annuler
              </button>
            )}
            <button
              onClick={editMode ? handleSave : () => setEditMode(true)}
              disabled={saving}
              className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {editMode ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              {saving ? 'Sauvegarde...' : editMode ? 'Sauvegarder' : 'Modifier'}
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6 mb-5">
          <div className="flex items-start gap-5">
            <Avatar name={fullName} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-[#d8f3dc] text-[#2d6a4f] text-xs px-2.5 py-0.5 rounded-full font-medium">Actif</span>
                <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  {user?.role === 'EMPLOYE' ? 'Employé' : user?.role}
                </span>
              </div>
              <h2 className="text-xl font-bold text-[#1a1a1a] mt-1">{fullName}</h2>

              {editMode ? (
                <input
                  value={form.poste}
                  onChange={e => setForm({...form, poste: e.target.value})}
                  placeholder="Poste"
                  className="text-sm text-[#6b7280] border border-[#e5e0d8] rounded-lg px-3 py-1.5 mt-1 focus:outline-none focus:border-[#2d6a4f] bg-[#f5f0e8]"
                />
              ) : (
                <p className="text-sm text-[#6b7280] mb-2">{employe?.poste || '—'}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-[#6b7280] mt-2">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {employe?.email || user?.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Rejoint en {joinDate}
                </span>
              </div>
            </div>

            {/* Département */}
            <div className="bg-[#f5f0e8] rounded-xl p-4 text-center min-w-35 border border-[#e5e0d8]">
              <div className="w-10 h-10 rounded-full bg-[#d8f3dc] flex items-center justify-center mx-auto mb-2">
                <Leaf className="w-5 h-5 text-[#2d6a4f]" />
              </div>
              {editMode ? (
                <select
                  value={form.departement}
                  onChange={e => setForm({...form, departement: e.target.value})}
                  className="text-xs font-semibold text-[#2d6a4f] bg-transparent border-0 text-center focus:outline-none w-full"
                >
                  {['Informatique','RH','Finance','Marketing','R&D'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-semibold text-[#2d6a4f]">{employe?.departement || '—'}</div>
              )}
              <div className="text-xs text-[#8b7355] mt-0.5">Département</div>
            </div>
          </div>
        </div>

        {/* Grid 2 colonnes */}
        <div className="grid grid-cols-2 gap-5 mb-5">

          {/* Informations personnelles */}
          <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-4 h-4 text-[#2d6a4f]" />
              <h3 className="font-semibold text-[#1a1a1a]">Informations</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Nom complet</div>
                <div className="text-sm font-medium text-[#1a1a1a]">{fullName}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Rôle</div>
                <div className="text-sm font-medium text-[#1a1a1a]">{user?.role}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Poste</div>
                {editMode ? (
                  <input
                    value={form.poste}
                    onChange={e => setForm({...form, poste: e.target.value})}
                    className="w-full px-3 py-1.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-lg focus:outline-none focus:border-[#2d6a4f]"
                  />
                ) : (
                  <div className="text-sm font-medium text-[#1a1a1a]">{employe?.poste || '—'}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Département</div>
                {editMode ? (
                  <select
                    value={form.departement}
                    onChange={e => setForm({...form, departement: e.target.value})}
                    className="w-full px-3 py-1.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-lg focus:outline-none focus:border-[#2d6a4f]"
                  >
                    {['Informatique','RH','Finance','Marketing','R&D'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm font-medium text-[#1a1a1a]">{employe?.departement || '—'}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Statut</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#2d6a4f]" />
                  <span className="text-sm font-medium text-[#2d6a4f]">Actif</span>
                </div>
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
                  <div className="text-sm text-[#2d6a4f]">{employe?.email || user?.email}</div>
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
                    <div className="text-sm text-[#2d6a4f]">{employe?.telephone || '—'}</div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[#2d6a4f]" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Date d'embauche</div>
                  <div className="text-sm text-[#2d6a4f]">{joinDate}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f0e8] flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-[#2d6a4f]" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Entreprise</div>
                  <div className="text-sm text-[#2d6a4f]">Terra HR — Tunisie</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Préférences notifications */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
          <div className="flex items-center gap-2 mb-5">
            <span>⚙️</span>
            <h3 className="font-semibold text-[#1a1a1a]">Préférences</h3>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Notifications</div>
              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Notifications Email', desc: 'Résumés hebdomadaires et messages' },
                  { key: 'desktop', label: 'Alertes Bureau', desc: 'Alertes temps réel' },
                  { key: 'calendar', label: 'Invitations Calendrier', desc: 'Ajout automatique au calendrier' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#1a1a1a]">{label}</div>
                      <div className="text-xs text-[#9ca3af]">{desc}</div>
                    </div>
                    <Toggle
                      checked={notifs[key as keyof typeof notifs]}
                      onChange={() => setNotifs(prev => ({...prev, [key]: !prev[key as keyof typeof notifs]}))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Sécurité</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border border-[#e5e0d8] bg-[#fafaf8]">
                  <div>
                    <div className="text-sm font-medium text-[#1a1a1a]">Mot de passe</div>
                    <div className="text-xs text-[#9ca3af]">Modifié à la création du compte</div>
                  </div>
                  <button className="text-xs font-semibold text-[#2d6a4f] border border-[#2d6a4f] px-3 py-1.5 rounded-lg hover:bg-[#d8f3dc] transition-colors">
                    Changer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-[#9ca3af]">
          <span className="text-[#2d6a4f]">Terra HR</span> · Plateforme RH Serverless · Tunisie 2026
        </div>
      </div>
    </Layout>
  );
}