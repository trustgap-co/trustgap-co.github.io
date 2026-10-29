// Simulated NIN checks for test mode. Any other number is "not found".
export const MOCK_IDS = {
  '11111111111': { firstName: 'ADEBAYO', middleName: 'OLUWASEUN', lastName: 'JOHN', dob: '1990-01-15' },
  '22222222222': { firstName: 'CHIOMA', middleName: 'NGOZI', lastName: 'OKAFOR', dob: '1994-06-02' },
  '33333333333': { firstName: 'MUSA', middleName: 'IBRAHIM', lastName: 'BELLO', dob: '1988-11-30' },
};

// Like the payment simulator, it only works in test mode: outside it, no NIN is ever "verified".
export function createMockIdentity(ctx) {
  const blocked = ctx?.config?.testMode === false
    ? 'Identity checks are set to the simulator (IDENTITY_PROVIDER = mock) but TEST_MODE is false. Set IDENTITY_PROVIDER = monnify, or TEST_MODE = true to test.'
    : null;
  return {
    name: 'mock',
    blocked,
    async verify({ idNumber }) {
      if (blocked) throw Object.assign(new Error(blocked), { retryable: true });
      const person = MOCK_IDS[idNumber];
      if (!person) throw new Error('No record found for that number. In test mode use a test NIN.');
      return { ...person, providerRef: 'mock-' + idNumber.slice(-4) };
    },
  };
}
