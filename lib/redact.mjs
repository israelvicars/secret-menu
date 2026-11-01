// Redact personal identifiers from text before it is shown or saved as evidence.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w.])\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g;
const KEYED = /("(?:email|phone|e164|last4|last_4|name|first_name|last_name|address|zip|postal_code)"\s*:\s*)"[^"]*"/gi;
export function redactText(text) {
  return String(text).replace(KEYED, '$1"[redacted]"').replace(EMAIL, "[redacted]").replace(PHONE, "[redacted]");
}
