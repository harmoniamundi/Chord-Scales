// Tests de la partie de la portée éditable qui se calcule sans navigateur (ui/staff-editor.js) : touches du clavier, barre d'outils,
// note la plus proche. Le dessin VexFlow et les clics sont vérifiés dans le navigateur (voir TESTS.md). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./staff-editor.js');
const S = require('./staff-notes.js');
const F = require('../grid/grid-format.js');

describe('nseKeyAction : touche → action', () => {
    test('flèches : hauteur (Maj = octave) et déplacement de la sélection', () => {
        assert.deepEqual(E.nseKeyAction('ArrowUp'), { type: 'shift', steps: 1 });
        assert.deepEqual(E.nseKeyAction('ArrowDown'), { type: 'shift', steps: -1 });
        assert.deepEqual(E.nseKeyAction('ArrowUp', { shift: true }), { type: 'shift', steps: 7 });
        assert.deepEqual(E.nseKeyAction('ArrowDown', { shift: true }), { type: 'shift', steps: -7 });
        assert.deepEqual(E.nseKeyAction('ArrowLeft'), { type: 'move', delta: -1 });
        assert.deepEqual(E.nseKeyAction('ArrowRight'), { type: 'move', delta: 1 });
    });
    test('Suppr., Retour arrière, Échap', () => {
        assert.deepEqual(E.nseKeyAction('Delete'), { type: 'delete' });
        assert.deepEqual(E.nseKeyAction('Backspace'), { type: 'delete' });
        assert.deepEqual(E.nseKeyAction('Escape'), { type: 'deselect' });
    });
    test('lettres a-g (majuscules aussi) : changer la lettre de la note', () => {
        assert.deepEqual(E.nseKeyAction('c'), { type: 'letter', letter: 'c' });
        assert.deepEqual(E.nseKeyAction('G'), { type: 'letter', letter: 'g' });
        assert.equal(E.nseKeyAction('h'), null);
    });
    test('altérations, point, triolet (tuplet), silence, durées 1 à 5', () => {
        assert.deepEqual(E.nseKeyAction('#'), { type: 'alter', delta: 1 });
        assert.deepEqual(E.nseKeyAction('-'), { type: 'alter', delta: -1 });
        assert.deepEqual(E.nseKeyAction('n'), { type: 'alter', delta: null });
        assert.deepEqual(E.nseKeyAction('.'), { type: 'mod', mod: 'dot' });
        assert.deepEqual(E.nseKeyAction('t'), { type: 'tuplet', n: 3 });
        assert.deepEqual(E.nseKeyAction('r'), { type: 'mod', mod: 'rest' });
        assert.deepEqual(['1', '2', '3', '4', '5'].map(k => E.nseKeyAction(k).dur), ['16', '8', 'q', 'h', 'w']);
        assert.equal(E.nseKeyAction('6'), null);
    });
    test('⌘Z / Ctrl+Z annule ; les autres raccourcis ⌘ ou Ctrl ne sont pas pour la portée', () => {
        assert.deepEqual(E.nseKeyAction('z', { meta: true }), { type: 'undo' });
        assert.deepEqual(E.nseKeyAction('z', { ctrl: true }), { type: 'undo' });
        assert.equal(E.nseKeyAction('c', { meta: true }), null);
        assert.equal(E.nseKeyAction('b', { ctrl: true }), null);
    });
    test('toute autre touche est laissée à la saisie du texte', () => {
        for (const k of ['Enter', ' ', 'x', 'Tab', 'Home', 'a1']) assert.equal(E.nseKeyAction(k), null, k);
    });
});

describe('nseNearestLetter : lettre demandée à l’octave la plus proche', () => {
    const near = (p, l, ks = 0) => S.formatStaff({ clef: 't', meter: '4/4', ks, ev: [{ d: 'q', dot: false, tu: 0, p: E.nseNearestLetter(p, l, ks) }] }).split(';')[1];
    test('sans changer d’octave quand c’est le plus proche', () => {
        assert.equal(near({ l: 'c', o: 4, a: 0 }, 'e'), 'q:e4');
        assert.equal(near({ l: 'e', o: 4, a: 0 }, 'a'), 'q:a4'); // la3 est à 4 degrés de mi4, la4 à 3 : la4 est plus proche
    });
    test('passe à l’octave voisine quand elle est plus proche', () => {
        assert.equal(near({ l: 'b', o: 4, a: 0 }, 'c'), 'q:c5');
        assert.equal(near({ l: 'c', o: 4, a: 0 }, 'b'), 'q:b3');
    });
    test('prend l’altération de l’armure', () => {
        assert.equal(near({ l: 'e', o: 4, a: 0 }, 'f', 1), 'q:f#4');
    });
});

