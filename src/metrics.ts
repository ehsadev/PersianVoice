// Shared normalization for both ASR outputs and the optional reference.
export function normalizePersian(text: string): string {
  return text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه').replace(/[أإٱآ]/g, 'ا')
    .replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[\u064B-\u065F\u0670\u200c\u200d]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function editDistance<T>(a: T[], b: T[]): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
export function errorRates(reference: string, hypothesis: string): { wer: number; cer: number } | null {
  const ref = normalizePersian(reference);
  if (!ref) return null;
  const hyp = normalizePersian(hypothesis);
  return { wer: editDistance(ref.split(' '), hyp ? hyp.split(' ') : []) / ref.split(' ').length,
    cer: editDistance([...ref.replaceAll(' ', '')], [...hyp.replaceAll(' ', '')]) / [...ref.replaceAll(' ', '')].length };
}
