import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail]           = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur]         = useState('');
  const [loading, setLoading]       = useState(false);
  const { connexion }               = useAuth();
  const navigate                    = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setLoading(true);

    try {
      const user = await connexion(email, motDePasse);
      console.log('✅ Connecté:', user);

      if (user.role === 'RH') {
        navigate('/admin');
      } else if (user.role === 'EMPLOYE') {
        navigate('/employe');
      } else {
        navigate('/candidat/offres');
      }
    } catch (err: any) {
      console.error('❌ Erreur login:', err);
      setErreur(err.message || 'Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="w-full max-w-205 bg-white rounded-2xl overflow-hidden shadow-sm border border-[#E0D9CC] flex">

        {/* Gauche verte */}
        <div className="w-[45%] bg-[#2D5C1A] p-10 flex flex-col justify-between">
          <div>
            <div className="text-white font-serif text-lg font-semibold mb-10">
              Terra HR
            </div>
            <h2 className="text-white font-serif text-3xl font-semibold leading-tight mb-4">
              Plant the seeds for a better workplace.
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Join thousands of organizations using Terra to nurture talent,
              streamline recruitment, and grow sustainable team cultures.
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                ER
              </div>
              <div>
                <div className="text-white text-xs font-medium">Elena Rodriguez</div>
                <div className="text-white/60 text-xs">People Lead at Bloom</div>
              </div>
            </div>
            <p className="text-white/80 text-xs italic leading-relaxed">
              "Terra HR feels like a natural extension of our team."
            </p>
          </div>
        </div>

        {/* Droite formulaire */}
        <div className="flex-1 p-10 flex flex-col justify-center">
          <h3 className="font-serif text-2xl font-semibold text-gray-900 mb-1">
            Connexion
          </h3>
          <p className="text-sm text-[#6B6B6B] mb-6">
            Connectez-vous à votre espace Terra HR.
          </p>

          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
              <span>❌</span> {erreur}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@entreprise.tn"
                required
                className="w-full px-4 py-2.5 text-sm bg-[#F5F0E8] border border-[#E0D9CC] rounded-xl focus:outline-none focus:border-[#2D5C1A] transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 text-sm bg-[#F5F0E8] border border-[#E0D9CC] rounded-xl focus:outline-none focus:border-[#2D5C1A] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2D5C1A] hover:bg-[#1e4212] disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition-colors mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Vérification...
                </span>
              ) : (
                'Se connecter →'
              )}
            </button>
          </form>

          {/* Comptes test */}
          <div className="mt-6 p-4 bg-[#F5F0E8] rounded-xl border border-[#E0D9CC]">
            <p className="text-xs font-medium text-[#6B6B6B] mb-3">
              🧪 Comptes de test (cliquez pour remplir) :
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setEmail('rh@entreprise.tn'); setMotDePasse('admin123'); }}
                className="text-left text-xs bg-white border border-[#E0D9CC] rounded-lg px-3 py-2.5 hover:border-[#2D5C1A] transition-colors"
              >
                <span className="font-medium text-[#2D5C1A]">👑 RH Admin</span>
                <span className="text-[#6B6B6B] ml-2">rh@entreprise.tn / admin123</span>
              </button>
              <button
                type="button"
                onClick={() => { setEmail('karim@entreprise.tn'); setMotDePasse('karim123'); }}
                className="text-left text-xs bg-white border border-[#E0D9CC] rounded-lg px-3 py-2.5 hover:border-[#2D5C1A] transition-colors"
              >
                <span className="font-medium text-[#2D5C1A]">👤 Employé</span>
                <span className="text-[#6B6B6B] ml-2">karim@entreprise.tn / karim123</span>
              </button>

              <button
  type="button"
  onClick={() => { setEmail('test@test.tn'); setMotDePasse('test123'); }}
  className="text-left text-xs bg-white border border-[#E0D9CC] rounded-lg px-3 py-2.5 hover:border-[#2D5C1A] transition-colors"
>
  <span className="font-medium text-[#2D5C1A]">🤵 Candidat</span>
  <span className="text-[#6B6B6B] ml-2">test@test.tn / test123</span>
</button>
            </div>
                         
          </div>
          <p className="text-center text-sm text-[#6b7280] mt-4">

            Pas encore de compte ?{' '}
          <Link to="/register" className="text-[#2d6a4f] font-semibold hover:underline">
              Créer un compte candidat
          </Link>
          </p>
        </div>
      </div>
    </div>
  );
}