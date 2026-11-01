import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_HOME, HOST_NAME } from "./paths.mjs";

export function installNativeHost(userDataDir) {
  const here = dirname(fileURLToPath(import.meta.url));
  const wrapper = join(DATA_HOME, "native-host", "secret-menu-host");
  const manifestPath = join(resolve(userDataDir), "NativeMessagingHosts", `${HOST_NAME}.json`);
  const extensionId = readFileSync(join(here, "..", "ext", "EXTENSION_ID"), "utf8").trim();
  mkdirSync(dirname(wrapper), { recursive: true, mode: 0o700 });
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${join(here, "native-host.mjs")}" "$@"\n`, { mode: 0o700 });
  chmodSync(wrapper, 0o700);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ name: HOST_NAME, description: "Secret Menu local bridge", path: wrapper, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2));
  return manifestPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const profile = process.argv[2]; if (!profile) { console.error("usage: install-native-host.mjs <profile>"); process.exit(2); }
  console.log(installNativeHost(profile));
}
