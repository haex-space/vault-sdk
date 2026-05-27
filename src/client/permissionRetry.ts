/**
 * Auto-retry support for runtime permission prompts.
 *
 * When an extension calls a permission-gated host command without a granted
 * permission, the host returns a PromptRequired (1004) error and shows the
 * user a prompt. After the user decides, the host emits a
 * `permission-resolved` event to the extension's webview. This module lets
 * `client.request()` wait for that decision and transparently retry the
 * original call on grant — so extension code never has to handle prompts.
 */

import {
  isPermissionPromptError,
  type PermissionPromptError,
  type PermissionDeniedError,
  PermissionErrorCode,
} from "../types";

/** Outcome of waiting for a permission decision. */
export type WaitOutcome = "granted" | "denied" | "timeout";

/** Default time to wait for the user to answer a prompt before giving up. */
export const PERMISSION_DECISION_TIMEOUT_MS = 5 * 60 * 1000;

/** Max number of prompt→retry cycles for a single request (guards against loops). */
export const MAX_PERMISSION_RETRIES = 3;

/** Stable key identifying a permission, shared by the error and the event. */
export function permissionKey(resourceType: string, action: string, target: string): string {
  return `${resourceType}:${action}:${target}`;
}

/** Payload of the `permission-resolved` event (camelCase from the host). */
export interface PermissionResolvedData {
  extensionId?: string;
  resourceType: string;
  action: string;
  target: string;
  decision: "granted" | "denied";
}

/**
 * Tracks in-flight requests waiting for a permission decision, keyed by
 * `resourceType:action:target`. Multiple concurrent requests needing the same
 * permission all resolve from a single decision.
 */
export class PermissionWaiterRegistry {
  private waiters = new Map<string, Set<(outcome: WaitOutcome) => void>>();

  /** Wait for a decision on `key`; resolves "timeout" if none arrives in time. */
  wait(key: string, timeoutMs: number = PERMISSION_DECISION_TIMEOUT_MS): Promise<WaitOutcome> {
    return new Promise<WaitOutcome>((resolve) => {
      const set = this.waiters.get(key) ?? new Set();
      this.waiters.set(key, set);

      const settle = (outcome: WaitOutcome) => {
        if (!set.has(callback)) return;
        set.delete(callback);
        if (set.size === 0) this.waiters.delete(key);
        clearTimeout(timer);
        resolve(outcome);
      };
      const callback = (outcome: WaitOutcome) => settle(outcome);
      const timer = setTimeout(() => settle("timeout"), timeoutMs);

      set.add(callback);
    });
  }

  /** Resolve everyone waiting on `key` with the user's decision. */
  resolve(key: string, decision: "granted" | "denied"): void {
    const set = this.waiters.get(key);
    if (!set) return;
    // Snapshot, then notify — callbacks mutate the set as they settle.
    for (const callback of [...set]) callback(decision);
  }
}

/** Build a PermissionDeniedError (code 1002) from the prompt error. */
function toDeniedError(error: PermissionPromptError): PermissionDeniedError {
  return { ...error, code: PermissionErrorCode.DENIED };
}

/**
 * Run `send` and, if it fails with a PromptRequired error, wait for the user's
 * decision and retry on grant. Throws a PermissionDenied error on denial, and
 * re-throws the original prompt error on timeout or after exhausting retries.
 */
export async function withPermissionRetry<T>(
  send: () => Promise<T>,
  registry: PermissionWaiterRegistry,
  log: (...args: unknown[]) => void,
  timeoutMs: number = PERMISSION_DECISION_TIMEOUT_MS
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (!isPermissionPromptError(error) || attempt >= MAX_PERMISSION_RETRIES) {
        throw error;
      }
      const key = permissionKey(error.resourceType, error.action, error.target);
      log(`Permission prompt required for ${key} — waiting for user decision`);
      const outcome = await registry.wait(key, timeoutMs);
      if (outcome === "granted") {
        log(`Permission ${key} granted — retrying request`);
        continue;
      }
      if (outcome === "denied") {
        log(`Permission ${key} denied`);
        throw toDeniedError(error);
      }
      log(`Permission ${key} prompt timed out`);
      throw error;
    }
  }
}
