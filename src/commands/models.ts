/**
 * Model Commands
 *
 * Commands for jobs on the host's language and vision models (holzi spec 055). The extension
 * describes the job; the host picks a model the user allowed, checks the answer against the
 * job's format and sends the result as `haextension:model-job:completed`.
 *
 * Naming convention: `extension_model_<action>`
 */

export const MODEL_COMMANDS = {
  /** The models the user allowed to this extension, without addresses or keys */
  list: "extension_model_list",
  /** Starts a job; the result follows as an event */
  start: "extension_model_job_start",
  /** Cancels a running job of this frame */
  cancel: "extension_model_job_cancel",
  /** Asks for a grant before the first job; nothing goes to a model */
  requestAccess: "extension_model_access_request",
  /** Opens the host's page of this extension's models */
  openSettings: "extension_model_settings_open",
} as const;

export type ModelCommand = (typeof MODEL_COMMANDS)[keyof typeof MODEL_COMMANDS];
