import os
from google import genai

API_KEY = "AIzaSyAy4uOF8EfEMZ2SjRv01cXaUcNELQv8Q3w"

def main() -> None:
    # Si prefieres, puedes pasar la key explícitamente:
    client = genai.Client(api_key=API_KEY)
    #client = genai.Client()

    prompt = "Escribe una píldora de cultura general (máx 60 palabras) sobre un hecho histórico poco conocido."
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    print(resp.text)

if __name__ == "__main__":
    main()
