import "./env.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { config, type TtsProvider } from "./config.js";
import { Conversation } from "./agent.js";
import { bus, type ZairoEvent } from "./events.js";
import { startReminderLoop } from "./reminders.js";
import { synthesize } from "./voice/tts.js";

const app = new Hono();
const conversation = new Conversation();

app.get("/api/config", (c) => c.json({ userName: config.userName, tts: config.tts }));

app.post("/api/chat", async (c) => {
  const body = z.object({ text: z.string().min(1).max(4000) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Envie { text }" }, 400);

  return streamSSE(c, async (stream) => {
    // Encadeia as escritas para manter a ordem e garantir que todas saiam antes de fechar.
    let writes = Promise.resolve();
    try {
      await conversation.send(body.data.text, (event) => {
        writes = writes.then(() => stream.writeSSE({ event: event.type, data: JSON.stringify(event) }));
      });
      await writes;
    } catch (err) {
      await writes;
      console.error(err);
      await stream.writeSSE({ event: "error", data: JSON.stringify({ type: "error", message: (err as Error).message }) });
    }
  });
});

app.post("/api/reset", (c) => {
  conversation.reset();
  return c.json({ ok: true });
});

app.post("/api/tts", async (c) => {
  const body = z
    .object({ text: z.string().min(1).max(5000), provider: z.enum(["piper", "elevenlabs"]).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Envie { text }" }, 400);
  try {
    const audio = await synthesize(body.data.text, body.data.provider as TtsProvider | undefined);
    return c.body(audio.body, 200, { "Content-Type": audio.contentType });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Canal contínuo para eventos que não nascem de uma pergunta (ex.: lembretes).
app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    const listener = (event: ZairoEvent) => void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
    bus.on("event", listener);
    stream.onAbort(() => {
      bus.off("event", listener);
    });
    while (!stream.aborted) await stream.sleep(25_000).then(() => stream.writeSSE({ event: "ping", data: "" }));
  }),
);

// Em produção, serve a interface já compilada.
app.use("/*", serveStatic({ root: "./dist/web" }));

startReminderLoop();
serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Zairo ouvindo em http://localhost:${port} (modelo ${config.model}, voz ${config.tts})`);
});
