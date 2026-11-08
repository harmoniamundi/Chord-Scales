// Tests du canevas des annotations (ui/annot-canvas.js) : rectangles, repères d'alignement, aimant, première place libre.
// La sélection (clic, rectangle, Maj / ⌘), le glisser et les repères affichés se testent dans un navigateur (e2e/annotations.e2e.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./annot-canvas.js');

const R = (x, y, w, h) => ({ x, y, w, h });

describe('acBounds : rectangle qui englobe un groupe', () => {
    test('un seul bloc : lui-même', () => assert.deepEqual(C.acBounds([R(10, 20, 30, 40)]), R(10, 20, 30, 40)));
    test('plusieurs blocs, même séparés ou superposés', () => {
        assert.deepEqual(C.acBounds([R(10, 20, 30, 40), R(100, 5, 10, 10)]), R(10, 5, 100, 55));
        assert.deepEqual(C.acBounds([R(0, 0, 50, 50), R(10, 10, 5, 5)]), R(0, 0, 50, 50));
    });
    test('aucun bloc : null', () => assert.equal(C.acBounds([]), null));
});

describe('acIntersects : deux blocs se recouvrent-ils', () => {
    test('recouvrement partiel, inclusion', () => {
        assert.equal(C.acIntersects(R(0, 0, 10, 10), R(5, 5, 10, 10)), true);
        assert.equal(C.acIntersects(R(0, 0, 100, 100), R(40, 40, 5, 5)), true);
    });
    test('séparés, ou simplement côte à côte : non', () => {
        assert.equal(C.acIntersects(R(0, 0, 10, 10), R(20, 0, 10, 10)), false);
        assert.equal(C.acIntersects(R(0, 0, 10, 10), R(10, 0, 10, 10)), false);
        assert.equal(C.acIntersects(R(0, 0, 10, 10), R(0, 10, 10, 10)), false);
    });
});

describe('acNormRect : rectangle de sélection tiré dans n\'importe quel sens', () => {
    test('vers le bas à droite, ou vers le haut à gauche : le même', () => {
        assert.deepEqual(C.acNormRect(10, 20, 50, 80), R(10, 20, 40, 60));
        assert.deepEqual(C.acNormRect(50, 80, 10, 20), R(10, 20, 40, 60));
        assert.deepEqual(C.acNormRect(50, 20, 10, 80), R(10, 20, 40, 60));
    });
});

describe('acClampMove : un groupe ne sort pas de la zone par le haut, la gauche ou la droite', () => {
    test('déplacement libre au milieu de la zone', () => assert.deepEqual(C.acClampMove(R(50, 50, 40, 20), 10, -5, 400), { dx: 10, dy: -5 }));
    test('bloqué par le bord gauche et par le bord haut', () => assert.deepEqual(C.acClampMove(R(10, 8, 40, 20), -30, -30, 400), { dx: -10, dy: -8 }));
    test('bloqué par le bord droit s\'il tient dans la zone', () => assert.deepEqual(C.acClampMove(R(300, 0, 80, 20), 100, 0, 400), { dx: 20, dy: 0 }));
    test('plus large que la zone : la droite ne le retient pas', () => assert.deepEqual(C.acClampMove(R(0, 0, 500, 20), 30, 0, 400), { dx: 30, dy: 0 }));
    test('vers le bas : toujours libre (la zone défile)', () => assert.deepEqual(C.acClampMove(R(0, 0, 40, 20), 0, 900, 400), { dx: 0, dy: 900 }));
    test('résultat arrondi au pixel', () => assert.deepEqual(C.acClampMove(R(50, 50, 40, 20), 3.4, 2.6, 400), { dx: 3, dy: 3 }));
});

