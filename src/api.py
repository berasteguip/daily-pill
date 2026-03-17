from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from supabase import create_client, Client
import os
import random
from dotenv import load_dotenv
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware

# Cargar credenciales antes de importar modulos que dependen de env vars.
load_dotenv()

from src.chat import Chat

app = FastAPI(title="DailyPill API v3 (Multi-User)")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite que cualquiera (tu web) llame a la API
    allow_credentials=True,
    allow_methods=["*"],  # Permite GET, POST, etc.
    allow_headers=["*"],
)

# Conexión a Supabase
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

chat_bot = Chat()

class PillResponse(BaseModel):
    topic: str
    title: str
    content: str
    generated_text: str
    remaining_pills: int  # Dato útil para saber si se nos acaba el contenido

def build_prompt(topic: str, title: str, subtitle: str) -> str:
    """Misma función de prompt."""
    return f"""# ROL
    Actúa como un experto divulgador cultural.
    
    # TAREA
    Redacta una "Píldora de Conocimiento Diaria" basada en:
    1. TEMA: {topic}
    2. TÍTULO: {title}
    3. SUBTÍTULO: {subtitle}
    
    # INSTRUCCIONES
    - Gancho impactante.
    - Explicación ELI5 (sencilla).
    - Cierre reflexivo.
    - Máximo 75 palabras. Sin saludos.
    
    # OUTPUT
    Solo el texto de la píldora."""

@app.get("/")
def read_root():
    return {"message": "DailyPill API v3 is ready for users 👥"}

@app.get("/daily-pill", response_model=PillResponse)
def get_daily_pill(user_id: str = Query(..., description="UUID del usuario")):
    try:
        # 1. Obtener el historial de ESTE usuario
        # "Dame los IDs de las píldoras que este usuario ya vio"
        seen_response = supabase.table("user_progress").select("pill_id").eq("user_id", user_id).execute()
        seen_ids = [record['pill_id'] for record in seen_response.data]

        # 2. Consultar píldoras disponibles (Excluyendo las vistas)
        # Nota: La sintaxis .not_.in_ filtra lo que NO está en la lista
        query = supabase.table("pills").select("*")
        
        if seen_ids:
            query = query.not_.in_("id", seen_ids)
            
        # Traemos una muestra (ej. 10) para aleatorizar
        pills_response = query.limit(10).execute()
        available_pills = pills_response.data

        if not available_pills:
            # Caso borde: ¡El usuario se ha leído todo!
            raise HTTPException(status_code=404, detail="¡Increíble! Has completado todas las píldoras disponibles por ahora.")

        # 3. Elegir una al azar
        selected_pill = random.choice(available_pills)
        
        # 4. Registrar la visita (MARCAR COMO VISTA)
        # Esto evita que se le vuelva a mostrar a ESTE usuario
        supabase.table("user_progress").insert({
            "user_id": user_id,
            "pill_id": selected_pill['id']
        }).execute()

        # 5. Generar contenido con IA
        prompt = build_prompt(
            topic=selected_pill['category'],
            title=selected_pill['title'],
            subtitle=selected_pill['content']
        )
        
        generated_text = chat_bot.get_response(prompt)
        
        return {
            "topic": selected_pill['category'],
            "title": selected_pill['title'],
            "content": selected_pill['content'],
            "generated_text": generated_text,
            "remaining_pills": len(available_pills) - 1 # Solo informativo
        }

    except Exception as e:
        print(f"Error: {e}")
        # Si el error es de formato de UUID, damos una pista
        if "uuid" in str(e).lower():
            raise HTTPException(status_code=400, detail="El ID de usuario no es válido. Asegúrate de usar el UUID de Supabase.")
        raise HTTPException(status_code=500, detail=str(e))
