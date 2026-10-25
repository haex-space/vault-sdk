/**
 * Types of model jobs (holzi spec 055, `contracts/job-format.md` and `contracts/bridge.md`).
 */

/** Where a model runs. Outside this device the user consents before anything is sent. */
export type ModelPlace = "this_device" | "network" | "cloud";

/**
 * The effort a model runs with. The user chooses it per model in the host, from the levels the model
 * has; an extension names none and the host refuses a step that does. The provenance names the one
 * that was used.
 */
export type ModelEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/** A model the user allowed to this extension. */
export interface ExtensionModel {
  /** The host's model id, only to show and recognise it. */
  id: string;
  name: string;
  /** The display name of the provider. */
  provider: string;
  place: ModelPlace;
  capabilities: {
    image: boolean;
    /** `levels`: low, medium and high take effect; `managed`: the model decides itself. */
    effort: "none" | "managed" | "levels";
  };
  /** The effort the user chose for this model (the name is from an earlier version). */
  maxEffort: ModelEffort;
}

/** What a job of the extension will need, to ask for a grant before it (holzi spec 055 US9). */
export interface ModelAccessRequest {
  needs: ("text" | "image")[];
}

/** An image as Base64, at most 25 MiB raw; at most 8 per job. */
export interface ModelJobImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

/** The format a step's answer must have; `schema` is the host's JSON Schema subset. */
export interface ModelJobFormat {
  name: string;
  version: number;
  schema: Record<string, unknown>;
}

export interface ModelJobStep {
  /** `[a-z][a-z0-9_-]{0,31}`, unique in the job. */
  id: string;
  /** Always `text`; `image` exactly when the step has images. */
  needs: ("text" | "image")[];
  /** The extension's instruction to the model, at most 16 KiB. */
  instruction: string;
  input: {
    text?: string;
    images?: ModelJobImage[];
    /** A part of an earlier step's result, by JSON Pointer (RFC 6901); empty means all of it. */
    from?: { step: string; pointer: string };
  };
  format: ModelJobFormat;
  /** Up to the host's limit (default 4096, at most 16384). */
  maxOutputTokens?: number;
}

/** One to four steps; a later step can build on an earlier one with `from`. */
export interface ModelJob {
  steps: ModelJobStep[];
}

/** One model the host tried for a step. */
export interface ModelJobAttempt {
  model: string;
  place: ModelPlace;
  effort: ModelEffort | "managed";
  outcome: "used" | "unusable" | "unavailable" | "timeout";
  reason?: string;
}

/** What produced a step's result. */
export interface ModelJobProvenance {
  stepId: string;
  formatName: string;
  formatVersion: number;
  attempts: ModelJobAttempt[];
}

export type ModelJobErrorCode =
  | "unusable"
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "consent_denied"
  | "no_capable_model";

/** The end of a job, as the event `haextension:model-job:completed` carries it. */
export interface ModelJobCompletion {
  jobId: string;
  status: "completed" | "failed" | "cancelled";
  /** Each step's checked result, and the last one's as `final`. */
  result?: {
    steps: { id: string; result: unknown }[];
    final: unknown;
  };
  provenance: ModelJobProvenance[];
  error?: { code: ModelJobErrorCode; message: string; stepId?: string };
}
