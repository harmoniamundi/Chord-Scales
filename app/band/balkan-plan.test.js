// Tests de l'orchestre des Balkans (band/balkan-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { balkanVoicing, balkanPhraseExtras, buildBalkanPlan } = require('./balkan-plan.js');
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
const Am = { rootIndex: 9, chordId: 'minTriad', scaleId: 'aeolian' };
const E7 = { rootIndex: 4, chordId: '7', scaleId: 'phrygianDominant' };
const Dm = { rootIndex: 2, chordId: 'minTriad', scaleId: 'dorian' };

const mkEnv = (over = {}) => ({
    transOffset: 0,
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    splitBeat: 2,
    bpm: 110,
    state: { balkanVoice: null, balkanMel: null },
    ...over
});
const mkPhrase = (seed) => ({ rng: seeded(seed), style: 'balkan', ...balkanPhraseExtras(seeded(seed * 31), null, seed % 3) });
function plan({ bpb = 2, ternary = false, step = Am, nextStep = E7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildBalkanPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('balkanPhraseExtras (choix de la phrase)', () => {
    test('valeurs dans leurs bornes, sur beaucoup de graines', () => {
        for (let s = 1; s <= 300; s++) {
            const e = balkanPhraseExtras(seeded(s), s % 2 ? null : { style: 'balkan', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity >= 0.28 && e.intensity <= 0.98, `intensité ${e.intensity}`);
            assert.ok(['oompah', 'drive'].includes(e.feel));
            assert.ok([0, 1, 2].includes(e.mel));
            assert.ok(Number.isInteger(e.percIdx) && e.percIdx >= 0 && e.percIdx < 3);
            assert.ok(Number.isInteger(e.darIdx) && e.darIdx >= 0 && e.darIdx < 2);
            assert.equal(e.melSteps.length, 8);
            for (const k of ['fill', 'run', 'daire', 'orn', 'oct']) assert.equal(typeof e[k], 'boolean');
        }
    });
    test('l’intensité part bas à la première phrase (index 0)', () => {
        for (let s = 1; s <= 50; s++) {
            const e = balkanPhraseExtras(seeded(s), null, 0);
            assert.ok(e.intensity >= 0.4 && e.intensity <= 0.55);
        }
    });
    test('déterministe à graine égale', () => {
        assert.deepEqual(balkanPhraseExtras(seeded(5), null, 1), balkanPhraseExtras(seeded(5), null, 1));
    });
});

describe('balkanVoicing (triade de l’accordéon)', () => {
    test('trois notes croissantes, aux bonnes hauteurs, dans le registre', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        for (const cs of [Am, E7, Dm, { rootIndex: 0, chordId: 'maj7' }, { rootIndex: 6, chordId: 'm7b5' }]) {
            const v = balkanVoicing(env, cs, null);
            assert.equal(v.length, 3);
            assert.ok(v[0] < v[1] && v[1] < v[2]);
            assert.ok(v[0] >= 5 - 12 && v[2] <= 21 + 3, `${JSON.stringify(v)}`);
        }
    });
    test('les trois notes sont les degrés 1-3-5 de l’accord', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        const pcs = (v) => v.map(n => ((n % 12) + 12) % 12).sort((a, b) => a - b);
        assert.deepEqual(pcs(balkanVoicing(env, Am, null)), [0, 4, 9]);
        assert.deepEqual(pcs(balkanVoicing(env, E7, null)), [4, 8, 11]);
        assert.deepEqual(pcs(balkanVoicing(env, Dm, null)), [2, 5, 9]);
    });
    test('conduite des voix : l’enchaînement bouge peu', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        const a = balkanVoicing(env, Am, null);
        const b = balkanVoicing(env, Dm, a);
        const move = b.reduce((s, n, k) => s + Math.abs(n - a[k]), 0);
        assert.ok(move <= 10, `mouvement total ${move}`);
    });
});

