// Tests des arrangements Rock (band/rock-plan.js, via band/pop-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rock-plan.js');
const { popPhraseExtras, buildPopPlan } = require('./pop-plan.js');
const { GROOVE_SWING_DEFAULTS, bandSwing } = require('./band-helpers.js');
const { drumSpec } = require('../audio/drum-synths.js');
const T = require('../theory.js');

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const CHORDS = [{ rootIndex: 0, chordId: 'majTriad' }, { rootIndex: 9, chordId: 'minTriad' }, { rootIndex: 5, chordId: 'majTriad' }, { rootIndex: 7, chordId: '7' }];
const mkEnv = (off = 0) => ({ transOffset: off, state: { popVoice: null, popRunAt: -9, bandLastFill: false }, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0] });
const mkPhrase = (seed, index, groove, prev = null) => ({ rng: seeded(seed * 7 + index), style: 'pop', ...popPhraseExtras(seeded(seed * 31 + index), prev, index, groove) });

// Joue 4 phrases de 4 mesures et renvoie toutes les mesures { plan, ph, i, step }
function run(groove, seed = 1, off = 0, opts = {}) {
    const env = mkEnv(off); const out = []; let prev = null;
    for (let p = 0; p < (opts.phrases || 4); p++) {
        const ph = mkPhrase(seed, p, groove, prev); prev = ph;
        for (let i = 0; i < 4; i++) {
            const step = CHORDS[(p + i) % 4], next = CHORDS[(p + i + 1) % 4];
            const halves = (opts.halves && i === 2) ? [step, next] : null;
            out.push({ plan: buildPopPlan(env, step, next, i === 3, halves, ph, i, 4, i === 3, p * 4 + i), ph, i, step });
        }
    }
    return out;
}

describe('données des rythmes rock', () => {
    test('sept rythmes, chacun avec 4 énergies de phrase croissantes à bornes valides', () => {
        assert.equal(R.ROCK_GROOVES.length, 7);
        R.ROCK_GROOVES.forEach(g => {
            const G = R.ROCK[g];
            assert.equal(G.arc.length, 4, g);
            G.arc.forEach(v => assert.ok(v > 0.2 && v <= 1, g));
            assert.ok(G.arc[3] >= G.arc[0], g);
            assert.ok(G.tempo >= 60 && G.tempo <= 200, g);
        });
    });
    test('tous les motifs de 16 doubles croches ont 16 positions', () => {
        R.ROCK_GROOVES.forEach(g => ['lo', 'hi'].forEach(l => {
            const G = R.ROCK[g], D = G.drums[l];
            D.kick.forEach(p => assert.equal(p.length, 16, g + ' kick'));
            D.time[1].forEach(p => assert.equal(p.length, 16, g + ' time'));
            assert.equal(D.snare.length, 16, g + ' snare');
            (D.ghost || []).forEach(p => assert.equal(p.length, 16, g + ' ghost'));
            G.bass[l].forEach(p => assert.equal(p.length, 16, g + ' bass'));
            const gt = G.guitar[l];
            if (gt.mode !== 'boogie' && gt.mode !== 'arp') gt.pats.forEach(p => assert.equal(p.length, 16, g + ' gtr'));
            if (gt.mode === 'boogie') gt.pats.forEach(p => assert.equal(p.split(' ').length, 8, g + ' boogie'));
        }));
    });
    test('le swing des rythmes imposés est celui de band-helpers (rock\'n\'roll 62 %, blues rock 67 %, les autres droits)', () => {
        R.ROCK_GROOVES.forEach(g => {
            const sw = GROOVE_SWING_DEFAULTS[g] === undefined ? 0.5 : GROOVE_SWING_DEFAULTS[g];
            assert.equal(R.ROCK[g].swing, sw, g);
            assert.equal(bandSwing('pop', 120, null, g), sw, g);
        });
        assert.equal(bandSwing('pop', 120, null, null), 0.5);
        assert.equal(bandSwing('pop', 120, 0.55, 'r-blues'), 0.55);   // le réglage manuel l'emporte
        assert.equal(bandSwing('swing', 120, null, 'r-blues') > 0.5, true);
    });
    test('isRockGroove', () => {
        assert.ok(R.isRockGroove('r-hard'));
        assert.ok(!R.isRockGroove('samba'));
        assert.ok(!R.isRockGroove(null));
    });
});

