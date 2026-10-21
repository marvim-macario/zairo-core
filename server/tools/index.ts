import type Anthropic from "@anthropic-ai/sdk";
import { getDatetime } from "./clock.js";
import { getWeather } from "./weather.js";
import { remember, forget, addNote, listNotes } from "./memory.js";
import { setReminder, listReminders, cancelReminder } from "./reminders.js";
import { openUrl } from "./browser.js";
import { toApiTool, type ZairoTool } from "./types.js";

// Para adicionar uma integração (Google, Notion, Spotify...), crie o arquivo
// da ferramenta e inclua aqui.
export const tools: ZairoTool<any>[] = [
  getDatetime,
  getWeather,
  remember,
  forget,
  addNote,
  listNotes,
  setReminder,
  listReminders,
  cancelReminder,
  openUrl,
];

const byName = new Map(tools.map((t) => [t.name, t]));

export const apiTools: Anthropic.Beta.BetaToolUnion[] = [
  ...tools.map(toApiTool),
  // Busca na web executada pelos servidores da Anthropic.
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
];

export async function runTool(name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = byName.get(name);
  if (!tool) return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { content: `Entrada inválida: ${parsed.error.message}`, isError: true };
  try {
    const result = await tool.run(parsed.data);
    return { content: JSON.stringify(result ?? { ok: true }), isError: false };
  } catch (err) {
    return { content: `Erro ao executar ${name}: ${(err as Error).message}`, isError: true };
  }
}
