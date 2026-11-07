// Tests de la lecture sécurisée des grilles et réglages importés (grid/grid-format.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('./grid-format.js');
const T = require('../theory.js');

const step = (over = {}) => ({ rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1, ...over });

describe('sanitizeImportedGrid : refus', () => {
    test('pas un tableau, vide ou trop long → null', () => {
        for (const bad of [null, undefined, {}, 'x', 5, [], Array.from({ length: 65 }, () => step())]) assert.equal(F.sanitizeImportedGrid(bad), null);
    });
    test('64 blocs : accepté', () => {
        assert.equal(F.sanitizeImportedGrid(Array.from({ length: 64 }, () => step())).length, 64);
    });
    test('un seul bloc invalide rejette toute la grille', () => {
        assert.equal(F.sanitizeImportedGrid([step(), null]), null);
        assert.equal(F.sanitizeImportedGrid([step(), 5]), null);
        assert.equal(F.sanitizeImportedGrid([step(), step({ chordId: 'inconnu' })]), null);
    });
    test('fondamentale hors 0-11 ou non entière', () => {
        for (const rootIndex of [-1, 12, 3.5, 'x', undefined, NaN]) assert.equal(F.sanitizeImportedGrid([step({ rootIndex })]), null, String(rootIndex));
    });
    test('mesures hors 1-16 ou non entières', () => {
        for (const measures of [0, 17, 1.5, 'x', undefined, -2]) assert.equal(F.sanitizeImportedGrid([step({ measures })]), null, String(measures));
    });
    test('accord inconnu ou non textuel', () => {
        for (const chordId of ['nope', 42, null, undefined]) assert.equal(F.sanitizeImportedGrid([step({ chordId })]), null);
    });
    test('second accord invalide → toute la grille refusée', () => {
        assert.equal(F.sanitizeImportedGrid([step({ split: { rootIndex: 99, chordId: '7' } })]), null);
        assert.equal(F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: 'nope' } })]), null);
    });
});

describe('sanitizeImportedGrid : valeurs conservées ou corrigées', () => {
    test('nombres écrits en texte acceptés', () => {
        const [s] = F.sanitizeImportedGrid([step({ rootIndex: '5', measures: '2' })]);
        assert.deepEqual([s.rootIndex, s.measures], [5, 2]);
    });
    test('gamme inconnue → première gamme de l’accord', () => {
        for (const scaleId of ['???', null, 5, undefined]) {
            const [s] = F.sanitizeImportedGrid([step({ scaleId })]);
            assert.equal(s.scaleId, T.lookupChord('m7').scales[0].id);
        }
    });
    test('gamme connue conservée', () => {
        assert.equal(F.sanitizeImportedGrid([step({ scaleId: 'aeolian' })])[0].scaleId, 'aeolian');
    });
    test('champs inconnus supprimés', () => {
        const [s] = F.sanitizeImportedGrid([step({ evil: '<script>', __proto__x: 1 })]);
        assert.deepEqual(Object.keys(s).sort(), ['chordId', 'measures', 'rootIndex', 'scaleId']);
    });
    test('basse : 0-11 seulement', () => {
        assert.equal(F.sanitizeImportedGrid([step({ bassRootIndex: 7 })])[0].bassRootIndex, 7);
        assert.equal(F.sanitizeImportedGrid([step({ bassRootIndex: 0 })])[0].bassRootIndex, 0);
        for (const b of [12, -1, null, undefined, 'x', 2.5]) assert.equal('bassRootIndex' in F.sanitizeImportedGrid([step({ bassRootIndex: b })])[0], false, String(b));
    });
    test('textes tronqués : section et phrase 80 caractères, fnLabel 24', () => {
        const [s] = F.sanitizeImportedGrid([step({ section: 'x'.repeat(200), phrase: 'p'.repeat(200), harmonicFunction: 'h'.repeat(200), fnLabel: 'f'.repeat(50) })]);
        assert.equal(s.section.length, 80);
        assert.equal(s.phrase.length, 80);
        assert.equal(s.harmonicFunction.length, 80);
        assert.equal(s.fnLabel.length, 24);
    });
    test('textes non textuels ignorés', () => {
        const [s] = F.sanitizeImportedGrid([step({ section: 5, phrase: {}, fnLabel: '' })]);
        assert.deepEqual(Object.keys(s).sort(), ['chordId', 'measures', 'rootIndex', 'scaleId']);
    });
    test('modKey : { root 0-11, minor }', () => {
        assert.deepEqual(F.sanitizeImportedGrid([step({ modKey: { root: 5, minor: true, x: 1 } })])[0].modKey, { root: 5, minor: true });
        assert.deepEqual(F.sanitizeImportedGrid([step({ modKey: { root: 5, minor: 'oui' } })])[0].modKey, { root: 5, minor: false });
        for (const mk of [{ root: 12 }, { root: -1 }, 'k', null]) assert.equal('modKey' in F.sanitizeImportedGrid([step({ modKey: mk })])[0], false);
    });
});

