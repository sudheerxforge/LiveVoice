# Gemini Live token server (Python)

This small server keeps your Gemini API key **off the phone**.

```
 Phone app ──(1) "give me a token"──▶ This server (has the real API key)
           ◀─(2) single-use token───        │
                                             └─(asks Google for the token)
 Phone app ──(3) voice, using the token──▶ Gemini Live API (Google)
```

The token works for **one** conversation, must be used within 1 minute, and
expires after 30 minutes. Voice audio goes straight from the phone to Google,
not through this server, so it stays fast.

## Files

| File | What it is |
|---|---|
| `main.py` | The server code (FastAPI) |
| `requirements.txt` | The Python packages it needs |
| `.env` | Your real API key. **Never commit or share this file** |
| `.env.example` | Template for `.env` |
| `.venv/` | This project's own copy of Python packages (created in step 2) |

## First-time setup

Run these in PowerShell, from the project folder.

1. **Go to the backend folder**
   ```powershell
   cd D:\RNProjects\GeminiLiveVoiceApp\backend
   ```

2. **Create a virtual environment** (a private package folder for this project)
   ```powershell
   python -m venv .venv
   ```

3. **Activate it.** Your prompt will start with `(.venv)`
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
   If you get "running scripts is disabled", run this once, then retry:
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

4. **Install the packages**
   ```powershell
   pip install -r requirements.txt
   ```

5. **Add your API key.** Copy `.env.example` to `.env` and put your key in it:
   ```
   GEMINI_API_KEY=your-real-key-here
   ```

## Every time you work on the app

Use three terminals:

**Terminal 1: backend**
```powershell
cd D:\RNProjects\GeminiLiveVoiceApp\backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Leave it running. `--reload` restarts the server when you edit `main.py`.

**Terminal 2: let the phone reach the server**
```powershell
adb reverse tcp:8000 tcp:8000
```
This makes `localhost:8000` on the phone go to your PC. Run it again whenever
the phone reconnects to adb.

**Terminal 3: Metro**
```powershell
cd D:\RNProjects\GeminiLiveVoiceApp
npx react-native start --port 8082
```

## Check that it works

- Open http://localhost:8000/health in your PC's browser. It should say `{"status":"ok"}`.
- Open http://localhost:8000/docs for an interactive page where you can try `POST /token`.

## Common problems

| Error in the app | Fix |
|---|---|
| "Can't reach the backend at http://localhost:8000" | Terminal 1 isn't running, or run `adb reverse tcp:8000 tcp:8000` again |
| "Could not create token: ... API key ..." | Check the key in `.env`, then restart the server |
| "Token has been used too many times" | A token was reused. The app gets a fresh one per conversation, so just tap Start again |
| `RuntimeError: GEMINI_API_KEY is not set` | `.env` is missing or in the wrong folder (it must be in `backend/`) |

## Before going to production

This setup is for local development. A real deployment also needs:
- **Hosting**, e.g. Google Cloud Run, Render or Railway, and **HTTPS**
- **User authentication** on `/token`, so only your signed-in users can get tokens.
  Right now anyone who can reach the server can get one.
- **Rate limiting**, so one user can't use up your quota
- The app's `BACKEND_URL` in `src/config.ts` pointed at the deployed server
