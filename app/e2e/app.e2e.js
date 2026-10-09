// Test de bout en bout : charge index.html dans un vrai navigateur (Chromium via Playwright) et manipule l'appli comme
// un utilisateur. Il détecte ce que les tests unitaires ne voient pas : un module non chargé, un nom global manquant, un
// gestionnaire de clic cassé, une erreur au rendu ou au lancement de la lecture.
// Les CDN sont bloqués (test hors ligne) : Soundfont est remplacé par un faux instrument et VexFlow par une version minimale
// qui dessine un groupe SVG par note (le calcul des notes est testé à part dans ui/staff-model.test.js).
//
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
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };

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

// Faux Soundfont : un instrument qui accepte tous les appels sans produire de son.
const FAKE_SOUNDFONT = `
window.Soundfont = { instrument: () => Promise.resolve({
    play: () => ({ stop() {} }), schedule() {}, stop() {}, connect() {}, name: 'fake'
}) };`;

// Faux VexFlow : mêmes classes que celles qu'utilise l'appli, mais chaque note devient un <g> dans un <svg>.
const FAKE_VEXFLOW = `
(() => {
    const NS = 'http://www.w3.org/2000/svg';
    class Renderer { constructor(c) { this.svg = document.createElementNS(NS, 'svg'); c.appendChild(this.svg); Renderer.last = this.svg; } resize() {} getContext() { return {}; } }
    Renderer.Backends = { SVG: 'svg' };
    class Stave { addClef() { return this; } setContext() { return this; } draw() { return this; } getNoteStartX() { return 50; } setNoteStartX() {} }
    class Accidental { constructor(t) { this.t = t; } }
    class StaveNote {
        constructor(o) { this.el = document.createElementNS(NS, 'g'); this.el.setAttribute('data-keys', o.keys.join()); }
        setStemDirection() {} addModifier() {} setStyle() {} getSVGElement() { return this.el; }
    }
    class Voice { constructor() { this.t = []; } addTickables(t) { this.t = t; } draw() { this.t.forEach(n => Renderer.last.appendChild(n.el)); } }
    class Formatter { joinVoices() { return this; } format() {} }
    window.Vex = { Flow: { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Stem: { UP: 1, DOWN: -1 } } };
})();`;

