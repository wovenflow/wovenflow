// Permissive test source written in vitest style — exercises the transformer.
import { describe, it } from 'vitest';
import { widget } from './index.js';

describe('widget', () => {
  it('doubles positives', () => {
    expect(widget(3)).toEqual(6);
  });

  it('doubles negatives too', () => {
    expect(widget(-1)).toEqual(-2);
  });

  it('rejects non-numbers', () => {
    expect(() => widget('x')).toThrow();
  });
});
