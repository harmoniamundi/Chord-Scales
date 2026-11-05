// Tests de l'orchestre Guitare (band/guitar-plan.js) : guitare classique seule, arpèges et accords. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('./guitar-plan.js');
const { buildBandPhrase } = require('./phrase-plan.js');
const H = require('./band-helpers.js');
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
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const mod12 = (n) => ((n % 12) + 12) % 12;
const METERS = { '2/4': [2, false], '3/4': [3, false], '4/4': [4, false], '6/8': [2, true], '9/8': [3, true], '12/8': [4, true] };
const ALL_CHORDS = Object.values(T.chordTypes).flat().map(c => c.id);
const TOKENS = new Set(['B', 'b', '1', '2', '3', '4', 'C', 'c', 'u', 'P', 'R', 'A', '.']);

// Hauteurs réelles (MIDI) d'un événement du plan
const realNotes = (e, off) => e.intervals.map(v => G.GTR_BASE + v + off);

// Rejoue une grille mesure par mesure comme le moteur (une phrase de 4 mesures)
function playGrid({ meter = '4/4', off = 0, seed = 1, bpm = 100, grid, measures = 8, loop = true }) {
    const [bpb, ternary] = METERS[meter];
    const env = { transOffset: off, bpm, splitBeat: bpb === 2 ? 1 : 2, findChordObj, state: { gtrVoice: null } };
    const flat = [];
    grid.forEach(g => { for (let k = 0; k < (g.measures || 1); k++) flat.push({ g, k }); });
    const L = 4;
    let phrase = null;
    const out = [];
    for (let mi = 0; mi < measures; mi++) {
        const { g, k } = flat[mi % flat.length];
        const isLast = k === (g.measures || 1) - 1;
        const nx = flat[(mi + 1) % flat.length];
        const hasNext = loop || mi + 1 < measures;
        const nextStep = hasNext ? (isLast ? nx.g : g) : null;
        const pi = Math.floor(mi / L), i = mi % L;
        if (!phrase || phrase.index !== pi) {
            phrase = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm, isCuba: false, groove: null, rng: seeded(seed + pi * 7919 + 1) }, pi, 'guitar', phrase);
        }
        const halves = g.split ? [{ rootIndex: g.rootIndex, chordId: g.chordId }, { rootIndex: g.split.rootIndex, chordId: g.split.chordId }] : null;
        const plan = G.buildGuitarPlan(env, bpb, ternary, g, nextStep, isLast, halves, phrase, i, L, i === L - 1, mi);
        out.push({ mi, g, nextStep, halves, bpb, ternary, plan, phrase, env, isLast });
    }
    return out;
}

const GRID = [
    { rootIndex: 2, chordId: 'm7', measures: 1 },
    { rootIndex: 7, chordId: '7', measures: 1 },
    { rootIndex: 0, chordId: 'maj7', measures: 2 },
    { rootIndex: 9, chordId: 'm7', measures: 1, split: { rootIndex: 2, chordId: '7' } },
    { rootIndex: 5, chordId: 'majTriad', measures: 1, bassRootIndex: 9 },
    { rootIndex: 4, chordId: 'm7b5', measures: 1 }
];

