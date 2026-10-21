import { z } from "zod";
import { memory } from "../memory.js";
import { defineTool } from "./types.js";

export const remember = defineTool({
  name: "remember",
  description: "Guarda um fato duradouro sobre o usuário (preferências, pessoas, rotinas) para lembrar em conversas futuras.",
  schema: z.object({ fact: z.string().min(1).describe("O fato, em uma frase curta") }),
  run: ({ fact }) => memory.addFact(fact),
});

export const forget = defineTool({
  name: "forget",
  description: "Apaga um fato guardado, pelo id mostrado entre colchetes no que você já sabe.",
  schema: z.object({ id: z.string() }),
  run: ({ id }) => ({ removed: memory.removeFact(id) }),
});

export const addNote = defineTool({
  name: "add_note",
  description: "Salva uma anotação rápida ditada pelo usuário.",
  schema: z.object({ text: z.string().min(1) }),
  run: ({ text }) => memory.addNote(text),
});

export const listNotes = defineTool({
  name: "list_notes",
  description: "Lista as anotações salvas, das mais recentes para as mais antigas.",
  schema: z.object({ limit: z.number().int().positive().max(50).optional() }),
  run: ({ limit }) => memory.notes().slice().reverse().slice(0, limit ?? 10),
});
