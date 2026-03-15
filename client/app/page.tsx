'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Pill {
  topic: string;
  title: string;
  content: string;
  generated_text: string;
  remaining_pills: number;
}

const CATEGORY_STYLES: Record<string, { label: string; emoji: string }> = {
  history:        { label: 'Historia',           emoji: '📜' },
  science_tech:   { label: 'Ciencia y Tecnología', emoji: '🔬' },
  art_culture:    { label: 'Arte y Cultura',     emoji: '🎨' },
  nature:         { label: 'Naturaleza',         emoji: '🌿' },
  geography:      { label: 'Geografía',          emoji: '🌍' },
  politics_econ:  { label: 'Política y Economía', emoji: '💰' },
  sayings:        { label: 'Refranes',           emoji: '💬' },
};

function getCategoryStyle(topic: string) {
  return CATEGORY_STYLES[topic] ?? { label: topic, emoji: '💡' };
}

export default function Home() {
  const [pill, setPill] = useState<Pill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const supabase = createClient();

  const fetchPill = async () => {
    setLoading(true);
    setError(null);
    setPill(null);
    try {
      const res = await fetch('/api/daily-pill');
      if (!res.ok) {
        if (res.status === 401) { router.push('/auth/login'); return; }
        const data = await res.json();
        throw new Error(data.error || 'Error al obtener la píldora');
      }
      const data = await res.json();
      setPill(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setUserEmail(user.email ?? null);
      fetchPill();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  // --- Loading state ---
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white font-sans text-gray-900">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-bounce">💊</div>
        <p className="text-gray-500 text-sm font-medium animate-pulse">Generando nueva píldora...</p>
      </div>
    </div>
  );

  // --- Error / Empty state ---
  if (error) return (
    <div className="flex h-screen items-center justify-center bg-white font-sans p-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">{error.includes('completado') ? '🎉' : '⚠️'}</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{error}</h2>
        {!error.includes('completado') && (
          <button
            onClick={fetchPill}
            className="mt-6 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md font-medium transition text-sm"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );

  if (!pill) return null;

  const style = getCategoryStyle(pill.topic);

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col text-gray-900">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto w-full border-b border-gray-100">
        <span className="font-bold text-lg tracking-tight flex items-center gap-2">
          <span>💊</span> DailyPill
        </span>
        <div className="flex items-center gap-4">
          {userEmail && (
            <span className="text-gray-500 text-sm hidden sm:block">{userEmail}</span>
          )}
          <button
            id="btn-logout"
            onClick={handleLogout}
            className="text-gray-400 hover:text-black text-sm font-medium transition"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl px-4 sm:px-8 py-10 bg-white border border-gray-200 rounded-2xl shadow-sm">
          
          {/* Metadata */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 font-medium uppercase tracking-wide">
             <span>{style.emoji}</span>
             <span>{style.label}</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-2">
            {pill.title}
          </h1>

          {/* Subtitle */}
          <h2 className="text-base text-gray-500 mb-8 font-medium">
            {pill.content}
          </h2>

          <div className="w-12 h-1 bg-gray-200 mb-8 rounded-full"></div>

          {/* Generated text */}
          <div className="prose prose-gray max-w-none text-gray-800 text-lg leading-relaxed text-justify">
            <p>{pill.generated_text}</p>
          </div>

          {/* Footer controls */}
          <div className="mt-12 pt-8 border-t border-gray-100 flex justify-center">
            <button
              id="btn-next-pill"
              onClick={fetchPill}
              className="px-8 py-3.5 bg-black hover:bg-gray-800 text-white text-base font-semibold rounded-lg transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black w-full sm:w-auto"
            >
              Siguiente píldora
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}