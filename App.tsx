import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  AudioBufferQueueSourceNode,
  AudioContext,
  AudioManager,
  AudioRecorder,
} from 'react-native-audio-api';
import { fetchLiveToken, liveSocketUrl } from './src/api/liveToken';
import ChatBubble from './src/components/ChatBubble';
import PickerModal from './src/components/PickerModal';
import SideMenu, {
  ChatListRow,
  MenuRow,
  MenuSection,
} from './src/components/SideMenu';
import {
  ChatMessage,
  ChatSummary,
  deleteAllChats,
  deleteChat,
  loadChatList,
  loadChatMessages,
  newId,
  saveChat,
} from './src/storage/chatHistory';
import { formatChatDate } from './src/utils/time';
import {
  AUTO_LANGUAGE,
  LANGUAGES,
  languageLabel,
} from './src/data/languages';
import { DEFAULT_VOICE, VOICES } from './src/data/voices';

// --- Configuration ---

// Display names as reported by the models endpoint.
interface ModelOption {
  id: string;
  name: string;
  description: string;
  /** Requires generationConfig.thinkingConfig.thinkingLevel. */
  thinking: boolean;
}
const MODELS: ModelOption[] = [
  {
    id: 'models/gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    description: 'Fast, natural replies. Best for everyday conversation.',
    thinking: false,
  },
  {
    id: 'models/gemini-3.8-live-extended-thinking',
    name: 'Gemini 3.8 Live Extended Thinking',
    description:
      'Says a short filler, reasons in the background, then answers. ' +
      'For complex, multi-step questions; slower.',
    thinking: true,
  },
];
const DEFAULT_MODEL = MODELS[0].id;

// The extended-thinking model rejects a setup without a thinking level, and
// doesn't support MINIMAL.
type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';
const THINKING_LEVELS: Array<{ level: ThinkingLevel; description: string }> = [
  { level: 'LOW', description: 'Quickest answers' },
  { level: 'MEDIUM', description: 'Balanced' },
  { level: 'HIGH', description: 'Deepest reasoning, slowest answers' },
];
const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'LOW';

// Playback speed, applied on the phone with pitch correction (the model has no
// speaking-rate setting and ignores "speak slowly" instructions).
interface SpeedOption {
  rate: number;
  label: string;
  description: string;
}
const SPEEDS: SpeedOption[] = [
  { rate: 0.7, label: 'Very slow', description: 'Easiest to follow' },
  { rate: 0.8, label: 'Slow', description: 'Relaxed pace' },
  { rate: 0.9, label: 'Slightly slow', description: 'A little slower than natural' },
  { rate: 1.0, label: 'Normal', description: 'Natural speaking pace' },
  { rate: 1.15, label: 'Fast', description: 'Quicker replies' },
];
const DEFAULT_SPEED = 1.0;

// Native-audio models ignore speechConfig.languageCode and choose the language
// themselves, so the language preference is enforced via the system prompt.
function buildSystemPrompt(languageCode: string): string {
  const base =
    'You are a warm, caring companion whose only purpose is emotional ' +
    'support through conversation. Listen first. Notice how the user feels ' +
    '(sad, stressed, happy, lonely, loved) and respond with matching ' +
    'empathy, like a kind friend: celebrate their joy, stay gently with ' +
    'their sadness, and never rush to fix things. Acknowledge their feelings ' +
    'before anything else, and ask a soft follow-up question to keep them ' +
    'talking. Keep answers short and conversational, with simple words and ' +
    'short sentences. Do not give medical, psychiatric, or diagnostic ' +
    'advice, do not name conditions or suggest medication or treatments; if ' +
    'asked, kindly say you cannot help with that and encourage talking to a ' +
    'doctor or qualified professional. Do not act as a general assistant ' +
    '(no coding, facts, or tasks); gently steer back to how they are ' +
    'feeling. If the user mentions wanting to harm themselves or being in ' +
    'danger, respond with care, tell them they deserve support right now, ' +
    'and urge them to contact a local emergency number, a crisis helpline, ' +
    'or someone they trust. You are an AI, not a human or a therapist; say ' +
    'so honestly if asked. Every time a new session starts, begin in a ' +
    'calm, neutral, friendly tone, even if earlier messages in the history ' +
    'were sad or heavy. Never assume the user still feels the way they did ' +
    'before; earlier messages are only background. Match their emotion only ' +
    'from how they sound and what they say in the current session, and ' +
    'change your tone as soon as their mood changes.';
  const lang = LANGUAGES.find(l => l.code === languageCode);
  if (!lang) {
    return (
      base +
      ' Always reply in the same language the user is speaking. If the user ' +
      'switches language, switch with them.'
    );
  }
  return (
    base +
    ` Always reply in ${languageLabel(lang)}, no matter which language the ` +
    'user speaks, unless they explicitly ask you to change language.'
  );
}

