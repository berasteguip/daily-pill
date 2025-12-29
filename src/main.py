from chat import Chat
from sender import Sender
from datetime import datetime, timezone
import pandas as pd

days = {
    'Monday': 'art_culture',
    'Tuesday': 'geography', 
    'Wednesday': 'history', 
    'Thursday': 'nature', 
    'Friday': 'politics_econ', 
    'Saturday': 'science_tech',
    'Sunday': 'sayings'
}

def get_topic() -> str:
    day = datetime.now(timezone.utc).strftime("%A")
    topic = days[day]
    return topic 

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
    - **Restricción:** La extensión total debe estar entre 50 y 75 palabras MÁXIMO. No saludes, no te despidas, ve directo al grano.
    
    # FORMATO DE SALIDA
    Solo devuelve el texto de la píldora."""

def get_pill(topic: str) -> dict:
        
    path = f'../material/topics/{topic}.csv'
    df = pd.read_csv(path)
    
    latest = df[df['Estado'] == 'pending'].iloc[0]

    return latest['Titulo'], latest['Contenido'], latest['id']

def mark_as_sent(topic: str, _id: int) -> None:
    
    path = f'../material/topics/{topic}.csv'
    df = pd.read_csv(path)
    
    df.loc[df['id'] == _id, 'Estado'] = 'sent'
    df.to_csv(path, index=False)

def main():

    chat = Chat()
    sender = Sender()

    topic = get_topic()
    title, content, _id = get_pill(topic)
    prompt = set_prompt(topic, title, content)

    pill = chat.get_response(prompt)
    print(pill)

    sender.send(pill)
    mark_as_sent(topic, _id)

if __name__ == "__main__":
    main()