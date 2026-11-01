// Tests du pop-up d'édition de mesure (ui/measure-editor.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { editorHtml } = require('./measure-editor.js');
const T = require('../theory.js');
const H = require('../grid/harmony.js');

const rootLabels = T.ROOT_NAMES_FLAT.slice();
const flatten = (grid) => { const out = []; grid.forEach((st, stepIndex) => { for (let k = 1; k <= st.measures; k++) out.push({ ...st, stepIndex, measureInStep: k, measureNumber: out.length + 1 }); }); return out; };
function view(grid, { measureNumber = 1, half = 0, mode = 'build', folded = () => true, labels = rootLabels } = {}) {
    const m = flatten(grid).find(x => x.measureNumber === measureNumber);
    const step = grid[m.stepIndex];
    const isHalf = !!(step.split && step.measures === 1);
    const cur = (half === 1 && isHalf) ? step.split : step;
    return {
        m, step, isHalf, cur, half, mode, isFolded: folded, rootLabels: labels,
        degrees: [{ label: 'Imaj7', rootIndex: 0, chordId: 'maj7' }, { label: 'IIm7', rootIndex: 2, chordId: 'm7' }],
        symbol: (c) => `${c.rootIndex}:${c.chordId}`, jazz: (id) => H.jazzChordNotation(id),
        findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
        halfLabelText: (h) => (h === 0 ? 'Temps 1–2' : 'Temps 3–4'), halfTitleText: () => 'Deux accords'
    };
}
const blk = (o = {}) => ({ rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 1, ...o });
const count = (s, re) => (s.match(re) || []).length;

