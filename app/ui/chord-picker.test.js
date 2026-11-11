// Tests du sélecteur d'accord de l'Entraînement (ui/chord-picker.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { chordPickerHtml, chordPickerBuild, chordPickerParseRoot } = require('./chord-picker.js');
const { editorHtml } = require('./measure-editor.js');
const T = require('../theory.js');
const H = require('../grid/harmony.js');

const rootLabels = T.ROOT_NAMES_FLAT.slice();
const jazz = (id) => H.jazzChordNotation(id);
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const pick = (o = {}) => chordPickerHtml({ rootIndex: 0, chordId: 'maj7', mode: 'build', rootLabels, jazz, findChordObj, ...o });
const count = (s, re) => (s.match(re) || []).length;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

describe('fondamentale : lecture de la valeur d\'une touche', () => {
    test('touche blanche, dièse, bémol', () => {
        assert.deepEqual(chordPickerParseRoot('7'), { pc: 7, acc: null });
        assert.deepEqual(chordPickerParseRoot('1s'), { pc: 1, acc: 's' });
        assert.deepEqual(chordPickerParseRoot('10f'), { pc: 10, acc: 'f' });
    });
    test('valeur inutilisable → null', () => {
        ['', 'x', '12', '3z', null, undefined, '-1'].forEach(v => assert.equal(chordPickerParseRoot(v), null, String(v)));
    });
});

describe('mode Construire : calcul du nouvel accord', () => {
    test('tierce : maj7 → mineure donne mmaj7 (catalogue)', () => {
        assert.equal(chordPickerBuild('maj7', 'third', 'm'), 'mmaj7');
    });
    test('septième : maj7 → 7 (dominante), m7 ← m + b7', () => {
        assert.equal(chordPickerBuild('maj7', 'sev', 'b7'), '7');
        assert.equal(chordPickerBuild('minTriad', 'sev', 'b7'), 'm7');
        assert.equal(chordPickerBuild('maj7', 'sev', ''), 'majTriad');
    });
    test('°7 impose tierce mineure et quinte ♭5 (dim7)', () => {
        assert.equal(chordPickerBuild('maj7', 'sev', 'bb7'), 'dim7');
    });
    test('quinte : m7 → ♭5 donne m7b5', () => {
        assert.equal(chordPickerBuild('m7', 'fifth', 'b5'), 'm7b5');
    });
    test('tensions : ajout, retrait, et choc d\'un demi-ton', () => {
        assert.equal(chordPickerBuild('7', 'ext', 'b9'), '7b9');
        assert.equal(chordPickerBuild('7b9', 'ext', 'b9'), '7');
        assert.equal(chordPickerBuild('7b9', 'ext', '9'), '9');           // 9 chasse ♭9
        assert.equal(chordPickerBuild('7', 'ext', 's11'), 'x:M:P:b7:s11');
    });
    test('un accord hors catalogue reçoit un identifiant composé que la théorie retrouve', () => {
        const id = chordPickerBuild('7', 'ext', 's11');
        const co = T.lookupChord(id);
        assert.ok(co && co.notes.length === 5 && co.scales.length > 0);
        assert.equal(chordPickerBuild(id, 'ext', 's11'), '7');
    });
    test('tension inconnue ou action inconnue → null', () => {
        assert.equal(chordPickerBuild('7', 'ext', 'zz'), null);
        assert.equal(chordPickerBuild('7', 'bass', '3'), null);
    });
    test('partir d\'un accord inconnu retombe sur la triade majeure', () => {
        assert.equal(chordPickerBuild('???', 'sev', 'b7'), '7');
    });
});