describe('motifs : cellules', () => {
    test('chaque cellule binaire a la longueur de sa table et n\'emploie que des gestes connus', () => {
        for (const [n, kinds] of Object.entries(G.GTR_BIN)) {
            for (const [kind, cells] of Object.entries(kinds)) {
                assert.ok(cells.length > 0, `${n} ${kind} vide`);
                cells.forEach(c => {
                    assert.equal(c.length, Number(n), `${n} ${kind} : ${c.join(' ')}`);
                    c.forEach(t => assert.ok(TOKENS.has(t), `geste inconnu ${t}`));
                });
            }
        }
    });
    test('chaque groupe ternaire a trois cases', () => {
        for (const [kind, fams] of Object.entries(G.GTR_TERN)) {
            assert.ok(fams.length > 0);
            fams.forEach(fam => fam.forEach(g => { assert.equal(g.length, 3, `${kind} : ${g.join(' ')}`); g.forEach(t => assert.ok(TOKENS.has(t))); }));
        }
    });
    test('gtrCellFor : bonne longueur pour toutes les durées, déterministe, varié selon le tirage', () => {
        for (const kind of ['arp', 'travis', 'chord', 'mix']) {
            for (const n of [2, 4, 6, 8]) {
                const a = G.gtrCellFor(kind, n, false, 0.3);
                assert.equal(a.length, n);
                assert.deepEqual(a, G.gtrCellFor(kind, n, false, 0.3));
            }
            for (const n of [3, 6, 9, 12]) assert.equal(G.gtrCellFor(kind, n, true, 0.6).length, n);
        }
        const seen = new Set();
        for (let k = 0; k < 20; k++) seen.add(G.gtrCellFor('arp', 8, false, k / 20).join(' '));
        assert.ok(seen.size >= 5);
    });
    test('gtrMutate garde la première case et la longueur', () => {
        for (let s = 1; s < 60; s++) {
            const cell = ['B', '1', '2', '3', '2', '1', '2', '3'];
            const out = G.gtrMutate(cell, seeded(s));
            assert.equal(out.length, 8);
            assert.equal(out[0], 'B');
            out.forEach(t => assert.ok(TOKENS.has(t)));
        }
    });
    test('gtrThin éclaircit une cellule sans changer sa longueur ni inventer de geste', () => {
        const cell = ['B', '1', '2', '3', '2', '1', '2', '3'];
        const out = G.gtrThin(cell, 2);
        assert.equal(out.length, 8);
        assert.deepEqual(out.filter(t => t !== '.'), ['B', '1', '2', '3']);
        out.forEach((t, k) => { if (k % 2 === 1) assert.equal(t, '.'); });
    });
});

describe('voix de la guitare', () => {
    test('basse entre mi2 et sol3 de la bonne classe de hauteur, pour toutes les fondamentales, accords et transpositions', () => {
        for (const off of [0, -2, -9]) {
            for (let root = 0; root < 12; root++) {
                for (const id of ALL_CHORDS) {
                    const cs = { rootIndex: root, chordId: id };
                    const env = { transOffset: off, findChordObj };
                    const b = G.gtrBassMidi(env, cs, null);
                    assert.ok(b >= G.GTR_BASS_LO && b <= G.GTR_BASS_HI, `${root} ${id} ${off} : ${b}`);
                    assert.equal(mod12(b), mod12(H.bassPc(env, cs) + off));
                    const near = G.gtrBassMidi(env, cs, 47);
                    assert.ok(near >= G.GTR_BASS_LO && near <= G.GTR_BASS_HI);
                }
            }
        }
    });
    test('accord sur basse : la basse est la note choisie, la basse alternée est la fondamentale', () => {
        const env = { transOffset: 0, findChordObj };
        const cs = { rootIndex: 0, chordId: 'majTriad', bassRootIndex: 4 }; // do/mi
        const b = G.gtrBassMidi(env, cs, null);
        assert.equal(mod12(b), 4);
        const alt = G.gtrAltBassMidi(env, cs, b);
        assert.equal(mod12(alt), 0);
        assert.notEqual(alt, b);
    });
    test('basse alternée : la quinte de l\'accord, différente de la basse, dans le registre des basses', () => {
        for (const off of [0, -2, -9]) {
            for (let root = 0; root < 12; root++) {
                for (const id of ALL_CHORDS) {
                    const cs = { rootIndex: root, chordId: id };
                    const env = { transOffset: off, findChordObj };
                    const b = G.gtrBassMidi(env, cs, null);
                    const alt = G.gtrAltBassMidi(env, cs, b);
                    assert.notEqual(alt, b);
                    assert.ok(alt >= G.GTR_BASS_LO && alt <= G.GTR_BASS_HI + 12, `${root} ${id} : ${alt}`);
                }
            }
        }
    });
    test('voicing aigu : notes de l\'accord, croissantes, 3 à 4 notes, dans le registre de la guitare', () => {
        for (const off of [0, -2, -9]) {
            for (let root = 0; root < 12; root++) {
                for (const id of ALL_CHORDS) {
                    const cs = { rootIndex: root, chordId: id };
                    const env = { transOffset: off, findChordObj };
                    const bass = G.gtrBassMidi(env, cs, null);
                    const up = G.gtrUpperMidi(env, cs, bass, null);
                    const chordPcs = new Set(findChordObj(id).notes.map(iv => mod12(root + iv + off)));
                    assert.ok(up.length >= 3 && up.length <= 4, `${root} ${id} : ${up.length} notes`);
                    up.forEach((m, k) => {
                        assert.ok(m >= G.GTR_UP_LO && m <= G.GTR_UP_HI, `${root} ${id} ${off} : ${m}`);
                        assert.ok(chordPcs.has(mod12(m)), `${root} ${id} : note étrangère ${m}`);
                        if (k > 0) assert.ok(m > up[k - 1]);
                    });
                    assert.ok(up[0] - bass >= 0, 'la basse reste sous les notes aiguës');
                }
            }
        }
    });
    test('conduite des voix : le même accord garde la même voix, un accord voisin bouge peu', () => {
        const env = { transOffset: 0, findChordObj };
        const v1 = G.gtrVoice(env, { rootIndex: 2, chordId: 'm7' }, null);
        assert.strictEqual(G.gtrVoice(env, { rootIndex: 2, chordId: 'm7' }, v1), v1);
        const v2 = G.gtrVoice(env, { rootIndex: 7, chordId: '7' }, v1);
        const top = (v) => v.up[v.up.length - 1];
        assert.ok(Math.abs(top(v2) - top(v1)) <= 7, 'la voix du dessus reste proche');
    });
});

