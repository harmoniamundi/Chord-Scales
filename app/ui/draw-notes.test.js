// Tests de ui/draw-notes.js (cadre de dessin libre) : format, simplification, gomme, presse-papiers.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./draw-notes.js');

describe('format enregistré', () => {
    test('lecture : taille, traits en écarts relatifs, surligneur', () => {
        const st = D.drawParse('320,200|1e293b.3:12,30,2,1,3,-1|DC2626.14h:40,40');
        assert.equal(st.w, 320); assert.equal(st.h, 200);
        assert.equal(st.strokes.length, 2);
        assert.deepEqual(st.strokes[0].p, [[12, 30], [14, 31], [17, 30]]);
        assert.equal(st.strokes[0].c, '#1e293b'); assert.equal(st.strokes[0].w, 3); assert.equal(st.strokes[0].h, false);
        assert.equal(st.strokes[1].c, '#dc2626'); assert.equal(st.strokes[1].h, true); assert.deepEqual(st.strokes[1].p, [[40, 40]]);
    });
    test('écriture canonique : l’inverse de la lecture', () => {
        const t = '320,200|1e293b.3:12,30,2,1,3,-1|dc2626.14h:40,40';
        assert.equal(D.drawFormat(D.drawParse(t)), t);
        assert.equal(D.drawCanon('320,200|DC2626.3:1,1'), '320,200|dc2626.3:1,1');
    });
    test('en-tête invalide : refusé ; trait invalide : ignoré', () => {
        assert.equal(D.drawParse('abc'), null);
        assert.equal(D.drawParse('320|0f172a.3:1,1'), null);
        assert.equal(D.drawParse(42), null);
        const st = D.drawParse('320,200|zz.3:1,1|0f172a.3:1,1,2|0f172a.3:5,5');   // couleur fausse, nombre impair de coordonnées, trait correct
        assert.equal(st.strokes.length, 1); assert.deepEqual(st.strokes[0].p, [[5, 5]]);
    });
    test('un cadre vide est valide ; taille et épaisseur ramenées dans les limites', () => {
        assert.equal(D.drawParse('320,200').strokes.length, 0);
        const st = D.drawParse('9999,10|0f172a.99:1,1');
        assert.equal(st.w, D.DR_W_MAX); assert.equal(st.h, D.DR_H_MIN);
        assert.equal(st.strokes[0].w, D.DR_STROKE_MAX);
    });
    test('limites : traits par cadre et longueur du texte', () => {
        const many = '320,200' + '|0f172a.3:1,1'.repeat(D.DR_MAX_STROKES + 20);
        assert.equal(D.drawParse(many).strokes.length, D.DR_MAX_STROKES);
        const long = '|0f172a.3:' + Array.from({ length: 500 }, (_, i) => `${(i * 7) % 90 + 100},${(i * 13) % 90 + 100}`).join(',');
        const st = D.drawParse('320,200' + long.repeat(120));
        assert.ok(D.drawFormat(st).length <= D.DR_MAX_LENGTH);
    });
    test('par défaut : 320 × 200, sans trait', () => {
        assert.equal(D.drawFormat(D.drawDefault()), '320,200');
    });
});

describe('traits', () => {
    test('simplification : une ligne droite se réduit à ses extrémités, un coude reste', () => {
        const line = Array.from({ length: 20 }, (_, i) => [i * 5, i * 5]);
        assert.deepEqual(D.drawSimplify(line, 0.8), [[0, 0], [95, 95]]);
        const angle = [[0, 0], [10, 0], [20, 0], [30, 0], [30, 10], [30, 20]];
        assert.deepEqual(D.drawSimplify(angle, 0.8), [[0, 0], [30, 0], [30, 20]]);
        assert.deepEqual(D.drawSimplify([[1, 1], [2, 2]], 1), [[1, 1], [2, 2]]);
    });
    test('simplification : un très long trait ne déborde pas la pile', () => {
        const wave = Array.from({ length: 20000 }, (_, i) => [i, Math.round(Math.sin(i / 7) * 30)]);
        assert.ok(D.drawSimplify(wave, 0.8).length > 100);
    });
    test('tracé : point seul, ligne, courbe lissée', () => {
        assert.equal(D.drawPathD([[5, 6]]), 'M5 6L5 6');
        assert.equal(D.drawPathD([[0, 0], [10, 10]]), 'M0 0L10 10');
        assert.equal(D.drawPathD([[0, 0], [10, 0], [10, 10]]), 'M0 0Q10 0 10 5L10 10');
    });
    test('surligneur translucide, trait plein sinon', () => {
        assert.match(D.drawStrokeAttrs({ c: '#ff0000', w: 10, h: true }), /stroke-opacity="0.38"/);
        assert.doesNotMatch(D.drawStrokeAttrs({ c: '#ff0000', w: 3, h: false }), /stroke-opacity/);
        assert.match(D.drawSvgInner(D.drawParse('320,200|0f172a.3:1,1,5,5')), /<path data-i="0"/);
    });
});

