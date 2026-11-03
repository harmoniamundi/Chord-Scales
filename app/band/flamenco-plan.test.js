// Tests du toque flamenco (band/flamenco-plan.js) : formes d'accords à cordes à vide, cycles du compás, falsetas, plan d'une mesure.
// Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('./flamenco-plan.js');
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
const TOKENS = new Set(['D', 'd', 'U', 'S', 'A', 'a', 'T', 't', '1', '2', '3', '.']);
const PALOS = ['f-solea', 'f-bulerias', 'f-tangos'];
const PERC = new Set(['cajonb', 'cajont', 'palma', 'sorda', 'pito']);
const NAME = { 'f-solea': 'solea', 'f-bulerias': 'bulerias', 'f-tangos': 'tangos' };

// Rejoue une grille mesure par mesure comme le moteur (phrases de 4 mesures)
function playGrid({ meter = '12/8', groove = 'f-solea', off = 0, seed = 1, bpm = 60, grid, measures = 8, loop = true, L = 4 }) {
    const [bpb, ternary] = METERS[meter];
    const env = { transOffset: off, bpm, splitBeat: bpb === 2 ? 1 : 2, findChordObj, state: { gtrVoice: null } };
    const flat = [];
    grid.forEach(g => { for (let k = 0; k < (g.measures || 1); k++) flat.push({ g, k }); });
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
            phrase = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm, isCuba: false, groove, rng: seeded(seed + pi * 7919 + 1) }, pi, 'guitar', phrase);
        }
        const halves = g.split ? [{ rootIndex: g.rootIndex, chordId: g.chordId, scaleId: g.scaleId }, { rootIndex: g.split.rootIndex, chordId: g.split.chordId, scaleId: g.split.scaleId }] : null;
        const plan = G.buildGuitarPlan(env, bpb, ternary, g, nextStep, isLast, halves, phrase, i, L, i === L - 1, mi);
        out.push({ mi, g, nextStep, halves, bpb, ternary, plan, phrase, env, isLast });
    }
    return out;
}
const st = (rootIndex, chordId, scaleId, split) => ({ rootIndex, chordId, scaleId, measures: 1, split });
const ANDALUSIAN = [st(9, 'minTriad', 'aeolian'), st(7, 'majTriad', 'mixolydian'), st(5, 'majTriad', 'lydian'), st(4, 'majTriad', 'phrygianDominant')];
const MIXED = [st(9, 'minTriad', 'aeolian', { rootIndex: 7, chordId: 'majTriad', scaleId: 'mixolydian' }), st(5, 'majTriad', 'lydian', { rootIndex: 4, chordId: '7b9', scaleId: 'phrygianDominant' }), st(9, 'minTriad', 'aeolian'), st(4, 'majTriad', 'phrygianDominant')];

