// Company details shown in the footer and on every policy page. Fill these in ONCE here and every
// page updates. Anything left as "[...]" shows on the site as a highlighted placeholder.
// (From the TrustGap Legal Content Pack: "Required placeholders before publication".)
export const SITE = {
  // ---- Launch switch -------------------------------------------------------------------------
  // false (before launch): the home page and menus promote "Get early access" and the survey; the
  //   "Start a protected deal" / seller sign-up buttons are hidden (the pages still work for testing).
  // true (launch day): the deal buttons come back everywhere and the early-access promotion goes.
  launched: false,
  launchDate: 'Monday, 23 November 2026',

  // ---- Survey and early access ---------------------------------------------------------------
  // Both forms post to this Make.com webhook, which adds a row to your Google Sheet.
  // Until you paste the real URL, the forms show a "not connected" warning and save nothing.
  leadsWebhookUrl: '[MAKE WEBHOOK URL]',
  // The early-access code shown after sign-up. MUST match PROMO_CODE in the Worker's settings.
  earlyAccessCode: 'EARLYGAP',
  earlyAccessCodeEnds: '31 January 2027', // keep in step with PROMO_ENDS in the Worker
  // Under-18s can take the survey anonymously. Their phone/email is only collected if your lawyer
  // approves it (children's data needs parental consent under the NDPA): then set this to true.
  allowUnder18Contact: false,

  legalName: 'Tubalcain Ads Enterprise', // TrustGap is a trading name of this business
  rcNumber: '[RC NUMBER]',
  registeredAddress: '[FULL REGISTERED ADDRESS]',
  operatingAddress: '[OPERATING ADDRESS, IF DIFFERENT]',
  supportEmail: '[SUPPORT EMAIL]',
  privacyEmail: '[PRIVACY OR DPO EMAIL]',
  complaintsEmail: '[COMPLAINTS EMAIL]',
  complianceEmail: '[COMPLIANCE EMAIL]',
  supportPhone: '[SUPPORT NUMBER]',
  supportHours: '[OPERATING HOURS]',
  dpo: '[DATA PROTECTION OFFICER NAME OR ROLE]',
  effectiveDate: '[DATE]',
  lastUpdated: '[DATE]',
  minimumAge: '[18, OR LAWYER-CONFIRMED AGE]',
  inspectionWindow: '24 hours',
  disputeAckTime: '[TIMEFRAME]',
  sellerResponseTime: '[TIMEFRAME]',
  refundTime: '[TIMEFRAME OR RANGE]',
  payoutTiming: 'the next working day after the buyer’s payment settles, once the release condition is met',
  deliveryCoverage: '[CITIES/AREAS COVERED]',
  governingLaw: '[JURISDICTION TO BE CONFIRMED BY LAWYER]',
  // Website analytics. Paste your IDs here (leave the placeholders to keep tracking off):
  //  - ga4Id: GA4 → Admin → Data streams → your web stream → "Measurement ID" (looks like G-AB12CD34EF)
  //  - metaPixelId: Meta Events Manager → Data sources → your pixel → the number under its name
  // requireConsent: false = trackers load on every visit (no banner); visitors can switch them off
  // with "Cookie settings" in the footer. true = they load only after a visitor taps Accept.
  tracking: {
    ga4Id: 'G-XXXXXXXXXX',
    metaPixelId: '000000000000000',
    requireConsent: false,
  },
  // Set to true only after your lawyer approves the policy pages: removes the "draft" notice.
  policiesApproved: false,
  // Set to true only after Flutterwave and Fez Delivery approve how they are named on the site.
  partnerNamesApproved: false,
};
