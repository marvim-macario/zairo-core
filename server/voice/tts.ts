import { spawn } from "node:child_process";
import { config, type TtsProvider } from "../config.js";

export interface SpeechAudio { contentType: string; body: Uint8Array<ArrayBuffer> }

/**
 * Converte texto em áudio no servidor. Com o provedor "browser" a fala é feita
 * pelo próprio navegador (speechSynthesis) e esta função não é chamada.
 */
export async function synthesize(text: string, provider: TtsProvider = config.tts): Promise<SpeechAudio> {
  switch (provider) {
    case "piper":
      return piper(text);
    case "elevenlabs":
      return elevenlabs(text);
    default:
      throw new Error(`O provedor ${provider} fala no navegador, não no servidor.`);
  }
}

// Piper: TTS neural local e gratuito (https://github.com/rhasspy/piper).
function piper(text: string): Promise<SpeechAudio> {
  if (!config.piper.model) throw new Error("Defina PIPER_MODEL com o caminho do modelo de voz .onnx");
  return new Promise((resolve, reject) => {
    const proc = spawn(config.piper.path, ["--model", config.piper.model, "--output_file", "-"]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => (stderr += c));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve({ contentType: "audio/wav", body: new Uint8Array(Buffer.concat(chunks)) })
        : reject(new Error(`piper saiu com código ${code}: ${stderr.trim()}`)),
    );
    proc.stdin.end(text);
  });
}

async function elevenlabs(text: string): Promise<SpeechAudio> {
  const { apiKey, voiceId, model } = config.elevenlabs;
  if (!apiKey || !voiceId) throw new Error("Defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!res.ok) throw new Error(`ElevenLabs respondeu ${res.status}: ${await res.text()}`);
  return { contentType: "audio/mpeg", body: new Uint8Array(await res.arrayBuffer()) };
}
