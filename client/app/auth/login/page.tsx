'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (isMounted && user) {
          router.replace('/');
        }
      } catch (error) {
        console.warn('[auth/login] session check warning:', error);
      }
    };

    void syncSession();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Correo o contraseña incorrectos. Inténtalo de nuevo.');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">💊</div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Bienvenido de nuevo</h1>
          <p className="text-gray-500 mt-2 text-sm">Tu dosis diaria de conocimiento</p>
        </div>

        {/* Card */}
        <div className="bg-white">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
                {error}
              </div>
            )}

            <button
              id="btn-login"
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-md transition-colors mt-4 text-sm"
            >
              {loading ? 'Entrando...' : 'Continuar'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            ¿No tienes cuenta?{' '}
            <Link href="/auth/register" className="text-black font-medium hover:underline">
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
