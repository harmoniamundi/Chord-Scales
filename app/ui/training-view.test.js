// Tests de l'écran Entraînement (ui/training-view.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../theory.js');
const V = require('./training-view.js');
const H = require('../grid/harmony.js');

const maj7 = T.chordTypes.maj.find(c => c.id === 'maj7');
const labels = T.ROOT_NAMES_DEFAULT.slice();
const ctxOf = (over = {}) => ({
    scalesDb: T.scalesDb, rootName: 'C', chordObj: maj7, scaleDirections: {},
    showAvoidNotes: false, showCharacteristic: false, showTargetNotes: false, visMode: 'letters',
    angloToFrench: (a) => a, ...over,
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
    test('onglet Harmonisation : accords du degré, pas de portée', () => {
        const ctx = ctxOf({ visMode: 'harmony', rootIndex: 0, harmonyTriads: false, findChordObj: (id) => T.lookupChord(id), jazz: (id) => H.jazzChordNotation(id), selected: { rootIndex: 0, chordId: 'maj7' } });
        const m = V.trainingScaleCard(ctx, { id: 'ionian', role: 'x' }, 0);
        assert.equal(m.staffTask, null);
        assert.equal((m.html.match(/th-chip/g) || []).length >= 7, true);
        assert.ok(m.html.includes("app.chooseHarmonyChord('ionian-0', 7, '7')"));
        assert.ok(m.html.includes("app.chooseHarmonyChord('ionian-0', 7, '7', true)"));
        assert.ok(!m.html.includes('toggleScalePlayback'));
    });
    test('onglet Harmonisation : l\'accord choisi de la carte s\'affiche à côté du nom de la gamme', () => {
        const base = { visMode: 'harmony', rootIndex: 0, harmonyTriads: false, findChordObj: (id) => T.lookupChord(id), jazz: (id) => H.jazzChordNotation(id), selected: { rootIndex: 0, chordId: 'maj7' } };
        const head = (html) => html.slice(0, html.indexOf('<p class="text-xs'));
        // par défaut : l'accord du sélecteur de gauche, s'il fait partie de la gamme
        let m = V.trainingScaleCard(ctxOf(base), { id: 'ionian', role: 'x' }, 0);
        assert.ok(head(m.html).includes('data-chord="0:maj7"') && head(m.html).includes('>CΔ</span>'));
        assert.ok(head(m.html).indexOf('</h3>') < head(m.html).indexOf('th-sel'));
        // l'accord choisi dans la carte passe avant : le nom joue l'arpège sans changer de choix, chaque note se joue
        m = V.trainingScaleCard(ctxOf({ ...base, harmonySel: { 'ionian-0': { rootIndex: 7, chordId: '7' } } }), { id: 'ionian', role: 'x' }, 0);
        assert.ok(head(m.html).includes('data-chord="7:7"'));
        assert.ok(head(m.html).includes("app.playHarmonyArpeggio(7, '7')"));
        assert.equal((head(m.html).match(/app\.playHarmonyNote\(7, /g) || []).length, 4);
        assert.ok(m.html.includes("app.chooseHarmonyChord('ionian-0', 7, '7')"));
        assert.ok(m.html.includes("app.chooseHarmonyChord('ionian-0', 7, '7', true)"));
        // hors de l'onglet : rien
        m = V.trainingScaleCard(ctxOf({ ...base, visMode: 'intervals' }), { id: 'ionian', role: 'x' }, 0);
        assert.ok(!m.html.includes('th-sel'));
    });
    test('onglet Intervalles : degrés par défaut (octave 1), tensions sur demande (octave 8)', () => {
        const item = { id: 'ionian', role: 'x' };
        const spans = (html) => [...html.matchAll(/<span onclick="app\.playSingleNote[^>]*>([^<]*)<\/span>/g)].map(x => x[1]);
        const deg = spans(V.trainingScaleCard(ctxOf({ visMode: 'intervals' }), item, 0).html);
        assert.equal(deg[0], '1');
        assert.equal(deg[deg.length - 1], '1');
        const ten = spans(V.trainingScaleCard(ctxOf({ visMode: 'intervals', intervalStyle: 'tensions' }), item, 0).html);
        assert.equal(ten[ten.length - 1], '8');
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

describe('cartes de l\'onglet Carte', () => {
    const mapCtx = (over = {}) => ({
        scalesDb: T.scalesDb, rootIndex: 0, chordId: 'maj7', harmonyTriads: false, rootLabels: labels,
        findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0], jazz: (id) => H.jazzChordNotation(id), ...over,
    });
    test('CΔ : une carte par gamme, Do majeur d\'abord puis Sol majeur', () => {
        const cards = V.trainingMapCards(mapCtx());
        assert.equal(cards.length, 18);
        assert.deepEqual(cards.slice(0, 2).map(c => c.scaleKey), ['map-ionian-0', 'map-ionian-7']);
        assert.match(cards[0].html, /<h3[^>]*>C Ionien \(Gamme majeure\)<\/h3>/);
        assert.match(cards[0].html, /tm-fn-T/);
        assert.match(cards[0].html, /Tonique/);
        assert.match(cards[1].html, /<h3[^>]*>G Ionien \(Gamme majeure\)<\/h3>/);
        assert.match(cards[1].html, /tm-fn-SD/);
        assert.match(cards[1].html, /Sous-dominante/);
        cards.forEach(c => assert.ok(c.className.includes('rounded-xl')));
    });
    test('chaque carte harmonise la gamme en entier et marque l\'accord cherché', () => {
        V.trainingMapCards(mapCtx()).forEach(c => {
            assert.equal((c.html.match(/class="jm-chip th-chip/g) || []).length, 7, c.scaleKey);
            assert.equal((c.html.match(/data-hit=/g) || []).length, 1, c.scaleKey);
        });
    });
    test('clic = accord plaqué et « >> » = arpège, par le moteur de l\'Entraînement', () => {
        const html = V.trainingMapCards(mapCtx())[0].html;
        assert.ok(html.includes("app.playHarmonyChord(0, 'maj7')"));
        assert.ok(html.includes("app.playHarmonyArpeggio(7, '7')"));
    });
    test('mode entonnoir : un clic sélectionne / désélectionne au lieu de seulement jouer ; les accords supplémentaires filtrent', () => {
        const funnel = V.trainingMapCards(mapCtx({ funnel: true, extra: [{ rootIndex: 7, chordId: '7' }] }));
        assert.ok(funnel.length > 0 && funnel.length < 18);
        const html = funnel[0].html;
        assert.ok(html.includes("app.mapToggleChord(0, 'maj7', 0)"), 'accord principal : rang 0');
        assert.ok(html.includes("app.mapToggleChord(7, '7', 1)"), 'accord supplémentaire : rang 1 (pour le retirer)');
        assert.ok(html.includes("app.mapToggleChord(2, 'm7', -1)"), 'autre accord : -1 (pour l\'ajouter)');
        assert.ok(!html.includes('app.playHarmonyChord'));
        assert.equal((html.match(/data-hit=/g) || []).length, 2);
    });
    test('en triades, les accords affichés sont des triades', () => {
        const html = V.trainingMapCards(mapCtx({ harmonyTriads: true }))[0].html;
        assert.ok(html.includes("app.playHarmonyChord(0, 'majTriad')"));
        assert.ok(!html.includes('maj7\')'));
    });
    test('accord sans gamme harmonisée (7alt) : aucune carte', () => {
        assert.deepEqual(V.trainingMapCards(mapCtx({ chordId: '7alt' })), []);
    });
});

describe('boutons de navigation et de choix', () => {
    test('barre du haut : actif en gris clair, inactif discret', () => {
        assert.equal(V.navButtonClass(true), 'px-3 py-1 rounded-md bg-[#3a3a3c] text-white transition shadow-sm');
        assert.equal(V.navButtonClass(false), 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition');
    });
    test('groupes à choix unique (transposition)', () => {
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

describe('orthographe des touches noires', () => {
    test('spellWith remplace une seule lettre', () => {
        assert.equal(V.spellWith('sssss', 2, 'f'), 'ssfss');
        assert.equal(V.spellWith('ffffs', 0, 's'), 'sfffs');
        assert.equal(V.spellWith('sssss', 4, 'f'), 'ssssf');
    });
});