describe('acSnap : repères d\'alignement et aimant', () => {
    const zone = { w: 600, h: 400 };
    const other = R(200, 100, 100, 60);          // bords : x 200 / 250 / 300 ; y 100 / 130 / 160

    test('rien à moins du seuil : ni repère ni déplacement', () => {
        const r = C.acSnap(R(400, 300, 50, 30), [other], zone);
        assert.deepEqual(r, { dx: 0, dy: 0, guides: [] });
    });
    test('bord gauche à 4 px du bord gauche d\'un autre bloc : l\'aimant le ramène, un repère vertical apparaît', () => {
        const r = C.acSnap(R(204, 250, 33, 30), [other], zone);
        assert.equal(r.dx, -4);
        assert.equal(r.dy, 0);
        assert.deepEqual(r.guides.map(g => [g.axis, g.at]), [['x', 200]]);
    });
    test('sans aimant (snap = false), le repère s\'affiche mais le bloc ne bouge pas', () => {
        const r = C.acSnap(R(204, 250, 33, 30), [other], zone, C.AC_SNAP, false);
        assert.equal(r.dx, 0);
        assert.deepEqual(r.guides.map(g => [g.axis, g.at]), [['x', 200]]);
    });
    test('milieu contre milieu, et bord droit contre bord droit', () => {
        assert.equal(C.acSnap(R(223, 300, 50, 30), [other], zone).dx, 2);          // milieu 248 -> 250
        assert.equal(C.acSnap(R(254, 300, 50, 30), [other], zone).dx, -4);         // bord droit 304 -> 300
    });
    test('alignement en hauteur : repère horizontal', () => {
        const r = C.acSnap(R(400, 103, 50, 33), [other], zone);
        assert.equal(r.dy, -3);
        assert.deepEqual(r.guides.map(g => [g.axis, g.at]), [['y', 100]]);
    });
    test('les deux axes à la fois', () => {
        const r = C.acSnap(R(197, 103, 33, 33), [other], zone);
        assert.deepEqual([r.dx, r.dy], [3, -3]);
        assert.equal(r.guides.length, 2);
    });
    test('le bord gauche, le milieu et le bord droit de la zone sont aussi des repères', () => {
        assert.equal(C.acSnap(R(3, 300, 50, 30), [], zone).dx, -3);
        assert.equal(C.acSnap(R(275, 300, 50, 30), [], zone).dx, 0);               // milieu du bloc 300 = milieu de la zone
        assert.equal(C.acSnap(R(548, 300, 50, 30), [], zone).dx, 2);               // bord droit 598 -> 600
        assert.equal(C.acSnap(R(100, 4, 50, 30), [], zone).dy, -4);                // bord haut de la zone
    });
    test('le plus proche l\'emporte quand plusieurs repères sont à portée', () => {
        const a = R(100, 0, 40, 10), b = R(105, 0, 40, 10);
        assert.equal(C.acSnap(R(104, 200, 20, 10), [a, b], zone).dx, 1);           // 104 -> 105 (1 px) plutôt que 100 (4 px)
    });
    test('seuil personnalisé', () => {
        assert.equal(C.acSnap(R(210, 300, 50, 30), [other], zone, 12).dx, -10);
        assert.equal(C.acSnap(R(210, 300, 50, 30), [other], zone, 6).dx, 0);
    });
    test('un trait d\'alignement couvre le groupe et le bloc repère', () => {
        const g = C.acSnap(R(204, 250, 33, 30), [other], zone).guides[0];
        assert.ok(g.from <= 100 && g.to >= 280, `trait de ${g.from} à ${g.to}`);
    });
    test('plusieurs blocs alignés entre eux : un seul trait pour la même position', () => {
        const r = C.acSnap(R(203, 300, 33, 30), [other, R(200, 250, 30, 30)], zone);
        assert.equal(r.guides.filter(g => g.axis === 'x' && g.at === 200).length, 1);
    });
});

describe('acFreeSpot : première place libre pour un nouveau bloc', () => {
    test('zone vide : le coin, avec la marge', () => assert.deepEqual(C.acFreeSpot([]), { x: C.AC_MARGIN, y: C.AC_MARGIN }));
    test('un bloc déjà posé là : le suivant se décale en cascade', () => {
        const first = C.acFreeSpot([]);
        const second = C.acFreeSpot([R(first.x, first.y, 100, 40)]);
        assert.deepEqual(second, { x: first.x + C.AC_CASCADE, y: first.y + C.AC_CASCADE });
        const third = C.acFreeSpot([R(first.x, first.y, 100, 40), R(second.x, second.y, 100, 40)]);
        assert.deepEqual(third, { x: first.x + 2 * C.AC_CASCADE, y: first.y + 2 * C.AC_CASCADE });
    });
    test('départ indiqué (double-clic) : on s\'y pose, ou à côté si la place est prise', () => {
        assert.deepEqual(C.acFreeSpot([], { x: 80, y: 60 }), { x: 80, y: 60 });
        assert.deepEqual(C.acFreeSpot([R(80, 60, 50, 20)], { x: 80, y: 60 }), { x: 80 + C.AC_CASCADE, y: 60 + C.AC_CASCADE });
    });
    test('toujours une place, même zone très encombrée', () => {
        const rects = [];
        for (let k = 0; k < 60; k++) rects.push(R(C.AC_MARGIN + k * C.AC_CASCADE, C.AC_MARGIN + k * C.AC_CASCADE, 10, 10));
        const p = C.acFreeSpot(rects);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    });
});

