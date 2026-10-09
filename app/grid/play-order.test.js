// Tests de l'ordre de lecture (grid/play-order.js) : reprises, 1re/2e fin, plage jouée, bloc suivant. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./play-order.js');

// Bloc de grille ; les accords sont étiquetés par leur fondamentale pour lire les parcours.
const blk = (rootIndex, measures = 1, extra = {}) => ({ rootIndex, chordId: 'maj7', scaleId: 'ionian', measures, ...extra });
// Joue la grille comme le moteur (compteur de passages réel) et renvoie les fondamentales jouées jusqu'à la fin de la grille.
function play(grid, max = 80) {
    const passes = {};
    const order = [];
    let cur = 0;
    for (let k = 0; k < max; k++) {
        order.push(grid[cur].rootIndex);
        const info = P.nextStepInfo(grid, cur, passes);
        if (info.wrapped) break;
        cur = info.idx;
    }
    return order;
}
const A = 0, B = 1, C = 2, D = 3, E = 4;

describe('lecture sans reprise', () => {
    test('les blocs se jouent dans l’ordre puis la grille est terminée', () => {
        assert.deepEqual(play([blk(A), blk(B), blk(C)]), [A, B, C]);
    });
    test('grille vide : terminée tout de suite', () => {
        assert.deepEqual(P.nextStepInfo([], 0, {}), { idx: 0, wrapped: true });
    });
    test('un seul bloc : terminé après lui', () => {
        assert.deepEqual(P.nextStepInfo([blk(A)], 0, {}), { idx: 0, wrapped: true });
    });
});

describe('reprises |: :|', () => {
    test('reprise ×2 : |: A B :| C', () => {
        assert.deepEqual(play([blk(A, 1, { repeatStart: true }), blk(B, 1, { repeatEnd: 2 }), blk(C)]), [A, B, A, B, C]);
    });
    test('reprise ×3', () => {
        assert.deepEqual(play([blk(A, 1, { repeatStart: true }), blk(B, 1, { repeatEnd: 3 }), blk(C)]), [A, B, A, B, A, B, C]);
    });
    test('sans signe de début : la reprise revient au début de la grille', () => {
        assert.deepEqual(play([blk(A), blk(B, 1, { repeatEnd: 2 }), blk(C)]), [A, B, A, B, C]);
    });
    test('deux reprises successives', () => {
        const g = [blk(A, 1, { repeatStart: true }), blk(B, 1, { repeatEnd: 2 }), blk(C, 1, { repeatStart: true }), blk(D, 1, { repeatEnd: 2 })];
        assert.deepEqual(play(g), [A, B, A, B, C, D, C, D]);
    });
    test('reprise sur un seul bloc', () => {
        assert.deepEqual(play([blk(A, 1, { repeatStart: true, repeatEnd: 2 }), blk(B)]), [A, A, B]);
    });
    test('la reprise est rejouée en entier si la grille boucle (compteurs remis à zéro)', () => {
        const g = [blk(A, 1, { repeatStart: true }), blk(B, 1, { repeatEnd: 2 })];
        const passes = {};
        let cur = 0;
        const first = [];
        for (let k = 0; k < 4; k++) { first.push(g[cur].rootIndex); const i = P.nextStepInfo(g, cur, passes); cur = i.idx; }
        assert.deepEqual(first, [A, B, A, B]);
        assert.equal(passes[1], 1);
    });
});

