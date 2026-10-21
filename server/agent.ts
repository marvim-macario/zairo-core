import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { memory } from "./memory.js";
import { systemPrompt } from "./persona.js";
import { apiTools, runTool } from "./tools/index.js";

export type TurnEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

const MAX_STEPS = 8;
const IDLE_RESET_MS = 30 * 60_000;

/**
 * Uma conversa com o Zairo. O histórico só cresce (nunca é editado), o que
 * mantém o cache de prompt e os blocos de raciocínio válidos; para recomeçar,
 * crie uma nova conversa com reset().
 */
export class Conversation {
  private client: Anthropic;
  private messages: Anthropic.Beta.BetaMessageParam[] = [];
  private system = systemPrompt(memory.facts());
  private lastActivity = Date.now();

  constructor(client = new Anthropic()) {
    this.client = client;
  }

  reset() {
    this.messages = [];
    this.system = systemPrompt(memory.facts());
  }

  async send(userText: string, onEvent: (e: TurnEvent) => void): Promise<void> {
    if (Date.now() - this.lastActivity > IDLE_RESET_MS) this.reset();
    this.lastActivity = Date.now();

    this.messages.push({ role: "user", content: userText });
    let spoken = "";

    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = this.client.beta.messages.stream({
        model: config.model,
        max_tokens: 16000,
        system: this.system,
        messages: this.messages,
        tools: apiTools,
        output_config: { effort: config.effort },
        cache_control: { type: "ephemeral" },
        // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      stream.on("text", (delta) => {
        spoken += delta;
        onEvent({ type: "text", delta });
      });

      const message = await stream.finalMessage();
      this.messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") {
        onEvent({ type: "done", text: spoken || "Desculpe, não posso ajudar com isso." });
        return;
      }
      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        onEvent({ type: "done", text: spoken });
        return;
      }
      if (message.stop_reason === "max_tokens") {
        onEvent({ type: "error", message: "Resposta cortada no limite de tokens." });
        return;
      }

      const results = await Promise.all(
        toolUses.map(async (use) => {
          onEvent({ type: "tool", name: use.name });
          const { content, isError } = await runTool(use.name, use.input);
          return { type: "tool_result" as const, tool_use_id: use.id, content, is_error: isError };
        }),
      );
      this.messages.push({ role: "user", content: results });
      if (spoken && !/\s$/.test(spoken)) {
        spoken += " ";
        onEvent({ type: "text", delta: " " });
      }
    }

    onEvent({ type: "error", message: "Muitos passos de ferramentas nesta resposta." });
  }
}
