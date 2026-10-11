// Test réel du mode hors ligne : vrai Chromium, vraies bibliothèques, vrais sons, appli servie sous /Chord-Scales/ comme sur
// GitHub Pages. Visite en ligne (le service worker télécharge tout), puis coupe le réseau et vérifie que la page se recharge,
// que les 13 instruments se décodent, que la portée se dessine et que la police est là. Lancer : npm run test:offline
// (nécessite Playwright : npm install && npx playwright install chromium). Durée : environ 20 secondes.
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright non installé : npm install && npx playwright install chromium'); process.exit(0); }
const ROOT = path.join(__dirname, '..', '..'), PREFIX = '/Chord-Scales/';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const log = (...a) => console.log(...a);
let fail = 0; const check = (ok, msg) => { log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fail++; };

const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end('nope'); }
    let rel = decodeURIComponent(u.pathname.slice(PREFIX.length)) || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    fs.createReadStream(file).pipe(res);
});

(async () => {
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}${PREFIX}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [], foreign = [], requests = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('request', r => { const u = new URL(r.url()); requests.push(u.pathname); if (u.hostname !== '127.0.0.1') foreign.push(r.url()); });

    // ---- 1. Première visite, en ligne ----
    await page.addInitScript(() => { window.__swMsgs = []; navigator.serviceWorker.addEventListener('message', e => window.__swMsgs.push(e.data)); });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof app !== 'undefined' && app.jam, null, { timeout: 15000 });
    check(await page.title() === 'Chord Scales Machine', 'page chargée (en ligne)');
    check(await page.evaluate(() => typeof Vex !== 'undefined' && typeof Vex.Flow !== 'undefined' && !!Vex.Flow.Renderer), 'VexFlow réel chargé depuis app/vendor');
    check(await page.evaluate(() => typeof Soundfont !== 'undefined' && Soundfont.__localSoundfonts === true), 'Soundfont-player réel chargé et branché sur les sons locaux');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    log('  attente du téléchargement des sons en arrière-plan…');
    await page.waitForFunction(() => window.__swMsgs.some(m => m.type === 'sounds-done'), null, { timeout: 90000 });
    const done = await page.evaluate(() => window.__swMsgs.filter(m => m.type === 'sounds-done').pop());
    log('  message final :', JSON.stringify(done));
    check(done.done === 13 && done.failed === 0 && done.downloaded >= 1, 'les 13 instruments sont téléchargés sans échec');
    const caches1 = await page.evaluate(async () => { const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; });
    log('  caches :', JSON.stringify(caches1));
    check(caches1['chord-scales-sounds-v1'] === 13, 'cache sons : 13 fichiers');
    const swSrc = fs.readFileSync(ROOT + '/sw.js', 'utf8');
    const nShell = [...(/const SHELL_FILES = \[([\s\S]*?)\];/.exec(swSrc)[1]).matchAll(/'([^']+)'/g)].length;
    check(caches1['chord-scales-shell-v1'] >= nShell, `cache appli : ${caches1['chord-scales-shell-v1']} fichiers (liste : ${nShell})`);
    check(await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('/Chord-Scales/sw.js')), 'service worker actif avec la bonne portée');
    check(foreign.length === 0, 'aucune requête vers un autre serveur pendant la visite en ligne' + (foreign.length ? ' : ' + foreign.join(', ') : ''));

    // ---- 2. Hors ligne : rechargement ----
    await ctx.setOffline(true);
    requests.length = 0; errors.length = 0;
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof app !== 'undefined' && app.jam, null, { timeout: 15000 });
    check(await page.title() === 'Chord Scales Machine', 'HORS LIGNE : la page se recharge');
    check(await page.evaluate(() => navigator.onLine === false), 'le navigateur est bien hors ligne');
    // adresse sans fichier, avec paramètre
    const p2 = await ctx.newPage();
    await p2.goto(base + '?x=1', { waitUntil: 'load' });
    check(await p2.title() === 'Chord Scales Machine', 'HORS LIGNE : ouverture de l\'adresse du dossier (avec ?paramètre)');
    await p2.close();

    // ---- 3. Hors ligne : sons réels décodés ----
    const res = await page.evaluate(async () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const wanted = [['acoustic_grand_piano', 'FluidR3_GM'], ['acoustic_bass', 'FluidR3_GM'], ['electric_bass_finger', 'FluidR3_GM'], ['acoustic_guitar_nylon', 'MusyngKite'], ['accordion', 'MusyngKite'], ['tango_accordion', 'MusyngKite'], ['violin', 'MusyngKite'], ['electric_guitar_clean', 'MusyngKite'], ['contrabass', 'MusyngKite'], ['trumpet', 'MusyngKite'], ['french_horn', 'MusyngKite'], ['trombone', 'MusyngKite'], ['tuba', 'MusyngKite']];
        const out = [];
        for (const [n, sf] of wanted) {
            try { const i = await Soundfont.instrument(ctx, n, { soundfont: sf }); out.push([n, Object.keys(i.buffers || {}).length]); }
            catch (e) { out.push([n, 'ERREUR ' + e]); }
        }
        return out;
    });
    res.forEach(([n, c]) => check(typeof c === 'number' && c > 20, `HORS LIGNE : ${n} décodé (${c} notes)`));

    // ---- 4. Hors ligne : portée VexFlow réelle, police Kalam ----
    await page.evaluate(() => app.switchView('training'));
    await page.locator('#root-buttons-container button').nth(2).click();
    await page.waitForTimeout(500);
    const svgs = await page.evaluate(() => document.querySelectorAll('#scales-container svg').length);
    check(svgs > 0, `HORS LIGNE : la portée est dessinée (${svgs} svg)`);
    const font = await page.evaluate(async () => { await document.fonts.load('700 16px Kalam'); await document.fonts.load('400 16px Kalam'); return [document.fonts.check('700 16px Kalam'), [...document.fonts].filter(f => f.family.includes('Kalam') && f.status === 'loaded').length]; });
    check(font[0] && font[1] >= 2, `HORS LIGNE : police Kalam chargée (${font[1]} variantes)`);
    check(foreign.length === 0, 'aucune requête vers un autre serveur, jamais');
    check(errors.length === 0, 'aucune erreur JavaScript hors ligne' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));
    await browser.close(); srv.close();
    log(fail ? `\n${fail} ÉCHEC(S)` : '\nTOUT EST OK');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
