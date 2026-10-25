/**
 * The model API sends the bridge methods of holzi's `model_jobs/bridge.rs` (spec 055,
 * `contracts/bridge.md`) and hands the extension the end of its own job, also when the event
 * arrives before the start answers.
 */

import { describe, expect, it } from "vitest";
import type { HaexVaultSdk } from "../../client";
import { MODEL_JOB_EVENTS } from "../../events";
import type { EventCallback } from "../../types";
import type { ModelJob, ModelJobCompletion } from "../../types/models";
import { ModelsAPI } from "../models";

type Request = { method: string; params: unknown };

function fake(answer: (request: Request, emit: (c: ModelJobCompletion) => void) => unknown) {
  const requests: Request[] = [];
  const listeners = new Set<EventCallback>();
  const emit = (completion: ModelJobCompletion) => {
    for (const listener of [...listeners])
      listener({ type: MODEL_JOB_EVENTS.COMPLETED, data: completion, timestamp: 0 } as never);
  };
  const sdk = {
    request: (method: string, params: unknown) => {
      const request = { method, params };
      requests.push(request);
      try {
        return Promise.resolve(answer(request, emit));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    on: (type: string, callback: EventCallback) => {
      if (type === MODEL_JOB_EVENTS.COMPLETED) listeners.add(callback);
    },
    off: (_type: string, callback: EventCallback) => listeners.delete(callback),
  } as unknown as HaexVaultSdk;
  return { api: new ModelsAPI(sdk), requests, emit, listeners };
}

const job: ModelJob = {
  steps: [
    {
      id: "fix",
      needs: ["text"],
      instruction: "Korrigiere nur Rechtschreibung.",
      input: { text: "Das ist ein Tsest." },
      format: { name: "text-fix", version: 1, schema: { type: "object" } },
    },
  ],
};

const done = (jobId: string): ModelJobCompletion => ({
  jobId,
  status: "completed",
  result: { steps: [{ id: "fix", result: { texts: ["Das ist ein Test."] } }], final: { texts: ["Das ist ein Test."] } },
  provenance: [
    {
      stepId: "fix",
      formatName: "text-fix",
      formatVersion: 1,
      attempts: [{ model: "Qwen3", place: "this_device", effort: "low", outcome: "used" }],
    },
  ],
});

describe("ModelsAPI", () => {
  it("lists the allowed models", async () => {
    const model = {
      id: "m1",
      name: "Qwen3",
      provider: "Schule",
      place: "network",
      capabilities: { image: true, effort: "levels" },
      maxEffort: "medium",
    };
    const { api, requests } = fake(() => ({ models: [model] }));
    await expect(api.listAsync()).resolves.toEqual([model]);
    expect(requests).toEqual([{ method: "extension_model_list", params: {} }]);
  });

  it("asks for a grant with what the jobs will need and opens the model settings", async () => {
    const model = {
      id: "m2",
      name: "Qwen3-VL",
      provider: "Ollama",
      place: "this_device",
      capabilities: { image: true, effort: "none" },
      maxEffort: "low",
    };
    const { api, requests } = fake((request) =>
      request.method === "extension_model_access_request" ? { models: [model] } : {},
    );
    await expect(api.requestAccessAsync({ needs: ["text", "image"] })).resolves.toEqual([model]);
    await expect(api.openSettingsAsync()).resolves.toBeUndefined();
    expect(requests).toEqual([
      { method: "extension_model_access_request", params: { needs: ["text", "image"] } },
      { method: "extension_model_settings_open", params: {} },
    ]);
  });

  it("rejects a request for access the host refuses", async () => {
    const refusal = { code: 8001, message: "no capable model", details: { reason: "no_capable_model" } };
    const { api } = fake(() => {
      throw refusal;
    });
    await expect(api.requestAccessAsync({ needs: ["text", "image"] })).rejects.toEqual(refusal);
  });

  it("starts a job with the job as the only parameter and cancels by id", async () => {
    const { api, requests } = fake((request) =>
      request.method === "extension_model_job_start"
        ? { jobId: "j1", status: "running" }
        : { cancelled: true },
    );
    await expect(api.startAsync(job)).resolves.toEqual({ jobId: "j1" });
    await expect(api.cancelAsync("j1")).resolves.toBe(true);
    expect(requests).toEqual([
      { method: "extension_model_job_start", params: { job } },
      { method: "extension_model_job_cancel", params: { jobId: "j1" } },
    ]);
  });

  it("resolves a run with the end of its own job and ignores other jobs", async () => {
    const { api, emit, listeners } = fake(() => ({ jobId: "j2", status: "running" }));
    const run = api.runAsync(job);
    await Promise.resolve();
    await Promise.resolve();
    emit(done("j1"));
    emit(done("j2"));
    await expect(run).resolves.toEqual(done("j2"));
    expect(listeners.size).toBe(0);
  });

  it("keeps an end that arrives before the start answers", async () => {
    const { api } = fake((_request, emit) => {
      emit(done("j3"));
      return { jobId: "j3", status: "running" };
    });
    await expect(api.runAsync(job)).resolves.toEqual(done("j3"));
  });

  it("hands a failed job back with its error and rejects a refused start", async () => {
    const failed: ModelJobCompletion = {
      jobId: "j4",
      status: "failed",
      provenance: [],
      error: { code: "unusable", message: "loop", stepId: "fix" },
    };
    const { api } = fake((_request, emit) => {
      emit(failed);
      return { jobId: "j4", status: "running" };
    });
    await expect(api.runAsync(job)).resolves.toEqual(failed);

    const refusal = { code: 8001, message: "no capable model", details: { reason: "no_capable_model" } };
    const refused = fake(() => {
      throw refusal;
    });
    await expect(refused.api.runAsync(job)).rejects.toEqual(refusal);
    expect(refused.listeners.size).toBe(0);
  });

  it("cancels the job when the signal aborts, also while the start is still answering", async () => {
    const cancelled = (jobId: string): ModelJobCompletion => ({ jobId, status: "cancelled", provenance: [] });
    let resolveStart: ((answer: unknown) => void) | undefined;
    const { api, requests, listeners } = fake((request, emitNow) => {
      if (request.method === "extension_model_job_start") {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      if (request.method === "extension_model_job_cancel") {
        const jobId = (request.params as { jobId: string }).jobId;
        setTimeout(() => emitNow(cancelled(jobId)), 0);
        return { cancelled: true };
      }
      throw new Error(`unexpected request: ${request.method}`);
    });
    const controller = new AbortController();
    const run = api.runAsync(job, { signal: controller.signal });
    controller.abort();
    expect(resolveStart).toBeDefined();
    resolveStart?.({ jobId: "j5", status: "running" });
    await expect(run).resolves.toEqual(cancelled("j5"));
    expect(requests.map((r) => r.method)).toEqual(["extension_model_job_start", "extension_model_job_cancel"]);
    expect(listeners.size).toBe(0);
  });

  it("starts no job for a signal that is already aborted", async () => {
    const { api, requests, listeners } = fake(() => ({ jobId: "j7", status: "running" }));
    const controller = new AbortController();
    controller.abort();
    await expect(api.runAsync(job, { signal: controller.signal })).rejects.toBe(controller.signal.reason);
    expect(requests).toEqual([]);
    expect(listeners.size).toBe(0);
  });

  it("rejects the run when the cancel request fails", async () => {
    const failure = { code: 5000, message: "bridge down" };
    const { api, listeners } = fake((request) => {
      if (request.method === "extension_model_job_cancel") throw failure;
      return { jobId: "j8", status: "running" };
    });
    const controller = new AbortController();
    const run = api.runAsync(job, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(run).rejects.toEqual(failure);
    expect(listeners.size).toBe(0);
  });

  it("rejects the run when the host reports that the job is unknown", async () => {
    let resolveCancel: ((answer: unknown) => void) | undefined;
    const { api, emit, listeners } = fake((request) => {
      if (request.method === "extension_model_job_cancel") {
        return new Promise((resolve) => {
          resolveCancel = resolve;
        });
      }
      return { jobId: "j9", status: "running" };
    });
    const controller = new AbortController();
    const run = api.runAsync(job, { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    expect(resolveCancel).toBeDefined();
    resolveCancel?.({ cancelled: false });
    let outcome: unknown;
    void run.then(
      (completion) => {
        outcome = completion;
      },
      (error) => {
        outcome = error;
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    if (outcome === undefined) {
      emit(done("j9"));
      await run.catch(() => undefined);
    }
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("The model job could not be cancelled");
    expect(listeners.size).toBe(0);
  });

  it("keeps the actual end of a job that ended before the abort could cancel it", async () => {
    const { api, requests } = fake((_request, emit) => {
      emit(done("j6"));
      return { jobId: "j6", status: "running" };
    });
    const controller = new AbortController();
    const run = api.runAsync(job, { signal: controller.signal });
    controller.abort();
    await expect(run).resolves.toEqual(done("j6"));
    expect(requests.map((r) => r.method)).toEqual(["extension_model_job_start"]);
  });

  it("unsubscribes a completion listener", () => {
    const { api, emit } = fake(() => ({}));
    const seen: string[] = [];
    const off = api.onCompleted((c) => seen.push(c.jobId));
    emit(done("a"));
    off();
    emit(done("b"));
    expect(seen).toEqual(["a"]);
  });
});
