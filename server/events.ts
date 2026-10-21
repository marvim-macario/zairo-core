import { EventEmitter } from "node:events";

// Eventos que o servidor empurra para a interface fora de uma conversa
// (lembretes disparando, pedidos para abrir um site etc.).
export type ZairoEvent =
  | { type: "reminder"; id: string; text: string }
  | { type: "open_url"; url: string };

export const bus = new EventEmitter();

export function emit(event: ZairoEvent) {
  bus.emit("event", event);
}
