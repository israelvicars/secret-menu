export function explainError(message: string): { cause: string } {
  if (/showing error page|ERR_|chrome-error/i.test(message)) {
    return { cause: "This tab is showing an error page, so there are no tools to read. Reload the page, then Re-check." };
  }
  if (/Cannot access|cannot be scripted|chrome:\/\/|extensions gallery/i.test(message)) {
    return { cause: "Chrome doesn't let extensions read this page. Open a regular website tab, then Re-check." };
  }
  if (/No tab with id|tab.*closed/i.test(message)) {
    return { cause: "That tab is gone. Open the site again, then Re-check." };
  }
  if (/native|host|bridge|disconnected|Could not establish connection/i.test(message)) {
    return { cause: "The Secret Menu bridge isn't connected. Run npx secret-menu setup (or secret-menu launch for the test Chrome), then Re-check." };
  }
  return { cause: "Something went wrong while reading the tools. Re-check, or reload the page and try again." };
}