describe('degrés de la tonalité : triades ou septièmes', () => {
    test('la bascule propose 7es et Triades ; le mode actif est allumé', () => {
        const a = editorHtml(view([blk()]));
        assert.ok(/is-on" data-act="degmode" data-v="7"/.test(a));
        assert.ok(a.includes('data-act="degmode" data-v="3"') && !/is-on" data-act="degmode" data-v="3"/.test(a));
        const b = editorHtml({ ...view([blk()]), degreeTriads: true });
        assert.ok(/is-on" data-act="degmode" data-v="3"/.test(b));
        assert.ok(!/is-on" data-act="degmode" data-v="7"/.test(b));
    });
});

describe('structure générale', () => {
    test('en-tête avec numéro de mesure et symbole, pied avec navigation', () => {
        const h = editorHtml(view([blk({ measures: 3 })], { measureNumber: 2 }));
        assert.ok(h.includes('Mesure 2 · 0:maj7'));
        ['cancel', 'prev', 'next', 'ins', 'del', 'close'].forEach(a => assert.ok(h.includes(`data-act="${a}"`), a));
        assert.ok(h.includes('jm-hint'));
    });
    test('barre de mode : le mode actif est allumé', () => {
        const b = editorHtml(view([blk()], { mode: 'build' }));
        assert.ok(/is-on" data-act="mode" data-v="build"/.test(b));
        const c = editorHtml(view([blk()], { mode: 'cat' }));
        assert.ok(/is-on" data-act="mode" data-v="cat"/.test(c));
    });
    test('mode Construire : clavier, tierce / quinte / septième / tensions ; mode Catalogue : liste et menu', () => {
        const b = editorHtml(view([blk()], { mode: 'build' }));
        ['third', 'fifth', 'sev', 'ext'].forEach(a => assert.ok(b.includes(`data-act="${a}"`), a));
        assert.ok(b.includes('jm-kb') && !b.includes('chordsel'));
        const c = editorHtml(view([blk()], { mode: 'cat' }));
        assert.ok(c.includes('data-act="chordsel"') && !c.includes('jm-kb') && !c.includes('data-act="third"'));
        assert.equal(count(c, /<option value=/g), Object.values(T.chordTypes).flat().length + 1);
    });
});

describe('durée et moitiés', () => {
    test('un accord : pas de sélecteur de moitié', () => {
        const h = editorHtml(view([blk()]));
        assert.ok(/is-on" data-act="dur" data-v="1"/.test(h));
        assert.ok(!h.includes('data-act="half"'));
    });
    test('deux accords : sélecteur des moitiés, moitié éditée allumée, symboles de chaque accord', () => {
        const g = [blk({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        const h = editorHtml(view(g, { half: 1 }));
        assert.ok(/is-on" data-act="dur" data-v="half"/.test(h));
        assert.ok(/is-on" data-act="half" data-v="1"/.test(h) && !/is-on" data-act="half" data-v="0"/.test(h));
        assert.ok(h.includes('<small>0:maj7</small>') && h.includes('<small>7:7</small>'));
        assert.ok(h.includes('Mesure 1 · 7:7'));
    });
});

describe('fondamentale, accord, gamme', () => {
    test('catalogue : une seule fondamentale allumée, selon le nom choisi (♯ ou ♭)', () => {
        const h = editorHtml(view([blk({ rootIndex: 1, chordId: 'm7' })], { mode: 'cat' }));
        const on = [...h.matchAll(/is-on" data-act="root" data-v="([^"]+)"/g)].map(x => x[1]);
        assert.deepEqual(on, ['1f']);
        const sharp = editorHtml(view([blk({ rootIndex: 1, chordId: 'm7' })], { mode: 'cat', labels: T.ROOT_NAMES_SHARP.slice() }));
        assert.deepEqual([...sharp.matchAll(/is-on" data-act="root" data-v="([^"]+)"/g)].map(x => x[1]), ['1s']);
    });
    test('clavier (Construire) : 10 touches noires et 7 blanches', () => {
        const h = editorHtml(view([blk()], { mode: 'build' }));
        assert.equal(count(h, /jm-blk/g), 10);
        assert.equal(count(h, /data-act="root"/g), 17);
    });
    test('l\'accord courant est allumé dans les raccourcis', () => {
        const h = editorHtml(view([blk({ chordId: 'm7' })], { mode: 'cat' }));
        assert.ok(/is-on" data-act="chord" data-v="m7"/.test(h));
    });
    test('gammes proposées pour l\'accord, la gamme courante allumée (section dépliée)', () => {
        const h = editorHtml(view([blk({ chordId: 'm7', scaleId: 'dorian' })], { folded: () => false }));
        assert.ok(/is-on jm-scale" data-act="scale" data-v="dorian"/.test(h) || /jm-scale is-on" data-act="scale" data-v="dorian"/.test(h));
        assert.ok(count(h, /data-act="scale"/g) >= 2);
    });
    test('gammes : section repliée par défaut (flèche ▸), le nom de la gamme courante reste visible en résumé', () => {
        for (const mode of ['build', 'cat']) {
            const h = editorHtml(view([blk({ chordId: 'm7', scaleId: 'dorian' })], { mode, folded: () => true }));
            assert.equal(count(h, /data-act="scale"/g), 0, mode);
            assert.ok(h.includes('data-act="fold" data-v="scale" aria-expanded="false"'), mode);
            assert.ok(h.includes(`<em>${T.scalesDb.dorian.name}</em>`), mode);
            assert.ok(h.includes('▸'), mode);
        }
        const open = editorHtml(view([blk({ chordId: 'm7', scaleId: 'dorian' })], { folded: (k) => k !== 'scale' }));
        assert.ok(open.includes('data-act="fold" data-v="scale" aria-expanded="true"') && count(open, /data-act="scale"/g) >= 2);
    });
    test('degrés de la tonalité : un chip par degré, allumé si c\'est l\'accord courant', () => {
        const h = editorHtml(view([blk()]));
        assert.equal(count(h, /data-act="degree"/g), 2);
        assert.ok(/is-on jm-deg" data-act="degree" data-i="0"/.test(h) || /jm-deg is-on" data-act="degree" data-i="0"/.test(h));
        assert.ok(h.includes('Raccourci clavier : 2'));
    });
    test('notes de l\'accord épelées en mode Construire, avertissement pour 7alt', () => {
        const h = editorHtml(view([blk({ chordId: 'maj7' })]));
        assert.ok(/Notes : <b>C E G B<\/b>/.test(h));
        assert.ok(editorHtml(view([blk({ chordId: '7alt' })])).includes('7alt = 7♭5'));
    });
});

describe('basse', () => {
    const baseView = (o) => view([blk({ rootIndex: 0, chordId: 'maj7', ...o })], { mode: 'cat' });
    test('12 notes de basse ; la fondamentale est le choix par défaut', () => {
        const h = editorHtml(baseView());
        assert.equal(count(h, /data-act="bass"/g), 12);
        assert.ok(/is-on jm-ct" data-act="bass" data-v="0"/.test(h) || /jm-ct is-on" data-act="bass" data-v="0"/.test(h));
        assert.ok(h.includes(`Fondamentale : pas d'accord sur basse`));
    });
    test('notes de l\'accord cerclées avec leur rôle, notes étrangères signalées', () => {
        const h = editorHtml(baseView());
        assert.equal(count(h, /jm-ct/g), 4);
        assert.ok(h.includes('<small>R</small>') && h.includes('<small>3</small>') && h.includes('<small>5</small>') && h.includes('<small>7</small>'));
        assert.ok(h.includes('basse étrangère à l\'accord'));
    });
    test('basse choisie : allumée à la place de la fondamentale', () => {
        const h = editorHtml(baseView({ bassRootIndex: 4 }));
        assert.ok(/is-on jm-ct" data-act="bass" data-v="4"/.test(h) || /jm-ct is-on" data-act="bass" data-v="4"/.test(h));
        assert.ok(!/is-on[^>]*data-v="0"[^>]*data-act="bass"/.test(h));
    });
});

describe('reprises et sections repliables', () => {
    const g = [blk({ measures: 2, repeatStart: true, repeatEnd: 3, volta: 2 })];
    test('marques : début sur la 1re mesure du bloc, fin ×N sur la dernière, fin 1re/2e', () => {
        const first = editorHtml(view(g, { measureNumber: 1, mode: 'cat' }));
        assert.ok(/is-on" data-act="rp-start"/.test(first) && !/is-on" data-act="rp-end"/.test(first));
        const last = editorHtml(view(g, { measureNumber: 2, mode: 'cat' }));
        assert.ok(last.includes(':| Fin ×3') && /is-on" data-act="rp-end"/.test(last) && !/is-on" data-act="rp-start"/.test(last));
        assert.ok(/is-on" data-act="rp-v2"/.test(last) && !/is-on" data-act="rp-v1"/.test(last));
    });
    test('mode Construire : sections Basse et Reprises repliées / dépliées', () => {
        const closed = editorHtml(view(g, { mode: 'build', folded: () => true }));
        assert.ok(closed.includes('aria-expanded="false"') && !closed.includes('data-act="bass"') && !closed.includes('data-act="rp-start"'));
        const open = editorHtml(view(g, { mode: 'build', folded: () => false }));
        assert.ok(open.includes('aria-expanded="true"') && open.includes('data-act="bass"') && open.includes('data-act="rp-start"'));
    });
    test('résumé d\'une section repliée : basse choisie, marques de reprise', () => {
        const h = editorHtml(view([blk({ measures: 1, bassRootIndex: 7, repeatStart: true, repeatEnd: 2 })], { mode: 'build', folded: () => true }));
        assert.ok(h.includes('<em>/G</em>'));
        assert.ok(h.includes('<em>|: :|×2</em>'));
    });
});


describe('choix d\'accords sur 2 lignes et accords déjà utilisés dans la grille', () => {
    const chordChips = (h) => (h.match(/<div class="jm-chords[^"]*">([\s\S]*?)<\/div>/) || [, ''])[1];
    const ids = (h) => [...chordChips(h).matchAll(/data-act="chord" data-v="([^"]+)"/g)].map(x => x[1]);
    const withSugg = (g, suggestions, opts = {}) => editorHtml({ ...view(g, opts), suggestions });

    test('mode Construire : les 12 raccourcis dans une grille de 7 colonnes (2 lignes)', () => {
        const h = editorHtml(view([blk()]));
        assert.ok(h.includes('<div class="jm-chords">'));
        assert.equal(ids(h).length, 12);
    });
    test('un accord déjà utilisé avec cette fondamentale passe en premier, sans doublon, et est repéré', () => {
        const h = withSugg([blk({ rootIndex: 1, chordId: 'm7' })], ['7alt', 'm9']);
        assert.deepEqual(ids(h).slice(0, 3), ['7alt', 'm9', 'majTriad']);
        assert.equal(ids(h).length, 12);   // les deux suggestions étaient déjà des raccourcis : elles passent devant, rien n'est ajouté
        assert.equal(new Set(ids(h)).size, ids(h).length);
        assert.ok(ids(h).length <= 14);
        assert.equal(count(h, /jm-mem/g), 2);
        assert.ok(/title="Db7alt : déjà utilisé dans cette grille"/.test(h));
    });
    test('suggestion absente des raccourcis : ajoutée en tête, total limité à 2 lignes de 7', () => {
        const h = withSugg([blk({ rootIndex: 1, chordId: 'm7' })], ['7b9', 'maj7sharp11', 'm11']);
        assert.deepEqual(ids(h).slice(0, 2), ['7b9', 'maj7sharp11']);
        assert.equal(ids(h).length, 14);
    });
    test('sans suggestion : rien n\'est marqué', () => {
        assert.equal(count(editorHtml(view([blk()])), /jm-mem/g), 0);
        assert.equal(count(withSugg([blk()], []), /jm-mem/g), 0);
    });
    test('mode Catalogue : grille de 8 colonnes, une suggestion en tête, 16 choix au plus', () => {
        const h = withSugg([blk({ rootIndex: 1, chordId: 'm7' })], ['7alt', '9'], { mode: 'cat' });
        assert.ok(h.includes('<div class="jm-chords jm-chords-8">'));
        assert.equal(ids(h)[0], '7alt');
        assert.ok(ids(h).length <= 16);
        assert.equal(count(h, /jm-mem/g), 1);
    });
});

describe('boutons Tierce, Quinte, Septième réduits', () => {
    test('les trois rangées portent la classe jm-seg-sm, pas les tensions', () => {
        const h = editorHtml(view([blk()]));
        assert.equal(count(h, /class="jm-seg jm-seg-sm"/g), 3);
        assert.equal(count(h, /class="jm-seg"/g), 1);
    });
});
