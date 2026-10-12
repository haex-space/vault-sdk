/**
 * `sdk.tools`: tools an extension offers to the agent of its host (holzi spec 018). Each tool is
 * declared in the signed manifest (`tools`) with its title, description, input schema and effect;
 * the extension's code only registers the function that runs it:
 *
 * ```ts
 * sdk.tools.register("count_unread", async (input, { signal }) => countUnread(input.role, signal));
 * ```
 *
 * The host lists and calls the tools over MCP on the extension's port (`ToolsServer`). A call runs
 * only for a declared tool with input that fits its schema; the host's approval of the call
 * follows the declared effect.
 */
import type { ExtensionManifest } from "../../types";
import { ToolsServer, type JsonRpcMessage, type ToolHandler } from "./server";

export type { ToolContext, ToolHandler } from "./server";

export interface ToolsApiOptions {
  /** The manifest the SDK was built with; its `tools` are what may be registered. */
  manifest: () => ExtensionManifest | undefined;
  /** Sends one MCP message to the host on the extension's port. */
  send: (message: JsonRpcMessage) => void;
}

export class ToolsAPI {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly server: ToolsServer;

  constructor(private readonly options: ToolsApiOptions) {
    const manifest = options.manifest;
    this.server = new ToolsServer({
      get manifest() {
        return manifest();
      },
      handlers: this.handlers,
      send: options.send,
    });
  }

  /**
   * Runs `handler` when the host calls the tool `name`. The tool must be declared in the manifest.
   * Returns a function that unregisters the handler; the host then no longer sees the tool.
   */
  register(name: string, handler: ToolHandler): () => void {
    const declared = this.options.manifest()?.tools?.some((tool) => tool.name === name) ?? false;
    if (!declared) {
      throw new Error(`The tool ${name} is not declared in the manifest's tools`);
    }
    this.handlers.set(name, handler);
    return () => {
      if (this.handlers.get(name) === handler) this.handlers.delete(name);
    };
  }

  /** Handles one MCP message from the host. Called by the SDK for `haexspace:mcp` port messages. */
  receive(message: unknown): Promise<void> {
    return this.server.receive(message);
  }
}
