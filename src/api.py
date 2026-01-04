# src/api.py
from fastapi import FastAPI, HTTPException
from src import chat
import pandas as pd
import random
import os

app = FastAPI(title="DailyPill API")

# Cargamos los paths igual que en tu main.py
TOPICS_DIR = 'material/topics' 

def set_prompt(topic: str, title: str, content: str) -> str:
    return f"""# ROL
    Actúa como un experto divulgador cultural y creador de contenido de "micro-learning". Tu especialidad es sintetizar conceptos complejos o historias fascinantes en textos muy breves y adictivos.
    
    # TAREA
    Redacta una "Píldora de Conocimiento Diaria" basada en los siguientes parámetros que te proporciono:
    
    1. TEMA GENERAL (Contexto): {topic}
    2. TÍTULO (El Gancho): {title}
    3. SUBTÍTULO (El Enfoque Específico): {content}
    
    # INSTRUCCIONES DE REDACCIÓN
    - **El Gancho:** Empieza directamente con el dato más impactante, una pregunta retórica o una afirmación contraintuitiva relacionada con el "Subtítulo".
    - **El Cuerpo:** Explica el "por qué" o el "cómo" de forma rigurosa pero sencilla (ELI5 - Explícamelo como si tuviera 5 años).
    - **El Cierre:** Una frase final que deje una reflexión o cierre la curiosidad.
    - **Tono:** Cercano, fascinante, educativo y dinámico.
    - **Restricción:** La extensión total debe estar entre 75 y 100 palabras MÁXIMO. No saludes, no te despidas, ve directo al grano.
    
    # FORMATO DE SALIDA
    Solo devuelve el texto de la píldora."""

def get_random_pending_pill():
    """
    Busca todas las píldoras con Estado='pending' en todos los CSVs
    y devuelve una al azar junto con el nombre del archivo para actualizarla.
    """
    pending_pills = []
    
    # 1. Cargar todos los temas pendientes
    if not os.path.exists(TOPICS_DIR):
        return None, "Error: No se encontró el directorio de topics."

    files = [f for f in os.listdir(TOPICS_DIR) if f.endswith('.csv')]
    
    for file in files:
        try:
            path = os.path.join(TOPICS_DIR, file)
            df = pd.read_csv(path)
            
            # Verificar columnas necesarias
            if 'Estado' in df.columns and 'id' in df.columns and 'Titulo' in df.columns and 'Contenido' in df.columns:
                pending = df[df['Estado'] == 'pending']
                for _, row in pending.iterrows():
                    pending_pills.append({
                        'file': file,
                        'id': row['id'],
                        'Titulo': row['Titulo'],
                        'Contenido': row['Contenido'],
                        'Topic': file.replace('.csv', '') # Usamos el nombre del archivo como tema general
                    })
        except Exception as e:
            print(f"Error leyendo {file}: {e}")
            continue

    # 2. Elegir una al azar
    if not pending_pills:
        return None, "No quedan temas nuevos disponibles (todos están 'sent' o no hay archivos)."

    return random.choice(pending_pills), None

def mark_as_sent(filename, pill_id):
    path = os.path.join(TOPICS_DIR, filename)
    df = pd.read_csv(path)
    df.loc[df['id'] == pill_id, 'Estado'] = 'sent'
    df.to_csv(path, index=False)

@app.get("/")
def read_root():
    return {"message": "Bienvenido a DailyPill API v1"}

@app.get("/daily-pill")
def get_daily_pill():
    """
    Endpoint principal. Genera una píldora bajo demanda y la marca como enviada.
    """
    # 1. Elegimos píldora pendiente
    pill_data, error = get_random_pending_pill()
    
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # 2. Generamos el prompt
    prompt = set_prompt(pill_data['Topic'], pill_data['Titulo'], pill_data['Contenido'])

    # 3. Generamos contenido con Gemini
    try:
        chat_instance = chat.Chat() # Instanciamos Chat
        pill_content = chat_instance.get_response(prompt)
        
        # 4. Marcamos como 'sent' AHORA
        mark_as_sent(pill_data['file'], pill_data['id'])
        
        return {
            "topic": pill_data['Topic'],
            "title": pill_data['Titulo'],
            "content": pill_content,
            "original_file": pill_data['file']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Para correrlo: uvicorn src.api:app --reload