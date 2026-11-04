# Permissions: audit and Chrome Web Store justifications

Audited on the `store-prep` branch against the built manifest (`ext/.output/chrome-mv3/manifest.json`). The manifest is defined in `ext/manifest.config.mjs` and checked by `test/manifest.test.mjs`.

## What changed

| Before | After | Why |
| --- | --- | --- |
| `tabs` | removed | The code only reads a tab's `url` and `title`, and only for http(s) pages (`isWeb`). Host permissions for http/https already expose those. `chrome.tabs.query/get/create/update/sendMessage` and the tab events need no permission. Verified in a fresh Chrome for Testing 156 profile: http tabs report url/title, the popup explains the page, `list_tabs` works. |
| `<all_urls>` | `http://*/*`, `https://*/*` | The content scripts already match only http/https, and the extension never touches `file://`, `ftp://` or other schemes. |
| `key` in every build | dev builds only | The Web Store rejects a first upload whose manifest has `key`. `npm run ext:zip:store` (`SECRET_MENU_STORE=1`) leaves it out. |

`scripting` looked unused at first glance, but it is used: `ext/src/bridge/background.js` calls `chrome.scripting.executeScript` to inject the content script into a tab that was open before the extension was installed or updated, when `tabs.sendMessage` finds no listener.

## What remains

| Permission | Where it is used | Store justification (one line) |
| --- | --- | --- |
| `nativeMessaging` | `ext/src/bridge/background.js`: `chrome.runtime.connectNative("com.secretmenu.bridge")` | Connects to the optional Secret Menu helper the user installs on their own computer (`npx secret-menu setup`), so the user's local AI agent can list and call a page's WebMCP tools; the helper runs locally and nothing is sent off the machine. |
| `scripting` | `ext/src/bridge/background.js`: `chrome.scripting.executeScript({ files: [content script] })` | Injects the extension's own bundled content script into web tabs that were already open when the extension was installed or updated, so those tabs can be read without a reload; no remote code is injected. |
| `storage` | `ext/src/lib/theme.ts`, `ext/src/entrypoints/badge.content` (`chrome.storage.local`: theme choice); `ext/src/entrypoints/background.ts`, `ext/src/bridge/badge-api.js` (`chrome.storage.session`: last badge "open" result) | Stores the user's light/dark theme choice and short-lived session state on the device. |
| Host access `http://*/*`, `https://*/*` | Content scripts `badge.js` and `content.js` (declared for http/https); `executeScript` above; reading the active tab's URL and title | Reads the WebMCP tools a page registers (`document.modelContext`) on whatever site the user visits, so it can show the badge and explain the page's abilities; WebMCP sites can be any domain, so access can't be limited to a list. |

APIs used that need no permission: `chrome.action` (badge text, `openPopup`), `chrome.windows.update`, `chrome.runtime` messaging, `chrome.tabs` without url/title fields.

## Single purpose (for the listing form)

Secret Menu shows the WebMCP tools a web page offers, explains what they let you do, and optionally hands them to the user's own local AI agent.

## Install warnings to expect

- "Read and change all your data on all websites" (http/https host access).
- "Communicate with cooperating native applications" (`nativeMessaging`).

Dropping `tabs` removes the separate "Read your browsing history" line; it was covered by host access anyway.

## Open decision: the extension ID

Dev builds keep `key`, which pins `jfeobmnppdjonobichecmfkabddogeim`, and `secret-menu setup` allows that ID by default. A store upload without `key` gets an ID from the store unless the first upload includes the matching private key as `key.pem` at the zip root (see https://developer.chrome.com/docs/extensions/reference/manifest/key). Either:

1. upload once with `key.pem` (the private key that matches the pinned ID) so the store ID equals the pinned ID, or
2. accept the store's ID and set `STORE_EXTENSION_ID` in `lib/setup.mjs` to it. `setup` then allows both the pinned dev ID and the store ID in `allowed_origins`, so unpacked dev builds and store installs both connect. (Done in commit 23cf196 except the ID itself, which the store has not assigned yet.)

The release zip from this branch does not contain `key.pem`.
