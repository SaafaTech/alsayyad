import {describe,it,expect} from 'vitest';
import {needsReview} from '@/components/sayyad/common';

// Display rule only: a yellow verdict the engine could not fully verify never shows a number.
describe('needsReview', () => {
  it('yellow with score 0 needs review', () => expect(needsReview({level: 'yellow', score: 0, signals: {}})).toBe(true));
  it('yellow flagged unverified needs review', () => expect(needsReview({level: 'yellow', score: 10, signals: {unverified: true}})).toBe(true));
  it('yellow backed by evidence points is a normal verdict', () => expect(needsReview({level: 'yellow', score: 10, signals: {}})).toBe(false));
  it('a removed page is not "needs review"', () => expect(needsReview({level: 'yellow', score: 0, signals: {removed: true}})).toBe(false));
  it('red and green never need review', () => {
    expect(needsReview({level: 'red', score: 0, signals: {}})).toBe(false);
    expect(needsReview({level: 'green', score: 0, signals: {unverified: true}})).toBe(false);
  });
  it('no analysis is not "needs review"', () => expect(needsReview(undefined)).toBe(false));
});
