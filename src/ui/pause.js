import { el, showScreen, closeScreen } from './ui.js';
import { audio } from '../core/audio.js';

export function showPause(game) {
  const st = game.state; game.pauseOpen = true; game.engine.paused = true; game.input.unlock();
  const resume = () => { closeScreen(); game.pauseOpen = false; game.engine.paused = false; };
  const diff = el('select', {}, ...['Chill', 'Normal', 'Full Send'].map((n, i) => { const o = el('option', { value: i }, n); if (st.settings.difficulty === i) o.selected = true; return o; }));
  diff.onchange = () => { st.settings.difficulty = +diff.value; st.persist(); };
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.settings.volume });
  vol.oninput = () => { st.settings.volume = +vol.value; audio.setVolume(+vol.value); st.persist(); };
  const voice = el('input', { type: 'checkbox' }); voice.checked = st.settings.voice;
  voice.onchange = () => { st.settings.voice = voice.checked; audio.voice = voice.checked; st.persist(); };
  const box = el('div', { class: 'panel menu' }, el('h2', {}, 'Paused'),
    el('div', { class: 'stat-row' }, el('span', {}, 'Rhythm difficulty'), diff),
    el('div', { class: 'stat-row' }, el('span', {}, 'Volume'), vol),
    el('div', { class: 'stat-row' }, el('span', {}, 'Voice lines (browser speech)'), voice),
    el('div', { class: 'small', style: { margin: '10px 0' } }, 'WASD move · Shift run · mouse look · E interact · F throw · 1/2/3 pick throwable · C cross arms · P phone · Tab swap bandmate · Q ability · H hide hints · D F J K rhythm lanes'),
    el('div', { class: 'row' }, el('button', { class: 'btn ghost', onclick: e => { const b = e.currentTarget; if (b.dataset.armed) location.reload(); else { b.dataset.armed = '1'; b.textContent = 'Click again to quit'; } } }, 'Quit gig'), el('div', { class: 'spacer' }), el('button', { class: 'btn', onclick: resume }, 'Resume')));
  showScreen(box);
}
