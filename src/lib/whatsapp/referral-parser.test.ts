import { describe, it, expect } from 'vitest';
import { classifyReferral } from './referral-parser';

describe('classifyReferral', () => {
  it('should return other for missing or empty referral payloads', () => {
    expect(classifyReferral(undefined)).toBe('other');
    expect(classifyReferral({})).toBe('other');
  });

  it('should identify instagram channels correctly', () => {
    expect(
      classifyReferral({
        source_url: 'https://instagram.com/p/DBcdE123',
        source_type: 'post',
      })
    ).toBe('instagram');

    expect(
      classifyReferral({
        source_url: 'https://ig.me/m/some_page',
        source_type: 'ad',
      })
    ).toBe('instagram');

    expect(
      classifyReferral({
        source_type: 'instagram_direct',
      })
    ).toBe('instagram');
  });

  it('should identify google channels correctly', () => {
    expect(
      classifyReferral({
        source_url: 'https://www.google.com/search?q=wacrm',
      })
    ).toBe('google');

    expect(
      classifyReferral({
        source_url: 'https://google.co.uk/',
      })
    ).toBe('google');
  });

  it('should identify facebook ads correctly', () => {
    expect(
      classifyReferral({
        source_type: 'ad',
        source_url: 'https://fb.com/ads/12345',
      })
    ).toBe('facebook_ads');

    expect(
      classifyReferral({
        source_type: 'ad',
      })
    ).toBe('facebook_ads');
  });

  it('should identify facebook posts correctly', () => {
    expect(
      classifyReferral({
        source_type: 'post',
        source_url: 'https://facebook.com/permalink.php?story_fbid=123',
      })
    ).toBe('facebook_post');

    expect(
      classifyReferral({
        source_url: 'https://fb.me/my_post',
      })
    ).toBe('facebook_post');

    expect(
      classifyReferral({
        source_type: 'post',
      })
    ).toBe('facebook_post');
  });

  it('should fallback to other for unrecognized referral structures', () => {
    expect(
      classifyReferral({
        source_url: 'https://twitter.com/post',
        source_type: 'tweet',
      })
    ).toBe('other');
  });
});
