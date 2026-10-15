# LiveVoice

A voice-first AI companion for emotional support, built on the Gemini Live API.
You talk, it listens and answers back in a natural voice. It does not give
medical or diagnostic advice.

| Folder | What it is |
|---|---|
| [`mobile/`](mobile) | React Native Android app |
| [`backend/`](backend) | FastAPI server that keeps the Gemini API key off the phone and hands out short-lived tokens |
| [`web/`](web) | Landing page, published with GitHub Pages |

## How it works

```
Phone app ──(1) "give me a token"──▶ backend (holds the real API key)
          ◀─(2) single-use token────
Phone app ──(3) voice, using token──▶ Gemini Live API (Google)
```

## Run it locally

1. Backend: see [`backend/README.md`](backend/README.md).
2. App: see [`mobile/README.md`](mobile/README.md). Set `BACKEND_URL` in
   `mobile/src/config.ts`.

## Install

Download the APK from the
[latest release](https://github.com/sudheerxforge/LiveVoice/releases/latest)
and allow "Install unknown apps" when Android asks. The app needs a running
backend to connect.
