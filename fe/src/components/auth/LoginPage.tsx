import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Bot, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const { login, register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
      setError(msg);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg-primary)]">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[var(--color-accent)] opacity-5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-[var(--color-gemini)] opacity-5 blur-[120px]" />
      </div>

      <div className="glass-card relative z-10 w-full max-w-md p-8">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white shadow-lg shadow-[var(--color-accent)]/20">
            <Bot size={28} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Multi-Agent Workflow
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)] border border-[var(--color-error)]/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
                placeholder="Your name"
                required={!isLogin}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2.5 pr-10 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]"
                placeholder="••••••"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
