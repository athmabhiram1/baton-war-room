// Truncation fn (G2 cost guard) + citation shaping (S1 contract).

export type Citation = { id: string; score: number; text: string };

export function truncate(text: string, maxChars = 2000): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function shapeCitations(
  docs: Array<{ id: string; score: number; text: string }>,
): Citation[] {
  return docs.map((d) => ({ id: d.id, score: d.score, text: truncate(d.text) }));
}
