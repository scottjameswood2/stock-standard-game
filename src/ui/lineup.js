import { el, showScreen, closeScreen, toast } from './ui.js';
import { audio } from '../core/audio.js';
import { ACHIEVEMENTS } from '../systems/state.js';

export function showTitle(game) {
  const st = game.state;
  const rep = st.save.reputation.colac || 0;
  const box = el('div', { class: 'title-wrap' },
    el('div', { class: 'title-kicker' }, '★ Pro Gig Edition ★'), el('div', { class: 'title-logo' }, el('span', {}, 'STOCK'), el('br'), el('span', {}, 'STANDARD')), el('div', { class: 'title-script' }, 'The Game'),
    el('div', { class: 'title-tag' }, 'Gig 01 · The Colac Cup · Est. 1998'),
    el('div', { class: 'title-btns' },
      el('button', { class: 'btn red', onclick: () => { audio.init(); audio.play('ok'); showLineup(game); } }, '▶  Pick your Lineup of Five'),
      el('button', { class: 'btn ghost', onclick: () => showHow(game) }, 'How to play'),
      el('button', { class: 'btn ghost', onclick: () => showAch(game) }, `Achievements (${Object.keys(st.save.achievements).length})`)),
    matchMedia('(pointer: coarse)').matches ? el('div', { class: 'small', style: { marginTop: '12px', color: '#1d1a2e', fontWeight: 800 } }, 'Touch controls are on: left thumb to walk, drag the right side to look, tap the lanes to play. Turn your phone sideways for the best view.') : null,
    el('div', { class: 'small', style: { marginTop: '18px', color: '#1d1a2e' } }, rep ? `Racecourse reputation: ${'★'.repeat(rep)}${'☆'.repeat(3 - rep)} · Gigs played: ${st.save.gigs}` : 'Click anywhere in the world to look around once you\'re in. Best with headphones.'));
  showScreen(box, { dim: false });
}

function showHow(game) {
  const rows = [
    ['WASD / left stick', 'Walk (Shift to run)'], ['Mouse drag or click-to-lock / right stick', 'Look around'], ['E', 'Interact / pick up / deliver'],
    ['F', 'Throw (1 bun · 2 patty · 3 lemon)'], ['C (hold)', 'Cross your arms'], ['P', 'Phone out / away'], ['Tab', 'Swap to another bandmate'],
    ['Q', 'Use your ability'], ['D F J K', 'Rhythm lanes during the gig'], ['W / S', 'Pour tilt in the Solo Skull'], ['Esc', 'Pause & settings'],
  ];
  const box = el('div', { class: 'panel menu' }, el('h2', {}, 'How to play'),
    el('p', {}, 'One gig day, five phases: Load-in → Soundcheck → The Gig (two sets, free roam in the break) → Pack-up → the Feedback Burger Circle. Being a good bandmate matters as much as playing well.'),
    ...rows.map(([k, v]) => el('div', { class: 'stat-row' }, el('span', {}, v), el('span', { class: 'kbd' }, k))),
    el('p', { class: 'small' }, 'Secret: waitstaff only offer canapés if you stand still, face them, arms by your sides, phone away.'),
    el('div', { class: 'row' }, el('div', { class: 'spacer' }), el('button', { class: 'btn', onclick: () => showTitle(game) }, 'Back')));
  showScreen(box);
}
function showAch(game) {
  const got = game.state.save.achievements;
  const box = el('div', { class: 'panel menu' }, el('h2', {}, 'Achievements'),
    el('div', { class: 'ach-list' }, ...Object.entries(ACHIEVEMENTS).map(([id, a]) => el('span', { class: got[id] ? '' : 'locked', title: got[id] || !a.hidden ? a.desc : 'Hidden achievement' }, got[id] || !a.hidden ? a.name : '??? (hidden)'))),
    el('div', { class: 'row', style: { marginTop: '12px' } }, el('div', { class: 'spacer' }), el('button', { class: 'btn', onclick: () => showTitle(game) }, 'Back')));
  showScreen(box);
}

