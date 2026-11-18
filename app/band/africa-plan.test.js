// Tests de l'orchestre « Afrique » (band/africa-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./africa-plan.js');
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
const C = { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian' };
const F = { rootIndex: 5, chordId: 'majTriad', scaleId: 'lydian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const CoverG = { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian', bassRootIndex: 7 };
const pc = (n) => ((n % 12) + 12) % 12;
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];

const mkEnv = (groove, over = {}) => ({ transOffset: 0, findChordObj, splitBeat: 2, bpm: 120, groove, state: { africaVoice: null, africaLead: null }, ...over });
const mkPhrase = (seed, groove, over = {}) => ({ rng: seeded(seed), style: 'africa', ...A.africaPhraseExtras(seeded(seed * 31), null, seed % 3, groove), ...over });
function plan(groove, { bpb = 4, ternary = false, step = C, nextStep = F, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(groove), ph = mkPhrase(seed, groove) } = {}) {
    return A.buildAfricaPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}
const inst = (p, k) => p.piano.filter(e => e.inst === k);

describe('rythmes', () => {
    test('six rythmes ; un rythme inconnu joue le highlife', () => {
        assert.deepEqual(A.AFRICA_GROOVES, ['af-afrobeat', 'af-highlife', 'af-rumba', 'af-soukous', 'af-benga', 'af-mbaqanga']);
        assert.equal(A.africaGroove('n\'importe'), 'af-highlife');
        assert.equal(A.africaGroove(null), 'af-highlife');
        A.AFRICA_GROOVES.forEach(g => { assert.ok(A.AFRICA_STYLE[g], g); assert.ok(A.AFRICA_NAMES[g], g); });
    });
    test('cuivres : afrobeat, highlife et rumba ; orgue : afrobeat et mbaqanga', () => {
        assert.deepEqual(A.AFRICA_GROOVES.filter(A.africaUsesHorns), ['af-afrobeat', 'af-highlife', 'af-rumba']);
        assert.deepEqual(A.AFRICA_GROOVES.filter(A.africaUsesOrgan), ['af-afrobeat', 'af-mbaqanga']);
    });
});

describe('africaPhraseExtras', () => {
    test('valeurs dans leurs bornes, pour chaque rythme et beaucoup de graines', () => {
        for (const g of A.AFRICA_GROOVES) for (let s = 1; s <= 120; s++) {
            const S = A.AFRICA_STYLE[g];
            const e = A.africaPhraseExtras(seeded(s), s % 2 ? null : { style: 'africa', intensity: (s % 10) / 10, bassIdx: 1 }, s % 4, g);
            assert.ok(e.intensity >= 0.28 && e.intensity <= 0.98);
            assert.ok(e.bassIdx >= 0 && e.bassIdx < S.bass.length);
            if (S.lead) assert.ok(e.leadIdx >= 0 && e.leadIdx < S.lead.length);
            if (S.chop) assert.ok(e.chopIdx >= 0 && e.chopIdx < S.chop.length);
            assert.equal(e.riffSteps.length, 8);
            e.riffSteps.forEach(x => assert.ok(Number.isInteger(x) && Math.abs(x) <= 3));
            for (const k of ['horns', 'hornPad', 'organ', 'lead2', 'fill', 'ghost16']) assert.equal(typeof e[k], 'boolean', k);
        }
    });
    test('déterministe à graine égale', () => {
        assert.deepEqual(A.africaPhraseExtras(seeded(5), null, 1, 'af-rumba'), A.africaPhraseExtras(seeded(5), null, 1, 'af-rumba'));
    });
});

describe('outils', () => {
    test('notes de l\'accord et pentatonique', () => {
        const c = A.afChordPcs({ findChordObj }, Dm7);
        assert.deepEqual([c.root, c.third, c.fifth, c.seventh, c.minor], [2, 5, 9, 0, true]);
        assert.deepEqual(A.afPentaPcs({ findChordObj }, Dm7).sort((a, b) => a - b), [0, 2, 5, 7, 9]);      // ré mineur pentatonique
        assert.deepEqual(A.afPentaPcs({ findChordObj }, G7).sort((a, b) => a - b), [2, 5, 7, 9, 11]);     // sol la si ré fa
        assert.deepEqual(A.afPentaPcs({ findChordObj }, C).sort((a, b) => a - b), [0, 2, 4, 7, 9]);
        assert.deepEqual(A.afLadder([0, 4, 7], 0, 12), [0, 4, 7, 12]);
    });
    test('voicing : trois notes de l\'accord dans le registre, conduite des voix', () => {
        const env = { transOffset: 0, findChordObj };
        for (const cs of [C, F, G7, Dm7]) {
            const v = A.afVoicing(env, cs, null, 57, 72, false);
            assert.equal(v.length, 3);
            assert.ok(v[0] < v[1] && v[1] < v[2]);
            v.forEach(x => { assert.ok(x + 48 >= 57 && x + 48 <= 72, `${x}`); assert.ok(A.afChordPcs(env, cs).triad.includes(pc(x))); });
        }
        const a = A.afVoicing(env, C, null, 57, 72, false);
        const b = A.afVoicing(env, F, a, 57, 72, false);
        assert.ok(b.reduce((s, x, k) => s + Math.abs(x - a[k]), 0) <= 5, 'Do → Fa bouge peu');
        // septième : fondamentale, tierce, septième
        const s = A.afVoicing(env, Dm7, null, 58, 74, true).map(pc).sort((x, y) => x - y);
        assert.deepEqual(s, [0, 2, 5]);
    });
});

