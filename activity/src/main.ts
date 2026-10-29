// Fonts are bundled: the Activity sandbox cannot load Google Fonts.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/literata/700.css';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { sendPresence } from './lib/api';
import { applyCachedAppearance } from './lib/appearance';

applyCachedAppearance();
// Discord tells the Activity where it runs; on mobile it floats its own bar over the page.
document.documentElement.dataset.platform = new URLSearchParams(location.search).get('platform') ?? 'desktop';
document.addEventListener('visibilitychange', () => sendPresence(document.hidden ? 'hidden' : 'visible'));
window.addEventListener('pagehide', () => sendPresence('leave'));

export default mount(App, { target: document.getElementById('app')! });