describe('nseToolsHtml : barre d’outils de la portée', () => {
    const html = E.nseToolsHtml(S.parseStaff('b,6/8,-2;q:c3'));
    test('durées, point, triolet, silence, altérations et actions', () => {
        for (const needle of ['data-dur="w"', 'data-dur="h"', 'data-dur="q"', 'data-dur="8"', 'data-dur="16"', 'data-mod="dot"', 'data-set="tuplet"', 'data-mod="rest"', 'data-act="pickup"', 'data-set="bpm"', 'data-set="swing"',
            'data-alt="1"', 'data-alt="-1"', 'data-alt="0"', 'data-act="play"', 'data-act="undo"', 'data-act="del"', 'data-act="copy"', 'data-act="paste"', 'data-act="clear"', 'data-act="remove"', 'data-act="exit"']) {
            assert.ok(html.includes(needle), needle);
        }
    });
    test('tuplet : choix de 2 à 9, celui de la portée est coché ; tempo (vide = tempo de la jam) et swing', () => {
        const sel = (h, key) => h.slice(h.indexOf(`data-set="${key}"`), h.indexOf('</select>', h.indexOf(`data-set="${key}"`)));
        const tup = sel(E.nseToolsHtml(S.parseStaff('t,4/4,0;q:c4'), { d: 'q', dot: false, tu: 5, rest: false }), 'tuplet');
        for (const n of [2, 3, 4, 5, 6, 7, 9]) assert.ok(tup.includes(`<option value="${n}"`), `tuplet ${n}`);
        assert.ok(tup.includes('<option value="5" selected>'));
        assert.ok(/data-set="bpm"[^>]*value=""/.test(html), 'pas de tempo propre : champ vide');
        assert.ok(/data-set="bpm"[^>]*value="132"/.test(E.nseToolsHtml(S.parseStaff('t,4/4,0,bpm132;q:c4'))));
        assert.ok(sel(E.nseToolsHtml(S.parseStaff('t,4/4,0,sw67;q:c4')), 'swing').includes('<option value="67" selected>'));
        assert.ok(sel(E.nseToolsHtml(S.parseStaff('t,4/4,0,sw62;q:c4')), 'swing').includes('<option value="62" selected>'), 'une valeur inhabituelle reste proposée');
        assert.ok(/data-set="swing"[^>]*disabled/.test(html), 'mesure composée (6/8) : pas de swing');
    });
    test('curseur de taille : bornes et valeur de la portée', () => {
        assert.ok(html.includes('data-set="size"') && html.includes('min="50"') && html.includes('max="200"') && html.includes('value="100"'));
        assert.ok(E.nseToolsHtml(S.parseStaff('t,4/4,0,150;q:c4')).includes('value="150"'));
    });
    test('clé, mesure et armure reflètent la portée', () => {
        assert.ok(html.includes('<option value="b" selected>'));
        assert.ok(html.includes('<option value="6/8" selected>'));
        assert.ok(html.includes('<option value="-2" selected>'));
        const ks = html.slice(html.indexOf('data-set="ks"'), html.indexOf('</select>', html.indexOf('data-set="ks"')));
        assert.equal((ks.match(/<option value="-?\d"[ >]/g) || []).length, 15, 'les 15 armures, de 7 bémols à 7 dièses');
    });
    test('les icônes de durée sont des dessins (pas de police musicale)', () => {
        for (const d of ['w', 'h', 'q', '8', '16']) assert.ok(E.nseNoteIcon(d).startsWith('<svg'), d);
        assert.notEqual(E.nseNoteIcon('8'), E.nseNoteIcon('16'));
    });
    test('libellés d’armure : do majeur sans altération, sol majeur 1 dièse, si♭ majeur 2 bémols', () => {
        const opts = E.nseKeyOptions(0);
        assert.ok(opts.includes('Do maj. · aucune'));
        assert.ok(opts.includes('Sol maj. · 1♯'));
        assert.ok(opts.includes('Si♭ maj. · 2♭'));
    });
});

