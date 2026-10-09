// Tests de la lecture harmonique (grid/harmony.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harmony.js');
const T = require('../theory.js');

const LABELS = T.ROOT_NAMES_DEFAULT.slice();
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const ch = (rootIndex, chordId, extra = {}) => ({ rootIndex, chordId, ...extra });
const flatOf = (chords) => chords.map((c, i) => ({ ...c, stepIndex: i, measureNumber: i + 1 }));
const labels = (flat, mainKey = 0) => flat.map((m, i) => H.harmonicFunctionLabel(m, flat, i, 0, null, mainKey));
const allIds = () => { const a = []; for (const cat in T.chordTypes) T.chordTypes[cat].forEach(c => a.push(c.id)); return a; };

describe('notation des accords', () => {
    test('triade majeure : fondamentale seule', () => assert.equal(H.jazzChordNotation('majTriad'), ''));
    test('symboles Jam usuels', () => {
        const exp = { maj7: 'Δ', maj9: 'Δ9', m7: '−7', m9: '−9', mmaj7: '−Δ7', '7': '7', '7b9': '7♭9', m7b5: 'ø', dim7: '°', '7sus4': '7sus4', '6': '6' };
        for (const [id, sym] of Object.entries(exp)) assert.equal(H.jazzChordNotation(id), sym, id);
    });
    test('accord inconnu : repli sur le nom de la triade majeure', () => {
        assert.equal(H.jazzChordNotation('nope'), T.chordTypes.maj[0].name);
    });
    test('tous les accords du catalogue ont une notation (éventuellement vide pour la triade majeure)', () => {
        for (const id of allIds()) assert.equal(typeof H.jazzChordNotation(id), 'string', id);
    });
});

describe('symbole d\'accord', () => {
    test('fondamentale + notation, selon l\'orthographe fournie', () => {
        assert.equal(H.chordSymbol(ch(1, 'm7'), SHARP), 'C#−7');
        assert.equal(H.chordSymbol(ch(1, 'm7'), FLAT), 'D♭−7');
        assert.equal(H.chordSymbol(ch(0, 'majTriad'), SHARP), 'C');
    });
    test('basse différente : accord sur basse', () => {
        assert.equal(H.chordSymbol(ch(0, 'maj7', { bassRootIndex: 4 }), SHARP), 'CΔ/E');
        assert.equal(H.chordSymbol(ch(0, 'maj7', { bassRootIndex: 0 }), SHARP), 'CΔ');
        assert.equal(H.chordSymbol(ch(0, 'maj7', { bassRootIndex: undefined }), SHARP), 'CΔ');
    });
    test('version HTML : Δ et ♭ isolés dans un span', () => {
        assert.equal(H.chordSymbolHtml(ch(0, 'maj7'), SHARP), 'C<span class="jam-glyph">Δ</span>');
        assert.equal(H.chordSymbolHtml(ch(1, '7b9'), FLAT), 'D<span class="jam-glyph">♭</span>7<span class="jam-glyph">♭</span>9');
        assert.equal(H.chordSymbolHtml(ch(7, '7'), SHARP), 'G7');
    });
});

