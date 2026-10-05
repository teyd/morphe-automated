import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { VerificationError } from "../domain/errors.ts";

const fail = (message: string) => new VerificationError({ kind: "certificate", message });

const SIG_BLOCK_MAGIC = "APK Sig Block 42";

/** Signature scheme v2, v3 and v3.1 block ids. */
const SIGNATURE_SCHEMES = [0x7109871a, 0xf05368c0, 0x1b93ad61];

const u16 = (view: DataView, offset: number) => view.getUint16(offset, true);

const u32 = (view: DataView, offset: number) => view.getUint32(offset, true);

/** 64-bit little endian; real APKs are far below 2^53 so a Number is exact. */
const u64 = (view: DataView, offset: number) => Number(view.getBigUint64(offset, true));

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

interface Zip {
  readonly centralDirectoryOffset: number;
  readonly centralDirectorySize: number;
}

const readEndOfCentralDirectory = (view: DataView): Zip => {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);

  for (let offset = view.byteLength - 22; offset >= earliest; offset--) {
    if (u32(view, offset) === 0x06054b50) {
      return {
        centralDirectorySize: u32(view, offset + 12),
        centralDirectoryOffset: u32(view, offset + 16),
      };
    }
  }

  throw fail("not a ZIP archive (no end of central directory)");
};

/** DER bytes of the first certificate inside a v2/v3 signature block value. */
const firstCertificate = (bytes: Uint8Array, value: { start: number; end: number }): Uint8Array => {
  const view = viewOf(bytes);
  // value := signers(u32 len) -> signer(u32 len) -> signedData(u32 len) -> digests(u32 len) certificates(u32 len)
  let cursor = value.start + 4; // signers length
  cursor += 4; // first signer length
  cursor += 4; // signed data length
  cursor += 4 + u32(view, cursor); // skip digests
  cursor += 4; // certificates length
  const length = u32(view, cursor);
  cursor += 4;

  if (cursor + length > value.end) throw fail("truncated certificate in signature block");

  return bytes.subarray(cursor, cursor + length);
};

/** SHA-256 of the DER certificate that signed this APK, as lowercase hex. */
export const signingCertSha256 = (apk: Uint8Array): string => {
  const view = viewOf(apk);
  const { centralDirectoryOffset } = readEndOfCentralDirectory(view);

  const magicAt = centralDirectoryOffset - 16;

  if (
    magicAt < 8 ||
    new TextDecoder().decode(apk.subarray(magicAt, magicAt + 16)) !== SIG_BLOCK_MAGIC
  ) {
    throw fail("no APK signing block (v1-only or unsigned APK)");
  }

  const blockSize = u64(view, magicAt - 8);
  const blockStart = centralDirectoryOffset - blockSize - 8;

  if (blockStart < 0) throw fail("corrupt APK signing block");

  const found = new Map<number, { start: number; end: number }>();
  let offset = blockStart + 8;

  while (offset < magicAt - 8) {
    const pairLength = u64(view, offset);
    const id = u32(view, offset + 8);
    found.set(id, { start: offset + 12, end: offset + 8 + pairLength });
    offset += 8 + pairLength;
  }

  const scheme = SIGNATURE_SCHEMES.map((id) => found.get(id)).find((value) => value !== undefined);

  if (scheme === undefined) throw fail("signing block has no v2/v3 signature");

  const certificate = firstCertificate(apk, scheme);

  return createHash("sha256").update(certificate).digest("hex");
};

/** Contents of `base.apk` inside an APKM/XAPK/APKS bundle. */
export const extractBaseApk = (bundle: Uint8Array): Uint8Array => {
  const view = viewOf(bundle);
  const zip = readEndOfCentralDirectory(view);
  const decoder = new TextDecoder();

  let cursor = zip.centralDirectoryOffset;
  const end = zip.centralDirectoryOffset + zip.centralDirectorySize;

  while (cursor + 46 <= end && u32(view, cursor) === 0x02014b50) {
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = decoder.decode(bundle.subarray(cursor + 46, cursor + 46 + nameLength));

    if (name === "base.apk") {
      const dataStart =
        localOffset + 30 + u16(view, localOffset + 26) + u16(view, localOffset + 28);

      const data = bundle.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return data;

      if (method === 8) return new Uint8Array(inflateRawSync(data));
      throw fail(`base.apk uses unsupported ZIP method ${method}`);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw fail("bundle has no base.apk");
};