describe('sanitizeImportedGrid : second accord, reprises, parties', () => {
    test('second accord valide conservé avec ses champs', () => {
        const [s] = F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', bassRootIndex: 2, fnLabel: 'V', modKey: { root: 1 } } })]);
        assert.deepEqual(s.split, { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', bassRootIndex: 2, fnLabel: 'V', modKey: { root: 1, minor: false } });
    });
    test('second accord ignoré si le bloc dure plus d’une mesure', () => {
        const [s] = F.sanitizeImportedGrid([step({ measures: 2, split: { rootIndex: 7, chordId: '7' } })]);
        assert.equal('split' in s, false);
    });
    test('gamme du second accord par défaut', () => {
        const [s] = F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: '7' } })]);
        assert.equal(s.split.scaleId, T.lookupChord('7').scales[0].id);
    });
    test('signes de reprise : repeatStart true seulement, repeatEnd 2-4, volta 1-2', () => {
        const [s] = F.sanitizeImportedGrid([step({ repeatStart: true, repeatEnd: 3, volta: 2 })]);
        assert.deepEqual([s.repeatStart, s.repeatEnd, s.volta], [true, 3, 2]);
        const [t] = F.sanitizeImportedGrid([step({ repeatStart: 'true', repeatEnd: 5, volta: 3 })]);
        assert.equal('repeatStart' in t || 'repeatEnd' in t || 'volta' in t, false);
        assert.equal('repeatEnd' in F.sanitizeImportedGrid([step({ repeatEnd: 1 })])[0], false);
    });
    test('repères de partie : liste proposée ou lettre A-Z', () => {
        for (const p of ['A', 'in', "B'", 'out', 'Z']) assert.equal(F.sanitizeImportedGrid([step({ partStart: p })])[0].partStart, p);
        for (const p of ['AA', '', 5, 'a', 'inx']) assert.equal('partStart' in F.sanitizeImportedGrid([step({ partStart: p })])[0], false, String(p));
        assert.equal(F.PART_LABELS.length, 16);
    });
    test('idempotent : une grille déjà propre ne change pas', () => {
        const grid = [step({ repeatStart: true, bassRootIndex: 7, section: 'A' }), step({ measures: 1, split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' }, repeatEnd: 2 })];
        const once = F.sanitizeImportedGrid(grid);
        assert.deepEqual(F.sanitizeImportedGrid(once), once);
    });
});

describe('sanitizeImportedSettings : swing', () => {
    test('le swing de l\'orchestration est conservé et borné ; absent ou invalide = Auto', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'swing', swing: 0.62 } }).orchestration.swing, 0.62);
        assert.equal(F.sanitizeImportedSettings({ orchestration: { swing: 0.2 } }).orchestration.swing, 0.5);
        assert.equal(F.sanitizeImportedSettings({ orchestration: { swing: 3 } }).orchestration.swing, 0.75);
        for (const bad of [undefined, null, '', 'x']) assert.ok(!('swing' in F.sanitizeImportedSettings({ orchestration: { swing: bad } }).orchestration));
        assert.ok(!('swing' in F.sanitizeImportedSettings({ orchestration: { style: 'swing' } }).orchestration));
    });
});