describe('zoom de lecture : acClampZoom, acZoomStep, acZoomWheel, acZoomOffset, acZoomScroll', () => {
    test('acClampZoom : bornes 50 % – 300 %, valeur invalide = 100 %', () => {
        assert.equal(C.acClampZoom(1), 1);
        assert.equal(C.acClampZoom(0.1), C.AC_ZOOM_MIN);
        assert.equal(C.acClampZoom(9), C.AC_ZOOM_MAX);
        assert.equal(C.acClampZoom('1.5'), 1.5);
        assert.equal(C.acClampZoom('abc'), 1);
        assert.equal(C.acClampZoom(null), 1);
        assert.equal(C.acClampZoom(-2), 1);
        assert.equal(C.acClampZoom(1.23456), 1.23);
    });
    test('les crans sont croissants, bornes comprises, et contiennent 100 %', () => {
        const s = C.AC_ZOOM_STEPS;
        assert.ok(s.every((v, i) => i === 0 || v > s[i - 1]));
        assert.equal(s[0], C.AC_ZOOM_MIN);
        assert.equal(s[s.length - 1], C.AC_ZOOM_MAX);
        assert.ok(s.includes(1));
    });
    test('acZoomStep : cran suivant / précédent, même depuis une valeur intermédiaire, et arrêt aux bornes', () => {
        assert.equal(C.acZoomStep(1, 1), 1.25);
        assert.equal(C.acZoomStep(1, -1), 0.8);
        assert.equal(C.acZoomStep(1.1, 1), 1.25);
        assert.equal(C.acZoomStep(1.1, -1), 1);
        assert.equal(C.acZoomStep(C.AC_ZOOM_MAX, 1), C.AC_ZOOM_MAX);
        assert.equal(C.acZoomStep(C.AC_ZOOM_MIN, -1), C.AC_ZOOM_MIN);
        let z = 1; for (let i = 0; i < 20; i++) z = C.acZoomStep(z, 1);
        assert.equal(z, C.AC_ZOOM_MAX);
    });
    test('acZoomWheel : molette vers le haut agrandit, vers le bas réduit, avec un cran maximal et les bornes', () => {
        assert.ok(C.acZoomWheel(1, -5) > 1);
        assert.ok(C.acZoomWheel(1, 5) < 1);
        assert.equal(C.acZoomWheel(1, 0), 1);
        assert.equal(C.acZoomWheel(1, -1000), C.acZoomWheel(1, -30)); // un seul événement ne fait pas sauter le zoom
        assert.equal(C.acZoomWheel(C.AC_ZOOM_MAX, -30), C.AC_ZOOM_MAX);
        assert.equal(C.acZoomWheel(C.AC_ZOOM_MIN, 30), C.AC_ZOOM_MIN);
        assert.equal(C.acZoomWheel(1, 'x'), 1);
    });
    test('acZoomOffset : le bloc posé en (x, y) se retrouve en (x·z, y·z) après scale(z) autour de son coin', () => {
        assert.deepEqual(C.acZoomOffset({ x: 100, y: 20 }, 1), { x: 0, y: 0 });
        assert.deepEqual(C.acZoomOffset({ x: 100, y: 20 }, 2), { x: 100, y: 20 });
        assert.deepEqual(C.acZoomOffset({ x: 100, y: 20 }, 0.5), { x: -50, y: -10 });
        assert.deepEqual(C.acZoomOffset({}, 2), { x: 0, y: 0 });
    });
    test('acZoomScroll : le point sous le pointeur reste en place', () => {
        // pointeur à 60 px sans défilement à 100 % : le point de contenu est à 60 ; après ×2 il serait à 120 → défilement 60 pour le garder sous le pointeur
        const s1 = C.acZoomScroll(0, 60, 1, 2);
        assert.equal(s1, 60);
        assert.equal((0 + 60) / 1, (s1 + 60) / 2);
        const s2 = C.acZoomScroll(30, 10, 2, 1.5);
        assert.ok(Math.abs((30 + 10) / 2 - (s2 + 10) / 1.5) < 1e-9);
        assert.equal(C.acZoomScroll(0, 10, 2, 1), 0); // jamais négatif
    });
});

describe('acZoomOf : zoom d\'une zone', () => {
    test('1 sans zone ou sans réglage, sinon le zoom posé par la page', () => {
        assert.equal(C.acZoomOf(null), 1);
        assert.equal(C.acZoomOf({}), 1);
        assert.equal(C.acZoomOf({ __zoom: 0 }), 1);
        assert.equal(C.acZoomOf({ __zoom: 'x' }), 1);
        assert.equal(C.acZoomOf({ __zoom: 1.5 }), 1.5);
    });
});
