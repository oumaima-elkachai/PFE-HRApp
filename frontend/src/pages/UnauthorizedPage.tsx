
import { useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-3">
          Accès non autorisé
        </h1>
        <p className="text-[#6b7280] mb-6">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-[#e5e0d8] rounded-xl text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
          >
            Retour
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}