describe('dimensions', () => {
    test('une ligne de portée contient la portée et ses lignes supplémentaires', () => {
        assert.equal(E.NSE_SPACING, 10);
        assert.ok(E.NSE_BAND >= E.NSE_TOP + 4 * E.NSE_SPACING + 3 * E.NSE_SPACING);
    });
});

describe('nseToolState : ce que montrent les boutons durée / point / triolet / silence', () => {
    const st = S.parseStaff('t,4/4,0;q.:c4 8:e4 hr');
    const cur = { d: 'q', dot: false, tu: 0, rest: false };
    test('sans sélection : la valeur de la prochaine note', () => {
        assert.deepEqual(E.nseToolState(st, -1, false, { d: '8', dot: true, tu: 0, rest: false }), { d: '8', dot: true, tu: 0, rest: false });
    });
    test('note choisie à la main : ses propres valeurs (le bouton agit sur elle)', () => {
        assert.deepEqual(E.nseToolState(st, 0, false, cur), { d: 'q', dot: true, tu: 0, rest: false });
        assert.deepEqual(E.nseToolState(st, 1, false, cur), { d: '8', dot: false, tu: 0, rest: false });
        assert.deepEqual(E.nseToolState(st, 2, false, cur), { d: 'h', dot: false, tu: 0, rest: true });
    });
    test('note qui vient d\'être posée (sélection automatique) : les boutons règlent la PROCHAINE note et la montrent', () => {
        // une noire pointée vient d'être posée ; un clic sur « point » éteint le point des notes suivantes : le bouton doit s'éteindre
        assert.deepEqual(E.nseToolState(st, 0, true, { d: 'q', dot: false, tu: 0, rest: false }), { d: 'q', dot: false, tu: 0, rest: false });
        // un clic sur « croche » : la durée affichée est celle des notes suivantes, pas celle de la note posée
        assert.equal(E.nseToolState(st, 0, true, { d: '8', dot: true, tu: 0, rest: false }).d, '8');
    });
    test('indice hors limites : valeur de la prochaine note', () => {
        assert.deepEqual(E.nseToolState(st, 9, false, cur), cur);
    });
});

// Faux éléments DOM (le test tourne sans navigateur) : attributs, classes, et le texte d'un cadre.
const El = (cls, attrs = {}, body = null) => ({
    classList: { contains: (c) => cls.includes(c) },
    getAttribute: (k) => attrs[k] === undefined ? null : attrs[k],
    querySelector: (sel) => (sel === '.annot-frame-body' && body !== null ? { innerHTML: body } : null),
    innerHTML: body || ''
});
const Staff = (txt, extra = {}) => El(['annot-staff'], Object.assign({ 'data-staff': txt }, extra));
const Frame = (box, html, extra = {}) => El(['annot-frame'], Object.assign({ 'data-frame': box }, extra), html);

