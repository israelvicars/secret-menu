export function countLabel(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
