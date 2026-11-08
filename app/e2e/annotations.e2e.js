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

    // Point du corps du bloc n° `i` (jamais le crayon du coin haut gauche) : c'est là qu'on le saisit.
    const bodyPoint = async (page, zoneSel, i = 0) => { const r = (await staves(page, zoneSel))[i]; return { x: Math.round(r.x + r.w * 0.6), y: Math.round(r.y + r.h / 2) }; };
    const clickBlock = async (page, zoneSel, i = 0) => { const q = await bodyPoint(page, zoneSel, i); await page.mouse.click(q.x, q.y); };

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
        // le crayon n'apparaît qu'au survol (ou quand le bloc est sélectionné)
        const zb = await page.locator('#jam-annot-general').boundingBox();
        await page.mouse.click(zb.x + 20, zb.y + zb.height - 20);   // clic dans le texte : le bloc n'est plus sélectionné
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

    // Glisse le bloc n° `i` de `zoneSel` (saisi par son corps) pour que son coin haut gauche tombe en (left, top).
    async function dragBlock(page, zoneSel, i, left, top, opts = {}) {
        const r = (await staves(page, zoneSel))[i];
        const q = await bodyPoint(page, zoneSel, i);
        const gx = q.x - r.x, gy = q.y - r.y;
        await page.mouse.move(q.x, q.y);
        await page.mouse.down();
        await page.mouse.move(q.x + 40, q.y + 30, { steps: 3 });
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
        const both = await staves(page, '#jam-annot-general');   // la barre a disparu entre-temps : on compare les blocs entre eux
        assert.ok(Math.abs((both[1].x - both[0].x) - (after[1].x - after[0].x)) <= 1 && Math.abs((both[1].y - both[0].y) - (after[1].y - after[0].y)) <= 1, 'même place après relecture');
        // ⌘Z / Ctrl+Z annule le déplacement (sans saisie entre-temps), ⇧ le rétablit ; on compare la place du bloc par rapport au premier
        const rel = async () => { const [p, q] = await staves(page, '#jam-annot-general'); return { x: q.x - p.x, y: q.y - p.y }; };
        const same = (u, v) => Math.abs(u.x - v.x) <= 1 && Math.abs(u.y - v.y) <= 1;
        const start = await rel();
        const before = (await staves(page, '#jam-annot-general'))[1];
        await dragBlock(page, '#jam-annot-general', 1, before.x + 40, before.y + 20);
        const moved = await rel();
        assert.ok(!same(moved, start), 'le bloc a bougé');
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(200);
        assert.ok(same(await rel(), start), 'Ctrl+Z revient à la place d\'avant');
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(200);
        assert.ok(same(await rel(), moved), 'Ctrl+Maj+Z le rétablit');
        // le bouton ↶ de la grille l'annule aussi
        await page.click('#jam-undo-btn');
        await page.waitForTimeout(200);
        assert.ok(same(await rel(), start), '↶ revient à la place d\'avant');
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
        const dq = await bodyPoint(page, '#jam-annot-general');
        await page.mouse.dblclick(dq.x, dq.y);
        assert.equal(await posOf(page, '#jam-annot-general', 0), null, 'double-clic : revenu à sa place');
        assert.deepEqual(errors, []);
        await close();
    });

    test('flèches : un bloc sélectionné se décale de 1 pixel (10 avec Maj), en une seule étape d\'annulation', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, '#jam-annot-general', [50, 45]);
        const a = (await staves(page, '#jam-annot-general'))[0];
        await clickBlock(page, '#jam-annot-general');
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
        const g = await bodyPoint(page, '#jam-annot-general');
        await page.mouse.move(g.x, g.y);
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
        // un clic sur le bloc le sélectionne ; ⌘C / Ctrl+C le copie
        await clickBlock(page, '#jam-annot-general');
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
        await clickBlock(page, '#jam-annot-measure', 1);
        await page.keyboard.press('Control+x');
        await page.waitForTimeout(150);
        assert.equal((await staves(page, '#jam-annot-measure')).length, 1);
        await page.click('#jam-annot-general');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(150);
        assert.equal((await staves(page, '#jam-annot-general')).length, 2);
        // un bloc sélectionné s'enlève avec Suppr.
        await clickBlock(page, '#jam-annot-measure');
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

    test('la barre de mise en forme n\'apparaît que pendant l\'édition, et les zones prennent la place libre', async () => {
        const { page, errors, close } = await openAnnotations();
        const bar = () => page.locator('#jam-annot-bar').isVisible();
        const zoneH = () => page.evaluate(() => Math.round(document.getElementById('jam-annot-general').getBoundingClientRect().height));
        assert.equal(await bar(), false, 'pas de barre quand on n\'édite pas');
        const idleH = await zoneH();
        await page.click('#jam-annot-general');
        assert.equal(await bar(), true, 'la barre apparaît quand on édite');
        assert.ok(await zoneH() < idleH, 'les zones cèdent la place à la barre');
        await page.mouse.click(5, 5);                                // clic ailleurs : on sort de l\'édition
        await page.waitForTimeout(150);
        assert.equal(await bar(), false, 'la barre disparaît en sortant');
        assert.equal(await zoneH(), idleH, 'les zones reprennent la place');
        // un bloc portée choisi d\'un clic ne fait pas surgir la barre (rien ne bouge sous le pointeur)
        await addStaff(page, '#jam-annot-general', [50, 45]);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        const y0 = (await staves(page, '#jam-annot-general'))[0].y;
        await clickBlock(page, '#jam-annot-general');
        assert.equal(await bar(), false, 'pas de barre pour un bloc choisi');
        assert.equal((await staves(page, '#jam-annot-general'))[0].y, y0, 'le bloc ne bouge pas');
        // le crayon ouvre l\'édition de la portée : la barre vient avec ses outils
        await page.hover('#jam-annot-general .annot-staff');
        await page.click('#jam-annot-general .annot-staff-edit');
        assert.equal(await bar(), true);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        assert.equal(await bar(), false);
        // jam lancée : plus de barre, même en éditant la zone de gauche
        await page.click('#jam-annot-general');
        assert.equal(await bar(), true);
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        assert.equal(await bar(), false, 'pas de barre pendant la jam');
        assert.deepEqual(errors, []);
        await close();
    });

    test('panneau « Antisèches » : nom, masquable (mode normal et plein écran), la grille prend la place', async () => {
        const { page, errors, close } = await openAnnotations();
        assert.equal((await page.locator('#jam-scales-card h3').first().textContent()).trim(), 'Antisèches');
        const grid = () => page.evaluate(() => Math.round(document.getElementById('jam-chord-card').getBoundingClientRect().height));
        const h0 = await grid();
        await page.click('#jam-antiseche-btn');
        assert.equal(await page.locator('#jam-scales-card').isVisible(), false);
        assert.ok(await grid() > h0 + 100, `la grille prend la place libérée (${h0} → ${await grid()})`);
        assert.equal(await page.getAttribute('#jam-antiseche-btn', 'aria-pressed'), 'false');
        await page.click('#jam-antiseche-btn');
        assert.equal(await page.locator('#jam-scales-card').isVisible(), true);
        assert.equal(await grid(), h0);
        // plein écran, jam lancée : les antisèches occupent toute la largeur libre ; masquées, la grille reprend leur place
        await page.evaluate(() => app.jam.toggleGridFullscreen());
        await page.waitForTimeout(500);
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        await page.waitForTimeout(200);
        const w = await page.evaluate(() => ({ card: document.getElementById('jam-scales-card').getBoundingClientRect().width, vw: window.innerWidth }));
        assert.ok(w.card > w.vw - 60, `antisèches sur toute la largeur en plein écran (${w.card} px sur ${w.vw})`);
        const seq = () => page.evaluate(() => Math.round(document.getElementById('jam-chord-sequence-display').getBoundingClientRect().height));
        const s0 = await seq();
        await page.click('#jam-antiseche-btn');
        assert.equal(await page.locator('#jam-scales-card').isVisible(), false);
        assert.ok(await seq() > s0 + 100, 'la grille prend la place en plein écran aussi');
        // le choix est gardé d\'une visite à l\'autre
        assert.equal(await page.evaluate(() => localStorage.getItem('jamAntisechesHidden')), '1');
        assert.deepEqual(errors, []);
        await close();
    });

    test('portée réduite à 50 %, et indication de mesure plus petite que la portée', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-staff]');
        await page.waitForSelector('.annot-staff.is-active');
        const sig = () => page.evaluate(() => { const g = document.querySelector('.annot-staff-svg .vf-timesignature'); const q = g.getBoundingClientRect(); const st = document.querySelector('.annot-staff-svg .vf-stave').getBoundingClientRect(); return { sig: q.height, staff: st.height, tr: g.getAttribute('transform') }; });
        const a = await sig();
        assert.match(a.tr || '', /scale\(0\.\d+\)/);
        assert.ok(a.sig <= a.staff + 2, `indication de mesure (${Math.round(a.sig)} px) pas plus haute que la portée (${Math.round(a.staff)} px) ; non réduite elle ferait le double`);
        assert.equal(await page.getAttribute('[data-set="size"]', 'min'), '50');
        const w0 = (await page.locator('.annot-staff.is-active svg').boundingBox()).height;
        await page.evaluate(() => { const r = document.querySelector('[data-set="size"]'); r.value = '50'; r.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForTimeout(200);
        assert.match(await page.getAttribute('.annot-staff', 'data-staff'), /^t,4\/4,0,50;/);
        const w1 = (await page.locator('.annot-staff.is-active svg').boundingBox()).height;
        assert.ok(Math.abs(w1 - w0 / 2) < 3, `la portée est deux fois plus petite (${w0} → ${w1})`);
        assert.deepEqual(errors, []);
        await close();
    });
    // ----- Cadres de texte -----
    const frameBox = (page, zoneSel = '#jam-annot-general', i = 0) => page.evaluate(({ s, i }) => {
        const f = document.querySelectorAll(`${s} .annot-frame`)[i];
        const r = f.getBoundingClientRect(), b = f.querySelector('.annot-frame-body').getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bw: b.width, bh: b.height, frame: f.getAttribute('data-frame'), pos: f.getAttribute('data-pos'), editing: f.classList.contains('is-editing'), picked: f.classList.contains('is-picked') };
    }, { s: zoneSel, i });
    const frameCursor = (page, zoneSel = '#jam-annot-general') => page.evaluate((s) => getComputedStyle(document.querySelector(`${s} .annot-frame`)).cursor, zoneSel);

    test('barre : plus de « Coller portée », bouton « Cadre », effacer la mise en forme = un symbole', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        assert.equal(await page.locator('#jam-annot-bar [data-paste-staff]').count(), 0);
        assert.ok(!(await page.innerText('#jam-annot-bar')).includes('Coller portée'));
        assert.equal(await page.locator('#jam-annot-bar [data-insert-frame]').count(), 1);
        const clear = page.locator('#jam-annot-bar [data-clear]');
        assert.equal(await clear.locator('svg').count(), 1);
        assert.equal((await clear.innerText()).trim(), '');
        assert.match(await clear.getAttribute('title'), /^Effacer la mise en forme/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre de texte : création, écriture mise en forme, sortie, enregistrement', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-frame]');
        await page.waitForSelector('#jam-annot-general .annot-frame.is-editing');
        assert.match(await page.evaluate(() => document.activeElement.className), /annot-frame-body/);
        await page.keyboard.type('Bonjour le cadre');
        await page.keyboard.press('Shift+Home');
        await page.click('[data-cmd="bold"]');
        assert.match(await page.innerHTML('#jam-annot-general .annot-frame-body'), /<b>|font-weight/);
        assert.match(await page.evaluate(() => document.activeElement.className), /annot-frame-body/, 'la barre ne prend pas le focus');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#jam-annot-general .annot-frame').classList.contains('is-editing'));
        assert.equal(await page.evaluate(() => document.querySelector('#jam-annot-general .annot-frame-body').getAttribute('contenteditable')), null);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'jam-annot-general');
        await page.waitForTimeout(900);
        const saved = await page.evaluate(() => app.jam.gridNote);
        assert.match(saved, /<div class="annot-frame" data-frame="\d+"/);
        assert.ok(saved.includes('Bonjour le cadre'));
        // pas de portée dans un cadre : « Portée » place la portée après lui
        await page.hover('#jam-annot-general .annot-frame');
        await page.click('#jam-annot-general .annot-frame-edit');
        await page.waitForSelector('#jam-annot-general .annot-frame.is-editing');
        await page.click('[data-insert-staff]');
        await page.waitForSelector('#jam-annot-general .annot-staff');
        assert.equal(await page.locator('#jam-annot-general .annot-frame .annot-staff').count(), 0);
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre de texte : curseurs des bords et des coins, redimensionnement (le contenu suit), déplacement, Échap', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-frame]');
        await page.waitForSelector('#jam-annot-general .annot-frame.is-editing');
        await page.keyboard.type('Thème A : jouer piano');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#jam-annot-general .annot-frame').classList.contains('is-editing'));
        const m0 = await frameBox(page);
        const at = async (dx, dy) => { await page.mouse.move(m0.x + dx, m0.y + dy); await page.waitForTimeout(30); return frameCursor(page); };
        assert.equal(await at(m0.w / 2, m0.h / 2), 'grab');
        assert.equal(await at(m0.w - 2, m0.h / 2), 'ew-resize');
        assert.equal(await at(2, m0.h / 2), 'ew-resize');
        assert.equal(await at(m0.w / 2, 2), 'ns-resize');
        assert.equal(await at(m0.w / 2, m0.h - 2), 'ns-resize');
        assert.equal(await at(m0.w - 2, m0.h - 2), 'nwse-resize');
        assert.equal(await at(m0.w - 2, 2), 'nesw-resize');
        // coin bas droit : le cadre et son contenu grandissent, le coin haut gauche reste en place, les proportions aussi
        await page.mouse.move(m0.x + m0.w - 2, m0.y + m0.h - 2);
        await page.mouse.down();
        await page.mouse.move(m0.x + m0.w + 60, m0.y + m0.h + 30, { steps: 8 });
        await page.mouse.move(m0.x + m0.w + 120, m0.y + m0.h + 60, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(100);
        const m1 = await frameBox(page);
        assert.ok(m1.w > m0.w + 50 && m1.h > m0.h + 10, `cadre agrandi ${m0.w}×${m0.h} → ${m1.w}×${m1.h}`);
        assert.ok(m1.bw > m0.bw + 50, 'le texte du cadre est affiché plus grand');
        assert.ok(Math.abs(m1.bw / m1.bh - m0.bw / m0.bh) < 0.03, 'proportions conservées');
        assert.ok(Math.abs(m1.x - m0.x) <= 2 && Math.abs(m1.y - m0.y) <= 2, 'coin opposé en place');
        assert.match(m1.frame, /^\d+,\d+$/);
        assert.equal(m1.picked, true);
        // bord droit vers la gauche : réduit, bord gauche en place ; Échap pendant le tirage annule
        await page.mouse.move(m1.x + m1.w - 2, m1.y + m1.h / 2);
        await page.mouse.down();
        await page.mouse.move(m1.x + m1.w - 80, m1.y + m1.h / 2, { steps: 8 });
        const mid = await frameBox(page);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(100);
        const m2 = await frameBox(page);
        assert.ok(mid.w < m1.w - 40, 'réduit pendant le tirage');
        assert.ok(Math.abs(m2.w - m1.w) <= 1, 'Échap annule le tirage');
        // déplacement par le milieu : taille inchangée, décalage enregistré
        await page.mouse.move(m2.x + m2.w / 2, m2.y + m2.h / 2);
        await page.mouse.down();
        await page.mouse.move(m2.x + m2.w / 2 + 40, m2.y + m2.h / 2 + 50, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(100);
        const m3 = await frameBox(page);
        assert.ok(m3.x > m2.x + 30 && m3.y > m2.y + 30, 'déplacé');
        assert.ok(Math.abs(m3.w - m2.w) <= 1 && Math.abs(m3.h - m2.h) <= 1, 'taille inchangée');
        assert.ok(m3.pos, 'décalage enregistré');
        // changer d'onglet puis revenir : même échelle, même taille, même texte
        await page.waitForTimeout(900);
        await page.evaluate(() => app.jam.setVisMode('staff'));
        await page.evaluate(() => app.jam.setVisMode('annotations'));
        await page.waitForSelector('#jam-annot-general .annot-frame');
        const m4 = await frameBox(page);
        assert.equal(m4.frame, m3.frame);
        assert.ok(Math.abs(m4.w - m3.w) <= 2 && Math.abs(m4.h - m3.h) <= 3);
        assert.ok((await page.innerText('#jam-annot-general')).includes('Thème A'));
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre de texte : sélection, Suppr., glisser dans l\'autre zone', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.click('#jam-annot-general');
        await page.click('[data-insert-frame]');
        await page.waitForSelector('#jam-annot-general .annot-frame.is-editing');
        await page.keyboard.type('Second');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        const f = page.locator('#jam-annot-general .annot-frame');
        const bx = await f.boundingBox();
        const zr = await page.locator('#jam-annot-measure').boundingBox();
        await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
        await page.mouse.down();
        await page.mouse.move(zr.x + 80, zr.y + 60, { steps: 12 });
        await page.mouse.move(zr.x + 100, zr.y + 70, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        assert.equal(await page.locator('#jam-annot-measure .annot-frame').count(), 1);
        assert.equal(await page.locator('#jam-annot-general .annot-frame').count(), 0);
        assert.ok((await page.innerText('#jam-annot-measure')).includes('Second'));
        const b2 = await page.locator('#jam-annot-measure .annot-frame').boundingBox();
        await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => document.querySelector('#jam-annot-measure .annot-frame').classList.contains('is-picked')), true);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#jam-annot-measure .annot-frame').count(), 0);
        assert.deepEqual(errors, []);
        await close();
    });
});
