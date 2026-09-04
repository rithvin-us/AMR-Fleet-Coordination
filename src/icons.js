// =============================================================================
//  icons.js — Inline flat SVG icon system (zero-dependency, no icon font/CDN)
//
//  Replaces the Font Awesome web-font (a runtime CDN dependency + emoji-ish
//  glyph rendering) with a curated set of professional, flat, single-stroke
//  SVG icons drawn on a 24×24 grid. Every icon inherits `currentColor`, so it
//  picks up the surrounding text/accent colour, and scales to 1em.
//
//  Usage
//  -----
//    import { hydrateIcons } from './icons.js';
//    hydrateIcons(document);          // swap every <i class="fa-*"> for SVG
//
//  The existing markup (`<i class="fas fa-play"></i>`) is kept verbatim; this
//  module rewrites each <i>'s contents to the matching inline SVG at render
//  time. Call hydrateIcons(root) after any dynamic innerHTML update.
// =============================================================================

// Inner markup for each icon (paths drawn for a 24×24 viewBox, stroke style).
const P = {
  'angles-left': '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrows-spin': '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  'arrows-up-down': '<polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/>',
  bars: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'battery-quarter': '<rect x="2" y="8" width="16" height="9" rx="2"/><line x1="22" y1="11" x2="22" y2="14"/><rect x="4" y="10" width="3" height="5" fill="currentColor" stroke="none"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'border-all': '<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  'building-user': '<path d="M3 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><line x1="7" y1="7" x2="10" y2="7"/><line x1="7" y1="11" x2="10" y2="11"/><circle cx="18" cy="14" r="2"/><path d="M15 21a3 3 0 0 1 6 0"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  'chart-line': '<polyline points="3 3 3 21 21 21"/><polyline points="7 15 11 10 14 13 20 6"/>',
  'chart-pie': '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'circle-info': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12" y2="8"/>',
  'circle-plus': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'circle-stop': '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  'clock-rotate-left': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 8 12 12 15 14"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  cubes: '<rect x="3" y="10" width="8" height="8" rx="1"/><rect x="13" y="10" width="8" height="8" rx="1"/><rect x="8" y="3" width="8" height="8" rx="1"/>',
  'diagram-project': '<rect x="3" y="14" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><rect x="9" y="4" width="6" height="6" rx="1"/><path d="M6 14v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="10" x2="12" y2="14"/>',
  'diamond-turn-right': '<path d="M10.5 20.4 3.6 13.5a2 2 0 0 1 0-2.8l6.9-6.9a2 2 0 0 1 2.8 0l6.9 6.9a2 2 0 0 1 0 2.8l-6.9 6.9a2 2 0 0 1-2.8 0z"/><polyline points="11 10 14 12 11 14"/><line x1="9" y1="12" x2="14" y2="12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  ellipsis: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  'file-code': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 12 8 14 10 16"/><polyline points="14 12 16 14 14 16"/>',
  'fire-flame-curved': '<path d="M12 22c4 0 7-2.5 7-6.5 0-2-1-3.8-2.5-5.2-.3 1.3-1.2 2.2-2 2.2 1-3-1-5.8-4-7.5.4 3-1.2 4.6-2.6 6C6.6 6.4 5 8.9 5 11.5 5 15.5 8 22 12 22z"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7" y1="15" x2="17" y2="15"/>',
  'flask-vial': '<path d="M9 3h5"/><path d="M10 3v5l-4 8a2 2 0 0 0 1.8 3h6.4A2 2 0 0 0 16 16l-3-8V3"/><line x1="7" y1="14" x2="15" y2="14"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/><line x1="7" y1="11" x2="7" y2="14"/><line x1="5.5" y1="12.5" x2="8.5" y2="12.5"/><circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="14" r="1" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.6 5.4L4.5 5.3a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10.6h.4a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1z"/>',
  hand: '<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V3.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11V5.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-2.3-4a1.5 1.5 0 0 1 2.6-1.5L9 15"/>',
  'hand-pointer': '<path d="M9 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11.5V7a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L9 15"/>',
  hourglass: '<path d="M6 3h12"/><path d="M6 21h12"/><path d="M6 3c0 4 3 6 6 9 3-3 6-5 6-9"/><path d="M6 21c0-4 3-6 6-9 3 3 6 5 6 9"/>',
  'hourglass-half': '<path d="M6 3h12"/><path d="M6 21h12"/><path d="M6 3c0 4 3 6 6 9 3-3 6-5 6-9"/><path d="M6 21c0-4 3-6 6-9 3 3 6 5 6 9"/><line x1="9" y1="18" x2="15" y2="18"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><line x1="10.7" y1="12.3" x2="20" y2="3"/><line x1="17" y1="6" x2="20" y2="9"/><line x1="14" y1="9" x2="17" y2="12"/>',
  'layer-group': '<polygon points="12 3 22 8.5 12 14 2 8.5 12 3"/><polyline points="2 13 12 18.5 22 13"/><polyline points="2 17.5 12 23 22 17.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  'list-check': '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/>',
  'location-dot': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  'magnifying-glass': '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  microchip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="0.5"/><line x1="9" y1="3" x2="9" y2="6"/><line x1="15" y1="3" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="21"/><line x1="15" y1="18" x2="15" y2="21"/><line x1="3" y1="9" x2="6" y2="9"/><line x1="3" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="21" y2="9"/><line x1="18" y1="15" x2="21" y2="15"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  'network-wired': '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v3M5 16v-2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2"/>',
  'paper-plane': '<path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  'plug-circle-xmark': '<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><line x1="12" y1="16" x2="12" y2="22"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'plus-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'power-off': '<line x1="12" y1="2" x2="12" y2="12"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  'road-barrier': '<rect x="2" y="8" width="20" height="7" rx="1"/><line x1="3" y1="15" x2="3" y2="21"/><line x1="21" y1="15" x2="21" y2="21"/><line x1="6" y1="8" x2="10" y2="15"/><line x1="12" y1="8" x2="16" y2="15"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  'rotate-left': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h6"/>',
  'ruler-combined': '<path d="M3 3h6v18H3z"/><path d="M9 15h12v6H9z"/><line x1="3" y1="7" x2="6" y2="7"/><line x1="3" y1="11" x2="6" y2="11"/><line x1="13" y1="15" x2="13" y2="18"/><line x1="17" y1="15" x2="17" y2="18"/>',
  'ruler-horizontal': '<rect x="2" y="8" width="20" height="8" rx="1"/><line x1="7" y1="8" x2="7" y2="12"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="17" y1="8" x2="17" y2="12"/>',
  'satellite-dish': '<path d="M4 20a10 10 0 0 1 10-10"/><path d="M4 15a5 5 0 0 1 5-5"/><circle cx="4.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/><path d="M13 10l4-4a2 2 0 0 1 3 0l-1 1"/><path d="M15 8l3 3 2-2"/>',
  'scale-balanced': '<line x1="12" y1="3" x2="12" y2="21"/><line x1="6" y1="21" x2="18" y2="21"/><path d="M6 6h12"/><path d="M6 6 3 13a3 3 0 0 0 6 0z"/><path d="M18 6l3 7a3 3 0 0 1-6 0z"/>',
  scroll: '<path d="M5 4a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1h-4"/><path d="M17 4H5a2 2 0 0 0-2 2 2 2 0 0 0 2 2h2"/><line x1="10" y1="8" x2="17" y2="8"/><line x1="10" y1="12" x2="17" y2="12"/>',
  'share-nodes': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.7" x2="15.4" y2="6.3"/><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"/>',
  'shield-halved': '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/><line x1="12" y1="2" x2="12" y2="22"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/>',
  stopwatch: '<circle cx="12" cy="13" r="8"/><line x1="12" y1="13" x2="12" y2="8"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="19" y1="6" x2="20.5" y2="4.5"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="3" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="21" y2="12"/><line x1="5" y1="5" x2="7" y2="7"/><line x1="17" y1="17" x2="19" y2="19"/><line x1="5" y1="19" x2="7" y2="17"/><line x1="17" y1="7" x2="19" y2="5"/>',
  tasks: '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/>',
  'tower-broadcast': '<circle cx="12" cy="9" r="2"/><path d="M12 11v10"/><path d="M8.5 12.5a5 5 0 0 1 0-7M15.5 5.5a5 5 0 0 1 0 7"/><path d="M6 15a8 8 0 0 1 0-12M18 3a8 8 0 0 1 0 12"/>',
  trash: '<polyline points="3 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  'triangle-exclamation': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/>',
  'truck-ramp-box': '<path d="M2 17h11V7H2z"/><path d="M13 10h4l4 4v3h-8z"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'user-gear': '<circle cx="9" cy="8" r="3.5"/><path d="M3 21a6 6 0 0 1 11-3.3"/><circle cx="18" cy="17" r="2"/><path d="M18 14v1.2M18 18.8V20M21 17h-1.2M16.2 17H15"/>',
  'vector-square': '<rect x="4" y="4" width="16" height="16" rx="1"/><rect x="2" y="2" width="4" height="4" rx="0.5"/><rect x="18" y="2" width="4" height="4" rx="0.5"/><rect x="2" y="18" width="4" height="4" rx="0.5"/><rect x="18" y="18" width="4" height="4" rx="0.5"/>',
  'wand-magic-sparkles': '<line x1="4" y1="20" x2="14" y2="10"/><path d="M14 10l3-3"/><path d="M17 3v3M15.5 4.5h3"/><path d="M20 13v2M19 14h2"/><path d="M8 5v2M7 6h2"/>',
  'wave-square': '<path d="M3 12h4V5h6v14h6v-7h2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><line x1="12" y1="19.5" x2="12" y2="19.5"/><path d="M2 9a15 15 0 0 1 20 0"/>',
  xmark: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>',
};

