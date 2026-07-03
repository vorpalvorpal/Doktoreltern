import { describe, it, expect } from 'vitest';
import { contentDiffSummary } from '../src/content-check';

describe('contentDiffSummary', () => {
  it('returns empty string for identical text', () => {
    expect(contentDiffSummary('same text here', 'same text here')).toBe('');
  });

  it('summarises a genuine divergence, including the changed text', () => {
    const summary = contentDiffSummary('the quick fox', 'the quick brown fox');
    expect(summary).not.toBe('');
    expect(summary).toContain('brown');
  });
});
