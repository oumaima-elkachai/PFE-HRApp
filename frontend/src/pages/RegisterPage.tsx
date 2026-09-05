import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, Leaf } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agree: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm overflow-hidden flex" style={{ minHeight: 560 }}>
        {/* Left panel */}
        <div className="w-5/12 bg-[#2d6a4f] p-10 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-[#b7e4c7]" />
            <span className="text-white font-bold text-lg">Terra HR</span>
          </div>

          <div>
            <h1 className="text-white font-bold text-3xl leading-tight mb-4">
              Plant the seeds for a better workplace.
            </h1>
            <p className="text-[#b7e4c7] text-sm leading-relaxed mb-8">
              Join thousands of organizations using Terra to nurture talent, streamline recruitment, and grow sustainable team cultures.
            </p>

            {/* Testimonial */}
            <div className="bg-[#1b4332] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#52b788] flex items-center justify-center text-white text-xs font-bold">
                  ER
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">Elena Rodriguez</div>
                  <div className="text-[#74c69d] text-[10px] uppercase tracking-wider">People Lead at Bloom</div>
                </div>
              </div>
              <p className="text-[#b7e4c7] text-xs leading-relaxed italic">
                "Terra HR feels like a natural extension of our team. It's grounded, intuitive, and truly human-centric."
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-7/12 p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-1">Create your account</h2>
            <p className="text-sm text-[#6b7280]">Welcome! Let's get your workspace rooted.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-lg text-sm bg-[#fafaf8] focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-lg text-sm bg-[#fafaf8] focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
                />
              </div>
            </div>

            {/* Password row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-lg text-sm bg-[#fafaf8] focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={form.confirmPassword}
                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 border border-[#e5e0d8] rounded-lg text-sm bg-[#fafaf8] focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="agree"
                checked={form.agree}
                onChange={e => setForm({ ...form, agree: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-[#e5e0d8] accent-[#2d6a4f]"
              />
              <label htmlFor="agree" className="text-sm text-[#6b7280]">
                I agree to the{' '}
                <a href="#" className="text-[#2d6a4f] font-medium hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[#2d6a4f] font-medium hover:underline">Privacy Policy</a>.
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors duration-150"
            >
              Get Started →
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#e5e0d8]" />
              <span className="text-xs text-[#9ca3af] font-medium">Or sign up with</span>
              <div className="flex-1 h-px bg-[#e5e0d8]" />
            </div>

            {/* OAuth */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex items-center justify-center gap-2 border border-[#e5e0d8] rounded-lg py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f5f0e8] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 border border-[#e5e0d8] rounded-lg py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f5f0e8] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="2" fill="#1877F2" />
                  <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">S</text>
                </svg>
                SSO
              </button>
            </div>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-[#2d6a4f] font-semibold hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
