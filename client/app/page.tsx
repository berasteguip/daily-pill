'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [pill, setPill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. GESTIÓN DE IDENTIDAD (Simple)
    // Buscamos si ya tenemos un ID guardado en el navegador
    let userId = localStorage.getItem('dailypill_user_id');
    
    // Si no existe (es la primera vez que entra), usamos uno de prueba
    // OJO: Para producción real, aquí deberías generar un UUID nuevo.
    // Por ahora, para que te funcione YA, usa el UUID que copiaste de Supabase.
    if (!userId) {
      userId = '1b01a16c-a87e-4b89-b954-4cc3c36f9640'; 
      localStorage.setItem('dailypill_user_id', userId);
    }

    // 2. LLAMADA A LA API
    const fetchPill = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
        const res = await fetch(`${apiUrl}/daily-pill?user_id=${userId}`);
        
        if (!res.ok) {
            if (res.status === 404) throw new Error("¡Ya has visto todas las píldoras disponibles!");
            throw new Error('Error al conectar con el servidor');
        }
        
        const data = await res.json();
        setPill(data);
      } catch (err) {
        // Le decimos: "Trata esto como un Error"
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchPill();
  }, []);

  // 3. RENDERIZADO (Lo que se ve)
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="animate-pulse text-xl font-bold text-blue-600">Generando tu dosis diaria... 💊</div>
    </div>
  );

  if (error) return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-800">{error}</h2>
        <p className="text-gray-500 mt-2">Vuelve mañana para más contenido.</p>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-100 py-10 px-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Cabecera con Categoría */}
        <div className={`py-3 px-6 text-white font-bold tracking-wide uppercase text-sm
          ${getCategoryColor(pill.topic)}`}>
          {pill.topic}
        </div>

        <div className="p-8">
          {/* Título */}
          <h1 className="text-3xl font-extrabold text-gray-900 leading-tight mb-2">
            {pill.title}
          </h1>
          
          {/* Subtítulo (Contexto original) */}
          <h2 className="text-md font-medium text-gray-500 mb-6 italic">
            {pill.content}
          </h2>

          {/* Separador */}
          <hr className="border-gray-200 mb-6" />

          {/* Contenido Generado por IA */}
          <div className="prose prose-blue text-gray-700 text-lg leading-relaxed">
            {pill.generated_text}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-400">DailyPill AI ©</span>
            <span className="text-xs font-mono text-blue-500 bg-blue-50 px-2 py-1 rounded">
                Píldoras restantes: {pill.remaining_pills}
            </span>
        </div>
      </div>
    </main>
  );
}

// Función auxiliar para colores según categoría
function getCategoryColor(topic) {
  const colors = {
    history: 'bg-amber-600',
    science_tech: 'bg-blue-600',
    art_culture: 'bg-purple-600',
    nature: 'bg-green-600',
    geography: 'bg-emerald-500',
    politics_econ: 'bg-slate-700',
    sayings: 'bg-orange-500'
  };
  return colors[topic] || 'bg-gray-800';
}