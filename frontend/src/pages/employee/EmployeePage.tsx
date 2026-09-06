// src/pages/employee/EmplDash.tsx
import { useState, useEffect } from 'react';
import { Clock, FileText, Calendar, Download, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // ✅ Ajouter
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { pointagesService } from '../../services/pointages';
import { facturesService } from '../../services/factures';
import { calendrierService } from '../../services/calendrier';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate(); // ✅ Ajouter
  const [pointageActif, setPointageActif] = useState(false);
  const [heureArrivee, setHeureArrivee] = useState<string | null>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ptLoading, setPtLoading] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const charger = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [facRes, evRes, ptRes] = await Promise.all([
          facturesService.lister() as any,
          calendrierService.lister() as any,
          pointagesService.historique({ date: today }) as any,
        ]);
        
        // ✅ Filtrer les factures pour l'employé connecté
        const allFactures = facRes?.data?.factures ?? [];
        const mesFactures = allFactures.filter((f: any) => f.employeId === user?.sub);
        
        setFactures(mesFactures.slice(0, 5));
        setEvenements((evRes?.data?.evenements ?? []).slice(0, 3));
        
        const enCours = (ptRes?.data?.pointages ?? []).find((p: any) => p.statut === 'EN_COURS');
        if (enCours) {
          setPointageActif(true);
          setHeureArrivee(new Date(enCours.heureArrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, [user?.sub]); 

  const handlePointage = async () => {
    setPtLoading(true);
    try {
      if (!pointageActif) {
        await pointagesService.arrivee();
        setPointageActif(true);
        setHeureArrivee(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        setFlash('✅ Arrivée enregistrée !');
      } else {
        await pointagesService.depart();
        setPointageActif(false);
        setHeureArrivee(null);
        setFlash('✅ Départ enregistré !');
      }
      setTimeout(() => setFlash(''), 4000);
    } catch (e: any) {
      setFlash('❌ ' + (e?.erreur || 'Erreur pointage'));
      setTimeout(() => setFlash(''), 4000);
    } finally {
      setPtLoading(false);
    }
  };

  const greeting = new Date().getHours() < 12 ? 'Bonjour' : new Date().getHours() < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <Layout>
      <div className="max-w-5xl">
        {flash && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white px-4 py-3 rounded-xl shadow-lg text-sm">
            {flash}
          </div>
        )}

        {/* Header + pointage */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-1">{greeting}, {user?.prenom} 👋</h1>
            <p className="text-[#6b7280] text-sm">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Carte pointage */}
          <div className="bg-white border border-[#e5e0d8] rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div>
              <div className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Statut</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${pointageActif ? 'bg-[#2d6a4f] animate-pulse' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-[#1a1a1a]">
                  {pointageActif ? `En service · ${heureArrivee}` : 'Hors service'}
                </span>
              </div>
            </div>
            <button
              onClick={handlePointage}
              disabled={ptLoading}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                pointageActif ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[#2d6a4f] hover:bg-[#1b4332] text-white'
              }`}
            >
              {ptLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              {pointageActif ? 'Pointer départ' : 'Pointer arrivée'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { icon: '📄', label: 'Fiches de paie', value: loading ? '...' : factures.length, color: 'bg-[#d8f3dc]' },
            { icon: '📅', label: 'Événements ce mois', value: loading ? '...' : evenements.length, color: 'bg-blue-50' },
            { icon: '🏢', label: 'Mon département', value: user?.departement || '—', color: 'bg-amber-50', text: true },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
              <div className={`w-11 h-11 ${s.color} rounded-xl flex items-center justify-center text-xl mb-3`}>
                {s.icon}
              </div>
              <div className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wide mb-1">{s.label}</div>
              <div className={`font-bold ${s.text ? 'text-base text-[#1a1a1a]' : 'text-3xl text-[#1a1a1a]'}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Fiches de paie */}
          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1a1a1a] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#2d6a4f]" />
                Mes fiches de paie
              </h2>
              {/* ✅ Bouton "Voir tout" */}
              <button
                onClick={() => navigate('/employe/payslips')}
                className="flex items-center gap-1 text-xs font-medium text-[#2d6a4f] hover:underline"
              >
                Voir tout
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : factures.length === 0 ? (
              <div className="text-center py-8 text-sm text-[#9ca3af]">
                Aucune fiche de paie disponible
              </div>
            ) : (
              <div className="space-y-3">
                {factures.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-[#f5f0e8] rounded-xl">
                    <div>
                      <div className="text-sm font-semibold text-[#1a1a1a]">{f.moisLabel}</div>
                      <div className="text-xs text-[#9ca3af] font-mono">{f.numero}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#2d6a4f] text-sm">
                        {f.salaireNet?.toFixed(0)} TND
                      </span>
                      {f.pdfBase64 && (
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = `data:application/pdf;base64,${f.pdfBase64}`;
                            link.download = `${f.numero}.pdf`;
                            link.click();
                          }}
                          className="p-1.5 bg-white border border-[#e5e0d8] rounded-lg hover:bg-[#d8f3dc] transition-colors"
                          title="Télécharger PDF"
                        >
                          <Download className="w-3.5 h-3.5 text-[#2d6a4f]" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Événements (inchangé) */}
          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
            <h2 className="font-bold text-[#1a1a1a] flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#2d6a4f]" />
              Prochains événements
            </h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : evenements.length === 0 ? (
              <div className="text-center py-8 text-sm text-[#9ca3af]">
                Aucun événement à venir
              </div>
            ) : (
              <div className="space-y-3">
                {evenements.map((ev: any) => (
                  <div key={ev.id} className="flex items-start gap-3 p-3 bg-[#f5f0e8] rounded-xl">
                    <div className="w-1 h-full min-h-8 bg-[#2d6a4f] rounded-full shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-[#1a1a1a]">{ev.titre}</div>
                      <div className="text-xs text-[#9ca3af]">
                        {new Date(ev.dateDebut).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}