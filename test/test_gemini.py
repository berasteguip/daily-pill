import os
import pytest
from google import genai

# read key from environment; skip the test if it's missing
API_KEY = os.getenv("GENAI_API_KEY")

if not API_KEY:
    pytest.skip("GENAI_API_KEY not set, skipping Gemini integration test", allow_module_level=True)


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
