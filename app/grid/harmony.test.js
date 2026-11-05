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
    test('version HTML : Δ, ♭ et le moins − isolés dans un span', () => {
        assert.equal(H.chordSymbolHtml(ch(0, 'maj7'), SHARP), 'C<span class="jam-glyph">Δ</span>');
        assert.equal(H.chordSymbolHtml(ch(1, '7b9'), FLAT), 'D<span class="jam-glyph">♭</span>7<span class="jam-glyph">♭</span>9');
        assert.equal(H.chordSymbolHtml(ch(7, '7'), SHARP), 'G7');
        // le moins du mineur (U+2212) n'est pas dans Kalam non plus : même traitement que Δ et ♭
        assert.equal(H.chordSymbolHtml(ch(2, 'm7'), SHARP), 'D<span class="jam-glyph">−</span>7');
        assert.equal(H.chordSymbolHtml(ch(0, 'mmaj7'), SHARP), 'C<span class="jam-glyph">−</span><span class="jam-glyph">Δ</span>7');
    });

    test('glyphHtml isole Δ ♭ ♯ − (symboles et chiffrages de fonction), pas le reste', () => {
        const g = (c) => `<span class="jam-glyph">${c}</span>`;
        assert.equal(H.glyphHtml('♭VII7'), `${g('♭')}VII7`);
        assert.equal(H.glyphHtml('♯iv'), `${g('♯')}iv`);
        assert.equal(H.glyphHtml('V7/ii ø °'), 'V7/ii ø °');   // ø et ° existent dans Kalam
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
    test('dominante sur II, III, VI, VII : chiffrage par degré (II7, III7, VI7, VII7), en plus de V7/x', () => {
        // Ré majeur : E7 = II7, F#7 = III7, B7 = VI7, C#7 = VII7
        for (const [root, label, target] of [[4, 'II7', 'V7/V'], [6, 'III7', 'V7/VI'], [11, 'VI7', 'V7/II'], [1, 'VII7', 'V7/III']]) {
            const g = alt(ch(root, '7'), null, 2);
            const deg = g.find(x => x.title === 'Degré');
            assert.ok(deg, `${label} : groupe Degré`);
            assert.deepEqual(deg.items.map(i => i.label), [label]);
            assert.ok(lab(g).includes(target), `${label} garde ${target}`);
        }
    });
    test('dominante : pas de doublon « Degré » sur I7, IV7, V7 ni sur les emprunts (♭III7, ♭VI7)', () => {
        for (const r of [0, 3, 5, 7, 8]) assert.ok(!titles(alt(ch(r, '7'))).includes('Degré'), `r=${r}`);
    });
    test('dominante : le suffixe suit le type d\'accord (7sus, +)', () => {
        assert.ok(lab(alt(ch(9, '7sus4'))).includes('VI7sus'));
        assert.ok(lab(alt(ch(9, 'augTriad'))).includes('VI+'));
    });
    // Pont de « I Got Rhythm » en Si♭ : D7 → G7 → C7 → F7 → B♭ (cycle des dominantes)
    const BB = 10, D = 2, G = 7, C = 0, F = 5;
    const bridge = (idx, key = BB) => {
        const chain = [ch(D, '7'), ch(G, '7'), ch(C, '7'), ch(F, '7'), ch(BB, 'majTriad')];
        return H.functionAlternatives(chain[idx], chain[idx + 1], key, { mainKey: key, rootLabels: LABELS, after: chain.slice(idx + 1, idx + 3) });
    };
    test('chaîne de dominantes : D7 → G7 → C7 se lit V7/V7/II (dominante de G7, lui-même V7/II)', () => {
        const g = bridge(0);
        const items = g.find(x => x.title === 'Dominantes').items;
        assert.deepEqual(items.map(i => i.label), ['V7/VI', 'V7/V7/II']);
        assert.match(items[1].desc, /G7/);
        assert.match(items[1].desc, /C7/);
    });
    test('chaîne de dominantes : G7 → C7 → F7 se lit V7/V7/V', () => {
        assert.ok(bridge(1).find(x => x.title === 'Dominantes').items.some(i => i.label === 'V7/V7/V'));
    });
    test('chaîne de dominantes : pas de lecture en chaîne quand la dominante suivante mène à la tonique (C7 → F7 → B♭ = V7/V)', () => {
        assert.deepEqual(bridge(2).find(x => x.title === 'Dominantes').items.map(i => i.label), ['V7/V']);
    });
    test('chaîne de dominantes : sans accords suivants fournis, comportement inchangé', () => {
        const g = H.functionAlternatives(ch(D, '7'), ch(G, '7'), BB, { mainKey: BB, rootLabels: LABELS });
        assert.deepEqual(g.find(x => x.title === 'Dominantes').items.map(i => i.label), ['V7/VI']);
    });
    test('chaîne de dominantes : cible mineure en minuscules (A7 → D7 → Gm7 : V7/V7/ii)', () => {
        const chain = [ch(9, '7'), ch(2, '7'), ch(7, 'm7')];
        const g = H.functionAlternatives(chain[0], chain[1], 0, { mainKey: 0, rootLabels: LABELS, after: chain.slice(1) });
        assert.ok(g.find(x => x.title === 'Dominantes').items.some(i => i.label === 'V7/V7/v'));
    });
    test('chaîne de dominantes : l\'étiquette passe l\'affichage classique en tonalité mineure sans erreur', () => {
        const g = H.displayAlternatives(bridge(0), 'classic', true);
        const it = g.find(x => x.title === 'Dominantes').items.find(i => i.label === 'V7/V7/II');
        assert.ok(it && typeof it.shownLabel === 'string' && it.shownLabel.startsWith('V7/V7/'));
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

describe('chiffrage jazz / classique en tonalité mineure', () => {
    // la mineur : Am G F E (cadence andalouse), mainKey = 9
    const am = flatOf([ch(9, 'minTriad'), ch(7, 'majTriad'), ch(5, 'majTriad'), ch(4, 'majTriad')]);
    const lbl = (flat, opts, mainKey = 9) => flat.map((m, i) => H.harmonicFunctionLabel(m, flat, i, 0, null, mainKey, opts));
    test('jazz (par défaut) : i ♭VII ♭VI V', () => {
        assert.deepEqual(lbl(am, { mainQuality: 'aeolian' }), ['i', '♭VII', '♭VI', 'V']);
        assert.deepEqual(lbl(am, { convention: 'jazz', mainQuality: 'aeolian' }), ['i', '♭VII', '♭VI', 'V']);
        assert.deepEqual(lbl(am), ['i', '♭VII', '♭VI', 'V'], 'sans options : comme avant');
    });
    test('classique : i VII VI V', () => {
        assert.deepEqual(lbl(am, { convention: 'classic', mainQuality: 'aeolian' }), ['i', 'VII', 'VI', 'V']);
    });
    test('classique : sans effet en tonalité majeure ou si le mode de la grille n\'est pas connu', () => {
        const c = flatOf([ch(0, 'maj7'), ch(10, 'maj7'), ch(8, 'maj7')]);
        assert.deepEqual(lbl(c, { convention: 'classic', mainQuality: 'ionian' }, 0), ['I', '♭VII', '♭VI']);
        assert.deepEqual(lbl(am, { convention: 'classic' }), ['i', '♭VII', '♭VI', 'V']);
    });
    test('classique : le mode dorien lit aussi la gamme mineure ; le mixolydien reste jazz', () => {
        const d = flatOf([ch(2, 'm7'), ch(0, 'maj7'), ch(5, 'maj7')]); // ré dorien : Dm7 C F
        assert.deepEqual(lbl(d, { convention: 'jazz', mainQuality: 'dorian' }, 2), ['i', '♭VII', '♭III']);
        assert.deepEqual(lbl(d, { convention: 'classic', mainQuality: 'dorian' }, 2), ['i', 'VII', 'III']);
        const m = flatOf([ch(7, '7'), ch(5, 'maj7')]);
        assert.deepEqual(lbl(m, { convention: 'classic', mainQuality: 'mixolydian' }, 7), ['I', '♭VII']);
    });
    test('degrés chromatiques en classique : ♯VI, vii° (sensible, sans ♯), ♭II inchangé', () => {
        const x = flatOf([ch(9, 'minTriad'), ch(8, 'dimTriad'), ch(10, 'majTriad'), ch(6, 'majTriad')]); // Am G#° B♭ F#
        assert.deepEqual(lbl(x, { convention: 'jazz', mainQuality: 'aeolian' }), ['i', 'vii°', '♭II', 'VI']);
        assert.deepEqual(lbl(x, { convention: 'classic', mainQuality: 'aeolian' }), ['i', 'vii°', '♭II', '♯VI']);
    });
    test('dominantes secondaires : la cible suit la convention', () => {
        // la mineur ; C7 résout sur F (VI en classique, ♭VI en jazz) : V7/VI
        const f = flatOf([ch(9, 'minTriad'), ch(0, '7', { harmonicFunction: 'secondaryDominant' }), ch(5, 'maj7')]);
        assert.equal(H.harmonicFunctionLabel(f[1], f, 1, 0, null, 9, { convention: 'jazz', mainQuality: 'aeolian' }), 'V/♭VI');
        assert.equal(H.harmonicFunctionLabel(f[1], f, 1, 0, null, 9, { convention: 'classic', mainQuality: 'aeolian' }), 'V/VI');
    });
    test('fnLabel enregistré en jazz : relu en classique à l\'affichage, jamais modifié dans la grille', () => {
        const f = flatOf([ch(9, 'minTriad'), ch(7, '7', { fnLabel: '♭VII7' }), ch(4, '7', { fnLabel: 'V7' })]);
        const jazz = lbl(f, { convention: 'jazz', mainQuality: 'aeolian' }), classic = lbl(f, { convention: 'classic', mainQuality: 'aeolian' });
        assert.deepEqual(jazz, ['i', '♭VII7', 'V7']);
        assert.deepEqual(classic, ['i', 'VII7', 'V7']);
        assert.equal(f[1].fnLabel, '♭VII7');
    });
    test('fnLabel dans une tonalité majeure atteinte par modulation : inchangé', () => {
        const f = flatOf([ch(9, 'minTriad'), ch(0, 'maj7', { fnLabel: 'I de C', modKey: { root: 0, minor: false } }), ch(10, 'maj7', { fnLabel: '♭VII' })]);
        assert.deepEqual(lbl(f, { convention: 'classic', mainQuality: 'aeolian' }), ['i', 'I de C', '♭VII']);
        const g = flatOf([ch(9, 'minTriad'), ch(4, 'min7', { fnLabel: 'i (Em)', modKey: { root: 4, minor: true } }), ch(2, 'maj7', { fnLabel: '♭VII' })]);
        assert.equal(lbl(g, { convention: 'classic', mainQuality: 'aeolian' })[2], 'VII', 'tonalité Em mineure : ♭VII lu VII');
    });
    test('keyOverride : la tonalité mineure est donnée par keyMinor', () => {
        const m = ch(11, 'maj7'); // 8 demi-tons au-dessus de ré♭ (3) : ♭VI en jazz, VI en classique
        assert.equal(H.harmonicFunctionLabel(m, [], 0, 0, 3, 9, { convention: 'classic', keyMinor: true }), 'VI');
        assert.equal(H.harmonicFunctionLabel(m, [], 0, 0, 3, 9, { convention: 'classic', keyMinor: false }), '♭VI');
        assert.equal(H.harmonicFunctionLabel(m, [], 0, 0, 3, 9, { convention: 'classic' }), '♭VI');
        assert.equal(H.harmonicFunctionLabel(m, [], 0, 0, 3, 9, { convention: 'jazz', keyMinor: true }), '♭VI');
    });
    test('localKeyInfo / localKeyMinor : marqueur ou mode de la grille', () => {
        const f = flatOf([ch(0, 'maj7'), ch(3, 'maj7', { modKey: { root: 3, minor: false } }), ch(0, 'maj7', { modKey: { root: 9, minor: true } })]);
        assert.equal(H.localKeyInfo(f, 0).marked, false);
        assert.equal(H.localKeyInfo(f, 1).marked, true);
        assert.deepEqual(H.localKey(f, 0), { root: 0, minor: false }, 'localKey inchangé');
        assert.equal(H.localKeyMinor(f, 0, 0, false, 0, 'aeolian'), true, 'repli : mode de la grille');
        assert.equal(H.localKeyMinor(f, 0, 0, false, 0, 'ionian'), false);
        assert.equal(H.localKeyMinor(f, 1, 0, false, 0, 'aeolian'), false, 'marqueur majeur dans une grille mineure');
        assert.equal(H.localKeyMinor(f, 2, 0, false, 0, 'ionian'), true, 'marqueur mineur dans une grille majeure');
    });
    test('displayAlternatives : étiquette et description relues en classique, valeur enregistrée intacte', () => {
        const g = H.functionAlternatives(ch(7, '7'), null, 9, { mainKey: 9, rootLabels: LABELS }); // G7 en la mineur (r = 10)
        const jz = H.displayAlternatives(g, 'jazz', true), cl = H.displayAlternatives(g, 'classic', true), cm = H.displayAlternatives(g, 'classic', false);
        const flat = (d) => d.flatMap(x => x.items);
        flat(jz).forEach(i => { assert.equal(i.shownLabel, i.label); assert.equal(i.shownDesc, i.desc); });
        flat(cm).forEach(i => { assert.equal(i.shownLabel, i.label, 'majeur : inchangé'); });
        flat(cl).forEach(i => { assert.ok(!/♭VII|♭VI\b|♭III/.test(i.shownLabel), i.shownLabel); assert.equal(typeof i.label, 'string'); });
        const labelsCl = flat(cl).map(i => i.shownLabel), labelsJz = flat(cl).map(i => i.label);
        assert.ok(labelsJz.includes('♭VII7/I') === false);
        assert.equal(labelsCl.length, labelsJz.length);
    });
    test('displayAlternatives : degré lu en classique pour un accord majeur sur ♭VII', () => {
        const g = H.functionAlternatives(ch(7, 'maj7'), null, 9, { mainKey: 9, rootLabels: LABELS });
        const item = g.flatMap(x => x.items).find(i => i.label === '♭VII');
        assert.ok(item);
        const shown = H.displayAlternatives(g, 'classic', true).flatMap(x => x.items).find(i => i.label === '♭VII');
        assert.equal(shown.shownLabel, 'VII');
    });
});

describe('lectures : passage au mode parallèle (même tonique)', () => {
    const SC = require('./generation.js').FN_MODE_SCALES;
    const alt = (c, key, scale) => H.functionAlternatives(c, null, key, { mainKey: key, rootLabels: LABELS, scale });
    const find = (g, label) => g.flatMap(x => x.items).find(i => i.label === label);
    test('Cm en do majeur : « i » (emprunt) ET « i (Cm) » (modulation vers le mineur parallèle)', () => {
        const g = alt(ch(0, 'minTriad'), 0, SC.ionian);
        assert.equal(g.find(x => x.title === 'Degré').items[0].label, 'i');
        assert.equal(g.find(x => x.title === 'Degré').items[0].mod, null, 'le degré seul ne change pas de tonalité');
        const m = find(g, 'i (Cm)');
        assert.ok(m, 'lecture proposée');
        assert.deepEqual(m.mod, { root: 0, minor: true });
    });
    test('C en do mineur : « I de C » (majeur parallèle)', () => {
        const m = find(alt(ch(0, 'majTriad'), 0, SC.aeolian), 'I de C');
        assert.ok(m);
        assert.deepEqual(m.mod, { root: 0, minor: false });
    });
    test('pas de doublon quand la tonalité a déjà cette tierce', () => {
        assert.equal(find(alt(ch(0, 'minTriad'), 0, SC.aeolian), 'i (Cm)'), undefined);
        assert.equal(find(alt(ch(0, 'majTriad'), 0, SC.ionian), 'I de C'), undefined);
    });
    test('gamme inconnue : on propose toujours le passage au mode parallèle', () => {
        assert.ok(find(alt(ch(0, 'minTriad'), 0, undefined), 'i (Cm)'));
        assert.ok(find(alt(ch(0, 'majTriad'), 0, undefined), 'I de C'));
    });
    test('ailleurs que sur la tonique : inchangé (modulation vers la tonalité de l\'accord)', () => {
        assert.deepEqual(find(alt(ch(2, 'minTriad'), 0, SC.ionian), 'i (Dm)').mod, { root: 2, minor: true });
    });
    test('après le marqueur « i (Cm) », les accords suivants se lisent en do mineur', () => {
        const f = flatOf([ch(0, 'maj7'), ch(0, 'min7', { fnLabel: 'i (Cm)', modKey: { root: 0, minor: true } }), ch(3, 'maj7'), ch(8, 'maj7')]);
        const lb = (conv) => f.map((m, i) => H.harmonicFunctionLabel(m, f, i, 0, null, 0, { convention: conv, mainQuality: 'ionian' }));
        assert.deepEqual(lb('classic'), ['I', 'i (Cm)', 'III', 'VI']);
        assert.deepEqual(lb('jazz'), ['I', 'i (Cm)', '♭III', '♭VI']);
    });
});

describe('lectures : accord diatonique ou emprunté selon la gamme de la tonalité', () => {
    const SC = require('./generation.js').FN_MODE_SCALES;
    const degreeDesc = (chord, key, scale) => {
        const g = H.functionAlternatives(chord, null, key, { mainKey: key, rootLabels: LABELS, scale });
        return g.find(x => x.title === 'Degré').items[0];
    };
    test('la mineur : G, C, F sont diatoniques (plus d\'« emprunt »), Dm aussi', () => {
        for (const [root, word] of [[7, 'Sous-tonique'], [0, 'Médiante'], [5, 'Sus-dominante']]) {
            const d = degreeDesc(ch(root, 'majTriad'), 9, SC.aeolian);
            assert.ok(d.desc.startsWith(word) && !/mprunt/.test(d.desc), `${root} : ${d.desc}`);
        }
        assert.match(degreeDesc(ch(2, 'minTriad'), 9, SC.aeolian).desc, /diatonique/);
        assert.equal(degreeDesc(ch(7, 'majTriad'), 9, SC.aeolian).label, '♭VII', 'le libellé enregistré ne change pas');
    });
    test('do majeur : les mêmes accords sont bien des emprunts au mineur parallèle', () => {
        for (const root of [3, 8, 10]) assert.match(degreeDesc(ch(root, 'majTriad'), 0, SC.ionian).desc, /mprunt/);
        assert.match(degreeDesc(ch(5, 'minTriad'), 0, SC.ionian).desc, /mprunt/);
    });
    test('sans gamme fournie : texte d\'origine ; mixolydien : ♭VII est diatonique, mais un iv mineur reste un emprunt', () => {
        assert.match(degreeDesc(ch(7, 'majTriad'), 9, undefined).desc, /mprunt/);
        assert.match(degreeDesc(ch(10, 'majTriad'), 0, SC.mixolydian).desc, /diatonique/);
        assert.match(degreeDesc(ch(5, 'minTriad'), 0, SC.mixolydian).desc, /mprunt/);
    });
    test('localKeyScale : mode de la grille, ou majeure / mineure naturelle après une modulation', () => {
        const f = flatOf([ch(0, 'maj7'), ch(3, 'maj7', { modKey: { root: 3, minor: false } }), ch(0, 'maj7', { modKey: { root: 9, minor: true } })]);
        assert.deepEqual(H.localKeyScale(f, 0, 0, false, 0, 'dorian'), SC.dorian);
        assert.deepEqual(H.localKeyScale(f, 1, 0, false, 0, 'aeolian'), SC.ionian);
        assert.deepEqual(H.localKeyScale(f, 2, 0, false, 0, 'ionian'), SC.aeolian);
        assert.deepEqual(H.localKeyScale(f, 0, 0, false, 0, 'inconnu'), SC.ionian);
    });
});

describe('followingChords : accords différents qui suivent', () => {
    const f = (chords) => flatOf(chords);
    test('saute les mesures où le même accord se répète', () => {
        const flat = f([ch(2, '7'), ch(2, '7'), ch(7, '7'), ch(7, '7'), ch(0, '7'), ch(5, '7')]);
        assert.deepEqual(H.followingChords(flat, 0, 0, 2), [{ rootIndex: 7, chordId: '7' }, { rootIndex: 0, chordId: '7' }]);
        assert.deepEqual(H.followingChords(flat, 1, 0, 3).map(c => c.rootIndex), [7, 0, 5]);
    });
    test('mesure à deux accords : la 2e moitié compte, et on part d\'elle quand half = 1', () => {
        const flat = f([ch(2, '7', { split: ch(7, '7') }), ch(0, '7')]);
        assert.deepEqual(H.followingChords(flat, 0, 0, 2).map(c => c.rootIndex), [7, 0]);
        assert.deepEqual(H.followingChords(flat, 0, 1, 2).map(c => c.rootIndex), [0]);
    });
    test('fin de grille et entrées invalides : liste vide', () => {
        const flat = f([ch(2, '7')]);
        assert.deepEqual(H.followingChords(flat, 0, 0, 2), []);
        assert.deepEqual(H.followingChords([], 0), []);
        assert.deepEqual(H.followingChords(null, 0), []);
        assert.deepEqual(H.followingChords(flat, 5), []);
    });
});
