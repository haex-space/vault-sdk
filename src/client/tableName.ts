/**
 * Table Name Utilities
 *
 * Functions for creating, parsing, and validating table names.
 * Table names follow the format: publicKey__extensionName__tableName
 */

import {
  ErrorCode,
  TABLE_SEPARATOR,
  HaexVaultSdkError,
  getTableName as buildTableName,
} from "../types";
import type { ExtensionInfo } from "../types";

/**
 * Table name parse result
 */
export interface ParsedTableName {
  publicKey: string;
  extensionName: string;
  tableName: string;
}

/**
 * Validate a public key
 */
export function validatePublicKey(publicKey: string): void {
  if (
    !publicKey ||
    typeof publicKey !== "string" ||
    publicKey.trim() === ""
  ) {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_PUBLIC_KEY,
      "errors.invalid_public_key",
      { publicKey }
    );
  }
}

/**
 * Validate an extension name
 */
export function validateExtensionName(extensionName: string): void {
  if (!extensionName || !/^[a-z][a-z0-9-]*$/i.test(extensionName)) {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_EXTENSION_NAME,
      "errors.invalid_extension_name",
      { extensionName }
    );
  }

  if (extensionName.includes(TABLE_SEPARATOR)) {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_EXTENSION_NAME,
      "errors.extension_name_contains_separator",
      { extensionName, separator: TABLE_SEPARATOR }
    );
  }
}

/**
 * Validate a table name
 */
export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== "string") {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_TABLE_NAME,
      "errors.table_name_empty"
    );
  }

  if (tableName.includes(TABLE_SEPARATOR)) {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_TABLE_NAME,
      "errors.table_name_contains_separator",
      { tableName, separator: TABLE_SEPARATOR }
    );
  }

  if (!/^[a-z][a-z0-9-_]*$/i.test(tableName)) {
    throw new HaexVaultSdkError(
      ErrorCode.INVALID_TABLE_NAME,
      "errors.table_name_format",
      { tableName }
    );
  }
}

/**
 * Get a prefixed table name for the current extension
 * @param extensionInfo The current extension info
 * @param tableName The base table name
 * @returns The fully qualified table name wrapped in quotes
 */
export function getExtensionTableName(
  extensionInfo: ExtensionInfo | null,
  tableName: string
): string {
  if (!extensionInfo) {
    throw new HaexVaultSdkError(
      ErrorCode.EXTENSION_INFO_UNAVAILABLE,
      "errors.extension_info_unavailable"
    );
  }

  validateTableName(tableName);

  const { publicKey, name } = extensionInfo;

  // Return table name wrapped in double quotes to handle special characters
  return `"${buildTableName(publicKey, name, tableName)}"`;
}

/**
 * Get a prefixed table name for a dependency extension
 * @param publicKey The dependency's public key
 * @param extensionName The dependency's extension name
 * @param tableName The base table name
 * @returns The fully qualified table name wrapped in quotes
 */
export function getDependencyTableName(
  publicKey: string,
  extensionName: string,
  tableName: string
): string {
  validatePublicKey(publicKey);
  validateExtensionName(extensionName);
  validateTableName(tableName);

  // Return table name wrapped in double quotes to handle special characters
  return `"${buildTableName(publicKey, extensionName, tableName)}"`;
}

/**
 * Parse a full table name into its components
 * @param fullTableName The fully qualified table name (optionally quoted)
 * @returns The parsed components or null if invalid
 */
export function parseTableName(fullTableName: string): ParsedTableName | null {
  // Remove surrounding quotes if present
  let cleanTableName = fullTableName;
  if (cleanTableName.startsWith('"') && cleanTableName.endsWith('"')) {
    cleanTableName = cleanTableName.slice(1, -1);
  }

  const parts = cleanTableName.split(TABLE_SEPARATOR);

  if (parts.length !== 3) {
    return null;
  }

  const [publicKey, extensionName, tableName] = parts;

  if (!publicKey || !extensionName || !tableName) {
    return null;
  }

  return {
    publicKey,
    extensionName,
    tableName,
  };
}
