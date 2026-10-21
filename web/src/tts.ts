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
  /** Há fala tocando ou na fila. */
  busy(): boolean;
}

// Um AudioContext para medir o volume do áudio vindo do servidor.
let audioCtx: AudioContext | null = null;

function meter(audio: HTMLAudioElement): AnalyserNode | null {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaElementSource(audio).connect(analyser);
    analyser.connect(audioCtx.destination);
    return analyser;
  } catch {
    return null;
  }
}

export function browserVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
}

export function createSpeaker(
  provider: TtsProvider,
  opts: {
    voiceName?: string;
    onStart?: () => void;
    onEnd?: () => void;
    /** Volume da fala de 0 a 1, a cada quadro, para animar a esfera. */
    onLevel?: (level: number) => void;
  } = {},
): Speaker {
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let generation = 0;
  let talking = false;
  let stopCurrent: (() => void) | null = null;

  // onStart só dispara quando o som realmente começa, não quando a frase entra na fila.
  const begin = () => {
    if (talking) return;
    talking = true;
    opts.onStart?.();
  };

  const speakBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      const voice = speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
      if (voice) u.voice = voice;

      // A voz do sistema não expõe o áudio, então o volume é estimado: um ritmo
      // de sílabas (~4,5 Hz) com ênfase em cada palavra que o navegador anuncia.
      let raf = 0;
      let accent = 0;
      const tick = (t: number) => {
        const syllable = 0.5 + 0.5 * Math.sin((t / 1000) * Math.PI * 9 + Math.sin(t / 370) * 2);
        accent *= 0.9;
        opts.onLevel?.(Math.min(1, 0.2 + 0.45 * syllable + accent));
        raf = requestAnimationFrame(tick);
      };
      const done = () => {
        cancelAnimationFrame(raf);
        opts.onLevel?.(0);
        stopCurrent = null;
        resolve();
      };
      u.onstart = () => {
        begin();
        raf = requestAnimationFrame(tick);
      };
      u.onboundary = (e) => {
        if (e.name === "word") accent = 0.45;
      };
      u.onend = u.onerror = done;
      stopCurrent = done;
      speechSynthesis.speak(u);
    });

  const speakServer = async (text: string) => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }));
      console.warn(`TTS ${provider} falhou (${error}); usando a voz do sistema.`);
      return speakBrowser(text);
    }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    const analyser = meter(audio);
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    let raf = 0;
    const tick = () => {
      analyser!.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      opts.onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 5));
      raf = requestAnimationFrame(tick);
    };
    await new Promise<void>((resolve) => {
      const done = () => {
        cancelAnimationFrame(raf);
        opts.onLevel?.(0);
        stopCurrent = null;
        resolve();
      };
      audio.onplaying = () => {
        begin();
        if (analyser) raf = requestAnimationFrame(tick);
      };
      audio.onended = audio.onerror = done;
      stopCurrent = () => {
        audio.pause();
        done();
      };
      void audio.play().catch(done);
    });
    URL.revokeObjectURL(url);
  };

  const speak = provider === "browser" ? speakBrowser : speakServer;

  return {
    say(text) {
      const clean = text.trim();
      if (!clean) return;
      const gen = generation;
      pending++;
      queue = queue
        .then(() => (gen === generation ? speak(clean) : undefined))
        .finally(() => {
          if (--pending > 0) return;
          talking = false;
          opts.onEnd?.();
        });
    },
    cancel() {
      generation++;
      speechSynthesis.cancel();
      stopCurrent?.();
    },
    idle: () => queue,
    busy: () => pending > 0,
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
