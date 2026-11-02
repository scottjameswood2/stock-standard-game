import { LoadIn } from './loadin.js';
import { Soundcheck } from './soundcheck.js';
import { Gig1, Gig2 } from './gig.js';
import { SetBreak } from './setbreak.js';
import { PackUp } from './packup.js';
import { Burger } from './burger.js';
import { Results } from './results.js';

// Gig-day state machine: each phase class has enter(), update(dt, t), exit() and flags
// (roam, drivePlayer, bandMode, allowSwitch). game.setPhase(name) moves between them.
export const PHASES = { loadin: LoadIn, soundcheck: Soundcheck, gig1: Gig1, setbreak: SetBreak, gig2: Gig2, packup: PackUp, burger: Burger, results: Results };
export const ORDER = ['loadin', 'soundcheck', 'gig1', 'setbreak', 'gig2', 'packup', 'burger', 'results'];
