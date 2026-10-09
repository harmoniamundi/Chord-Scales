// Tests de l'écran Entraînement (ui/training-view.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../theory.js');
const V = require('./training-view.js');

const maj7 = T.chordTypes.maj.find(c => c.id === 'maj7');
const labels = T.ROOT_NAMES_DEFAULT.slice();
const ctxOf = (over = {}) => ({
    scalesDb: T.scalesDb, rootName: 'C', chordObj: maj7, scaleDirections: {},
    showAvoidNotes: false, showCharacteristic: false, showTargetNotes: false, visMode: 'letters',
    angloToFrench: (a) => a, ...over,
});

describe('boutons de qualité', () => {
    test('classe : sélectionné bleu, sinon discret', () => {
        assert.ok(V.qualityButtonClass(true).includes('bg-blue-600/20'));
        assert.ok(V.qualityButtonClass(false).includes('bg-[#1a1a1a]'));
        assert.ok(!V.qualityButtonClass(false).includes('bg-blue-600/20'));
        assert.ok(V.qualityButtonClass(true).startsWith('p-2.5 rounded-lg'));
    });
    test('contenu : symbole puis nom complet', () => {
        const html = V.qualityButtonHtml({ name: 'maj7', fullName: 'Majeur 7' });
        assert.ok(html.includes('font-bold text-xs">maj7</span>'));
        assert.ok(html.includes('truncate">Majeur 7</span>'));
    });
});

describe('en-tête de l\'accord', () => {
    test('nom, pastille de qualité et notes avec leur intervalle', () => {
        const h = V.chordHeaderModel({ rootIndex: 0, chordObj: maj7, hasChord: true, rootLabels: labels });
        assert.equal(h.rootName, 'C');
        assert.equal(h.qualityBadge, 'maj7');
        assert.equal(h.chordName, 'Cmaj7');
        assert.deepEqual(h.notes, [{ label: 'C', interval: 0 }, { label: 'E', interval: 4 }, { label: 'G', interval: 7 }, { label: 'B', interval: 11 }]);
    });
    test('sans qualité choisie : tiret dans la pastille', () => {
        const h = V.chordHeaderModel({ rootIndex: 0, chordObj: maj7, hasChord: false, rootLabels: labels });
        assert.equal(h.qualityBadge, '-');
    });
    test('l\'orthographe de la fondamentale suit les libellés', () => {
        const sharp = labels.slice(); sharp[1] = 'C#';
        const flat = labels.slice(); flat[1] = 'Db';
        assert.equal(V.chordHeaderModel({ rootIndex: 1, chordObj: maj7, hasChord: true, rootLabels: sharp }).rootName, 'C#');
        assert.equal(V.chordHeaderModel({ rootIndex: 1, chordObj: maj7, hasChord: true, rootLabels: flat }).rootName, 'Db');
    });
});

describe('cartes de gammes', () => {
    test('clé : identifiant de gamme et position', () => {
        assert.equal(V.trainingScaleKey('lydian', 2), 'lydian-2');
    });
    test('gamme inconnue : pas de carte', () => {
        assert.equal(V.trainingScaleCard(ctxOf(), { id: 'nope', role: 'x' }, 0), null);
    });
    test('mode portée : canevas et tâche de dessin', () => {
        const item = maj7.scales[0];
        const card = V.trainingScaleCard(ctxOf({ visMode: 'staff' }), item, 3);
        assert.equal(card.scaleKey, `${item.id}-3`);
        assert.ok(card.html.includes(`id="vexflow-canvas-3-${item.id}"`));
        assert.deepEqual(Object.keys(card.staffTask), ['canvasId', 'intervals', 'rootName', 'isDesc', 'avoidNotes', 'characteristicInterval', 'chordObj']);
        assert.equal(card.staffTask.canvasId, `vexflow-canvas-3-${item.id}`);
        assert.equal(card.staffTask.rootName, 'C');
    });
    test('mode pastilles : pas de tâche de portée, clic sur chaque note', () => {
        const card = V.trainingScaleCard(ctxOf({ visMode: 'letters' }), maj7.scales[0], 0);
        assert.equal(card.staffTask, null);
        assert.ok(card.html.includes('app.playSingleNote(0); event.stopPropagation();'));
        assert.ok(card.html.includes('app.toggleScalePlayback('));
    });
    test('en-tête de carte : fondamentale, nom, catégorie, rôle, direction', () => {
        const item = maj7.scales[0];
        const def = T.scalesDb[item.id];
        const asc = V.trainingScaleCard(ctxOf(), item, 0);
        assert.ok(asc.html.includes(`>C ${def.name}</h3>`));
        assert.ok(asc.html.includes(`>${def.category}</span>`));
        assert.ok(asc.html.includes(`>${item.role}</span>`));
        assert.ok(asc.html.includes('• Ascendant'));
        const desc = V.trainingScaleCard(ctxOf({ scaleDirections: { [`${item.id}-0`]: true } }), item, 0);
        assert.ok(desc.html.includes('• Descendant'));
    });
    test('direction descendante transmise à la portée', () => {
        const item = maj7.scales[0];
        const card = V.trainingScaleCard(ctxOf({ visMode: 'staff', scaleDirections: { [`${item.id}-0`]: true } }), item, 0);
        assert.equal(card.staffTask.isDesc, true);
    });
    test('notes à éviter et caractéristique : seulement si les options sont actives', () => {
        const m7 = T.chordTypes.min.find(c => c.id === 'm7');
        const item = m7.scales.find(s => T.getAvoidNotes(s.id, m7.id).length > 0 && T.scalesDb[s.id].characteristicInterval != null) || m7.scales[0];
        const off = V.trainingScaleCard(ctxOf({ visMode: 'staff', chordObj: m7 }), item, 0);
        assert.deepEqual(off.staffTask.avoidNotes, []);
        assert.equal(off.staffTask.characteristicInterval, null);
        const on = V.trainingScaleCard(ctxOf({ visMode: 'staff', chordObj: m7, showAvoidNotes: true, showCharacteristic: true }), item, 0);
        assert.deepEqual(on.staffTask.avoidNotes, T.getAvoidNotes(item.id, m7.id));
        assert.equal(on.staffTask.characteristicInterval, T.scalesDb[item.id].characteristicInterval);
    });
    test('classe de carte constante', () => {
        const card = V.trainingScaleCard(ctxOf(), maj7.scales[0], 0);
        assert.ok(card.className.includes('bg-[#252525]') && card.className.includes('group'));
    });
    test('toutes les gammes de tous les accords produisent une carte valide dans chaque mode', () => {
        for (const cat of Object.keys(T.chordTypes)) for (const chordObj of T.chordTypes[cat]) {
            for (const visMode of ['staff', 'intervals', 'notes', 'letters']) {
                chordObj.scales.forEach((item, i) => {
                    const card = V.trainingScaleCard(ctxOf({ chordObj, visMode, showAvoidNotes: true, showCharacteristic: true, showTargetNotes: true }), item, i);
                    assert.ok(card && card.html.includes(`data-scale-key="${item.id}-${i}"`));
                });
            }
        }
    });
});

