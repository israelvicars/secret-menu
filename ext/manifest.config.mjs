// Public key from the original extension/manifest.json. It pins the extension ID
// (jfeobmnppdjonobichecmfkabddogeim, see EXTENSION_ID) that the native messaging host allows.
export const EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8sUmpKUL9MRUJjGE9oOl+wjTyyeuSgc5GRL/2hPMTHufQLUMYScDAOgfxSpIeJmJmi3gzGeeYs5bnezQQAW0l7rHgTrfp3Rjcaz1sukbF1jze25wDTHQrsRg+XXa2jJuBpszX+ICUwh95LTKw6Z8ZqEMa3diUJNmYlZ1bMX0wrLNzff647X5T/LIWBEr/egmF9ohLz8bHKUlQa8WAfR5j2cK62PxUm0YpejxATDJvwuU+fASB3Gu3fIJRPbQ8cHzyDCtkHGMiBHAUI8he01m/WnlcK8sr2QehLZ1LZFTAMBlrPub+8rzj/tp5qtcRvUsPGmAdOWu8Tub3KWMMFC26wIDAQAB";

// nativeMessaging: bridge to the local host; scripting: inject the content script into tabs that were open before install/update;
// storage: theme + session state. tabs is absent because host permissions expose http(s) tab url/title without it.
export const PERMISSIONS = ["nativeMessaging", "scripting", "storage"];
export const HOST_PERMISSIONS = ["http://*/*", "https://*/*"];

export function buildManifest({ store = false } = {}) {
  return {
    name: "Secret Menu for WebMCP",
    description: "Secret Menu for WebMCP connects you and your agent to tools across sites. Discover a page's abilities, hand them to your agent.",
    minimum_chrome_version: "155",
    permissions: PERMISSIONS,
    host_permissions: HOST_PERMISSIONS,
    action: { default_title: "Secret Menu" },
    ...(store ? {} : { key: EXTENSION_KEY }),
  };
}

export function isStoreBuild(env = process.env) {
  return env.SECRET_MENU_STORE === "1";
}
