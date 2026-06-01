'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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
        console.warn('[auth/register] session check warning:', error);
      }
    };

    void syncSession();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Revisa tu email!</h2>
          <p className="text-gray-600 text-sm">
            Te hemos enviado un enlace de confirmación a <strong className="text-black">{email}</strong>.
            Haz clic en él para verificar tu cuenta.
          </p>
          <Link href="/auth/login" className="inline-block mt-8 text-black font-medium hover:underline">
            ← Volver al login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">💊</div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Crear cuenta</h1>
          <p className="text-gray-500 mt-2 text-sm">Únete para ver tu dosis diaria</p>
        </div>

        {/* Card */}
        <div className="bg-white">
          <form onSubmit={handleRegister} className="space-y-4">
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
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Confirmar contraseña
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
                {error}
              </div>
            )}

            <button
              id="btn-register"
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-md transition-colors mt-4 text-sm"
            >
              {loading ? 'Creando...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/auth/login" className="text-black font-medium hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
