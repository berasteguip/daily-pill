import os
from google import genai
from datetime import datetime, timezone
import pandas as pd

class Chat:
    def __init__(self):
        # Accept both names to avoid deployment mismatches.
        api_key = os.getenv("GENAI_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GENAI_API_KEY environment variable not set "
                "(GEMINI_API_KEY is also accepted)"
            )
        self.client = genai.Client(api_key=api_key)

    def get_response(self, prompt: str) -> str:
        
        resp = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )


        return resp.text

        
        
