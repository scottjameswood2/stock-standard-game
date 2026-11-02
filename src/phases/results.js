import { el, showScreen } from '../ui/ui.js';
import { audio } from '../core/audio.js';
import { ACHIEVEMENTS } from '../systems/state.js';

const UNLOCKS = [[1, 'Tartan beret for Dunny'], [2, 'Gold-trim beret + race-day suit outfit'], [3, '"Racecourse Legends" title + sequinned beret']];

export class Results {
  constructor(game) { this.g = game; this.roam = false; this.drivePlayer = false; this.allowSwitch = false; }
  enter() {
    const g = this.g, st = g.state; g.hud.show(false);
    const songs = st.score.songs, perf = songs.length ? songs.reduce((s, x) => s + x.score, 0) / songs.length : 0;
    const burger = Math.max(0, Math.min(100, 50 + st.score.burger * 0.9));
    const total = Math.round(perf * 0.45 + st.mateship * 0.3 + burger * 0.25);
    const stars = total >= 78 ? 3 : total >= 60 ? 2 : total >= 42 ? 1 : 0;
    const before = new Set(Object.keys(st.save.achievements));
    st.save.gigs++; st.save.bestScore = Math.max(st.save.bestScore, total); st.save.reputation.colac = Math.max(st.save.reputation.colac || 0, stars);
    for (const [n, u] of UNLOCKS) if (stars >= n && !st.save.unlocks.includes(u)) st.save.unlocks.push(u);
    if (stars >= 3) st.unlock('racecourse_legend');
    st.persist(); audio.play(stars >= 2 ? 'cheer' : 'clink');
    g.rig.setShot(g.world.m('poi_mixing_desk').clone().set(-9, 4.2, 15), g.world.m('poi_mixing_desk').clone().set(0, 2.2, 0));
    const box = el('div', { class: 'panel results' },
      el('h1', {}, 'The Colac Cup: done and dusted'),
      el('div', { class: 'stars' }, ...[0, 1, 2].map(i => el('span', { style: i < stars ? {} : { color: '#cfc6b8', textShadow: 'none' } }, '★'))),
      el('div', { class: 'small' }, stars >= 3 ? 'RACECOURSE LEGENDS. The truckie wants you back next year.' : stars === 2 ? 'Solid. The bookie\'s offering $2.50 you get rebooked.' : stars === 1 ? 'You got paid. Mostly.' : 'The horses got a bigger cheer.'),
      el('div', { class: 'stat-row' }, el('span', {}, '🎸 Performance (avg song)'), el('span', {}, Math.round(perf))),
      el('div', { class: 'stat-row' }, el('span', {}, '🤝 Mateship'), el('span', {}, Math.round(st.mateship))),
      el('div', { class: 'stat-row' }, el('span', {}, '🍔 Feedback burgers'), el('span', {}, Math.round(burger))),
      el('div', { class: 'stat-row' }, el('span', {}, '🍺 Final Buzz'), el('span', {}, st.buzzBand())),
      el('div', { class: 'stat-row' }, el('span', {}, '⭐ Gig score'), el('span', {}, total)),
      el('h3', { style: { marginTop: '12px' } }, 'Setlist'),
      ...songs.map(s => el('div', { class: 'stat-row' }, el('span', {}, s.title), el('span', {}, `${Math.round(s.acc * 100)}% · crowd ${Math.round(s.energy)}`))),
      el('h3', { style: { marginTop: '12px' } }, 'Achievements'),
      el('div', { class: 'ach-list' }, ...Object.entries(ACHIEVEMENTS).filter(([, a]) => !a.future).map(([id, a]) => el('span', { class: st.save.achievements[id] ? '' : 'locked' }, st.save.achievements[id] || !a.hidden ? a.name : '???'))),
      st.save.unlocks.length ? el('div', { style: { marginTop: '10px' } }, el('b', {}, 'Unlocked: '), st.save.unlocks.join(' · ')) : null,
      el('div', { class: 'small', style: { marginTop: '10px' } }, 'Coming in later phases: the full roster\'s likeness models, the Yarra Valley winery wedding, the Big Pub Gig, and the combined campaign finale.'),
      el('div', { class: 'row', style: { marginTop: '14px' } }, el('div', { class: 'spacer' }), el('button', { class: 'btn red', onclick: () => location.reload() }, 'Play another gig ▶')));
    showScreen(box);
  }
}
