import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel
class Test(BaseModel):
    x: int

def test_fallback():
    gemini = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
    groq = ChatGroq(model="llama-3.1-8b-instant")
    fallback_llm = gemini.with_fallbacks([groq])
    try:
        struct_llm = fallback_llm.with_structured_output(Test)
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")

test_fallback()
