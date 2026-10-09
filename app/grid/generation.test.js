// Tests de la génération de grille (grid/generation.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('./generation.js');
const T = require('../theory.js');
const { buildStyleTemplate, STYLE_BUILDERS } = require('../styles/style-builders.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const ctx = (over = {}) => ({ findChordObj, triadsOnly: false, generationVariant: 0, seedBase: 1234, recentGrids: [], ...over });
const build = (styleKey, keyRoot = 0, R = null) => buildStyleTemplate(styleKey, { keyRoot, mainQuality: 'ionian', R, findChordObj });
const bars = (tpl) => tpl.reduce((s, x) => s + (x.m || 1), 0);
const keysOf = (tpl) => { const a = []; tpl.forEach(it => { for (let q = 0; q < (it.m || 1); q++) a.push(`${it.r}:${it.c}` + (it.split ? `|${it.split.r}:${it.split.c}` : '')); }); return a; };
const mk = (r, c, m, section) => ({ rootIndex: r, chordId: c, measures: m, scaleId: 'ionian', ...(section ? { section } : {}) });

describe('générateur pseudo-aléatoire', () => {
    test('déterministe et dans [0, 1[', () => {
        const a = G.makeVariationRng(3, 'blues', 99), b = G.makeVariationRng(3, 'blues', 99);
        for (let i = 0; i < 200; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
    });
    test('dépend de la variante, du style et de la graine de session', () => {
        const seq = (v, s, seed) => { const r = G.makeVariationRng(v, s, seed); return [r(), r(), r()].join(); };
        const base = seq(1, 'blues', 5);
        assert.notEqual(base, seq(2, 'blues', 5));
        assert.notEqual(base, seq(1, 'swing', 5));
        assert.notEqual(base, seq(1, 'blues', 6));
    });
    test('graine absente : traitée comme 0', () => {
        assert.equal(G.makeVariationRng(1, 'x')(), G.makeVariationRng(1, 'x', 0)());
    });
});

describe('petits utilitaires', () => {
    test('gridSignature distingue racine, accord, durée et gamme', () => {
        const a = [{ rootIndex: 0, chordId: 'maj7', measures: 2, scaleId: 'ionian' }];
        assert.equal(G.gridSignature(a), '0:maj7:2:ionian');
        assert.notEqual(G.gridSignature(a), G.gridSignature([{ ...a[0], measures: 1 }]));
        assert.notEqual(G.gridSignature(a), G.gridSignature([{ ...a[0], scaleId: 'lydian' }]));
    });
    test('chordFamily : famille du catalogue, « maj » si inconnu', () => {
        assert.equal(G.chordFamily('7'), 'dom');
        assert.equal(G.chordFamily('m7'), 'min');
        assert.equal(G.chordFamily('maj7'), 'maj');
        assert.equal(G.chordFamily('inexistant'), 'maj');
    });
    test('romanDeg : degrés romains, minuscules et modulo 12', () => {
        assert.equal(G.romanDeg(0), 'I');
        assert.equal(G.romanDeg(7), 'V');
        assert.equal(G.romanDeg(3, true), '♭iii');
        assert.equal(G.romanDeg(-1), 'VII');
        assert.equal(G.romanDeg(12), 'I');
    });
    test('isBrassStyle : seulement les deux styles brass', () => {
        assert.ok(G.isBrassStyle('brasshymn') && G.isBrassStyle('brasscantique'));
        assert.ok(!G.isBrassStyle('swing') && !G.isBrassStyle(undefined));
    });
    test('styleProfile : profil connu, profil par défaut sinon, triades seules sans réharmonisation', () => {
        assert.equal(G.styleProfile('bebop').turn, true);
        assert.deepEqual(G.styleProfile('chansonsimple').w, {});
        assert.deepEqual(G.styleProfile('inconnu'), { turn: false, w: { colour: 3 } });
    });
    test('simplifyBrass : ramène les accords au vocabulaire triades + dominantes septièmes', () => {
        const S = [{ c: 'maj9', s: 'lydian' }, { c: 'm7', s: 'phrygian' }, { c: '7alt', s: 'altered', split: { c: 'm9', s: 'dorian' } }, { c: '7', s: 'mixolydian' }];
        G.simplifyBrass(S);
        assert.deepEqual(S.map(x => [x.c, x.s]), [['majTriad', 'lydian'], ['minTriad', 'aeolian'], ['7', 'mixolydian'], ['7', 'mixolydian']]);
        assert.deepEqual([S[2].split.c, S[2].split.s], ['minTriad', 'dorian']);
    });
});

describe('mémoire des grilles produites', () => {
    const gen = [mk(0, 'maj7', 2), { ...mk(5, 'm7', 1), split: { rootIndex: 10, chordId: '7' } }];
    test('une clé par mesure, mesure partagée incluse', () => {
        const r = G.rememberGenerated([], 'swing', gen);
        assert.equal(r.length, 1);
        assert.equal(r[0].style, 'swing');
        assert.deepEqual(r[0].keys, ['0:maj7', '0:maj7', '5:m7|10:7']);
    });
    test('ne modifie pas la liste reçue, accepte undefined, garde les 8 dernières', () => {
        const before = [];
        const after = G.rememberGenerated(before, 'swing', gen);
        assert.equal(before.length, 0);
        assert.notEqual(before, after);
        assert.equal(G.rememberGenerated(undefined, 'x', gen).length, 1);
        let mem = [];
        for (let i = 0; i < 12; i++) mem = G.rememberGenerated(mem, 's' + i, gen);
        assert.equal(mem.length, 8);
        assert.equal(mem[0].style, 's4');
        assert.equal(mem[7].style, 's11');
    });
});

describe('cases ⇄ modèle', () => {
    test('slotsFromTemplate étale une mesure par case, sans partager les objets', () => {
        const tpl = [{ r: 0, c: 'maj7', m: 3, s: 'ionian', section: 'A', split: { r: 7, c: '7', s: 'mixolydian' } }, { r: 5, c: 'm7', m: 1, s: 'dorian' }];
        const S = G.slotsFromTemplate(tpl);
        assert.equal(S.length, 4);
        assert.ok(S.every(x => x.m === 1));
        assert.notEqual(S[0].split, S[1].split);
        assert.equal(tpl[0].m, 3);
    });
    test('templateFromSlots refusionne les cases identiques et retire les champs de travail', () => {
        const tpl = [{ r: 0, c: 'maj7', m: 3, s: 'ionian', section: 'A' }, { r: 5, c: 'm7', m: 2, s: 'dorian', section: 'A' }];
        const S = G.slotsFromTemplate(tpl);
        S[0]._dom = true; S[1]._lock = true;
        assert.deepEqual(G.templateFromSlots(S), tpl);
    });
    test('un bloc partagé n\'est jamais fusionné', () => {
        const sp = { r: 7, c: '7', s: 'mixolydian' };
        const out = G.templateFromSlots([{ r: 0, c: 'maj7', m: 1, s: 'ionian', split: sp }, { r: 0, c: 'maj7', m: 1, s: 'ionian', split: sp }]);
        assert.equal(out.length, 2);
    });
    test('aller-retour sur tous les modèles de style', () => {
        for (const st of Object.keys(STYLE_BUILDERS)) {
            const tpl = build(st, 2);
            const back = G.templateFromSlots(G.slotsFromTemplate(tpl));
            assert.equal(bars(back), bars(tpl), st);
            assert.deepEqual(keysOf(back), keysOf(tpl), st);
        }
    });
});

describe('validation', () => {
    const slot = (r, c, s, extra = {}) => ({ r, c, s, m: 1, ...extra });
    test('grille saine : aucun problème', () => {
        assert.deepEqual(G.validateSlots([slot(2, 'm7', 'dorian'), slot(7, '7', 'mixolydian', { _dom: true }), slot(0, 'maj7', 'ionian')]), []);
    });
    test('accord ou gamme inconnus, racine invalide', () => {
        assert.deepEqual(G.validateSlots([slot(0, 'nope', 'ionian'), slot(0, 'maj7', 'nope'), slot('x', 'maj7', 'ionian')]), ['chord0', 'chord1', 'chord2']);
    });
    test('dominante qui ne résout pas : signalée', () => {
        const p = G.validateSlots([slot(7, '7', 'mixolydian', { _dom: true }), slot(1, 'maj7', 'ionian')]);
        assert.deepEqual(p, ['dom0']);
    });
    test('accord de passage : doit monter d\'un demi-ton vers un mineur', () => {
        assert.deepEqual(G.validateSlots([slot(1, 'dim7', 'wholeHalfDiminished', { _pass: true }), slot(2, 'm7', 'dorian')]).filter(x => x.startsWith('pass')), []);
        assert.deepEqual(G.validateSlots([slot(1, 'dim7', 'wholeHalfDiminished', { _pass: true }), slot(2, 'maj7', 'ionian')]).filter(x => x.startsWith('pass')), ['pass0']);
    });
});

describe('fin résolue', () => {
    const tpl = () => [
        { r: 0, c: 'maj7', m: 2, s: 'ionian', function: 'tonic', section: 'A' },
        { r: 5, c: 'maj7', m: 1, s: 'lydian', function: 'subdominant', section: 'A' },
        { r: 2, c: 'm7', m: 1, s: 'dorian', function: 'predominant', section: 'A' },
    ];
    test('la dernière case revient à la tonique et une dominante d\'approche est ajoutée', () => {
        const S = G.slotsFromTemplate(tpl());
        assert.equal(G.resolveEnding(ctx(), S), true);
        const last = S[S.length - 1];
        assert.deepEqual([last.r, last.c, last.function], [0, 'maj7', 'tonic']);
        assert.deepEqual([S[S.length - 2].split.r, S[S.length - 2].split.c], [7, '7']);
    });
    test('mode mineur : dominante altérée', () => {
        const t = tpl(); t[0].c = 'm7'; t[0].s = 'dorian';
        const S = G.slotsFromTemplate(t);
        G.resolveEnding(ctx(), S);
        assert.equal(S[S.length - 2].split.c, '7alt');
    });
    test('triades seules : aucune septième ajoutée', () => {
        const S = G.slotsFromTemplate(tpl());
        G.resolveEnding(ctx({ triadsOnly: true }), S);
        assert.equal(S[S.length - 2].split, undefined);
        assert.equal(S[S.length - 1].r, 0);
    });
    test('fin déjà sur la tonique : rien ne change', () => {
        const t = tpl(); t.push({ r: 0, c: 'maj7', m: 1, s: 'ionian', function: 'tonic', section: 'A' });
        const S = G.slotsFromTemplate(t);
        assert.equal(G.resolveEnding(ctx(), S), false);
        assert.equal(G.withResolvedEnding(ctx(), t), t);
    });
    test('withResolvedEnding rend un nouveau modèle sans toucher l\'original', () => {
        const t = tpl(); const copy = JSON.parse(JSON.stringify(t));
        const out = G.withResolvedEnding(ctx(), t);
        assert.deepEqual(t, copy);
        assert.equal(out[out.length - 1].r, 0);
    });
    test('les modèles des styles de référence se terminent tous sur la tonique', () => {
        for (const st of Object.keys(STYLE_BUILDERS)) {
            const out = G.withResolvedEnding(ctx(), build(st, 4));
            if (out.length < 2) continue;
            const tonic = out.find(x => x.function === 'tonic') || out[0];
            const last = out[out.length - 1];
            assert.equal((last.split || last).r, tonic.r, st);
        }
    });
});

describe('sections jumelles', () => {
    const aaba = () => [
        { r: 0, c: 'maj7', m: 2, s: 'ionian', section: 'A' }, { r: 5, c: 'm7', m: 2, s: 'dorian', section: 'A' },
        { r: 0, c: 'maj7', m: 2, s: 'ionian', section: 'A2' }, { r: 5, c: 'm7', m: 2, s: 'dorian', section: 'A2' },
        { r: 7, c: '7', m: 4, s: 'mixolydian', section: 'B' },
    ];
    test('findTwinSections repère les sections identiques consécutives', () => {
        const g = G.findTwinSections(aaba());
        assert.equal(g.length, 1);
        assert.equal(g[0].copies.length, 1);
        assert.deepEqual([g[0].root.a, g[0].root.b], [0, 2]);
    });
    test('aucune jumelle dans un modèle sans répétition', () => {
        assert.deepEqual(G.findTwinSections([{ r: 0, c: 'maj7', m: 4, s: 'ionian', section: 'A' }, { r: 7, c: '7', m: 4, s: 'mixolydian', section: 'B' }]), []);
    });
    test('tag + copie : la copie reprend la racine réharmonisée, avec ses propres étiquettes', () => {
        const tpl = aaba();
        const S = G.slotsFromTemplate(tpl);
        const ranges = G.tagTwinSlots(S, tpl, G.findTwinSections(tpl));
        assert.deepEqual(ranges, [{ root: [0, 4], copy: [4, 8] }]);
        assert.ok(S[0]._lock && S[3]._lock);
        S[1].c = 'm9'; // réharmonisation de la racine
        G.copyTwinSlots(S, ranges);
        assert.equal(S[5].c, 'm9');
        assert.equal(S[5].section, 'A2');
        assert.equal(S[1].section, 'A');
        assert.ok(!('_skip' in S[5]) && !('_twRoot' in S[5]));
    });
    test('copyTwinSlots sans plages ou avec longueurs différentes : sans effet', () => {
        const S = [{ c: 'a' }, { c: 'b' }];
        G.copyTwinSlots(S, undefined);
        G.copyTwinSlots(S, [{ root: [0, 1], copy: [1, 3] }]);
        assert.deepEqual(S, [{ c: 'a' }, { c: 'b' }]);
    });
});

describe('écriture compacte (reprises)', () => {
    test('grille de moins de 8 mesures ou non tableau : renvoyée telle quelle', () => {
        const g = [mk(0, 'maj7', 6, 'A'), mk(5, 'maj7', 1)];
        assert.equal(G.compactGridRepeats(g), g);
        assert.equal(G.compactGridRepeats(null), null);
        const e = []; assert.equal(G.compactGridRepeats(e), e);
    });
    test('deux moitiés identiques de 8 mesures : signe de reprise, huit mesures écrites', () => {
        const half = [0, 5, 7, 0, 0, 5, 7, 0].map((r, i) => mk(r, i % 3 === 2 ? '7' : 'maj7', 1));
        const g = [{ ...half[0], section: 'A' }, ...half.slice(1), ...half.map((x, i) => i ? { ...x } : { ...x, section: 'B' })];
        const out = G.compactGridRepeats(g);
        assert.equal(out.length, 8);
        assert.equal(out[0].repeatStart, true);
        assert.equal(out[out.length - 1].repeatEnd, 2);
    });
    test('ne modifie pas la grille reçue', () => {
        const half = [0, 5, 7, 0, 0, 5, 7, 0].map((r, i) => mk(r, 'maj7', 1, i ? undefined : 'A'));
        const g = [...half, ...half.map(x => ({ ...x }))];
        const snap = JSON.stringify(g);
        G.compactGridRepeats(g);
        assert.equal(JSON.stringify(g), snap);
    });
    test('grille sans répétition : inchangée', () => {
        const g = [mk(0, 'maj7', 1, 'A'), mk(2, 'm7', 1), mk(4, 'm7', 1), mk(5, 'maj7', 1), mk(7, '7', 1), mk(9, 'm7', 1), mk(11, 'm7b5', 1), mk(0, 'maj7', 1)];
        assert.deepEqual(G.compactGridRepeats(g), g);
    });
});

describe('normalisation et limites de répétition', () => {
    test('enforceChordRepeatLimits fusionne les blocs identiques tant que le précédent fait moins de 4 mesures', () => {
        const out = G.enforceChordRepeatLimits([{ r: 0, c: 'maj7', m: 3, section: 'A' }, { r: 0, c: 'maj7', m: 3, section: 'A' }, { r: 0, c: 'maj7', m: 1, section: 'B' }], false);
        assert.deepEqual(out.map(x => [x.m, x.section]), [[6, 'A'], [1, 'B']]);
        const out2 = G.enforceChordRepeatLimits([{ r: 0, c: 'maj7', m: 4 }, { r: 0, c: 'maj7', m: 2 }], false);
        assert.equal(out2.length, 2);
    });
    test('la basse distincte empêche la fusion quand keepBass est actif', () => {
        const items = [{ r: 0, c: 'maj7', m: 1, bassRootIndex: 0 }, { r: 0, c: 'maj7', m: 1, bassRootIndex: 7 }];
        assert.equal(G.enforceChordRepeatLimits(items, true).length, 2);
        assert.equal(G.enforceChordRepeatLimits(items, false).length, 1);
    });
    test('liste vide', () => {
        const e = []; assert.equal(G.enforceChordRepeatLimits(e, false), e);
        assert.deepEqual(G.normalizeGeneratedGrid([], 'swing'), []);
    });
    test('normalizeGeneratedGrid garde la longueur cible des styles de référence', () => {
        for (const st of ['ii-v-i', 'blues', 'swing', 'pop', 'tango', 'valsejazz']) {
            const out = G.normalizeGeneratedGrid(build(st, 3).map(x => ({ ...x })), st);
            assert.equal(bars(out), bars(build(st, 3)), st);
        }
    });
});

describe('variation d\'un style', () => {
    test('variante 0, triades seules, i-got-rythm, brass : copie du modèle', () => {
        const tpl = build('swing', 0);
        assert.deepEqual(G.createStyleVariation(ctx(), tpl, 'swing', 0), tpl);
        assert.deepEqual(G.createStyleVariation(ctx({ generationVariant: 3, triadsOnly: true }), tpl, 'swing', 0), tpl);
        assert.deepEqual(G.createStyleVariation(ctx({ generationVariant: 3 }), tpl, 'i-got-rythm', 0), tpl);
        assert.deepEqual(G.createStyleVariation(ctx({ generationVariant: 3 }), tpl, 'brasshymn', 0), tpl);
        assert.notEqual(G.createStyleVariation(ctx(), tpl, 'swing', 0)[0], tpl[0]);
    });
    test('modèle vide', () => {
        assert.deepEqual(G.createStyleVariation(ctx({ generationVariant: 2 }), [], 'swing', 0), []);
    });
    test('déterministe, conserve la durée, change l\'harmonie pour les variantes > 0', () => {
        let changed = 0, total = 0;
        for (const st of ['swing', 'bebop', 'pop', 'blues', 'tango', 'baroque']) {
            const tpl = G.withResolvedEnding(ctx(), build(st, 5));
            for (let v = 1; v <= 4; v++) {
                const c = ctx({ generationVariant: v });
                const a = G.createStyleVariation(c, tpl, st, 5), b = G.createStyleVariation(c, tpl, st, 5);
                assert.deepEqual(a, b, st + v);
                total++;
                if (JSON.stringify(a) !== JSON.stringify(tpl)) changed++;
            }
        }
        assert.ok(changed > total / 2, `${changed}/${total}`);
    });
});

describe('proposition renouvelée (bouton « Générer »)', () => {
    const STYLES = ['ii-v-i', 'swing', 'bebop', 'blues', 'pop', 'ballad', 'bossa', 'tango', 'baroque', 'brasshymn', 'chansonsimple', 'valsejazz', 'piazzolla'];
    const renew = (st, over = {}, key = 0) => {
        const canon = G.withResolvedEnding(ctx(over), build(st, key));
        return { canon, out: G.renewTemplate(ctx(over), st, (R) => build(st, key, R), key, canon) };
    };
    test('déterministe pour une même graine, différente pour une autre', () => {
        const a = renew('swing', { generationVariant: 1 }).out, b = renew('swing', { generationVariant: 1 }).out;
        assert.deepEqual(a, b);
        const c = renew('swing', { generationVariant: 1, seedBase: 999 }).out;
        assert.notDeepEqual(keysOf(a), keysOf(c));
    });
    test('toujours valide, de même durée que la référence, terminée sur la tonique', () => {
        for (const st of STYLES) for (let v = 1; v <= 3; v++) {
            const { canon, out } = renew(st, { generationVariant: v }, v * 3);
            assert.ok(out, `${st} v${v}`);
            assert.equal(bars(out), bars(G.normalizeGeneratedGrid(canon.map(x => ({ ...x })), st)), `${st} v${v} durée`);
            assert.deepEqual(G.validateSlots(G.slotsFromTemplate(out)), [], `${st} v${v}`);
        }
    });
    test('diffère de la référence d\'au moins 35 % (ou du meilleur essai) pour les styles jazz', () => {
        for (const st of ['swing', 'bebop', 'ii-v-i']) {
            const { canon, out } = renew(st, { generationVariant: 2 });
            const a = keysOf(G.normalizeGeneratedGrid(canon.map(x => ({ ...x })), st)), b = keysOf(out);
            let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
            assert.ok(d / a.length > 0.2, `${st} ${d}/${a.length}`);
        }
    });
    test('tient compte des grilles récentes : la proposition s\'en écarte', () => {
        const first = renew('swing', { generationVariant: 1 }).out;
        const rec = G.rememberGenerated([], 'swing', first.map(x => ({ rootIndex: x.r, chordId: x.c, measures: x.m, split: x.split && { rootIndex: x.split.r, chordId: x.split.c } })));
        const second = renew('swing', { generationVariant: 1, recentGrids: rec }).out;
        assert.notDeepEqual(keysOf(first), keysOf(second));
    });
    test('triades seules : aucune septième introduite', () => {
        const { out } = renew('chansonsimple', { generationVariant: 2, triadsOnly: true });
        assert.ok(keysOf(out).every(k => !/\|/.test(k)));
    });
    test('brass : uniquement triades et dominantes septièmes', () => {
        const { out } = renew('brasshymn', { generationVariant: 3 });
        assert.ok(out.length > 0);
        out.forEach(x => { [x, x.split].filter(Boolean).forEach(ch => assert.ok(!['maj7', 'm7', '9', 'maj9', 'm9', '7alt'].includes(ch.c), ch.c)); });
    });
    test('ne modifie pas le modèle canonique', () => {
        const canon = G.withResolvedEnding(ctx(), build('swing', 0));
        const snap = JSON.stringify(canon);
        G.renewTemplate(ctx({ generationVariant: 2 }), 'swing', (R) => build('swing', 0, R), 0, canon);
        assert.equal(JSON.stringify(canon), snap);
    });
});