describe('boutons de navigation et de choix', () => {
    test('barre du haut : actif en gris clair, inactif discret', () => {
        assert.equal(V.navButtonClass(true), 'px-3 py-1 rounded-md bg-[#3a3a3c] text-white transition shadow-sm');
        assert.equal(V.navButtonClass(false), 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition');
    });
    test('groupes à choix unique (familles, transposition)', () => {
        assert.equal(V.segmentButtonClass(true), 'flex-1 py-1 rounded-md transition bg-[#3a3a3c] text-white shadow-sm');
        assert.equal(V.segmentButtonClass(false), 'flex-1 py-1 rounded-md transition text-slate-400 hover:text-white');
    });
    test('modes d\'affichage', () => {
        assert.equal(V.visModeButtonClass(true), 'py-1 px-2.5 rounded-md transition bg-[#3a3a3c] text-white shadow-sm');
        assert.equal(V.visModeButtonClass(false), 'py-1 px-2.5 rounded-md transition text-slate-400 hover:text-white');
    });
    test('interrupteur notes cibles', () => {
        assert.ok(V.targetToggleClass(true).includes('bg-blue-500/20'));
        assert.ok(V.targetToggleClass(false).includes('text-slate-500') && !V.targetToggleClass(false).includes('bg-blue-500/20'));
    });
});

describe('clavier des fondamentales', () => {
    const kb = (sel, labelsIn = T.ROOT_NAMES_DEFAULT.slice()) => V.rootKeyboardModel({
        selectedRootIndex: sel, rootLabels: labelsIn, blackPcs: T.BLACK_PCS,
        sharpNames: T.ROOT_NAMES_SHARP, flatNames: T.ROOT_NAMES_FLAT, count: 12,
    });
    test('12 touches : 7 blanches et 5 noires', () => {
        const keys = kb(0);
        assert.equal(keys.length, 12);
        assert.equal(keys.filter(k => k.kind === 'white').length, 7);
        assert.equal(keys.filter(k => k.kind === 'black').length, 5);
    });
    test('touche blanche : libellé courant, bouton sélectionné en bleu', () => {
        const keys = kb(0);
        assert.equal(keys[0].label, 'C');
        assert.ok(keys[0].className.includes('bg-[#2563eb]'));
        assert.ok(!keys[2].className.includes('bg-[#2563eb]'));
        assert.ok(keys[0].className.startsWith('py-3 rounded-lg'));
    });
    test('touche noire : moitié dièse puis moitié bémol, indice parmi les noires', () => {
        const keys = kb(1);
        assert.equal(keys[1].kind, 'black');
        assert.equal(keys[1].blackIndex, T.BLACK_PCS.indexOf(1));
        assert.deepEqual(keys[1].halves.map(h => [h.acc, h.name]), [['s', 'C#'], ['f', 'Db']]);
    });
    test('seule la moitié correspondant à l\'orthographe courante est sélectionnée', () => {
        const flat = T.ROOT_NAMES_DEFAULT.slice(); flat[1] = 'Db';
        const sharp = T.ROOT_NAMES_DEFAULT.slice(); sharp[1] = 'C#';
        const on = (h) => h.className.includes('bg-[#2563eb]');
        assert.deepEqual(kb(1, flat)[1].halves.map(on), [false, true]);
        assert.deepEqual(kb(1, sharp)[1].halves.map(on), [true, false]);
        assert.deepEqual(kb(0, flat)[1].halves.map(on), [false, false]);
    });
    test('spellWith remplace une seule lettre', () => {
        assert.equal(V.spellWith('sssss', 2, 'f'), 'ssfss');
        assert.equal(V.spellWith('ffffs', 0, 's'), 'sfffs');
        assert.equal(V.spellWith('sssss', 4, 'f'), 'ssssf');
    });
});