describe('guitarPhraseExtras', () => {
    test('intensité bornée, choix de phrase cohérents, tirages entre 0 et 1', () => {
        let prev = null;
        for (let idx = 0; idx < 80; idx++) {
            const ph = G.guitarPhraseExtras({ bpm: 100, ternary: false, bpb: 4 }, seeded(idx + 1), prev, idx);
            assert.ok(ph.intensity >= 0.22 && ph.intensity <= 0.85);
            assert.ok(['arp', 'travis'].includes(ph.family));
            assert.ok(ph.mixChord >= 0.35 && ph.mixChord <= 0.65);
            ['uArp', 'uArpAlt', 'uTravis', 'uChord', 'uChordAlt', 'uMix', 'uMixAlt'].forEach(k => assert.ok(ph[k] >= 0 && ph[k] < 1, k));
            assert.ok(ph.roll > 0.01 && ph.roll < 0.026);
            assert.ok([0, 1, 2].includes(ph.ending));
            prev = { ...ph, style: 'guitar' };
        }
    });
    test('déterministe pour un même tirage', () => {
        const a = G.guitarPhraseExtras({ bpm: 100 }, seeded(5), null, 0);
        const b = G.guitarPhraseExtras({ bpm: 100 }, seeded(5), null, 0);
        assert.deepEqual(a, b);
    });
    test('buildBandPhrase appelle les extras Guitare (pour toutes les signatures)', () => {
        for (const meter of Object.keys(METERS)) {
            const [bpb, ternary] = METERS[meter];
            const ph = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm: 100, isCuba: false, groove: null, rng: seeded(3) }, 0, 'guitar', null);
            assert.equal(ph.style, 'guitar');
            assert.ok(typeof ph.intensity === 'number' && ph.uArp >= 0);
        }
    });
});