describe('sanitizeImportedSettings', () => {
    test('entrées invalides → objet vide', () => {
        for (const bad of [null, undefined, 5, 'x', []]) assert.deepEqual(F.sanitizeImportedSettings(bad), {});
    });
    test('tonalité 0-11, mode connu, orthographe valide', () => {
        assert.deepEqual(F.sanitizeImportedSettings({ key: 7, quality: 'dorian', spell: 'sssss' }), { key: 7, quality: 'dorian', spell: 'sssss' });
        assert.deepEqual(F.sanitizeImportedSettings({ key: 12, quality: 'bad', spell: 'nope' }), {});
    });
    test('tempo borné à 50-220 et arrondi', () => {
        assert.equal(F.sanitizeImportedSettings({ bpm: 10 }).bpm, 50);
        assert.equal(F.sanitizeImportedSettings({ bpm: 999 }).bpm, 220);
        assert.equal(F.sanitizeImportedSettings({ bpm: 120.6 }).bpm, 121);
        assert.equal(F.sanitizeImportedSettings({ bpm: '130' }).bpm, 130);
        assert.equal('bpm' in F.sanitizeImportedSettings({ bpm: 'x' }), false);
    });
    test('signature : valeurs reconnues seulement (anciens fichiers : 2, 3, 4)', () => {
        for (const [v, k] of [['3/4', '3/4'], ['12/8', '12/8'], [3, '3/4'], ['4', '4/4'], [' 6/8 ', '6/8']]) assert.equal(F.sanitizeImportedSettings({ timeSignature: v }).timeSignature, k, String(v));
        for (const v of ['7/8', 'x', 99, true, {}]) assert.equal('timeSignature' in F.sanitizeImportedSettings({ timeSignature: v }), false, String(v));
    });
    test('orchestre : style connu, rythme imposé, volumes et reverb bornés à 0-1', () => {
        const { orchestration: o } = F.sanitizeImportedSettings({ orchestration: { style: 'pop', groove: 'samba', volumes: { piano: 2, bass: -1, drums: 0.5, violin: 'x', guitar: null }, reverb: 0.4 } });
        assert.equal(o.style, 'pop');
        assert.equal(o.groove, 'samba');
        assert.deepEqual(o.volumes, { piano: 1, bass: 0, drums: 0.5 });
        assert.equal(o.reverb, 0.4);
    });
    test('anciens fichiers : mode « arpeges » → style classique', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { mode: 'arpeges', style: 'swing' } }).orchestration.style, 'classic');
    });
    test('le style Guitare est reconnu à l\'import', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'guitar' } }).orchestration.style, 'guitar');
    });
    test('anciens fichiers : Brasil + rythme afro → style Cuba', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'latin', groove: 'afro' } }).orchestration.style, 'cuba');
    });
    test('style ou rythme inconnus ignorés', () => {
        assert.deepEqual(F.sanitizeImportedSettings({ orchestration: { style: 'bad', groove: 'x' } }).orchestration, {});
    });
    test('tous les rythmes imposés par un style sont acceptés', () => {
        assert.ok(F.IMPORT_GROOVES.includes('bk-sevdah') && F.IMPORT_GROOVES.includes('bk-tsifte'));
        // les trois palos de l'orchestre Flamenco (choisis dans la fenêtre Orchestre) survivent à la sauvegarde et à l'import
        ['f-solea', 'f-bulerias', 'f-tangos'].forEach(g => assert.ok(F.IMPORT_GROOVES.includes(g), g));
        for (const g of F.IMPORT_GROOVES) assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'brass', groove: g } }).orchestration.groove, g);
    });
});

describe('unpackSavedEntry et parseMeter', () => {
    test('anciennes sauvegardes (simple tableau) et nouvelles { grid, settings }', () => {
        assert.deepEqual(F.unpackSavedEntry([1, 2]), { grid: [1, 2], settings: null });
        assert.deepEqual(F.unpackSavedEntry({ grid: [1], settings: { key: 3 } }), { grid: [1], settings: { key: 3 } });
        assert.deepEqual(F.unpackSavedEntry({ grid: [1] }), { grid: [1], settings: null });
    });
    test('entrées invalides → null', () => {
        for (const bad of [null, undefined, 'x', 5, {}, { grid: 5 }]) assert.equal(F.unpackSavedEntry(bad), null);
    });
    test('parseMeter : signatures connues, anciens nombres, repli sur 4/4', () => {
        assert.deepEqual(F.parseMeter('6/8'), { key: '6/8', bpb: 2, ternary: true });
        assert.deepEqual(F.parseMeter('12/8'), { key: '12/8', bpb: 4, ternary: true });
        assert.deepEqual(F.parseMeter(3), { key: '3/4', bpb: 3, ternary: false });
        assert.deepEqual(F.parseMeter('7/8'), { key: '4/4', bpb: 4, ternary: false });
        assert.deepEqual(F.parseMeter(undefined), { key: '4/4', bpb: 4, ternary: false });
    });
});

