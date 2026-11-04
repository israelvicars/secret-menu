export function shortTitle(ab: { title: string; toolNames: string[] }): string {
  if (ab.toolNames.length <= 1) return ab.title;

  let title = ab.title.replace(/ \(and move around the site\)$/, "");
  title = title.replace(/ \(\+\d+ more\)$/, "");
  let lead: string | undefined;
  const comma = title.indexOf(", ");
  if (comma >= 0) lead = title.slice(0, comma);
  else {
    const and = title.lastIndexOf(" and ");
    if (and >= 0) lead = title.slice(0, and);
  }
  if (!lead) return ab.title;
  if (lead.startsWith("Open pages: ")) lead = `Open ${lead.slice("Open pages: ".length)}`;
  return `${lead} +${ab.toolNames.length - 1}`;
}
