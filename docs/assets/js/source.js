// Where the visitor came from (campaign links and ad clicks), remembered on this device from the
// first page they land on. Used by every page (core.js) and by the survey and early-access forms.
const saved = () => { try { return JSON.parse(localStorage.getItem('tg_source') || 'null'); } catch { return null; } };
const save = (v) => { try { localStorage.setItem('tg_source', JSON.stringify(v)); } catch { /* private mode */ } };

// Where the visitor came from, from the link they arrived on: ?source=instagram (or utm_source),
// utm_medium, utm_campaign, utm_content (which ad) and utm_term, plus the ad networks' own click IDs.
// Remembered from the first visit, so it survives moving between pages. `mode` is 'ad' for paid
// traffic and 'organic' otherwise (see surveyMode).
const PAID_MEDIUMS = ['paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'paid-social', 'ads', 'ad', 'display', 'cpm'];
const CLICK_IDS = { fbclid: 'meta', gclid: 'google', ttclid: 'tiktok', twclid: 'x', li_fat_id: 'linkedin' };
export function campaignSource() {
  const q = new URLSearchParams(location.search);
  const before = saved() || {};
  const refHost = document.referrer ? new URL(document.referrer).hostname : '';
  const fresh = q.get('source') || q.get('utm_source') || q.get('utm_medium') || q.get('mode') || Object.keys(CLICK_IDS).some((k) => q.has(k));
  const clickFrom = Object.entries(CLICK_IDS).find(([k]) => q.has(k))?.[1] || '';
  const medium = q.get('utm_medium') || '';
  const paid = q.get('mode') === 'ad' || PAID_MEDIUMS.includes(medium.toLowerCase()) || Boolean(clickFrom);
  const info = fresh
    ? {
        source: q.get('source') || q.get('utm_source') || clickFrom || 'direct',
        medium,
        campaign: q.get('utm_campaign') || '',
        ad: q.get('utm_content') || '',
        term: q.get('utm_term') || '',
        click_from: clickFrom,
        mode: q.get('mode') === 'organic' ? 'organic' : paid ? 'ad' : 'organic',
        landing_page: location.pathname.split('/').pop() || 'index.html',
        referrer: document.referrer ? new URL(document.referrer).hostname : '',
      }
    : { source: refHost && refHost !== location.hostname ? refHost : 'direct', medium: refHost && refHost !== location.hostname ? 'referral' : '', campaign: '', ad: '', term: '', click_from: '', mode: 'organic',
        landing_page: location.pathname.split('/').pop() || 'index.html', referrer: document.referrer ? new URL(document.referrer).hostname : '', ...before };
  save(info);
  return info;
}
// 'ad' when the visitor came from a paid ad (utm_medium=paid/cpc/…, an ad click ID, or ?mode=ad):
// the survey then asks for a name and WhatsApp number first. 'organic' otherwise (?mode=organic forces it).
export const surveyMode = () => campaignSource().mode;
