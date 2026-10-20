import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export interface Fact { id: string; text: string; createdAt: string }
export interface Note { id: string; text: string; createdAt: string }
export interface Reminder { id: string; text: string; dueAt: string; done: boolean }

interface Store { facts: Fact[]; notes: Note[]; reminders: Reminder[] }

const file = join(config.dataDir, "memory.json");

function load(): Store {
  if (!existsSync(file)) return { facts: [], notes: [], reminders: [] };
  return JSON.parse(readFileSync(file, "utf8")) as Store;
}

let store = load();

function save() {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2));
}

const now = () => new Date().toISOString();
const shortId = () => randomUUID().slice(0, 8);

export const memory = {
  facts: () => store.facts,
  addFact(text: string): Fact {
    const fact = { id: shortId(), text, createdAt: now() };
    store.facts.push(fact);
    save();
    return fact;
  },
  removeFact(id: string): boolean {
    const before = store.facts.length;
    store.facts = store.facts.filter((f) => f.id !== id);
    save();
    return store.facts.length < before;
  },

  notes: () => store.notes,
  addNote(text: string): Note {
    const note = { id: shortId(), text, createdAt: now() };
    store.notes.push(note);
    save();
    return note;
  },

  reminders: () => store.reminders.filter((r) => !r.done),
  addReminder(text: string, dueAt: Date): Reminder {
    const reminder = { id: shortId(), text, dueAt: dueAt.toISOString(), done: false };
    store.reminders.push(reminder);
    save();
    return reminder;
  },
  completeReminder(id: string): boolean {
    const r = store.reminders.find((x) => x.id === id && !x.done);
    if (!r) return false;
    r.done = true;
    save();
    return true;
  },

  /** Só para testes. */
  reset() {
    store = { facts: [], notes: [], reminders: [] };
  },
};