export function showLineup(game) {
  const st = game.state, roster = st.roster;
  // random "pulled out sick" event (Dave Stockman is immune; Scotty is the only lead so he's spared too)
  if (st.sick === null) {
    const pool = roster.members.filter(m => !m.abilities.includes('never_sick') && m.id !== 'scotty_woods');
    st.sick = Math.random() < 0.18 ? pool[Math.floor(Math.random() * pool.length)].id : '';
  }
  const lineup = { ...st.lineup };
  for (const [slot, id] of Object.entries(lineup)) if (id === st.sick) lineup[slot] = roster.members.find(m => m.slots.includes(slot) && m.id !== st.sick && !Object.values(lineup).includes(m.id))?.id || null;
  let me = st.playerId && Object.values(lineup).includes(st.playerId) ? st.playerId : lineup.lead;
  const wrap = el('div', { class: 'panel lineup' });
  const render = () => {
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'row' }, el('h1', {}, 'Pick your Lineup of Five'), el('div', { class: 'spacer' }), el('div', { class: 'small' }, 'The Colac Cup · racecourse · semi-trailer stage')));
    if (st.sick) wrap.append(el('div', { class: 'toast bad', style: { animation: 'none' } }, `🤒 ${st.member(st.sick).name} has pulled out sick today. (Dave Stockman never does.)`));
    const slots = el('div', { class: 'slots' });
    for (const s of roster.slots) {
      const col = el('div', { class: 'slot' }, el('h3', {}, s.label));
      for (const m of roster.members.filter(m => m.slots.includes(s.id))) {
        const sel = lineup[s.id] === m.id, elsewhere = Object.entries(lineup).some(([k, v]) => v === m.id && k !== s.id);
        const sick = st.sick === m.id;
        const card = el('div', { class: 'member' + (sel ? ' sel' : '') + (sick ? ' sick' : '') + (sel && me === m.id ? ' me' : '') },
          el('div', { class: 'nm' }, m.name, m.slots.length > 1 ? ' ✦' : ''),
          el('div', { class: 'ab' }, m.abilities.map(a => roster.abilities[a]?.name).filter(Boolean).join(' · ')),
          el('div', { class: 'ab' }, m.blurb),
          sel ? el('div', { class: 'play' }, me === m.id ? '🎮 You\'re playing as them' : 'Click again to play as them') : elsewhere ? el('div', { class: 'ab' }, `(in the ${roster.slots.find(x => x.id === Object.entries(lineup).find(([, v]) => v === m.id)[0]).label} slot)`) : null);
        card.addEventListener('click', () => {
          if (sick) { toast(`${m.name} is home with a lemsip.`); return; }
          audio.play('click');
          if (sel) { me = m.id; render(); return; }
          for (const k of Object.keys(lineup)) if (lineup[k] === m.id) lineup[k] = null;
          if (me === lineup[s.id]) me = m.id;
          lineup[s.id] = m.id; render();
        });
        col.append(card);
      }
      slots.append(col);
    }
    wrap.append(slots);
    // synergies
    const ids = Object.values(lineup);
    const syn = el('div', { class: 'syn' }, ...roster.synergies.map(s => {
      const on = s.members.every(x => x.includes('@') ? lineup[x.split('@')[1]] === x.split('@')[0] : ids.includes(x));
      return el('span', { class: on ? '' : 'off', title: s.desc }, (on ? '✔ ' : '') + s.name);
    }));
    wrap.append(el('h3', {}, 'Lineup synergies'), syn);
    const full = roster.slots.every(s => lineup[s.id]);
    if (!ids.includes(me)) me = ids.find(Boolean);
    wrap.append(el('div', { class: 'row', style: { marginTop: '14px' } },
      el('button', { class: 'btn ghost', onclick: () => showTitle(game) }, 'Back'),
      el('div', { class: 'spacer' }),
      el('label', { class: 'small', style: { display: 'flex', gap: '6px', alignItems: 'center', pointerEvents: 'auto' } }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = !!st.settings.shortGig; c.onchange = () => { st.settings.shortGig = c.checked; st.persist(); }; return c; })(), 'Short gig (2 songs)'),
      el('button', { class: 'btn red', disabled: !full ? 'disabled' : false, onclick: () => { st.lineup = lineup; st.playerId = me; closeScreen(); audio.play('ok'); game.startDay(); } }, `Load the van ▶ (as ${st.member(me)?.name || '?'})`)));
  };
  render(); showScreen(wrap);
}
