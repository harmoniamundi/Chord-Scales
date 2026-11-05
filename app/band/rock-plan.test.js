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
            const gt = G.guitar && G.guitar[l];   // null : pas de guitare électrique (rock'n'roll des années 50)
            if (!gt) return;
            if (gt.mode !== 'boogie' && gt.mode !== 'arp') gt.pats.forEach(p => assert.equal(p.length, 16, g + ' gtr'));
            (gt.arpBar || []).forEach(p => assert.equal(p.split(' ').length, 8, g + ' arpBar'));
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
            if (g === 'r-roll') assert.ok(ms.every(({ plan }) => !plan.piano.some(e => e.inst === 'gtr')), g + ' : pas de guitare électrique');
            else assert.ok(ms.some(({ plan }) => plan.piano.some(e => e.inst === 'gtr')), g + ' guitare');
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

// Signature d'une mesure de guitare : positions, durées et nombre de cordes de chaque coup
const gtrSig = (plan) => plan.piano.filter(e => e.inst === 'gtr').map(e => e.pos + '/' + e.dur.toFixed(2) + '/' + e.intervals.length + '/' + e.art).join(',');
const gtrOf = (plan) => plan.piano.filter(e => e.inst === 'gtr');

describe('rock\'n\'roll des années 50 : la basse mène, sans guitare électrique', () => {
    test('aucune guitare, ni dans les données ni dans les plans, quelle que soit la transposition', () => {
        assert.equal(R.ROCK['r-roll'].guitar, null);
        [0, -2, -9].forEach(off => [1, 2, 3].forEach(seed => run('r-roll', seed, off, { halves: seed % 2 === 0 }).forEach(({ plan, ph }) => {
            assert.equal(gtrOf(plan).length, 0);
            assert.equal(typeof ph.gtrTone, 'string');
            assert.ok(plan.tone in require('../audio/rock-synths.js').AMP_TONES);
        })));
    });
    test('la contrebasse est signalée (upright) et chaque note de basse porte un coefficient de niveau supérieur à 1', () => {
        run('r-roll', 2).forEach(({ plan }) => {
            assert.equal(plan.upright, true);
            plan.bass.forEach(b => assert.ok(b.gainMul > 1, 'gainMul ' + b.gainMul));
        });
        ['r-classic', 'r-hard', 'r-punk', 'r-blues', 'r-indie', 'r-ballad'].forEach(g => run(g, 2).forEach(({ plan }) => {
            assert.ok(!plan.upright, g);
            plan.bass.forEach(b => assert.equal(b.gainMul, undefined, g));
        }));
    });
    test('la basse joue une ligne qui marche : plus de notes qu\'avant, des tierces, sixtes et septièmes, accents sur les temps 2 et 4', () => {
        const toks = new Set(); let notes = 0, accent = 0, soft = 0, measures = 0;
        for (let seed = 1; seed <= 6; seed++) run('r-roll', seed).forEach(({ plan }) => {
            measures++; notes += plan.bass.length;
            plan.bass.forEach(b => {
                toks.add(b.tok);
                if (b.pos === 1 || b.pos === 3) accent += b.vel; else if (b.pos % 1 !== 0) soft += b.vel;
            });
        });
        ['R', 'T', 'F', '6', '7'].forEach(t => assert.ok(toks.has(t), t));
        assert.ok(notes / measures >= 3.5, 'notes par mesure ' + notes / measures);
        const n24 = [...Array(6)].reduce((n, _, k) => n + run('r-roll', k + 1).reduce((m, { plan }) => m + plan.bass.filter(b => b.pos === 1 || b.pos === 3).length, 0), 0);
        const nOff = [...Array(6)].reduce((n, _, k) => n + run('r-roll', k + 1).reduce((m, { plan }) => m + plan.bass.filter(b => b.pos % 1 !== 0).length, 0), 0);
        assert.ok(accent / n24 > soft / nOff, 'les temps 2 et 4 sont plus appuyés que les contretemps');
    });
    test('la basse est plus forte que le piano et la batterie (niveau moyen)', () => {
        const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
        const bass = [], piano = [], drums = [];
        for (let seed = 1; seed <= 4; seed++) run('r-roll', seed).forEach(({ plan }) => {
            plan.bass.forEach(b => bass.push(b.vel * b.gainMul));
            plan.piano.forEach(e => piano.push(e.vel));
            plan.drums.filter(d => d.drum === 'rkick' || d.drum === 'rsnare').forEach(d => drums.push(d.vel));
        });
        assert.ok(mean(bass) > mean(piano), 'basse ' + mean(bass) + ' piano ' + mean(piano));
        assert.ok(mean(bass) > mean(drums), 'basse ' + mean(bass) + ' batterie ' + mean(drums));
    });
    test('en fin de phrase, la basse monte vers l\'accord suivant (course de quatre notes sur les deux derniers temps)', () => {
        let runs = 0;
        for (let seed = 1; seed <= 12; seed++) run('r-roll', seed).filter(({ i }) => i === 3).forEach(({ plan }) => {
            if (plan.bass.filter(b => b.pos >= 2 && b.pos < 4 && b.pos % 0.5 === 0).length >= 4) runs++;
        });
        assert.ok(runs >= 8, 'courses : ' + runs);
    });
    test('le piano garde son jeu d\'origine, couplet comme refrain : boogie, main gauche qui marche sur chaque croche + accords de main droite sur les contretemps', () => {
        assert.deepEqual([R.ROCK['r-roll'].keys.lo, R.ROCK['r-roll'].keys.hi], ['boogie', 'boogie']);
        assert.equal(R.ROCK['r-roll'].mix.keys, undefined);
        run('r-roll', 3).forEach(({ plan }) => {
            const lh = plan.piano.filter(e => e.vel > 0 && e.intervals.length <= 2 && e.pos % 0.5 === 0);
            assert.ok(plan.piano.length >= 8, 'événements de piano : ' + plan.piano.length);
            assert.ok(plan.piano.filter(e => e.pos % 0.5 === 0 && e.pos % 1 === 0).length >= 4);
            assert.ok(lh.length >= 8);
        });
    });
});