// A couple of aliases so a few near-synonym names resolve without duplicate art.
const ALIAS = {
  refresh: 'rotate',
  settings: 'gear',
  search: 'magnifying-glass',
  close: 'xmark',
  edit: 'pen',
};

/** Return a full <svg> string for an icon name, or null if unknown. */
export function svgIcon(name, { spin = false } = {}) {
  const key = ALIAS[name] || name;
  const inner = P[key];
  if (!inner) return null;
  const cls = spin ? ' class="spin"' : '';
  return `<svg${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/**
 * Replace every `<i class="fa-*">` element under `root` with its inline SVG.
 * Idempotent: elements already hydrated (data-icon set) are skipped. Unknown
 * names fall back to a neutral dot so layout never breaks.
 */
export function hydrateIcons(root = document) {
  const nodes = root.querySelectorAll('i[class*="fa-"]:not([data-icon])');
  for (const el of nodes) {
    let name = null;
    let spin = false;
    for (const c of el.classList) {
      if (c === 'fa-spin') spin = true;
      else if (c.startsWith('fa-') && c !== 'fa-fw') {
        const candidate = c.slice(3);
        if (P[candidate] || ALIAS[candidate]) name = candidate;
        else if (!name) name = candidate; // remember for fallback/warn
      }
    }
    const svg = (name && svgIcon(name, { spin })) || FALLBACK;
    el.innerHTML = svg;
    el.setAttribute('data-icon', name || 'unknown');
  }
}

const FALLBACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>';
