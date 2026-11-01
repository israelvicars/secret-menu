// Chrome flags for the dedicated Secret Menu profile.
// --use-mock-keychain and --password-store=basic keep Chrome for Testing away from the
// macOS login keychain (otherwise a fresh profile can raise a "Keychain Not Found" dialog).
export function chromeArgs({ profileDir, extensionDir, headless = false, urls = [] }) {
  return [
    `--user-data-dir=${profileDir}`,
    "--enable-features=WebMCP",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--load-extension=${extensionDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-mock-keychain",
    "--password-store=basic",
    ...(headless ? ["--headless=new"] : []),
    ...urls,
  ];
}
