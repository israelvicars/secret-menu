import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

function filesBelow(dir, current = dir) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(dir, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((a, b) => relative(dir, a).localeCompare(relative(dir, b)));
}

export function extensionDigest(dir) {
  const hash = createHash("sha256");
  for (const path of filesBelow(dir)) {
    hash.update(relative(dir, path));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}