describe('sanitizeImportedSettings : chiffrage des degrés', () => {
    test('jazz et classic acceptés ; toute autre valeur ignorée (absent = selon le style)', () => {
        assert.equal(F.sanitizeImportedSettings({ fnConvention: 'jazz' }).fnConvention, 'jazz');
        assert.equal(F.sanitizeImportedSettings({ fnConvention: 'classic' }).fnConvention, 'classic');
        for (const bad of [undefined, null, '', 'Jazz', 'classique', 1, {}]) assert.ok(!('fnConvention' in F.sanitizeImportedSettings({ fnConvention: bad })), String(bad));
    });
});

describe('import : orchestre Rock', () => {
    test('rythmes rock reconnus, volumes de la guitare électrique, de l\'orgue et des cordes bornés', () => {
        for (const g of ['r-roll', 'r-classic', 'r-hard', 'r-punk', 'r-ballad', 'r-blues', 'r-indie']) {
            assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'pop', groove: g } }).orchestration.groove, g, g);
        }
        assert.ok(!('groove' in F.sanitizeImportedSettings({ orchestration: { style: 'pop', groove: 'r-inconnu' } }).orchestration));
        const { orchestration: o } = F.sanitizeImportedSettings({ orchestration: { style: 'pop', volumes: { rguitar: 0.7, organ: 3, strings: -2, piano: 0.5 } } });
        assert.deepEqual(o.volumes, { piano: 0.5, rguitar: 0.7, organ: 1, strings: 0 });
    });
});

describe('sanitizeImportedSettings : densités par orchestre', () => {
    const san = (orch) => F.sanitizeImportedSettings({ orchestration: orch }).orchestration;
    test('les densités sont conservées et bornées à 0-1 ; absentes ou invalides = valeurs par défaut', () => {
        assert.deepEqual(san({ style: 'guitar', densities: { guitar: 0.8, classic: 0.2 } }).densities, { guitar: 0.8, classic: 0.2 });
        assert.equal(san({ densities: { guitar: -2 } }).densities.guitar, 0);
        assert.equal(san({ densities: { classic: 7 } }).densities.classic, 1);
        for (const bad of [undefined, null, '', 'x']) assert.ok(!('densities' in san({ densities: { guitar: bad, classic: bad } })));
        assert.ok(!('densities' in san({ style: 'guitar' })));
    });
    test('anciens fichiers : guitarDensity devient la densité de la guitare', () => {
        assert.deepEqual(san({ style: 'guitar', guitarDensity: 0.8 }).densities, { guitar: 0.8 });
        assert.deepEqual(san({ guitarDensity: 0.3, densities: { guitar: 0.9 } }).densities, { guitar: 0.9 });
    });
    test('valeurs par défaut : Guitare 60 %, les autres orchestres 50 %', () => {
        assert.deepEqual(F.BAND_DENSITY_DEFAULTS, { guitar: 0.6, classic: 0.5, piazzolla: 0.5, balkan: 0.5, cumbia: 0.5, brass: 0.5 });
        assert.deepEqual(san({ densities: { brass: 0.2, balkan: 9, cumbia: 0, piazzolla: 0.7 } }).densities, { piazzolla: 0.7, balkan: 1, cumbia: 0, brass: 0.2 });
    });
});

describe('annotations (onglet Annotations)', () => {
    test('annotation de mesure : conservée, espaces de fin retirés, limitée', () => {
        const g = F.sanitizeImportedGrid([step({ note: 'Jouer doux  \n' }), step({ note: 'x'.repeat(F.MEASURE_NOTE_MAX + 300) }), step({ note: '   ' }), step({ note: 42 }), step()]);
        assert.equal(g[0].note, 'Jouer doux');
        assert.equal(g[1].note.length, F.MEASURE_NOTE_MAX);
        assert.equal('note' in g[2], false);
        assert.equal('note' in g[3], false);
        assert.equal('note' in g[4], false);
    });
    test('annotation générale (réglages) : conservée, limitée, ignorée si vide ou pas du texte', () => {
        assert.equal(F.sanitizeImportedSettings({ notes: 'Swing léger\n' }).notes, 'Swing léger');
        assert.equal(F.sanitizeImportedSettings({ notes: 'y'.repeat(F.GRID_NOTE_MAX + 1000) }).notes.length, F.GRID_NOTE_MAX);
        for (const bad of ['', '  ', 5, null, {}, [], '<div><br></div>']) assert.equal('notes' in F.sanitizeImportedSettings({ notes: bad }), false, JSON.stringify(bad));
        assert.equal('notes' in F.sanitizeImportedSettings({}), false); // anciens fichiers
    });
    test('un fichier sans annotation (ancien) se lit comme avant', () => {
        const g = F.sanitizeImportedGrid([step()]);
        assert.deepEqual(Object.keys(g[0]).sort(), ['chordId', 'measures', 'rootIndex', 'scaleId']);
    });
});