describe('tonalité locale', () => {
    test('repli sur la tonalité de la grille', () => {
        const flat = flatOf([ch(0, 'maj7'), ch(5, 'maj7')]);
        assert.deepEqual(H.localKey(flat, 1, 0, false, 3), { root: 3, minor: false });
    });
    test('entrées invalides : repli', () => {
        for (const [f, i] of [[null, 0], [[], 0], [flatOf([ch(0, 'maj7')]), -1], [flatOf([ch(0, 'maj7')]), NaN]])
            assert.deepEqual(H.localKey(f, i, 0, false, 2), { root: 2, minor: false });
    });
    test('dernier marqueur de modulation rencontré en remontant', () => {
        const flat = flatOf([ch(0, 'maj7'), ch(3, 'maj7', { modKey: { root: 3, minor: false } }), ch(5, 'maj7'), ch(0, 'maj7', { modKey: { root: 9, minor: 1 } }), ch(2, 'm7')]);
        assert.deepEqual(H.localKey(flat, 0), { root: 0, minor: false });
        assert.deepEqual(H.localKey(flat, 2), { root: 3, minor: false });
        assert.deepEqual(H.localKey(flat, 4), { root: 9, minor: true });
    });
    test('excludeSelf : le marqueur du bloc lui-même est ignoré', () => {
        const flat = flatOf([ch(0, 'maj7'), ch(3, 'maj7', { modKey: { root: 3, minor: false } })]);
        assert.deepEqual(H.localKey(flat, 1, 0, false, 0), { root: 3, minor: false });
        assert.deepEqual(H.localKey(flat, 1, 0, true, 0), { root: 0, minor: false });
    });
    test('marqueur de la 2e moitié : vaut pour elle-même et pour la suite seulement', () => {
        const flat = flatOf([ch(0, 'maj7', { split: ch(7, '7', { modKey: { root: 7, minor: false } }) }), ch(7, 'maj7')]);
        assert.deepEqual(H.localKey(flat, 0, 0), { root: 0, minor: false });
        assert.deepEqual(H.localKey(flat, 0, 1), { root: 7, minor: false });
        assert.deepEqual(H.localKey(flat, 1, 0), { root: 7, minor: false });
    });
});

describe('étiquettes de fonction', () => {
    test('degrés romains dans la tonalité, majuscules/minuscules, ø et °', () => {
        const flat = flatOf([ch(0, 'maj7'), ch(2, 'm7'), ch(7, '7'), ch(11, 'm7b5'), ch(1, 'dim7'), ch(3, 'maj7'), ch(5, 'maj7')]);
        assert.deepEqual(labels(flat), ['I', 'ii', 'V', 'viiø', '♭ii°', '♭III', 'IV']);
    });
    test('suit la tonique du moteur', () => {
        const flat = flatOf([ch(7, 'maj7')]);
        assert.deepEqual(labels(flat, 7), ['I']);
        assert.deepEqual(labels(flat, 0), ['V']);
    });
    test('fnLabel choisi par l\'utilisateur : prioritaire', () => {
        const flat = flatOf([ch(0, 'maj7', { fnLabel: 'I de G' })]);
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, null, 5), 'I de G');
    });
    test('keyOverride entier prioritaire sur la tonalité locale', () => {
        const flat = flatOf([ch(0, 'maj7', { modKey: { root: 5, minor: false } })]);
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, null, 0), 'V');
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, 0, 0), 'I');
    });
    test('dominante secondaire : V/x vers le prochain accord différent', () => {
        const flat = flatOf([ch(9, '7', { harmonicFunction: 'secondaryDominant' }), ch(9, '7'), ch(2, 'm7'), ch(7, '7')]);
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, null, 0), 'V/ii');
        assert.equal(H.harmonicFunctionLabel({ ...flat[1], harmonicFunction: 'secondaryDominant' }, flat, 1, 0, null, 0), 'V/ii'); // accord répété : même cible
    });
    test('dominante secondaire qui résout sur la tonique : V ; par demi-ton : subV', () => {
        const a = flatOf([ch(7, '7', { harmonicFunction: 'secondaryDominant' }), ch(0, 'maj7')]);
        assert.equal(H.harmonicFunctionLabel(a[0], a, 0, 0, null, 0), 'V');
        const b = flatOf([ch(1, '7', { harmonicFunction: 'secondaryDominant' }), ch(0, 'maj7')]);
        assert.equal(H.harmonicFunctionLabel(b[0], b, 0, 0, null, 0), 'subV');
        const c = flatOf([ch(3, '7', { harmonicFunction: 'secondaryDominant' }), ch(2, 'm7')]);
        assert.equal(H.harmonicFunctionLabel(c[0], c, 0, 0, null, 0), 'subV/ii');
    });
    test('dominante secondaire sans résolution lisible : degré', () => {
        const flat = flatOf([ch(9, '7', { harmonicFunction: 'secondaryDominant' })]);
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, null, 0), 'VI');
    });
    test('accord inconnu : degré majuscule', () => {
        const flat = flatOf([ch(7, 'nope')]);
        assert.equal(H.harmonicFunctionLabel(flat[0], flat, 0, 0, null, 0), 'V');
    });
});