describe('écriture rythmique', () => {
    test('rkVel : force 1 à 9 par double croche, points = silences', () => {
        assert.deepEqual(R.rkVel('9...5...'), [[0, 1], [1, 5 / 9]]);
        assert.deepEqual(R.rkVel('.. 9 .'), [[0.5, 1]]);
        assert.deepEqual(R.rkVel(''), []);
    });
    test('rkSym : un symbole par double croche, les tirets prolongent', () => {
        assert.deepEqual(R.rkSym('D--.U.'), [{ pos: 0, sym: 'D', dur: 0.75 }, { pos: 1, sym: 'U', dur: 0.25 }]);
        assert.deepEqual(R.rkSym('....'), []);
    });
});

describe('caractère d\'une phrase', () => {
    test('rythme rock : champs du groove, énergie qui suit l\'arc, reproductible', () => {
        R.ROCK_GROOVES.forEach(g => {
            [0, 1, 2, 3].forEach(idx => {
                const e = popPhraseExtras(seeded(5 + idx), null, idx, g);
                assert.equal(e.rockGroove, g);
                assert.ok(Math.abs(e.intensity - R.ROCK[g].arc[idx]) <= 0.06, g + idx);
                assert.equal(typeof e.rockHi, 'boolean');
                assert.deepEqual(e, popPhraseExtras(seeded(5 + idx), null, idx, g));
            });
        });
    });
    test('sans rythme rock : couches facultatives, pas de rockGroove', () => {
        let guit = 0, org = 0, str = 0, tmb = 0;
        for (let s = 1; s <= 200; s++) {
            const e = popPhraseExtras(seeded(s), s % 3 ? null : { style: 'pop', intensity: 0.8 }, s % 4);
            assert.equal(e.rockGroove, undefined);
            if (e.layGtr) guit++; if (e.layOrgan) org++; if (e.layStrings) str++; if (e.layTmb) tmb++;
        }
        assert.ok(guit > 40 && org > 5 && str > 5 && tmb > 5, [guit, org, str, tmb].join());
        assert.ok(guit < 200);
    });
    test('un autre rythme imposé (samba…) ne déclenche pas le rock', () => {
        assert.equal(popPhraseExtras(seeded(3), null, 0, 'samba').rockGroove, undefined);
    });
});

describe('plans rock : validité', () => {
    const DRUM_OK = (d) => assert.ok(drumSpec({ drum: d }), 'percussion inconnue : ' + d);
    R.ROCK_GROOVES.forEach(g => {
        test(g + ' : positions, forces, durées, hauteurs et noms de percussions valides, quelle que soit la transposition', () => {
            [0, -2, -9].forEach(off => {
                for (let seed = 1; seed <= 6; seed++) {
                    run(g, seed, off, { halves: seed % 2 === 0 }).forEach(({ plan }) => {
                        assert.equal(plan.rock, true);
                        assert.ok(plan.tone in require('../audio/rock-synths.js').AMP_TONES);
                        for (const [name, list] of [['piano', plan.piano], ['bass', plan.bass], ['drums', plan.drums]]) {
                            list.forEach(e => {
                                assert.ok(e.pos >= 0 && e.pos < 4, g + ' ' + name + ' pos ' + e.pos);
                                assert.ok(e.vel > 0 && e.vel <= 1.1, g + ' ' + name + ' vel ' + e.vel);
                                if (e.dur !== undefined) assert.ok(e.dur > 0 && e.dur < 9, g + ' dur');
                            });
                        }
                        plan.drums.forEach(e => DRUM_OK(e.drum));
                        plan.bass.forEach(b => assert.ok(Number.isFinite(b.abs)));
                        plan.piano.forEach(e => {
                            assert.ok(['piano', 'gtr', 'organ', 'strings'].includes(e.inst || 'piano'));
                            assert.ok(e.intervals.length > 0 && e.intervals.every(n => Number.isFinite(n) && n + off > -32 && n + off < 46), g + ' ' + JSON.stringify(e.intervals));
                        });
                    });
                }
            });
        });
    });
    test('reproductible : mêmes graines, mêmes plans', () => {
        R.ROCK_GROOVES.forEach(g => assert.deepEqual(run(g, 4).map(x => x.plan), run(g, 4).map(x => x.plan)));
    });
    test('tous les temps et tous les instruments prévus apparaissent dans un morceau de 16 mesures', () => {
        R.ROCK_GROOVES.forEach(g => {
            const ms = run(g, 2);
            assert.ok(ms.every(({ plan }) => plan.drums.some(d => d.drum === 'rkick')), g + ' grosse caisse à chaque mesure');
            assert.ok(ms.some(({ plan }) => plan.piano.some(e => e.inst === 'gtr')), g + ' guitare');
            assert.ok(ms.some(({ plan }) => plan.bass.length >= 2), g + ' basse');
        });
    });
});