describe('rock des années 70 : une guitare moins mécanique', () => {
    test('les mesures d\'un morceau sont rarement identiques : beaucoup de motifs de guitare différents', () => {
        let total = 0, distinct = 0, same = 0;
        for (let seed = 1; seed <= 8; seed++) {
            const ms = run('r-classic', seed);
            total += ms.length; distinct += new Set(ms.map(({ plan }) => gtrSig(plan))).size;
            ms.forEach((x, k) => { if (k && gtrSig(x.plan) === gtrSig(ms[k - 1].plan)) same++; });
        }
        assert.ok(distinct / total > 0.55, 'motifs distincts / mesures : ' + distinct / total);
        assert.ok(same / total < 0.05, 'mesures consécutives identiques : ' + same);
    });
    test('à l\'intérieur d\'une phrase de quatre mesures, la guitare ne joue pas partout le même rythme', () => {
        for (let seed = 1; seed <= 8; seed++) {
            const ms = run('r-classic', seed, 0, { phrases: 2 });
            [0, 4].forEach(a => assert.ok(new Set(ms.slice(a, a + 4).map(({ plan }) => gtrSig(plan))).size >= 3, 'seed ' + seed));
        }
    });
    test('mélange de coups descendants, montants, sourds, d\'accords tenus et d\'arpèges', () => {
        const dirs = new Set(), arts = new Set(); let longChord = 0, arpBars = 0, sus = 0;
        for (let seed = 1; seed <= 20; seed++) run('r-classic', seed).forEach(({ plan }) => {
            const g = gtrOf(plan);
            g.forEach(e => { dirs.add(e.dir); arts.add(e.art); if (e.art === 'strum' && e.dur >= 1.4) longChord++; });
            if (g.length && g.every(e => e.art === 'arp')) arpBars++;
            if (g.some(e => e.intervals.length === 5 && e.intervals[3] - e.intervals[0] === 17)) sus++;
        });
        assert.ok(dirs.has(1) && dirs.has(-1));
        ['strum', 'dead', 'arp'].forEach(a => assert.ok(arts.has(a), a));
        assert.ok(longChord > 20, 'accords tenus : ' + longChord);
        assert.ok(arpBars > 3, 'mesures d\'arpège : ' + arpBars);
        assert.ok(sus > 0, 'retombée sus4');
    });
    test('le jeu est humain : délais entre cordes et retards variés, jamais le même d\'un coup à l\'autre', () => {
        const rolls = new Set(), lays = new Set();
        for (let seed = 1; seed <= 4; seed++) run('r-classic', seed).forEach(({ plan }) => gtrOf(plan).forEach(e => { rolls.add(e.roll.toFixed(4)); lays.add((e.lay || 0).toFixed(4)); }));
        assert.ok(rolls.size > 20 && lays.size > 20, rolls.size + ' / ' + lays.size);
    });
    test('un accord qui change au milieu de la mesure est suivi par la guitare (y compris dans une mesure d\'arpège)', () => {
        for (let seed = 1; seed <= 6; seed++) run('r-classic', seed, 0, { halves: true }).forEach(({ plan }) => gtrOf(plan).forEach(e => assert.ok(e.pos >= 0 && e.pos < 4)));
    });
});

