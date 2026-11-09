// Where the installed app opens (manifest start_url): a logged-in seller goes to their dashboard,
// everyone else to the home page.
import { auth, link } from '../core.js';

location.replace(link(auth.seller() ? 'seller/dashboard.html?source=app' : 'index.html?source=app'));