describe('affichage', () => {
    test('barre de mode : le mode actif est allumé', () => {
        assert.ok(/is-on" data-act="mode" data-v="build"/.test(pick({ mode: 'build' })));
        assert.ok(/is-on" data-act="mode" data-v="cat"/.test(pick({ mode: 'cat' })));
    });
    test('Construire : clavier à 17 touches, tierce / quinte / septième / tensions, notes', () => {
        const h = pick();
        assert.equal(count(h, /data-act="root"/g), 17);
        assert.equal(count(h, /data-act="third"/g), 4);
        assert.equal(count(h, /data-act="fifth"/g), 3);
        assert.equal(count(h, /data-act="sev"/g), 5);
        assert.equal(count(h, /data-act="ext"/g), 7);
        assert.equal(count(h, /data-act="chord"/g), 12);
        assert.ok(h.includes('jm-kb') && h.includes('Notes :'));
        assert.ok(!h.includes('data-act="chordsel"'));
    });
    test('Catalogue : liste de fondamentales, 15 accords courants et menu de tous les accords', () => {
        const h = pick({ mode: 'cat' });
        assert.equal(count(h, /data-act="root"/g), 17);
        assert.equal(count(h, /data-act="chord"/g), 15);
        assert.ok(h.includes('data-act="chordsel"'));
        const total = Object.values(T.chordTypes).flat().length;
        assert.equal(count(h, /<option value="[^"]+">/g), total);
        assert.ok(!h.includes('jm-kb'));
    });
    test('rien de ce qui est propre à la mesure du Jam : durée, degrés, gamme, basse, reprises, navigation', () => {
        ['build', 'cat'].forEach(mode => {
            const h = pick({ mode });
            ['dur', 'half', 'degree', 'degmode', 'scale', 'bass', 'fold', 'rp-start', 'prev', 'next', 'del', 'close', 'cancel'].forEach(a =>
                assert.ok(!h.includes(`data-act="${a}"`), `${mode} : ${a}`));
        });
    });
    test('l\'accord choisi et la fondamentale choisie sont allumés', () => {
        const h = pick({ rootIndex: 7, chordId: '7' });
        assert.ok(/is-on" data-act="chord" data-v="7"/.test(h));
        assert.ok(/is-on" data-act="root" data-v="7"/.test(h));
        assert.equal(count(h, /is-on" data-act="root"/g), 1);
        assert.ok(/is-on" data-act="third" data-v="M"/.test(h) && /is-on" data-act="sev" data-v="b7"/.test(h) && /is-on" data-act="fifth" data-v="P"/.test(h));
    });
    test('orthographe : seule la touche noire au nom courant est allumée', () => {
        const flat = pick({ rootIndex: 1, rootLabels: T.ROOT_NAMES_FLAT.slice() });
        assert.ok(/is-on" data-act="root" data-v="1f"/.test(flat) && !/is-on" data-act="root" data-v="1s"/.test(flat));
        const sharp = pick({ rootIndex: 1, rootLabels: T.ROOT_NAMES_SHARP.slice() });
        assert.ok(/is-on" data-act="root" data-v="1s"/.test(sharp) && !/is-on" data-act="root" data-v="1f"/.test(sharp));
    });
    test('un accord composé allume les bonnes cases (tension 11♯ de 7)', () => {
        const h = pick({ chordId: 'x:M:P:b7:s11' });
        assert.ok(/is-on" data-act="ext" data-v="s11"/.test(h));
        assert.ok(/is-on" data-act="sev" data-v="b7"/.test(h));
        assert.ok(!/data-act="chord" data-v="x:/.test(h));   // pas de raccourci pour lui
    });
    test('une tension déjà contenue dans l\'accord est grisée (13 sur une sixte)', () => {
        const h = pick({ chordId: '6' });
        assert.ok(/jm-off[^"]*" data-act="ext" data-v="13"/.test(h));
    });
    test('7alt : rappel sur les notes', () => {
        assert.ok(pick({ chordId: '7alt' }).includes('7alt = 7'));
        assert.ok(!pick({ chordId: '7' }).includes('7alt = 7'));
    });
});

describe('même sélecteur que l\'éditeur de mesure du Jam', () => {
    // Mêmes blocs, au caractère près, que ceux de l'éditeur de mesure (sans accord suggéré par la grille)
    const jamView = (mode, chordId, rootIndex) => {
        const step = { rootIndex, chordId, scaleId: 'ionian', measures: 1 };
        return {
            m: { measureNumber: 1, measureInStep: 1, ...step }, step, isHalf: false, cur: step, half: 0, mode, isFolded: () => true, rootLabels,
            degrees: [], symbol: () => '', jazz, findChordObj, halfLabelText: () => '', halfTitleText: () => ''
        };
    };
    const blocks = (h) => [...h.matchAll(/<div class="jm-(?:kb|seg|chords|mode|row)[^"]*">[\s\S]*?<\/div>(?=\s*<(?:div|\/div|select))/g)].map(m => norm(m[0]));
    for (const mode of ['build', 'cat']) {
        for (const [rootIndex, chordId] of [[0, 'maj7'], [7, '7'], [3, 'x:M:P:b7:s11'], [1, 'm7b5']]) {
            test(`${mode} · ${rootIndex}:${chordId}`, () => {
                const jam = blocks(editorHtml(jamView(mode, chordId, rootIndex)));
                const mine = blocks(pick({ mode, chordId, rootIndex }));
                assert.ok(mine.length >= 3, `blocs trouvés : ${mine.length}`);
                mine.forEach(b => assert.ok(jam.includes(b), `absent du Jam : ${b.slice(0, 90)}`));
            });
        }
    }
});
