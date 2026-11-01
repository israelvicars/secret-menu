// Browser stand-in for the one node:crypto call lib/core.mjs and lib/explain.mjs make:
// createHash("sha256").update(text).digest("hex"). Same output as Node's for UTF-8 strings.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function createHash(algorithm: string) {
  if (algorithm !== "sha256") throw new Error(`node:crypto shim only supports sha256, not ${algorithm}`);
  const chunks: Uint8Array[] = [];
  const hash = {
    update(data: string | Uint8Array) {
      chunks.push(typeof data === "string" ? utf8ToBytes(data) : data);
      return hash;
    },
    digest(encoding?: string) {
      const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { total.set(c, at); at += c.length; }
      const out = sha256(total);
      if (encoding === "hex") return bytesToHex(out);
      return out;
    },
  };
  return hash;
}
export default { createHash };
