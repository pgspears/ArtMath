// Player: scene loading, the animation loop, adaptive resolution, film mode, controls,
// commentary panel and sound.
import { Engine, Post, Lines, Points } from './engine.js';
import SCENES from './scenes/index.js';
import CONTENT from './content.js';
import { Score } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#c'), stage = $('#stage'), overlay = $('#overlay');
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const coarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let qualityChanged = false;
let eng, ctx, idx = 0, scene = null, t = 0, playing = !reduceMotion, film = false, quality = 'auto', scale = 1;
const score = new Score();

function fail(msg) {
  stage.classList.add('failed');
  $('#fail').textContent = msg + ' Try a recent version of Chrome, Edge, Firefox or Safari on a computer.';
}

let fixedSize = null;
function sizeCanvas() {
  if (fixedSize) { canvas.width = fixedSize[0]; canvas.height = fixedSize[1]; return; }
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
  let w = Math.round(r.width * dpr * scale);
  w = Math.max(320, Math.min(w, 2560));
  const h = Math.round(w * 9 / 16);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function simQuality() { return quality === 'low' || (quality === 'auto' && coarse) ? 'low' : 'high'; }

function load(i, { keepHash = false } = {}) {
  if (scene) { try { scene.dispose(ctx); } catch (e) { console.error(e); } }
  [...overlay.children].forEach((n) => { if (!n.classList.contains('caption')) n.remove(); });
  const ni = (i + SCENES.length) % SCENES.length;
  const same = scene === SCENES[ni] && !qualityChanged;
  qualityChanged = false;
  idx = ni;
  scene = SCENES[idx];
  if (!same) scale = quality === 'low' ? 0.5 : quality === 'high' ? 1 : (scene.heavy ? (coarse ? 0.45 : 0.7) : (coarse ? 0.7 : 1));
  sizeCanvas();
  ctx.quality = simQuality();
  try { scene.init(ctx); } catch (e) { console.error(e); fail('This scene could not start on this device.'); return; }
  t = 0; frames = 0; slowSince = 0;
  updatePanel(); showCaption();
  score.setScene(scene);
  if (!keepHash && !TEST) history.replaceState(null, '', `#${scene.id}`);
  document.querySelectorAll('.contents a').forEach((a, k) => a.setAttribute('aria-current', k === idx ? 'true' : 'false'));
}

// ---- commentary panel and caption
function updatePanel() {
  const c = CONTENT[scene.id], n = idx + 1;
  $('#n-num').textContent = n;
  $('#n-title').textContent = scene.title;
  $('#n-lede').textContent = c.lede;
  $('#n-see').textContent = c.see;
  $('#n-formula').innerHTML = c.formula;
  $('#n-math').textContent = c.math;
  $('#n-code').textContent = c.code;
  $('#n-facts').innerHTML = c.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#n-vol').textContent = scene.vol === 1 ? 'Volume I' : 'Volume II';
}
let capIn, capOut;
function showCaption() {
  const cap = $('#caption');
  cap.querySelector('.cap-num').textContent = idx + 1;
  cap.querySelector('.cap-title').textContent = scene.title;
  cap.querySelector('.cap-hook').textContent = scene.hook;
  cap.classList.remove('show');
  clearTimeout(capIn); clearTimeout(capOut);
  capIn = setTimeout(() => cap.classList.add('show'), 600);
  capOut = setTimeout(() => cap.classList.remove('show'), 8500);
}

// ---- transitions
let switching = false;
function go(i) {
  if (switching) return;
  switching = true;
  stage.classList.add('dim');
  setTimeout(() => { load(i); requestAnimationFrame(() => { stage.classList.remove('dim'); switching = false; }); }, 380);
}

// ---- loop with adaptive resolution
let last = performance.now(), frames = 0, ema = 16, slowSince = 0, lastAdjust = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (scene && !switching) {
    if (playing) t += dt;
    try { scene.frame(ctx, t); } catch (e) { console.error(e); fail('Something went wrong drawing this scene.'); return; }
    frames++;
    ema = ema * 0.92 + dt * 1000 * 0.08;
    if (quality === 'auto' && frames > 20 && now - lastAdjust > 1500) {
      let ns = scale;
      if (ema > 40) ns = Math.max(0.35, scale * 0.82);
      else if (ema < 19 && scale < 1) ns = Math.min(1, scale * 1.12);
      if (Math.abs(ns - scale) > 0.01) { scale = ns; sizeCanvas(); lastAdjust = now; }
    }
    $('#bar').style.transform = `scaleX(${Math.min(1, t / scene.duration)})`;
    if (t >= scene.duration) { if (film) go(idx + 1); else { t = 0; restartScene(); } }
  }
  requestAnimationFrame(loop);
}
function restartScene() { load(idx, { keepHash: true }); }