describe('modifications', () => {
    const base = D.drawParse('320,200|0f172a.3:10,10,50,0|dc2626.3:10,100,50,0');
    test('ajout : trait simplifié, original intact ; trait vide refusé', () => {
        const raw = Array.from({ length: 30 }, (_, i) => [i * 3, 40]);
        const next = D.drawAddStroke(base, '#16a34a', 4, false, raw);
        assert.equal(next.strokes.length, 3); assert.equal(base.strokes.length, 2);
        assert.deepEqual(next.strokes[2].p, [[0, 40], [87, 40]]);
        assert.equal(D.drawAddStroke(base, '#16a34a', 4, false, []), null);
    });
    test('gomme : rien touché → null ; un point touché disparaît ; le trait rouge reste', () => {
        const next = D.drawEraseAt(base, 30, 12, 4);
        assert.equal(next.strokes.length, 3); assert.equal(next.strokes[2].c, '#dc2626');
        assert.equal(D.drawEraseAt(base, 200, 200, 4), null);
        assert.equal(D.drawEraseAt(D.drawParse('320,200|0f172a.3:40,40'), 42, 41, 3).strokes.length, 0);   // un point
    });
    test('gomme : n\'efface que la partie touchée ; un trait coupé en deux donne deux traits', () => {
        const line = D.drawParse('320,200|0f172a.4:10,50,100,0');   // de (10,50) à (110,50)
        const next = D.drawEraseAt(line, 60, 50, 6);
        assert.equal(next.strokes.length, 2);
        const [a, b] = next.strokes;
        assert.equal(a.p[0][0], 10); assert.ok(a.p[a.p.length - 1][0] <= 60 - 6 && a.p[a.p.length - 1][0] > 40);
        assert.equal(b.p[b.p.length - 1][0], 110); assert.ok(b.p[0][0] >= 60 + 6 && b.p[0][0] < 80);
        assert.equal(line.strokes.length, 1);
        // le bout du trait : un seul morceau reste
        const end = D.drawEraseAt(line, 108, 50, 6);
        assert.equal(end.strokes.length, 1); assert.equal(end.strokes[0].p[0][0], 10); assert.ok(end.strokes[0].p[end.strokes[0].p.length - 1][0] < 104);
        // les autres traits ne bougent pas
        assert.deepEqual(D.drawEraseAt(base, 30, 12, 4).strokes[D.drawEraseAt(base, 30, 12, 4).strokes.length - 1].p, [[10, 100], [60, 100]]);
    });
    test('mise à l\'échelle : cadre, traits et épaisseurs suivent, bornes respectées', () => {
        const k = D.drawScale(base, 2);
        assert.equal(k.w, 640); assert.equal(k.h, 400);
        assert.deepEqual(k.strokes[0].p, [[20, 20], [120, 20]]); assert.equal(k.strokes[0].w, 6);
        assert.equal(base.w, 320); assert.equal(D.drawScale(base, 1), null);
        assert.equal(D.drawScale(base, 100).w, D.DR_W_MAX);   // plafonné (proportions gardées)
        assert.ok(D.drawScale(base, 0.01).h >= D.DR_H_MIN);
        assert.equal(D.drawScale(base, 'x'), null);
    });
    test('effacer tout, redimensionner', () => {
        assert.equal(D.drawClear(base).strokes.length, 0);
        assert.equal(D.drawClear(D.drawDefault()), null);
        const r = D.drawResize(base, 500, 300);
        assert.equal(r.w, 500); assert.equal(r.h, 300); assert.equal(r.strokes.length, 2);
        assert.equal(D.drawResize(base, 320, 200), null);
        assert.equal(D.drawResize(base, 5, 5).w, D.DR_W_MIN);
    });
});

