import { memory } from "./memory.js";
import { emit } from "./events.js";

// Verifica a cada poucos segundos se algum lembrete venceu.
export function startReminderLoop(intervalMs = 5000) {
  return setInterval(() => {
    const due = memory.reminders().filter((r) => new Date(r.dueAt).getTime() <= Date.now());
    for (const r of due) {
      memory.completeReminder(r.id);
      emit({ type: "reminder", id: r.id, text: r.text });
    }
  }, intervalMs);
}