describe('1re et 2e fin', () => {
    // |: A B [1. C :|] [2. D]
    const g = () => [blk(A, 1, { repeatStart: true }), blk(B), blk(C, 1, { volta: 1, repeatEnd: 2 }), blk(D, 1, { volta: 2 })];
    test('la 1re fin n’est jouée qu’au premier passage', () => {
        assert.deepEqual(play(g()), [A, B, C, A, B, D]);
    });
    test('une 1re fin qui couvre plusieurs blocs jusqu’au :| (seul le début est marqué)', () => {
        const grid = [blk(A, 1, { repeatStart: true }), blk(B, 1, { volta: 1 }), blk(C, 1, { repeatEnd: 2 }), blk(D, 1, { volta: 2 })];
        assert.deepEqual(P.effectiveVolta(grid), [0, 1, 1, 2]);
        assert.deepEqual(play(grid), [A, B, C, A, D]);
    });
    test('effectiveVolta : 0 sans marque, la 2e fin garde son numéro', () => {
        assert.deepEqual(P.effectiveVolta(g()), [0, 0, 1, 2]);
    });
    test('repeatRegions : début, fin, nombre de passages et blocs de 1re fin', () => {
        const r = P.repeatRegions(g());
        assert.equal(r.length, 1);
        assert.deepEqual([r[0].start, r[0].end, r[0].times], [0, 2, 2]);
        assert.deepEqual([...r[0].owned], [2]);
    });
});

describe('nextStepInfo : compteur de passages', () => {
    const g = [blk(A, 1, { repeatStart: true }), blk(B, 1, { repeatEnd: 3 }), blk(C)];
    test('modifie le compteur fourni (lecture réelle)', () => {
        const passes = {};
        assert.deepEqual(P.nextStepInfo(g, 1, passes), { idx: 0, wrapped: false });
        assert.equal(passes[1], 2);
        assert.deepEqual(P.nextStepInfo(g, 1, passes), { idx: 0, wrapped: false });
        assert.equal(passes[1], 3);
        assert.deepEqual(P.nextStepInfo(g, 1, passes), { idx: 2, wrapped: false });
        assert.equal(passes[1], 1);
    });
    test('une consultation sur une copie ne change rien', () => {
        const passes = {};
        P.peekNextIndex(g, 1, { playRange: null, loopEnabled: false, passes });
        assert.deepEqual(passes, {});
    });
});

describe('mesures à plat et plage jouée', () => {
    const g = [blk(A, 2), blk(B, 1, { split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } }), blk(C, 3)];
    test('flatMeasureList : une entrée par mesure, numérotées de 1, avec le rang dans le bloc', () => {
        const f = P.flatMeasureList(g);
        assert.equal(f.length, 6);
        assert.deepEqual(f.map(x => x.measureNumber), [1, 2, 3, 4, 5, 6]);
        assert.deepEqual(f.map(x => x.stepIndex), [0, 0, 1, 2, 2, 2]);
        assert.deepEqual(f.map(x => x.measureInStep), [1, 2, 1, 1, 2, 3]);
        assert.equal(f[2].split.chordId, '7');
        assert.equal(f[0].split, null);
    });
    test('stepStartMeasure et stepSpan', () => {
        assert.deepEqual([0, 1, 2].map(i => P.stepStartMeasure(g, i)), [1, 3, 4]);
        assert.deepEqual(P.stepSpan(g, 2), { first: 4, last: 6 });
        assert.deepEqual(P.stepSpan(g, 0), { first: 1, last: 2 });
    });
    test('stepOfMeasure : bloc et rang ; au-delà de la fin, dernière mesure', () => {
        assert.deepEqual(P.stepOfMeasure(g, 2), { idx: 0, measureInStep: 2 });
        assert.deepEqual(P.stepOfMeasure(g, 3), { idx: 1, measureInStep: 1 });
        assert.deepEqual(P.stepOfMeasure(g, 99), { idx: 2, measureInStep: 3 });
    });
    test('computePlayRange : pas de sélection, ou sélection de toute la grille → lecture normale', () => {
        assert.equal(P.computePlayRange(null, 6), null);
        assert.equal(P.computePlayRange({ from: 1, to: 6 }, 6), null);
        assert.equal(P.computePlayRange({ from: 1, to: 99 }, 6), null);
        assert.equal(P.computePlayRange({ from: 2, to: 4 }, 6).from, 2);
        assert.deepEqual(P.computePlayRange({ from: 0, to: 3 }, 6), { from: 1, to: 3 });
        assert.deepEqual(P.computePlayRange({ from: 5, to: 2 }, 6), { from: 5, to: 5 });
        assert.equal(P.computePlayRange({ from: 2, to: 3 }, 0), null);
    });
});

