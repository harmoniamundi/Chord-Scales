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
        // Les vraies bibliothèques sont maintenant dans app/vendor/ : on les bloque pour garder les faux ci-dessous (test rapide, sans audio réel).
        await page.route('**/app/vendor/**', (r) => r.abort());
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
        for (const band of ['pop', 'latin', 'cuba', 'classic', 'guitar', 'brass', 'balkan', 'piazzolla', 'swing']) {
            await page.evaluate((b) => app.jam.setBandStyle(b), band);
            await page.waitForTimeout(250);
        }
        await page.evaluate(() => app.jam.setTimeSignature('3/4'));
        assert.equal(await page.evaluate(() => app.jam.isPlaying), false, 'changer la signature arrête la lecture');
        await page.evaluate(() => app.jam.setTimeSignature('4/4'));
        noErrors();
    });

    test('Jam : bouton « À l\'aveugle » (désactivé par défaut) masque surbrillance, noms d\'accords et gammes pendant la lecture', async () => {
        const state = () => page.evaluate(() => {
            const shown = (id) => { const e = document.getElementById(id); const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
            return {
                pressed: document.getElementById('jam-blind-toggle').getAttribute('aria-pressed'),
                lit: document.querySelectorAll('#jam-chord-sequence-display .bg-blue-600, #jam-chord-sequence-display .jam-half-active').length,
                chords: shown('jam-current-chord-group'), scales: shown('jam-scale-visualizer'), scaleTitle: shown('jam-current-scale-title'),
            };
        });
        await page.evaluate(() => { app.jam.bpm = 240; app.jam.loopEnabled = true; });
        assert.equal((await state()).pressed, 'false', 'désactivé par défaut');
        await page.click('#jam-blind-toggle');                       // activé avant le lancement
        await page.click('#jam-play-btn');
        await waitFor(() => /^Mesure/.test(document.getElementById('jam-bar-counter').textContent) || app.jam._countInBeats === 0);
        await waitFor(() => app.jam.isPlaying && app.jam._countInBeats === 0 && app.jam.currentStepIndex >= 0);
        await page.waitForTimeout(600);
        let s = await state();
        assert.deepEqual(s, { pressed: 'true', lit: 0, chords: false, scales: false, scaleTitle: false }, 'rien n\'est révélé en lecture');
        await page.click('#jam-blind-toggle');                       // retiré en cours de jam : tout réapparaît
        await page.waitForTimeout(300);
        s = await state();
        assert.deepEqual(s, { pressed: 'false', lit: 1, chords: true, scales: true, scaleTitle: true });
        await page.click('#jam-blind-toggle');
        await page.click('#jam-play-btn');                           // arrêt : la grille et les noms reviennent même masque activé
        assert.equal(await page.evaluate(() => app.jam.isPlaying), false);
        s = await state();
        assert.equal(s.chords && s.scales && s.scaleTitle, true);
        await page.click('#jam-blind-toggle');                       // retour à l'état par défaut
        await page.evaluate(() => { app.jam.loopEnabled = false; });
        noErrors();
    });

    test('Jam : bouton Harmonisation — clic sur un accord = plaqué + notes ; clic sur son nom = arpège ; suit la tonalité', async () => {
        const state = () => page.evaluate(() => ({
            open: !document.getElementById('harmony-modal').classList.contains('hidden'),
            key: document.getElementById('harmony-key-title').textContent,
            chips: [...document.querySelectorAll('#harmony-chords .harmony-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim()),
            on: [...document.querySelectorAll('#harmony-chords .harmony-chip.is-on')].length,
            name: document.getElementById('harmony-notes-title').textContent,
            rowShown: !document.getElementById('harmony-notes-row').classList.contains('hidden'),
            sameLine: (() => { const t = document.getElementById('harmony-notes-title').getBoundingClientRect(), n = document.querySelector('#harmony-notes span'); if (!n) return null; const r = n.getBoundingClientRect(); return Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2) < 12; })(),
            notes: [...document.querySelectorAll('#harmony-notes span')].map(s => s.textContent),
            modeButtons: document.querySelectorAll('#harmony-modal #harmony-mode-chord, #harmony-modal #harmony-mode-arp').length,
        }));
        await page.selectOption('#jam-key-select', '0');
        await page.selectOption('#jam-quality-select', 'ionian');
        assert.equal((await state()).open, false, 'fermé par défaut');
        await page.click('#jam-harmony-btn');
        let s = await state();
        assert.equal(s.open, true);
        assert.equal(s.key, 'C Majeur');
        assert.equal(s.chips.length, 7);
        assert.equal(s.modeButtons, 0, 'plus de boutons Accord / Arpège');
        assert.deepEqual(s.notes, [], 'aucune note avant le premier clic');
        assert.equal(s.rowShown, false);
        await page.evaluate(() => { window.__harmonyCalls = []; const j = app.jam, a = app, c = a.playJamChord.bind(a), r = j.playChordArpeggioFor.bind(j);
            a.playJamChord = (...x) => { window.__harmonyCalls.push(['chord', ...x]); return c(...x); };
            j.playChordArpeggioFor = (...x) => { window.__harmonyCalls.push(['arp', x[0].rootIndex, x[0].chordId]); return r(...x); }; });
        await page.locator('#harmony-chords .harmony-chip').nth(4).click();          // V = G7 : joué plaqué
        s = await state();
        assert.deepEqual(s.notes, ['G', 'B', 'D', 'F']);
        assert.equal(s.on, 1);
        assert.equal(s.name, 'G7', 'nom de l\'accord sans le degré');
        assert.equal(s.rowShown && s.sameLine, true, 'le nom est sur la même ligne que les notes');
        assert.deepEqual(await page.evaluate(() => window.__harmonyCalls), [['chord', 7, '7']]);
        await page.click('#harmony-notes-title');                                    // clic sur le nom : arpège
        assert.deepEqual(await page.evaluate(() => window.__harmonyCalls), [['chord', 7, '7'], ['arp', 7, '7']]);
        await page.locator('#harmony-chords .harmony-chip').nth(1).click();          // ii = Dm7
        s = await state();
        assert.deepEqual(s.notes, ['D', 'F', 'A', 'C']);
        await page.selectOption('#jam-key-select', '2');                              // le pop-up suit la tonalité (D)
        await page.selectOption('#jam-quality-select', 'aeolian');
        s = await state();
        assert.equal(s.key, 'D Mineur');
        assert.equal(s.chips[0].startsWith('D'), true);
        await page.keyboard.press('Escape');
        assert.equal((await state()).open, false, 'Échap ferme le pop-up');
        await page.selectOption('#jam-key-select', '0');
        await page.selectOption('#jam-quality-select', 'ionian');
        noErrors();
    });

    test('Jam : chiffrage des degrés jazz / classique en mineur (grille, panneau d\'analyse, Harmonisation, style, sauvegarde)', async () => {
        const gridLabels = () => page.evaluate(() => [...document.querySelectorAll('#jam-chord-sequence-display .jam-fn-label')].map(e => e.textContent.trim()));
        const popup = () => page.evaluate(() => {
            const p = document.querySelector('.jm-pop [data-conv]') && document.querySelector('.jm-pop [data-conv]').closest('.jm-pop');
            if (!p) return null;
            return { on: [...p.querySelectorAll('[data-conv].is-on')].map(b => b.dataset.conv), labels: [...p.querySelectorAll('.jm-fn-row b')].map(b => b.textContent) };
        });
        // grille enregistrée (donc sans style) : la mineur, Am G F E
        await page.evaluate(() => {
            const g = [[9, 'minTriad'], [7, 'majTriad'], [5, 'majTriad'], [4, 'majTriad']].map(([r, c]) => ({ rootIndex: r, chordId: c, scaleId: 'aeolian', measures: 1 }));
            const saved = JSON.parse(localStorage.getItem('jamSavedGrids') || '{}');
            saved['e2e-andalouse'] = { grid: g, settings: { key: 9, quality: 'aeolian', bpm: 100, timeSignature: '4/4' } };
            localStorage.setItem('jamSavedGrids', JSON.stringify(saved));
            app.jam.loadSavedGrid('e2e-andalouse');
            app.jam.showHarmonicFunctions = true;
            app.jam._editBarOpen = true;
            app.jam.renderGridUI();
        });
        assert.equal(await page.evaluate(() => app.jam.getFnConvention()), 'classic', 'grille sans style : classique par défaut');
        assert.deepEqual(await gridLabels(), ['i', 'VII', 'VI', 'V']);

        // panneau « Fonction tonale » : choix Jazz / Classique, classique sélectionné
        await page.evaluate(() => app.jam.openFunctionEditor(2));
        let p = await popup();
        assert.deepEqual(p.on, ['classic']);
        assert.ok(p.labels.includes('VII') && !p.labels.includes('♭VII'), 'lectures affichées en classique : ' + p.labels.join(' '));
        await page.locator('.jm-pop [data-conv="jazz"]').click();
        p = await popup();
        assert.deepEqual(p.on, ['jazz'], 'le panneau reste ouvert, Jazz sélectionné');
        assert.ok(p.labels.includes('♭VII'));
        assert.deepEqual(await gridLabels(), ['i', '♭VII', '♭VI', 'V'], 'la grille suit');
        assert.equal(await page.evaluate(() => app.jam.collectSettings().fnConvention), 'jazz', 'le choix manuel est enregistré avec la grille');

        // Harmonisation : mêmes chiffrages que la grille
        await page.evaluate(() => app.jam.toggleHarmonyModal());
        const chips = () => page.evaluate(() => [...document.querySelectorAll('#harmony-chords .harmony-chip small')].map(e => e.textContent));
        assert.deepEqual(await chips(), ['i', 'iiø', '♭III', 'iv', 'v', '♭VI', '♭VII']);
        await page.locator('.jm-pop [data-conv="classic"]').click();
        assert.deepEqual(await chips(), ['i', 'iiø', 'III', 'iv', 'v', 'VI', 'VII'], 'le panneau Harmonisation suit le choix');
        assert.equal(await page.evaluate(() => app.jam.collectSettings().fnConvention), undefined, 'revenir au choix par défaut : plus rien d\'enregistré');

        // une lecture choisie en classique est enregistrée en jazz et relue dans la convention en cours
        await page.evaluate(() => { const rows = [...document.querySelectorAll('.jm-pop .jm-fn-row')]; rows.find(r => r.querySelector('b').textContent === 'VII').click(); });
        assert.equal(await page.evaluate(() => app.jam.grid[1].fnLabel), '♭VII', 'enregistré en jazz');
        assert.deepEqual(await gridLabels(), ['i', 'VII', 'VI', 'V']);
        await page.evaluate(() => app.jam.setFnConvention('jazz'));
        assert.deepEqual(await gridLabels(), ['i', '♭VII', '♭VI', 'V']);

        // tout style a le chiffrage classique par défaut et efface le choix manuel ; la grille générée garde sa tonalité mineure
        await page.evaluate(() => { app.jam.closeHarmonyModal(); app.jam.closeFunctionEditor(); app.jam.setFnConvention('classic'); });
        assert.equal(await page.evaluate(() => app.jam.getFnConvention()), 'classic');
        await page.selectOption('#jam-style-select', 'swing');
        assert.equal(await page.evaluate(() => app.jam._fnConvention), null, 'changer de style efface le choix manuel');
        assert.equal(await page.evaluate(() => app.jam.getFnConvention()), 'classic', 'style jazz : classique par défaut aussi');
        await page.selectOption('#jam-style-select', 'baroque');
        assert.equal(await page.evaluate(() => app.jam.getFnConvention()), 'classic', 'style classique : classique par défaut');

        // retour à un état neutre
        await page.evaluate(() => {
            const saved = JSON.parse(localStorage.getItem('jamSavedGrids') || '{}'); delete saved['e2e-andalouse']; localStorage.setItem('jamSavedGrids', JSON.stringify(saved));
            app.jam.showHarmonicFunctions = false; app.jam._editBarOpen = false; app.jam.renderSequenceUI();
        });
        await page.selectOption('#jam-key-select', '0');
        await page.selectOption('#jam-quality-select', 'ionian');
        noErrors();
    });

    test('Jam : Flamenco — cajón, palmas et pitos jouent, le curseur « Percus. » les règle ; les autres orchestres Guitare gardent la batterie grisée', async () => {
        const sliders = () => page.evaluate(() => ({ label: document.getElementById('band-vol-drums-label').textContent, drumsOff: document.getElementById('band-vol-drums').disabled, bassOff: document.getElementById('band-vol-bass').disabled }));
        await page.selectOption('#jam-style-select', 'flamencobulerias');
        assert.equal(await page.evaluate(() => app.jam.bandStyle), 'guitar');
        assert.deepEqual(await sliders(), { label: 'Percus.', drumsOff: false, bassOff: true });
        await page.evaluate(() => {
            app.jam.bpm = 240;
            window.__drums = [];
            const real = app.jam.playBandDrum.bind(app.jam);
            app.jam.playBandDrum = (e, t) => { window.__drums.push(e.drum); return real(e, t); };
        });
        await page.click('#jam-play-btn');
        await waitFor(() => window.__drums.length >= 40, null, 20000);
        await page.click('#jam-play-btn');
        const heard = await page.evaluate(() => [...new Set(window.__drums)].sort());
        for (const d of ['cajonb', 'cajont', 'palma', 'golpe']) assert.ok(heard.includes(d), `${d} jamais joué : ${heard.join(' ')}`);
        // orchestre Guitare sans rythme flamenco : batterie grisée comme avant
        await page.evaluate(() => { app.jam._bandGroove = null; app.jam.setBandStyle('guitar'); });
        assert.deepEqual(await sliders(), { label: 'Batterie', drumsOff: true, bassOff: true });
        await page.selectOption('#jam-style-select', 'swing');
        assert.deepEqual(await sliders(), { label: 'Batterie', drumsOff: false, bassOff: false });
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
