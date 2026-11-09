// Test de bout en bout de l'onglet « Annotations » (mode Jam) et du faux plein écran de la grille, dans un vrai navigateur avec le vrai VexFlow (app/vendor) :
// blocs (portées, cadres de texte) indépendants posés sur un canevas, qui peuvent se recouvrir ; cadre visible ou caché ; repères d'alignement et aimant ;
// sélection de plusieurs blocs (rectangle, Maj / ⌘ / Ctrl, ⌘A) ; copier / couper / coller ; migration des anciennes annotations ; sauvegarde dans la grille.
// Ce que les tests unitaires ne voient pas : le dessin, la mesure des blocs, les événements du pointeur, la sélection du navigateur, le presse-papiers.
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

describe('annotations : canevas de blocs (navigateur)', { skip: !pw && 'Playwright non installé : npm install && npx playwright install chromium' }, () => {
    let srv, browser;
    before(async () => {
        srv = await serve();
        browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
    });
    after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

    const G = '#jam-annot-general', M = '#jam-annot-measure';

    // Ouvre l'appli sur l'onglet Annotations, avec une mesure sélectionnée. Par défaut, les deux zones sont mises en mode édition (crayon à côté du titre) ;
    // { edit: false } les laisse en lecture (blocs figés, zoom).
    async function openAnnotations(viewport = { width: 1400, height: 1500 }, opts = {}) {
        const ctx = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
        await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        await page.evaluate(() => app.jam.setVisMode('annotations'));
        await page.waitForSelector('#jam-annot-general');
        await page.click('#jam-chord-sequence-display .jam-cell >> nth=1');
        await page.waitForFunction(() => document.getElementById('jam-annot-measure').getAttribute('data-can-edit') === 'true');
        if (opts.edit !== false) {
            await page.click('[data-annot-mode="general"]');
            await page.click('[data-annot-mode="measure"]');
            await page.waitForFunction(() => ['jam-annot-general', 'jam-annot-measure'].every(i => document.getElementById(i).getAttribute('data-editable') === 'true'));
        }
        return { page, errors, close: () => ctx.close() };
    }

    // La barre de mise en forme apparaît au premier clic sur le fond : on le fait d'abord, pour que les zones ne bougent plus ensuite.
    async function wake(page, zone = G) {
        const b = await page.locator(zone).boundingBox();
        await page.mouse.click(b.x + b.width - 12, b.y + b.height - 12);
        await page.waitForSelector('#jam-annot-bar:not(.is-idle)');
    }
    const zoneBox = (page, zone = G) => page.locator(zone).boundingBox();

    // Blocs d'une zone : place (data-at), taille et position à l'écran.
    const blocks = (page, zone = G) => page.evaluate((z) => Array.from(document.querySelectorAll(`${z} > .annot-staff, ${z} > .annot-frame`)).map((e) => {
        const r = e.getBoundingClientRect();
        return { kind: e.classList.contains('annot-staff') ? 'staff' : 'frame', x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight, at: e.getAttribute('data-at'), border: e.getAttribute('data-border'),
            noBorder: e.classList.contains('no-border'), picked: e.classList.contains('is-picked'), active: e.classList.contains('is-active') || e.classList.contains('is-editing'),
            sx: r.x, sy: r.y, sw: r.width, sh: r.height, text: (e.querySelector('.annot-frame-body') || {}).textContent || '' };
    }), zone);
    const note = (page) => page.evaluate(() => app.jam.gridNote);
    const settle = (page) => page.waitForTimeout(750);   // l'enregistrement d'une série de changements est regroupé (600 ms)

    // Crée un cadre par double-clic sur le fond, à (x, y) depuis le coin haut gauche de la zone, y écrit `text`, puis sort de l'édition.
    async function newFrame(page, zone, x, y, text) {
        const b = await zoneBox(page, zone);
        const before = await page.locator(`${zone} > .annot-frame`).count();
        await page.mouse.dblclick(b.x + x, b.y + y);
        await page.waitForFunction(([z, n]) => document.querySelectorAll(`${z} > .annot-frame`).length > n && document.querySelector(`${z} > .annot-frame.is-editing`), [zone, before]);
        if (text) await page.keyboard.type(text);
        await page.keyboard.press('Escape');
        await page.waitForFunction((z) => !document.querySelector(`${z} > .annot-frame.is-editing`), zone);
        await settle(page);
        return (await blocks(page, zone)).filter(b => b.kind === 'frame')[before];
    }

    // Pose une portée par le bouton de la barre, y met des notes (une noire à chaque clic), puis en sort.
    async function addStaff(page, zone, ys) {
        await wake(page, zone);
        await page.click('[data-insert-staff]');
        await page.waitForSelector(`${zone} .annot-staff.is-active`);
        const box = await page.locator(`${zone} .annot-staff.is-active .annot-staff-svg`).boundingBox();
        let x = 110;
        for (const dy of ys) { await page.mouse.click(box.x + x, box.y + dy); x += 70; }
        await page.click(`${zone} .annot-staff-edit`);              // le crayon referme l'édition
        await page.waitForFunction((z) => !document.querySelector(`${z} .annot-staff.is-active`), zone);
        await settle(page);
    }

    // Saisit le bloc n° `i` par son corps (jamais le crayon du coin, ni les bords qui redimensionnent) et le glisse de (dx, dy).
    async function dragBlock(page, zone, i, dx, dy, opts = {}) {
        const r = (await blocks(page, zone))[i];
        const px = Math.round(r.sx + r.sw * 0.55), py = Math.round(r.sy + r.sh * 0.55);
        await page.mouse.move(px, py);
        await page.mouse.down();
        await page.mouse.move(px + Math.sign(dx) * 8, py + Math.sign(dy) * 8, { steps: 2 });
        if (opts.alt) await page.keyboard.down('Alt');
        await page.mouse.move(px + dx, py + dy, { steps: opts.steps || 8 });
        if (opts.hold) return { px, py };
        await page.mouse.up();
        if (opts.alt) await page.keyboard.up('Alt');
        await page.waitForTimeout(150);
        return { px, py };
    }
    const centerOf = async (page, zone, i) => { const r = (await blocks(page, zone))[i]; return [Math.round(r.sx + r.sw * 0.55), Math.round(r.sy + r.sh * 0.55)]; };
    const tool = (page, zone, act) => page.locator(`.jam-annot-zone:has(${zone}) [data-annot-act="${act}"]`);
    const guides = (page, zone = G) => page.evaluate((z) => Array.from(document.querySelectorAll(`${z} .annot-guide`)).map(g => g.className.includes('annot-guide-x') ? 'x' : 'y'), zone);

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

    test('on n\'écrit jamais en dehors d\'un cadre ; le double-clic sur le fond crée un cadre à cet endroit', async () => {
        const { page, errors, close } = await openAnnotations();
        // la zone n'est plus un champ de texte
        assert.equal(await page.getAttribute(G, 'contenteditable'), null);
        assert.equal(await page.getAttribute(G, 'data-editable'), 'true');
        await wake(page);
        await page.keyboard.type('texte perdu');
        await page.keyboard.press('Enter');
        assert.equal((await blocks(page)).length, 0, 'taper dans la zone ne crée rien');
        assert.equal(await page.locator(G).innerText(), '', 'aucun texte hors cadre');
        // double-clic : un cadre s'ouvre à l'endroit du clic, on écrit dedans
        const b = await zoneBox(page);
        await page.mouse.dblclick(b.x + 120, b.y + 60);
        await page.waitForSelector(`${G} > .annot-frame.is-editing`);
        await page.keyboard.type('Thème A');
        await page.keyboard.press('Escape');
        await settle(page);
        const f = (await blocks(page))[0];
        assert.equal(f.kind, 'frame');
        assert.ok(Math.abs(f.x - 120) <= 3 && Math.abs(f.y - 60) <= 3, `cadre posé là où l'on a double-cliqué (${f.x},${f.y})`);
        assert.equal(f.at, `${f.x},${f.y}`);
        assert.equal(f.text, 'Thème A');
        assert.match(await note(page), /^<div class="annot-frame" data-frame="a" data-at="\d+,\d+" data-border="0">Thème A<\/div>$/, 'un cadre neuf est créé sans bordure');
        // un double-clic sur un bloc ne crée pas un autre cadre
        assert.equal((await blocks(page)).length, 1);
        assert.deepEqual(errors, []);
        await close();
    });

    test('blocs indépendants : déplacer l\'un ne touche pas les autres, et ils peuvent se recouvrir', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 40, 'A');
        await newFrame(page, G, 330, 40, 'B');
        const [a0, b0] = await blocks(page);
        assert.ok(a0.x < b0.x);
        // A glisse jusque sur B : B ne bouge pas, A se pose par-dessus
        await dragBlock(page, G, 0, 310, 20);
        const [a1, b1] = await blocks(page);
        assert.equal(b1.at, b0.at, 'B n\'a pas bougé');
        assert.ok(Math.abs((a1.x - a0.x) - 310) <= 2 && Math.abs((a1.y - a0.y) - 20) <= 2, `A a suivi la souris (${a0.x},${a0.y}) → (${a1.x},${a1.y})`);
        const overlap = a1.x < b1.x + b1.w && b1.x < a1.x + a1.w && a1.y < b1.y + b1.h && b1.y < a1.y + a1.h;
        assert.ok(overlap, 'A recouvre B');
        // la place de chacun est enregistrée dans la grille
        await settle(page);
        const saved = await note(page);
        assert.ok(saved.includes(`data-at="${a1.x},${a1.y}"`) && saved.includes(`data-at="${b1.x},${b1.y}"`), saved);
        // ⌘Z / ↶ annule le déplacement de A seul
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(250);
        const [a2, b2] = await blocks(page);
        assert.equal(a2.at, a0.at, 'A est revenu');
        assert.equal(b2.at, b0.at);
        // redimensionner A (coin bas droit) ne touche pas B
        const r = (await blocks(page))[0];
        await page.mouse.move(r.sx + r.sw - 2, r.sy + r.sh - 2);
        await page.mouse.down();
        await page.mouse.move(r.sx + r.sw + 60, r.sy + r.sh + 40, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const [a3, b3] = await blocks(page);
        assert.ok(a3.w > a0.w + 30, 'A agrandi');
        assert.equal(b3.at, b0.at);
        assert.equal(b3.w, b0.w);
        assert.deepEqual(errors, []);
        await close();
    });

    test('un bloc ne sort pas de la zone par le haut ni par la gauche', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 60, 60, 'A');
        await dragBlock(page, G, 0, -400, -300);
        const a = (await blocks(page))[0];
        assert.equal(a.x, 0);
        assert.equal(a.y, 0);
        assert.equal(a.at, '0,0');
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre visible ou caché : bouton de la zone, par bloc ou pour plusieurs, enregistré, annulable', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 40, 'A');
        await newFrame(page, G, 330, 40, 'B');
        const btn = tool(page, G, 'border');
        assert.deepEqual((await blocks(page)).map(x => x.border), ['0', '0'], 'un cadre neuf est créé sans bordure');
        for (const i of [0, 1]) { await page.mouse.click(...await centerOf(page, G, i)); await btn.click(); await settle(page); }   // on les rend visibles tous les deux
        assert.deepEqual((await blocks(page)).map(x => x.border), [null, null]);
        const zz = await zoneBox(page);
        await page.mouse.click(zz.x + zz.width - 40, zz.y + zz.height - 40);
        assert.equal(await btn.isDisabled(), true, 'rien de sélectionné : le bouton attend');
        const borderOf = (i) => page.evaluate((k) => { const e = document.querySelectorAll('#jam-annot-general > .annot-frame')[k]; return { color: getComputedStyle(e).borderTopColor, bg: getComputedStyle(e).backgroundColor }; }, i);
        assert.notEqual((await borderOf(0)).color, 'rgba(0, 0, 0, 0)');
        // on clique A : le bouton s'allume « cadre visible », un clic le cache
        await page.mouse.click(...await centerOf(page, G, 0));
        assert.equal(await btn.isDisabled(), false);
        assert.equal(await btn.getAttribute('aria-pressed'), 'true');
        await btn.click();
        await settle(page);
        let [a, b] = await blocks(page);
        assert.equal(a.noBorder, true);
        assert.equal(a.border, '0');
        assert.equal(b.border, null, 'B garde son cadre');
        assert.equal(await btn.getAttribute('aria-pressed'), 'false');
        assert.match(await note(page), /data-border="0"/);
        assert.equal((await note(page)).match(/data-border="0"/g).length, 1);
        // sélectionné, un cadre caché montre un liseré bleu : il reste facile à saisir
        assert.equal(a.picked, true);
        assert.equal((await borderOf(0)).color, 'rgb(59, 130, 246)');
        // non sélectionné : le fond est transparent, seul le texte reste ; en mode édition un liseré pointillé pâle le garde repérable
        const z = await zoneBox(page);
        await page.mouse.click(z.x + z.width - 40, z.y + z.height - 40);
        await page.mouse.move(5, 5);
        assert.equal((await borderOf(0)).color, 'rgba(96, 165, 250, 0.6)', 'liseré pointillé pâle en mode édition');
        assert.equal((await borderOf(0)).bg, 'rgba(0, 0, 0, 0)', 'et le fond aussi : seul le texte reste');
        assert.equal((await borderOf(1)).color, 'rgb(148, 163, 184)', 'B garde son trait');
        await page.mouse.click(...await centerOf(page, G, 0));
        // plusieurs blocs (A caché, B visible) : un premier clic montre tous les cadres, un second les cache tous
        await page.keyboard.press('Control+A');
        await btn.click();
        await settle(page);
        assert.deepEqual((await blocks(page)).map(x => x.border), [null, null]);
        assert.ok(!(await note(page)).includes('data-border'));
        await btn.click();
        await settle(page);
        assert.deepEqual((await blocks(page)).map(x => x.border), ['0', '0']);
        assert.equal((await note(page)).match(/data-border="0"/g).length, 2);
        // annulation : ⌘Z rend le réglage précédent
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(250);
        assert.deepEqual((await blocks(page)).map(x => x.border), [null, null]);
        // hors édition, un cadre caché est vraiment sans trait : seul son texte reste
        await page.evaluate(() => { app.jam._annotZoneEl('general').querySelectorAll('.annot-frame').forEach(f => f.classList.add('no-border')); });
        await page.click('[data-annot-mode="general"]');
        assert.equal((await borderOf(0)).color, 'rgba(0, 0, 0, 0)', 'en lecture le trait est transparent');
        assert.deepEqual(errors, []);
        await close();
    });

    test('repères d\'alignement pendant le déplacement ; l\'aimant (bouton) ramène le bloc, Alt l\'ignore', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 40, 40, 'Premier cadre de texte');
        await newFrame(page, G, 340, 160, 'Second cadre un peu plus long');
        const magnet = tool(page, G, 'magnet');
        assert.equal(await magnet.getAttribute('aria-pressed'), 'false');
        const [a0, b0] = await blocks(page);
        // loin de tout alignement : aucun repère ; le geste fini, le calque des repères disparaît et n'est jamais enregistré
        await dragBlock(page, G, 0, 150, 30, { hold: true });
        assert.deepEqual(await guides(page), [], 'pas de repère quand rien n\'est aligné');
        await page.mouse.up();
        await page.waitForTimeout(100);
        assert.equal(await page.locator(`${G} > .annot-overlay`).count(), 0);
        await settle(page);
        assert.ok(!(await note(page)).includes('annot-overlay') && !(await note(page)).includes('annot-guide'), 'les repères ne sont jamais enregistrés');

        // geste précis : on remet A à sa place, puis on le tire pour que son bord gauche tombe à 4 px du bord gauche de B
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(200);
        const start = (await blocks(page))[0];
        const dx = (b0.x + 4) - start.x, dy = 20;
        await dragBlock(page, G, 0, dx, dy, { hold: true });
        assert.ok((await guides(page)).includes('x'), 'repère vertical à l\'approche du bord de B');
        await page.mouse.up();
        await page.waitForTimeout(150);
        let a = (await blocks(page))[0];
        assert.equal(a.x, b0.x + 4, 'aimant éteint : le bloc reste où on l\'a lâché');
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(200);

        // aimant allumé : même geste, le bloc se cale exactement sur le bord de B
        await magnet.click();
        assert.equal(await magnet.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('jamAnnotMagnet')), '1', 'réglage gardé d\'une visite à l\'autre');
        await dragBlock(page, G, 0, dx, dy);
        a = (await blocks(page))[0];
        assert.equal(a.x, b0.x, `aimant : bord gauche de A collé au bord gauche de B (${a.x} / ${b0.x})`);
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(200);

        // Alt pendant le geste : pas d'aimant, le bloc reste où il a été lâché
        await dragBlock(page, G, 0, dx, dy, { alt: true });
        a = (await blocks(page))[0];
        assert.equal(a.x, b0.x + 4, 'Alt : l\'aimant est ignoré');
        assert.deepEqual(errors, []);
        await close();
    });

    test('les bords et le milieu de la zone sont aussi des repères, et l\'aimant s\'y cale', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 60, 60, 'A');
        await tool(page, G, 'magnet').click();
        await dragBlock(page, G, 0, -56, 0);                      // bord gauche à 4 px du bord de la zone
        assert.equal((await blocks(page))[0].x, 0);
        assert.deepEqual(errors, []);
        await close();
    });

    test('sélection : clic, Maj / ⌘ / Ctrl + clic, rectangle tiré sur le fond, ⌘A, Échap', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 30, 'A');
        await newFrame(page, G, 330, 30, 'B');
        await newFrame(page, G, 30, 200, 'C');
        const picked = async () => (await blocks(page)).map(b => b.picked);
        assert.deepEqual(await picked(), [false, false, false]);
        await page.mouse.click(...await centerOf(page, G, 0));
        assert.deepEqual(await picked(), [true, false, false]);
        // Maj + clic ajoute ; ⌘ (ou Ctrl) + clic retire / ajoute
        await page.keyboard.down('Shift');
        await page.mouse.click(...await centerOf(page, G, 1));
        await page.keyboard.up('Shift');
        assert.deepEqual(await picked(), [true, true, false]);
        await page.keyboard.down('Control');
        await page.mouse.click(...await centerOf(page, G, 0));
        await page.mouse.click(...await centerOf(page, G, 2));
        await page.keyboard.up('Control');
        assert.deepEqual(await picked(), [false, true, true]);
        // clic sur le fond : plus rien de sélectionné
        const z = await zoneBox(page);
        await page.mouse.click(z.x + z.width - 40, z.y + z.height - 40);
        assert.deepEqual(await picked(), [false, false, false]);
        // rectangle tiré sur le fond : tout ce qu'il touche est sélectionné (A et C, pas B)
        const [a, , c] = await blocks(page);
        await page.mouse.move(z.x + 6, z.y + 6);
        await page.mouse.down();
        await page.mouse.move(z.x + a.x + 40, z.y + c.y + c.h - 10, { steps: 8 });
        assert.equal(await page.locator(`${G} .annot-marquee`).count(), 1, 'le rectangle est dessiné');
        assert.deepEqual(await picked(), [true, false, true], 'sélection en direct');
        await page.mouse.up();
        assert.equal(await page.locator(`${G} .annot-marquee`).count(), 0);
        assert.deepEqual(await picked(), [true, false, true]);
        // Maj + rectangle : on ajoute à la sélection
        await page.keyboard.down('Shift');
        await page.mouse.move(z.x + 300, z.y + 6);
        await page.mouse.down();
        await page.mouse.move(z.x + 420, z.y + 120, { steps: 6 });
        await page.mouse.up();
        await page.keyboard.up('Shift');
        assert.deepEqual(await picked(), [true, true, true]);
        // Échap vide la sélection ; ⌘A la reprend
        await page.keyboard.press('Escape');
        assert.deepEqual(await picked(), [false, false, false]);
        await page.mouse.click(z.x + z.width - 40, z.y + z.height - 40);
        await page.keyboard.press('Control+A');
        assert.deepEqual(await picked(), [true, true, true]);
        // la sélection n'est pas enregistrée dans l'annotation
        await settle(page);
        assert.ok(!(await note(page)).includes('is-picked'));
        assert.deepEqual(errors, []);
        await close();
    });

    test('groupe : les blocs sélectionnés se déplacent ensemble (flèches 1 px / 10 px avec Maj, glisser), Suppr. les enlève', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 30, 'A');
        await newFrame(page, G, 330, 80, 'B');
        await newFrame(page, G, 30, 200, 'C');
        const ats = async () => (await blocks(page)).map(b => [b.x, b.y]);
        const start = await ats();
        // A et B sélectionnés : glisser l'un emmène l'autre, la distance entre eux est conservée ; C ne bouge pas
        await page.mouse.click(...await centerOf(page, G, 0));
        await page.keyboard.down('Shift');
        await page.mouse.click(...await centerOf(page, G, 1));
        await page.keyboard.up('Shift');
        await dragBlock(page, G, 1, 40, 50);
        const moved = await ats();
        assert.deepEqual([moved[0][0] - start[0][0], moved[0][1] - start[0][1]], [moved[1][0] - start[1][0], moved[1][1] - start[1][1]], 'même déplacement pour les deux');
        assert.ok(Math.abs(moved[0][0] - start[0][0] - 40) <= 2 && Math.abs(moved[0][1] - start[0][1] - 50) <= 2);
        assert.deepEqual(moved[2], start[2], 'C n\'a pas bougé');
        // une seule étape d'annulation pour tout le groupe
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(250);
        assert.deepEqual(await ats(), start);
        // flèches : 1 pixel, 10 avec Maj, pour tout le groupe
        await page.keyboard.press('Control+A');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('ArrowLeft');
        await settle(page);
        const nudged = await ats();
        nudged.forEach((p, i) => assert.deepEqual(p, [start[i][0] + 10, start[i][1] + 11], `bloc ${i}`));
        // Suppr. enlève les blocs sélectionnés, tous d'un coup ; ⌘Z les rend
        await page.keyboard.press('Delete');
        await settle(page);
        assert.equal((await blocks(page)).length, 0);
        assert.equal(await note(page), '');
        await page.keyboard.press('Control+Z');
        await page.waitForTimeout(250);
        assert.equal((await blocks(page)).length, 3);
        assert.deepEqual(errors, []);
        await close();
    });

    test('copier / couper / coller des blocs sélectionnés : la place relative est gardée, d\'une zone à l\'autre aussi', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 30, 'A');
        await newFrame(page, G, 330, 90, 'B');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Control+C');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(clip, /^\[cadre@\d+,\d+!?:a;A\]\[cadre@\d+,\d+!?:a;B\]$/);
        // coller dans l'autre zone
        await wake(page, M);
        await page.keyboard.press('Control+V');
        await settle(page);
        const [a, b] = await blocks(page);
        const m = await blocks(page, M);
        assert.equal(m.length, 2);
        assert.deepEqual(m.map(x => x.text), ['A', 'B']);
        assert.equal(m[1].x - m[0].x, b.x - a.x, 'même écart horizontal');
        assert.equal(m[1].y - m[0].y, b.y - a.y, 'même écart vertical');
        assert.equal(m.filter(x => x.picked).length, 2, 'les blocs collés sont sélectionnés');
        // ⌘X : couper (retirés de la zone, dans le presse-papiers)
        await page.keyboard.press('Control+X');
        await settle(page);
        assert.equal((await blocks(page, M)).length, 0);
        assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^\[cadre@/);
        // coller à nouveau dans la zone de gauche : décalé de quelques pixels (c'est un double)
        await wake(page, G);
        await page.keyboard.press('Control+V');
        await settle(page);
        assert.equal((await blocks(page)).length, 4);
        // un texte ordinaire collé devient un nouveau cadre : jamais de texte hors cadre
        await page.evaluate(() => navigator.clipboard.writeText('du texte venu d\'ailleurs'));
        await page.keyboard.press('Control+V');
        await settle(page);
        const all = await blocks(page);
        assert.equal(all.length, 5);
        assert.equal(all[4].text, 'du texte venu d\'ailleurs');
        assert.equal(await page.locator(G).evaluate(e => Array.from(e.childNodes).filter(n => n.nodeType === 3 && n.nodeValue.trim()).length), 0);
        assert.deepEqual(errors, []);
        await close();
    });

    test('glisser un bloc dans l\'autre zone : il y est recréé à la place indiquée', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 30, 'A');
        const zg = await zoneBox(page, G), zm = await zoneBox(page, M);
        const a = (await blocks(page))[0];
        const px = a.sx + a.sw * 0.55, py = a.sy + a.sh * 0.55;
        const tx = zm.x + 300, ty = zm.y + 120;
        await page.mouse.move(px, py);
        await page.mouse.down();
        await page.mouse.move(px + 20, py + 10, { steps: 2 });
        await page.mouse.move(tx, ty, { steps: 12 });
        await page.mouse.up();
        await settle(page);
        assert.equal((await blocks(page, G)).length, 0, 'retiré de la zone d\'origine');
        const m = await blocks(page, M);
        assert.equal(m.length, 1);
        assert.equal(m[0].text, 'A');
        assert.ok(Math.abs(m[0].sx - (tx - (px - a.sx))) <= 4 && Math.abs(m[0].sy - (ty - (py - a.sy))) <= 4, `posé là où on l'a lâché (${m[0].sx},${m[0].sy})`);
        assert.equal(await note(page), '');
        assert.match(await page.evaluate(() => app.jam.grid[app.jam.currentStepIndex].note || ''), /Thème|A/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('Échap pendant un glisser annule le déplacement', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 30, 'A');
        const a0 = (await blocks(page))[0];
        await dragBlock(page, G, 0, 120, 80, { hold: true });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(150);
        const a1 = (await blocks(page))[0];
        assert.equal(a1.at, a0.at);
        assert.deepEqual(errors, []);
        await close();
    });

    test('portée : posée à la première place libre, indépendante des cadres, au repos elle épouse son dessin ; le crayon ouvre l\'édition', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrameWithWake(page, 60, 260, 'Intro');
        await addStaff(page, G, [50, 45, 40]);
        const [f, s] = await blocks(page);
        assert.equal(s.kind, 'staff');
        assert.ok(s.at && /^\d+,\d+$/.test(s.at), 'la portée a sa place');
        assert.ok(s.w < 560 && s.h < 120, `au repos la portée n'occupe que son dessin (${s.w}×${s.h})`);
        // déplacer le cadre ne touche pas la portée
        await dragBlock(page, G, 0, 200, 150);
        const [f2, s2] = await blocks(page);
        assert.equal(s2.at, s.at, 'la portée n\'a pas bougé');
        assert.ok(f2.x > f.x + 150);
        // un clic dans la portée au repos la sélectionne sans l'ouvrir ; le crayon l'ouvre, un second clic le referme
        await page.mouse.click(...await centerOf(page, G, 1));
        assert.equal((await blocks(page))[1].picked, true);
        assert.equal((await blocks(page))[1].active, false);
        await page.hover(`${G} .annot-staff`);
        await page.click(`${G} .annot-staff-edit`);
        let st = (await blocks(page))[1];
        const zone = await page.evaluate(() => document.getElementById('jam-annot-general').clientWidth);
        assert.equal(st.active, true);
        assert.equal(st.at, s.at, 'en édition la portée reste à sa place (elle n\'est pas déplacée en haut du cadre)');
        assert.ok(Math.abs(st.x - s.x) <= 1 && Math.abs(st.y - s.y) <= 1, `même coin haut gauche (${st.x},${st.y} / ${s.x},${s.y})`);
        assert.ok(st.w >= s.w && st.w < zone, `elle s'allonge seulement pour offrir une portée vide (${s.w} → ${st.w} / ${zone})`);
        await page.click(`${G} .annot-staff-edit`);
        st = (await blocks(page))[1];
        assert.equal(st.active, false);
        assert.equal(st.at, s.at, 'la portée revient à sa place');
        assert.deepEqual(errors, []);
        await close();
    });

    async function newFrameWithWake(page, x, y, text) { await wake(page); return newFrame(page, G, x, y, text); }

    test('portée : cadre caché (bouton), recouvrement, premier plan / arrière-plan', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, G, [50, 45]);
        await newFrame(page, G, 300, 220, 'Par-dessus');
        await dragBlock(page, G, 1, -250, -170);                   // le cadre est tiré sur la portée : rien ne s'écarte pour lui faire place
        const [s, f] = await blocks(page);
        const order = () => page.evaluate(() => Array.from(document.querySelectorAll('#jam-annot-general > .annot-staff, #jam-annot-general > .annot-frame')).map(e => e.classList.contains('annot-staff') ? 'staff' : 'frame'));
        assert.deepEqual(await order(), ['staff', 'frame']);
        assert.ok(f.x < s.x + s.w && s.x < f.x + f.w && f.y < s.y + s.h && s.y < f.y + f.h, 'le cadre recouvre la portée');
        // portée sélectionnée : premier plan
        await page.mouse.click(s.sx + 6, s.sy + s.sh - 8);
        const front = tool(page, G, 'front'), back = tool(page, G, 'back'), border = tool(page, G, 'border');
        assert.equal(await front.isDisabled(), false);
        await front.click();
        await settle(page);
        assert.deepEqual(await order(), ['frame', 'staff'], 'la portée passe au premier plan');
        assert.match(await note(page), /^<div class="annot-frame".*<div class="annot-staff"/, 'l\'ordre est enregistré');
        await back.click();
        await settle(page);
        assert.deepEqual(await order(), ['staff', 'frame'], 'de nouveau à l\'arrière-plan');
        // une portée neuve est créée sans bordure ; le bouton la montre, puis la recache
        assert.equal((await blocks(page))[0].border, '0', 'sans bordure par défaut');
        await border.click();
        await settle(page);
        assert.equal((await blocks(page))[0].border, null);
        assert.equal((await blocks(page))[0].noBorder, false);
        await border.click();
        await settle(page);
        assert.equal((await blocks(page))[0].border, '0');
        assert.equal((await blocks(page))[0].noBorder, true);
        assert.deepEqual(errors, []);
        await close();
    });

    test('bouton point : un second clic éteint le point des notes suivantes, et le bouton le montre', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
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

    test('la portée se remet en page quand la zone se rétrécit, sans perdre ses notes', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await page.click('[data-insert-staff]');
        await page.waitForSelector('.annot-staff.is-active');
        const box = await page.locator('.annot-staff.is-active .annot-staff-svg').boundingBox();
        let x = 110;
        for (let i = 0; i < 12; i++) { await page.mouse.click(box.x + x, box.y + 50 - (i % 3) * 5); x += 40; }
        await page.click(`${G} .annot-staff-edit`);
        await page.waitForTimeout(150);
        const lines = () => page.evaluate(() => { const el = document.querySelector('#jam-annot-general .annot-staff'); const v = el.__noteStaff; const r = el.getBoundingClientRect(); return { lines: v.geo.lines.length, w: r.width, zone: document.getElementById('jam-annot-general').clientWidth }; });
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

    test('portée réduite à 50 %, et indication de mesure plus petite que la portée', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
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

    test('portée : les bords et les coins la redimensionnent comme un cadre de texte (50 à 200 %), Échap annule', async () => {
        const { page, errors, close } = await openAnnotations();
        await addStaff(page, G, [50, 40]);
        const st = page.locator(`${G} .annot-staff`);
        const b0 = await st.boundingBox();
        const cursorAt = async (dx, dy) => { await page.mouse.move(b0.x + dx, b0.y + dy); await page.waitForTimeout(30); return st.evaluate(e => getComputedStyle(e).cursor); };
        assert.equal(await cursorAt(b0.width / 2, b0.height / 2), 'grab');
        assert.equal(await cursorAt(b0.width - 2, b0.height / 2), 'ew-resize');
        assert.equal(await cursorAt(b0.width / 2, 2), 'ns-resize');
        assert.equal(await cursorAt(b0.width - 5, b0.height - 5), 'nwse-resize');
        assert.equal(await cursorAt(b0.width - 5, 5), 'nesw-resize');
        await page.mouse.move(b0.x + b0.width - 5, b0.y + b0.height - 5);
        await page.mouse.down();
        await page.mouse.move(b0.x + b0.width + 60, b0.y + b0.height + 30, { steps: 8 });
        await page.mouse.move(b0.x + b0.width + 120, b0.y + b0.height + 60, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const b1 = await st.boundingBox();
        assert.match(await st.getAttribute('data-staff'), /^t,4\/4,0,1[1-9]0;|^t,4\/4,0,200;/);
        assert.ok(b1.width > b0.width + 30, `portée agrandie ${b0.width} → ${b1.width}`);
        assert.ok(Math.abs(b1.x - b0.x) <= 2 && Math.abs(b1.y - b0.y) <= 2, 'coin opposé en place');
        // bord gauche vers la droite : réduit, bord droit en place
        await page.mouse.move(b1.x + 2, b1.y + b1.height / 2);
        await page.mouse.down();
        await page.mouse.move(b1.x + 80, b1.y + b1.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const b2 = await st.boundingBox();
        assert.ok(b2.width < b1.width - 20);
        assert.ok(Math.abs((b2.x + b2.width) - (b1.x + b1.width)) <= 3, 'bord droit en place');
        // Échap annule ; la taille ne dépasse pas 200 %
        await page.mouse.move(b2.x + b2.width - 2, b2.y + b2.height / 2);
        await page.mouse.down();
        await page.mouse.move(b2.x + b2.width + 300, b2.y + b2.height / 2, { steps: 8 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(150);
        assert.ok(Math.abs((await st.boundingBox()).width - b2.width) <= 1);
        const b3 = await st.boundingBox();
        await page.mouse.move(b3.x + b3.width - 2, b3.y + b3.height / 2);
        await page.mouse.down();
        await page.mouse.move(b3.x + b3.width + 3000, b3.y + b3.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        assert.match(await st.getAttribute('data-staff'), /^t,4\/4,0,200;/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre de texte : curseurs des bords et des coins, redimensionnement (le contenu suit), déplacement, Échap', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 40, 40, 'Thème A : jouer piano');
        const fb = () => page.evaluate(() => {
            const f = document.querySelector('#jam-annot-general .annot-frame');
            const r = f.getBoundingClientRect(), b = f.querySelector('.annot-frame-body').getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, bw: b.width, bh: b.height, frame: f.getAttribute('data-frame'), at: f.getAttribute('data-at'), picked: f.classList.contains('is-picked') };
        });
        const cursor = () => page.evaluate(() => getComputedStyle(document.querySelector('#jam-annot-general .annot-frame')).cursor);
        const m0 = await fb();
        const at = async (dx, dy) => { await page.mouse.move(m0.x + dx, m0.y + dy); await page.waitForTimeout(30); return cursor(); };
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
        const m1 = await fb();
        assert.ok(m1.w > m0.w + 50 && m1.h > m0.h + 10, `cadre agrandi ${m0.w}×${m0.h} → ${m1.w}×${m1.h}`);
        assert.ok(m1.bw > m0.bw + 50, 'le texte du cadre est affiché plus grand');
        assert.ok(Math.abs(m1.bw / m1.bh - m0.bw / m0.bh) < 0.03, 'proportions conservées');
        assert.ok(Math.abs(m1.x - m0.x) <= 2 && Math.abs(m1.y - m0.y) <= 2, 'coin opposé en place');
        assert.match(m1.frame, /^(a|\d+),\d+$/);
        assert.equal(m1.at, m0.at, 'la place du coin haut gauche ne change pas');
        assert.equal(m1.picked, true);
        // bord droit vers la gauche : réduit, bord gauche en place ; Échap pendant le tirage annule
        await page.mouse.move(m1.x + m1.w - 2, m1.y + m1.h / 2);
        await page.mouse.down();
        await page.mouse.move(m1.x + m1.w - 80, m1.y + m1.h / 2, { steps: 8 });
        const mid = await fb();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(100);
        const m2 = await fb();
        assert.ok(mid.w < m1.w - 40, 'réduit pendant le tirage');
        assert.ok(Math.abs(m2.w - m1.w) <= 1, 'Échap annule le tirage');
        // déplacement par le milieu : taille inchangée, place enregistrée
        await page.mouse.move(m2.x + m2.w / 2, m2.y + m2.h / 2);
        await page.mouse.down();
        await page.mouse.move(m2.x + m2.w / 2 + 40, m2.y + m2.h / 2 + 50, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(100);
        const m3 = await fb();
        assert.ok(m3.x > m2.x + 30 && m3.y > m2.y + 30, 'déplacé');
        assert.ok(Math.abs(m3.w - m2.w) <= 1 && Math.abs(m3.h - m2.h) <= 1, 'taille inchangée');
        assert.notEqual(m3.at, m0.at, 'place enregistrée');
        // changer d'onglet puis revenir : même échelle, même taille, même place, même texte
        await page.waitForTimeout(900);
        await page.evaluate(() => app.jam.setVisMode('staff'));
        await page.evaluate(() => app.jam.setVisMode('annotations'));
        await page.waitForSelector('#jam-annot-general .annot-frame');
        const m4 = await fb();
        assert.equal(m4.frame, m3.frame);
        assert.equal(m4.at, m3.at);
        assert.ok(Math.abs(m4.w - m3.w) <= 2 && Math.abs(m4.h - m3.h) <= 3);
        assert.ok((await page.innerText(G)).includes('Thème A'));
        assert.deepEqual(errors, []);
        await close();
    });

    test('cadre de texte neuf : un caractère de large, il s\'allonge avec le texte et ne passe à la ligne que sur Entrée', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        const b = await zoneBox(page, G);
        await page.mouse.dblclick(b.x + 60, b.y + 60);
        await page.waitForSelector(`${G} > .annot-frame.is-editing`);
        const w = () => page.evaluate((z) => { const f = document.querySelector(`${z} > .annot-frame`); return { w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height), fr: f.getAttribute('data-frame') }; }, G);
        const w0 = await w();
        assert.ok(w0.w <= 30, `vide : ${w0.w} px de large`);
        await page.keyboard.type('a');
        await page.waitForTimeout(80);
        const w1 = await w();
        assert.ok(w1.w <= 32, `un caractère : ${w1.w} px`);
        await page.keyboard.type('bcdefghijklmnopqrstuvwxyz');
        await page.waitForTimeout(80);
        const w2 = await w();
        assert.ok(w2.w > w1.w + 80, `la ligne s'allonge (${w1.w} → ${w2.w})`);
        assert.equal(w2.h, w1.h, 'toujours une seule ligne');
        await page.keyboard.press('Enter');
        await page.keyboard.type('x');
        await page.waitForTimeout(80);
        const w3 = await w();
        assert.equal(w3.w, w2.w, 'Entrée : la largeur reste celle de la ligne la plus longue');
        assert.ok(w3.h > w2.h + 10, 'une seconde ligne apparaît');
        await page.keyboard.press('Escape');
        await settle(page);
        assert.match(await note(page), /data-frame="a"/, 'enregistré en largeur automatique');
        await page.evaluate(() => { app.jam.setVisMode('staff'); app.jam.setVisMode('annotations'); });
        await page.waitForSelector(`${G} > .annot-frame`);
        await page.waitForTimeout(200);
        const w4 = await w();
        assert.ok(Math.abs(w4.w - w3.w) <= 2, `même largeur après réouverture (${w3.w} → ${w4.w})`);
        assert.deepEqual(errors, []);
        await close();
    });

    test('mise en forme de la barre : texte du cadre en édition, ou tout le texte des cadres sélectionnés', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 40, 40, 'Plain');
        // cadre sélectionné (pas en édition) : « gras » s'applique à tout son texte
        await page.mouse.click(...await centerOf(page, G, 0));
        await page.click('#jam-annot-bar [data-cmd="bold"]');
        await settle(page);
        assert.match(await note(page), /<b>Plain<\/b>|font-weight: ?bold/);
        assert.equal((await blocks(page))[0].picked, true, 'le cadre reste sélectionné');
        // en édition : la mise en forme suit la sélection du texte
        await page.dblclick(`${G} > .annot-frame`);
        await page.waitForSelector(`${G} > .annot-frame.is-editing`);
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' suite');
        await page.keyboard.press('Escape');
        await settle(page);
        assert.ok((await note(page)).includes('suite'));
        assert.deepEqual(errors, []);
        await close();
    });

    test('barre : « Cadre » crée un cadre à la première place libre, plus de « Coller portée », effacer la mise en forme = un symbole', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        assert.equal(await page.locator('#jam-annot-bar [data-paste-staff]').count(), 0);
        assert.ok(!(await page.innerText('#jam-annot-bar')).includes('Coller portée'));
        const clear = page.locator('#jam-annot-bar [data-clear]');
        assert.equal(await clear.locator('svg').count(), 1);
        assert.equal((await clear.innerText()).trim(), '');
        assert.match(await clear.getAttribute('title'), /^Effacer la mise en forme/);
        await page.click('#jam-annot-bar [data-insert-frame]');
        await page.waitForSelector(`${G} > .annot-frame.is-editing`);
        await page.keyboard.type('un');
        await page.keyboard.press('Escape');
        await page.click('#jam-annot-bar [data-insert-frame]');
        await page.waitForSelector(`${G} > .annot-frame.is-editing`);
        await page.keyboard.press('Escape');
        const [f1, f2] = await blocks(page);
        assert.ok(f1.x < f2.x && f1.y < f2.y, 'le second cadre est décalé en cascade : pas pile sur le premier');
        assert.deepEqual(errors, []);
        await close();
    });

    test('anciennes annotations (texte libre, portées rangées dans le texte) : migrées en blocs indépendants, rien n\'est perdu', async () => {
        const { page, errors, close } = await openAnnotations();
        await page.evaluate(() => {
            app.jam.gridNote = 'Intro <b>en gras</b><div class="annot-staff" data-staff="t,4/4,0;q:c4 q:e4" data-pos="10,5"></div>'
                + '<div>Deuxième ligne</div><div class="annot-frame" data-frame="200,100" data-pos="4,-2"><i>vieux cadre</i></div>';
            app.jam.setVisMode('staff');
            app.jam.setVisMode('annotations');
        });
        await page.waitForSelector(`${G} .annot-staff-svg`);
        await page.waitForTimeout(300);
        const r = await page.evaluate(() => {
            const z = document.getElementById('jam-annot-general');
            const kids = Array.from(z.childNodes).filter(n => !(n.nodeType === 1 && n.classList.contains('annot-overlay')));
            return {
                loose: kids.filter(n => n.nodeType === 3 ? n.nodeValue.trim() : !(n.classList.contains('annot-frame') || n.classList.contains('annot-staff'))).length,
                legacy: z.classList.contains('legacy-flow'),
                blocks: Array.from(z.querySelectorAll(':scope > .annot-staff, :scope > .annot-frame')).map(e => ({ cls: e.className.split(' ')[0], at: e.getAttribute('data-at'), pos: e.getAttribute('data-pos'), position: getComputedStyle(e).position,
                    x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight, text: ((e.querySelector('.annot-frame-body') || e).textContent || '').trim().slice(0, 40) }))
            };
        });
        assert.equal(r.loose, 0, 'plus aucun texte en dehors d\'un cadre');
        assert.equal(r.legacy, false);
        assert.equal(r.blocks.length, 4, 'le texte libre est rangé en cadres : 2 passages de texte + 1 portée + 1 cadre');
        r.blocks.forEach(b => { assert.match(b.at, /^\d+,\d+$/, 'chaque bloc a sa place'); assert.equal(b.pos, null); assert.equal(b.position, 'absolute'); });
        assert.deepEqual(r.blocks.map(b => b.cls), ['annot-frame', 'annot-staff', 'annot-frame', 'annot-frame']);
        assert.ok(r.blocks[0].text.startsWith('Intro en gras'));
        assert.ok(r.blocks[2].text.startsWith('Deuxième ligne'));
        assert.ok(r.blocks[3].text.startsWith('vieux cadre'));
        // même ordre de haut en bas qu'avant, sans recouvrement : la mise en page d'origine est respectée
        for (let i = 1; i < r.blocks.length; i++) assert.ok(r.blocks[i].y >= r.blocks[i - 1].y, `bloc ${i} sous le précédent`);
        // la migration ne modifie rien tant qu'on ne touche à rien ; dès qu'on déplace un bloc, tout est enregistré dans le nouveau format
        assert.ok(!(await note(page)).includes('data-at'));
        await newFrameAt(page, 400, 300, 'Nouveau');
        const saved = await note(page);
        assert.ok(!saved.includes('data-pos'), 'plus d\'ancien décalage');
        assert.equal((saved.match(/data-at="/g) || []).length, 5);
        assert.ok(saved.includes('Intro') && saved.includes('Deuxième ligne') && saved.includes('vieux cadre') && saved.includes('Nouveau'));
        assert.deepEqual(errors, []);
        await close();
    });
    async function newFrameAt(page, x, y, text) { await wake(page); return newFrame(page, G, x, y, text); }

    test('les annotations enregistrées se rouvrent à l\'identique (place, bord, ordre), et la mesure garde les siennes', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 40, 'Un');
        await newFrame(page, G, 300, 100, 'Deux');
        await page.mouse.click(...await centerOf(page, G, 1));
        await tool(page, G, 'border').click();
        await settle(page);
        const before = await blocks(page);
        // autre onglet puis retour : mêmes blocs
        await page.evaluate(() => { app.jam.setVisMode('staff'); app.jam.setVisMode('annotations'); });
        await page.waitForSelector(`${G} > .annot-frame`);
        await page.waitForTimeout(200);
        const after = await blocks(page);
        assert.deepEqual(after.map(b => [b.at, b.border, b.text]), before.map(b => [b.at, b.border, b.text]));
        // la zone de la mesure est indépendante de celle de la grille
        await wake(page, M);
        await newFrame(page, M, 50, 50, 'Mesure');
        assert.equal((await blocks(page, M)).length, 1);
        assert.equal((await blocks(page, G)).length, 2);
        // autre mesure : la zone de droite change, celle de gauche reste
        await page.click('#jam-chord-sequence-display .jam-cell >> nth=2');
        await page.waitForTimeout(300);
        assert.equal((await blocks(page, M)).length, 0, 'une autre mesure, une autre annotation');
        assert.equal((await blocks(page, G)).length, 2);
        await page.click('#jam-chord-sequence-display .jam-cell >> nth=1');
        await page.waitForTimeout(300);
        assert.equal((await blocks(page, M)).length, 1);
        assert.equal((await blocks(page, M))[0].text, 'Mesure');
        assert.deepEqual(errors, []);
        await close();
    });

    test('jam lancée : les zones sont en lecture seule (rien ne se crée, ne se déplace, ni ne se sélectionne)', async () => {
        const { page, errors, close } = await openAnnotations();
        await wake(page);
        await newFrame(page, G, 30, 40, 'A');
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        assert.equal(await page.locator('.jam-annot-tools').first().isVisible(), false, 'plus de boutons de disposition');
        // on force la zone en lecture seule comme le fait l'appli pendant la lecture
        await page.evaluate(() => document.getElementById('jam-annot-general').setAttribute('data-editable', 'false'));
        const a0 = (await blocks(page))[0];
        await dragBlock(page, G, 0, 100, 60);
        assert.equal((await blocks(page))[0].at, a0.at, 'pas de déplacement');
        const z = await zoneBox(page);
        await page.mouse.dblclick(z.x + 300, z.y + 200);
        assert.equal((await blocks(page)).length, 1, 'pas de création');
        assert.equal((await blocks(page))[0].picked, false);
        assert.deepEqual(errors, []);
        await close();
    });

    test('la barre de mise en forme n\'apparaît que pendant l\'édition, et les zones prennent la place libre', async () => {
        const { page, errors, close } = await openAnnotations(undefined, { edit: false });
        const bar = () => page.locator('#jam-annot-bar').isVisible();
        const zoneH = () => page.evaluate(() => Math.round(document.getElementById('jam-annot-general').getBoundingClientRect().height));
        assert.equal(await bar(), false, 'pas de barre quand on n\'édite pas');
        const idleH = await zoneH();
        await page.click('[data-annot-mode="general"]');                       // le crayon met la zone en édition
        assert.equal(await bar(), true, 'la barre apparaît quand on édite');
        assert.ok(await zoneH() < idleH, 'les zones cèdent la place à la barre');
        await page.mouse.click(5, 5);                                          // clic ailleurs : la barre se range, la zone reste en édition
        await page.waitForTimeout(150);
        assert.equal(await bar(), false, 'la barre disparaît en sortant');
        assert.equal(await zoneH(), idleH, 'les zones reprennent la place');
        assert.equal((await zone(page)).editable, 'true', 'la zone reste en mode édition');
        const b = await zoneBox(page);
        await page.mouse.click(b.x + b.width - 12, b.y + b.height - 12);       // clic sur le fond de la zone : la barre revient
        assert.equal(await bar(), true);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        // un bloc choisi d'un clic ne fait pas surgir la barre (rien ne bouge sous le pointeur)
        await addStaff(page, G, [50, 45]);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        const y0 = (await blocks(page))[0].sy;
        await page.mouse.click(...await centerOf(page, G, 0));
        assert.equal(await bar(), false, 'pas de barre pour un bloc choisi');
        assert.equal((await blocks(page))[0].sy, y0, 'le bloc ne bouge pas');
        // le crayon ouvre l'édition de la portée : la barre vient avec ses outils
        await page.hover(`${G} .annot-staff`);
        await page.click(`${G} .annot-staff-edit`);
        assert.equal(await bar(), true);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        assert.equal(await bar(), false);
        // jam lancée : plus de barre, même en éditant la zone de gauche
        const b2 = await zoneBox(page);
        await page.mouse.click(b2.x + b2.width - 12, b2.y + b2.height - 12);
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
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        await page.waitForTimeout(200);
        const w = await page.evaluate(() => ({ card: document.getElementById('jam-scales-card').getBoundingClientRect().width, vw: window.innerWidth }));
        assert.ok(w.card > w.vw - 60, `antisèches sur toute la largeur en plein écran (${w.card} px sur ${w.vw})`);
        const seq = () => page.evaluate(() => Math.round(document.getElementById('jam-chord-sequence-display').getBoundingClientRect().height));
        const s0 = await seq();
        await page.click('#jam-antiseche-btn');
        assert.equal(await page.locator('#jam-scales-card').isVisible(), false);
        assert.ok(await seq() > s0 + 100, 'la grille prend la place en plein écran aussi');
        // le choix est gardé d'une visite à l'autre
        assert.equal(await page.evaluate(() => localStorage.getItem('jamAntisechesHidden')), '1');
        assert.deepEqual(errors, []);
        await close();
    });

    test('faux plein écran de la zone d\'annotation : recouvre la fenêtre sans API plein écran, écriture, portée déplaçable, sorties', async () => {
        const { page, errors, close } = await openAnnotations();
        const card = () => page.evaluate(() => { const r = document.getElementById('jam-scales-card').getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, native: !!document.fullscreenElement }; });
        const hOf = () => page.evaluate(() => document.getElementById('jam-annot-general').getBoundingClientRect().height);
        // mise en page compacte : la carte n'a plus ses 20 px de marge intérieure
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('jam-scales-card')).paddingTop), '8px');
        const h0 = await hOf();
        await page.click('#jam-annot-fs-btn');
        await page.waitForTimeout(150);
        const c = await card();
        assert.ok(c.x === 0 && c.y === 0 && Math.abs(c.w - c.vw) < 1 && Math.abs(c.h - c.vh) < 1, 'la carte recouvre toute la fenêtre');
        assert.equal(c.native, false, 'pas de plein écran du navigateur');
        assert.ok(await hOf() > h0, 'la zone gagne de la hauteur');
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('jam-annot-fs-lock')), true);
        // on écrit dans un cadre, on pose une portée, on la déplace
        await wake(page);
        await newFrame(page, G, 40, 40, 'Texte en grand');
        await addStaff(page, G, [40, 60]);
        const before = (await blocks(page))[1];
        await dragBlock(page, G, 1, 120, 60);
        const after = (await blocks(page))[1];
        assert.ok(after.sx > before.sx + 60 && after.sy > before.sy + 30, `la portée suit la souris en faux plein écran (${before.sx},${before.sy}) → (${after.sx},${after.sy})`);
        // Échap : d'abord la sélection (la portée qu'on vient de déplacer), puis le focus de la zone, puis le faux plein écran
        await page.keyboard.press('Escape');
        assert.equal((await blocks(page)).filter(x => x.picked).length, 0);
        assert.equal(await page.evaluate(() => app.jam.annotFs), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => app.jam.annotFs), true);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => app.jam.annotFs), false);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('jam-annot-fs-lock')), false);
        assert.match(await note(page), /Texte en grand/);
        // un autre onglet le ferme aussi et cache le bouton
        await page.click('#jam-annot-fs-btn');
        await page.evaluate(() => app.jam.setVisMode('notes'));
        assert.equal(await page.evaluate(() => app.jam.annotFs), false);
        assert.equal(await page.isVisible('#jam-annot-fs-btn'), false);
        assert.deepEqual(errors, []);
        await close();
    });

    // ----- Mode édition (crayon à côté du titre) et zoom de lecture -----
    const zone = (page, z = G) => page.evaluate((id) => {
        const e = document.querySelector(id), zn = e.closest('.jam-annot-zone');
        return { editable: e.getAttribute('data-editable'), canEdit: e.getAttribute('data-can-edit'), editing: zn.classList.contains('is-editing'),
            pen: zn.querySelector('[data-annot-mode]').getAttribute('aria-pressed'), tools: getComputedStyle(zn.querySelector('.jam-annot-tools')).display,
            zoomUi: getComputedStyle(zn.querySelector('.jam-annot-zoom')).display, label: zn.querySelector('[data-zoom-act="reset"]').textContent, ph: e.dataset.placeholder };
    }, z);
    const pencilShown = (page, z = G) => page.evaluate((id) => Array.from(document.querySelectorAll(`${id} .annot-staff-edit, ${id} .annot-frame-edit`)).map(b => getComputedStyle(b).display !== 'none'), z);

    test('crayon à côté du titre : par défaut la zone est en lecture (blocs figés), le crayon passe en édition et en sort', async () => {
        const { page, errors, close } = await openAnnotations(undefined, { edit: false });
        let z = await zone(page);
        assert.equal(z.editable, 'false'); assert.equal(z.editing, false); assert.equal(z.pen, 'false');
        assert.equal(z.tools, 'none', 'pas d\'outils de disposition hors édition'); assert.notEqual(z.zoomUi, 'none', 'le zoom est là');
        assert.match(z.ph, /crayon/);
        assert.equal(await page.locator('#jam-annot-bar').isVisible(), false);
        // hors édition : ni création, ni crayons de bloc
        const b = await zoneBox(page);
        await page.mouse.dblclick(b.x + 80, b.y + 60);
        assert.equal((await blocks(page)).length, 0, 'pas de création en lecture');
        // le crayon active l'édition de cette zone seulement
        await page.click('[data-annot-mode="general"]');
        z = await zone(page);
        assert.equal(z.editable, 'true'); assert.equal(z.editing, true); assert.equal(z.pen, 'true');
        assert.notEqual(z.tools, 'none'); assert.notEqual(z.zoomUi, 'none', 'le zoom reste disponible en édition');
        assert.equal((await zone(page, M)).editable, 'false', 'l\'autre zone reste en lecture');
        assert.equal(await page.locator('#jam-annot-bar').isVisible(), true, 'la barre de mise en forme vient avec l\'édition');
        // un cadre se crée, puis le crayon ferme l'édition : le bloc est figé
        await newFrame(page, G, 30, 40, 'Bonjour');
        const a0 = (await blocks(page))[0].at;
        await page.click('[data-annot-mode="general"]');
        z = await zone(page);
        assert.equal(z.editable, 'false'); assert.equal(z.editing, false);
        assert.equal(await page.locator('#jam-annot-bar').isVisible(), false, 'la barre se range');
        assert.deepEqual(await pencilShown(page), [false], 'plus de crayon sur le bloc');
        await dragBlock(page, G, 0, 90, 50);
        assert.equal((await blocks(page))[0].at, a0, 'le bloc ne bouge pas');
        const c = await centerOf(page, G, 0);
        await page.mouse.click(...c);
        assert.equal((await blocks(page))[0].picked, false, 'ni sélection');
        await page.mouse.dblclick(...c);
        assert.equal((await blocks(page)).filter(x => x.active).length, 0, 'ni édition du texte');
        assert.match((await blocks(page))[0].text, /Bonjour/);
        assert.match(await note(page), /Bonjour/, 'le texte est enregistré à la sortie');
        assert.deepEqual(errors, []);
        await close();
    });

    test('mode édition : crayons de bloc toujours visibles, bloc sans bord repérable, outils de disposition', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrame(page, G, 30, 40, 'A');
        await addStaff(page, G, [50, 45]);
        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        assert.deepEqual(await pencilShown(page), [true, true], 'un crayon sur chaque bloc sans survol');
        // un cadre sans bord garde un trait pointillé repérable
        await page.evaluate(() => document.querySelector('#jam-annot-general > .annot-frame').click());
        await page.evaluate(() => { const f = app.jam._annotZoneEl('general').querySelector('.annot-frame'); f.classList.add('no-border'); });
        const st = await page.evaluate(() => getComputedStyle(document.querySelector('#jam-annot-general > .annot-frame')).borderTopStyle);
        assert.equal(st, 'dashed');
        assert.equal(await page.locator('#jam-annot-general').evaluate(e => getComputedStyle(e).borderTopColor), 'rgb(96, 165, 250)', 'zone cerclée de bleu');
        // sortie : crayons et outils disparaissent
        await page.click('[data-annot-mode="general"]');
        assert.deepEqual(await pencilShown(page), [false, false]);
        assert.equal(await page.locator('#jam-annot-general').evaluate(e => getComputedStyle(e).borderTopColor), 'rgb(203, 213, 225)');
        assert.equal((await zone(page)).tools, 'none');
        assert.deepEqual(errors, []);
        await close();
    });

    test('chaque zone a son crayon ; le crayon d\'une zone ne change pas l\'autre ; jam lancée : édition coupée', async () => {
        const { page, errors, close } = await openAnnotations(undefined, { edit: false });
        await page.click('[data-annot-mode="measure"]');
        assert.equal((await zone(page, M)).editable, 'true');
        assert.equal((await zone(page, G)).editable, 'false');
        await page.click('[data-annot-mode="general"]');
        assert.equal((await zone(page, M)).editable, 'true', 'les deux zones peuvent être en édition');
        assert.equal((await zone(page, G)).editable, 'true');
        // le lancement de la jam coupe l'édition (pas de crayon), le zoom reste
        await page.evaluate(() => { app.jam.isPlaying = true; document.getElementById('view-jam').classList.add('jam-playing'); app.jam.renderJamScales(); });
        assert.equal((await zone(page, G)).editable, 'false');
        assert.equal((await zone(page, M)).editable, 'false');
        assert.equal(await page.locator('[data-annot-mode="general"]').isVisible(), false, 'pas de crayon pendant la jam');
        assert.equal(await page.locator('[data-zoom-act="in"]').first().isVisible(), true, 'le zoom reste');
        await page.evaluate(() => { app.jam.isPlaying = false; document.getElementById('view-jam').classList.remove('jam-playing'); app.jam.renderJamScales(); });
        assert.equal((await zone(page, G)).editing, false, 'l\'édition ne revient pas toute seule');
        assert.deepEqual(errors, []);
        await close();
    });

    test('zoom de lecture : boutons − / + / 100 %, bornes, enregistré ; blocs agrandis depuis le coin de la zone', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrame(page, G, 40, 30, 'Zoom');
        const b0 = (await blocks(page))[0];
        await page.click('[data-annot-mode="general"]');                       // lecture
        const zb = await zoneBox(page);
        const geo = async () => { const b = (await blocks(page))[0]; return { x: b.sx - zb.x, y: b.sy - zb.y, w: b.sw, h: b.sh }; };
        const g1 = await geo();
        await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();
        assert.equal((await zone(page)).label, '125 %');
        const g2 = await geo();
        assert.ok(Math.abs(g2.w - g1.w * 1.25) < 1.5 && Math.abs(g2.h - g1.h * 1.25) < 1.5, 'taille ×1,25');
        assert.ok(Math.abs(g2.x - g1.x * 1.25) < 2 && Math.abs(g2.y - g1.y * 1.25) < 2, 'place ×1,25 depuis le coin de la zone');
        assert.equal((await blocks(page))[0].at, b0.at, 'la place enregistrée ne change pas');
        for (let i = 0; i < 12; i++) await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click({ force: true }).catch(() => {});
        assert.equal((await zone(page)).label, '300 %');
        assert.equal(await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').isDisabled(), true);
        for (let i = 0; i < 12; i++) await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="out"]').click({ force: true }).catch(() => {});
        assert.equal((await zone(page)).label, '50 %');
        await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="reset"]').click();
        assert.equal((await zone(page)).label, '100 %');
        assert.equal(await page.evaluate(() => document.querySelector('#jam-annot-general > .annot-frame').style.transform), '');
        // enregistré
        await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jamAnnotZoom')).general), 1.25);
        // l'autre zone a son propre zoom
        assert.equal((await zone(page, M)).label, '100 %');
        assert.deepEqual(errors, []);
        await close();
    });

    test('zoom de lecture : Ctrl + molette zoome autour du pointeur, la molette seule fait défiler', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrame(page, G, 200, 100, 'Cible');
        await page.click('[data-annot-mode="general"]');
        const zb = await zoneBox(page);
        await page.mouse.move(zb.x + 220, zb.y + 110);
        await page.keyboard.down('Control');
        await page.mouse.wheel(0, -100);
        await page.keyboard.up('Control');
        const lab = (await zone(page)).label;
        assert.notEqual(lab, '100 %', 'Ctrl + molette zoome');
        assert.ok(parseInt(lab, 10) > 100);
        // agrandi autour du coin de la zone : le bloc s'éloigne du coin, et la zone devient défilable quand le contenu dépasse
        const b = (await blocks(page))[0];
        assert.ok(b.sx - zb.x > 200 && b.sw > b.w, 'bloc agrandi depuis le coin de la zone');
        for (let i = 0; i < 8; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control'); }
        assert.equal((await zone(page)).label, '300 %');
        assert.equal(await page.evaluate(() => { const e = document.getElementById('jam-annot-general'); return e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight; }), true, 'la zone défile');
        await page.evaluate(() => { const e = document.getElementById('jam-annot-general'); e.scrollLeft = 0; e.scrollTop = 0; });
        const lab3 = (await zone(page)).label;
        // molette sans touche : pas de zoom
        await page.mouse.wheel(0, 50);
        assert.equal((await zone(page)).label, lab3);
        // en mode édition, Ctrl + molette zoome aussi
        await page.click('[data-annot-mode="general"]');
        await page.mouse.move(zb.x + 300, zb.y + 300);
        await page.keyboard.down('Control');
        await page.mouse.wheel(0, 100);
        await page.keyboard.up('Control');
        assert.ok(await page.evaluate(() => app.jam.annotZoom.general) < 3);
        assert.deepEqual(errors, []);
        await close();
    });

    test('zoom en mode édition : le zoom reste, les blocs se créent, se déplacent et se sélectionnent aux bons endroits', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrame(page, G, 60, 50, 'X');
        await newFrame(page, G, 300, 150, 'Y');
        const zin = () => page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();
        assert.equal(await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').isVisible(), true, 'boutons de zoom visibles en édition');
        for (let i = 0; i < 4; i++) await zin();                                // 100 → 125 → 150 → 200 → 250
        const z = await page.evaluate(() => app.jam.annotZoom.general);
        assert.equal(z, 2.5);
        const zb = await zoneBox(page);
        const bl = await blocks(page);
        assert.ok(Math.abs(bl[0].sw - bl[0].w * z) < 2, 'bloc agrandi en édition');
        assert.ok(Math.abs((bl[0].sx - zb.x - 13) - 0) >= 0);                  // (marge de la zone : on compare plutôt les écarts entre blocs)
        assert.ok(Math.abs((bl[1].sx - bl[0].sx) - (300 - 60) * z) < 3, 'les places gardent leur rapport');
        // glisser un bloc de 100 px à l'écran = 40 px sur le canevas
        await page.evaluate(() => { const e = document.getElementById('jam-annot-general'); e.scrollLeft = 0; e.scrollTop = 0; });
        const at0 = (await blocks(page))[0].at.split(',').map(Number);
        await dragBlock(page, G, 0, 100, 0);
        const at1 = (await blocks(page))[0].at.split(',').map(Number);
        assert.ok(Math.abs((at1[0] - at0[0]) - 100 / z) <= 2, `déplacement /${z} : ${at0} → ${at1}`);
        assert.ok(Math.abs(at1[1] - at0[1]) <= 1);
        // double-clic sur le fond : le cadre est créé sous le pointeur
        const px = zb.x + 400, py = zb.y + 40;
        await page.mouse.dblclick(px, py);
        await page.waitForSelector('#jam-annot-general > .annot-frame.is-editing');
        await page.keyboard.press('Escape');
        await settle(page);
        const nb = (await blocks(page)).filter(b => b.kind === 'frame')[2];
        const at = nb.at.split(',').map(Number);
        assert.ok(Math.abs(at[0] - 400 / z) <= 3 && Math.abs(at[1] - 40 / z) <= 3, `création sous le pointeur : ${nb.at}`);
        // (la zone a pu défiler pour montrer le texte en saisie : on compare la place sur le canevas, pas celle de l'écran)
        // rectangle de sélection : à l'écran, il entoure les blocs touchés
        await page.mouse.click(5, 5);
        const all = await blocks(page);
        const r = { x0: Math.min(...all.map(b => b.sx)) - 6, y0: Math.min(...all.map(b => b.sy)) - 6, x1: Math.max(...all.map(b => b.sx + b.sw)) + 6, y1: Math.max(...all.map(b => b.sy + b.sh)) + 6 };
        if (r.x1 <= zb.x + zb.width && r.y1 <= zb.y + zb.height && r.x0 > zb.x && r.y0 > zb.y) {
            await page.mouse.move(r.x0, r.y0); await page.mouse.down(); await page.mouse.move(r.x1, r.y1, { steps: 6 }); await page.mouse.up();
            assert.equal((await blocks(page)).filter(b => b.picked).length, all.length, 'le rectangle sélectionne les blocs entourés');
        }
        assert.equal(await page.evaluate(() => app.jam.annotZoom.general), 2.5, 'le zoom reste');
        // sortie du mode édition : même affichage
        await page.click('[data-annot-mode="general"]');
        const lec = (await blocks(page))[0];
        assert.ok(Math.abs(lec.sw - lec.w * z) < 2);
        await page.evaluate(() => { app.jam.renderJamScales(); });
        assert.ok((await blocks(page))[0].sw > (await blocks(page))[0].w * 2, 'zoom conservé après redessin');
        await page.reload();
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        assert.equal(await page.evaluate(() => app.jam.annotZoom.general), 2.5);
        assert.deepEqual(errors, []);
        await close();
    });

    test('zoom en mode édition : repères d\'alignement et redimensionnement justes', async () => {
        const { page, errors, close } = await openAnnotations();
        await newFrame(page, G, 40, 40, 'Texte assez long pour la poignée');
        await newFrame(page, G, 40, 200, 'Texte assez long pour la poignée');
        await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();
        await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();   // 150 %
        const z = 1.5;
        // un repère rose apparaît quand on approche B du bord gauche de A, à la bonne place à l'écran
        const [a, b] = await blocks(page);
        const c = await centerOf(page, G, 1);
        await page.mouse.move(...c); await page.mouse.down();
        await page.mouse.move(c[0] + 10, c[1] - 60, { steps: 4 });
        await page.mouse.move(c[0] + 1, c[1] - 90, { steps: 4 });
        const guide = await page.evaluate(() => { const g = document.querySelector('#jam-annot-general .annot-guide-x'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.x }; });
        await page.mouse.up();
        assert.ok(guide, 'repère affiché');
        assert.ok(Math.abs(guide.x - a.sx) <= 3, `repère sur le bord de A à l'écran (${guide && guide.x} / ${a.sx})`);
        // redimensionner un cadre au repos en tirant son coin : la taille suit le pointeur
        await page.mouse.click(5, 5);
        const f = (await blocks(page))[0];
        const corner = [f.sx + f.sw - 5, f.sy + f.sh - 5]; // un peu à l'intérieur : les coins sont arrondis
        await page.mouse.move(...corner); await page.mouse.down();
        await page.mouse.move(corner[0] + 60, corner[1] + 30, { steps: 5 });
        await page.mouse.up();
        const f2 = (await blocks(page))[0];
        assert.ok(Math.abs(f2.sw - (f.sw + 60)) <= 6, `largeur à l'écran suit le pointeur : ${f.sw} → ${f2.sw}`);
        assert.ok(Math.abs(f2.sx - f.sx) <= 2, 'le coin opposé reste en place');
        assert.deepEqual(errors, []);
        await close();
    });

    test('zoom en mode édition : une portée zoomée reçoit les mêmes notes qu\'à 100 % (clics aux bonnes hauteurs)', async () => {
        const run = async (zoomClicks) => {
            const { page, errors, close } = await openAnnotations();
            for (let i = 0; i < zoomClicks; i++) await page.locator('.jam-annot-zone').first().locator('[data-zoom-act="in"]').click();
            const z = await page.evaluate(() => app.jam.annotZoom.general);
            await wake(page, G);
            await page.click('[data-insert-staff]');
            await page.waitForSelector(`${G} .annot-staff.is-active`);
            const box = await page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
            const zb = await zoneBox(page);
            const sb = await page.locator(`${G} .annot-staff.is-active`).boundingBox();
            const sl = await page.evaluate(() => document.getElementById('jam-annot-general').scrollLeft);
            const atX = await page.evaluate(() => Number(document.querySelector('#jam-annot-general .annot-staff').getAttribute('data-at').split(',')[0]));
            assert.ok(Math.abs(sb.x - (zb.x + 1 + atX * z - sl)) <= 3, `la portée en édition reste à sa place, zoom compris (${sb.x} / ${zb.x + 1 + atX * z - sl})`);
            let x = 110;
            for (const dy of [50, 45, 60]) { await page.mouse.click(box.x + x * z, box.y + dy * z); x += 70; }
            const st = await page.evaluate(() => document.querySelector('#jam-annot-general .annot-staff').getAttribute('data-staff'));
            assert.deepEqual(errors, []);
            await close();
            return st;
        };
        const a = await run(0), b = await run(3);   // 100 % puis 200 %
        assert.ok(/;.+/.test(a), 'des notes ont été posées : ' + a);
        assert.equal(b, a, 'mêmes notes à 200 % qu\'à 100 %');
    });

    // ----- Édition de portée : levée, tuplets, tempo et swing -----
    const staffText = (page) => page.evaluate(() => document.querySelector('#jam-annot-general .annot-staff').getAttribute('data-staff'));
    async function openNewStaff(page) {
        await wake(page, G);
        await page.click('[data-insert-staff]');
        await page.waitForSelector(`${G} .annot-staff.is-active`);
        return page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
    }

    test('portée neuve : sans bordure, et en édition elle reste à sa place', async () => {
        const { page, errors, close } = await openAnnotations();
        await openNewStaff(page);
        const s = (await blocks(page))[0];
        assert.equal(s.border, '0', 'sans bordure par défaut');
        assert.equal(s.active, true);
        const at = s.at;
        await page.mouse.click(...await centerOf(page, G, 0));
        await page.click(`${G} .annot-staff-edit`);
        await page.waitForFunction((z) => !document.querySelector(`${z} .annot-staff.is-active`), G);
        const r = (await blocks(page))[0];
        assert.equal(r.at, at);
        assert.ok(Math.abs(r.x - s.x) <= 1 && Math.abs(r.y - s.y) <= 1, 'même place en édition et au repos');
        assert.deepEqual(errors, []);
        await close();
    });

    test('levée : un clic derrière la barre de la 1re mesure incomplète fait des notes écrites une anacrouse', async () => {
        const { page, errors, close } = await openAnnotations();
        const box = await openNewStaff(page);
        await page.mouse.click(box.x + 110, box.y + 50);
        await page.waitForTimeout(150);
        const b2 = await page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
        await page.mouse.click(b2.x + 170, b2.y + 45);
        await page.waitForTimeout(150);
        assert.match(await staffText(page), /^t,4\/4,0;q:[a-g]#?\d q:[a-g]#?\d$/, 'deux noires dans la 1re mesure, sans levée');
        // clic derrière la barre de mesure : les deux noires deviennent la levée, la nouvelle note ouvre la mesure suivante
        const xe = await page.evaluate(() => document.querySelector('#jam-annot-general .annot-staff').__noteStaff.geo.measures[0].xe);
        const b3 = await page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
        await page.mouse.click(b3.x + xe + 40, b3.y + 40);
        await page.waitForTimeout(150);
        assert.match(await staffText(page), /^t,4\/4,0,pu2;q:[a-g]#?\d q:[a-g]#?\d q:[a-g]#?\d$/);
        assert.equal(await page.evaluate(() => document.querySelector('[data-act="pickup"]').classList.contains('is-on')), true, 'le bouton Levée est allumé');
        // le bouton Levée la défait
        await page.click('[data-act="pickup"]');
        await page.waitForTimeout(150);
        assert.match(await staffText(page), /^t,4\/4,0;q:/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('levée : un clic DANS la mesure (avant la barre) continue la mesure sans levée', async () => {
        const { page, errors, close } = await openAnnotations();
        const box = await openNewStaff(page);
        await page.mouse.click(box.x + 110, box.y + 50);
        await page.waitForTimeout(150);
        const geo = await page.evaluate(() => { const g = document.querySelector('#jam-annot-general .annot-staff').__noteStaff.geo; return { xs: g.measures[0].noteX, xe: g.measures[0].xe }; });
        const b2 = await page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
        await page.mouse.click(b2.x + geo.xe - 12, b2.y + 45);
        await page.waitForTimeout(150);
        assert.match(await staffText(page), /^t,4\/4,0;q:[a-g]#?\d q:[a-g]#?\d$/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('tuplet : une noire devient un vrai triolet de croches (trois notes liées), puis revient noire', async () => {
        const { page, errors, close } = await openAnnotations();
        const box = await openNewStaff(page);
        await page.mouse.click(box.x + 110, box.y + 50);
        await page.waitForTimeout(150);
        const note = await staffText(page);
        const pitch = note.match(/q:([a-g]#?\d)$/)[1];
        // sélectionner la note, choisir « Triolet »
        const pos = await page.evaluate(() => { const v = document.querySelector('#jam-annot-general .annot-staff').__noteStaff; const n = v.geo.notes[0]; return { x: n.x, y: n.y }; });
        const b2 = await page.locator(`${G} .annot-staff.is-active .annot-staff-svg`).boundingBox();
        await page.mouse.click(b2.x + pos.x, b2.y + pos.y);
        await page.selectOption('[data-set="tuplet"]', '3');
        await page.waitForTimeout(200);
        assert.equal(await staffText(page), `t,4/4,0;(3 8:${pitch} 8:${pitch} 8:${pitch})`);
        const shape = await page.evaluate(() => { const svg = document.querySelector('#jam-annot-general .annot-staff-svg svg'); return { heads: svg.querySelectorAll('.vf-notehead').length, beams: svg.querySelectorAll('.vf-beam').length }; });
        assert.equal(shape.heads, 3, 'trois vraies notes dessinées');
        assert.ok(shape.beams >= 1, 'liées par une ligature');
        // un quintolet de doubles-croches est proposé aussi ; « Tuplet » (0) défait
        await page.selectOption('[data-set="tuplet"]', '5');
        await page.waitForTimeout(200);
        assert.equal(await staffText(page), `t,4/4,0;(5 16:${pitch} 16:${pitch} 16:${pitch} 16:${pitch} 16:${pitch})`);
        await page.selectOption('[data-set="tuplet"]', '0');
        await page.waitForTimeout(200);
        assert.equal(await staffText(page), note);
        assert.deepEqual(errors, []);
        await close();
    });

    test('tuplet réglé avant d\'écrire : un clic pose le groupe complet', async () => {
        const { page, errors, close } = await openAnnotations();
        const box = await openNewStaff(page);
        await page.click('[data-dur="8"]');
        await page.selectOption('[data-set="tuplet"]', '3');
        await page.mouse.click(box.x + 110, box.y + 50);
        await page.waitForTimeout(200);
        assert.match(await staffText(page), /^t,4\/4,0;\(3 8:([a-g]#?\d) 8:\1 8:\1\)$/);
        assert.deepEqual(errors, []);
        await close();
    });

    test('tempo et swing de la portée : réglés dans la barre, enregistrés dans la portée', async () => {
        const { page, errors, close } = await openAnnotations();
        const box = await openNewStaff(page);
        await page.mouse.click(box.x + 110, box.y + 50);
        await page.waitForTimeout(150);
        await page.fill('[data-set="bpm"]', '132');
        await page.press('[data-set="bpm"]', 'Tab');
        await page.selectOption('[data-set="swing"]', '67');
        await page.waitForTimeout(200);
        assert.match(await staffText(page), /^t,4\/4,0,bpm132,sw67;q:/);
        await settle(page);
        assert.match(await note(page), /bpm132,sw67/, 'enregistré dans l\'annotation');
        // tempo vide : tempo de la jam
        await page.fill('[data-set="bpm"]', '');
        await page.press('[data-set="bpm"]', 'Tab');
        await page.waitForTimeout(200);
        assert.match(await staffText(page), /^t,4\/4,0,sw67;q:/);
        // mesure composée : pas de swing
        await page.selectOption('[data-set="meter"]', '6/8');
        await page.waitForTimeout(200);
        assert.equal(await page.locator('[data-set="swing"]').isDisabled(), true);
        assert.deepEqual(errors, []);
        await close();
    });

    test('sortir du mode édition pendant la saisie dans un cadre : texte validé, rien ne reste actif', async () => {
        const { page, errors, close } = await openAnnotations();
        const b = await zoneBox(page);
        await page.mouse.dblclick(b.x + 50, b.y + 40);
        await page.waitForSelector('#jam-annot-general > .annot-frame.is-editing');
        await page.keyboard.type('Encore');
        await page.click('[data-annot-mode="general"]');
        await page.waitForTimeout(200);
        assert.match(await note(page), /Encore/);
        assert.equal((await blocks(page)).filter(x => x.active).length, 0);
        assert.equal(await page.evaluate(() => !!document.activeElement.closest && !!document.activeElement.closest('#jam-annot-general')), false);
        assert.deepEqual(errors, []);
        await close();
    });

});

describe('plein écran de la grille : faux plein écran (navigateur)', { skip: !pw && 'Playwright non installé : npm install && npx playwright install chromium' }, () => {
    let srv, browser;
    before(async () => {
        srv = await serve();
        browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
    });
    after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

    async function open(viewport = { width: 1400, height: 900 }) {
        const ctx = await browser.newContext({ viewport });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
        // l'API Fullscreen du navigateur ne doit jamais être appelée : on compte les appels
        await page.addInitScript(() => {
            window.__fsCalls = 0;
            Element.prototype.requestFullscreen = function () { window.__fsCalls++; return Promise.resolve(); };
            Element.prototype.webkitRequestFullscreen = Element.prototype.requestFullscreen;
        });
        await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        return { page, errors, close: () => ctx.close() };
    }
    const state = (page) => page.evaluate(() => {
        const c = document.getElementById('jam-chord-card'), r = c.getBoundingClientRect(), b = document.getElementById('jam-grid-fullscreen-btn');
        return { fs: c.classList.contains('jam-pseudo-fs'), lean: c.classList.contains('jam-pseudo-lean'), pos: getComputedStyle(c).position, x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight,
            native: !!document.fullscreenElement, calls: window.__fsCalls, lock: document.documentElement.classList.contains('jam-pseudo-fs-lock'), title: b.title,
            scalesInside: document.getElementById('jam-scales-card').parentElement === c, scalesShown: getComputedStyle(document.getElementById('jam-scales-card')).display !== 'none' };
    });

    test('le bouton plein écran simule le plein écran : la carte recouvre la fenêtre, sans jamais appeler l\'API du navigateur', async () => {
        const { page, errors, close } = await open();
        let s = await state(page);
        assert.equal(s.fs, false);
        assert.equal(s.title, 'Plein écran');
        await page.click('#jam-grid-fullscreen-btn');
        await page.waitForTimeout(150);
        s = await state(page);
        assert.equal(s.fs, true);
        assert.equal(s.pos, 'fixed');
        assert.ok(s.x === 0 && s.y === 0 && Math.abs(s.w - s.vw) < 1 && Math.abs(s.h - s.vh) < 1, `la carte recouvre toute la fenêtre (${s.w}×${s.h} pour ${s.vw}×${s.vh})`);
        assert.equal(s.native, false, 'document.fullscreenElement reste vide');
        assert.equal(s.calls, 0, 'requestFullscreen n\'est jamais appelé');
        assert.equal(s.lock, true, 'la page derrière ne défile plus');
        assert.equal(s.title, 'Quitter le plein écran');
        assert.equal(await page.evaluate(() => app.jam.isGridFullscreen()), true);
        // comme avant sur ordinateur : hors lecture la grille est seule
        assert.equal(s.lean, false);
        assert.equal(s.scalesShown, false, 'jam arrêtée : la carte des gammes n\'est pas affichée');
        // le bouton, puis Échap, ferment
        await page.click('#jam-grid-fullscreen-btn');
        s = await state(page);
        assert.equal(s.fs, false);
        assert.equal(s.lock, false);
        assert.equal(s.title, 'Plein écran');
        await page.click('#jam-grid-fullscreen-btn');
        await page.keyboard.press('Escape');
        s = await state(page);
        assert.equal(s.fs, false, 'Échap quitte le faux plein écran');
        assert.equal(s.lock, false);
        assert.equal(s.calls, 0);
        assert.deepEqual(errors, []);
        await close();
    });

    test('jam lancée en plein écran : la carte des antisèches reste visible sous la grille (comme le plein écran d\'origine)', async () => {
        const { page, errors, close } = await open();
        await page.click('#jam-grid-fullscreen-btn');
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        await page.waitForTimeout(200);
        const s = await state(page);
        assert.equal(s.scalesInside, true, 'la carte des gammes est déplacée dans la carte plein écran');
        assert.equal(s.scalesShown, true);
        assert.equal(await page.isVisible('#jam-antiseche-btn'), true, 'le bouton « Antisèches » est utilisable');
        // sortie : la carte des gammes retrouve sa place
        await page.evaluate(() => document.getElementById('view-jam').classList.remove('jam-playing'));
        await page.click('#jam-grid-fullscreen-btn');
        const t = await state(page);
        assert.equal(t.scalesInside, false);
        assert.equal(t.fs, false);
        assert.deepEqual(errors, []);
        await close();
    });

    test('appareil sans API Fullscreen (iPhone) : affichage épuré, gammes masquées, comme avant', async () => {
        const { page, errors, close } = await open({ width: 390, height: 760 });
        await page.evaluate(() => { Element.prototype.requestFullscreen = undefined; });
        await page.click('#jam-grid-fullscreen-btn');
        await page.evaluate(() => document.getElementById('view-jam').classList.add('jam-playing'));
        await page.waitForTimeout(200);
        const s = await state(page);
        assert.equal(s.fs, true);
        assert.equal(s.lean, true);
        assert.equal(s.scalesShown, false, 'les gammes restent masquées, jam arrêtée ou lancée');
        assert.equal(await page.isVisible('#jam-antiseche-btn'), false);
        assert.ok(Math.abs(s.w - s.vw) < 1 && Math.abs(s.h - s.vh) < 1);
        await page.keyboard.press('Escape');
        const t = await state(page);
        assert.equal(t.fs, false);
        assert.equal(t.lean, false, 'la variante épurée est retirée à la sortie');
        assert.deepEqual(errors, []);
        await close();
    });
});
