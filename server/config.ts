import { process } from "./env.js";

export type TtsProvider = "browser" | "piper" | "elevenlabs";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  model: process.env.ZAIRO_MODEL ?? "claude-opus-5-5",
  effort: (process.env.ZAIRO_EFFORT ?? "low") as "low" | "medium" | "high" | "xhigh" | "max",
  userName: process.env.ZAIRO_USER_NAME ?? "Marcos",
  city: process.env.ZAIRO_CITY ?? "São Paulo",
  timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  dataDir: process.env.ZAIRO_DATA_DIR ?? "data",
  tts: (process.env.ZAIRO_TTS ?? "browser") as TtsProvider,
  piper: {
    path: process.env.PIPER_PATH ?? "piper",
    model: process.env.PIPER_MODEL ?? "",
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    model: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
  },
};
