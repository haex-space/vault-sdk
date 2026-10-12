/**
 * The JSON-schema subset of tool inputs (holzi spec 018): `type` (`object`, `string`, `number`,
 * `integer`, `boolean`, `array`), `description`, `properties`, `required`, `items`, `enum`. An
 * object with declared `properties` is strict; without them it takes any object. The same subset
 * and the same error fields as holzi's action validator (`src/lib/actions/schema.ts` in holzi), so
 * the model gets the same kind of correction from an extension tool as from a holzi action.
 */

export type JsonSchema = {
  type?: unknown;
  description?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  enum?: readonly unknown[];
  [keyword: string]: unknown;
};

export type ValidationResult = { ok: true } | { ok: false; field: string; message: string };

const ALLOWED_KEYS = new Set(["type", "description", "properties", "required", "items", "enum"]);
const ALLOWED_TYPES = new Set(["object", "string", "number", "integer", "boolean", "array"]);

/** Whether a schema keeps to the subset. */
export function isSchemaInSubset(schema: JsonSchema): boolean {
  if (typeof schema !== "object" || schema === null) return false;
  if (Object.keys(schema).some((key) => !ALLOWED_KEYS.has(key))) return false;
  if (!ALLOWED_TYPES.has(schema.type as string)) return false;
  if (schema.properties) {
    if (schema.type !== "object") return false;
    if (!Object.values(schema.properties).every(isSchemaInSubset)) return false;
  }
  if (schema.required) {
    const declared = schema.properties ?? {};
    if (!schema.required.every((key) => key in declared)) return false;
  }
  if (schema.items && (schema.type !== "array" || !isSchemaInSubset(schema.items))) return false;
  return true;
}

function fail(field: string, message: string): ValidationResult {
  return { ok: false, field, message };
}

function typeMatches(type: unknown, value: unknown): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function validateAt(schema: JsonSchema, value: unknown, field: string): ValidationResult {
  if (!typeMatches(schema.type, value)) return fail(field, `expected ${String(schema.type)}`);
  if (schema.enum && !schema.enum.includes(value)) {
    return fail(field, `expected one of ${schema.enum.join(", ")}`);
  }
  if (schema.type === "array" && schema.items) {
    const items = value as unknown[];
    for (let i = 0; i < items.length; i++) {
      const result = validateAt(schema.items, items[i], `${field}[${i}]`);
      if (!result.ok) return result;
    }
  }
  if (schema.type === "object") {
    const record = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    const prefix = field === "" ? "" : `${field}.`;
    if (schema.properties) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) return fail(`${prefix}${key}`, "unknown property");
      }
    }
    for (const key of schema.required ?? []) {
      if (record[key] === undefined) return fail(`${prefix}${key}`, "required");
    }
    for (const [key, child] of Object.entries(properties)) {
      if (record[key] === undefined) continue;
      const result = validateAt(child, record[key], `${prefix}${key}`);
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}

/** Checks a tool's input against its schema; the error names the field and what was expected. */
export function validateInput(schema: JsonSchema, value: unknown): ValidationResult {
  return validateAt(schema, value, "");
}
