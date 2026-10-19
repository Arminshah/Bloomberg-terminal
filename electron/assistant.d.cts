export const MODEL: string;
export const SYSTEM: string;
export interface ToolDef {
  name: string;
  description: string;
  strict: boolean;
  input_schema: { type: 'object'; properties: Record<string, { type: string; description: string; enum?: string[] }>; required: string[]; additionalProperties: boolean };
}
export const TOOLS: ToolDef[];
export const TOOL_NAMES: Set<string>;
export function checkMessages(messages: unknown): string | null;
export function ask(client: unknown, messages: unknown[]): Promise<{ content: unknown[]; stopReason: string | null; model: string }>;
export function errorText(err: unknown, key?: string): string;
