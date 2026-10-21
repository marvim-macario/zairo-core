export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export type ServerEvent = { type: "reminder"; id: string; text: string } | { type: "open_url"; url: string };

/** Lê um corpo text/event-stream e entrega cada evento já convertido de JSON. */
async function readSSE<T>(body: ReadableStream<Uint8Array<ArrayBuffer>>, onEvent: (e: T) => void) {
  const reader = body.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array<ArrayBuffer>>).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as T);
    }
  }
}

export async function chat(text: string, onEvent: (e: ChatEvent) => void) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new Error(`Servidor respondeu ${res.status}`);
  await readSSE(res.body, onEvent);
}

export function resetConversation() {
  return fetch("/api/reset", { method: "POST" });
}

export function listenServerEvents(onEvent: (e: ServerEvent) => void) {
  const source = new EventSource("/api/events");
  for (const type of ["reminder", "open_url"]) {
    source.addEventListener(type, (e) => onEvent(JSON.parse((e as MessageEvent).data) as ServerEvent));
  }
  return source;
}
