import { useNavigate } from 'react-router-dom';
import { CheckCircle, Leaf, HelpCircle, Shield } from 'lucide-react';

export default function LogoutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <Leaf className="w-5 h-5 text-[#2d6a4f]" />
        <span className="font-playfair text-xl font-bold text-[#2d6a4f]">Terra HR</span>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm px-10 py-10 max-w-md w-full text-center">
        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="w-16 h-16 rounded-full bg-[#d8f3dc] flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-[#2d6a4f]" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#f5f0e8] border-2 border-white flex items-center justify-center">
            <Leaf className="w-3 h-3 text-[#52b788]" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-3 leading-snug">
          You have been successfully logged out.
        </h1>
        <p className="text-sm text-[#6b7280] leading-relaxed mb-7">
          Your session has been securely ended.{' '}
          <span className="text-[#2d6a4f] font-medium">Thank you for using Terra HR</span>{' '}
          to grow your team today. See you soon!
        </p>

        <button
          onClick={() => navigate('/login')}
          className="inline-flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors duration-150"
        >
          Return to Login →
        </button>
      </div>

      {/* Footer info */}
      <div className="flex items-center gap-8 mt-8">
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <HelpCircle className="w-4 h-4" />
          <div>
            <div className="font-medium text-[#374151]">Need help?</div>
            <div>Visit our Help Center</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <Shield className="w-4 h-4" />
          <div>
            <div className="font-medium text-[#374151]">Secure Session</div>
            <div>Browser cache cleared</div>
          </div>
        </div>
      </div>
    </div>
  );
}
