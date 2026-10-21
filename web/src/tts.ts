// Fala do Zairo. "browser" usa as vozes do sistema (locais e gratuitas);
// "piper" e "elevenlabs" geram o áudio no servidor.

export type TtsProvider = "browser" | "piper" | "elevenlabs";

export interface Speaker {
  /** Enfileira um trecho de texto para ser falado. */
  say(text: string): void;
  /** Interrompe a fala e esvazia a fila. */
  cancel(): void;
  /** Resolve quando a fila terminar. */
  idle(): Promise<void>;
}

const setVoiceLevel = (level: number) =>
  (window as unknown as { setVoiceLevel?: (l: number) => void }).setVoiceLevel?.(level);

/**
 * Mede o volume da fala a cada quadro e repassa para a esfera.
 * Áudio vindo do servidor (Piper, ElevenLabs) é medido de verdade com um
 * AnalyserNode; a voz do sistema não expõe o áudio, então o nível é
 * sintetizado a partir dos eventos de palavra da fala.
 */
class VoiceMeter {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private source: "none" | "audio" | "synthetic" = "none";
  private wordBurst = 0;
  private frame = 0;

  /** Conecta um elemento de áudio ao medidor (o som continua saindo normalmente). */
  attach(audio: HTMLAudioElement) {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      if (!this.analyser) {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.connect(this.ctx.destination);
        this.samples = new Float32Array(this.analyser.fftSize);
      }
      this.ctx.createMediaElementSource(audio).connect(this.analyser);
      this.start("audio");
    } catch {
      // Sem Web Audio, a fala sai pelo elemento de áudio e a esfera usa o nível sintético.
      this.start("synthetic");
    }
  }

  startSynthetic() {
    this.start("synthetic");
  }

  /** Chamado a cada palavra falada pela voz do sistema. */
  word() {
    this.wordBurst = 0.65 + Math.random() * 0.35;
  }

  stop() {
    this.source = "none";
    cancelAnimationFrame(this.frame);
    setVoiceLevel(0);
  }

  private start(source: "audio" | "synthetic") {
    this.source = source;
    cancelAnimationFrame(this.frame);
    const tick = (t: number) => {
      if (this.source === "none") return;
      setVoiceLevel(this.source === "audio" ? this.measure() : this.synthesize(t));
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private measure(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += v * v;
    const rms = Math.sqrt(sum / this.samples.length);
    // Fala normal fica em torno de 0,05 a 0,3 de RMS; leva isso para 0 a 1
    return Math.min(1, rms * 4);
  }

  private synthesize(t: number): number {
    // Ritmo de sílabas (~5 Hz) com variação, mais um impulso a cada palavra
    this.wordBurst *= 0.9;
    const syllables = 0.5 + 0.5 * Math.sin(t / 32) * Math.sin(t / 71);
    return Math.min(1, 0.2 + syllables * 0.35 + this.wordBurst * 0.5);
  }
}

export function browserVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
}

export function createSpeaker(
  provider: TtsProvider,
  opts: { voiceName?: string; onStart?: () => void; onEnd?: () => void } = {},
): Speaker {
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let generation = 0;
  let speaking = false;
  let current: HTMLAudioElement | null = null;
  const meter = new VoiceMeter();

  // O estado "falando" começa quando o som realmente começa, não quando o texto chega.
  const markStarted = () => {
    if (speaking) return;
    speaking = true;
    opts.onStart?.();
  };

  const speakBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      const voice = speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
      if (voice) u.voice = voice;
      u.onstart = () => {
        markStarted();
        meter.startSynthetic();
      };
      u.onboundary = (e) => {
        if (e.name === "word") meter.word();
      };
      u.onend = u.onerror = () => {
        meter.stop();
        resolve();
      };
      speechSynthesis.speak(u);
    });

  const fetchAudio = async (text: string): Promise<Blob | null> => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider }),
    }).catch(() => null);
    if (!res?.ok) {
      const { error } = res ? await res.json().catch(() => ({ error: res.statusText })) : { error: "sem conexão" };
      console.warn(`TTS ${provider} falhou (${error}); usando a voz do sistema.`);
      return null;
    }
    return res.blob();
  };

  const playAudio = async (text: string, audio: Promise<Blob | null>) => {
    const blob = await audio;
    if (!blob) return speakBrowser(text);
    const url = URL.createObjectURL(blob);
    current = new Audio(url);
    meter.attach(current);
    await new Promise<void>((resolve) => {
      current!.onplaying = markStarted;
      current!.onended = current!.onerror = current!.onpause = () => resolve();
      void current!.play().catch(() => resolve());
    });
    meter.stop();
    URL.revokeObjectURL(url);
    current = null;
  };

  return {
    say(text) {
      const clean = text.trim();
      if (!clean) return;
      const gen = generation;
      pending++;
      // No Piper/ElevenLabs, a próxima frase já é gerada enquanto a atual toca.
      const audio = provider === "browser" ? null : fetchAudio(clean);
      queue = queue
        .then(() => {
          if (gen !== generation) return;
          return audio ? playAudio(clean, audio) : speakBrowser(clean);
        })
        .finally(() => {
          if (--pending === 0 && speaking) {
            speaking = false;
            opts.onEnd?.();
          }
        });
    },
    cancel() {
      generation++;
      speechSynthesis.cancel();
      current?.pause();
      meter.stop();
    },
    idle: () => queue,
  };
}

/** Divide texto em streaming em frases completas, para começar a falar antes da resposta terminar. */
export class SentenceBuffer {
  private buffer = "";

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    const re = /[^.!?…\n]+[.!?…]+["')\]]*(\s+|$)|[^\n]*\n/g;
    let last = 0;
    for (let m = re.exec(this.buffer); m; m = re.exec(this.buffer)) {
      if (m.index + m[0].length === this.buffer.length && !/\s$/.test(m[0])) break;
      out.push(m[0].trim());
      last = m.index + m[0].length;
    }
    this.buffer = this.buffer.slice(last);
    return out.filter(Boolean);
  }

  flush(): string {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest;
  }
}
