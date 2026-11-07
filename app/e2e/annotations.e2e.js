// Test de bout en bout des portées de l'onglet « Annotations » (mode Jam), dans un vrai navigateur avec le vrai VexFlow (app/vendor) :
// police par défaut, cadre qui épouse la portée au repos, bouton « point », déplacement d'un bloc par sa poignée,
// copier / couper / coller d'une zone à l'autre, sauvegarde dans la grille. Ce que les tests unitaires ne voient pas : le dessin, la mesure
// du cadre, la sélection du navigateur, le presse-papiers.
// Installation (une fois) :   npm install   puis   npx playwright install chromium
// Lancer :                    npm run test:e2e
// Variable facultative :      CHROMIUM_PATH=/chemin/vers/chromium  pour utiliser un navigateur déjà installé.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let pw = null;
try { pw = require('playwright'); } catch (e) { /* non installé : les tests sont ignorés */ }

const ROOT = path.join(__dirname, '..', '..'); // dossier qui contient index.html
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff': 'font/woff', '.webmanifest': 'application/json', '.png': 'image/png' };

function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
            if (f.endsWith(path.sep)) f = path.join(f, 'index.html');
            if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            fs.readFile(f, (err, data) => {
                if (err) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
                res.end(data);
            });
        }).listen(0, () => resolve(srv));
    });
}

