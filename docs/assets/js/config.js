// Where the Cloudflare Worker (the API) lives. Change API_URL after `wrangler deploy` prints your URL.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API_URL = local ? 'http://localhost:8787' : 'https://trustgap-api.trustgap-co.workers.dev/';
