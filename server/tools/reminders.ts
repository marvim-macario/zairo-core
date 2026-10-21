import { z } from "zod";
import { memory } from "../memory.js";
import { defineTool } from "./types.js";

export const setReminder = defineTool({
  name: "set_reminder",
  description:
    "Cria um lembrete ou timer. Informe in_minutes (relativo) ou at (data/hora ISO 8601 com fuso). Para horários absolutos, consulte get_datetime antes.",
  schema: z.object({
    text: z.string().min(1).describe("O que lembrar"),
    in_minutes: z.number().positive().optional(),
    at: z.string().optional().describe("Data/hora ISO 8601, ex.: 2026-10-21T09:00:00-03:00"),
  }),
  run: ({ text, in_minutes, at }) => {
    const due = in_minutes !== undefined ? new Date(Date.now() + in_minutes * 60_000) : at ? new Date(at) : null;
    if (!due || Number.isNaN(due.getTime())) return { error: "Informe in_minutes ou uma data válida em at." };
    return memory.addReminder(text, due);
  },
});

export const listReminders = defineTool({
  name: "list_reminders",
  description: "Lista os lembretes pendentes.",
  schema: z.object({}),
  run: () => memory.reminders(),
});

export const cancelReminder = defineTool({
  name: "cancel_reminder",
  description: "Cancela um lembrete pendente pelo id.",
  schema: z.object({ id: z.string() }),
  run: ({ id }) => ({ cancelled: memory.completeReminder(id) }),
});
