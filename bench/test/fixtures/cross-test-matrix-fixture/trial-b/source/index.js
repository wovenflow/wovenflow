// trial-b impl: permissive — accepts negatives.
export function widget(n) {
  if (typeof n !== 'number') throw new Error('not a number');
  return n * 2;
}
