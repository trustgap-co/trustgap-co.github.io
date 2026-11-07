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
  // Both forms post to the TrustGap Worker, which forwards them to your Make.com webhook (the secret
  // LEADS_WEBHOOK_URL in Cloudflare, never in this file) and so to your Google Sheet.
  // Until LEADS_WEBHOOK_URL is set, the forms tell visitors their answers couldn’t be saved.
  // The early-access code shown after sign-up. MUST match PROMO_CODE in the Worker's settings.
  earlyAccessCode: 'EARLYGAP',
  earlyAccessCodeEnds: '31 January 2027', // keep in step with PROMO_ENDS in the Worker
  // Under-18s can take the survey anonymously. Their phone/email is only collected if your lawyer
  // approves it (children's data needs parental consent under the NDPA): then set this to true.
  allowUnder18Contact: false,

  legalName: 'Tubalcain Ads Enterprise', // TrustGap is a trading name of this business
  rcNumber: '9568185',
  registeredAddress: 'Warri, Delta State, Nigeria',
  operatingAddress: 'Lagos Nigeria',
  supportEmail: 'trustgap.co@gmail.com',
  privacyEmail: 'trustgap.co@gmail.com',
  complaintsEmail: 'trustgap.co@gmail.com',
  complianceEmail: 'trustgap.co@gmail.com',
  supportPhone: '0703 705 8330',
  supportHours: 'Monday to Saturday, 8am–8pm (WAT). Messages outside these hours are answered the next working morning',
  dpo: 'The CTO, acting as Data Protection Officer',
  effectiveDate: '23 November 2026',
  lastUpdated: '23 November 2026',
  minimumAge: '18',
  inspectionWindow: '24 hours',
  disputeAckTime: '24 hours',
  sellerResponseTime: '24 hours',
  refundTime: 'Sent within 2 working days of the decision, once the original payment has settled. Your bank may take up to 1–3 further working days to credit it',
  payoutTiming: 'the next working day after the buyer’s payment settles, once the release condition is met',
  deliveryCoverage: 'Comprehensive nationwide coverage across all 36 states',
  governingLaw: 'the Federal Republic of Nigeria',
  // Website analytics. Paste your IDs here (leave the placeholders to keep tracking off):
  //  - ga4Id: GA4 → Admin → Data streams → your web stream → "Measurement ID" (looks like G-AB12CD34EF)
  //  - metaPixelId: Meta Events Manager → Data sources → your pixel → the number under its name
  // requireConsent: false = trackers load on every visit (no banner); visitors can switch them off
  // with "Cookie settings" in the footer. true = they load only after a visitor taps Accept.
  tracking: {
    ga4Id: 'G-XPCY6S38PQ',
    metaPixelId: '000000000000000',
    requireConsent: true,
  },
  // Set to true only after your lawyer approves the policy pages: removes the "draft" notice.
  policiesApproved: true,
  // Set to true only after Flutterwave and Fez Delivery approve how they are named on the site.
  partnerNamesApproved: true,
};