describe('buildAfricaPlan', () => {
    test('chaque rythme : guitare, basse et percussions jouent ; tout tient dans la mesure', () => {
        for (const g of A.AFRICA_GROOVES) for (let s = 1; s <= 30; s++) {
            const p = plan(g, { seed: s, i: s % 4 });
            assert.equal(p.africa, true);
            assert.equal(p.tone, 'afro');
            assert.ok(inst(p, 'gtr').length >= 4, `${g} guitare`);
            assert.ok(p.bass.length >= 3, `${g} basse`);
            assert.ok(p.drums.length >= 8, `${g} percussions`);
            for (const e of [...p.piano, ...p.bass, ...p.drums]) {
                assert.ok(e.pos >= 0 && e.pos < 4, `${g} position ${e.pos}`);
                assert.ok(Number.isFinite(e.vel) && e.vel > 0 && e.vel <= 1, `${g} vélocité`);
            }
            p.piano.forEach(e => assert.ok(['gtr', 'organ', 'horn'].includes(e.inst), e.inst));
            p.piano.forEach(e => { assert.ok(Array.isArray(e.intervals) && e.intervals.length > 0); assert.ok(e.dur > 0); });
        }
    });
    test('les notes des guitares appartiennent à l\'accord ou à sa pentatonique (riff de l\'afrobeat)', () => {
        for (const g of A.AFRICA_GROOVES) for (let s = 1; s <= 20; s++) {
            const p = plan(g, { seed: s, step: G7 });
            const ok = new Set([...A.afChordPcs({ findChordObj }, G7).triad, A.afChordPcs({ findChordObj }, G7).seventh, ...A.afPentaPcs({ findChordObj }, G7), ...(g === 'af-benga' ? [0, 4] : [])]);   // benga : la gamme (sol mixolydien) entière
            inst(p, 'gtr').forEach(e => e.intervals.forEach(x => assert.ok(ok.has(pc(x)), `${g} ${x}`)));
        }
    });
    test('registres plausibles : guitare entre mi3 et sol6 réels, basse sous mi3', () => {
        for (const g of A.AFRICA_GROOVES) for (let s = 1; s <= 20; s++) {
            const p = plan(g, { seed: s });
            inst(p, 'gtr').forEach(e => e.intervals.forEach(x => assert.ok(x + 48 >= 52 && x + 48 <= 91, `${g} guitare ${x + 48}`)));
            inst(p, 'horn').forEach(e => e.parts.forEach(x => assert.ok(x.iv + 48 >= 36 && x.iv + 48 <= 72, `${g} cuivre ${x.iv + 48}`)));
            p.bass.forEach(b => assert.ok(b.abs + 36 >= 28 && b.abs + 36 <= 52, `${g} basse ${b.abs + 36}`));
        }
    });
    test('transposition (instrument en Si♭ ou Mi♭) : mêmes notes écrites de l\'accord, registre réel conservé', () => {
        for (const g of A.AFRICA_GROOVES) for (const off of [-2, -9]) {
            const p0 = plan(g, { seed: 3 });
            const pt = plan(g, { seed: 3, env: mkEnv(g, { transOffset: off }) });
            const okPcs = new Set([...A.afChordPcs({ findChordObj }, C).triad, ...A.afPentaPcs({ findChordObj }, C), ...(g === 'af-benga' ? [5, 11] : [])]);
            inst(pt, 'gtr').forEach(e => e.intervals.forEach(x => assert.ok(okPcs.has(pc(x)), `${g} ${off} note ${x}`)));
            assert.ok(Math.abs(inst(pt, 'gtr').length - inst(p0, 'gtr').length) <= 4, `${g} même écriture`);
            inst(pt, 'gtr').forEach(e => e.intervals.forEach(x => assert.ok(x + off + 48 >= 52 && x + off + 48 <= 91, `${g} ${off} ${x}`)));
            pt.bass.forEach(b => assert.ok(b.abs + off + 36 >= 28 && b.abs + off + 36 <= 52, `${g} basse ${off}`));
        }
    });
    test('la basse commence sur la fondamentale (ou la basse choisie) et annonce l\'accord suivant', () => {
        for (const g of A.AFRICA_GROOVES) {
            const p = plan(g, { seed: 2 });
            assert.equal(pc(p.bass[0].abs), 0, g);
            assert.equal(p.bass[0].pos, 0, g);
            const q = plan(g, { seed: 2, step: CoverG });
            assert.equal(pc(q.bass[0].abs), 7, `${g} accord sur basse`);
        }
        // highlife : la dernière note (4e temps et demi) mène à l'accord suivant quand il change
        let approach = 0;
        for (let s = 1; s <= 30; s++) {
            const p = plan('af-highlife', { seed: s, nextStep: G7, last: true, ph: mkPhrase(s, 'af-highlife', { bassIdx: 0, bassAlt: 0 }) });
            const lastB = p.bass[p.bass.length - 1];
            if (lastB.pos === 3.5 && [6, 8, 5, 9, 2].includes(pc(lastB.abs))) approach++;
        }
        assert.ok(approach >= 25, `approches : ${approach}`);
    });
    test('mesure scindée : la seconde moitié joue son accord (basse sur sa fondamentale, guitare sur ses notes)', () => {
        for (const g of A.AFRICA_GROOVES) {
            const p = plan(g, { seed: 4, halves: [C, G7] });
            const b2 = p.bass.find(b => Math.abs(b.pos - 2) < 1e-6);
            assert.ok(b2, `${g} basse au temps 3`);
            assert.equal(pc(b2.abs), 7, g);
            const G7ok = new Set([...A.afChordPcs({ findChordObj }, G7).triad, 5, ...A.afPentaPcs({ findChordObj }, G7), ...(g === 'af-benga' ? [0, 4] : [])]);
            inst(p, 'gtr').filter(e => e.pos >= 2).forEach(e => e.intervals.forEach(x => assert.ok(G7ok.has(pc(x)), `${g} ${x}`)));
        }
    });
    test('2/4, 3/4 et mesure composée : rien ne dépasse, les croches ternaires tombent sur la grille du temps', () => {
        for (const g of A.AFRICA_GROOVES) {
            for (const bpb of [2, 3]) {
                const p = plan(g, { bpb, seed: 5 });
                [...p.piano, ...p.bass, ...p.drums].forEach(e => assert.ok(e.pos < bpb, `${g} ${bpb} ${e.pos}`));
            }
            const t = plan(g, { bpb: 4, ternary: true, seed: 5 });
            [...t.piano, ...t.bass, ...t.drums].forEach(e => {
                const f = e.pos - Math.floor(e.pos + 1e-9);
                assert.ok(f < 1e-6 || Math.abs(f - 2 / 3) < 1e-6, `${g} ternaire ${e.pos}`);
            });
        }
    });
    test('afrobeat : charleston, bâtons (clave), shekere ; guitare étouffée en doubles croches', () => {
        const p = plan('af-afrobeat', { seed: 7 });
        const d = new Set(p.drums.map(e => e.drum));
        ['hat', 'clave', 'shaker', 'kick', 'snare'].forEach(k => assert.ok(d.has(k), k));
        assert.ok(inst(p, 'gtr').some(e => e.art === 'mute'));
        assert.ok(inst(p, 'gtr').some(e => e.art === 'pluck' && e.intervals.length === 1));
    });
    test('afrobeat : les cuivres jouent à l\'unisson et à l\'octave quand la phrase les appelle', () => {
        const p = plan('af-afrobeat', { seed: 7, step: Dm7, ph: mkPhrase(7, 'af-afrobeat', { horns: true }) });
        const h = inst(p, 'horn');
        assert.ok(h.length >= 3);
        h.forEach(e => {
            assert.deepEqual(e.parts.map(x => x.slot), ['c1', 'h1', 't1']);
            assert.equal(e.parts[0].iv - e.parts[2].iv, 12);
            assert.ok(A.afPentaPcs({ findChordObj }, Dm7).includes(pc(e.parts[0].iv)));
        });
        assert.equal(inst(plan('af-afrobeat', { seed: 7, ph: mkPhrase(7, 'af-afrobeat', { horns: false }) }), 'horn').length, 0);
    });
    test('highlife : cloche en tresillo (0, 0,75, 1,5, 2, 2,75, 3,5) et cross-stick sur 2 et 4', () => {
        const p = plan('af-highlife', { seed: 3 });
        const bell = p.drums.filter(e => e.drum === 'agogoh' || e.drum === 'agogol').map(e => e.pos);
        assert.deepEqual(bell, [0, 0.75, 1.5, 2, 2.75, 3.5]);
        assert.deepEqual(p.drums.filter(e => e.drum === 'rim').map(e => e.pos), [1, 3]);
    });
    test('soukous : grosse caisse sur chaque temps, caisse claire en doubles croches (cavacha), guitare solo continue et aiguë', () => {
        const p = plan('af-soukous', { seed: 9, ph: mkPhrase(9, 'af-soukous', { intensity: 0.8 }) });
        assert.deepEqual(p.drums.filter(e => e.drum === 'kick').map(e => e.pos), [0, 1, 2, 3]);
        assert.ok(p.drums.filter(e => e.drum === 'snare' || e.drum === 'ghost').length >= 14);
        const solo = inst(p, 'gtr').filter(e => e.art === 'arp' && e.intervals.length === 1 && e.intervals[0] + 48 >= 69);
        assert.ok(solo.length >= 14, `${solo.length}`);
    });
    test('benga : basse en noires sur chaque temps, guitare solo liée qui coule par degrés, accents sur le temps et le « a »', () => {
        for (let s = 1; s <= 20; s++) {
            const p = plan('af-benga', { seed: s, ph: mkPhrase(s, 'af-benga', { intensity: 0.8 }) });
            [0, 1, 2, 3].forEach(b => assert.ok(p.bass.some(x => Math.abs(x.pos - b) < 1e-6), `basse au temps ${b + 1}`));
            assert.ok(p.bass.length <= 7);
            const g = inst(p, 'gtr');
            assert.ok(g.every(e => e.art === 'arp'), 'notes liées, aucune note étouffée');
            const solo = g.filter(e => e.part === 'solo').sort((a, b) => a.pos - b.pos);
            assert.ok(solo.length >= 4 && solo.length <= 14, `${solo.length} notes`);
            // par degrés : la plupart des intervalles successifs font au plus une tierce
            let steps = 0;
            for (let k = 1; k < solo.length; k++) if (Math.abs(solo[k].intervals[0] - solo[k - 1].intervals[0]) <= 4) steps++;
            assert.ok(steps / (solo.length - 1) >= 0.75, `degrés conjoints ${steps}/${solo.length - 1}`);
            // liées : chaque note dure au moins jusqu'à la suivante (sauf la dernière)
            for (let k = 0; k + 1 < solo.length; k++) if (solo[k + 1].pos - solo[k].pos <= 0.5 + 1e-6) assert.ok(solo[k].dur >= solo[k + 1].pos - solo[k].pos - 1e-6);
            // sur les temps : une note de l'accord (Do majeur)
            solo.filter(e => Number.isInteger(e.pos)).forEach(e => assert.ok([0, 4, 7].includes(pc(e.intervals[0])), `temps ${e.pos} : ${e.intervals[0]}`));
        }
        // charleston sur le « et » et le « a »
        const p = plan('af-benga', { seed: 3 });
        const hats = p.drums.filter(e => e.drum === 'hat' && e.vel > 0.15).map(e => e.pos % 1);
        assert.ok(hats.includes(0.5) && hats.includes(0.75));
    });
    test('benga : la ligne continue d\'une mesure à la suivante (pas de saut de registre)', () => {
        const env = mkEnv('af-benga');
        const ph = mkPhrase(4, 'af-benga', { intensity: 0.7 });
        const a = plan('af-benga', { env, ph, i: 0 });
        const b = plan('af-benga', { env, ph, i: 1, step: F, nextStep: C });
        const top = (p) => inst(p, 'gtr').filter(e => e.part === 'solo').sort((x, y) => x.pos - y.pos);
        const last = top(a).pop().intervals[0], first = top(b)[0].intervals[0];
        assert.ok(Math.abs(first - last) <= 7, `${last} → ${first}`);
    });
    test('mbaqanga : orgue en contretemps quand il joue avec de l\'énergie', () => {
        const p = plan('af-mbaqanga', { seed: 2, ph: mkPhrase(2, 'af-mbaqanga', { organ: true, intensity: 0.8 }) });
        const o = inst(p, 'organ');
        assert.deepEqual(o.map(e => e.pos), [0.5, 1.5, 2.5, 3.5]);
    });
    test('mémoire : le voicing et la note de départ de la guitare solo passent d\'une mesure à la suivante', () => {
        const env = mkEnv('af-rumba');
        plan('af-rumba', { env, seed: 1 });
        assert.equal(env.state.africaVoice.length, 3);
        assert.ok(Number.isFinite(env.state.africaLead));
    });
    test('fin de phrase : roulement de toms (ou de caisse claire) sur le dernier temps', () => {
        for (const g of A.AFRICA_GROOVES) {
            const p = plan(g, { seed: 3, i: 3, L: 4, isTurn: true, ph: mkPhrase(3, g, { fill: true }) });
            const last = p.drums.filter(e => e.pos >= 3 && /tom|snare/.test(e.drum));
            assert.ok(last.length >= 3, g);
        }
    });
});