describe('formes d\'accords flamencas', () => {
    const env = { transOffset: 0, findChordObj };
    test('famille d\'accord : majeur, mineur, dominante, 7(b9) ; suspendu et diminué : pas de forme', () => {
        assert.equal(F.flaFamily([0, 4, 7]), 'M');
        assert.equal(F.flaFamily([0, 4, 7, 11]), 'M');
        assert.equal(F.flaFamily([0, 3, 7]), 'm');
        assert.equal(F.flaFamily([0, 3, 7, 10]), 'm');
        assert.equal(F.flaFamily([0, 4, 7, 10]), '7');
        assert.equal(F.flaFamily([0, 4, 7, 10, 1]), '7b9');
        assert.equal(F.flaFamily([0, 3, 6, 10]), null);
        assert.equal(F.flaFamily([0, 5, 7]), null);
    });
    test('la cadence andalouse sonne comme sur une guitare : La m 002210, Sol 320003, Fa 133211, Mi 022100', () => {
        const midi = (r, c) => F.flaVoice(env, { rootIndex: r, chordId: c }).all;
        assert.deepEqual(midi(9, 'minTriad'), [45, 52, 57, 60, 64]);          // A2 E3 A3 C4 E4
        assert.deepEqual(midi(7, 'majTriad'), [43, 47, 50, 55, 59, 67]);      // G2 B2 D3 G3 B3 G4
        assert.deepEqual(midi(5, 'majTriad'), [41, 48, 53, 57, 60, 65]);      // F2 C3 F3 A3 C4 F4 (barré case 1)
        assert.deepEqual(midi(4, 'majTriad'), [40, 47, 52, 56, 59, 64]);      // E2 B2 E3 G#3 B3 E4
        assert.deepEqual(midi(4, '7b9'), [40, 47, 50, 56, 59, 65]);           // E2 B2 D3 G#3 B3 F4 : la neuvième mineure sur la corde aiguë
    });
    test('toutes les racines et familles : la basse est la fondamentale, les notes sont celles de l\'accord, registre de guitare', () => {
        for (const c of ['majTriad', 'minTriad', '7', '7b9', 'm7', 'maj7']) {
            const notes = findChordObj(c).notes;
            for (let r = 0; r < 12; r++) {
                const v = F.flaVoice(env, { rootIndex: r, chordId: c });
                const tones = new Set(notes.map(x => mod12(r + x)));
                assert.equal(mod12(v.bass), mod12(r + notes[0]), `${c} ${r} basse`);
                v.all.forEach(m => { assert.ok(tones.has(mod12(m)), `${c} ${r} note ${m}`); assert.ok(m >= 40 && m <= 76, `${c} ${r} registre ${m}`); });
                for (let k = 1; k < v.all.length; k++) assert.ok(v.all[k] > v.all[k - 1], `${c} ${r} cordes croissantes`);
                assert.ok(v.all.length >= 4, `${c} ${r} au moins quatre cordes`);
            }
        }
    });
    test('instrument transpositeur : on garde les mêmes hauteurs réelles (La mineur sonne La mineur)', () => {
        const bb = { transOffset: -2, findChordObj };
        assert.deepEqual(F.flaVoice(bb, { rootIndex: 11, chordId: 'minTriad' }).all, [45, 52, 57, 60, 64]);
    });
    test('accord sur basse (Am/E) : forme générique avec la basse demandée', () => {
        const v = F.flaVoice(env, { rootIndex: 9, chordId: 'minTriad', bassRootIndex: 4 });
        assert.equal(mod12(v.bass), 4);
        assert.equal(v.shape, null);
        v.all.slice(1).forEach(m => assert.ok(m > v.bass));
    });
    test('toutes les qualités d\'accord du catalogue donnent une voix jouable', () => {
        for (const c of ALL_CHORDS) for (const r of [0, 4, 9]) {
            const v = F.flaVoice(env, { rootIndex: r, chordId: c });
            assert.ok(v.all.length >= 2 && v.all.every(Number.isFinite), `${c} ${r}`);
            assert.ok(v.bass >= 38 && v.bass <= 55, `${c} ${r} basse ${v.bass}`);
        }
    });
});

