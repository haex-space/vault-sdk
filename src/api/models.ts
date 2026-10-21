import type { HaexVaultSdk } from "../client";
import { MODEL_COMMANDS } from "../commands/models";
import { MODEL_JOB_EVENTS } from "../events";
import type { EventCallback } from "../types";
import type { ExtensionModel, ModelJob, ModelJobCompletion } from "../types/models";

/**
 * Jobs on the host's language and vision models (holzi spec 055), instead of bringing own access
 * and keys. The extension describes each step with its instruction, input and the format of the
 * answer; the host picks a model the user allowed for this extension, caps the effort, drops
 * broken output and returns only a result that fits the format.
 *
 * The user decides at run time: the first job asks which model the extension may use and up to
 * which effort, and before data goes to a destination outside this device it asks for consent.
 * The SDK waits for these answers and starts the job again, like for every other permission.
 */
export class ModelsAPI {
  constructor(private client: HaexVaultSdk) {}

  /** The models the user allowed to this extension; empty without any. */
  async listAsync(): Promise<ExtensionModel[]> {
    const answer = await this.client.request<{ models: ExtensionModel[] }>(
      MODEL_COMMANDS.list,
      {},
    );
    return answer.models;
  }

  /** Starts a job; its end comes as {@link onCompleted}. Use {@link runAsync} to await it. */
  async startAsync(job: ModelJob): Promise<{ jobId: string }> {
    const answer = await this.client.request<{ jobId: string }>(MODEL_COMMANDS.start, {
      job,
    });
    return { jobId: answer.jobId };
  }

  /** Cancels a running job of this frame; `false` when it is unknown or already ended. */
  async cancelAsync(jobId: string): Promise<boolean> {
    const answer = await this.client.request<{ cancelled: boolean }>(MODEL_COMMANDS.cancel, {
      jobId,
    });
    return answer.cancelled;
  }

  /** Listens for the end of this frame's jobs. Returns an unsubscribe function. */
  onCompleted(handler: (completion: ModelJobCompletion) => void): () => void {
    const wrapped: EventCallback = (event) => {
      const data = (event as { data?: ModelJobCompletion }).data;
      if (data) handler(data);
    };
    this.client.on(MODEL_JOB_EVENTS.COMPLETED, wrapped);
    return () => this.client.off(MODEL_JOB_EVENTS.COMPLETED, wrapped);
  }

  /**
   * Starts a job and resolves with its end: `completed` with the result, or `failed` or
   * `cancelled` with the error. Errors of the start itself (an invalid job, a refused model or
   * consent, no fitting model) reject. The end can arrive before the start answers; it is kept
   * until then. Aborting `signal` cancels the job, which then ends as `cancelled`.
   */
  async runAsync(job: ModelJob, options: { signal?: AbortSignal } = {}): Promise<ModelJobCompletion> {
    const { signal } = options;
    const ended = new Map<string, ModelJobCompletion>();
    let waiting: { jobId: string; resolve: (c: ModelJobCompletion) => void } | null = null;
    const unsubscribe = this.onCompleted((completion) => {
      if (waiting && completion.jobId === waiting.jobId) waiting.resolve(completion);
      else ended.set(completion.jobId, completion);
    });
    let cancel: (() => void) | null = null;
    try {
      const { jobId } = await this.startAsync(job);
      cancel = () => void this.cancelAsync(jobId).catch(() => undefined);
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
      return await new Promise<ModelJobCompletion>((resolve) => {
        const early = ended.get(jobId);
        if (early) resolve(early);
        else waiting = { jobId, resolve };
      });
    } finally {
      if (cancel) signal?.removeEventListener("abort", cancel);
      unsubscribe();
    }
  }
}
