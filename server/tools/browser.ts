import { z } from "zod";
import { emit } from "../events.js";
import { defineTool } from "./types.js";

export const openUrl = defineTool({
  name: "open_url",
  description: "Abre um site em uma nova aba do navegador do usuário (YouTube, Spotify Web, mapas, etc.).",
  schema: z.object({ url: z.url({ protocol: /^https?$/ }) }),
  run: ({ url }) => {
    emit({ type: "open_url", url });
    return { opened: url };
  },
});
