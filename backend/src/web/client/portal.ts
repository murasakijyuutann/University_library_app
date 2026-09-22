import './portal.css';
import { mountThesisUploads } from './thesis-upload';

/**
 * Small vanilla TypeScript entry for the portal (Phase 6).
 * HTMX is loaded from the layout CDN; this bundle owns CSS + thesis upload UX.
 */
document.documentElement.classList.add('js');
mountThesisUploads(document);
