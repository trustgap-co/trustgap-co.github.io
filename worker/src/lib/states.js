// The 36 states and FCT, spelled the way Fez expects them (GET /states).
export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

const ALIASES = { abuja: 'FCT', 'federal capital territory': 'FCT', 'fct abuja': 'FCT', 'abuja fct': 'FCT', nassarawa: 'Nasarawa' };

// Accepts what people type ("lagos", "Lagos State", "Abuja") and returns the official name, or null.
export function normaliseState(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+state$/, '').replace(/\s+/g, ' ');
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  return STATES.find((st) => st.toLowerCase() === s) || null;
}
