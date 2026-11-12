
import { useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-3">
          Accès non autorisé
        </h1>
        <p className="text-stone-500 mb-6">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-stone-200 rounded-xl text-sm font-medium hover:bg-stone-100 transition-colors"
          >
            Retour
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}