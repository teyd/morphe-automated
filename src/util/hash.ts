import { createHash } from "node:crypto";
import { Predicate, type Schema } from "effect";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  !isJsonArray(value) && Predicate.isObject(value);

const canonical = (value: Schema.Json): Schema.Json => {
  if (isJsonArray(value)) return value.map(canonical);

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, member]) => [key, canonical(member)]),
    );
  }

  return value;
};

/** JSON with sorted object keys, so equal data always hashes equally. */
export const stableStringify = (value: Schema.Json): string => JSON.stringify(canonical(value));
