import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export interface ZairoTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<unknown> | unknown;
}

export function defineTool<S extends z.ZodType>(tool: ZairoTool<S>): ZairoTool<S> {
  return tool;
}

export function toApiTool(tool: ZairoTool): Anthropic.Beta.BetaTool {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  };
}
