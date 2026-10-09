// Tests des métadonnées de style (styles/style-meta.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./style-meta.js');
const G = require('../grid/generation.js');
const T = require('../theory.js');
const { STYLE_BUILDERS, buildStyleTemplate } = require('./style-builders.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const LABELS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const STYLES = Object.keys(STYLE_BUILDERS);
const gridOf = (st, key = 0) => G.withResolvedEnding({ findChordObj }, buildStyleTemplate(st, { keyRoot: key, mainQuality: 'ionian', R: null, findChordObj }))
    .map(i => ({ rootIndex: i.r, chordId: i.c, measures: i.m, scaleId: i.s, section: i.section, phrase: i.phrase, kc: i.kc }));
const annotate = (g, st, over = {}) => M.annotateModulations(g, { styleKey: st, mainKey: 0, mainQuality: 'ionian', rootLabels: LABELS, homeLabel: () => 'I', ...over });
const env = (over = {}) => ({ scaleStyle: 'blues', mainKey: 0, mainQuality: 'ionian', qualityAuto: false, findChordObj, ...over });

describe('tables par style', () => {
    test('chaque style de génération a un profil de gammes, un orchestre et un tempo', () => {
        for (const st of STYLES) {
            assert.ok(M.STYLE_SCALE_PROFILE[st], 'profil ' + st);
            assert.ok(M.tempoMeterFor(st), 'tempo ' + st);
            if (st !== 'custom') assert.ok(M.bandStyleFor(st), 'orchestre ' + st);
        }
    });
    test('valeurs de référence', () => {
        assert.deepEqual(M.tempoMeterFor('swing'), { bpm: 140, meter: '4/4' });
        assert.deepEqual(M.tempoMeterFor('balkan98'), { bpm: 100, meter: '9/8' });
        assert.equal(M.bandStyleFor('bossa'), 'latin');
        assert.equal(M.bandStyleFor('piazzolla'), 'piazzolla');
        assert.equal(M.grooveHintFor('milongalyrique'), 'lyrique');
        assert.equal(M.grooveHintFor('swing'), null);
    });
    test('style inconnu ou clé héritée d\'Object : null partout', () => {
        for (const k of ['inconnu', 'constructor', 'toString', undefined, null, 42]) {
            assert.equal(M.bandStyleFor(k), null);
            assert.equal(M.grooveHintFor(k), null);
            assert.equal(M.tempoMeterFor(k), null);
        }
    });
    test('tempoMeterFor rend une copie : la modifier ne touche pas la table', () => {
        const t = M.tempoMeterFor('swing'); t.bpm = 1;
        assert.equal(M.tempoMeterFor('swing').bpm, 140);
    });
    test('signatures valides et tempos plausibles', () => {
        for (const [st, t] of Object.entries(M.STYLE_TEMPO_METER)) {
            assert.match(t.meter, /^(2\/4|3\/4|4\/4|6\/8|9\/8|12\/8)$/, st);
            assert.ok(t.bpm >= 40 && t.bpm <= 220, st);
        }
    });
    test('orchestres et grooves : valeurs connues du moteur', () => {
        const bands = new Set(['swing', 'latin', 'pop', 'classic', 'cuba', 'piazzolla', 'brass', 'balkan']);
        Object.values(M.STYLE_BAND).forEach(b => assert.ok(bands.has(b), b));
        const grooves = new Set(['samba', 'tango', 'piazzolla', 'lyrique', 'afro', 'b-chorale']);
        Object.values(M.STYLE_GROOVE).forEach(g => assert.ok(grooves.has(g), g));
    });
});

describe('lecture d\'un accord dans une tonalité cible', () => {
    const ch = (rootIndex, chordId) => ({ rootIndex, chordId });
    test('tonalité majeure : I, V7, ii, IV', () => {
        const tgt = { root: 3, minor: false };
        assert.equal(M.modReading(ch(3, 'maj7'), tgt, LABELS), 'I de E♭');
        assert.equal(M.modReading(ch(10, '7'), tgt, LABELS), 'V7 de E♭');
        assert.equal(M.modReading(ch(5, 'm7'), tgt, LABELS), 'ii de E♭');
        assert.equal(M.modReading(ch(8, 'maj7'), tgt, LABELS), 'IV de E♭');
        assert.equal(M.modReading(ch(4, 'maj7'), tgt, LABELS), null);
    });
    test('tonalité mineure : i, V7, iiø, iv', () => {
        const tgt = { root: 9, minor: true };
        assert.equal(M.modReading(ch(9, 'm7'), tgt, LABELS), 'i (Am)');
        assert.equal(M.modReading(ch(4, '7'), tgt, LABELS), 'V7 de Am');
        assert.equal(M.modReading(ch(11, 'm7b5'), tgt, LABELS), 'iiø de Am');
        assert.equal(M.modReading(ch(2, 'm7'), tgt, LABELS), 'iv de Am');
        assert.equal(M.modReading(ch(9, 'maj7'), tgt, LABELS), null);
    });
    test('utilise les noms de notes fournis (enharmonie)', () => {
        const sharp = LABELS.slice(); sharp[3] = 'D♯';
        assert.equal(M.modReading(ch(3, 'maj7'), { root: 3, minor: false }, sharp), 'I de D♯');
    });
});

describe('règles de modulation', () => {
    test('neuf styles modulants', () => {
        assert.deepEqual(Object.keys(M.styleModulations()).sort(),
            ['balkan', 'bossa', 'milongalyrique', 'piazzolla', 'samba', 'tango', 'tarentelle', 'valsemusette', 'valseviennoise']);
    });
    test('chaque règle a un prédicat et une cible numérique ou \'home\'', () => {
        for (const rules of Object.values(M.styleModulations())) rules.forEach(r => {
            assert.equal(typeof r.at, 'function');
            assert.ok(r.to === 'home' || Number.isInteger(r.to));
        });
    });
});

describe('pose des marqueurs de modulation', () => {
    test('valse viennoise : trio à la dominante puis retour', () => {
        const g = gridOf('valseviennoise');
        annotate(g, 'valseviennoise');
        const marks = g.filter(x => x.modKey);
        assert.deepEqual(marks.map(x => x.fnLabel), ['I de G', 'I de C']);
        assert.deepEqual(marks.map(x => x.modKey), [{ root: 7, minor: false }, { root: 0, minor: false }]);
    });
    test('le marqueur ne vaut que pour une mesure : le bloc est scindé', () => {
        const g = gridOf('tango');
        const before = g.reduce((s, x) => s + x.measures, 0);
        annotate(g, 'tango');
        assert.equal(g.reduce((s, x) => s + x.measures, 0), before);
        g.filter(x => x.modKey).forEach(x => assert.equal(x.measures, 1));
    });
    test('retour sans lecture « I de X » : étiquette fournie par homeLabel', () => {
        const calls = [];
        const g = gridOf('samba');
        annotate(g, 'samba', { homeLabel: (i, home) => { calls.push([i, home]); return 'retour'; } });
        assert.ok(calls.length >= 1);
        assert.deepEqual(calls[0][1], { root: 0, minor: false });
        assert.ok(g.some(x => x.fnLabel === 'retour'));
    });
    test('tonalité d\'origine mineure déduite du mode', () => {
        const calls = [];
        const g = gridOf('samba');
        annotate(g, 'samba', { mainQuality: 'aeolian', homeLabel: (i, home) => { calls.push(home); return 'x'; } });
        if (calls.length) assert.equal(calls[0].minor, true);
    });
    test('étiquette tronquée à 24 caractères', () => {
        const g = gridOf('valseviennoise');
        annotate(g, 'valseviennoise', { rootLabels: LABELS.map(() => 'N'.repeat(40)) });
        g.filter(x => x.fnLabel).forEach(x => assert.ok(x.fnLabel.length <= 24));
    });
    test('style sans modulation, tonalité non entière, grille vide : rien ne change', () => {
        for (const [st, over] of [['swing', {}], ['tango', { mainKey: null }]]) {
            const g = gridOf(st), snap = JSON.stringify(g);
            annotate(g, st, over);
            assert.equal(JSON.stringify(g), snap, st);
        }
        const e = []; annotate(e, 'tango'); assert.deepEqual(e, []);
    });
    test('champ kc posé par le style : prioritaire sur les règles par section', () => {
        const g = [0, 5, 7, 0, 7, 0, 7, 0].map((r, i) => ({ rootIndex: r, chordId: i % 2 ? '7' : 'maj7', measures: 1, scaleId: 'ionian', kc: i >= 4 ? 7 : 0 }));
        g[4] = { ...g[4], rootIndex: 7, chordId: 'maj7' };
        annotate(g, 'swing');
        assert.equal(g[4].fnLabel, 'I de G');
        assert.deepEqual(g[4].modKey, { root: 7, minor: false });
    });
    test('toutes tonalités : le total de mesures est conservé et chaque marqueur a un modKey', () => {
        for (const st of Object.keys(M.styleModulations())) for (let k = 0; k < 12; k++) {
            const g = gridOf(st, k), n = g.reduce((s, x) => s + x.measures, 0);
            annotate(g, st, { mainKey: k });
            assert.equal(g.reduce((s, x) => s + x.measures, 0), n, st + k);
            g.forEach(x => assert.equal(!!x.fnLabel, !!x.modKey, st + k));
        }
    });
});

describe('gamme par défaut selon le style', () => {
    test('profil jazz ou inconnu : null (1re gamme de l\'accord)', () => {
        assert.equal(M.styleScaleFor(env({ scaleStyle: 'swing' }), '7', 0), null);
        assert.equal(M.styleScaleFor(env({ scaleStyle: null }), '7', 0), null);
        assert.equal(M.styleScaleFor(env({ scaleStyle: 'zzz' }), '7', 0), null);
    });
    test('accord inconnu du catalogue : null', () => {
        assert.equal(M.styleScaleFor(env({ findChordObj: () => null }), '7', 0), null);
    });
    test('blues : gamme blues sur I / IV / V, mixolydien ailleurs', () => {
        const a = M.styleScaleFor(env(), '7', 0), b = M.styleScaleFor(env(), '7', 2);
        assert.equal(b, 'mixolydian');
        assert.notEqual(a, 'ionian');
    });
    test('funk : dorien sur les mineurs hors tonique', () => {
        assert.equal(M.styleScaleFor(env({ scaleStyle: 'funk' }), 'm7', 7), 'dorian');
    });
    test('balkan : phrygien dominant sur la dominante', () => {
        const id = M.styleScaleFor(env({ scaleStyle: 'balkan' }), '7', 7);
        assert.ok(['phrygianDominant', 'mixolydianFlat9', 'mixolydian'].includes(id));
    });
    test('classic : mode du degré dans la tonalité', () => {
        const e = env({ scaleStyle: 'baroque' });
        assert.equal(M.styleScaleFor(e, 'maj7', 0), 'ionian');
        assert.equal(M.styleScaleFor(e, 'm7', 2), 'dorian');
        assert.equal(M.styleScaleFor(e, 'maj7', 5), 'lydian');
        assert.equal(M.styleScaleFor(e, '7', 7), 'mixolydian');
        assert.equal(M.styleScaleFor(e, 'm7', 9), 'aeolian');
    });
    test('classic en mode posé automatiquement (mixolydien) : la tonique reste le I', () => {
        const e = env({ scaleStyle: 'baroque', mainQuality: 'mixolydian' });
        assert.equal(M.styleScaleFor({ ...e, qualityAuto: true }, 'maj7', 0), 'ionian');
    });
    test('hors mode en tonalité mineure : V7 avec b13', () => {
        const e = env({ scaleStyle: 'baroque', mainQuality: 'aeolian' });
        const id = M.styleScaleFor(e, '7', 7);
        assert.ok(['mixolydianFlat13', 'mixolydian'].includes(id));
    });
    test('toujours une gamme disponible pour l\'accord, ou null', () => {
        for (const ps of ['blues', 'funk', 'balkan', 'baroque']) for (const id of ['maj7', 'm7', '7', 'm7b5', '7alt', 'dim7', 'majTriad', 'minTriad'])
            for (let r = 0; r < 12; r++) {
                const sc = M.styleScaleFor(env({ scaleStyle: ps }), id, r);
                if (sc !== null) assert.ok(findChordObj(id).scales.some(s => s.id === sc), `${ps} ${id} ${r} ${sc}`);
            }
    });
});

describe('application du profil à une grille', () => {
    const co = (id) => findChordObj(id);
    test('remplace seulement les gammes laissées sur la 1re gamme de l\'accord', () => {
        const first = co('7').scales[0].id;
        const items = [{ rootIndex: 2, chordId: '7', scaleId: first }, { rootIndex: 2, chordId: '7', scaleId: 'altered' }];
        M.applyStyleScaleProfile(env(), 'blues', items);
        assert.equal(items[0].scaleId, M.styleScaleFor(env(), '7', 2));
        assert.equal(items[1].scaleId, 'altered');
    });
    test('les blocs partagés sont traités aussi', () => {
        const first = co('7').scales[0].id;
        const items = [{ rootIndex: 0, chordId: 'maj7', scaleId: 'x', split: { rootIndex: 2, chordId: '7', scaleId: first } }];
        M.applyStyleScaleProfile(env(), 'blues', items);
        assert.equal(items[0].scaleId, 'x');
        assert.equal(items[0].split.scaleId, 'mixolydian');
    });
    test('profil jazz, style inconnu ou grille absente : sans effet', () => {
        const items = [{ rootIndex: 2, chordId: '7', scaleId: co('7').scales[0].id }], snap = JSON.stringify(items);
        M.applyStyleScaleProfile(env(), 'swing', items);
        M.applyStyleScaleProfile(env(), 'zzz', items);
        M.applyStyleScaleProfile(env(), 'blues', undefined);
        assert.equal(JSON.stringify(items), snap);
    });
});

describe('tonalité réelle d\'un style', () => {
    const g = (c, r = 5) => [{ rootIndex: r, chordId: c }];
    test('styles écrits en degrés, grille vide : null', () => {
        for (const st of M.STYLES_FOLLOWING_KEY) assert.equal(M.styleTonality(st, g('m7')), null, st);
        assert.equal(M.styleTonality('blues', []), null);
        assert.equal(M.styleTonality('blues', undefined), null);
    });
    test('premier accord : majeur, mineur, dominant', () => {
        assert.deepEqual(M.styleTonality('pop', g('maj7', 4)), { rootIndex: 4, quality: 'ionian' });
        assert.deepEqual(M.styleTonality('pop', g('m7')), { rootIndex: 5, quality: 'aeolian' });
        assert.deepEqual(M.styleTonality('blues', g('7', 9)), { rootIndex: 9, quality: 'mixolydian' });
    });
    test('modal mineur : dorien', () => {
        assert.equal(M.styleTonality('modal', g('m7')).quality, 'dorian');
    });
});