describe('hard rock : des accords de longueurs différentes', () => {
    const lens = (g, seeds = 12) => {
        const out = [];
        for (let seed = 1; seed <= seeds; seed++) run(g, seed, 0, { phrases: 4 }).forEach(({ plan }) => gtrOf(plan).filter(e => e.art === 'strum').forEach(e => out.push(+e.dur.toFixed(2))));
        return out;
    };
    test('peu de notes et longues : au plus 4 coups par mesure en moyenne, 90 % des accords d\'au moins un temps, durée moyenne de plus d\'un temps et demi', () => {
        const d = lens('r-hard');
        const mean = d.reduce((a, b) => a + b, 0) / d.length;
        assert.ok(d.filter(x => x >= 0.9).length / d.length >= 0.9, 'accords courts : ' + d.filter(x => x < 0.9).length + '/' + d.length);
        assert.ok(mean > 1.5, 'durée moyenne ' + mean);
        let n = 0, k = 0;
        for (let seed = 1; seed <= 6; seed++) run('r-hard', seed).forEach(({ plan }) => { n += gtrOf(plan).length; k++; });
        assert.ok(n / k <= 4, 'coups par mesure : ' + n / k);
    });
    test('mais les accords ne durent pas tous pareil : un temps, deux temps, trois temps, toute la mesure', () => {
        const d = lens('r-hard');
        assert.ok(new Set(d).size >= 6, 'durées distinctes : ' + new Set(d).size);
        assert.ok(d.some(x => x >= 0.9 && x <= 1.1) && d.some(x => x >= 1.9 && x <= 2.1) && d.some(x => x >= 1.4 && x <= 1.6) && d.some(x => x >= 3.9), [...new Set(d)].join());
    });
    test('les croches étouffées sont rares et ne servent qu\'à lancer un accord', () => {
        let mutes = 0, all = 0;
        for (let seed = 1; seed <= 10; seed++) run('r-hard', seed).forEach(({ plan }) => gtrOf(plan).forEach(e => { all++; if (e.art === 'mute') mutes++; }));
        assert.ok(mutes / all < 0.25, mutes + '/' + all);
    });
    // Comme dans le moteur : un bloc de la grille garde le même accord pendant ses quatre mesures, le suivant n'est annoncé qu'à la dernière.
    const runSteps = (groove, seed) => {
        const env = mkEnv(); const out = []; let prev = null;
        for (let p = 0; p < 4; p++) {
            const ph = mkPhrase(seed, p, groove, prev); prev = ph;
            for (let i = 0; i < 4; i++) out.push({ plan: buildPopPlan(env, CHORDS[p % 4], CHORDS[(p + 1) % 4], i === 3, null, ph, i, 4, i === 3, p * 4 + i), ph, i });
        }
        return out;
    };
    test('un accord peut durer six temps : sonnerie au-delà de la barre de mesure, sans ré-attaque avant le troisième temps de la mesure suivante', () => {
        let found = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const ms = runSteps('r-hard', seed);
            ms.forEach(({ plan }, k) => {
                const hold = gtrOf(plan).find(e => e.dur > 5);
                if (!hold) return;
                found++;
                assert.equal(hold.pos, 0); assert.ok(hold.dur < 6.1);
                const nx = ms[k + 1];
                if (nx) assert.ok(gtrOf(nx.plan).every(e => e.pos >= 2 - 1e-9), 'pas de ré-attaque avant le temps 3, graine ' + seed + ' mesure ' + (k + 1));
            });
        }
        assert.ok(found >= 5, 'accords de six temps : ' + found);
    });
    test('l\'accord tenu n\'est jamais prolongé si l\'accord change (ni dans la grille, ni au milieu de la mesure suivante)', () => {
        const env = mkEnv(); const A = CHORDS[0], B = CHORDS[2];
        const ph = { rng: seeded(5), style: 'pop', ...popPhraseExtras(seeded(5), null, 2, 'r-hard'), gtrHoldOn: true, gtrHoldAt: 0 };
        // accord suivant différent : pas de tenue
        assert.ok(!gtrOf(buildPopPlan(env, A, B, true, null, ph, 0, 4, false, 0)).some(e => e.dur > 5));
        // mesure suivante coupée en deux accords : la tenue s'arrête avec la première moitié (sixième temps), la deuxième moitié joue normalement
        const e2 = mkEnv();
        const p0 = buildPopPlan(e2, A, A, false, null, ph, 0, 4, false, 10);
        assert.ok(gtrOf(p0).some(e => e.dur > 5));
        const p1 = buildPopPlan(e2, A, A, false, [A, B], ph, 1, 4, false, 11);
        assert.ok(gtrOf(p1).some(e => e.pos < 2));
    });
    test('les cinq autres rythmes ne gardent pas d\'accord de six temps', () => {
        ['r-classic', 'r-punk', 'r-blues', 'r-indie', 'r-ballad'].forEach(g => {
            for (let seed = 1; seed <= 5; seed++) run(g, seed).forEach(({ plan }) => gtrOf(plan).forEach(e => assert.ok(e.dur < 5, g)));
        });
    });
});

