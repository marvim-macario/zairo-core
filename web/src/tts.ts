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

// Duração aproximada de cada letra falada pela voz do sistema (velocidade normal).
const MS_PER_CHAR = 70;

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

      // A voz do sistema não expõe o áudio, então não há volume real. O nível segue
      // só os eventos de palavra: um pulso por palavra, com duração proporcional
      // ao tamanho dela, e zero nas pausas.
      let raf = 0;
      let fallback = 0;
      let wordStart = 0;
      let wordLength = 0;
      const tick = (t: number) => {
        const p = (t - wordStart) / wordLength;
        opts.onLevel?.(p >= 0 && p < 1 ? 0.85 * Math.sin(Math.PI * p) : 0);
        raf = requestAnimationFrame(tick);
      };
      const done = () => {
        cancelAnimationFrame(raf);
        clearTimeout(fallback);
        opts.onLevel?.(0);
        stopCurrent = null;
        resolve();
      };
      // onstart chega ~0,5 s antes do som; o som começa de fato na primeira
      // palavra. Se a voz não anunciar palavras, começa assim mesmo.
      u.onstart = () => {
        raf = requestAnimationFrame(tick);
        fallback = window.setTimeout(begin, 800);
      };
      u.onboundary = (e) => {
        if (e.name !== "word") return;
        clearTimeout(fallback);
        begin();
        const length = e.charLength || (/^\S+/.exec(text.slice(e.charIndex))?.[0].length ?? 4);
        wordStart = performance.now();
        wordLength = Math.max(120, length * MS_PER_CHAR);
      };
      u.onend = u.onerror = done;
      stopCurrent = done;
      speechSynthesis.speak(u);
    });

  // Pede o áudio assim que a frase chega, para que a próxima já esteja pronta
  // quando a anterior terminar de tocar (sem pausa entre frases).
  const fetchServer = async (text: string): Promise<Blob | null> => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider }),
      });
      if (res.ok) return await res.blob();
      const { error } = await res.json().catch(() => ({ error: res.statusText }));
      console.warn(`TTS ${provider} falhou (${error}); usando a voz do sistema.`);
    } catch (err) {
      console.warn(`TTS ${provider} falhou (${(err as Error).message}); usando a voz do sistema.`);
    }
    return null;
  };

  const speakServer = async (text: string, audioBlob: Promise<Blob | null>) => {
    const blob = await audioBlob;
    if (!blob) return speakBrowser(text);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const analyser = meter(audio);
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    let raf = 0;
    const tick = () => {
      analyser!.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3);
      // "Falando" começa com o primeiro som audível, não com o evento "playing"
      if (level > 0.03) begin();
      opts.onLevel?.(level);
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
        if (analyser) raf = requestAnimationFrame(tick);
        else begin();
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

  return {
    say(text) {
      const clean = text.trim();
      if (!clean) return;
      const gen = generation;
      pending++;
      const audioBlob = provider === "browser" ? null : fetchServer(clean);
      const speak = () => (audioBlob ? speakServer(clean, audioBlob) : speakBrowser(clean));
      queue = queue
        .then(() => (gen === generation ? speak() : undefined))
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