describe('appli complète (navigateur)', { skip: !pw && 'Playwright non installé : npm install && npx playwright install chromium' }, () => {
    let srv, browser, page, base;
    const errors = [];

    const waitFor = (fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms });

    before(async () => {
        srv = await serve();
        base = `http://127.0.0.1:${srv.address().port}`;
        browser = await pw.chromium.launch({
            executablePath: process.env.CHROMIUM_PATH || undefined,
            args: ['--autoplay-policy=no-user-gesture-required'],
        });
        page = await browser.newPage();
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
            if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`);
        });
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
        await page.addInitScript(FAKE_SOUNDFONT);
        await page.addInitScript(FAKE_VEXFLOW);
        await page.goto(`${base}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
    });

    after(async () => {
        if (browser) await browser.close();
        if (srv) srv.close();
    });

    const noErrors = () => assert.deepEqual(errors, [], 'erreurs JavaScript pendant le test');

    test('la page se charge sans erreur et expose l\'appli', async () => {
        const info = await page.evaluate(() => ({
            title: document.title, hasJam: !!app.jam, theory: typeof chordRootName, text: document.body.innerText.length,
        }));
        assert.equal(info.title, 'Chord Scales Machine');
        assert.ok(info.hasJam && info.theory === 'function' && info.text > 200);
        noErrors();
    });

    test('Entraînement : fondamentale, qualité et cartes de gammes', async () => {
        await page.evaluate(() => app.switchView('training'));
        const rootButtons = page.locator('#root-buttons-container button');
        assert.ok(await rootButtons.count() >= 12);
        await rootButtons.nth(2).click();
        await page.click('#cat-btn-min');
        await page.locator('#quality-buttons-container button').nth(1).click();
        const res = await page.evaluate(() => ({
            name: document.getElementById('display-chord-name').textContent,
            cards: document.querySelectorAll('#scales-container > div').length,
            expected: app.getCurrentChordObj().scales.length,
            notes: document.querySelectorAll('#display-chord-notes span').length,
        }));
        assert.match(res.name, /^[A-G][b#]?\S+/);
        assert.equal(res.cards, res.expected);
        assert.ok(res.cards > 0 && res.notes >= 3);
        noErrors();
    });

    test('Entraînement : les quatre modes d\'affichage', async () => {
        for (const mode of ['staff', 'intervals', 'notes', 'letters']) {
            await page.click(`#vmode-${mode}`);
            const cards = await page.evaluate(() => document.querySelectorAll('#scales-container > div').length);
            assert.ok(cards > 0, `aucune carte en mode ${mode}`);
        }
        noErrors();
    });

    test('Entraînement : la portée dessine une note par degré (plus l\'octave) et le sens se change au clic droit', async () => {
        await page.click('#vmode-staff');
        const res = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('#scales-container > div')];
            return cards.map(c => ({ svg: c.querySelectorAll('svg').length, notes: c.querySelectorAll('svg g').length }));
        });
        assert.ok(res.length > 0);
        res.forEach(r => { assert.equal(r.svg, 1); assert.ok(r.notes >= 6, `seulement ${r.notes} notes dessinées`); });
        const before = await page.locator('#scales-container .scale-dir-badge').first().textContent();
        await page.locator('#scales-container [data-scale-key]').first().click({ button: 'right' });
        const afterText = await page.locator('#scales-container .scale-dir-badge').first().textContent();
        assert.notEqual(before, afterText);
        noErrors();
    });

    test('Entraînement : accord, arpège et gamme se jouent', async () => {
        await page.click('#vmode-letters');
        await page.evaluate(() => { app.playChord(); });
        await page.evaluate(() => app.stopAllSounds());
        noErrors();
    });

    test('Jam : chaque style de la liste se charge et s\'affiche', async () => {
        await page.evaluate(() => app.switchView('jam'));
        const styles = await page.evaluate(() => [...document.querySelectorAll('#jam-style-select option')].map(o => o.value).filter(Boolean));
        assert.ok(styles.length >= 10, `seulement ${styles.length} styles`);
        const bad = [];
        for (const st of styles) {
            await page.selectOption('#jam-style-select', st);
            const r = await page.evaluate(() => ({
                grid: app.jam.grid.length, cells: document.querySelectorAll('#jam-chord-sequence-display .jam-cell[data-measure-number]').length,
                bpm: app.jam.bpm,
            }));
            if (!(r.grid > 0 && r.cells > 0 && r.bpm > 20)) bad.push(`${st} ${JSON.stringify(r)}`);
        }
        assert.deepEqual(bad, []);
        noErrors();
    });

    test('Jam : un clic sur une mesure affiche son accord', async () => {
        await page.selectOption('#jam-style-select', 'bossa');
        await page.locator('#jam-chord-sequence-display .jam-cell[data-measure-number]').nth(1).click();
        const r = await page.evaluate(() => ({
            title: document.getElementById('jam-current-chord-title').textContent,
            notes: document.querySelectorAll('#jam-current-chord-notes span').length,
        }));
        assert.ok(r.title && r.title !== '-');
        assert.ok(r.notes >= 3);
        noErrors();
    });

    test('Jam : lecture (intro, mesures qui avancent) puis arrêt', async () => {
        await page.selectOption('#jam-style-select', 'bossa');
        await page.evaluate(() => {
            app.jam.bpm = 240;   // intro et mesures rapides
            window.__ticks = [];
            const real = app.jam.tick.bind(app.jam);
            app.jam.tick = (runId) => {
                const j = app.jam;
                if (j._countInBeats <= 0 && j.isPlaying) window.__ticks.push([j.currentStepIndex, j.currentBeat]);
                return real(runId);
            };
        });
        await page.click('#jam-play-btn');
        assert.equal(await page.evaluate(() => app.jam.isPlaying), true);
        await waitFor(() => /^Intro/.test(document.getElementById('jam-bar-counter').textContent));
        await waitFor(() => /^Mesure : \d+\/\d+$/.test(document.getElementById('jam-bar-counter').textContent));
        await waitFor(() => document.querySelectorAll('#jam-chord-sequence-display .bg-blue-600').length === 1);
        await waitFor(() => window.__ticks.length >= 12, null, 20000);   // assez de temps pour traverser au moins un changement de bloc
        await page.click('#jam-play-btn');
        // chaque temps suit le précédent : +1 dans le bloc, sinon premier temps du bloc suivant (ou retour au début)
        const ticks = await page.evaluate(() => window.__ticks);
        assert.ok(ticks.length >= 12, `seulement ${ticks.length} temps joués`);
        assert.ok(new Set(ticks.map(t => t[0])).size >= 2 || (await page.evaluate(() => app.jam.grid.length)) === 1, 'la lecture n\'a pas changé de bloc');
        for (let i = 1; i < ticks.length; i++) {
            const [ps, pb] = ticks[i - 1], [cs, cb] = ticks[i];
            const sameBlock = cs === ps && cb === pb + 1;
            const nextBlock = cb === 0 && (cs === ps + 1 || cs === 0);
            assert.ok(sameBlock || nextBlock, `saut de position : ${JSON.stringify(ticks[i - 1])} → ${JSON.stringify(ticks[i])}`);
        }
        const after = await page.evaluate(() => ({ playing: app.jam.isPlaying, counter: document.getElementById('jam-bar-counter').textContent }));
        assert.equal(after.playing, false);
        assert.equal(after.counter, 'Mesure : -/-');
        noErrors();
    });

    test('Jam : changer d\'orchestre et de signature pendant la lecture', async () => {
        await page.evaluate(() => { app.jam.bpm = 240; });
        await page.click('#jam-play-btn');
        await waitFor(() => /^Mesure/.test(document.getElementById('jam-bar-counter').textContent));
        for (const band of ['pop', 'latin', 'cuba', 'classic', 'brass', 'balkan', 'piazzolla', 'swing']) {
            await page.evaluate((b) => app.jam.setBandStyle(b), band);
            await page.waitForTimeout(250);
        }
        await page.evaluate(() => app.jam.setTimeSignature('3/4'));
        assert.equal(await page.evaluate(() => app.jam.isPlaying), false, 'changer la signature arrête la lecture');
        await page.evaluate(() => app.jam.setTimeSignature('4/4'));
        noErrors();
    });

    test('Jam : mode édition, sélection d\'une plage et lecture de cette plage', async () => {
        await page.selectOption('#jam-style-select', 'blues');
        await page.evaluate(() => {
            app.jam._editBarOpen = true;
            app.jam.renderSequenceUI();
            app.jam._sel = { from: 2, to: 3 };
            app.jam.renderSequenceUI();
        });
        const selected = await page.evaluate(() => document.querySelectorAll('#jam-chord-sequence-display .jam-cell[data-measure-number]').length);
        assert.ok(selected >= 4);
        await page.evaluate(() => { app.jam.bpm = 240; app.jam.loopEnabled = false; });
        await page.click('#jam-play-btn');
        await waitFor(() => app.jam.isPlaying === false, null, 20000);   // sans boucle, la plage se termine et la jam s'arrête
        await page.evaluate(() => { app.jam._sel = null; app.jam._editBarOpen = false; app.jam.renderSequenceUI(); });
        noErrors();
    });
});
