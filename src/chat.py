from google import genai
from datetime import datetime, timezone
import pandas as pd

API_KEY = "AIzaSyAy4uOF8EfEMZ2SjRv01cXaUcNELQv8Q3w"

class Chat:
    def __init__(self):
        self.client = genai.Client(api_key=API_KEY)

    def get_response(self, prompt: str) -> str:
        
        resp = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        
        return resp.text

        
        