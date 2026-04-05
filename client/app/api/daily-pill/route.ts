import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface PillRow {
  id: number;
  title: string;
  content: string;
  category: string;
}

interface ReadyPillContentRow {
  pill_id: number;
  generated_text: string | null;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: seenData, error: seenError } = await supabase
      .from('user_progress')
      .select('pill_id')
      .eq('user_id', user.id);

    if (seenError) {
      throw new Error(`No se pudo leer user_progress: ${seenError.message}`);
    }

    const seenIds = seenData?.map((row) => row.pill_id) ?? [];

    let readyQuery = supabase
      .from('pill_contents')
      .select('pill_id,generated_text')
      .eq('status', 'ready')
      .not('generated_text', 'is', null);

    if (seenIds.length > 0) {
      readyQuery = readyQuery.not('pill_id', 'in', `(${seenIds.join(',')})`);
    }

    const { data: availableContents, error: availableError } = await readyQuery;

    if (availableError) {
      throw new Error(`No se pudo leer pill_contents: ${availableError.message}`);
    }

    const readyContents = (availableContents ?? []) as ReadyPillContentRow[];

    if (readyContents.length === 0) {
      return NextResponse.json(
        { error: 'Increible! Has completado todas las pildoras disponibles por ahora.' },
        { status: 404 }
      );
    }

    const selectedContent = readyContents[Math.floor(Math.random() * readyContents.length)];

    const { data: selectedPill, error: pillError } = await supabase
      .from('pills')
      .select('id,title,content,category')
      .eq('id', selectedContent.pill_id)
      .maybeSingle();

    if (pillError) {
      throw new Error(`No se pudo leer la pildora: ${pillError.message}`);
    }

    if (!selectedPill) {
      throw new Error(`No existe la pildora base para pill_id=${selectedContent.pill_id}`);
    }

    const { error: progressError } = await supabase.from('user_progress').insert({
      user_id: user.id,
      pill_id: selectedPill.id,
    });

    if (progressError) {
      throw new Error(`No se pudo guardar user_progress: ${progressError.message}`);
    }

    const pill = selectedPill as PillRow;

    return NextResponse.json({
      pill_id: pill.id,
      topic: pill.category,
      title: pill.title,
      content: pill.content,
      generated_text: selectedContent.generated_text ?? '',
      remaining_pills: readyContents.length - 1,
    });
  } catch (error) {
    console.error('[daily-pill] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
