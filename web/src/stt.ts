// Reconhecimento de fala. "whisper" roda 100% no navegador (Transformers.js);
// "webspeech" usa o reconhecimento embutido do navegador.

export type SttProvider = "whisper" | "webspeech";

export interface Recognizer {
  start(): Promise<void>;
  stop(): Promise<string>;
}

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const WHISPER_MODEL = "onnx-community/whisper-base";

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string }>;
let transcriberPromise: Promise<Transcriber> | null = null;

/** Baixa o modelo uma vez (fica no cache do navegador) e reaproveita. */
export function loadWhisper(onProgress?: (msg: string) => void): Promise<Transcriber> {
  transcriberPromise ??= (async () => {
    const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    const device = "gpu" in navigator ? "webgpu" : "wasm";
    return pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      device,
      dtype: device === "webgpu" ? "fp32" : "q8",
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === "progress" && p.progress !== undefined) {
          onProgress?.(`Baixando modelo de voz… ${Math.round(p.progress)}%`);
        }
      },
    }) as Promise<Transcriber>;
  })();
  return transcriberPromise;
}

class WhisperRecognizer implements Recognizer {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor(private onProgress?: (msg: string) => void) {}

  async start() {
    void loadWhisper(this.onProgress);
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.recorder.start();
  }

  async stop(): Promise<string> {
    const recorder = this.recorder;
    if (!recorder) return "";
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());

    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    const audio = decoded.getChannelData(0);
    if (audio.length < 16000 * 0.3) return "";

    const transcribe = await loadWhisper(this.onProgress);
    const result = await transcribe(audio, { language: "portuguese", task: "transcribe" });
    return result.text.trim();
  }
}

class WebSpeechRecognizer implements Recognizer {
  private recognition: any;
  private text = "";
  private ended: Promise<void> = Promise.resolve();

  async start() {
    const Impl = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Impl) throw new Error("Este navegador não tem Web Speech. Use o Whisper local.");
    this.text = "";
    this.recognition = new Impl();
    this.recognition.lang = "pt-BR";
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this.text += e.results[i][0].transcript;
      }
    };
    this.ended = new Promise((resolve) => (this.recognition.onend = () => resolve()));
    this.recognition.start();
  }

  async stop() {
    this.recognition?.stop();
    await this.ended;
    return this.text.trim();
  }
}

export function createRecognizer(provider: SttProvider, onProgress?: (msg: string) => void): Recognizer {
  return provider === "webspeech" ? new WebSpeechRecognizer() : new WhisperRecognizer(onProgress);
}