describe('enregistrement et presse-papiers', () => {
    test('bloc enregistré : place et bord', () => {
        assert.equal(D.drawStubHtml(D.drawDefault(), { x: 10, y: 20 }, false), '<div class="annot-draw" data-draw="320,200" data-at="10,20" data-border="0"></div>');
    });
    test('un cadre copié se relit avec sa place et son bord', () => {
        const st = D.drawParse('320,200|0f172a.3:1,1,4,4');
        const txt = D.drawClipText(st, { at: { x: 30, y: 40 }, border: false });
        assert.equal(txt, '[dessin@30,40!:320,200|0f172a.3:1,1,4,4]');
        const parts = D.drawSplitClips(`avant ${txt} après`);
        assert.equal(parts.length, 3);
        assert.equal(parts[1].draw, '320,200|0f172a.3:1,1,4,4'); assert.deepEqual(parts[1].at, { x: 30, y: 40 }); assert.equal(parts[1].noBorder, true);
        assert.equal(parts[0].text, 'avant '); assert.equal(parts[2].text, ' après');
    });
    test('un repère invalide reste du texte ; les repères d’accords passent toujours', () => {
        assert.equal(D.drawSplitClips('[dessin:pas valide]')[0].text, '[dessin:pas valide]');
        const parts = D.drawSplitClips('[accords:b|0~maj7~4][dessin:320,200]');
        assert.equal(parts[0].chords, 'b|0~maj7~4'); assert.equal(parts[1].draw, '320,200');
    });
});

describe('fond du cadre', () => {
    test('lecture et écriture : « t » transparent, couleur rrggbb, rien = défaut', () => {
        assert.equal(D.drawParse('320,200,t|0f172a.3:1,1').bg, 't');
        assert.equal(D.drawParse('320,200,FEF3C7').bg, '#fef3c7');
        assert.equal(D.drawParse('320,200').bg, '');
        assert.equal(D.drawFormat(D.drawParse('320,200,t|0f172a.3:1,1,4,4')), '320,200,t|0f172a.3:1,1,4,4');
        assert.equal(D.drawFormat(D.drawParse('320,200,fef3c7')), '320,200,fef3c7');
        assert.equal(D.drawFormat(D.drawParse('320,200')), '320,200');
    });
    test('drawBg, drawBgCss, drawSetBg, drawClone', () => {
        assert.equal(D.drawBg('t'), 't'); assert.equal(D.drawBg('#ABCDEF'), '#abcdef'); assert.equal(D.drawBg('zz'), '');
        assert.equal(D.drawBgCss('t'), 'transparent'); assert.equal(D.drawBgCss('#fef3c7'), '#fef3c7'); assert.equal(D.drawBgCss(''), '');
        const st = D.drawParse('320,200|0f172a.3:1,1');
        const n = D.drawSetBg(st, 't');
        assert.equal(n.bg, 't'); assert.equal(st.bg, ''); assert.equal(D.drawSetBg(n, 't'), null);
        assert.equal(n.strokes.length, 1); assert.equal(D.drawSetBg(n, '#fef3c7').bg, '#fef3c7'); assert.equal(D.drawSetBg(n, '').bg, '');
    });
});

describe('lissage du tracé', () => {
    const jitter = (n) => Array.from({ length: n }, (_, i) => [i * 4, 50 + (i % 2 ? 3 : -3)]);
    const roughness = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.abs(p[1] - pts[i][1]), 0);
    test('niveau 0 : tracé inchangé ; extrémités toujours conservées', () => {
        const pts = jitter(20);
        assert.deepEqual(D.drawSmooth(pts, 0), pts);
        const s = D.drawSmooth(pts, 6);
        assert.deepEqual(s[0], pts[0]); assert.deepEqual(s[s.length - 1], pts[pts.length - 1]);
    });
    test('plus le niveau monte, moins le tracé tremble ; une droite reste droite', () => {
        const pts = jitter(30);
        const r = [0, 3, 10].map(l => roughness(D.drawSmooth(pts, l)));
        assert.ok(r[1] < r[0] && r[2] < r[1], r.join(' > '));
        const line = Array.from({ length: 12 }, (_, i) => [i * 5, 20 + i * 2]);
        D.drawSmooth(line, 8).forEach(p => assert.ok(Math.abs(p[1] - (20 + p[0] * 0.4)) < 0.6));
    });
    test('drawAddStroke lisse avant simplification (niveau demandé)', () => {
        const st = D.drawParse('320,200');
        const pts = jitter(30);
        const raw = D.drawAddStroke(st, '#000000', 3, false, pts, 0), sm = D.drawAddStroke(st, '#000000', 3, false, pts, 10);
        assert.ok(roughness(sm.strokes[0].p) < roughness(raw.strokes[0].p));
    });
});

