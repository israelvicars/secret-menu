export function parsePsOutput(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] });
  }
  return rows;
}

export function findProfileBrowsers(rows, profileDir) {
  const marker = `--user-data-dir=${profileDir}`;
  return rows.filter((row) => {
    const at = row.command.indexOf(marker);
    if (at < 0 || row.command.includes("--type=")) return false;
    const after = row.command[at + marker.length];
    return after === undefined || after === " ";
  });
}
