import { z } from "zod";
import { config } from "../config.js";
import { defineTool } from "./types.js";

export const getDatetime = defineTool({
  name: "get_datetime",
  description: "Retorna a data e a hora atuais no fuso do usuário.",
  schema: z.object({}),
  run: () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString("pt-BR", { timeZone: config.timezone, dateStyle: "full", timeStyle: "short" }),
      timezone: config.timezone,
    };
  },
});
