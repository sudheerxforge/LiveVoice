"""Token server for the Gemini Live Voice app.

The mobile app never sees the real Gemini API key. Instead it asks this server
for a short-lived, single-use "ephemeral token", then connects to the Gemini
Live API directly with that token (so audio doesn't pass through this server
and latency stays low).

Run it with:  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import datetime as dt
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel

# Read GEMINI_API_KEY from the .env file next to this script.
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set. Add it to backend/.env")

# Only these models can be used with tokens issued by this server.
ALLOWED_MODELS = {
    "models/gemini-3.8-live",
    "models/gemini-3.8-live-extended-thinking",
}

# How long the app has to START a session with a token, and how long the token
# (and so the session) can last overall.
NEW_SESSION_WINDOW = dt.timedelta(minutes=1)
TOKEN_LIFETIME = dt.timedelta(minutes=30)

# Ephemeral tokens are only available in the v1alpha API.
client = genai.Client(api_key=API_KEY, http_options={"api_version": "v1alpha"})

app = FastAPI(title="Gemini Live token server")


class TokenRequest(BaseModel):
    model: str


class TokenResponse(BaseModel):
    token: str
    expires_at: str


@app.get("/health")
def health() -> dict:
    """Quick check that the server is running."""
    return {"status": "ok"}


@app.post("/token", response_model=TokenResponse)
def create_token(request: TokenRequest) -> TokenResponse:
    """Create a single-use Gemini Live token for the requested model."""
    if request.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Model not allowed: {request.model}")

    now = dt.datetime.now(dt.timezone.utc)
    expires_at = now + TOKEN_LIFETIME
    try:
        token = client.auth_tokens.create(
            config=types.CreateAuthTokenConfig(
                uses=1,  # one Live session per token
                expire_time=expires_at,
                new_session_expire_time=now + NEW_SESSION_WINDOW,
                # Lock the model only; voice, language etc. stay up to the app.
                live_connect_constraints=types.LiveConnectConstraints(model=request.model),
                lock_additional_fields=[],
            )
        )
    except Exception as e:  # network error, invalid key, quota, ...
        raise HTTPException(status_code=502, detail=f"Could not create token: {e}")

    return TokenResponse(token=token.name, expires_at=expires_at.isoformat())
