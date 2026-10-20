import { chat, listenServerEvents, resetConversation } from "./api.js";
import { createRecognizer, type Recognizer, type SttProvider } from "./stt.js";
import { browserVoices, createSpeaker, SentenceBuffer, type Speaker, type TtsProvider } from "./tts.js";

type SphereState = "idle" | "active" | "listening" | "speaking";
const setSphere = (s: SphereState) => (window as unknown as { setState?: (s: string) => void }).setState?.(s);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const userLine = $<HTMLParagraphElement>("user-line");
const zairoLine = $<HTMLParagraphElement>("zairo-line");
const toolLine = $<HTMLParagraphElement>("tool-line");
const form = $<HTMLFormElement>("input-bar");
const input = $<HTMLInputElement>("text");
const mic = $<HTMLButtonElement>("mic");
const settings = $<HTMLDivElement>("settings");
const sttSelect = $<HTMLSelectElement>("stt");
const ttsSelect = $<HTMLSelectElement>("tts");
const voiceSelect = $<HTMLSelectElement>("browser-voice");

const TOOL_LABELS: Record<string, string> = {
  get_datetime: "consultando o relógio",
  get_weather: "verificando o clima",
  web_search: "pesquisando na web",
  remember: "guardando na memória",
  forget: "apagando da memória",
  add_note: "anotando",
  list_notes: "lendo anotações",
  set_reminder: "criando lembrete",
  list_reminders: "verificando lembretes",
  cancel_reminder: "cancelando lembrete",
  open_url: "abrindo site",
};

// ---------- preferências (ficam só neste navegador) ----------
function pref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`zairo.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function setPref(key: string, value: string) {
  try {
    localStorage.setItem(`zairo.${key}`, value);
  } catch {
    /* modo privado: ignora */
  }
}

let serverTts: TtsProvider = "browser";
let speaker: Speaker;

function buildSpeaker() {
  speaker?.cancel();
  speaker = createSpeaker(ttsSelect.value as TtsProvider, {
    voiceName: voiceSelect.value,
    onStart: () => setSphere("speaking"),
    onEnd: () => setSphere("idle"),
  });
}

function fillVoices() {
  const voices = browserVoices();
  const chosen = pref("voice", "");
  voiceSelect.replaceChildren(
    ...voices.map((v) => new Option(`${v.name} (${v.lang})`, v.name, false, v.name === chosen)),
  );
}

// ---------- conversa ----------
let busy = false;

async function ask(text: string) {
  if (busy || !text.trim()) return;
  busy = true;
  speaker.cancel();
  userLine.textContent = text;
  zairoLine.textContent = "";
  toolLine.textContent = "";
  setSphere("active");

  const sentences = new SentenceBuffer();
  try {
    await chat(text, (e) => {
      if (e.type === "text") {
        toolLine.textContent = "";
        zairoLine.textContent += e.delta;
        sentences.push(e.delta).forEach((s) => speaker.say(s));
      } else if (e.type === "tool") {
        toolLine.textContent = TOOL_LABELS[e.name] ?? e.name;
      } else if (e.type === "error") {
        toolLine.textContent = e.message;
      }
    });
    speaker.say(sentences.flush());
  } catch (err) {
    toolLine.textContent = `Sem conexão com o servidor: ${(err as Error).message}`;
    setSphere("idle");
  } finally {
    busy = false;
    if (!zairoLine.textContent) setSphere("idle");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  void ask(text);
});

// ---------- microfone (clique para começar/parar, ou segure Espaço) ----------
let recognizer: Recognizer | null = null;

async function startListening() {
  if (recognizer || busy) return;
  speaker.cancel();
  recognizer = createRecognizer(sttSelect.value as SttProvider, (msg) => (toolLine.textContent = msg));
  try {
    await recognizer.start();
    mic.classList.add("recording");
    setSphere("listening");
  } catch (err) {
    recognizer = null;
    toolLine.textContent = (err as Error).message;
  }
}

async function stopListening() {
  const r = recognizer;
  if (!r) return;
  recognizer = null;
  mic.classList.remove("recording");
  mic.classList.add("busy");
  setSphere("active");
  toolLine.textContent = "transcrevendo";
  try {
    const text = await r.stop();
    toolLine.textContent = "";
    if (text) await ask(text);
    else setSphere("idle");
  } catch (err) {
    toolLine.textContent = `Erro ao transcrever: ${(err as Error).message}`;
    setSphere("idle");
  } finally {
    mic.classList.remove("busy");
  }
}

mic.addEventListener("click", () => (recognizer ? stopListening() : startListening()));

const typing = () => document.activeElement === input;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && !typing()) {
    e.preventDefault();
    void startListening();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && !typing()) void stopListening();
});

// ---------- configurações ----------
$<HTMLButtonElement>("settings-toggle").addEventListener("click", () => (settings.hidden = !settings.hidden));
$<HTMLButtonElement>("reset").addEventListener("click", async () => {
  await resetConversation();
  userLine.textContent = zairoLine.textContent = "";
  toolLine.textContent = "nova conversa";
});
sttSelect.addEventListener("change", () => setPref("stt", sttSelect.value));
ttsSelect.addEventListener("change", () => {
  setPref("tts", ttsSelect.value);
  buildSpeaker();
});
voiceSelect.addEventListener("change", () => {
  setPref("voice", voiceSelect.value);
  buildSpeaker();
});
speechSynthesis.addEventListener("voiceschanged", fillVoices);

// ---------- eventos do servidor (lembretes etc.) ----------
listenServerEvents((e) => {
  if (e.type === "reminder") {
    zairoLine.textContent = `Lembrete: ${e.text}`;
    speaker.say(`${userNameForSpeech}, lembrete: ${e.text}`);
  } else if (e.type === "open_url") {
    window.open(e.url, "_blank", "noopener");
  }
});

let userNameForSpeech = "Ei";

async function init() {
  const cfg = await fetch("/api/config")
    .then((r) => r.json() as Promise<{ userName: string; tts: TtsProvider }>)
    .catch(() => null);
  if (cfg) {
    serverTts = cfg.tts;
    userNameForSpeech = cfg.userName;
  }
  sttSelect.value = pref("stt", "whisper");
  ttsSelect.value = pref("tts", serverTts);
  fillVoices();
  buildSpeaker();
}

void init();