describe('plans rock : idiome', () => {
    test('caisse claire sur les temps 2 et 4 (ou cross-stick de la ballade) dans toute mesure sans roulement', () => {
        R.ROCK_GROOVES.forEach(g => {
            run(g, 3).filter(({ i }) => i < 3).forEach(({ plan }) => {
                const sn = (b) => plan.drums.some(d => (d.drum === 'rsnare' || d.drum === 'rim') && Math.abs(d.pos - b) < 1e-9);
                if (g === 'r-ballad') assert.ok(sn(2) || plan.drums.some(d => d.drum === 'rsnare' && d.pos === 1), g);
                else assert.ok(sn(1) && sn(3), g);
            });
        });
    });
    test('la grosse caisse tombe sur le premier temps (sauf mesure de roulement)', () => {
        R.ROCK_GROOVES.forEach(g => run(g, 3).filter(({ i }) => i < 3).forEach(({ plan }) => assert.ok(plan.drums.some(d => d.drum === 'rkick' && d.pos === 0), g)));
    });
    test('toms rock (rtom1 à rtom4) dans les roulements, jamais les anciens toms de boîte à rythmes', () => {
        const seen = new Set();
        R.ROCK_GROOVES.forEach(g => { for (let s = 1; s <= 8; s++) run(g, s).forEach(({ plan }) => plan.drums.forEach(d => seen.add(d.drum))); });
        ['rtom1', 'rtom2', 'rtom3'].forEach(t => assert.ok(seen.has(t), t));
        ['tom1', 'tom2', 'tom3', 'snare', 'kick', 'hat'].forEach(t => assert.ok(!seen.has(t) || t === 'hat', t));
        assert.ok(!seen.has('tom1') && !seen.has('snare') && !seen.has('kick'));
    });
    test('le hard rock et le punk n\'ont pas de piano ; le rock\'n\'roll et le blues rock en ont', () => {
        ['r-hard', 'r-punk'].forEach(g => run(g, 2).forEach(({ plan }) => assert.ok(!plan.piano.some(e => !e.inst || e.inst === 'piano'), g)));
        ['r-roll', 'r-blues'].forEach(g => assert.ok(run(g, 2).some(({ plan }) => plan.piano.some(e => e.inst === 'piano')), g));
    });
    test('la guitare du hard rock est saturée au refrain, celle de l\'indie claire au couplet', () => {
        const tones = (g) => new Set(run(g, 2).map(({ plan }) => plan.tone));
        assert.ok(tones('r-hard').has('heavy'));
        assert.ok(tones('r-indie').has('clean'));
        assert.ok(tones('r-punk').has('drive'));
    });
    test('la basse du punk et du hard rock reste sur la fondamentale', () => {
        ['r-punk', 'r-hard'].forEach(g => run(g, 2).forEach(({ plan, step }) => {
            const roots = plan.bass.filter(b => b.tok === 'R').length;
            assert.ok(roots >= plan.bass.length * 0.6, g);
        }));
    });
    test('les nappes d\'orgue et de cordes se prolongent sur deux mesures sans ré-attaque quand l\'accord ne change pas', () => {
        const env = mkEnv(); const same = { rootIndex: 0, chordId: 'majTriad' };
        const ph = { rng: seeded(9), style: 'pop', ...popPhraseExtras(seeded(9), null, 3, 'r-ballad'), organKind: 'pad', stringsKind: 'pad' };
        const p0 = buildPopPlan(env, same, same, false, null, ph, 0, 4, false, 0);
        const p1 = buildPopPlan(env, same, same, false, null, ph, 1, 4, false, 1);
        const pad = (p, inst) => p.piano.filter(e => e.inst === inst);
        assert.ok(pad(p0, 'organ').length === 1 && pad(p0, 'strings').length === 1);
        assert.equal(pad(p1, 'organ').length, 0);
        assert.equal(pad(p1, 'strings').length, 0);
        assert.ok(pad(p0, 'organ')[0].dur > 4);
    });
});