describe('buildBalkanPlan : forme générale', () => {
    const cases = [['2/4 kolo', 2, false], ['4/4', 4, false], ['3/4', 3, false], ['9/8 aksak', 3, true], ['6/8', 2, true], ['12/8', 4, true]];
    for (const [name, bpb, ternary] of cases) {
        test(`${name} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const p = plan({ bpb, ternary, seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, env: mkEnv({ splitBeat: bpb === 2 ? 1 : 2 }) });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), `${name} ${kind}`);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${name} ${kind} pos ${e.pos} (graine ${seed})`);
                        assert.ok(e.vel > 0 && e.vel <= 1, `${name} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.piano.length > 0 && p.bass.length > 0 && p.drums.length > 0, `${name} vide (graine ${seed})`);
                assert.equal(p.accordion, true);
            }
        });
    }
    test('déterministe : même graine, même mémoire → même plan', () => {
        assert.deepEqual(plan({ seed: 9 }), plan({ seed: 9 }));
    });
    test('mesure coupée en deux accords : piano et basse dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ bpb: 4, halves: [Am, Dm], seed, env: mkEnv({ splitBeat: 2 }) });
            for (const kind of ['piano', 'bass']) {
                assert.ok(p[kind].some(e => e.pos < 2), `${kind} 1re moitié (graine ${seed})`);
                assert.ok(p[kind].some(e => e.pos >= 2 - 1e-6), `${kind} 2de moitié (graine ${seed})`);
            }
        }
    });
});

describe('mémoire entre deux mesures (env.state)', () => {
    test('le renversement de l’accordéon est mémorisé puis réutilisé sur le même accord', () => {
        const env = mkEnv();
        plan({ env, seed: 3 });
        const mem = env.state.balkanVoice;
        assert.ok(mem && Array.isArray(mem.v) && mem.v.length === 3, 'voicing mémorisé');
        const p2 = plan({ env, seed: 3, m: 1, nextStep: null });
        assert.ok(p2.piano.length > 0);
        assert.equal(env.state.balkanVoice.key.split(':')[1].length > 0, true);
    });
    test('sans mémoire initiale, le plan se calcule quand même', () => {
        const env = mkEnv({ state: { balkanVoice: null, balkanMel: null } });
        assert.ok(plan({ env }).piano.length > 0);
    });
});

describe('allègement quand le tempo monte', () => {
    test('à tempo très rapide l’accordéon joue moins de notes qu’à tempo lent', () => {
        let slow = 0, fast = 0;
        for (let seed = 1; seed <= 80; seed++) {
            const base = { bpb: 2, seed, i: 1, m: 1 };
            slow += plan({ ...base, env: mkEnv({ bpm: 100 }) }).piano.length;
            fast += plan({ ...base, env: mkEnv({ bpm: 240 }) }).piano.length;
        }
        assert.ok(fast <= slow, `rapide ${fast} > lent ${slow}`);
    });
});

// ===================== Phrasé : ligne chantée, rythme, variantes =====================
const { balkanFlavorOf, balkanRoleOf, balkanBarRhythm, balkanContour, BK_BAR8 } = require('./balkan-plan.js');
const mkc = (r, c, s) => ({ rootIndex: r, chordId: c, scaleId: s });
const PROG = [mkc(2, 'minTriad', 'harmonicMinor'), mkc(2, 'minTriad', 'harmonicMinor'), mkc(7, 'minTriad', 'dorian'), mkc(9, '7b9', 'phrygianDominant')];
// une phrase de 4 mesures (une par accord), avec un ph fixé à la main
function phrase4({ bpb = 2, ternary = false, seed = 1, bpm = 110, over = {}, groove } = {}) {
    const ph = { rng: seeded(seed), style: 'balkan', ...balkanPhraseExtras(seeded(seed * 31), null, 1, { groove }), index: 0, ...over };
    const env = mkEnv({ bpm, splitBeat: Math.max(1, bpb >> 1) });
    return PROG.map((step, i) => buildBalkanPlan(env, bpb, ternary, step, PROG[(i + 1) % 4], true, null, ph, i, 4, i === 3, i)).map(p => p);
}
const lin = (p) => p.piano.filter(e => e.art === 'lin').sort((a, b) => a.pos - b.pos);

describe('couleurs : sevdah, tsifteteli, danse', () => {
    test('balkanFlavorOf : d’après le rythme imposé, la danse par défaut', () => {
        assert.equal(balkanFlavorOf('bk-sevdah'), 'sevdah');
        assert.equal(balkanFlavorOf('bk-tsifte'), 'tsifte');
        for (const g of [undefined, null, '', 'b-chorale', 'samba']) assert.equal(balkanFlavorOf(g), 'dance');
    });
    test('la phrase retient la couleur et son intensité reste dans ses bornes', () => {
        for (let s = 1; s <= 120; s++) {
            const sev = balkanPhraseExtras(seeded(s), null, s % 4, { groove: 'bk-sevdah' });
            const tsi = balkanPhraseExtras(seeded(s), null, s % 4, { groove: 'bk-tsifte' });
            assert.equal(sev.flavor, 'sevdah'); assert.equal(tsi.flavor, 'tsifte');
            assert.ok(sev.intensity >= 0.22 && sev.intensity <= 0.6, `sevdah ${sev.intensity}`);
            assert.ok(tsi.intensity >= 0.38 && tsi.intensity <= 0.92, `tsifte ${tsi.intensity}`);
            assert.ok(['pad', 'arp'].includes(sev.feel)); assert.equal(tsi.feel, 'drive');
            assert.equal(typeof sev.perc, 'boolean');
        }
    });
    test('la ballade démarre sans percussions (1re phrase)', () => {
        for (let s = 1; s <= 40; s++) assert.equal(balkanPhraseExtras(seeded(s), null, 0, { groove: 'bk-sevdah' }).perc, false);
    });
    test('une phrase d’une autre couleur ne reprend pas l’intensité de la précédente', () => {
        const dance = { style: 'balkan', flavor: 'dance', intensity: 0.95 };
        const sev = balkanPhraseExtras(seeded(3), dance, 2, { groove: 'bk-sevdah' });
        assert.ok(sev.intensity <= 0.6);
    });
});

describe('rôles et rythme de la ligne', () => {
    test('balkanRoleOf : A B A C sur 4 mesures, A C sur 2, A B C sur 3', () => {
        assert.deepEqual([0, 1, 2, 3].map(i => balkanRoleOf(i, 4)), ['A', 'B', 'A', 'C']);
        assert.deepEqual([0, 1].map(i => balkanRoleOf(i, 2)), ['A', 'C']);
        assert.deepEqual([0, 1, 2].map(i => balkanRoleOf(i, 3)), ['A', 'B', 'C']);
        assert.equal(balkanRoleOf(0, 1), 'A');
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => balkanRoleOf(i, 6)), ['A', 'B', 'A', 'B', 'A', 'C']);
    });
    const METERS = [['2/4', [2, 2], false], ['3/4', [2, 2, 2], false], ['4/4', [2, 2, 2, 2], false], ['6/8', [3, 3], true], ['9/8', [2, 2, 2, 3], true], ['12/8', [3, 3, 3, 3], true]];
    for (const [name, groups, ternary] of METERS) {
        test(`${name} : les durées de chaque rôle remplissent exactement la mesure`, () => {
            const E = groups.reduce((a, b) => a + b, 0);
            for (const flavor of ['dance', 'sevdah', 'tsifte']) for (const role of ['A', 'B', 'C']) for (let seed = 1; seed <= 60; seed++) for (const act of [0, 0.5, 1]) for (const thin of [0, 1]) {
                const d = balkanBarRhythm(role, { flavor, groups, native4: name === '4/4', seed: seed * 977, act, thin });
                assert.equal(d.reduce((a, b) => a + b, 0), E, `${flavor} ${role} ${JSON.stringify(d)}`);
                assert.ok(d.every(x => x >= 0.5), JSON.stringify(d));
                if (thin === 1 && !(name === '4/4' && flavor !== 'dance')) assert.ok(d.every(x => x >= 1), `doubles croches malgré le tempo : ${JSON.stringify(d)}`);
            }
        });
    }
    test('tous les rythmes écrits à la main du 4/4 totalisent 8 croches', () => {
        for (const f of ['sevdah', 'tsifte']) for (const role of ['A', 'B', 'C']) BK_BAR8[f][role].forEach(d => assert.equal(d.reduce((a, b) => a + b, 0), 8, `${f} ${role} ${JSON.stringify(d)}`));
    });
    test('la mesure de conclusion finit sur une note longue', () => {
        for (let s = 1; s <= 80; s++) for (const [groups, native4] of [[[2, 2], false], [[2, 2, 2, 3], false], [[2, 2, 2, 2], true]]) for (const flavor of ['dance', 'sevdah', 'tsifte']) {
            const d = balkanBarRhythm('C', { flavor, groups, native4, seed: s * 31, act: 1, thin: 0 });
            assert.ok(d[d.length - 1] >= 2, `${flavor} ${JSON.stringify(d)}`);
        }
    });
    test('même graine, même rôle : même rythme ; A et B partagent leur début (question / réponse)', () => {
        const o = { flavor: 'dance', groups: [2, 2], native4: false, seed: 4242, act: 0.7, thin: 0 };
        assert.deepEqual(balkanBarRhythm('A', o), balkanBarRhythm('A', o));
        const a = balkanBarRhythm('A', o), b = balkanBarRhythm('B', o);
        let sa = 0, k = 0; while (sa < 2) { sa += a[k++]; }
        assert.deepEqual(a.slice(0, k), b.slice(0, k));
    });
});

describe('contour mélodique', () => {
    test('n-1 pas ; A monte, B redescend, C finit en descendant', () => {
        for (let s = 1; s <= 200; s++) {
            const ph = balkanPhraseExtras(seeded(s), null, 1);
            for (const n of [2, 4, 7]) {
                for (const role of ['A', 'B', 'C']) assert.equal(balkanContour(ph.melSteps, role, n).length, n - 1);
                const sum = (r) => balkanContour(ph.melSteps, r, n).reduce((a, b) => a + b, 0);
                if (!ph.melSteps.every(x => x === 0)) { assert.ok(sum('A') >= 0, 'A'); assert.ok(sum('B') <= 0, 'B'); assert.ok(sum('C') <= 0, 'C'); }
            }
        }
        assert.deepEqual(balkanContour(null, 'A', 1), []);
    });
    test('sans matière donnée : un contour par défaut', () => {
        assert.equal(balkanContour(undefined, 'B', 4).length, 3);
    });
});

describe('la ligne chantée est continue et se tient', () => {
    const cases = [['2/4', 2, false], ['4/4', 4, false], ['9/8', 3, true], ['6/8', 2, true]];
    for (const [name, bpb, ternary] of cases) {
        test(`${name} : chaque mesure a une ligne, sans trou énorme, sans notes qui se chevauchent`, () => {
            for (let seed = 1; seed <= 50; seed++) {
                const plans = phrase4({ bpb, ternary, seed, over: { mel: 2, run: false, fill: false } });
                plans.forEach((p, i) => {
                    const L = lin(p);
                    assert.ok(L.length >= 2, `${name} mesure ${i} graine ${seed} : ${L.length} notes`);
                    L.forEach((e, k) => {
                        assert.ok(e.dur > 0 && e.intervals.length === 1);
                        if (k + 1 < L.length) assert.ok(e.pos + e.dur <= L[k + 1].pos + 1e-6, `chevauchement mesure ${i}`);
                    });
                    // la ligne couvre l’essentiel de la mesure (jeu lié)
                    const cov = L.reduce((s, e) => s + Math.min(e.dur, bpb - e.pos), 0) / bpb;
                    assert.ok(cov >= 0.55, `${name} couverture ${cov.toFixed(2)} (graine ${seed}, mesure ${i})`);
                });
            }
        });
    }
    test('la ligne reste dans le registre de l’accordéon et procède surtout par degrés conjoints', () => {
        let steps = 0, big = 0, rep = 0;
        for (let seed = 1; seed <= 60; seed++) {
            let prev = null;
            phrase4({ seed, over: { mel: 2, run: false } }).forEach(p => lin(p).forEach(e => {
                const x = e.intervals[0];
                assert.ok(x >= 12 && x <= 26, `hors registre ${x}`);
                if (prev !== null) { steps++; if (Math.abs(x - prev) > 5) big++; if (x === prev) rep++; }
                prev = x;
            }));
        }
        assert.ok(big / steps < 0.03, `sauts ${big / steps}`);
        assert.ok(rep / steps < 0.15, `répétitions ${rep / steps}`);
    });
    test('sur les temps forts, les notes longues sont des notes de l’accord (sans ornement)', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const ph = { orn: false, mel: 2, run: false, fill: false };
            phrase4({ seed, over: ph }).forEach((p, i) => {
                const cs = PROG[i];
                const nn = T.lookupChord(cs.chordId).notes;
                const ct = new Set([0, nn[1], nn[2]].map(x => (cs.rootIndex + x) % 12));
                lin(p).forEach(e => { if (Number.isInteger(e.pos) && e.dur >= 0.45) assert.ok(ct.has(((e.intervals[0] % 12) + 12) % 12), `mesure ${i} pos ${e.pos} note ${e.intervals[0]}`); });
            });
        }
    });
    test('les rôles qui reviennent gardent leur rythme : mesures 1 et 3 (A) identiques', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const plans = phrase4({ seed, over: { orn: false, mel: 2, run: false } });
            const rh = (p) => lin(p).map(e => Math.round(e.pos * 1000)).join();
            assert.equal(rh(plans[0]), rh(plans[2]), `graine ${seed}`);
        }
    });
    test('dernière mesure de la phrase : la ligne se pose sur une note de l’accord (fondamentale hors dominante)', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const last = phrase4({ seed, over: { orn: false, mel: 2, run: false } })[3];   // A7(b9) : dominante → quinte (mi) ou tierce (do dièse)
            const x = ((lin(last).pop().intervals[0] % 12) + 12) % 12;
            assert.ok([4, 1].includes(x), `fin de phrase sur ${x}`);
        }
        const env = mkEnv({ splitBeat: 1 });
        for (let seed = 1; seed <= 40; seed++) {
            const ph = { ...mkPhrase(seed), orn: false, mel: 2, run: false };
            const Dmh = mkc(2, 'minTriad', 'harmonicMinor');
            const p = buildBalkanPlan(env, 2, false, Dmh, Dmh, true, null, ph, 3, 4, true, 3);
            assert.equal(((lin(p).pop().intervals[0] % 12) + 12) % 12, 2, 'tonique');
        }
    });
    test('la dernière note d’une mesure prépare le changement d’accord par degré conjoint', () => {
        let near = 0, n = 0;
        for (let seed = 1; seed <= 60; seed++) {
            const plans = phrase4({ seed, over: { orn: false, mel: 2, run: false } });
            [0, 1, 2].forEach(i => {
                const lastX = lin(plans[i]).pop().intervals[0], firstNext = lin(plans[i + 1])[0].intervals[0];
                n++; if (Math.abs(firstNext - lastX) <= 4) near++;
            });
        }
        assert.ok(near / n > 0.85, `liaison ${near / n}`);
    });
    test('mel = 0 : la phrase commence par l’accompagnement seul (2 mesures), puis la ligne entre', () => {
        const plans = phrase4({ seed: 5, over: { mel: 0, run: false } });
        assert.equal(lin(plans[0]).length, 0); assert.equal(lin(plans[1]).length, 0);
        assert.ok(lin(plans[2]).length > 0 && lin(plans[3]).length > 0);
        assert.ok(plans[0].piano.some(e => e.art === 'pah'), 'accords tout de même');
    });
    test('respiration : jamais de mesure sans note en ligne lyrique (mel = 1)', () => {
        for (let seed = 1; seed <= 60; seed++) phrase4({ seed, over: { mel: 1, run: false } }).forEach(p => assert.ok(lin(p).length >= 1));
    });
});

describe('ornements', () => {
    test('petites notes (art orn) brèves, dans la mesure, avec leur note principale juste après', () => {
        let n = 0;
        for (let seed = 1; seed <= 80; seed++) phrase4({ seed, groove: 'bk-sevdah', over: { orn: true, mel: 2, run: false }, bpm: 70 }).forEach(p => {
            p.piano.filter(e => e.art === 'orn').forEach(o => {
                n++;
                assert.ok(o.dur <= 0.25 && o.pos >= 0 && o.pos < 2);
                assert.ok(p.piano.some(e => e.art === 'lin' && e.pos >= o.pos - 1e-6 && e.pos <= o.pos + 0.7), 'ornement orphelin');
            });
        });
        assert.ok(n > 20, `ornements ${n}`);
    });
    test('aucun ornement quand le tempo est très rapide, ni quand ph.orn est faux', () => {
        for (let seed = 1; seed <= 40; seed++) {
            phrase4({ seed, bpm: 260, over: { orn: true, mel: 2 } }).forEach(p => assert.equal(p.piano.filter(e => e.art === 'orn').length, 0));
            phrase4({ seed, over: { orn: false, mel: 2 } }).forEach(p => assert.equal(p.piano.filter(e => e.art === 'orn').length, 0));
        }
    });
});

describe('ballade (sevdah, 4/4)', () => {
    const sev = (seed, over = {}) => phrase4({ bpb: 4, seed, bpm: 60, groove: 'bk-sevdah', over });
    test('accompagnement doux : nappe tenue ou arpège, jamais de contretemps secs', () => {
        for (let seed = 1; seed <= 40; seed++) for (const feel of ['pad', 'arp']) sev(seed, { feel }).forEach(p => {
            assert.ok(!p.piano.some(e => e.art === 'pah' && e.pos % 1 !== 0), 'contretemps sec');
            if (feel === 'arp') assert.ok(p.piano.filter(e => e.art === 'arp').length >= 6);
            else assert.ok(p.piano.some(e => e.art === 'pad' && e.dur >= 1.5));
        });
    });
    test('basse en notes longues (au plus quatre notes par mesure)', () => {
        for (let seed = 1; seed <= 40; seed++) sev(seed).forEach(p => { assert.ok(p.bass.length >= 2 && p.bass.length <= 3); assert.ok(p.bass[0].dur >= 1.5); });
    });
    test('percussions presque absentes, et absentes quand perc est faux', () => {
        for (let seed = 1; seed <= 40; seed++) {
            sev(seed, { perc: false, fill: false }).forEach(p => assert.equal(p.drums.length, 0));
            sev(seed, { perc: true, daire: true, fill: false }).forEach(p => assert.ok(p.drums.length <= 4 && p.drums.every(d => d.drum !== 'daire')));
        }
    });
    test('notes plus longues que la danse', () => {
        let sevN = 0, danN = 0;
        for (let seed = 1; seed <= 40; seed++) {
            sev(seed, { mel: 2, run: false }).forEach(p => { sevN += lin(p).length; });
            phrase4({ bpb: 4, seed, bpm: 110, over: { mel: 2, run: false } }).forEach(p => { danN += lin(p).length; });
        }
        assert.ok(sevN < danN, `${sevN} ≥ ${danN}`);
    });
});

describe('tsifteteli (4/4)', () => {
    const tsi = (seed, over = {}) => phrase4({ bpb: 4, seed, bpm: 100, groove: 'bk-tsifte', over });
    test('darbuka maqsum : dum sur les croches 0 et 4 (ou 1), tek sur 1, 3 et 6', () => {
        for (let seed = 1; seed <= 40; seed++) tsi(seed, { daire: false, fill: false, darIdx: 0 }).forEach(p => {
            const at = (pos, d) => p.drums.some(x => Math.abs(x.pos - pos) < 1e-6 && x.drum === d);
            assert.ok(at(0, 'dum') && at(2, 'dum'), 'dum');
            assert.ok(at(0.5, 'tek') && at(1.5, 'tek') && at(3, 'tek'), 'tek');
        });
    });
    test('basse calée sur les dum (croches 0 et 4)', () => {
        for (let seed = 1; seed <= 40; seed++) tsi(seed).forEach(p => {
            assert.ok(p.bass.some(b => b.pos === 0) && p.bass.some(b => b.pos === 2));
            assert.ok(p.bass.every(b => [0, 1.5, 2, 2.5, 3, 3.5].includes(b.pos)), JSON.stringify(p.bass.map(b => b.pos)));
        });
    });
    test('contretemps de l’accordéon sur les tek (croches 1, 3 et 6)', () => {
        for (let seed = 1; seed <= 20; seed++) tsi(seed, { run: false }).forEach(p => {
            const pos = p.piano.filter(e => e.art === 'pah').map(e => e.pos);
            assert.deepEqual(pos, [0.5, 1.5, 3]);
        });
    });
});

describe('autres signatures avec une couleur imposée', () => {
    for (const groove of ['bk-sevdah', 'bk-tsifte']) for (const [bpb, ternary] of [[2, false], [3, false], [2, true], [3, true], [4, true]]) {
        test(`${groove} en ${bpb}${ternary ? ' ternaire' : ''} : plan valide`, () => {
            for (let seed = 1; seed <= 25; seed++) phrase4({ bpb, ternary, seed, groove }).forEach(p => {
                for (const kind of ['piano', 'bass', 'drums']) p[kind].forEach(e => { assert.ok(e.pos >= 0 && e.pos < bpb && e.vel > 0 && e.vel <= 1); });
                assert.ok(p.piano.length > 0 && p.bass.length > 0);
            });
        });
    }
});

describe('tempo rapide : la ligne se dépouille', () => {
    test('moins de notes qu’à tempo lent (et pas de doubles croches au-delà de 8 croches/s)', () => {
        let slow = 0, fast = 0;
        for (let seed = 1; seed <= 60; seed++) {
            phrase4({ seed, bpm: 100, over: { mel: 2, run: false } }).forEach(p => { slow += lin(p).length; });
            phrase4({ seed, bpm: 260, over: { mel: 2, run: false } }).forEach(p => {
                fast += lin(p).length;
                lin(p).forEach(e => assert.ok(e.dur >= 0.4 * 0.5 - 1e-9));
            });
        }
        assert.ok(fast < slow, `${fast} ≥ ${slow}`);
    });
});


describe('Balkans : curseur « Densité »', () => {
    const withRand = (fn) => { const old = Math.random; const r = seeded(777); Math.random = r; try { return fn(); } finally { Math.random = old; } };
    const mk = (d, bpm) => mkEnv({ ...(bpm ? { bpm } : {}), ...(d === undefined ? {} : { density: d }) });
    const planOf = (d, s, i, bpm) => withRand(() => plan({ env: mk(d, bpm), seed: s, i, isTurn: i === 3, last: i === 3 }));
    const avg = (d, bpm) => { let t = 0, n = 0; for (let s = 1; s <= 40; s++) for (let i = 0; i < 4; i++) { t += planOf(d, s, i, bpm).piano.length; n++; } return t / n; };

    test('0,5 ou absent : écriture d\'origine strictement inchangée', () => {
        for (let s = 1; s <= 20; s++) for (let i = 0; i < 4; i++) {
            assert.deepEqual(planOf(0.5, s, i), planOf(undefined, s, i), `graine ${s} mesure ${i}`);
        }
    });
    test('plus de notes à mesure que le curseur monte, avec un grand écart entre 0 et 1', () => {
        const a = avg(0), b = avg(0.5), c = avg(1);
        assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
        assert.ok(c / a >= 2, `rapport ${c / a}`);
    });
    test('valeurs intermédiaires : progression régulière', () => {
        const v = [0, 0.25, 0.5, 0.75, 1].map(d => avg(d));
        for (let k = 1; k < v.length; k++) assert.ok(v[k] >= v[k - 1] - 0.05, `d#${k} : ${v}`);
    });
    test('événements valides à toutes les densités (positions, durées, vélocités, intervalles)', () => {
        for (const d of [0, 0.3, 0.7, 1]) for (let s = 1; s <= 12; s++) for (let i = 0; i < 4; i++) {
            const p = planOf(d, s, i);
            for (const e of [...p.piano, ...p.bass]) {
                assert.ok(Number.isFinite(e.pos) && e.pos >= -1e-9 && e.pos < 2 + 1e-9, `pos ${e.pos}`);
                assert.ok(Number.isFinite(e.dur) && e.dur > 0, `dur ${e.dur}`);
                assert.ok(Number.isFinite(e.vel) && e.vel > 0 && e.vel <= 1.6, `vel ${e.vel}`);
                assert.ok((Array.isArray(e.intervals) && e.intervals.every(Number.isFinite)) || Number.isFinite(e.abs) || Array.isArray(e.parts), 'hauteurs');
            }
        }
    });
    test('tempo très vif : aucune note ajoutée (jouabilité)', () => {
        const a = avg(0.5, 230), c = avg(1, 230);
        assert.ok(c <= a + 1e-9, `${c} <= ${a}`);
    });
    test('la densité ne modifie pas les percussions', () => {
        for (let s = 1; s <= 10; s++) for (let i = 0; i < 4; i++) {
            assert.deepEqual(planOf(0, s, i).drums, planOf(1, s, i).drums);
        }
    });
});