// ---- controls
function setPlaying(p) {
  playing = p;
  const b = $('#play');
  b.setAttribute('aria-pressed', String(!p));
  b.querySelector('.lbl').textContent = p ? 'Pause' : 'Play';
  b.querySelector('use').setAttribute('href', p ? '#i-pause' : '#i-play');
}
function setFilm(on) {
  film = on;
  $('#film').setAttribute('aria-pressed', String(on));
  $('#film .lbl').textContent = on ? 'Watching the film' : 'Play the film';
  if (on) { setPlaying(true); go(0); }
}
async function toggleSound() {
  const b = $('#sound');
  if (score.on) { score.stop(); b.setAttribute('aria-pressed', 'false'); b.querySelector('.lbl').textContent = 'Sound off'; }
  else { await score.start(); score.setScene(scene); b.setAttribute('aria-pressed', 'true'); b.querySelector('.lbl').textContent = 'Sound on'; }
}
function buildContents() {
  const mk = (vol) => SCENES.map((s, k) => [s, k]).filter(([s]) => s.vol === vol)
    .map(([s, k]) => `<li><a href="#${s.id}" data-k="${k}"><span class="num">${k + 1}</span><span class="ttl">${s.title}</span></a></li>`).join('');
  $('#toc1').innerHTML = mk(1);
  $('#toc2').innerHTML = mk(2);
  document.querySelectorAll('.contents a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    setFilm(false);
    go(+a.dataset.k);
    stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }));
}

function init() {
  try {
    eng = new Engine(canvas);
  } catch (e) { fail(e.message); return; }
  ctx = { eng, gl: eng.gl, overlay, quality: 'high', score };
  ctx.post = new Post(eng); ctx.lines = new Lines(eng); ctx.points = new Points(eng);
  if (TEST) window.__ctx = ctx;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('The graphics card stopped responding.'); });
  buildContents();
  $('#prev').onclick = () => { setFilm(false); go(idx - 1); };
  $('#next').onclick = () => go(idx + 1);
  $('#play').onclick = () => setPlaying(!playing);
  $('#restart').onclick = () => restartScene();
  $('#film').onclick = () => setFilm(!film);
  $('#sound').onclick = toggleSound;
  $('#quality').onchange = (e) => { quality = e.target.value; qualityChanged = true; restartScene(); };
  $('#full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
  };
  document.addEventListener('fullscreenchange', () => setTimeout(sizeCanvas, 50));
  addEventListener('resize', () => sizeCanvas());
  addEventListener('keydown', (e) => {
    if (e.target.closest('select, input, textarea')) return;
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === 'ArrowLeft') { setFilm(false); go(idx - 1); }
    else if (e.key === 'f') $('#full').click();
    else if (e.key === 'r') restartScene();
  });
  addEventListener('hashchange', () => {
    const k = SCENES.findIndex((s) => '#' + s.id === location.hash);
    if (k >= 0 && k !== idx) go(k);
  });
  setPlaying(playing);
  const start = SCENES.findIndex((s) => '#' + s.id === location.hash);
  load(start >= 0 ? start : 0, { keepHash: start < 0 });
  if (TEST) return;
  requestAnimationFrame((n) => { last = n; loop(n); });
}

// Test hook: render scene `id` at time `time` on a fixed-size canvas, stepping at 30 fps.
window.renderAt = async (id, time, w = 640, h = 360, q = 'high') => {
  quality = q; fixedSize = [w, h];
  const k = SCENES.findIndex((s) => s.id === id);
  load(k, { keepHash: true });
  const steps = Math.round(time * 30);
  for (let f = 0; f <= steps; f++) {
    if (f % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    scene.frame(ctx, f / 30);
  }
  const err = eng.gl.getError();
  return { err, url: canvas.toDataURL('image/png') };
};

init();
