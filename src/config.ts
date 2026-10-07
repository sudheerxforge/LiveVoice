// App configuration. No secrets here: the Gemini API key lives on the backend
// (backend/.env), and the app gets short-lived tokens from it.

// "localhost" on the phone reaches your PC through `adb reverse tcp:8000 tcp:8000`.
// Without adb, use your PC's Wi-Fi IP instead, e.g. 'http://192.168.1.20:8000'.
export const BACKEND_URL = 'http://localhost:8000';