describe('nseBlocksToClipText : blocs sélectionnés → presse-papiers', () => {
    test('une portée avec sa place', () => {
        assert.equal(E.nseBlocksToClipText([Staff('t,4/4,0;q:c4', { 'data-at': '12,34' })]), '[portée@12,34:t,4/4,0;q:c4]');
    });
    test('un bloc sans place (annotation ancienne) : repère sans place', () => {
        assert.equal(E.nseBlocksToClipText([Staff('t,4/4,0;q:c4')]), '[portée:t,4/4,0;q:c4]');
    });
    test('le cadre caché est noté par un « ! »', () => {
        assert.equal(E.nseBlocksToClipText([Staff('t,4/4,0;q:c4', { 'data-at': '12,34', 'data-border': '0' })]), '[portée@12,34!:t,4/4,0;q:c4]');
        assert.match(E.nseBlocksToClipText([Frame('200', 'a', { 'data-at': '5,6', 'data-border': '0' })]), /^\[cadre@5,6!:200;/);
    });
    test('portée et cadre ensemble : chacun garde sa place, dans l\'ordre', () => {
        const txt = E.nseBlocksToClipText([Staff('t,4/4,0;q:c4', { 'data-at': '10,10' }), Frame('200,150', '<b>a</b>', { 'data-at': '60,70' })]);
        const parts = S.splitStaffClips(txt);
        assert.equal(parts.length, 2);
        assert.deepEqual(parts[0].at, { x: 10, y: 10 });
        assert.deepEqual(parts[1].at, { x: 60, y: 70 });
        assert.equal(parts[1].frame.html, '<b>a</b>');
    });
    test('une portée invalide est ignorée', () => {
        assert.equal(E.nseBlocksToClipText([Staff('n importe quoi')]), '');
    });
});

describe('noteStaffStubHtml : bloc enregistré pour une portée', () => {
    test('portée par défaut, place et bord', () => {
        assert.match(E.noteStaffStubHtml(), /^<div class="annot-staff" data-staff="[^"]+"><\/div>$/);
        assert.match(E.noteStaffStubHtml(undefined, { x: 12, y: 34 }), / data-at="12,34"/);
        assert.match(E.noteStaffStubHtml(undefined, { x: 12, y: 34 }, false), / data-border="0"/);
        assert.ok(!/data-border/.test(E.noteStaffStubHtml(undefined, { x: 12, y: 34 }, true)));
    });
    test('passe le nettoyage des annotations tel quel', () => {
        const stub = E.noteStaffStubHtml(undefined, { x: 12, y: 34 }, false);
        assert.equal(F.sanitizeNoteHtml(stub), stub);
    });
});

describe('nseHandDrawn : lignes de portée « crayon »', () => {
    const fakeSvg = (ds) => {
        const paths = ds.map(d => { const a = { d }; return { getAttribute: (k) => a[k], setAttribute: (k, v) => { a[k] = v; }, a }; });
        return { paths, querySelectorAll: (sel) => (sel === '.vf-stave path' ? paths : []) };
    };
    test('une ligne droite devient une courbe très légère, de mêmes extrémités à moins d\'un pixel', () => {
        const svg = fakeSvg(['M3 30L188.641 30', 'M3 40L188.641 40', 'M3 50L188.641 50']);
        E.nseHandDrawn(svg);
        svg.paths.forEach((p, i) => {
            const m = /^M([\d.]+) ([\d.]+)Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)$/.exec(p.a.d);
            assert.ok(m, p.a.d);
            assert.ok(Math.abs(+m[2] - (30 + 10 * i)) < 1 && Math.abs(+m[4] - (30 + 10 * i)) < 1 && Math.abs(+m[6] - (30 + 10 * i)) < 1);
            assert.equal(+m[1], 3); assert.equal(+m[5], 188.641);
        });
    });
    test('le tracé est le même à chaque dessin (pas de scintillement)', () => {
        const a = fakeSvg(['M3 30L188.641 30', 'M3 40L188.641 40']), b = fakeSvg(['M3 30L188.641 30', 'M3 40L188.641 40']);
        E.nseHandDrawn(a); E.nseHandDrawn(b);
        assert.deepEqual(a.paths.map(p => p.a.d), b.paths.map(p => p.a.d));
    });
    test('les traits inattendus (obliques, très courts) et un dessin absent ne causent rien', () => {
        const svg = fakeSvg(['M3 30L50 40', 'M3 30L8 30', 'autre chose']);
        E.nseHandDrawn(svg);
        assert.deepEqual(svg.paths.map(p => p.a.d), ['M3 30L50 40', 'M3 30L8 30', 'autre chose']);
        assert.doesNotThrow(() => E.nseHandDrawn(null));
    });
});

describe('nseSmallTimeSig : indication de mesure réduite', () => {
    const fakeSvg = (groups) => ({ querySelectorAll: (sel) => (sel === '.vf-timesignature' ? groups : []) });
    const group = (box) => { const a = {}; return { a, getBBox: () => box, setAttribute: (k, v) => { a[k] = v; } }; };
    test('réduite autour de son centre', () => {
        const g = group({ x: 40, y: 30, width: 20, height: 40 });
        E.nseSmallTimeSig(fakeSvg([g]));
        assert.equal(g.a.transform, `translate(50 50) scale(${E.NSE_TIMESIG_SCALE}) translate(-50 -50)`);
        assert.ok(E.NSE_TIMESIG_SCALE < 0.8 && E.NSE_TIMESIG_SCALE > 0.4);
    });
    test('élément sans taille, mesure impossible ou pas de dessin : rien ne casse, rien ne change', () => {
        const empty = group({ x: 0, y: 0, width: 0, height: 0 });
        const broken = { a: {}, getBBox: () => { throw new Error('caché'); }, setAttribute() { throw new Error('non'); } };
        E.nseSmallTimeSig(fakeSvg([empty, broken]));
        assert.deepEqual(empty.a, {});
        assert.doesNotThrow(() => E.nseSmallTimeSig(null));
    });
});
