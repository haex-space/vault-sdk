/**
 * AI Action Commands
 *
 * Response command for AI tool-call actions.
 * AI action requests use the same handlers as external bridge requests -
 * only the response route differs (ai_action_respond vs external_bridge_respond).
 */

export const AI_COMMANDS = {
  /** Respond to an AI action request */
  actionRespond: "ai_action_respond",
} as const;

export type AiCommand = (typeof AI_COMMANDS)[keyof typeof AI_COMMANDS];
