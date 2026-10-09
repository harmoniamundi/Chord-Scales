// Tests de cohérence des tables de patterns (band-patterns.js). Lancer : node --test
// Les tables sont des données : ces tests attrapent les fautes de saisie (position hors mesure,
// vélocité absurde, poids nul, type de frappe inconnu) sans avoir à lancer l'audio.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./band-patterns.js');

// Parcourt récursivement un objet et appelle `fn(chemin, cellule)` pour chaque cellule { w, hits }.
function eachCell(node, path, fn) {
    if (Array.isArray(node)) { node.forEach((x, i) => eachCell(x, `${path}[${i}]`, fn)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.w === 'number' && Array.isArray(node.hits)) { fn(path, node); return; }
    for (const k of Object.keys(node)) eachCell(node[k], `${path}.${k}`, fn);
}
const allCells = (root, name) => { const out = []; eachCell(root, name, (p, c) => out.push([p, c])); return out; };

describe('forme générale', () => {
    test('toutes les tables attendues sont exportées', () => {
        for (const k of ['BAND_PATTERNS', 'METER_LIB', 'TERN_LIB', 'CUBA', 'bandCell']) assert.ok(P[k], k);
    });
    test('bandCell(w, hits) construit une cellule', () => {
        assert.deepEqual(P.bandCell(3, [[0, 1, 'C', 0.8]]), { w: 3, hits: [[0, 1, 'C', 0.8]] });
    });
    test('les mesures 6/8, 9/8 et 12/8 partagent la bibliothèque ternaire', () => {
        assert.equal(P.METER_LIB['6/8'], P.TERN_LIB);
        assert.equal(P.METER_LIB['9/8'], P.TERN_LIB);
        assert.equal(P.METER_LIB['12/8'], P.TERN_LIB);
    });
});

describe('BAND_PATTERNS (mesure à 4 temps)', () => {
    const styles = Object.keys(P.BAND_PATTERNS);
    test('les styles connus sont présents', () => {
        for (const s of ['swing', 'pop', 'latin', 'classic', 'brass', 'piazzolla', 'balkan']) assert.ok(styles.includes(s), s);
    });
    for (const style of styles) {
        const def = P.BAND_PATTERNS[style];
        test(`${style} : probabilités entre 0 et 1, au moins un pattern de piano`, () => {
            assert.ok(def.rootlessProb >= 0 && def.rootlessProb <= 1);
            assert.ok(def.fillProb >= 0 && def.fillProb <= 1);
            assert.ok(Array.isArray(def.piano) && def.piano.length > 0);
        });
        test(`${style} : cellules valides (poids > 0, positions dans la mesure, vélocités ≤ 1)`, () => {
            for (const [path, cell] of allCells(def, style)) {
                assert.ok(Number.isFinite(cell.w) && cell.w > 0, `${path} : poids ${cell.w}`);
                for (const hit of cell.hits) {
                    assert.ok(Array.isArray(hit), `${path} : frappe invalide`);
                    assert.ok(Number.isFinite(hit[0]) && hit[0] >= 0 && hit[0] < 4, `${path} : position ${hit[0]}`);
                    const vel = hit[hit.length - 1];
                    if (typeof vel === 'number') assert.ok(vel > 0 && vel <= 1, `${path} : vélocité ${vel}`);
                }
            }
        });
    }
    test('frappes de piano : types connus (accord, dyade, note guide, arpège 0-3)', () => {
        for (const style of styles) {
            for (const cell of P.BAND_PATTERNS[style].piano) {
                for (const [, dur, type] of cell.hits) {
                    assert.ok(dur > 0, `${style} : durée ${dur}`);
                    assert.ok(['C', 'S', 'N'].includes(type) || [0, 1, 2, 3].includes(type), `${style} : type ${type}`);
                }
            }
        }
    });
    test('frappes de basse : degrés connus', () => {
        const known = ['R', '3', '5', '7', 'O', 'A', 'nR', 'n5'];
        for (const style of styles) {
            const bass = P.BAND_PATTERNS[style].bass;
            if (!bass) continue;
            for (const [path, cell] of allCells(bass, `${style}.bass`)) {
                for (const [, degree] of cell.hits) assert.ok(known.includes(degree), `${path} : degré ${degree}`);
            }
        }
    });
});

describe('METER_LIB (mesures 2/4, 3/4 et ternaires)', () => {
    test('mesures prises en charge', () => {
        assert.deepEqual(Object.keys(P.METER_LIB).sort(), ['12/8', '2/4', '3/4', '6/8', '9/8']);
    });
    test('chaque mesure définit swing, pop, latin et classic', () => {
        for (const [meter, lib] of Object.entries(P.METER_LIB)) {
            for (const s of ['swing', 'pop', 'latin', 'classic']) assert.ok(lib[s], `${meter} ${s}`);
        }
    });
    test('cellules valides (poids > 0, position ≥ 0, vélocité ≤ 1)', () => {
        for (const [meter, lib] of Object.entries(P.METER_LIB)) {
            for (const [path, cell] of allCells(lib, meter)) {
                assert.ok(Number.isFinite(cell.w) && cell.w > 0, `${path} : poids ${cell.w}`);
                for (const hit of cell.hits) {
                    assert.ok(Number.isFinite(hit[0]) && hit[0] >= 0, `${path} : position ${hit[0]}`);
                    const vel = hit[hit.length - 1];
                    if (typeof vel === 'number') assert.ok(vel > 0 && vel <= 1, `${path} : vélocité ${vel}`);
                }
            }
        }
    });
    test('les positions restent dans la mesure (3/4 : 3 temps, 2/4 : 2 temps)', () => {
        for (const [meter, beats] of [['3/4', 3], ['2/4', 2]]) {
            for (const [path, cell] of allCells(P.METER_LIB[meter], meter)) {
                for (const hit of cell.hits) assert.ok(hit[0] < beats, `${path} : position ${hit[0]} ≥ ${beats}`);
            }
        }
    });
});

describe('CUBA (cloche de bembé, clave, guajeos, basse, congas)', () => {
    for (const [name, frame] of [['ternary', 12], ['binary', 16]]) {
        const t = P.CUBA[name];
        test(`${name} : cadre de ${frame} croches`, () => assert.equal(t.frame, frame));
        test(`${name} : tous les coups tombent dans le cadre, avec une vélocité valide`, () => {
            const inFrame = (pos, what) => assert.ok(Number.isInteger(pos) && pos >= 0 && pos < frame, `${name} ${what} : ${pos}`);
            for (const pos of Object.keys(t.bellVel)) { inFrame(Number(pos), 'cloche'); assert.ok(t.bellVel[pos] > 0 && t.bellVel[pos] <= 1); }
            if (t.clave) for (const pos of Object.keys(t.clave)) { inFrame(Number(pos), 'clave'); assert.ok(t.clave[pos] > 0 && t.clave[pos] <= 1); }
            for (const g of t.guajeos) for (const [pos, voice, vel] of g.hits) {
                inFrame(pos, 'guajeo');
                assert.ok(Number.isInteger(voice) && voice >= 0, `${name} guajeo : voix ${voice}`);
                assert.ok(vel > 0 && vel <= 1, `${name} guajeo : vélocité ${vel}`);
            }
        });
    }
    test('binaire : clave de son 3-2 (3 coups sur la 1re mesure, 2 sur la seconde)', () => {
        const pos = Object.keys(P.CUBA.binary.clave).map(Number);
        assert.equal(pos.filter(p => p < 8).length, 3);
        assert.equal(pos.filter(p => p >= 8).length, 2);
    });
});
