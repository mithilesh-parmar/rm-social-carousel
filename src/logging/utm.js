const DEFAULT_TARGET_URL = 'https://rmpsyllium.com/contact/';
const PLATFORMS = ['linkedin', 'instagram', 'facebook', 'tiktok'];

/** Builds one UTM-tagged link per platform for the SAME topic, so GA4
 *  (already wired on the live site) can eventually attribute site traffic
 *  back to a specific carousel topic/platform even before any platform
 *  analytics API is integrated — the whole point of instrumenting from day
 *  one while there's no other feedback signal yet. */
export function buildUtmLinks(topicSlug, targetUrl = DEFAULT_TARGET_URL) {
  return PLATFORMS.map((platform) => {
    const url = new URL(targetUrl);
    url.searchParams.set('utm_source', platform);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', topicSlug);
    return { platform, url: url.toString() };
  });
}