describe('couches du Pop-Rock ordinaire', () => {
    test('des mesures reçoivent guitare, orgue, cordes ou tambourin, les événements portent leur instrument', () => {
        const seen = new Set(); let rockMeasures = 0, plain = 0;
        for (let seed = 1; seed <= 30; seed++) run(null, seed).forEach(({ plan }) => {
            plan.piano.forEach(e => seen.add(e.inst || 'piano'));
            plan.drums.forEach(d => seen.add(d.drum));
            if (plan.rock) rockMeasures++; else plain++;
        });
        ['piano', 'gtr', 'organ', 'strings', 'tmb', 'tmbs'].forEach(k => assert.ok(seen.has(k), k));
        assert.ok(rockMeasures > 0 && plain > 0, rockMeasures + '/' + plain);
    });
    test('le Pop-Rock ordinaire garde ses toms et sa caisse claire d\'origine pour les roulements, pas ceux du rock', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 20; seed++) run(null, seed).forEach(({ plan }) => plan.drums.forEach(d => seen.add(d.drum)));
        assert.ok(['snare', 'kick', 'hat'].every(k => seen.has(k)));
    });
    test('un plan sans couche n\'a pas de drapeau rock', () => {
        const ms = run(null, 3);
        ms.forEach(({ plan }) => { if (!plan.piano.some(e => e.inst)) assert.ok(!plan.rock); });
    });
    test('validité des couches : bornes et hauteurs', () => {
        [0, -2, -9].forEach(off => {
            for (let seed = 1; seed <= 10; seed++) run(null, seed, off, { halves: true }).forEach(({ plan }) => plan.piano.concat(plan.drums).forEach(e => {
                assert.ok(e.pos >= 0 && e.pos < 4);
                assert.ok(e.vel > 0 && e.vel <= 1.1);
                if (e.intervals) assert.ok(e.intervals.every(n => Number.isFinite(n) && n + off > -32 && n + off < 46));
            }));
        });
    });
});

describe('formes d\'accords de guitare', () => {
    const env = mkEnv();
    test('fondamentale dans le registre de la guitare (de mi grave à ré♯ aigu), transposée', () => {
        for (let r = 0; r < 12; r++) [0, -2, -9].forEach(off => {
            const e = { ...env, transOffset: off };
            const v = R.gtrRoot(e, { rootIndex: r, chordId: 'majTriad' }) + off;
            assert.ok(v >= -8 && v <= 3, r + ' ' + off + ' ' + v);
        });
    });
    test('accord de puissance : fondamentale, quinte, octave ; dyade : fondamentale et quinte', () => {
        const cs = { rootIndex: 0, chordId: 'majTriad' };
        const R0 = R.gtrRoot(env, cs);
        assert.deepEqual(R.gtrShape(env, cs, 'dyad'), [R0, R0 + 7]);
        assert.deepEqual(R.gtrShape(env, cs, 'power'), [R0, R0 + 7, R0 + 12]);
        assert.deepEqual(R.gtrShape(env, cs, 'power4'), [R0, R0 + 7, R0 + 12, R0 + 19]);
    });
    test('accord complet : contient la tierce (majeure ou mineure) et la septième d\'un accord de dominante', () => {
        const maj = R.gtrShape(env, { rootIndex: 0, chordId: 'majTriad' }, 'full').map(n => ((n % 12) + 12) % 12);
        assert.ok(maj.includes(4));
        const min = R.gtrShape(env, { rootIndex: 0, chordId: 'minTriad' }, 'full').map(n => ((n % 12) + 12) % 12);
        assert.ok(min.includes(3) && !min.includes(4));
        const dom = R.gtrShape(env, { rootIndex: 7, chordId: '7' }, 'full').map(n => ((n % 12) + 12) % 12);
        assert.ok(dom.includes(5));   // septième de sol = fa
    });
});
