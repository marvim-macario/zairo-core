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
  let current: HTMLAudioElement | null = null;

  const speakBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      const voice = speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
      if (voice) u.voice = voice;
      u.onend = u.onerror = () => resolve();
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
    current = new Audio(url);
    await new Promise<void>((resolve) => {
      current!.onended = current!.onerror = () => resolve();
      void current!.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    current = null;
  };

  const speak = provider === "browser" ? speakBrowser : speakServer;

  return {
    say(text) {
      const clean = text.trim();
      if (!clean) return;
      const gen = generation;
      if (pending++ === 0) opts.onStart?.();
      queue = queue
        .then(() => (gen === generation ? speak(clean) : undefined))
        .finally(() => {
          if (--pending === 0) opts.onEnd?.();
        });
    },
    cancel() {
      generation++;
      speechSynthesis.cancel();
      current?.pause();
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
