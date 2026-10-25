import type { HaexVaultSdk } from "../client";
import { MODEL_COMMANDS } from "../commands/models";
import { MODEL_JOB_EVENTS } from "../events";
import type { EventCallback } from "../types";
import type {
  ExtensionModel,
  ModelAccessRequest,
  ModelJob,
  ModelJobCompletion,
} from "../types/models";

/**
 * Jobs on the host's language and vision models (holzi spec 055), instead of bringing own access
 * and keys. The extension describes each step with its instruction, input and the format of the
 * answer; the host picks a model the user allowed for this extension, runs it with the effort the
 * user chose for it (an extension names none), drops broken output and returns only a result that
 * fits the format.
 *
 * The user decides at run time: the first job asks which model the extension may use and with
 * which effort, and before data goes to a destination outside this device it asks for consent.
 * The SDK waits for these answers and starts the job again, like for every other permission. The
 * choice stays with the host: {@link requestAccessAsync} asks before the first job, and
 * {@link openSettingsAsync} leads the user to the host's page of this extension's models.
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

  /**
   * Asks for a grant before the first job (holzi spec 055 US9) and resolves with the allowed
   * models that fit `needs`. Without one, the host asks the user as it would for a job, and the
   * SDK waits for the answer. Rejects with `no_capable_model` (8001) when no model of the host
   * fits and with a denial (1002) when the user refused. Nothing is sent to a model, and consent
   * for a destination outside this device is asked with the first job that sends data.
   */
  async requestAccessAsync(request: ModelAccessRequest): Promise<ExtensionModel[]> {
    const answer = await this.client.request<{ models: ExtensionModel[] }>(
      MODEL_COMMANDS.requestAccess,
      { ...request },
    );
    return answer.models;
  }

  /** Opens the host's page of this extension's models, where the user chooses models and effort. */
  async openSettingsAsync(): Promise<void> {
    await this.client.request(MODEL_COMMANDS.openSettings, {});
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
   * until then.
   *
   * Aborting `signal` asks to cancel the job, which then ends as `cancelled`; a job that had
   * already ended keeps its actual end. A signal that is already aborted rejects with its reason
   * and starts no job. If the cancel request fails, the run rejects with that error and the job
   * keeps running on the host; if it reports an unknown job, the run rejects with an error.
   */
  async runAsync(job: ModelJob, options: { signal?: AbortSignal } = {}): Promise<ModelJobCompletion> {
    const { signal } = options;
    if (signal?.aborted) throw signal.reason;
    const ended = new Map<string, ModelJobCompletion>();
    let waiting: { jobId: string; resolve: (c: ModelJobCompletion) => void } | null = null;
    const unsubscribe = this.onCompleted((completion) => {
      if (waiting && completion.jobId === waiting.jobId) waiting.resolve(completion);
      else ended.set(completion.jobId, completion);
    });
    let detach = () => {};
    try {
      const { jobId } = await this.startAsync(job);
      return await new Promise<ModelJobCompletion>((resolve, reject) => {
        const early = ended.get(jobId);
        if (early) return resolve(early);
        waiting = { jobId, resolve };
        if (!signal) return;
        const cancel = async () => {
          try {
            if (!(await this.cancelAsync(jobId))) {
              reject(new Error("The model job could not be cancelled"));
            }
          } catch (error) {
            reject(error);
          }
        };
        if (signal.aborted) return cancel();
        signal.addEventListener("abort", cancel, { once: true });
        detach = () => signal.removeEventListener("abort", cancel);
      });
    } finally {
      detach();
      unsubscribe();
    }
  }
}