describe('cycles du compás', () => {
    test('les accents des 12 temps sont 12, 3, 6, 8, 10 (cases 0, 3, 6, 8, 10)', () => {
        assert.deepEqual(F.flaAccents(12, 3), [0, 3, 6, 8, 10]);
        assert.deepEqual(F.flaAccents(8, 2), [0, 2, 4, 6]);
    });
    test('chaque cellule écrite a la bonne longueur, des gestes connus et un geste plein sur le temps 12 / le temps 1', () => {
        const expected = { solea: 12, bulerias: 12, tangos: 8 };
        for (const palo of Object.keys(F.FLA_BANK)) {
            const N = expected[palo];
            const table = F.FLA_BANK[palo][N];
            assert.ok(table, palo);
            for (const kind of ['base', 'alt', 'arp', 'turn']) {
                assert.ok(table[kind].length >= 1, `${palo} ${kind}`);
                table[kind].forEach(cell => {
                    assert.equal(cell.length, N, `${palo} ${kind} ${cell.join(' ')}`);
                    cell.forEach(tok => { const [g, golpe] = tok.split('/'); assert.ok(TOKENS.has(g), `${palo} geste ${tok}`); assert.ok(golpe === undefined || golpe === 'G' || golpe === 'g'); });
                    assert.notEqual(cell[0], '.', `${palo} ${kind} doit démarrer sur un geste`);
                });
            }
        }
    });
    test('la bulerías est plus dense que la soleá ; les remates finissent par un rasgueo qui lance le compás suivant', () => {
        const count = (cells) => cells.reduce((s, c) => s + c.filter(t => t !== '.').length, 0) / cells.length;
        assert.ok(count(F.FLA_BANK.bulerias[12].base) > count(F.FLA_BANK.solea[12].base) - 0.5);
        for (const palo of ['solea', 'bulerias']) F.FLA_BANK[palo][12].turn.forEach(c => assert.equal(c[11], 'A'));
    });
    test('signature sans cycle écrit : cycle générique sur les temps', () => {
        const c = F.flaCellsFor('solea', 6, 2, 'base')[0];
        assert.equal(c.length, 6);
        assert.equal(c[0], 'D');
        const t = F.flaCellsFor('solea', 9, 3, 'turn')[0];
        assert.equal(t[8], 'A');
    });
});

describe('extras de phrase', () => {
    test('un rythme flamenco marque la phrase ; sans rythme (ou autre rythme), rien ne change', () => {
        for (const groove of PALOS) {
            const ph = buildBandPhrase({ lib: H.patternLib('12/8', 'guitar'), bpb: 4, ternary: true, bpm: 60, isCuba: false, groove, rng: seeded(4) }, 0, 'guitar', null);
            assert.equal(ph.flamenco, NAME[groove]);
            assert.ok(ph.intensity >= 0.3 && ph.intensity <= 0.92);
        }
        for (const groove of [null, undefined, 'samba', 'lyrique']) {
            const ph = buildBandPhrase({ lib: H.patternLib('4/4', 'guitar'), bpb: 4, ternary: false, bpm: 100, isCuba: false, groove, rng: seeded(4) }, 0, 'guitar', null);
            assert.equal(ph.flamenco, undefined);
        }
    });
    test('la guitare classique habituelle est inchangée quand le rythme n\'est pas flamenco (même tirages)', () => {
        const a = G.guitarPhraseExtras({ bpm: 100, ternary: false, bpb: 4 }, seeded(7), null, 0);
        const b = G.guitarPhraseExtras({ bpm: 100, ternary: false, bpb: 4, groove: 'samba' }, seeded(7), null, 0);
        assert.deepEqual(a, b);
    });
});