describe('sanitizeNoteHtml : annotations mises en forme', () => {
    const S = F.sanitizeNoteHtml;
    test('texte simple (anciennes annotations) : inchangé, retours à la ligne gardés', () => {
        assert.equal(S('Arpège ascendant\nfinir sur la tierce'), 'Arpège ascendant\nfinir sur la tierce');
        assert.equal(S('a < b et c > d & e'), 'a &lt; b et c &gt; d &amp; e');
    });
    test('mise en forme de la barre : gras, taille, couleur, surlignage, alignement, liste', () => {
        assert.equal(S('<span style="font-size: xxx-large; font-weight: bold; color: rgb(220, 38, 38); background-color: rgb(253, 224, 71);">Gros</span>'),
            '<span style="font-size:48px;font-weight:bold;color:#dc2626;background-color:#fde047">Gros</span>');
        assert.equal(S('<div style="text-align: center;">x</div>'), '<div style="text-align:center">x</div>');
        assert.equal(S('<ul><li>un</li><li>deux</li></ul>'), '<ul><li>un</li><li>deux</li></ul>');
        assert.equal(S('<strong>g</strong><em>i</em><u>s</u><strike>b</strike>'), '<b>g</b><i>i</i><u>s</u><s>b</s>');
        assert.equal(S('<font color="#f00" size="7">r</font>'), '<span style="color:#ff0000;font-size:48px">r</span>');
        assert.equal(S('<span style="font-size:3px">p</span><span style="font-size:500px">g</span>'), '<span style="font-size:8px">p</span><span style="font-size:96px">g</span>');
    });
    test('rien d\'exécutable ne passe : scripts, événements, liens, images, styles inconnus', () => {
        assert.equal(S('<img src=x onerror=alert(1)>Salut<script>alert(1)</script><a href="javascript:x">lien</a>'), 'Salutlien');
        assert.equal(S('<div onclick="x()" style="text-align: right; background-image: url(javascript:1); position: fixed">r</div>'), '<div style="text-align:right">r</div>');
        assert.equal(S('<span style="color: expression(alert(1))">x</span>'), 'x');
        assert.equal(S('<span style="color: rgba(1,2,3,0.5)">x</span>'), 'x'); // couleur translucide refusée
        assert.equal(S('<style>body{display:none}</style>t'), 't');
        assert.equal(S('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;'); // texte, pas du code
        const out = S('<b onmouseover="a()" class="c" id="d">x</b>');
        assert.equal(out, '<b>x</b>');
    });
    test('balises mal fermées ou imbriquées de travers : le résultat est toujours équilibré', () => {
        assert.equal(S('<b>gras <i>et italique</b> fin</i>'), '<b>gras <i>et italique</i></b> fin');
        assert.equal(S('<div><span style="color:#000">x'), '<div><span style="color:#000000">x</span></div>');
        assert.equal(S('x</b></div>'), 'x');
    });
    test('vide : aucun texte visible, retours à la ligne et éléments vides de fin retirés', () => {
        for (const v of ['', '<br>', '<div><br></div>', '<span style="color:#000"> </span>', '&nbsp;', null, undefined, 5]) assert.equal(S(v), '', String(v));
        assert.equal(S('texte<div><br></div><div><br></div>'), 'texte');
        assert.equal(S('a<div><br></div>b'), 'a<div><br></div>b'); // une ligne vide au milieu reste
    });
    test('entités : décodées puis ré-échappées, numériques acceptées, inconnues laissées', () => {
        assert.equal(S('&#9837; &#x266F; &amp;lt; &truc;'), '♭ ♯ &amp;lt; &amp;truc;');
    });
    test('limite de texte : coupée, et les éléments ouverts sont refermés', () => {
        assert.equal(S('<b>' + 'x'.repeat(50) + '</b>fin', 10), '<b>xxxxxxxxxx</b>');
        assert.equal(S('x'.repeat(50), 10), 'xxxxxxxxxx');
    });
    test('idempotent : nettoyer deux fois donne le même résultat', () => {
        const once = S('<span style="font-size: 20px; color: rgb(1, 2, 3)">A</span><div style="text-align:center"><b>B</b></div>');
        assert.equal(S(once), once);
    });
    test('beaucoup d\'éléments : plafonné, jamais d\'erreur', () => {
        const big = '<b>'.repeat(2000) + 'x' + '<br>'.repeat(2000);
        const out = S(big);
        assert.ok(out.length < 20000);
        assert.ok(out.includes('x'));
    });
});

describe('sanitizeNoteHtml : polices', () => {
    const S = F.sanitizeNoteHtml;
    test('police de la liste : gardée sous sa forme canonique, quelle que soit l’écriture du navigateur', () => {
        assert.equal(S('<span style="font-family: Georgia, serif;">x</span>'), '<span style="font-family:Georgia,serif">x</span>');
        assert.equal(S('<span style="font-family: &quot;Times New Roman&quot;, Times, serif">x</span>'), `<span style="font-family:'Times New Roman',Times,serif">x</span>`);
        assert.equal(S('<span style="font-family:GEORGIA">x</span>'), '<span style="font-family:Georgia,serif">x</span>');
        assert.equal(S('<span style="font-family: Kalam">x</span>'), '<span style="font-family:Kalam,cursive">x</span>');
    });
    test('balise <font face="…"> (anciens navigateurs) : même traitement', () => {
        assert.equal(S('<font face="Verdana">x</font>'), '<span style="font-family:Verdana,Geneva,sans-serif">x</span>');
    });
    test('police inconnue ou piégée : retirée, le texte reste', () => {
        assert.equal(S('<span style="font-family: Papyrus">x</span>'), 'x');
        assert.equal(S('<span style="font-family: Arial; background: url(javascript:alert(1))">x</span>'), '<span style="font-family:Arial,Helvetica,sans-serif">x</span>');
        assert.equal(S('<font face="Arial;color:red">x</font>'), 'x', 'on ne peut pas glisser une autre propriété dans le nom de la police');
    });
    test('toutes les polices de NOTE_FONTS passent, avec leur valeur exacte', () => {
        for (const [key, css] of Object.entries(F.NOTE_FONTS)) assert.equal(S(`<span style="font-family:${key}">x</span>`), `<span style="font-family:${css}">x</span>`, key);
    });
    test('taille, police et couleur ensemble', () => {
        assert.equal(S('<span style="font-size: 43px; font-family: Georgia, serif; color: rgb(220, 38, 38);">x</span>'),
            '<span style="font-size:43px;font-family:Georgia,serif;color:#dc2626">x</span>');
    });
});

describe('sanitizeNoteHtml : portées éditables', () => {
    const S = F.sanitizeNoteHtml;
    const staff = (t) => `<div class="annot-staff" data-staff="${t}"></div>`;
    test('une portée valide est gardée sous sa forme canonique', () => {
        assert.equal(S(staff('t,4/4,0;q:c4 8:d4')), staff('t,4/4,0;q:c4 8:d4'));
        assert.equal(S(staff('t,4/4,0;  q:c4   8:d4 ')), staff('t,4/4,0;q:c4 8:d4'));
    });
    test('décalage libre (data-pos) : gardé s\'il est valide et non nul, sinon retiré ; le texte de la portée reste exigeant', () => {
        const at = (t, pos) => `<div class="annot-staff" data-staff="${t}" data-pos="${pos}"></div>`;
        assert.equal(S(at('t,4/4,0;q:c4', '25,-8')), at('t,4/4,0;q:c4', '25,-8'));
        assert.equal(S(at('t,4/4,0;q:c4', '0,0')), staff('t,4/4,0;q:c4'));
        for (const bad of ['', 'x', '1,2,3', '1.5,2', 'javascript:alert(1)', '"><script>']) assert.equal(S(at('t,4/4,0;q:c4', bad.replace(/"/g, '&quot;'))), staff('t,4/4,0;q:c4'), bad);
        assert.equal(S(at('t,4/4,0;q:c4', '99999,1')), staff('t,4/4,0;q:c4'));        // plus de 4 chiffres : refusé
        assert.equal(S(at('t,4/4,0;q:c4', '5000,-5000')), at('t,4/4,0;q:c4', '3000,-3000')); // bornes
        assert.equal(S(at('bidon', '5,5')), '');
    });
    test('une portée seule est une annotation (elle n’est pas « vide »)', () => {
        assert.notEqual(S(staff('t,4/4,0;')), '');
    });
    test('le texte autour est gardé, dans l’ordre', () => {
        assert.equal(S(`Riff :${staff('t,4/4,0;q:c4')}puis reprise`), `Riff :${staff('t,4/4,0;q:c4')}puis reprise`);
    });
    test('le dessin et les boutons enregistrés avec la portée sont jetés (rien ne s’exécute, aucun texte parasite)', () => {
        const drawn = '<div class="annot-staff is-active" data-staff="t,4/4,0;q:c4" contenteditable="false"><div class="annot-staff-svg"><svg><text>PARASITE</text><script>alert(1)</script></svg></div><div class="annot-staff-tools"><button>Vider</button></div></div>suite';
        assert.equal(S(drawn), `${staff('t,4/4,0;q:c4')}suite`);
    });
    test('portée invalide, vide ou sans valeur : supprimée avec son contenu', () => {
        for (const bad of ['zzz', '', 't,4/4,0;q:h9', 't,4/4,9;', '<img src=x onerror=alert(1)>']) {
            assert.equal(S(`avant<div data-staff="${bad.replace(/"/g, '&quot;')}">contenu</div>après`), 'avantaprès', bad);
        }
    });
    test('balise non fermée : tout ce qui suit est jeté (pas de fuite)', () => {
        assert.equal(S(`avant<div data-staff="t,4/4,0;q:c4">fin`), staff('t,4/4,0;q:c4').replace('></div>', '></div>').replace(/^/, 'avant'));
    });
    test('portées imbriquées dans un div ordinaire : conservées', () => {
        assert.equal(S(`<div>ligne${staff('t,4/4,0;q:c4')}</div>`), `<div>ligne${staff('t,4/4,0;q:c4')}</div>`);
    });
    test('huit portées au plus', () => {
        const nine = Array(9).fill(staff('t,4/4,0;q:c4')).join('');
        assert.equal((S(nine).match(/annot-staff/g) || []).length, F.NOTE_MAX_STAVES);
        assert.equal(F.NOTE_MAX_STAVES, 8);
    });
    test('nettoyer deux fois donne le même résultat', () => {
        for (const raw of [`<span style="font-size:20px">a</span>${staff('b,6/8,-2;8t:bb3 8t:b3 8t:bbb3')}<div>z</div>`, staff('t,4/4,0;'), `x${staff('t,3/4,1;q.:f#4')}y`]) {
            const once = S(raw);
            assert.equal(S(once), once);
        }
    });
    test('les portées ne comptent pas dans la longueur du texte', () => {
        const long = 'x'.repeat(1990);
        const out = S(`${long}${staff('t,4/4,0;q:c4')}`, 2000);
        assert.ok(out.includes('annot-staff') && out.startsWith(long));
    });
});

describe('annotations avec portée : import et grille', () => {
    test('sanitizeImportedGrid : la portée d’une mesure passe l’import, une portée piégée est retirée', () => {
        const stub = '<div class="annot-staff" data-staff="t,4/4,0;q:c4 8:d4"></div>';
        const [a] = F.sanitizeImportedGrid([{ rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1, note: `Lick :${stub}` }]);
        assert.equal(a.note, `Lick :${stub}`);
        const [b] = F.sanitizeImportedGrid([{ rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1, note: '<div data-staff="bidon">x</div>Lick' }]);
        assert.equal(b.note, 'Lick');
    });
});

describe('sanitizeNoteHtml : taille de portée', () => {
    test('la taille passe, une taille invalide supprime la portée', () => {
        assert.equal(F.sanitizeNoteHtml('a<div class="annot-staff" data-staff="t,4/4,0,150;q:c4"></div>'), 'a<div class="annot-staff" data-staff="t,4/4,0,150;q:c4"></div>');
        assert.equal(F.sanitizeNoteHtml('a<div class="annot-staff" data-staff="t,4/4,0,155;q:c4"></div>'), 'a');
    });
});