describe('annotations : portées (navigateur)', { skip: !pw && 'Playwright non installé : npm install && npx playwright install chromium' }, () => {
    let srv, browser;
    before(async () => {
        srv = await serve();
        browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
    });
    after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

    // Ouvre l'appli sur l'onglet Annotations, avec une mesure sélectionnée (la zone de droite est alors modifiable).
    async function openAnnotations() {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 1500 }, permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
        await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        await page.evaluate(() => app.jam.setVisMode('annotations'));
        await page.waitForSelector('#jam-annot-general');
        await page.click('#jam-chord-sequence-display .jam-cell >> nth=1');
        await page.waitForFunction(() => document.getElementById('jam-annot-measure').getAttribute('contenteditable') === 'true');
        return { page, errors, close: () => ctx.close() };
    }

    // Insère une portée dans la zone et y pose des notes (une noire à chaque clic), puis en sort par un clic sur le texte de la zone.
    async function addStaff(page, zoneSel, ys) {
        await page.click(zoneSel);
        await page.keyboard.press('Control+End');
        await page.click('[data-insert-staff]');
        await page.waitForSelector('.annot-staff.is-active');
        const box = await page.locator('.annot-staff.is-active .annot-staff-svg').boundingBox();
        let x = 110;
        for (const dy of ys) { await page.mouse.click(box.x + x, box.y + dy); x += 70; }
        const z = await page.locator(zoneSel).boundingBox();
        await page.mouse.click(z.x + 20, z.y + 15);
        await page.waitForTimeout(150);
    }

    const staves = (page, zoneSel) => page.evaluate((s) => Array.from(document.querySelectorAll(`${s} .annot-staff`)).map(e => {
        const r = e.getBoundingClientRect();
        return { st: e.getAttribute('data-staff'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), picked: e.classList.contains('is-picked'), active: e.classList.contains('is-active') };
    }), zoneSel);

    test('police Real Book par défaut, et plus de polices dans le menu', async () => {
        const { page, errors, close } = await openAnnotations();
        const r = await page.evaluate(async () => {
            await document.fonts.load('400 15px Kalam');
            const zone = document.getElementById('jam-annot-general');
            return { family: getComputedStyle(zone).fontFamily, kalam: document.fonts.check('15px Kalam'), selected: document.querySelector('#jam-annot-bar [data-font] option:checked').textContent,
                options: document.querySelectorAll('#jam-annot-bar [data-font] option').length };
        });
        assert.match(r.family, /^Kalam/);
        assert.ok(r.kalam, 'Kalam est chargée');
        assert.equal(r.selected, 'Real Book');
        assert.ok(r.options >= 15);
        assert.deepEqual(errors, []);
        await close();
    });

    test('au repos, le cadre épouse la portée ; le crayon ✎ ouvre l\'édition, un second clic la ferme', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45, 40]);
        const rest = (await staves(page, '#jam-annot-general'))[0];
        const zone = await page.evaluate(() => document.getElementById('jam-annot-general').clientWidth);
        assert.ok(!rest.active);
        assert.ok(rest.w < zone / 2, `cadre au repos étroit (${rest.w} px dans une zone de ${zone} px)`);
        assert.ok(rest.h < 110, `cadre au repos plus bas que la ligne d'édition (${rest.h} px)`);
        // un clic dans la portée au repos ne l'ouvre plus
        await page.click('#jam-annot-general .annot-staff .annot-staff-svg');
        assert.equal((await staves(page, '#jam-annot-general'))[0].active, false);
        // le crayon n'apparaît qu'au survol
        await page.mouse.move(5, 5);
        assert.equal(await page.locator('#jam-annot-general .annot-staff-edit').isVisible(), false);
        await page.hover('#jam-annot-general .annot-staff');
        assert.equal(await page.locator('#jam-annot-general .annot-staff-edit').isVisible(), true);
        await page.click('#jam-annot-general .annot-staff-edit');
        const edit = (await staves(page, '#jam-annot-general'))[0];
        assert.ok(edit.active);
        assert.ok(edit.w > zone - 60, `portée en édition large (${edit.w} px)`);
        assert.equal(await page.locator('#jam-annot-general .annot-staff-edit').isVisible(), true, 'le crayon reste visible en édition');
        await page.click('#jam-annot-general .annot-staff-edit');   // second clic : on sort de l'édition
        const back = (await staves(page, '#jam-annot-general'))[0];
        assert.ok(!back.active);
        assert.ok(back.w < zone / 2);
        assert.deepEqual(errors, []);
        await close();
    });

    test('bouton point : un second clic éteint le point des notes suivantes, et le bouton le montre', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-staff]');
        await page.waitForSelector('.annot-staff.is-active');
        const box = await page.locator('.annot-staff.is-active .annot-staff-svg').boundingBox();
        const dotOn = () => page.evaluate(() => document.querySelector('[data-mod="dot"]').classList.contains('is-on'));
        await page.click('[data-mod="dot"]');
        await page.mouse.click(box.x + 110, box.y + 50);          // note pointée
        assert.equal(await dotOn(), true, 'les notes suivantes seront pointées : le bouton reste allumé');
        await page.click('[data-mod="dot"]');
        assert.equal(await dotOn(), false, 'le second clic éteint le bouton');
        await page.mouse.click(box.x + 200, box.y + 45);          // note suivante
        await page.click('[data-dur="8"]');
        assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('[data-dur].is-on')).map(b => b.dataset.dur)), ['8'], 'la durée allumée est celle des notes suivantes');
        await page.mouse.click(box.x + 280, box.y + 40);
        assert.deepEqual(await page.evaluate(() => NSE_ACTIVE.st.ev.map(e => e.d + (e.dot ? '.' : ''))), ['q.', 'q', '8']);
        assert.deepEqual(errors, []);
        await close();
    });

    // Glisse la poignée du bloc n° `i` de `zoneSel` pour que son coin haut gauche tombe en (left, top).
    async function dragBlock(page, zoneSel, i, left, top, opts = {}) {
        const sel = `${zoneSel} .annot-staff >> nth=${i}`;
        await page.hover(sel);
        const grip = await page.locator(`${sel} >> .annot-staff-grip`).boundingBox();
        const r = (await staves(page, zoneSel))[i];
        const gx = grip.x + 10 - r.x, gy = grip.y + 10 - r.y;
        await page.mouse.move(grip.x + 10, grip.y + 10);
        await page.mouse.down();
        await page.mouse.move(grip.x + 40, grip.y + 30, { steps: 3 });
        if (opts.alt) await page.keyboard.down('Alt');
        await page.mouse.move(left + gx, top + gy, { steps: 8 });
        if (opts.stay) return;
        await page.mouse.up();
        if (opts.alt) await page.keyboard.up('Alt');
        await page.waitForTimeout(200);
    }
    const posOf = (page, zoneSel, i) => page.evaluate(([s, k]) => Array.from(document.querySelectorAll(`${s} .annot-staff`))[k].getAttribute('data-pos'), [zoneSel, i]);

    test('déplacement au pixel près, enregistré, annulable par ↶ et ⌘Z', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.keyboard.type('Intro: ');
        await addStaff(page, '#jam-annot-general', [50, 45, 40]);
        await addStaff(page, '#jam-annot-general', [60, 55]);
        const [a, b0] = await staves(page, '#jam-annot-general');
        assert.ok(b0.y > a.y, 'au départ, la seconde portée est sur une autre ligne');
        const goal = { left: a.x + a.w + 37, top: a.y + 13 };
        await dragBlock(page, '#jam-annot-general', 1, goal.left, goal.top, { stay: true });
        assert.ok(await page.evaluate(() => !!document.querySelector('.annot-drag-ghost')), 'aperçu pendant le glisser');
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await staves(page, '#jam-annot-general');
        assert.equal(after.length, 2);
        assert.ok(Math.abs(after[1].x - goal.left) <= 1 && Math.abs(after[1].y - goal.top) <= 1, `bloc déposé au pixel près (${after[1].x},${after[1].y} pour ${goal.left},${goal.top})`);
        assert.equal(after[1].st, 't,4/4,0;q:g4 q:a4', 'c\'est bien la portée déplacée');
        assert.match(await posOf(page, '#jam-annot-general', 1) || '', /^-?\d+,-?\d+$/);
        assert.ok(!await page.evaluate(() => !!document.querySelector('.annot-drag-ghost')), 'plus d\'aperçu après le dépôt');
        // enregistré dans la grille, et relu après un changement d'onglet
        assert.match(await page.evaluate(() => app.jam.gridNote), /data-staff="t,4\/4,0;q:g4 q:a4" data-pos="-?\d+,-?\d+"/);
        await page.evaluate(() => { app.jam.setVisMode('intervals'); app.jam.setVisMode('annotations'); });
        await page.waitForTimeout(200);
        const again = (await staves(page, '#jam-annot-general'))[1];
        assert.ok(Math.abs(again.x - after[1].x) <= 1 && Math.abs(again.y - after[1].y) <= 1, 'même place après relecture');
        // ⌘Z / Ctrl+Z annule le déplacement (sans saisie entre-temps), ⇧ le rétablit
        await dragBlock(page, '#jam-annot-general', 1, goal.left + 40, goal.top + 20);
        const moved = (await staves(page, '#jam-annot-general'))[1];
        assert.ok(Math.abs(moved.x - (goal.left + 40)) <= 1);
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(200);
        const undone = (await staves(page, '#jam-annot-general'))[1];
        assert.ok(Math.abs(undone.x - after[1].x) <= 1 && Math.abs(undone.y - after[1].y) <= 1, 'Ctrl+Z revient à la place d\'avant');
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(200);
        const redone = (await staves(page, '#jam-annot-general'))[1];
        assert.ok(Math.abs(redone.x - moved.x) <= 1 && Math.abs(redone.y - moved.y) <= 1, 'Ctrl+Maj+Z le rétablit');
        // le bouton ↶ de la grille l'annule aussi
        await page.click('#jam-undo-btn');
        await page.waitForTimeout(200);
        const viaBtn = (await staves(page, '#jam-annot-general'))[1];
        assert.ok(Math.abs(viaBtn.x - after[1].x) <= 1 && Math.abs(viaBtn.y - after[1].y) <= 1, '↶ revient à la place d\'avant');
        assert.deepEqual(errors, []);
        await close();
    });

    test('petit écart : retour à la place du texte (aimant), sauf avec Alt ; double-clic sur la poignée : retour à la place du texte', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45]);
        const a = (await staves(page, '#jam-annot-general'))[0];
        await dragBlock(page, '#jam-annot-general', 0, a.x + 30, a.y + 40);
        assert.ok(await posOf(page, '#jam-annot-general', 0), 'un vrai déplacement est gardé');
        await dragBlock(page, '#jam-annot-general', 0, a.x + 2, a.y + 1);
        assert.equal(await posOf(page, '#jam-annot-general', 0), null, 'à 3 pixels ou moins de sa place : aimanté');
        await dragBlock(page, '#jam-annot-general', 0, a.x + 2, a.y + 1, { alt: true });
        assert.equal(await posOf(page, '#jam-annot-general', 0), '2,1', 'Alt : pas d\'aimant, 2 pixels gardés');
        await page.hover('#jam-annot-general .annot-staff');
        await page.dblclick('#jam-annot-general .annot-staff-grip');
        assert.equal(await posOf(page, '#jam-annot-general', 0), null, 'double-clic : revenu à sa place');
        assert.deepEqual(errors, []);
        await close();
    });

    test('flèches : un bloc sélectionné se décale de 1 pixel (10 avec Maj), en une seule étape d\'annulation', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45]);
        const a = (await staves(page, '#jam-annot-general'))[0];
        await page.hover('#jam-annot-general .annot-staff');
        const g = await page.locator('#jam-annot-general .annot-staff-grip').boundingBox();
        await page.mouse.click(g.x + 10, g.y + 10);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Shift+ArrowRight');
        assert.equal(await posOf(page, '#jam-annot-general', 0), '12,1');
        const b = (await staves(page, '#jam-annot-general'))[0];
        assert.equal(b.x - a.x, 12);
        assert.equal(b.y - a.y, 1);
        assert.equal(b.picked, true, 'le bloc reste sélectionné');
        await page.keyboard.press('Control+z');           // une seule étape pour toute la série
        await page.waitForTimeout(200);
        assert.equal(await posOf(page, '#jam-annot-general', 0), null);
        assert.deepEqual(errors, []);
        await close();
    });

    test('un bloc ne sort pas de sa zone, et le déplacement vers l\'autre zone se fait au pixel près', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45]);
        const z = await page.locator('#jam-annot-general').boundingBox();
        await dragBlock(page, '#jam-annot-general', 0, z.x - 80, z.y - 60);       // au-delà du bord haut gauche
        let a = (await staves(page, '#jam-annot-general'))[0];
        assert.ok(a.x >= z.x - 1 && a.y >= z.y - 1, `ramené dans la zone (${a.x},${a.y} ; zone ${z.x},${z.y})`);
        const m = await page.locator('#jam-annot-measure').boundingBox();
        const goal = { left: m.x + 51, top: m.y + 44 };
        await dragBlock(page, '#jam-annot-general', 0, goal.left, goal.top);
        assert.equal((await staves(page, '#jam-annot-general')).length, 0);
        const inM = await staves(page, '#jam-annot-measure');
        assert.equal(inM.length, 1);
        assert.ok(Math.abs(inM[0].x - goal.left) <= 1 && Math.abs(inM[0].y - goal.top) <= 1, `déposé au pixel près dans l'autre zone (${inM[0].x},${inM[0].y})`);
        assert.deepEqual(errors, []);
        await close();
    });

    test('Échap annule un déplacement', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45]);
        const before = await page.evaluate(() => document.getElementById('jam-annot-general').innerHTML);
        await page.hover('#jam-annot-general .annot-staff');
        const g = await page.locator('#jam-annot-general .annot-staff-grip').boundingBox();
        await page.mouse.move(g.x + 10, g.y + 10);
        await page.mouse.down();
        await page.mouse.move(g.x + 120, g.y + 70, { steps: 5 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        assert.equal(await page.evaluate(() => document.getElementById('jam-annot-general').innerHTML), before);
        assert.ok(!await page.evaluate(() => !!document.querySelector('.annot-drag-ghost')));
        assert.deepEqual(errors, []);
        await close();
    });

    test('copier, coller dans l\'autre zone, couper, supprimer, et enregistrement dans la grille', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.keyboard.type('Intro: ');
        await addStaff(page, '#jam-annot-general', [50, 45, 40]);
        // clic sur la poignée : le bloc est sélectionné ; ⌘C / Ctrl+C le copie
        await page.hover('#jam-annot-general .annot-staff');
        let g = await page.locator('#jam-annot-general .annot-staff-grip').boundingBox();
        await page.mouse.click(g.x + 10, g.y + 10);
        assert.equal((await staves(page, '#jam-annot-general'))[0].picked, true);
        await page.keyboard.press('Control+c');
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '[portée:t,4/4,0;q:b4 q:c5 q:d5]');
        // collage dans la zone de la mesure, deux fois : les portées se rangent côte à côte
        await page.click('#jam-annot-measure');
        await page.keyboard.press('Control+v');
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(200);
        const m = await staves(page, '#jam-annot-measure');
        assert.equal(m.length, 2);
        assert.equal(m[0].y, m[1].y);
        // couper la seconde et la coller à la fin de la zone générale
        await page.hover('#jam-annot-measure .annot-staff >> nth=1');
        g = await page.locator('#jam-annot-measure .annot-staff >> nth=1 >> .annot-staff-grip').boundingBox();
        await page.mouse.click(g.x + 10, g.y + 10);
        await page.keyboard.press('Control+x');
        await page.waitForTimeout(150);
        assert.equal((await staves(page, '#jam-annot-measure')).length, 1);
        await page.click('#jam-annot-general');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(150);
        assert.equal((await staves(page, '#jam-annot-general')).length, 2);
        // un bloc sélectionné s'enlève avec Suppr.
        await page.hover('#jam-annot-measure .annot-staff');
        g = await page.locator('#jam-annot-measure .annot-staff-grip').boundingBox();
        await page.mouse.click(g.x + 10, g.y + 10);
        await page.keyboard.press('Delete');
        assert.equal((await staves(page, '#jam-annot-measure')).length, 0);
        // enregistrement : la grille garde la portée de la zone générale (et son texte), même après un changement d'onglet
        await page.mouse.click(5, 5);
        await page.waitForTimeout(800);
        const saved = await page.evaluate(() => app.jam.gridNote);
        assert.equal((saved.match(/data-staff=/g) || []).length, 2);
        assert.ok(saved.startsWith('Intro:'));
        await page.evaluate(() => { app.jam.setVisMode('intervals'); app.jam.setVisMode('annotations'); });
        await page.waitForTimeout(200);
        assert.equal((await staves(page, '#jam-annot-general')).length, 2);
        assert.deepEqual(errors, []);
        await close();
    });

    test('une sélection qui mélange texte et portée se copie et se colle avec ses portées', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.keyboard.type('Début ');
        await addStaff(page, '#jam-annot-general', [50, 45]);
        await page.click('#jam-annot-general');
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' fin');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+c');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(clip, /^Début \[portée:t,4\/4,0;q:b4 q:c5\]\s*\n? ?fin$/);
        await page.click('#jam-annot-measure');
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(200);
        assert.equal((await staves(page, '#jam-annot-measure')).length, 1);
        assert.match(await page.evaluate(() => document.getElementById('jam-annot-measure').textContent), /Début/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('la portée se remet en page quand la zone se rétrécit, sans perdre ses notes', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-staff]');
        await page.waitForSelector('.annot-staff.is-active');
        const box = await page.locator('.annot-staff.is-active .annot-staff-svg').boundingBox();
        let x = 110;
        for (let i = 0; i < 12; i++) { await page.mouse.click(box.x + x, box.y + 50 - (i % 3) * 5); x += 40; }
        const z = await page.locator('#jam-annot-general').boundingBox();
        await page.mouse.click(z.x + 15, z.y + 12);
        await page.waitForTimeout(150);
        const lines = () => page.evaluate(() => { const v = document.querySelector('#jam-annot-general .annot-staff').__noteStaff; const r = document.querySelector('#jam-annot-general .annot-staff').getBoundingClientRect(); return { lines: v.geo.lines.length, w: r.width, zone: document.getElementById('jam-annot-general').clientWidth }; });
        const wide = await lines();
        await page.setViewportSize({ width: 420, height: 1500 });
        await page.waitForTimeout(600);
        const narrow = await lines();
        assert.ok(narrow.lines > wide.lines, `plus de lignes dans une zone étroite (${wide.lines} → ${narrow.lines})`);
        assert.ok(narrow.w <= narrow.zone, 'le cadre reste dans la zone');
        assert.equal(await page.evaluate(() => document.querySelector('#jam-annot-general .annot-staff').getAttribute('data-staff').split(';')[1].split(' ').length), 12);
        assert.deepEqual(errors, []);
        await close();
    });
});
