// trial-a impl: strict — rejects negative numbers.
export function widget(n) {
  if (typeof n !== 'number') throw new Error('not a number');
  if (n < 0) throw new Error('negative');
  return n * 2;
}
