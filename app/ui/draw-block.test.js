// Tests de ui/draw-block.js : la fenêtre d'outils (HTML pur, sans navigateur).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { drawEditorHtml, drbWidthFor } = require('./draw-block.js');

const pen = (o) => Object.assign({ tool: 'pen', color: '#dc2626', width: 3, smooth: 3, eraser: 18, fit: true }, o);
const html = (o, v) => drawEditorHtml(Object.assign({ pen: pen(o), canUndo: false, canRedo: false, hasStrokes: false }, v));

describe('fenêtre d\'outils du dessin', () => {
    test('trois outils, l\'outil courant est allumé', () => {
        const h = html({ tool: 'hl' });
        assert.match(h, /data-dr="tool" data-v="pen"[^>]*aria-pressed="false"/);
        assert.match(h, /class="jm-chip is-on" data-dr="tool" data-v="hl"/);
        assert.match(h, /data-dr="tool" data-v="eraser"/);
    });
    test('couleurs : la palette, la couleur courante marquée, « autre couleur » pour une teinte hors palette', () => {
        const h = html({ color: '#dc2626' });
        assert.match(h, /class="dr-sw is-on" data-dr="color" data-v="#dc2626"/);
        assert.equal((h.match(/data-dr="color"/g) || []).length, 9);
        assert.doesNotMatch(h, /dr-sw-custom is-on/);
        const h2 = html({ color: '#123456' });
        assert.match(h2, /dr-sw-custom is-on" title="Autre couleur…" style="background:#123456"/);
        assert.match(h2, /type="color" data-dr="custom" value="#123456"/);
    });
    test('épaisseur : curseur de 1 à 20, valeur affichée ; lissage de 0 à 10', () => {
        const h = html({ width: 8, smooth: 5 });
        assert.match(h, /data-dr="width" min="1" max="20" step="1" value="8"/);
        assert.match(h, /<output class="dr-val" data-out="width">8 px<\/output>/);
        assert.match(h, /data-dr="smooth" min="0" max="10" step="1" value="5"/);
        assert.match(h, /<output class="dr-val" data-out="smooth">5<\/output>/);
    });
    test('gomme : taille réglable (6 à 60 px) à la place de l\'épaisseur et du lissage', () => {
        const h = html({ tool: 'eraser', eraser: 24 });
        assert.match(h, /data-dr="erasersize" min="6" max="60" step="1" value="24"/);
        assert.match(h, /data-out="erasersize">24 px</);
        assert.doesNotMatch(h, /data-dr="width"/);
        assert.doesNotMatch(h, /data-dr="smooth"/);
        assert.doesNotMatch(html({}), /data-dr="erasersize"/);
    });
    test('fond du cadre : transparent, palette, autre couleur ; blanc par défaut', () => {
        const h = html({});
        assert.match(h, /dr-sw-none" data-dr="bg" data-v="t"/);
        assert.match(h, /class="dr-sw is-on" data-dr="bg" data-v="#ffffff"/);
        assert.equal((h.match(/data-dr="bg"/g) || []).length, 9);
        assert.match(html({}, { bg: 't' }), /dr-sw-none is-on" data-dr="bg" data-v="t"/);
        assert.match(html({}, { bg: '#fef3c7' }), /class="dr-sw is-on" data-dr="bg" data-v="#fef3c7"/);
        const h2 = html({}, { bg: '#123456' });
        assert.match(h2, /dr-sw-custom is-on" title="Autre fond…" style="background:#123456"/);
        assert.match(h2, /data-dr="bgcustom" value="#123456"/);
    });
    test('« Le dessin suit le cadre » : allumé par défaut, éteignable', () => {
        assert.match(html({}), /class="jm-chip is-on" data-dr="fit" aria-pressed="true"/);
        assert.match(html({ fit: false }), /class="jm-chip" data-dr="fit" aria-pressed="false"/);
    });
    test('« Pression du stylet » : allumée par défaut, seulement avec le crayon', () => {
        assert.match(html({}), /class="jm-chip is-on" data-dr="pressure" aria-pressed="true"/);
        assert.match(html({ pressure: false }), /class="jm-chip" data-dr="pressure" aria-pressed="false"/);
        assert.doesNotMatch(html({ tool: 'hl' }), /data-dr="pressure"/);
        assert.doesNotMatch(html({ tool: 'eraser' }), /data-dr="pressure"/);
    });
    test('surligneur : plus épais que le crayon, plafonné à 40', () => {
        assert.equal(drbWidthFor({ tool: 'pen', width: 5 }), 5);
        assert.equal(drbWidthFor({ tool: 'hl', width: 5 }), 15);
        assert.equal(drbWidthFor({ tool: 'hl', width: 20 }), 40);
    });
    test('annuler, rétablir et tout effacer grisés tant qu\'ils ne servent à rien', () => {
        const h = html({});
        assert.match(h, /data-dr="undo"[^>]*disabled/);
        assert.match(h, /data-dr="redo"[^>]*disabled/);
        assert.match(h, /data-dr="clear"[^>]*disabled/);
        const h2 = html({}, { canUndo: true, canRedo: true, hasStrokes: true });
        assert.doesNotMatch(h2, /data-dr="undo"[^>]*disabled/);
        assert.doesNotMatch(h2, /data-dr="redo"[^>]*disabled/);
        assert.doesNotMatch(h2, /data-dr="clear"[^>]*disabled/);
    });
    test('bouton Terminé', () => {
        assert.match(html({}), /data-dr="done"/);
    });
});
