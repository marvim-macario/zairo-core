import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ZAIRO_DATA_DIR = mkdtempSync(join(tmpdir(), "zairo-"));

const { runTool, apiTools } = await import("../server/tools/index.js");
const { memory } = await import("../server/memory.js");
const { bus } = await import("../server/events.js");

describe("ferramentas", () => {
  beforeEach(() => memory.reset());

  it("expõe esquemas JSON válidos e a busca na web", () => {
    const names = apiTools.map((t) => ("name" in t ? t.name : t.type));
    expect(names).toContain("web_search");
    const reminder = apiTools.find((t) => "name" in t && t.name === "set_reminder") as { input_schema: { type: string; required: string[] } };
    expect(reminder.input_schema.type).toBe("object");
    expect(reminder.input_schema.required).toEqual(["text"]);
  });

  it("guarda e apaga fatos", async () => {
    const saved = JSON.parse((await runTool("remember", { fact: "Gosta de café sem açúcar" })).content);
    expect(memory.facts()).toHaveLength(1);
    await runTool("forget", { id: saved.id });
    expect(memory.facts()).toHaveLength(0);
  });

  it("cria lembrete relativo e rejeita lembrete sem horário", async () => {
    const ok = await runTool("set_reminder", { text: "beber água", in_minutes: 10 });
    expect(ok.isError).toBe(false);
    const due = new Date(JSON.parse(ok.content).dueAt).getTime();
    expect(due - Date.now()).toBeGreaterThan(9 * 60_000);
    const bad = await runTool("set_reminder", { text: "sem hora" });
    expect(JSON.parse(bad.content).error).toBeDefined();
  });

  it("valida a entrada antes de executar", async () => {
    const res = await runTool("open_url", { url: "javascript:alert(1)" });
    expect(res.isError).toBe(true);
    const listener = vi.fn();
    bus.on("event", listener);
    await runTool("open_url", { url: "https://open.spotify.com" });
    expect(listener).toHaveBeenCalledWith({ type: "open_url", url: "https://open.spotify.com" });
  });

  it("responde com erro para ferramenta desconhecida", async () => {
    expect((await runTool("nao_existe", {})).isError).toBe(true);
  });
});