describe('lectures alternatives', () => {
    const titles = (g) => g.map(x => x.title);
    const lab = (g) => g.flatMap(x => x.items.map(i => i.label));
    const alt = (c, next = null, key = 0) => H.functionAlternatives(c, next, key, { mainKey: key, rootLabels: LABELS });
    test('V7 sur V : dominante principale, substitutions, pas de modulation', () => {
        const g = alt(ch(7, '7'));
        assert.ok(lab(g).includes('V7') && lab(g).includes('D'));
        assert.ok(titles(g).includes('Substitutions'));
        assert.ok(!titles(g).includes('Modulation'));
    });
    test('dominante ailleurs : dominante secondaire et modulation', () => {
        const g = alt(ch(9, '7'));
        assert.ok(lab(g).includes('V7/II'));
        assert.ok(lab(g).some(l => l.startsWith('V7 de ')));
        g.find(x => x.title === 'Modulation').items.forEach(i => assert.ok(i.mod && Number.isInteger(i.mod.root)));
    });
    test('mineur : degré, ii/x et pivots', () => {
        const g = alt(ch(2, 'm7'));
        assert.deepEqual(g.find(x => x.title === 'Degré').items[0].label, 'ii');
        assert.ok(lab(g).includes('i (Dm)'));
        assert.ok(lab(alt(ch(0, 'm7'))).includes('i'));
    });
    test('majeur : degré et modulations I / IV ; V de x seulement pour la triade', () => {
        assert.deepEqual(alt(ch(5, 'maj7')).find(x => x.title === 'Degré').items[0].label, 'IV');
        assert.ok(lab(alt(ch(5, 'maj7'))).includes('I de F'));
        assert.ok(!lab(alt(ch(5, 'maj7'))).some(l => l.startsWith('V de')));
        assert.ok(lab(alt(ch(5, 'majTriad'))).some(l => l.startsWith('V de')));
    });
    test('demi-diminué : iiø et modulation', () => {
        const g = alt(ch(11, 'm7b5'));
        assert.ok(lab(g).includes('viiø'));
        assert.ok(titles(g).includes('Modulation'));
    });
    test('diminué : sensibles de quatre dominantes, accords de passage', () => {
        const g = alt(ch(1, 'dim7'));
        assert.equal(g.find(x => x.title === 'Dominantes secondaires').items.length, 4);
        assert.deepEqual(g.find(x => x.title === 'Accords de passage').items.map(i => i.label), ['♯I°7', '♭II°7']);
    });
    test('accord d\'approche chromatique selon l\'accord suivant', () => {
        assert.ok(lab(alt(ch(11, 'maj7'), ch(0, 'maj7'))).includes('↗ I'));
        assert.ok(lab(alt(ch(1, 'maj7'), ch(0, 'maj7'))).includes('↘ I'));
        assert.ok(!lab(alt(ch(11, 'maj7'), ch(5, 'maj7'))).some(l => l.startsWith('↗') || l.startsWith('↘')));
    });
    test('noms de tonalités suivant l\'orthographe', () => {
        const sharp = H.functionAlternatives(ch(1, 'maj7'), null, 0, { mainKey: 0, rootLabels: SHARP });
        const flat = H.functionAlternatives(ch(1, 'maj7'), null, 0, { mainKey: 0, rootLabels: FLAT });
        assert.ok(lab(sharp).includes('I de C#'));
        assert.ok(lab(flat).includes('I de D♭'));
    });
    test('keyOverride entier prioritaire sur mainKey', () => {
        const g = H.functionAlternatives(ch(7, '7'), null, 7, { mainKey: 0, rootLabels: LABELS });
        assert.ok(lab(g).includes('V7') === false);
        assert.ok(lab(g).includes('I7'));
    });
    test('libellés uniques dans une même proposition, pour tout le catalogue', () => {
        for (const id of allIds()) for (let r = 0; r < 12; r++) {
            const l = lab(alt(ch(r, id), ch((r + 1) % 12, 'maj7')));
            assert.equal(new Set(l).size, l.length, `${id} ${r}`);
        }
    });
});
