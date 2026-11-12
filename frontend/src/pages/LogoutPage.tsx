// src/pages/LogoutPage.tsx
//
// ── Une phrase de ta version était fausse ──────────────────────────
//
// L'écran affichait « Browser cache cleared ». Une page web ne peut
// pas vider le cache du navigateur : il n'existe aucune API pour ça.
// La déconnexion efface le jeton stocké (localStorage / sessionStorage)
// et ferme la session côté Cognito — ce qui est déjà la bonne chose à
// faire, mais ce n'est pas le cache.
//
// Si un juré demande « et concrètement, qu'est-ce qui est effacé ? »,
// la réponse est la liste ci-dessous, et elle est maintenant exacte.
// Une interface qui annonce plus qu'elle ne fait est un défaut, même
// quand l'exagération va dans le sens de la sécurité.
//
// Le reste : anglais → fr/en/ar, « HR UP » → HR UP, couleurs en dur
// → palette, et la coquille AuthLayout partagée avec la connexion.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import AuthLayout from '@/components/layout/AuthLayout';

export default function LogoutPage() {
  const navigate = useNavigate();
  const { deconnexion } = useAuth();
  const { t } = useI18n();
  const [fait, setFait] = useState(false);

  useEffect(() => {
    let vivant = true;

    (async () => {
      try {
        await deconnexion();
      } catch {
        // Une déconnexion qui échoue côté serveur ne doit pas retenir
        // l'utilisateur sur la page : le jeton local est parti, donc
        // de son point de vue il est sorti. On continue.
      }
      if (vivant) setFait(true);
    })();

    return () => { vivant = false; };
    // Volontairement une seule exécution : `deconnexion` n'est pas
    // forcément stable d'un rendu à l'autre dans ton AuthContext, et
    // la mettre en dépendance relancerait la déconnexion en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const EFFACE = [t('deco.eff1'), t('deco.eff2'), t('deco.eff3')];

  return (
    <AuthLayout titre={t('deco.titre')}>
      <div className="text-center py-4">

        <div className={`w-16 h-16 rounded-2xl mx-auto mb-5
          flex items-center justify-center transition-colors
          ${fait ? 'bg-green-50 border border-green-200' : 'bg-stone-100'}`}>
          {fait
            ? <Check size={28} className="text-green-600" strokeWidth={2.5} />
            : <Loader2 size={26} className="text-stone-400 animate-spin" />}
        </div>

        <h3 className="text-lg font-bold text-stone-800 mb-1.5">
          {fait ? t('deco.fait') : t('deco.enCours')}
        </h3>

        {fait && (
          <>
            <p className="text-sm text-stone-500 leading-relaxed mb-6 max-w-sm mx-auto">
              {t('deco.faitTexte')}
            </p>

            <ul className="inline-flex flex-col gap-2 mb-7 text-start">
              {EFFACE.map((ligne) => (
                <li key={ligne} className="flex items-center gap-2 text-xs text-stone-500">
                  <Check size={13} className="text-green-600 shrink-0" />
                  {ligne}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2.5 max-w-xs mx-auto">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-xl text-white text-sm font-bold
                  flex items-center justify-center gap-2
                  bg-linear-to-r from-brand-500 to-violet-500
                  hover:brightness-110 transition-all
                  shadow-lg shadow-brand-500/20"
              >
                <LogOut size={15} className="rtl:rotate-180" />
                {t('deco.revenir')}
              </button>

              <Link
                to="/"
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-center
                  text-stone-600 bg-stone-50 hover:bg-stone-100
                  border border-stone-200 transition-colors"
              >
                {t('deco.accueil')}
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}