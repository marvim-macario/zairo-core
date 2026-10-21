# zairo-core

ZAIRO é um assistente inteligente concebido para existir como presença, não como ruído. Ele observa, aprende e age apenas quando necessário.

Interface web com a esfera holográfica, cérebro no Claude e voz local e gratuita, com a opção de trocar para ElevenLabs.

## Como rodar

Requer Node 22 ou mais novo.

```bash
npm install
cp .env.example .env   # coloque sua ANTHROPIC_API_KEY
npm run dev            # servidor em :8787 e interface em http://localhost:5173
```

Para produção: `npm run build && npm start` e abra http://localhost:8787.

Use o Chrome ou o Edge. Clique no microfone (ou segure Espaço) para falar, ou digite na barra.

## O que o Zairo já faz

- Conversa em português com o Claude, respondendo de forma curta para ser falada.
- Hora e data, clima (Open-Meteo, sem chave), busca na web.
- Memória de longo prazo ("Zairo, lembra que eu prefiro café sem açúcar").
- Anotações rápidas, lembretes e timers que ele fala quando vencem.
- Abre sites no navegador.

## Voz

| | Opção | Custo | Onde roda |
|---|---|---|---|
| Ouvir | **Whisper** (padrão) | grátis | no navegador, via Transformers.js. O modelo (~150 MB) é baixado na primeira vez e fica em cache |
| Ouvir | Web Speech | grátis | serviço do navegador |
| Falar | **Voz do sistema** (padrão) | grátis | vozes instaladas no seu sistema |
| Falar | Piper | grátis | no servidor, voz neural local. Veja a instalação abaixo |
| Falar | ElevenLabs | pago | nuvem. Preencha `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` |

A escolha é feita no ⚙ da interface; o padrão vem de `ZAIRO_TTS` no `.env`. Se o Piper ou a ElevenLabs falharem, ele volta para a voz do sistema.

Com Piper ou ElevenLabs, o anel da esfera segue o volume real do áudio. Com a voz do sistema o navegador não expõe o som, então o anel pulsa a cada palavra.

### Instalar o Piper (Linux/WSL)

```bash
mkdir -p ~/.local/share/piper/voices && cd ~/.local/share/piper
curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xz
cd voices
V=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/faber/medium
curl -fsSLO $V/pt_BR-faber-medium.onnx && curl -fsSLO $V/pt_BR-faber-medium.onnx.json
```

No `.env`:

```
ZAIRO_TTS=piper
PIPER_PATH=/home/<você>/.local/share/piper/piper/piper
PIPER_MODEL=/home/<você>/.local/share/piper/voices/pt_BR-faber-medium.onnx
```

Outras vozes pt_BR estão em [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/pt/pt_BR) (por exemplo `cadu` e `jeff`).

## Estrutura

```
server/
  index.ts        API HTTP (Hono): /api/chat (SSE), /api/tts, /api/events, /api/reset
  agent.ts        loop do agente: Claude + ferramentas, com streaming
  persona.ts      personalidade e o que ele sabe sobre você
  memory.ts       fatos, notas e lembretes em data/memory.json
  reminders.ts    dispara os lembretes vencidos
  tools/          uma ferramenta por arquivo; registre em tools/index.ts
  voice/tts.ts    Piper e ElevenLabs
web/
  index.html, main.js, shaders.js   a esfera (Three.js) e a detecção de rosto
  src/zairo.ts    liga chat, microfone e voz à esfera
  src/stt.ts      Whisper local e Web Speech
  src/tts.ts      voz do sistema, Piper e ElevenLabs
tests/            vitest
```

## Próximos passos

1. Google Agenda e Gmail
2. Notion
3. Spotify
4. WhatsApp
5. Casa inteligente (Home Assistant)
6. Palavra de ativação "Zairo" sem precisar apertar nada