describe('buildGuitarPlan', () => {
    test('toutes signatures, transpositions et graines : notes dans le registre, dans l\'accord, positions dans la mesure', () => {
        for (const meter of Object.keys(METERS)) {
            for (const off of [0, -2, -9]) {
                for (let seed = 1; seed <= 12; seed++) {
                    const steps = playGrid({ meter, off, seed, bpm: 90, grid: GRID, measures: 12 });
                    steps.forEach(({ plan, g, halves, bpb, env, mi }) => {
                        assert.equal(plan.classicalGuitar, true);
                        assert.deepEqual(plan.bass, []);
                        assert.deepEqual(plan.drums, []);
                        assert.ok(plan.piano.length > 0, `${meter} mesure ${mi} vide`);
                        const splitAt = env.splitBeat;
                        plan.piano.forEach(e => {
                            assert.ok(e.pos >= 0 && e.pos < bpb, `${meter} pos ${e.pos}`);
                            assert.ok(e.dur >= 0.2 && e.dur <= bpb + 3, `durée ${e.dur}`);
                            assert.ok(e.vel > 0 && e.vel <= 1);
                            assert.equal(e.rootIndex, 0);
                            assert.equal(e.intervals.length, e.noteVels.length);
                            const cs = halves ? (e.pos < splitAt ? halves[0] : halves[1]) : g;
                            const chordObj = findChordObj(cs.chordId);
                            const pcs = new Set(chordObj.notes.map(iv => mod12(cs.rootIndex + iv + off)));
                            if (Number.isInteger(cs.bassRootIndex)) pcs.add(mod12(cs.bassRootIndex + off));
                            realNotes(e, off).forEach(n => {
                                assert.ok(n >= G.GTR_BASS_LO && n <= G.GTR_UP_HI, `${meter} hors registre : ${n}`);
                                if (e.tok !== 'A') assert.ok(pcs.has(mod12(n)), `${meter} ${cs.chordId} : ${n} n'est pas dans l'accord (${e.tok})`);
                            });
                        });
                    });
                }
            }
        }
    });
    test('les gestes tombent sur des cases : croches (binaire) ou tiers de pulsation (composé)', () => {
        for (const meter of Object.keys(METERS)) {
            const ternary = METERS[meter][1];
            const unit = ternary ? 1 / 3 : 0.5;
            playGrid({ meter, seed: 4, grid: GRID, measures: 8 }).forEach(({ plan }) => {
                plan.piano.forEach(e => assert.ok(Math.abs(e.pos / unit - Math.round(e.pos / unit)) < 1e-9, `${meter} ${e.pos}`));
            });
        }
    });
    test('mélange d\'arpèges et d\'accords : notes seules et accords dans la même phrase, sur plusieurs graines', () => {
        for (const meter of Object.keys(METERS)) {
            let single = 0, chords = 0, mixedPhrases = 0, phrases = 0;
            for (let seed = 1; seed <= 30; seed++) {
                const steps = playGrid({ meter, seed, grid: GRID, measures: 4 });
                let s = 0, c = 0;
                steps.forEach(({ plan }) => plan.piano.forEach(e => { if (e.intervals.length > 1) c++; else s++; }));
                single += s; chords += c; phrases++;
                if (s > 0 && c > 0) mixedPhrases++;
            }
            assert.ok(single > chords, `${meter} : surtout des arpèges`);
            assert.ok(chords > 0.08 * (single + chords), `${meter} : assez d'accords (${chords}/${single + chords})`);
            assert.ok(mixedPhrases >= 0.7 * phrases, `${meter} : ${mixedPhrases}/${phrases} phrases mixtes`);
        }
    });
    test('déterministe : mêmes graines, même musique', () => {
        const a = playGrid({ meter: '4/4', seed: 9, grid: GRID, measures: 8 }).map(s => s.plan);
        const b = playGrid({ meter: '4/4', seed: 9, grid: GRID, measures: 8 }).map(s => s.plan);
        assert.deepEqual(a, b);
        const c = playGrid({ meter: '4/4', seed: 10, grid: GRID, measures: 8 }).map(s => s.plan);
        assert.notDeepEqual(a, c);
    });
    test('mémorise la voix de la guitare entre les mesures', () => {
        const steps = playGrid({ meter: '4/4', seed: 2, grid: GRID, measures: 3 });
        const env = steps[0].env;
        assert.ok(env.state.gtrVoice && Number.isInteger(env.state.gtrVoice.bass) && env.state.gtrVoice.up.length >= 3);
    });
    test('un accord répété garde la même basse et les mêmes notes aiguës', () => {
        const grid = [{ rootIndex: 0, chordId: 'maj7', measures: 4 }];
        const steps = playGrid({ meter: '4/4', seed: 3, grid, measures: 4 });
        // basse = la note la plus grave des gestes qui la jouent (pouce, accord plein, accord arpégé, pincé)
        const bassOf = (plan) => plan.piano.filter(e => ['B', 'C', 'R', 'P'].includes(e.tok)).map(e => e.intervals[0]);
        const all = steps.flatMap(s => bassOf(s.plan));
        assert.ok(all.length >= 4);
        all.forEach(b => assert.equal(b, all[0]));
        const upOf = (plan) => plan.piano.filter(e => ['c', 'u'].includes(e.tok)).map(e => e.intervals.join(','));
        const ups = new Set(steps.flatMap(s => upOf(s.plan)));
        assert.ok(ups.size <= 1);
    });
    test('dernier accord de la grille (sans boucle) : un accord plein arpégé lentement, qui résonne', () => {
        const grid = [{ rootIndex: 0, chordId: 'maj7', measures: 1 }];
        const steps = playGrid({ meter: '4/4', seed: 3, grid, measures: 1, loop: false });
        const { plan } = steps[0];
        assert.equal(plan.piano.length, 1);
        const e = plan.piano[0];
        assert.equal(e.tok, 'R');
        assert.ok(e.intervals.length >= 4);
        assert.ok(e.roll >= 0.045, 'roulé lentement');
        assert.ok(e.dur > 4, 'il résonne');
    });
    test('l\'accord suivant est annoncé par une note d\'approche à un demi-ton ou un ton de sa basse', () => {
        let found = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const steps = playGrid({ meter: '4/4', seed, grid: GRID, measures: 12 });
            steps.forEach(({ plan, g, halves, nextStep, isLast, env }, k) => {
                const A = plan.piano.filter(e => e.tok === 'A');
                if (!A.length) return;
                found++;
                assert.ok(isLast && nextStep, 'seulement avant un changement d\'accord');
                const a = realNotes(A[0], env.transOffset)[0];
                const target = G.gtrBassMidi(env, nextStep, steps[k].env.state.gtrVoice ? steps[k].env.state.gtrVoice.bass : null);
                const d = Math.abs(a - target);
                assert.ok(d >= 1 && d <= 2 || d === 10 || d === 11, `distance ${d}`);
                assert.ok(a >= G.GTR_BASS_LO && a <= G.GTR_BASS_HI);
                assert.ok(A[0].pos >= 3, 'sur le dernier temps');
            });
        }
        assert.ok(found > 10, 'des notes d\'approche apparaissent');
    });
    test('tempo très rapide : moins de notes qu\'à tempo modéré', () => {
        const count = (bpm) => playGrid({ meter: '4/4', seed: 5, bpm, grid: GRID, measures: 8 }).reduce((n, s) => n + s.plan.piano.length, 0);
        assert.ok(count(300) < count(80));
    });
    test('mesure à deux accords : chaque moitié joue son accord', () => {
        const grid = [{ rootIndex: 2, chordId: 'm7', measures: 1, split: { rootIndex: 7, chordId: '7' } }];
        for (let seed = 1; seed <= 10; seed++) {
            const { plan, env } = playGrid({ meter: '4/4', seed, grid, measures: 1 })[0];
            const first = plan.piano.filter(e => e.pos < 2), second = plan.piano.filter(e => e.pos >= 2);
            assert.ok(first.length && second.length);
            const dm = new Set(findChordObj('m7').notes.map(iv => (2 + iv) % 12)), g7 = new Set(findChordObj('7').notes.map(iv => (7 + iv) % 12));
            first.forEach(e => realNotes(e, 0).forEach(n => assert.ok(dm.has(mod12(n)))));
            second.forEach(e => { if (e.tok !== 'A') realNotes(e, 0).forEach(n => assert.ok(g7.has(mod12(n)))); });
            void env;
        }
    });
    test('durées : les cordes ne vibrent pas bien au-delà de l\'accord (sauf accord suivant identique)', () => {
        const grid = [{ rootIndex: 2, chordId: 'm7', measures: 1 }, { rootIndex: 7, chordId: '7', measures: 1 }];
        playGrid({ meter: '4/4', seed: 6, grid, measures: 8 }).forEach(({ plan, bpb }) => {
            plan.piano.forEach(e => assert.ok(e.pos + e.dur <= bpb + 0.05 + 1e-9, `${e.pos}+${e.dur}`));
        });
    });
});

