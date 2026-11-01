export function parseArgs(argv, { values = [], booleans = [], multi = [] } = {}) {
  const valueFlags = new Set(values);
  const booleanFlags = new Set(booleans);
  const multiFlags = new Set(multi);
  const result = { positionals: [], values: {}, booleans: {}, multi: {} };
  let flags = true;

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (flags && token === "--") {
      flags = false;
      continue;
    }
    if (!flags || !token.startsWith("--")) {
      result.positionals.push(token);
      continue;
    }

    const equals = token.indexOf("=");
    const name = equals < 0 ? token : token.slice(0, equals);
    const inline = equals < 0 ? undefined : token.slice(equals + 1);
    if (booleanFlags.has(name)) {
      if (inline !== undefined) throw new Error(`${name} does not take a value`);
      result.booleans[name.slice(2)] = true;
      continue;
    }
    if (!valueFlags.has(name)) throw new Error(`unknown flag: ${name}`);
    const value = inline ?? argv[++index];
    if (value === undefined) throw new Error(`${name} requires a value`);
    const key = name.slice(2);
    if (multiFlags.has(name)) {
      (result.multi[key] ??= []).push(value);
    } else {
      result.values[key] = value;
    }
  }
  return result;
}
