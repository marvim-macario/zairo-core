import { describe, expect, it } from "vitest";
import { SentenceBuffer } from "../web/src/tts.js";

describe("SentenceBuffer", () => {
  it("libera frases completas conforme o texto chega", () => {
    const b = new SentenceBuffer();
    expect(b.push("Bom dia, Mar")).toEqual([]);
    expect(b.push("cos. Hoje faz 25 graus")).toEqual(["Bom dia, Marcos."]);
    expect(b.push(" em São Paulo! Quer ")).toEqual(["Hoje faz 25 graus em São Paulo!"]);
    expect(b.flush()).toBe("Quer");
  });

  it("não corta antes de saber se a frase acabou", () => {
    const b = new SentenceBuffer();
    expect(b.push("São 3.")).toEqual([]);
    expect(b.push("5 graus.")).toEqual([]);
    expect(b.flush()).toBe("São 3.5 graus.");
  });
});