describe('pression du stylet', () => {
    const ramp = Array.from({ length: 40 }, (_, i) => [i * 5, 50, 1 + (i % 9)]);   // pression qui varie
    test('niveaux : 0 → 1, 0,5 → 5, 1 → 9 ; facteur d\'épaisseur ¼ → 1 → 1,75', () => {
        assert.equal(D.drawPressureLevel(0), 1); assert.equal(D.drawPressureLevel(0.5), 5); assert.equal(D.drawPressureLevel(1), 9); assert.equal(D.drawPressureLevel(undefined), 5);
        assert.equal(D.drawLevelFactor(1), 0.25); assert.equal(D.drawLevelFactor(5), 1); assert.equal(D.drawLevelFactor(9), 1.75);
    });
    test('pression constante moyenne (souris, doigt) : rien d\'enregistré en plus', () => {
        const st = D.drawAddStroke(D.drawDefault(), '#000000', 3, false, Array.from({ length: 20 }, (_, i) => [i * 4, 30, 5]), 0);
        assert.equal(st.strokes[0].q, undefined);
        assert.doesNotMatch(D.drawFormat(st), /~/);
    });
    test('pression variable : un niveau par point, écrit après « ~ », relu à l\'identique', () => {
        const st = D.drawParse('320,200|0f172a.4:10,10,20,0,20,0~159');
        assert.deepEqual(st.strokes[0].q, [1, 5, 9]);
        assert.equal(D.drawFormat(st), '320,200|0f172a.4:10,10,20,0,20,0~159');
        // nombre de niveaux ≠ nombre de points : ignorés
        assert.equal(D.drawParse('320,200|0f172a.4:10,10,20,0~159').strokes[0].q, undefined);
    });
    test('ajout : la pression survit au lissage et à la simplification ; pas pour le surligneur', () => {
        const st = D.drawAddStroke(D.drawDefault(), '#000000', 4, false, ramp, 3);
        const q = st.strokes[0].q;
        assert.ok(q && q.length === st.strokes[0].p.length && Math.min(...q) < 4 && Math.max(...q) > 6);
        assert.equal(D.drawAddStroke(D.drawDefault(), '#000000', 12, true, ramp, 3).strokes[0].q, undefined);
        assert.deepEqual(D.drawParse(D.drawFormat(st)).strokes[0].q, q);
    });
    test('rendu : contour rempli pour un trait à pression, ligne pour les autres', () => {
        const st = D.drawAddStroke(D.drawDefault(), '#dc2626', 4, false, ramp, 3);
        assert.match(D.drawSvgInner(st), /fill="#dc2626" stroke="#dc2626"/);
        assert.match(D.drawSvgInner(D.drawParse('320,200|0f172a.3:10,10,50,0')), /fill="none"/);
        assert.match(D.drawVarPathD([[10, 10, 5]], 4), /^M8 10a2 2/);
    });
    test('gomme, copie et mise à l\'échelle gardent la pression', () => {
        const st = D.drawParse('320,200|0f172a.4:10,50,100,0~19');
        const cut = D.drawEraseAt(st, 60, 50, 6);
        assert.equal(cut.strokes.length, 2);
        cut.strokes.forEach(s => assert.equal(s.q.length, s.p.length));
        assert.ok(cut.strokes[0].q[cut.strokes[0].q.length - 1] > 1 && cut.strokes[1].q[0] < 9);   // niveaux interpolés aux bords de la coupe
        assert.deepEqual(D.drawScale(st, 2).strokes[0].q, [1, 9]);
    });
});
