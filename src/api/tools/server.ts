/**
 * A minimal MCP server for the tools an extension offers to the agent of its host (holzi spec 018,
 * `contracts/mcp-port.md`). It speaks the part of MCP a host needs to list and call tools:
 * `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call` and
 * `notifications/cancelled`; every other request is answered with "method not found". It sends no
 * request of its own, so it never asks the host for anything.
 *
 * Titles, descriptions and schemas come from the signed manifest; the extension's code only names a
 * handler per tool. A tool runs only when it is declared and has a handler, and only with input
 * that fits its schema.
 */
import type { ExtensionManifest } from "../../types";
import { validateInput, type JsonSchema } from "./schema";

/** The MCP version of the tool connection; the host pins the same (holzi `link.rs`). */
export const PROTOCOL_VERSION = "2025-11-25";

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export type JsonRpcId = string | number;
export type JsonRpcMessage = Record<string, unknown>;

/** What a handler gets besides its input. */
export interface ToolContext {
  /** Aborted when the host cancels the call, for example because the user stopped the turn. */
  signal: AbortSignal;
}

/**
 * Runs one tool. A string is returned as text, anything else as JSON text; a thrown error becomes
 * a tool error the agent sees.
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext,
) => unknown | Promise<unknown>;

export interface ToolsServerOptions {
  manifest: ExtensionManifest | undefined;
  handlers: ReadonlyMap<string, ToolHandler>;
  /** Sends one JSON-RPC message to the host. */
  send: (message: JsonRpcMessage) => void;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError: boolean };

function textResult(text: string, isError: boolean): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number";
}

export class ToolsServer {
  private readonly running = new Map<JsonRpcId, AbortController>();

  constructor(private readonly options: ToolsServerOptions) {}

  /**
   * Handles one JSON-RPC message from the host. A tool call runs on its own and answers when it is
   * done, so a long call never holds up `ping` or the cancellation of that very call.
   */
  async receive(message: unknown): Promise<void> {
    if (typeof message !== "object" || message === null) return;
    const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown };
    if (typeof method !== "string") return; // a response; the server sends no requests
    const args = (typeof params === "object" && params !== null ? params : {}) as Record<
      string,
      unknown
    >;

    if (!isId(id)) {
      if (method === "notifications/cancelled" && isId(args.requestId)) {
        this.running.get(args.requestId)?.abort();
      }
      return;
    }
    switch (method) {
      case "initialize":
        return this.reply(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: this.options.manifest?.name ?? "",
            version: this.options.manifest?.version ?? "",
          },
        });
      case "ping":
        return this.reply(id, {});
      case "tools/list": {
        const tools = this.tools().map(({ name, title, description, inputSchema }) => ({
          name,
          title: title.en,
          description,
          inputSchema,
        }));
        return this.reply(id, { tools });
      }
      case "tools/call":
        void this.call(id, args);
        return;
      default:
        return this.error(id, METHOD_NOT_FOUND, method);
    }
  }

  /** The declared tools that have a handler. */
  private tools() {
    return (this.options.manifest?.tools ?? []).filter((tool) => this.options.handlers.has(tool.name));
  }

  private async call(id: JsonRpcId, params: Record<string, unknown>): Promise<void> {
    const tool = this.tools().find((candidate) => candidate.name === params.name);
    const handler = tool && this.options.handlers.get(tool.name);
    if (!tool || !handler) return this.error(id, INVALID_PARAMS, `unknown tool ${String(params.name)}`);

    const input = params.arguments ?? {};
    const checked = validateInput(tool.inputSchema as JsonSchema, input);
    if (!checked.ok) {
      return this.reply(id, textResult(`invalid input: ${checked.field}: ${checked.message}`, true));
    }

    const controller = new AbortController();
    this.running.set(id, controller);
    let result: ToolResult;
    try {
      const output = await handler(input as Record<string, unknown>, { signal: controller.signal });
      result = textResult(asText(output), false);
    } catch (error) {
      result = textResult(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.running.delete(id);
    }
    // A cancelled call gets no answer: the host has stopped waiting for it.
    if (!controller.signal.aborted) this.reply(id, result);
  }

  private reply(id: JsonRpcId, result: unknown): void {
    this.options.send({ jsonrpc: "2.0", id, result });
  }

  private error(id: JsonRpcId, code: number, message: string): void {
    this.options.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
