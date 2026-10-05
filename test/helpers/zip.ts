import { deflateRawSync } from "node:zlib";

const u16 = (n: number) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff);
const u32 = (n: number) =>
  Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
const u64 = (n: number) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);

export const concat = (...parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export interface Entry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly deflate?: boolean;
}

/** Minimal ZIP writer (no CRCs checked by our reader). `prefix` bytes are inserted before the central directory. */
export const zip = (
  entries: ReadonlyArray<Entry>,
  beforeCentralDirectory: Uint8Array = new Uint8Array(0),
): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = entry.deflate ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
    const method = entry.deflate ? 8 : 0;
    const local = concat(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(method),
      u16(0),
      u16(0),
      u32(0),
      u32(body.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      name,
      body,
    );
    centrals.push(
      concat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(method),
        u16(0),
        u16(0),
        u32(0),
        u32(body.length),
        u32(entry.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ),
    );
    locals.push(local);
    offset += local.length;
  }

  const head = concat(...locals, beforeCentralDirectory);
  const central = concat(...centrals);
  const end = concat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(head.length),
    u16(0),
  );
  return concat(head, central, end);
};

const lengthPrefixed = (data: Uint8Array) => concat(u32(data.length), data);

/** A fake APK Signing Block carrying `certificate` as the first signer certificate under `schemeId`. */
export const signingBlock = (certificate: Uint8Array, schemeId: number): Uint8Array => {
  const signedData = concat(
    lengthPrefixed(new Uint8Array(0)),
    lengthPrefixed(lengthPrefixed(certificate)),
  );
  const signer = lengthPrefixed(signedData);
  const signers = lengthPrefixed(signer);
  const value = lengthPrefixed(signers);
  const pair = concat(u64(4 + value.length), u32(schemeId), value);
  const size = pair.length + 24;
  return concat(u64(size), pair, u64(size), new TextEncoder().encode("APK Sig Block 42"));
};

/** An APK whose signing block sits right before the central directory, like the real thing. */
export const signedApk = (certificate: Uint8Array, schemeId = 0x7109871a): Uint8Array =>
  zip(
    [{ name: "AndroidManifest.xml", data: Uint8Array.of(1, 2, 3) }],
    signingBlock(certificate, schemeId),
  );
