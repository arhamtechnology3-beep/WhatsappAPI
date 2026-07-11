export type SourceChannel = 'instagram' | 'facebook_post' | 'facebook_ads' | 'google' | 'other';

/**
 * Classifies click-to-whatsapp webhook referral payload into one of 5 standard channels.
 */
export function classifyReferral(referral?: {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}): SourceChannel {
  if (!referral) return 'other';

  const sourceUrl = (referral.source_url || '').toLowerCase();
  const sourceType = (referral.source_type || '').toLowerCase();

  // 1. Instagram: Check URL first (could contain instagram.com or ig.me), or source type matches instagram
  if (
    sourceUrl.includes('instagram.com') ||
    sourceUrl.includes('ig.me') ||
    sourceType.includes('instagram')
  ) {
    return 'instagram';
  }

  // 2. Google: Check URL for google domain names
  if (sourceUrl.includes('google.com') || sourceUrl.includes('google.')) {
    return 'google';
  }

  // 3. Facebook Ads: Click-to-whatsapp ad clicks have source_type = 'ad'
  if (sourceType === 'ad') {
    return 'facebook_ads';
  }

  // 4. Facebook Post: Organic page post clicks have source_type = 'post'
  if (
    sourceType === 'post' ||
    sourceUrl.includes('facebook.com') ||
    sourceUrl.includes('fb.com') ||
    sourceUrl.includes('fb.me')
  ) {
    return 'facebook_post';
  }

  // 5. Other: Fallback
  return 'other';
}
