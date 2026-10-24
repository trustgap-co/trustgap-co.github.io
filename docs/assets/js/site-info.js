// Company details shown in the footer and on every policy page. Fill these in ONCE here and every
// page updates. Anything left as "[...]" shows on the site as a highlighted placeholder.
// (From the TrustGap Legal Content Pack: "Required placeholders before publication".)
export const SITE = {
  legalName: '[TRUSTGAP LEGAL NAME]',
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
  // requireConsent: show a cookie banner and load the trackers only after the visitor accepts.
  // Keep it true unless your lawyer confirms consent isn't needed (see the Cookie Policy).
  tracking: {
    ga4Id: 'G-XXXXXXXXXX',
    metaPixelId: '000000000000000',
    requireConsent: true,
  },
  // Set to true only after your lawyer approves the policy pages: removes the "draft" notice.
  policiesApproved: false,
  // Set to true only after Flutterwave and Fez Delivery approve how they are named on the site.
  partnerNamesApproved: false,
};