// When continuing a saved chat, this many recent messages are sent to Gemini
// as context so it remembers the conversation.
const HISTORY_MESSAGES_FOR_CONTEXT = 40;

// Gemini Live expects 16-bit PCM mono input and returns 24 kHz 16-bit PCM mono.
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
// ~64 ms of audio per chunk: small enough for low latency, large enough to
// avoid flooding the socket with tiny JSON messages.
const INPUT_CHUNK_FRAMES = 1024;

// The Android recorder has no acoustic echo cancellation, so on the loudspeaker
// Gemini hears its own voice and keeps interrupting itself. While this is true
// the mic is gated while the model is speaking (no voice barge-in). Set it to
// false if you use headphones and want to be able to talk over the model.
const MUTE_MIC_WHILE_MODEL_SPEAKS = Platform.OS === 'android';
const MIC_GATE_TAIL_MS = 300;

// --- Types ---

type Status =
  | 'Disconnected'
  | 'Connecting...'
  | 'Listening'
  | 'Speaking'
  | 'Thinking...'
  | 'Microphone permission denied'
  | 'Error';

interface ServerMessage {
  setupComplete?: object;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{ inlineData?: { mimeType: string; data: string } }>;
    };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
    /** Extended thinking: IN_PROGRESS while reasoning in the background. */
    interactionStatus?: 'IN_PROGRESS' | 'IDLE';
  };
  goAway?: { timeLeft?: string };
}

// --- PCM / encoding helpers ---
/* eslint-disable no-bitwise */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) {
  B64_LOOKUP[B64.charCodeAt(i)] = i;
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let j = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64_LOOKUP[clean.charCodeAt(i)] << 18) |
      (B64_LOOKUP[clean.charCodeAt(i + 1)] << 12) |
      ((B64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0) << 6) |
      (B64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0);
    if (j < bytes.length) { bytes[j++] = (n >> 16) & 255; }
    if (j < bytes.length) { bytes[j++] = (n >> 8) & 255; }
    if (j < bytes.length) { bytes[j++] = n & 255; }
  }
  return bytes;
}

function float32ToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  // Int16Array uses platform endianness; all Android/iOS devices are little-endian.
  return bytesToBase64(new Uint8Array(pcm.buffer));
}

function pcm16Base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const bytes = base64ToBytes(base64);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = pcm[i] / 0x8000;
  }
  return out;
}