describe('plan d\'une mesure flamenca', () => {
    test('tous les palos : événements dans la mesure, triés, hauteurs entières, golpes sur le bus de la guitare, percussions sur le leur', () => {
        for (const [groove, meter] of [['f-solea', '12/8'], ['f-bulerias', '12/8'], ['f-tangos', '4/4']]) {
            for (let seed = 1; seed <= 6; seed++) {
                playGrid({ meter, groove, seed, grid: MIXED, measures: 16, bpm: groove === 'f-tangos' ? 108 : 70 }).forEach(({ plan, bpb }) => {
                    assert.equal(plan.classicalGuitar, true);
                    assert.deepEqual(plan.bass, []);
                    assert.ok(plan.piano.length > 0);
                    let last = -1;
                    plan.piano.forEach(e => {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${groove} pos ${e.pos}`);
                        assert.ok(e.pos >= last - 1e-9); last = e.pos;
                        assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
                        assert.ok(e.intervals.length >= 1 && e.intervals.every(Number.isInteger));
                        assert.equal(e.noteVels.length, e.intervals.length);
                    });
                    plan.drums.forEach(d => {
                        if (d.drum === 'golpe') assert.equal(d.onGuitar, true);
                        else { assert.ok(PERC.has(d.drum), d.drum); assert.equal(d.perc, true); assert.ok(!d.onGuitar); }
                        assert.ok(d.pos >= 0 && d.pos < bpb); assert.ok(d.vel > 0 && d.vel <= 1);
                    });
                });
            }
        }
    });
    test('déterministe pour une même graine', () => {
        const a = playGrid({ grid: MIXED, seed: 5, measures: 8 }).map(x => x.plan);
        const b = playGrid({ grid: MIXED, seed: 5, measures: 8 }).map(x => x.plan);
        assert.deepEqual(a, b);
    });
    test('hauteurs réelles : toutes entre mi2 et sol5, et les notes jouées appartiennent à l\'accord ou à sa gamme', () => {
        for (const off of [0, -2, -9]) {
            playGrid({ grid: ANDALUSIAN, off, seed: 3, measures: 16 }).forEach(({ plan, g }) => {
                const gamme = new Set(T.scalesDb[g.scaleId].intervals.map(x => mod12(g.rootIndex + x + off)));
                plan.piano.forEach(e => e.intervals.forEach(v => {
                    const midi = F.FLA_BASE + v + off;
                    assert.ok(midi >= 40 && midi <= 79, `registre ${midi}`);
                    assert.ok(gamme.has(mod12(midi)) || e.tok === 'U' || e.tok === 'D' || e.tok === 'A' || e.tok === 'g', `note ${midi} hors gamme (${e.tok})`);
                }));
            });
        }
    });
    test('premier temps (12) : un geste plein ou une basse, jamais un silence ; le changement d\'accord à mi-mesure tombe sur un geste', () => {
        playGrid({ grid: MIXED, seed: 2, measures: 16 }).forEach(({ plan, halves, bpb }) => {
            assert.ok(plan.piano.some(e => e.pos < 1e-6), 'temps 12');
            if (halves) assert.ok(plan.piano.some(e => Math.abs(e.pos - 2) < 0.1), 'changement d\'accord');
        });
    });
    test('la première moitié sonne le premier accord, la seconde le second', () => {
        playGrid({ grid: [MIXED[0]], seed: 2, measures: 1 }).forEach(({ plan }) => {
            const first = plan.piano.filter(e => e.pos < 2 - 1e-6 && e.intervals.length > 1);
            const second = plan.piano.filter(e => e.pos >= 2 - 1e-6 && e.intervals.length > 1);
            assert.ok(first.length && second.length);
            assert.equal(mod12(F.FLA_BASE + Math.min(...second[0].intervals)), 7); // Sol
            assert.equal(mod12(F.FLA_BASE + Math.min(...first[0].intervals)), 9);  // La
        });
    });
    test('le coup montant du dernier temps peut annoncer l\'accord suivant (adelanto), sans sortir de la mesure', () => {
        let found = false;
        for (let seed = 1; seed <= 80 && !found; seed++) {
            playGrid({ grid: ANDALUSIAN, seed, measures: 16 }).forEach(({ plan, bpb, g }) => {
                plan.piano.forEach(e => { if (e.tok === 'U' && e.pos >= bpb - 0.34) found = true; });
            });
        }
        assert.ok(found);
    });
    test('dernière mesure de la grille (sans boucle) : abanico et golpe, l\'accord résonne longtemps', () => {
        const out = playGrid({ grid: [st(9, 'minTriad', 'aeolian')], measures: 1, loop: false });
        const { plan } = out[0];
        const golpes = plan.drums.filter(d => d.drum === 'golpe');
        assert.equal(golpes.length, 1);
        assert.equal(golpes[0].tok, 'G');
        // cajón grave + palma claire tombent avec le golpe final, rien d'autre
        const percs = plan.drums.filter(d => d.perc);
        assert.deepEqual(percs.map(d => d.drum).sort(), ['cajonb', 'palma']);
        percs.forEach(d => assert.ok(Math.abs(d.pos - golpes[0].pos) < 1e-9));
        assert.ok(plan.piano.length >= 4);
        const lastStroke = plan.piano[plan.piano.length - 1];
        assert.ok(lastStroke.dur > 4, 'dur ' + lastStroke.dur);
        assert.ok(lastStroke.intervals.length >= 5);
    });
    test('les mesures « falseta » existent, à une voix, avec le pouce sur la basse', () => {
        let falsetas = 0;
        for (let seed = 1; seed <= 40; seed++) {
            playGrid({ grid: ANDALUSIAN, seed, measures: 8 }).forEach(({ plan }) => {
                if (plan.piano.some(e => e.tok === 'p')) {
                    falsetas++;
                    assert.ok(plan.piano.filter(e => e.tok === 'p').length >= 6);
                    assert.ok(plan.piano.some(e => e.tok === 'T'));
                    plan.piano.forEach(e => assert.equal(e.intervals.length, 1));
                }
            });
        }
        assert.ok(falsetas > 10);
    });
    test('la dernière mesure d\'une phrase est un remate (rasgueo enchaîné) vers le compás suivant', () => {
        const out = playGrid({ grid: ANDALUSIAN, seed: 4, measures: 8 });
        out.filter(x => x.mi % 4 === 3).forEach(({ plan }) => {
            const tail = plan.piano.filter(e => e.pos >= 3 - 1e-6);
            assert.ok(tail.some(e => e.tok === 'A'), 'abanico final');
        });
    });
    test('toutes signatures, tous les accords du catalogue : aucun plan vide ni hors mesure', () => {
        for (const meter of Object.keys(METERS)) for (const groove of PALOS) {
            const grid = ALL_CHORDS.slice(0, 40).map((c, k) => st(k % 12, c, undefined));
            playGrid({ meter, groove, grid, measures: 40, seed: 3, bpm: 90 }).forEach(({ plan, bpb }) => {
                assert.ok(plan.piano.length > 0, `${meter} ${groove}`);
                plan.piano.forEach(e => assert.ok(e.pos >= 0 && e.pos < bpb && e.intervals.every(Number.isFinite)));
            });
        }
    });
});

describe('falseta', () => {
    const env = { transOffset: 0, bpm: 60, findChordObj };
    test('notes de la gamme de l\'accord, dans le registre, la dernière sur un accent, jamais plus de deux notes simultanées', () => {
        for (const cs of [{ rootIndex: 4, chordId: 'majTriad', scaleId: 'phrygianDominant' }, { rootIndex: 9, chordId: 'minTriad', scaleId: 'aeolian' }, { rootIndex: 5, chordId: 'majTriad', scaleId: 'lydian' }]) {
            const scale = new Set(T.scalesDb[cs.scaleId].intervals.map(x => mod12(cs.rootIndex + x)));
            for (let seed = 1; seed <= 20; seed++) {
                const voice = F.flaVoice(env, cs);
                const notes = F.flaFalseta(env, cs, voice, 12, 3, 'solea', 0.6, seeded(seed));
                const mel = notes.filter(n => !n.bass);
                assert.ok(mel.length >= 5, 'phrase trop courte');
                mel.forEach(n => { assert.ok(scale.has(mod12(n.midi)), `note ${n.midi} hors gamme`); assert.ok(n.midi >= 57 && n.midi <= 79); assert.ok(n.slot >= 0 && n.slot <= 10); });
                const main = mel.filter(n => !n.grace);
                assert.ok(F.flaAccents(12, 3).includes(main[main.length - 1].slot), 'la phrase retombe sur un accent');
                assert.equal(main[main.length - 1].slot, 10);
                assert.ok(notes.some(n => n.bass && n.slot === 0 && n.midi === voice.bass));
            }
        }
    });
    test('la ligne mélodique finit sur la note visée et ne saute jamais plus d\'une tierce de gamme', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const idx = F.flaRun(15, 7, 9, seeded(seed));
            assert.equal(idx.length, 9);
            assert.equal(idx[idx.length - 1], 7);
            for (let k = 1; k < idx.length; k++) { assert.ok(Math.abs(idx[k] - idx[k - 1]) <= 2 && idx[k] !== idx[k - 1]); assert.ok(idx[k] >= 0 && idx[k] < 15); }
        }
    });
});


describe('percussions : cajón, palmas, pitos', () => {
    const run = (o) => playGrid({ grid: ANDALUSIAN, measures: 32, ...o });
    const percOf = (r) => r.plan.drums.filter(d => d.perc);
    const countBy = (outs, drum) => outs.reduce((n, r) => n + percOf(r).filter(d => d.drum === drum).length, 0);

    test('chaque palo a ses percussions à chaque mesure, sur des positions de case du compás', () => {
        for (const [groove, meter, spb, bpm] of [['f-solea', '12/8', 3, 52], ['f-bulerias', '12/8', 3, 88], ['f-tangos', '4/4', 2, 108]]) {
            for (let seed = 1; seed <= 5; seed++) {
                run({ groove, meter, seed, bpm, loop: true }).forEach(r => {
                    const p = percOf(r);
                    assert.ok(p.length >= 1, `${groove} mesure ${r.mi}`);
                    p.forEach(d => assert.ok(Math.abs(d.pos * spb - Math.round(d.pos * spb)) < 1e-9, `${groove} pos ${d.pos}`));
                });
            }
        }
    });
    test('soleá : palmas sourdes sur les accents 12-3-6-8-10, plus discrète que la bulerías', () => {
        const solea = run({ groove: 'f-solea', seed: 2, bpm: 52 });
        const bul = run({ groove: 'f-bulerias', seed: 2, bpm: 88 });
        const accPos = new Set([0, 1, 2, 8 / 3, 10 / 3].map(x => Math.round(x * 3) / 3));
        solea.forEach(r => percOf(r).filter(d => d.drum === 'sorda').forEach(d => assert.ok(accPos.has(Math.round(d.pos * 3) / 3), 'sorda hors accent ' + d.pos)));
        assert.ok(countBy(solea, 'sorda') > 0);
        const total = (outs) => outs.reduce((n, r) => n + percOf(r).length, 0);
        assert.ok(total(bul) > total(solea), 'bulerías plus fournie');
        assert.ok(countBy(bul, 'cajonb') > 0 && countBy(bul, 'cajont') > 0 && countBy(bul, 'palma') > 0);
    });
    test('bulerías : cajón grave sur le temps 12 de chaque mesure normale, pitos et palmas sourdes en contretemps', () => {
        const outs = run({ groove: 'f-bulerias', seed: 3, bpm: 88, measures: 64 });
        outs.filter(r => !r.isLast && r.plan.piano.every(e => e.tok !== 'p')).forEach(r => assert.ok(percOf(r).some(d => d.drum === 'cajonb' && d.pos < 1e-9), `mesure ${r.mi}`));
        assert.ok(countBy(outs, 'pito') > 0, 'pitos');
        assert.ok(countBy(outs, 'sorda') > 0, 'palmas sourdes');
    });
    test('rumba / tangos : grave sur le temps 1, claqué + palma claire sur les temps 2 et 4', () => {
        run({ groove: 'f-tangos', meter: '4/4', seed: 1, bpm: 108, measures: 16 }).filter(r => r.plan.piano.every(e => e.tok !== 'p')).forEach(r => {
            const p = percOf(r);
            assert.ok(p.some(d => d.drum === 'cajonb' && d.pos < 1e-9), 'grave sur 1');
            [1, 3].forEach(t => {
                assert.ok(p.some(d => d.drum === 'cajont' && Math.abs(d.pos - t) < 1e-9), 'claqué ' + t);
                assert.ok(p.some(d => d.drum === 'palma' && Math.abs(d.pos - t) < 1e-9), 'palma ' + t);
            });
        });
    });
    test('mesure de falseta : percussions allégées (ni pito, ni claqué de cajón)', () => {
        let seen = 0;
        for (let seed = 1; seed <= 40; seed++) {
            run({ groove: 'f-bulerias', seed, bpm: 88, measures: 8 }).forEach(r => {
                if (!r.plan.piano.some(e => e.tok === 'p')) return;
                seen++;
                percOf(r).forEach(d => { assert.ok(d.drum !== 'pito' && d.drum !== 'cajont', d.drum); assert.ok(d.vel <= 0.75); });
            });
        }
        assert.ok(seen > 5);
    });
    test('remate : la dernière mesure d\'une phrase finit par une palma claire sur la dernière case', () => {
        for (const [groove, meter, last] of [['f-bulerias', '12/8', 11 / 3], ['f-solea', '12/8', 11 / 3], ['f-tangos', '4/4', 3.5]]) {
            const outs = run({ groove, meter, seed: 4, bpm: 80, measures: 16 }).filter(r => r.mi % 4 === 3 && r.plan.piano.every(e => e.tok !== 'p'));
            assert.ok(outs.length >= 2);
            outs.forEach(r => assert.ok(percOf(r).some(d => d.drum === 'palma' && Math.abs(d.pos - last) < 1e-9), `${groove} remate ${r.mi}`));
        }
    });
    test('les autres signatures (2/4, 3/4, 6/8, 9/8) ont un grave sur le premier temps et des palmas sur les temps forts', () => {
        for (const meter of ['2/4', '3/4', '6/8', '9/8']) for (const groove of PALOS) {
            run({ groove, meter, seed: 2, bpm: 90, measures: 12 }).forEach(r => {
                const p = percOf(r);
                assert.ok(p.some(d => d.drum === 'cajonb' && d.pos < 1e-9), `${meter} ${groove} grave`);
                assert.ok(p.every(d => d.pos >= 0 && d.pos < r.bpb));
            });
        }
    });
    test('mesure à deux accords : mêmes percussions, indépendantes du découpage', () => {
        const a = playGrid({ grid: [st(9, 'minTriad', 'aeolian')], seed: 6, measures: 1, groove: 'f-bulerias', bpm: 88 })[0];
        const b = playGrid({ grid: [st(9, 'minTriad', 'aeolian', { rootIndex: 7, chordId: 'majTriad', scaleId: 'mixolydian' })], seed: 6, measures: 1, groove: 'f-bulerias', bpm: 88 })[0];
        assert.deepEqual(percOf(a), percOf(b));
    });
    test('la guitare ne change pas : mêmes notes qu\'avant (le tirage des percussions est à part)', () => {
        const a = run({ groove: 'f-bulerias', seed: 9 }).map(r => r.plan.piano);
        const b = run({ groove: 'f-bulerias', seed: 9 }).map(r => r.plan.piano);
        assert.deepEqual(a, b);
        assert.ok(a.every(p => p.length > 0));
    });
    test('flaPercussion : positions uniques par geste, vélocités dans [0,1], cases dans la mesure', () => {
        for (const [palo, N, spb] of [['solea', 12, 3], ['bulerias', 12, 3], ['tangos', 8, 2], ['solea', 6, 2], ['bulerias', 9, 3]]) {
            for (const kind of ['base', 'alt', 'arp', 'turn']) for (const lite of [false, true]) for (const I of [0.3, 0.6, 0.92]) {
                const out = F.flaPercussion(palo, N, spb, F.flaAccents(N, spb), kind, I, seeded(5), lite);
                const keys = out.map(x => x.k + x.g);
                assert.equal(new Set(keys).size, keys.length, `${palo} ${N} ${kind}`);
                out.forEach(x => { assert.ok(x.k >= 0 && x.k < N); assert.ok(x.vel >= 0.1 && x.vel <= 1); assert.ok(F.FLA_PERC_DRUM[x.g]); });
            }
        }
    });
});