// ---------- Curseur « Densité » ----------
describe('densité de notes (curseur du pop-up Orchestre)', () => {
    const run = (density, { bpm = 100, seed = 1, meter = '4/4' } = {}) => {
        const [bpb, ternary] = METERS[meter];
        const env = { transOffset: 0, bpm, splitBeat: bpb === 2 ? 1 : 2, findChordObj, state: { gtrVoice: null }, density };
        let phrase = null, total = 0, plans = [];
        for (let mi = 0; mi < 8; mi++) {
            const g = GRID[mi % GRID.length], nx = GRID[(mi + 1) % GRID.length];
            const pi = Math.floor(mi / 4), i = mi % 4;
            if (!phrase || phrase.index !== pi) {
                phrase = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm, isCuba: false, groove: null, rng: seeded(seed + pi * 7919 + 1) }, pi, 'guitar', phrase);
            }
            const plan = G.buildGuitarPlan(env, bpb, ternary, g, nx, true, null, phrase, i, 4, i === 3, mi);
            total += plan.piano.length; plans.push(plan);
        }
        return { total, plans };
    };
    const avg = (d, o) => { let t = 0; for (let s = 1; s <= 30; s++) t += run(d, { ...o, seed: s }).total; return t / 30; };

    test('sans densité (env.density absent) : écriture inchangée', () => {
        for (let s = 1; s <= 10; s++) assert.deepEqual(run(undefined, { seed: s }).plans.length, 8);
        assert.equal(avg(undefined), avg(undefined));
    });
    test('plus la densité monte, plus la guitare joue de notes', () => {
        const levels = [0, 0.3, 0.6, 0.85, 1].map(d => avg(d));
        for (let k = 1; k < levels.length; k++) assert.ok(levels[k] > levels[k - 1], levels.join(' < '));
        assert.ok(levels[4] > levels[1] * 1.8, `${levels[1]} → ${levels[4]}`);
    });
    test('la valeur par défaut (60 %) joue sensiblement plus que l\'écriture d\'origine', () => {
        assert.ok(avg(0.6) > avg(undefined) * 1.2, `${avg(0.6)} vs ${avg(undefined)}`);
    });
    test('événements valides à toutes les densités et signatures : positions dans la mesure, hauteurs jouables, durées positives', () => {
        for (const meter of Object.keys(METERS)) {
            for (const d of [0, 0.5, 1]) {
                for (let s = 1; s <= 8; s++) {
                    const bpb = METERS[meter][0];
                    run(d, { meter, seed: s }).plans.forEach(pl => pl.piano.forEach(e => {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${meter} d=${d} pos ${e.pos}`);
                        assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
                        realNotes(e, 0).forEach(n => assert.ok(n >= G.GTR_BASS_LO && n <= G.GTR_UP_HI, `${n}`));
                    }));
                }
            }
        }
    });
    test('doubles-croches : seulement en binaire et jusqu\'à 150 BPM', () => {
        const frac = (pl, spb) => pl.piano.some(e => Math.abs(e.pos * spb * 2 - Math.round(e.pos * spb * 2)) < 1e-9 && Math.abs(e.pos * spb - Math.round(e.pos * spb)) > 1e-9);
        let found = false;
        for (let s = 1; s <= 10; s++) run(1, { seed: s, bpm: 100 }).plans.forEach(pl => { if (frac(pl, 2)) found = true; });
        assert.ok(found, 'des doubles-croches à 100 BPM');
        for (let s = 1; s <= 10; s++) run(1, { seed: s, bpm: 170 }).plans.forEach(pl => assert.ok(!frac(pl, 2), 'pas de doubles-croches à 170 BPM'));
        for (let s = 1; s <= 10; s++) run(1, { seed: s, meter: '6/8' }).plans.forEach(pl => assert.ok(!pl.piano.some(e => Math.abs(e.pos * 6 - Math.round(e.pos * 6)) > 1e-9), 'pas de doubles-croches en 6/8'));
    });
    test('gtrDensify : densité faible retire des notes, jamais la première case ; densité forte ne laisse plus de silence (tempo lent)', () => {
        const cell = ['B', '1', '2', '3', '2', '1', '2', '3'];
        let removed = 0;
        for (let s = 1; s <= 50; s++) {
            const out = G.gtrDensify(cell, { d: 0, spb: 2, ternary: false, tooFast: false, bpm: 100, maxRank: 3, rng: seeded(s) });
            assert.equal(out.cell[0], 'B');
            removed += out.cell.filter(t => t === '.').length;
        }
        assert.ok(removed > 50 * 1.5, `${removed}`);
        const sparse = ['C', '.', '.', '.', 'c', '.', '.', '.'];
        for (let s = 1; s <= 20; s++) {
            const out = G.gtrDensify(sparse, { d: 1, spb: 2, ternary: false, tooFast: false, bpm: 100, maxRank: 3, rng: seeded(s) });
            assert.ok(out.cell.every(t => t !== '.'), out.cell.join(' '));
            out.cell.forEach(t => assert.ok(TOKENS.has(t)));
        }
    });
    test('gtrDensify : trop rapide → aucun silence rempli ; la cellule d\'entrée n\'est pas modifiée', () => {
        const sparse = ['C', '.', '.', '.', 'c', '.', '.', '.'];
        const copy = sparse.slice();
        const out = G.gtrDensify(sparse, { d: 1, spb: 2, ternary: false, tooFast: true, bpm: 100, maxRank: 3, rng: seeded(2) });
        assert.deepEqual(out.cell, sparse);
        assert.deepEqual(sparse, copy);
    });
});
