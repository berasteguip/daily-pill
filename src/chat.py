import os
from google import genai
from datetime import datetime, timezone
import pandas as pd

# Read the API key from environment for security. Set GENAI_API_KEY in a
# .env file or in your environment before running.
API_KEY = os.getenv("GENAI_API_KEY")
if not API_KEY:
    raise RuntimeError("GENAI_API_KEY environment variable not set")

class Chat:
    def __init__(self):
        self.client = genai.Client(api_key=API_KEY)

    def get_response(self, prompt: str) -> str:
        
        resp = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )


        return resp.text

        
        