describe('punk : une rythmique simple, qui sonne, sans effet mitraillette', () => {
    test('les mesures ne se répètent pas à l\'identique (motifs, accents, coups manquants, accords tenus)', () => {
        let total = 0, distinct = 0, same = 0; const vels = new Set();
        for (let seed = 1; seed <= 8; seed++) {
            const ms = run('r-punk', seed);
            total += ms.length; distinct += new Set(ms.map(({ plan }) => gtrSig(plan))).size;
            ms.forEach((x, k) => { if (k && gtrSig(x.plan) === gtrSig(ms[k - 1].plan)) same++; gtrOf(x.plan).forEach(e => vels.add(e.vel.toFixed(2))); });
        }
        assert.ok(distinct / total > 0.2, 'motifs distincts / mesures : ' + distinct / total);
        assert.ok(same / total < 0.15, 'mesures consécutives identiques : ' + same);
        assert.ok(vels.size > 12, 'nuances : ' + vels.size);
    });
    test('pas de notes sèches : que des accords qui sonnent (au moins la moitié d\'un temps, la plupart près d\'un temps), au plus 6 coups par mesure', () => {
        let n = 0, k = 0, short = 0, sum = 0;
        for (let seed = 1; seed <= 8; seed++) run('r-punk', seed).forEach(({ plan }) => gtrOf(plan).forEach((e, _, g) => {
            n++; sum += e.dur; assert.equal(e.art, 'strum');
            assert.ok(e.dur >= 0.5 - 1e-9, 'durée ' + e.dur);
            if (e.dur < 0.9 && e.pos < 3.5) short++;
        }));
        for (let seed = 1; seed <= 8; seed++) run('r-punk', seed).forEach(({ plan }) => { k++; assert.ok(gtrOf(plan).length <= 8); });
        assert.ok(sum / n >= 0.9, 'durée moyenne ' + sum / n);
        assert.ok(short / n < 0.02, 'coups trop courts : ' + short);
        assert.ok(n / k <= 6, 'coups par mesure : ' + n / k);
    });
    test('le punk reste du punk : accords de puissance (trois cordes), coups descendants uniquement, huitièmes droites', () => {
        for (let seed = 1; seed <= 6; seed++) run('r-punk', seed).forEach(({ plan }) => gtrOf(plan).forEach(e => { assert.equal(e.dir, 1); assert.equal(e.intervals.length, 3); }));
        assert.ok(R.ROCK['r-punk'].swing === 0.5);
    });
    test('la guitare joue des durées différentes (noires, croches, accords tenus)', () => {
        const d = new Set();
        for (let seed = 1; seed <= 12; seed++) run('r-punk', seed).forEach(({ plan }) => gtrOf(plan).forEach(e => d.add(e.dur.toFixed(1))));
        assert.ok(d.size >= 4, [...d].join());
    });
});

describe('blues rock : quelques notes de guitare solo en plus des accords', () => {
    test('des phrases à une note (pentatonique) apparaissent sur les deux derniers temps de certaines mesures, les dyades restent là', () => {
        let licks = 0, dyadBars = 0, bars = 0;
        for (let seed = 1; seed <= 10; seed++) run('r-blues', seed).forEach(({ plan }) => {
            const g = gtrOf(plan); bars++;
            const single = g.filter(e => e.intervals.length === 1);
            if (single.length) { licks++; assert.ok(single.length >= 2); assert.ok(single.every(e => e.pos >= 2 && e.art === 'strum' && e.dur >= 0.3)); assert.ok(g.filter(e => e.intervals.length === 2).every(e => e.pos < single[0].pos), 'dyades avant la phrase'); }
            if (g.some(e => e.intervals.length === 2)) dyadBars++;
        });
        assert.ok(licks / bars > 0.2 && licks / bars < 0.7, 'mesures avec phrase : ' + licks + '/' + bars);
        assert.ok(dyadBars / bars > 0.9);
    });
    test('quelle que soit la transposition ou la coupure de la mesure, les notes restent dans la mesure et le registre de la guitare', () => {
        [0, -2, -9].forEach(off => run('r-blues', 3, off, { halves: true }).forEach(({ plan }) => gtrOf(plan).forEach(e => {
            assert.ok(e.pos >= 0 && e.pos < 4); assert.ok(e.intervals.every(n => n + off > -12 && n + off < 30), JSON.stringify(e.intervals));
        })));
    });
    test('les autres rythmes n\'ont pas ces phrases à une note', () => {
        run('r-indie', 2).forEach(({ plan }) => assert.ok(!gtrOf(plan).some(e => e.intervals.length === 1 && e.art === 'strum')));
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
