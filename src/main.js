// =============================================================================
//  main.js — Application controller
//
//  Owns the Simulation instance, page navigation, the global chrome (sim
//  controls, clock, mesh pill, alerts, theme) and the live update loop that
//  re-renders the active page on every simulation tick.
// =============================================================================

import './style.css';
import { Simulation } from './engine/simulation.js';
import { PAGES } from './pages.js';
import { hydrateIcons } from './icons.js';

const sim = new Simulation();
window.__sim = sim; // handy for debugging in the console

// ----- DOM refs -----
const $ = (id) => document.getElementById(id);
const sidebar = $('sidebar');
const pageContainer = $('pageContainer');
const bcPage = $('bcPage');

let currentPage = 'dashboard';
let currentUpdate = null;

// ---------------------------------------------------------------------------
//  Navigation
// ---------------------------------------------------------------------------
function navigateTo(page) {
  const def = PAGES[page];
  if (!def) return;
  currentPage = page;
  currentUpdate = null;
  bcPage.textContent = def.title;
  pageContainer.innerHTML = def.render(sim);
  currentUpdate = def.mount(sim, pageContainer) || null;
  if (currentUpdate) currentUpdate(sim);
  hydrateIcons(pageContainer);
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  sidebar.classList.remove('mobile-open');
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => navigateTo(item.dataset.page)));

// Delegated handler for per-AMR fault buttons rendered inside the Fleet view.
pageContainer.addEventListener('click', (e) => {
  const fb = e.target.closest('button[data-fail]');
  if (fb && currentPage === 'fleet') sim.injectFailure(fb.dataset.fail);
});

// ---------------------------------------------------------------------------
//  Sidebar & Resizer (Drag to resize Taskbar width)
// ---------------------------------------------------------------------------
$('sidebarToggle').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  if (sidebar.classList.contains('collapsed')) {
    sidebar.style.width = '';
  } else {
    const w = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
    if (w) sidebar.style.width = w;
  }
});
$('mobileMenuBtn').addEventListener('click', () => sidebar.classList.toggle('mobile-open'));

const sidebarResizer = $('sidebarResizer');
if (sidebar && sidebarResizer) {
  let isResizing = false;

  sidebarResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    sidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    if (sidebar.classList.contains('collapsed')) return;
    const newWidth = Math.max(160, Math.min(480, e.clientX));
    sidebar.style.width = `${newWidth}px`;
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      sidebarResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ---------------------------------------------------------------------------
//  Simulation controls
// ---------------------------------------------------------------------------
const btnPlay = $('btnPlayPause');
btnPlay.addEventListener('click', () => {
  sim.toggleRun();
  syncPlayButton();
});
$('btnReset').addEventListener('click', () => {
  sim.reset();
  navigateTo(currentPage); // rebuild the active view against fresh state
  syncPlayButton();
});
$('speedGroup').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-speed]');
  if (!b) return;
  sim.setSpeed(Number(b.dataset.speed));
  $('speedGroup').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
});
$('globalEstopTop').addEventListener('click', () => {
  if (sim.estopActive) sim.releaseEStop();
  else sim.globalEStop();
});

function syncPlayButton() {
  const icon = btnPlay.querySelector('i');
  icon.className = sim.running ? 'fas fa-pause' : 'fas fa-play';
  icon.removeAttribute('data-icon'); // force re-render of the swapped glyph
  hydrateIcons(btnPlay);
  btnPlay.classList.toggle('paused', !sim.running);
}

// ---------------------------------------------------------------------------
//  Alerts panel
// ---------------------------------------------------------------------------
const alertsPanel = $('alertsPanel');
let lastSeenAlertT = 0;
$('alertsBtn').addEventListener('click', () => {
  alertsPanel.classList.toggle('open');
  if (alertsPanel.classList.contains('open')) {
    lastSeenAlertT = sim.time;
    renderAlerts();
    updateAlertBadge();
  }
});
$('closeAlerts').addEventListener('click', () => alertsPanel.classList.remove('open'));

function renderAlerts() {
  const list = $('alertsList');
  list.innerHTML = sim.alerts.length
    ? sim.alerts
        .map(
          (a) => `<div class="alert-item ${a.type}"><div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div><div class="alert-time"><i class="fas fa-clock"></i> T+${a.time}</div></div>`,
        )
        .join('')
    : '<div class="alerts-empty">No alerts — fleet nominal.</div>';
  hydrateIcons(list);
}

function updateAlertBadge() {
  const badge = $('alertBadge');
  const n = sim.alerts.filter((a) => a.t > lastSeenAlertT).length;
  badge.textContent = n;
  badge.hidden = n === 0;
}

// ---------------------------------------------------------------------------
//  Global chrome refresh + live page update (driven by the sim tick)
// ---------------------------------------------------------------------------
function refreshChrome() {
  $('simClock').textContent = clock(sim.time / 1000);
  $('meshMsgs').textContent = sim.bus.sent;
  const est = $('globalEstopTop');
  est.classList.toggle('active', !!sim.estopActive);
  if (alertsPanel.classList.contains('open')) renderAlerts();
  updateAlertBadge();
}

sim.subscribe(() => {
  if (currentUpdate) {
    try {
      currentUpdate(sim);
      hydrateIcons(pageContainer); // hydrate any freshly-injected <i> icons
    } catch (err) {
      console.error('page update error', err);
    }
  }
  refreshChrome();
});

function clock(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
hydrateIcons(document); // render static chrome icons (sidebar, topbar)
navigateTo('dashboard');
sim.start();
syncPlayButton();