// Linear resampling; only used if the device refuses a 24 kHz audio context.
function resample(
  input: Float32Array<ArrayBuffer>,
  fromRate: number,
  toRate: number,
): Float32Array<ArrayBuffer> {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

// Gemini sends JSON as binary WebSocket frames, so decode UTF-8 manually
// (TextDecoder is not guaranteed to exist in React Native).
function utf8Decode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) {
      cp = b;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/* eslint-enable no-bitwise */

// --- Components ---

const VoiceScreen: FC = () => {
  const [status, setStatus] = useState<Status>('Disconnected');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  // null = a new chat that hasn't been saved yet (it's saved once it has a
  // message, so empty chats never clutter the list).
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(
    DEFAULT_THINKING_LEVEL,
  );
  const model = MODELS.find(m => m.id === modelId) ?? MODELS[0];
  const [language, setLanguage] = useState(AUTO_LANGUAGE);
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [openPicker, setOpenPicker] = useState<
    'model' | 'thinking' | 'language' | 'voice' | 'speed' | null
  >(null);
  // Read from inside audio callbacks, which would otherwise see stale state.
  const speedRef = useRef(DEFAULT_SPEED);

  const ws = useRef<WebSocket | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const player = useRef<AudioBufferQueueSourceNode | null>(null);
  const recorder = useRef<AudioRecorder | null>(null);
  // Wall-clock time (ms) at which the queued model audio finishes playing.
  const playbackEndsAt = useRef(0);
  // Ids of the chat messages being filled in by the current turn's
  // transcription; cleared when the turn completes or is interrupted.
  const currentUserMsg = useRef<string | null>(null);
  const currentModelMsg = useRef<string | null>(null);
  const chatList = useRef<FlatList<ChatMessage>>(null);

  // Mirrors of state for use in async code and socket callbacks.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const chatsRef = useRef<ChatSummary[]>([]);
  chatsRef.current = chats;
  const activeChatRef = useRef<string | null>(null);
  // The messages array last loaded or saved; unchanged arrays aren't re-saved
  // (so merely opening a chat doesn't move it to the top of the list).
  const lastSaved = useRef<ChatMessage[] | null>(null);
  const chatsLoaded = useRef(false);
  // Saves run one at a time so they can't overwrite each other's list update.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = (task: () => Promise<void>) => {
    saveQueue.current = saveQueue.current.then(task, task);
    return saveQueue.current;
  };

  // Update the ref immediately, not on the next render, so the next queued
  // save starts from this list rather than a stale one.
  const updateChats = (list: ChatSummary[]) => {
    chatsRef.current = list;
    setChats(list);
  };

  const persist = (id: string, msgs: ChatMessage[]) =>
    enqueue(async () => {
      updateChats(await saveChat(id, msgs, chatsRef.current));
    });

  const showChat = (id: string | null, msgs: ChatMessage[]) => {
    activeChatRef.current = id;
    lastSaved.current = msgs;
    setActiveChatId(id);
    setMessages(msgs);
  };

  // On launch, reopen the most recent chat.
  useEffect(() => {
    loadChatList().then(async list => {
      updateChats(list);
      if (list.length) {
        showChat(list[0].id, await loadChatMessages(list[0].id));
      }
      chatsLoaded.current = true;
    });
  }, []);

  // Save the open chat as it changes. Transcripts arrive word by word, so
  // batch the writes.
  useEffect(() => {
    if (!chatsLoaded.current || !messages.length || messages === lastSaved.current) {
      return;
    }
    if (!activeChatRef.current) {
      const id = newId();
      activeChatRef.current = id;
      setActiveChatId(id);
    }
    const id = activeChatRef.current;
    const t = setTimeout(() => {
      lastSaved.current = messages;
      persist(id, messages);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /** Saves the open chat right away (e.g. before switching to another). */
  const flushActiveChat = () => {
    const id = activeChatRef.current;
    const msgs = messagesRef.current;
    if (id && msgs.length && msgs !== lastSaved.current) {
      lastSaved.current = msgs;
      persist(id, msgs);
    }
  };

  const startNewChat = () => {
    if (isActive) {
      stopSession();
    }
    flushActiveChat();
    endTurn();
    setError(null);
    showChat(null, []);
    setMenuOpen(false);
  };

  const openChat = async (id: string) => {
    setMenuOpen(false);
    if (id === activeChatRef.current) {
      return;
    }
    if (isActive) {
      stopSession();
    }
    flushActiveChat();
    endTurn();
    setError(null);
    await saveQueue.current; // make sure the chat's latest save has landed
    showChat(id, await loadChatMessages(id));
  };

  const confirmDeleteChat = (chat: ChatSummary) => {
    Alert.alert('Delete this chat?', `“${chat.title}” will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (chat.id === activeChatRef.current) {
            if (isActive) {
              stopSession();
            }
            endTurn();
            showChat(null, []);
          }
          enqueue(async () => {
            updateChats(await deleteChat(chat.id, chatsRef.current));
          });
        },
      },
    ]);
  };

  const confirmDeleteAllChats = () => {
    Alert.alert('Delete all chats?', 'Every saved conversation will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: () => {
          if (isActive) {
            stopSession();
          }
          endTurn();
          showChat(null, []);
          enqueue(async () => {
            await deleteAllChats(chatsRef.current);
            updateChats([]);
          });
        },
      },
    ]);
  };

  const appendTranscript = (role: ChatMessage['role'], text: string) => {
    const idRef = role === 'user' ? currentUserMsg : currentModelMsg;
    const id = idRef.current;
    if (id) {
      setMessages(prev =>
        prev.map(m => (m.id === id ? { ...m, text: m.text + text } : m)),
      );
      return;
    }
    const messageId = newId();
    idRef.current = messageId;
    const message: ChatMessage = {
      id: messageId,
      role,
      text,
      createdAt: Date.now(),
    };
    const replyId = currentModelMsg.current;
    setMessages(prev => {
      // The user's transcript can arrive after Gemini has started replying;
      // keep it above that reply so the chat reads in order.
      const replyIndex =
        role === 'user' && replyId ? prev.findIndex(m => m.id === replyId) : -1;
      return replyIndex === -1
        ? [...prev, message]
        : [...prev.slice(0, replyIndex), message, ...prev.slice(replyIndex)];
    });
  };

  const endTurn = () => {
    currentUserMsg.current = null;
    currentModelMsg.current = null;
  };

  const isActive = status !== 'Disconnected' && status !== 'Error' &&
    status !== 'Microphone permission denied';

  const stopSession = useCallback((finalStatus: Status = 'Disconnected') => {
    const socket = ws.current;
    ws.current = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    const rec = recorder.current;
    recorder.current = null;
    if (rec) {
      rec.clearOnAudioReady();
      rec.clearOnError();
      if (rec.isRecording()) {
        rec.stop().catch(() => {});
      }
    }

    player.current = null;
    const ctx = audioCtx.current;
    audioCtx.current = null;
    ctx?.close().catch(() => {});
    playbackEndsAt.current = 0;
    endTurn();

    AudioManager.setAudioSessionActivity(false).catch(() => {});
    setStatus(finalStatus);
  }, []);

  useEffect(() => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat', // enables iOS echo cancellation
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });
    return () => stopSession();
  }, [stopSession]);

  // Speed can change mid-conversation; it applies to the audio still queued.
  const changeSpeed = (rate: number) => {
    setSpeed(rate);
    speedRef.current = rate;
    if (player.current) {
      player.current.playbackRate.value = rate;
    }
  };

  const playChunk = (base64: string) => {
    const ctx = audioCtx.current;
    const node = player.current;
    if (!ctx || !node) {
      return;
    }
    // The queue player does NOT resample: it reads one sample per output
    // frame. So the audio must already be at the context's sample rate, or it
    // plays too fast and high-pitched (24 kHz audio on a 48 kHz context = 2x).
    const samples = resample(
      pcm16Base64ToFloat32(base64),
      OUTPUT_SAMPLE_RATE,
      ctx.sampleRate,
    );
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    node.enqueueBuffer(buffer);

    // Slowed-down playback takes longer than the audio's nominal duration.
    // (Approximate if the speed is changed while audio is still queued.)
    const now = Date.now();
    playbackEndsAt.current =
      Math.max(now, playbackEndsAt.current) +
      (samples.length / ctx.sampleRate / speedRef.current) * 1000;
    setStatus('Speaking');
  };

  const startMicrophone = async () => {
    const rec = new AudioRecorder();
    recorder.current = rec;

    rec.onError(e => {
      console.warn('Recorder error:', e);
      setError(`Microphone error: ${e.message}`);
    });

    rec.onAudioReady(
      {
        sampleRate: INPUT_SAMPLE_RATE,
        bufferLength: INPUT_CHUNK_FRAMES,
        channelCount: 1,
      },
      ({ buffer }) => {
        const socket = ws.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }
        const modelSpeaking =
          Date.now() < playbackEndsAt.current + MIC_GATE_TAIL_MS;
        if (MUTE_MIC_WHILE_MODEL_SPEAKS && modelSpeaking) {
          return;
        }
        socket.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                // The device may not honour the requested rate, so report the
                // rate we actually got.
                mimeType: `audio/pcm;rate=${Math.round(buffer.sampleRate)}`,
                data: float32ToPcm16Base64(buffer.getChannelData(0)),
              },
            },
          }),
        );
      },
    );

    const result = await rec.start();
    if (result.status === 'error') {
      throw new Error(result.message);
    }
  };

  const handleServerMessage = (msg: ServerMessage) => {
    if (msg.setupComplete) {
      // Continuing a saved chat: give Gemini the earlier conversation so it
      // remembers it. turnComplete: false = context only, don't reply yet.
      const history = messagesRef.current
        .filter(m => m.text.trim())
        .slice(-HISTORY_MESSAGES_FOR_CONTEXT)
        .map(m => ({ role: m.role, parts: [{ text: m.text.trim() }] }));
      if (history.length) {
        ws.current?.send(
          JSON.stringify({ clientContent: { turns: history, turnComplete: false } }),
        );
      }
      setStatus('Listening');
      startMicrophone().catch(e => {
        setError(`Could not start microphone: ${e?.message ?? e}`);
        stopSession('Error');
      });
      return;
    }

    const content = msg.serverContent;
    if (content) {
      if (content.interrupted) {
        // User barged in: drop whatever audio is still queued.
        player.current?.clearBuffers();
        playbackEndsAt.current = 0;
        const cutId = currentModelMsg.current;
        if (cutId) {
          setMessages(prev =>
            prev.map(m => (m.id === cutId ? { ...m, interrupted: true } : m)),
          );
        }
        endTurn();
        setStatus('Listening');
      }

      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          playChunk(part.inlineData.data);
        }
      }

      if (content.inputTranscription?.text) {
        appendTranscript('user', content.inputTranscription.text);
      }
      if (content.outputTranscription?.text) {
        appendTranscript('model', content.outputTranscription.text);
      }

      if (content.turnComplete) {
        endTurn();
        // Extended thinking: this turn was only a filler ("let me work that
        // out"); the real answer arrives as a new turn later.
        const stillThinking = content.interactionStatus === 'IN_PROGRESS';
        const remaining = Math.max(0, playbackEndsAt.current - Date.now());
        setTimeout(() => {
          if (ws.current && Date.now() >= playbackEndsAt.current) {
            setStatus(stillThinking ? 'Thinking...' : 'Listening');
          }
        }, remaining);
      }
    }

    if (msg.goAway) {
      console.warn('Server will close the session soon:', msg.goAway.timeLeft);
    }
  };

  const startSession = async () => {
    setError(null);
    endTurn();

    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== 'Granted') {
      setStatus('Microphone permission denied');
      return;
    }

    setStatus('Connecting...');

    // Get a single-use token from our backend (the API key stays there).
    let token: string;
    try {
      token = await fetchLiveToken(model.id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('Error');
      return;
    }

    try {
      await AudioManager.setAudioSessionActivity(true);

      // Run the audio graph at Gemini's output rate; the OS converts to the
      // hardware rate with a proper resampler.
      const ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      audioCtx.current = ctx;
      // Pitch correction keeps the voice natural when slowed down.
      const node = ctx.createBufferQueueSource({ pitchCorrection: true });
      node.playbackRate.value = speedRef.current;
      node.connect(ctx.destination);
      // Plays silence while the queue is empty. Pass offset 0 explicitly:
      // react-native-audio-api 0.13.3 defaults it to -1 and then rejects -1.
      node.start(0, 0);
      player.current = node;
    } catch (e: any) {
      setError(`Could not start audio output: ${e?.message ?? e}`);
      stopSession('Error');
      return;
    }

    const socket = new WebSocket(liveSocketUrl(token));
    // Not in RN's typings, but supported at runtime.
    (socket as WebSocket & { binaryType: string }).binaryType = 'arraybuffer';
    ws.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          setup: {
            model: model.id,
            generationConfig: {
              responseModalities: ['AUDIO'],
              ...(model.thinking && { thinkingConfig: { thinkingLevel } }),
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
              },
            },
            systemInstruction: {
              parts: [{ text: buildSystemPrompt(language) }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      );
    };

    socket.onmessage = event => {
      try {
        const raw =
          typeof event.data === 'string'
            ? event.data
            : utf8Decode(event.data as ArrayBuffer);
        handleServerMessage(JSON.parse(raw));
      } catch (e) {
        console.error('Failed to handle Gemini message:', e);
      }
    };

    socket.onerror = (e: any) => {
      console.error('WebSocket error:', e?.message ?? e);
      setError(e?.message ?? 'WebSocket error');
    };

    socket.onclose = e => {
      // Close reasons from Gemini explain setup problems (expired token, etc.).
      if (e.code !== 1000) {
        setError(`Connection closed (${e.code}) ${e.reason ?? ''}`.trim());
        stopSession('Error');
      } else {
        stopSession();
      }
    };
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          accessibilityLabel="Open menu"
          style={styles.menuButton}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {chats.find(c => c.id === activeChatId)?.title ?? 'New chat'}
        </Text>
        <TouchableOpacity
          onPress={startNewChat}
          hitSlop={12}
          accessibilityLabel="New chat"
          style={styles.newChatButton}>
          <Text style={styles.newChatText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={chatList}
        style={styles.chat}
        contentContainerStyle={
          messages.length ? styles.chatContent : styles.chatEmpty
        }
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onContentSizeChange={() => chatList.current?.scrollToEnd()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            New chat{'\n'}Tap “Start Talking” and say hello.
          </Text>
        }
      />

      <Text style={styles.statusText}>{status}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, isActive ? styles.stopBtn : styles.startBtn]}
        onPress={isActive ? () => stopSession() : startSession}
        activeOpacity={0.8}>
        <Text style={styles.buttonText}>
          {isActive ? 'End Conversation' : 'Start Talking'}
        </Text>
      </TouchableOpacity>

      <SideMenu visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuRow label="＋  New chat" onPress={startNewChat} />

        <MenuSection title="Chats">
          {chats.length ? (
            chats.map(chat => (
              <ChatListRow
                key={chat.id}
                title={chat.title}
                subtitle={`${formatChatDate(chat.updatedAt)} · ${
                  chat.messageCount
                } message${chat.messageCount === 1 ? '' : 's'}`}
                active={chat.id === activeChatId}
                onPress={() => openChat(chat.id)}
                onDelete={() => confirmDeleteChat(chat)}
              />
            ))
          ) : (
            <Text style={styles.hint}>No saved chats yet.</Text>
          )}
        </MenuSection>

        <View style={styles.modelCard}>
          <Text style={styles.modelName}>{model.name}</Text>
          <Text style={styles.modelId}>{model.id.replace('models/', '')}</Text>
          <Text style={styles.modelMeta}>
            Speaks {LANGUAGES.length} languages · detects yours automatically
          </Text>
        </View>

        <MenuSection title="Conversation">
          <MenuRow
            label="Model"
            value={model.name}
            disabled={isActive}
            onPress={() => setOpenPicker('model')}
          />
          {model.thinking && (
            <MenuRow
              label="Thinking level"
              value={thinkingLevel}
              disabled={isActive}
              onPress={() => setOpenPicker('thinking')}
            />
          )}
          <MenuRow
            label="Reply language"
            value={
              language === AUTO_LANGUAGE
                ? 'Auto (same as mine)'
                : languageLabel(LANGUAGES.find(l => l.code === language)!)
            }
            disabled={isActive}
            onPress={() => setOpenPicker('language')}
          />
          <MenuRow
            label="Voice"
            value={`${voice} · ${VOICES.find(v => v.name === voice)?.style ?? ''}`}
            disabled={isActive}
            onPress={() => setOpenPicker('voice')}
          />
          <MenuRow
            label="Speaking speed"
            value={`${SPEEDS.find(o => o.rate === speed)?.label ?? ''} (${speed}x)`}
            onPress={() => setOpenPicker('speed')}
          />
          {isActive && (
            <Text style={styles.hint}>
              End the conversation to change model, language or voice.
            </Text>
          )}
        </MenuSection>

        <MenuSection title="Storage">
          <MenuRow
            label="Delete all chats"
            danger
            disabled={!chats.length}
            onPress={confirmDeleteAllChats}
          />
        </MenuSection>
      </SideMenu>

      {/* Rendered after the side menu so the pickers open on top of it. */}
      <PickerModal
        visible={openPicker === 'model'}
        title="Model"
        items={MODELS.map(m => ({
          key: m.id,
          title: m.name,
          subtitle: m.description,
        }))}
        selectedKey={modelId}
        onSelect={setModelId}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === 'thinking'}
        title="Thinking level"
        items={THINKING_LEVELS.map(t => ({
          key: t.level,
          title: t.level,
          subtitle: t.description,
        }))}
        selectedKey={thinkingLevel}
        onSelect={key => setThinkingLevel(key as ThinkingLevel)}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === 'language'}
        title="Reply language"
        searchable
        items={[
          {
            key: AUTO_LANGUAGE,
            title: 'Auto (same as mine)',
            subtitle: 'Replies in whatever language you speak',
          },
          ...LANGUAGES.map(l => ({
            key: l.code,
            title: languageLabel(l),
            keywords: l.code,
          })),
        ]}
        selectedKey={language}
        onSelect={setLanguage}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === 'voice'}
        title="Voice"
        searchable
        items={VOICES.map(v => ({
          key: v.name,
          title: v.name,
          subtitle: v.style,
        }))}
        selectedKey={voice}
        onSelect={setVoice}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === 'speed'}
        title="Speaking speed"
        items={SPEEDS.map(o => ({
          key: String(o.rate),
          title: `${o.label} (${o.rate}x)`,
          subtitle: o.description,
        }))}
        selectedKey={String(speed)}
        onSelect={key => changeSpeed(Number(key))}
        onClose={() => setOpenPicker(null)}
      />
    </SafeAreaView>
  );
};

const App: FC = () => (
  <SafeAreaProvider>
    <VoiceScreen />
  </SafeAreaProvider>
);

export default App;

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuButton: {
    width: 28,
    height: 20,
    justifyContent: 'space-between',
    marginRight: 16,
  },
  menuLine: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#F8FAFC',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  newChatButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
  newChatText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  chat: {
    alignSelf: 'stretch',
    flex: 1,
  },
  chatContent: {
    paddingVertical: 8,
  },
  chatEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 4,
  },
  modelCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  modelName: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
  },
  modelId: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  modelMeta: {
    color: '#93C5FD',
    fontSize: 14,
    marginTop: 6,
  },
  hint: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  button: {
    width: 220,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    marginTop: 8,
    marginBottom: 16,
  },
  startBtn: {
    backgroundColor: '#2563EB',
  },
  stopBtn: {
    backgroundColor: '#DC2626',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
