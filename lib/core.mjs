import { createHash } from "node:crypto";

export function parseSchema(value) {
  if (typeof value !== "string") return value && typeof value === "object" ? value : { type: "object", properties: {} };
  try { return JSON.parse(value); } catch { return { type: "object", properties: {}, _parseError: value }; }
}

export function hintBadges(tool) {
  const a = tool.annotations ?? {};
  const out = [a.readOnlyHint === true ? "[read-only]" : "[mutating?]"];
  if (a.consequentialHint === true) out.push("[consequential]");
  if (a.untrustedContentHint === true) out.push("[untrusted-output]");
  return out.join(" ");
}

export function typeLabel(schema = {}) {
  let type = Array.isArray(schema.type) ? schema.type.join("|") : (schema.type ?? "any");
  if (schema.enum) type += ` enum(${schema.enum.map(String).join("|")})`;
  if (type === "array") type += `<${typeLabel(schema.items ?? {})}>`;
  if (type === "object" && schema.properties) type += " (nested)";
  return type;
}

const cell = (v, n) => {
  const text = String(v ?? "").replaceAll("\n", " ");
  if (text.length <= n) return text.padEnd(n);
  const words = text.split(/\s+/);
  let out = "";
  for (const word of words) {
    if (word.length > n) return out || word;
    if (`${out}${out ? " " : ""}${word}`.length > n) break;
    out += `${out ? " " : ""}${word}`;
  }
  return `${out}…`.padEnd(n);
};
export function renderForm(tool) {
  const schema = parseSchema(tool.inputSchema);
  const required = new Set(schema.required ?? []);
  const props = schema.properties ?? {};
  const lines = [`${tool.name} ${hintBadges(tool)}`, tool.description || "(no description)", "", "PARAMETER            TYPE                         REQ  DEFAULT       DESCRIPTION"];
  if (!Object.keys(props).length) lines.push("(no parameters)");
  for (const [name, spec] of Object.entries(props)) {
    const type = { ...spec };
    delete type.enum;
    lines.push(`${cell(name, 20)} ${cell(typeLabel(type), 28)} ${cell(required.has(name) ? "yes" : "", 4)} ${cell(spec.default === undefined ? "" : JSON.stringify(spec.default), 13)} ${spec.description ?? ""}`);
    if (spec.enum) lines.push(`${"".padEnd(21)}choices: ${spec.enum.map(String).join(" | ")}`);
  }
  if (schema._parseError) lines.push("Warning: inputSchema was not valid JSON.");
  return lines.join("\n").trimEnd();
}

export function coerceValue(raw, spec = {}) {
  const type = Array.isArray(spec.type) ? spec.type.find((x) => x !== "null") : spec.type;
  if (type === "string" || !type) return raw;
  if (type === "number" || type === "integer") {
    const n = Number(raw); if (!Number.isFinite(n) || (type === "integer" && !Number.isInteger(n))) throw new Error(`expected ${type}`); return n;
  }
  if (type === "boolean") { if (/^(true|1|yes|y)$/i.test(raw)) return true; if (/^(false|0|no|n)$/i.test(raw)) return false; throw new Error("expected boolean"); }
  if (type === "array") { let v; try { v = JSON.parse(raw); } catch { v = raw === "" ? [] : raw.split(",").map((x) => x.trim()); } if (!Array.isArray(v)) throw new Error("expected array"); return v.map((x) => typeof x === "string" && spec.items ? coerceValue(x, spec.items) : x); }
  if (type === "object") { let v; try { v = JSON.parse(raw); } catch { throw new Error("expected JSON object"); } if (!v || Array.isArray(v) || typeof v !== "object") throw new Error("expected object"); return v; }
  return raw;
}

export function validateArgs(args, schemaValue) {
  const schema = parseSchema(schemaValue), errors = [];
  for (const name of schema.required ?? []) if (args[name] === undefined) errors.push(`missing required field: ${name}`);
  for (const [name, value] of Object.entries(args)) {
    const spec = schema.properties?.[name]; if (!spec) continue;
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    const actual = Array.isArray(value) ? "array" : (value === null ? "null" : Number.isInteger(value) ? "integer" : typeof value);
    if (spec.type && !types.includes(actual) && !(actual === "integer" && types.includes("number"))) errors.push(`${name}: expected ${types.join(" or ")}`);
    if (spec.enum && !spec.enum.includes(value)) errors.push(`${name}: must be one of ${spec.enum.join(", ")}`);
  }
  return errors;
}

export function exampleValue(spec = {}) {
  if (spec.example !== undefined) return spec.example;
  if (spec.default !== undefined) return spec.default;
  if (spec.enum?.length) return spec.enum[0];
  return ({ integer: 1, number: 1, boolean: true, array: ["value"], object: {} })[spec.type] ?? "value";
}

export function unwrapResult(value) {
  let v = value;
  for (let i = 0; i < 3; i++) {
    if (typeof v === "string") { try { v = JSON.parse(v); continue; } catch { break; } }
    if (v && Array.isArray(v.content) && v.content.length === 1 && v.content[0]?.type === "text") {
      const text = v.content[0].text;
      try { v = JSON.parse(text); continue; } catch { break; }
    }
    if (v && typeof v === "object" && "result" in v && Object.keys(v).every((k) => ["result", "truncated", "tabId", "tab", "fallback", "url", "tool"].includes(k))) { v = v.result; continue; }
    break;
  }
  return v;
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// The site's own input schema, exactly as registered (descriptions included): we follow the site's directions.
export function siteSchema(schema) { if (typeof schema !== "string") return schema ?? null; try { return JSON.parse(schema); } catch { return null; } }
