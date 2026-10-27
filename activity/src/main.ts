// Fonts are bundled: the Activity sandbox cannot load Google Fonts.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/literata/700.css';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { applyCachedAppearance } from './lib/appearance';

applyCachedAppearance();

export default mount(App, { target: document.getElementById('app')! });
