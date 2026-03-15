import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GENAI_API_KEY!);

function buildPrompt(topic: string, title: string, subtitle: string): string {
  return `# ROL
Actúa como un experto divulgador cultural.

# TAREA
Redacta una "Píldora de Conocimiento Diaria" basada en:
1. TEMA: ${topic}
2. TÍTULO: ${title}
3. SUBTÍTULO: ${subtitle}

# INSTRUCCIONES
- Gancho impactante.
- Explicación ELI5 (sencilla).
- Cierre reflexivo.
- Máximo 75 palabras. Sin saludos.
- IMPORTANTE: Escribe SOLO EN TEXTO PLANO. Prohibido usar Markdown, prohibido usar asteriscos (*), prohibido usar cursivas, negritas o subrayados.

# OUTPUT
Solo el texto de la píldora.`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Verificar sesión del usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Historial de píldoras ya vistas por este usuario
    const { data: seenData } = await supabase
      .from('user_progress')
      .select('pill_id')
      .eq('user_id', user.id);

    const seenIds = seenData?.map((r) => r.pill_id) ?? [];

    // 3. Consultar píldoras disponibles (excluyendo vistas)
    let query = supabase.from('pills').select('*');
    if (seenIds.length > 0) {
      query = query.not('id', 'in', `(${seenIds.join(',')})`);
    }
    const { data: availablePills } = await query.limit(10);

    if (!availablePills || availablePills.length === 0) {
      return NextResponse.json(
        { error: '¡Increíble! Has completado todas las píldoras disponibles por ahora.' },
        { status: 404 }
      );
    }

    // 4. Elegir una al azar
    const selected = availablePills[Math.floor(Math.random() * availablePills.length)];

    // 5. Registrar como vista
    await supabase.from('user_progress').insert({
      user_id: user.id,
      pill_id: selected.id,
    });

    // 6. Generar texto con Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = buildPrompt(selected.category, selected.title, selected.content);
    const result = await model.generateContent(prompt);
    const generatedText = result.response.text();

    return NextResponse.json({
      topic: selected.category,
      title: selected.title,
      content: selected.content,
      generated_text: generatedText,
      remaining_pills: availablePills.length - 1,
    });
  } catch (error) {
    console.error('[daily-pill] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
