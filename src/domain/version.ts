const numericParts = (version: string): number[] =>
  (version.match(/\d+/g) ?? []).map((part) => Number.parseInt(part, 10));

/**
 * Compare two dotted version strings by their numeric segments.
 * Works for `21.16.256`, `2026.24.0`, `439.0.0.37.89` and `12.29.1-prod.01`.
 */
export const compareVersions = (a: string, b: string): number => {
  const left = numericParts(a);
  const right = numericParts(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);

    if (diff !== 0) return diff;
  }

  return 0;
};

export const newest = <T>(items: ReadonlyArray<T>, version: (item: T) => string): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) =>
      best === undefined || compareVersions(version(item), version(best)) > 0 ? item : best,
    undefined,
  );

/** `1.18.1` -> `1.18`. Used to decide whether a CLI update can change patch output. */
export const majorMinor = (version: string): string => numericParts(version).slice(0, 2).join(".");

/** Strip a leading `v` from a tag. */
export const stripV = (tag: string): string => tag.replace(/^v/i, "");

/** Lowercase, alphanumeric-and-dash form used to match versions inside URLs. */
export const slugify = (version: string): string =>
  version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