describe('peekNextIndex : bloc suivant pour l’affichage et la basse', () => {
    const g = [blk(A), blk(B), blk(C)];
    const opts = (o = {}) => ({ playRange: null, loopEnabled: false, passes: {}, ...o });
    test('au milieu : le bloc suivant', () => {
        assert.equal(P.peekNextIndex(g, 0, opts()), 1);
    });
    test('à la fin sans boucle : -1 ; avec boucle : retour au début', () => {
        assert.equal(P.peekNextIndex(g, 2, opts()), -1);
        assert.equal(P.peekNextIndex(g, 2, opts({ loopEnabled: true })), 0);
    });
    test('plage jouée B seul : fin de plage sans boucle → -1 ; avec boucle → retour au début de la plage', () => {
        const playRange = { from: 2, to: 2 };
        assert.equal(P.peekNextIndex(g, 1, opts({ playRange })), -1);
        assert.equal(P.peekNextIndex(g, 1, opts({ playRange, loopEnabled: true })), 1);
    });
    test('plage A-B : le bloc A est suivi de B, B se termine la plage', () => {
        const playRange = { from: 1, to: 2 };
        assert.equal(P.peekNextIndex(g, 0, opts({ playRange })), 1);
        assert.equal(P.peekNextIndex(g, 1, opts({ playRange, loopEnabled: true })), 0);
    });
    test('une reprise qui sortirait de la plage est ignorée', () => {
        const gr = [blk(A, 1, { repeatStart: true }), blk(B), blk(C, 1, { repeatEnd: 2 }), blk(D)];
        // plage B-C : au :| de C on retournerait en A (hors plage) → on ne saute pas
        const playRange = { from: 2, to: 3 };
        assert.equal(P.peekNextIndex(gr, 1, opts({ playRange })), 2);
    });
});

describe('sameChordStep et accord suivant affiché', () => {
    test('même accord : fondamentale, qualité, gamme et second accord', () => {
        assert.equal(P.sameChordStep(blk(A), blk(A, 4)), true);
        assert.equal(P.sameChordStep(blk(A), blk(B)), false);
        assert.equal(P.sameChordStep(blk(A), { ...blk(A), chordId: 'm7' }), false);
        assert.equal(P.sameChordStep(blk(A), { ...blk(A), scaleId: 'lydian' }), false);
        const split = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
        assert.equal(P.sameChordStep(blk(A, 1, { split }), blk(A)), false);
        assert.equal(P.sameChordStep(blk(A, 1, { split }), blk(A, 2, { split: { ...split } })), true);
        assert.equal(P.sameChordStep(null, blk(A)), false);
    });
    test('un accord répété compte pour un seul : le suivant affiché est le premier accord différent', () => {
        const g = [blk(A), blk(A), blk(A), blk(B)];
        const o = { playRange: null, loopEnabled: false, passes: {} };
        assert.equal(P.peekNextIndex(g, 0, o), 1);        // le vrai suivant (basse)
        assert.equal(P.peekNextDisplayIndex(g, 0, o), 3); // l'affiché saute les répétitions
    });
    test('répétition jusqu’à la fin : rien sans boucle, le début avec boucle', () => {
        const g = [blk(B), blk(A), blk(A)];
        assert.equal(P.peekNextDisplayIndex(g, 1, { playRange: null, loopEnabled: false, passes: {} }), -1);
        assert.equal(P.peekNextDisplayIndex(g, 1, { playRange: null, loopEnabled: true, passes: {} }), 0);
    });
    test('grille entièrement sur le même accord : pas de boucle infinie', () => {
        const g = [blk(A), blk(A)];
        assert.equal(P.peekNextDisplayIndex(g, 0, { playRange: null, loopEnabled: true, passes: {} }), 1);
    });
});
