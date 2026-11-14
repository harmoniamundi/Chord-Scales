// ui/draw-notes.js — cadre de dessin libre des annotations de Chord Scales, sans DOM : format enregistré, simplification et rendu des traits, gomme, copier-coller.
// Un cadre de dessin est enregistré sous la forme <div class="annot-draw" data-draw="320,200|1e293b.3:12,30,2,1,3,-1|dc2626.14h:40,40" data-at="x,y" data-border="0"></div> :
//   data-draw = « largeur,hauteur[,fond] » du cadre en pixels, puis un trait par « | » ;
//     fond (facultatif) = couleur à 6 chiffres hexadécimaux, ou « t » (transparent) ; absent = fond blanc (sans bord visible : transparent, comme les autres blocs) ;
//   trait = couleur (6 chiffres hexadécimaux) . épaisseur (1 à 40 pixels, suivie de « h » pour un surligneur, translucide) : points ;
//     points = x,y du premier point, puis l'écart (dx,dy) de chaque point au précédent — entiers, en pixels du cadre (un point seul = un point posé) ;
//   data-at = place sur le canevas, data-border="0" = cadre caché : comme une portée (ui/staff-notes.js).
// Fonctions pures. Chargé par index.html via <script src="app/ui/draw-notes.js"> (après ui/chord-notes.js) et testé par ui/draw-notes.test.js.

const DR_N = (typeof formatBlockAt !== 'undefined')
    ? { formatBlockAt, parseBlockAt, clampBlockAt }
    : require('./staff-notes.js');
const DR_C = (typeof chordsSplitClips !== 'undefined') ? { chordsSplitClips } : require('./chord-notes.js');

const DR_W_MIN = 60, DR_W_MAX = 1600, DR_W_DEFAULT = 320;
const DR_H_MIN = 60, DR_H_MAX = 1200, DR_H_DEFAULT = 200;
const DR_STROKE_MIN = 1, DR_STROKE_MAX = 40;
const DR_MAX_STROKES = 300;                // traits par cadre
const DR_MAX_POINTS = 600;                 // points par trait (après simplification)
const DR_MAX_LENGTH = 40000;               // signes du texte enregistré d'un cadre
const DR_COORD_MIN = -50, DR_COORD_MAX = 1700;
const DR_HL_OPACITY = 0.38;                // surligneur
const DR_COLORS = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#94a3b8'];
const DR_COLOR_DEFAULT = '#0f172a';
const DR_BG_COLORS = ['#ffffff', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#e2e8f0', '#475569', '#0f172a'];   // fonds proposés (en plus de « transparent » et d'une couleur libre)
const DR_SMOOTH_MIN = 0, DR_SMOOTH_MAX = 10, DR_SMOOTH_DEFAULT = 3;   // lissage du tracé : 0 = trait brut, 10 = très lissé

// Pression du stylet : niveau de 1 à 9 par point (5 = pression moyenne = épaisseur nominale du trait ; mouse et doigt : toujours 5, donc rien d'enregistré).
const DR_LEVEL_MID = 5;
const drawPressureLevel = (p) => { const n = Number(p); return Number.isFinite(n) ? Math.max(1, Math.min(9, Math.round(1 + 8 * n))) : DR_LEVEL_MID; };
const drawLevelFactor = (l) => 0.25 + 1.5 * (Math.max(1, Math.min(9, l)) - 1) / 8;   // 1 → ¼ de l'épaisseur, 5 → 1×, 9 → 1,75×

const drClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const drInt = (v) => Math.round(Number(v));

function drawClampWidth(v) { const n = drInt(v); return Number.isFinite(n) ? drClamp(n, DR_W_MIN, DR_W_MAX) : DR_W_DEFAULT; }
function drawClampHeight(v) { const n = drInt(v); return Number.isFinite(n) ? drClamp(n, DR_H_MIN, DR_H_MAX) : DR_H_DEFAULT; }
function drawClampStroke(v) { const n = drInt(v); return Number.isFinite(n) ? drClamp(n, DR_STROKE_MIN, DR_STROKE_MAX) : 3; }

// « #1E293B », « 1e293b » → « #1e293b » ; '' si ce n'est pas une couleur à 6 chiffres.
function drawColor(v) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(v === undefined || v === null ? '' : v).trim());
    return m ? `#${m[1].toLowerCase()}` : '';
}

// Fond : 't' (transparent), '#rrggbb' ou '' (par défaut : blanc, transparent si le bord est caché).
function drawBg(v) { return v === 't' ? 't' : drawColor(v); }

// Fond tel que l'écran l'affiche (valeur CSS), '' = celui de la feuille de style.
function drawBgCss(bg) { return bg === 't' ? 'transparent' : (drawColor(bg) || ''); }

// Cadre vide : { w, h, bg, strokes: [{ c, w, h, p: [[x, y], …] }] } (h : surligneur).
function drawDefault(w, h) { return { w: drawClampWidth(w === undefined ? DR_W_DEFAULT : w), h: drawClampHeight(h === undefined ? DR_H_DEFAULT : h), bg: '', strokes: [] }; }

// Un trait propre : couleur et épaisseur ramenées dans les limites, points entiers dans les limites, doublons consécutifs retirés ; null s'il n'a aucun point.
function drawStroke(c, w, hl, points) {
    const pts = [], lv = [];
    (points || []).forEach((q) => {
        const x = drClamp(drInt(q[0]), DR_COORD_MIN, DR_COORD_MAX), y = drClamp(drInt(q[1]), DR_COORD_MIN, DR_COORD_MAX);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const last = pts[pts.length - 1];
        if (!last || last[0] !== x || last[1] !== y) { pts.push([x, y]); lv.push(q.length > 2 ? drawPressureLevel((Number(q[2]) - 1) / 8) : DR_LEVEL_MID); }
    });
    if (!pts.length || pts.length > DR_MAX_POINTS) return null;
    const out = { c: drawColor(c) || DR_COLOR_DEFAULT, w: drawClampStroke(w), h: !!hl, p: pts };
    if (!hl && pts.length > 1 && lv.some(l => l !== DR_LEVEL_MID)) out.q = lv;   // épaisseur variable (stylet) : un niveau par point
    return out;
}

// Texte enregistré → cadre ; null si l'en-tête est invalide. Un trait invalide est ignoré ; au plus DR_MAX_STROKES traits ; le texte entier ne dépasse pas DR_MAX_LENGTH.
function drawParse(text) {
    if (typeof text !== 'string' || text.length > DR_MAX_LENGTH * 2) return null;
    const parts = text.trim().split('|');
    const head = /^(\d{2,4}),(\d{2,4})(?:,(t|[0-9a-fA-F]{6}))?$/.exec(parts[0]);
    if (!head) return null;
    const st = drawDefault(head[1], head[2]);
    st.bg = drawBg(head[3] || '');
    for (const part of parts.slice(1)) {
        if (st.strokes.length >= DR_MAX_STROKES) break;
        const m = /^([0-9a-fA-F]{6})\.(\d{1,2})(h?):(-?\d+(?:,-?\d+)*)(?:~([1-9]+))?$/.exec(part);
        if (!m) continue;
        const nums = m[4].split(',').map(Number);
        if (nums.length % 2 || nums.length > DR_MAX_POINTS * 2) continue;
        const pts = [];
        let x = 0, y = 0;
        for (let i = 0; i < nums.length; i += 2) {
            if (i === 0) { x = nums[0]; y = nums[1]; } else { x += nums[i]; y += nums[i + 1]; }
            pts.push(m[5] && m[5].length === nums.length / 2 ? [x, y, Number(m[5][i / 2])] : [x, y]);
        }
        const s = drawStroke(m[1], m[2], m[3] === 'h', pts);
        if (s) st.strokes.push(s);
    }
    return drawFormat(st).length > DR_MAX_LENGTH ? drawTrim(st) : st;
}

// Garde les premiers traits qui tiennent dans la limite du texte enregistré.
function drawTrim(st) {
    const out = Object.assign({}, st, { strokes: [] });
    for (const s of st.strokes) {
        out.strokes.push(s);
        if (drawFormat(out).length > DR_MAX_LENGTH) { out.strokes.pop(); break; }
    }
    return out;
}

function drawStrokeText(s) {
    const nums = [];
    s.p.forEach((q, i) => { if (i === 0) nums.push(q[0], q[1]); else nums.push(q[0] - s.p[i - 1][0], q[1] - s.p[i - 1][1]); });
    return `${drawColor(s.c).slice(1) || DR_COLOR_DEFAULT.slice(1)}.${drawClampStroke(s.w)}${s.h ? 'h' : ''}:${nums.join(',')}${s.q && s.q.length === s.p.length ? `~${s.q.join('')}` : ''}`;
}

function drawFormat(st) {
    const s = st || drawDefault();
    const bg = drawBg(s.bg);
    return [`${drawClampWidth(s.w)},${drawClampHeight(s.h)}${bg ? `,${bg === 't' ? 't' : bg.slice(1)}` : ''}`].concat((s.strokes || []).slice(0, DR_MAX_STROKES).map(drawStrokeText)).join('|');
}

// Texte canonique d'un cadre (null si invalide) : ce qu'on garde dans le fichier.
function drawCanon(text) {
    const st = drawParse(text);
    return st ? drawFormat(st) : null;
}

// Le dessin peut-il encore s'écrire (nombre de traits, longueur du texte) ?
function drawFits(st) { return st.strokes.length <= DR_MAX_STROKES && drawFormat(st).length <= DR_MAX_LENGTH; }

// ----- Traits : simplification et tracé -----

// Distance du point (px, py) au segment [(ax, ay), (bx, by)].
function drawSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? drClamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Simplification de Douglas-Peucker : retire les points qui s'écartent de moins de `eps` pixels de la ligne droite (sans récursion : un trait peut être long).
function drawSimplify(points, eps) {
    const n = points.length;
    if (n < 3) return points.map(q => q.slice());
    const keep = new Array(n).fill(false);
    keep[0] = keep[n - 1] = true;
    const stack = [[0, n - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let far = -1, fd = eps;
        for (let i = a + 1; i < b; i++) {
            let d = drawSegDist(points[i][0], points[i][1], points[a][0], points[a][1], points[b][0], points[b][1]);
            if (points[i].length > 2) {   // pression : un écart d'un niveau compte comme un écart de ~1 pixel
                const L = Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]) || 1;
                const t = Math.max(0, Math.min(1, ((points[i][0] - points[a][0]) * (points[b][0] - points[a][0]) + (points[i][1] - points[a][1]) * (points[b][1] - points[a][1])) / (L * L)));
                d = Math.max(d, Math.abs(points[i][2] - (points[a][2] + t * (points[b][2] - points[a][2]))) * 0.9);
            }
            if (d > fd) { fd = d; far = i; }
        }
        if (far >= 0) { keep[far] = true; stack.push([a, far], [far, b]); }
    }
    return points.filter((_, i) => keep[i]).map(q => q.slice());
}

// Rééchantillonne le trait à pas régulier (pixels) le long de sa ligne brisée ; les extrémités sont gardées.
function drawResample(points, step) {
    if (points.length < 2) return points.map(q => q.slice());
    const out = [points[0].slice()];
    let carry = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!len) continue;
        let d = step - carry;
        while (d <= len) { out.push(a.map((v, k) => v + (b[k] - v) * d / len)); d += step; }
        carry = len - (d - step);
    }
    const last = points[points.length - 1];
    const tail = out[out.length - 1];
    if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last.slice());
    return out;
}

// Lissage du tracé, de 0 (trait brut) à 10 (très lissé) : le trait est rééchantillonné tous les 2 pixels, puis passé au filtre (¼, ½, ¼) autant de fois que
// le niveau l'indique (⅗ × niveau², soit un flou d'environ 1 pixel au niveau 1 et 11 pixels au niveau 10, quelle que soit la vitesse du tracé).
// Les deux extrémités ne bougent pas. Renvoie de nouveaux points (non entiers).
function drawSmooth(points, level) {
    const L = Math.max(DR_SMOOTH_MIN, Math.min(DR_SMOOTH_MAX, Math.round(Number(level) || 0)));
    if (!L || points.length < 3) return points.map(q => q.slice());
    let p = drawResample(points, 2);
    const passes = Math.max(1, Math.round(0.6 * L * L));
    for (let k = 0; k < passes && p.length > 2; k++) {
        const q = [p[0]];
        for (let i = 1; i < p.length - 1; i++) q.push(p[i].map((v, k) => (p[i - 1][k] + 2 * v + p[i + 1][k]) / 4));
        q.push(p[p.length - 1]);
        p = q;
    }
    return p;
}

// Trait lissé : lignes droites aux extrémités, courbes quadratiques passant par les milieux des segments (path SVG).
function drawPathD(points) {
    const p = points;
    if (!p.length) return '';
    if (p.length === 1) return `M${p[0][0]} ${p[0][1]}L${p[0][0]} ${p[0][1]}`;
    if (p.length === 2) return `M${p[0][0]} ${p[0][1]}L${p[1][0]} ${p[1][1]}`;
    let d = `M${p[0][0]} ${p[0][1]}`;
    const r = (v) => Math.round(v * 10) / 10;
    for (let i = 1; i < p.length - 1; i++) d += `Q${p[i][0]} ${p[i][1]} ${r((p[i][0] + p[i + 1][0]) / 2)} ${r((p[i][1] + p[i + 1][1]) / 2)}`;
    return d + `L${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
}

// Trait d'épaisseur variable (pression) : contour rempli. Points [x, y, niveau] ; w = épaisseur nominale. Bouts arrondis.
function drawVarPathD(points, w) {
    const n = points.length, r1 = (v) => Math.round(v * 10) / 10;
    if (!n) return '';
    const half = points.map(q => Math.max(0.3, w * drawLevelFactor(q.length > 2 ? q[2] : DR_LEVEL_MID) / 2));
    if (n === 1) { const [x, y] = points[0], h = half[0]; return `M${r1(x - h)} ${r1(y)}a${r1(h)} ${r1(h)} 0 1 0 ${r1(2 * h)} 0a${r1(h)} ${r1(h)} 0 1 0 ${r1(-2 * h)} 0Z`; }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        L.push([points[i][0] - ty * half[i], points[i][1] + tx * half[i]]);
        R.push([points[i][0] + ty * half[i], points[i][1] - tx * half[i]]);
    }
    const side = (P) => { let d = ''; for (let i = 1; i < P.length - 1; i++) d += `Q${r1(P[i][0])} ${r1(P[i][1])} ${r1((P[i][0] + P[i + 1][0]) / 2)} ${r1((P[i][1] + P[i + 1][1]) / 2)}`; return d + `L${r1(P[P.length - 1][0])} ${r1(P[P.length - 1][1])}`; };
    const Rr = R.slice().reverse();
    return `M${r1(L[0][0])} ${r1(L[0][1])}${side(L)}A${r1(half[n - 1])} ${r1(half[n - 1])} 0 0 0 ${r1(Rr[0][0])} ${r1(Rr[0][1])}${side(Rr)}A${r1(half[0])} ${r1(half[0])} 0 0 0 ${r1(L[0][0])} ${r1(L[0][1])}Z`;
}

// Un trait en SVG : ligne d'épaisseur fixe, ou contour rempli quand l'épaisseur varie (stylet).
function drawStrokeSvg(s, i) {
    if (s.q && s.q.length === s.p.length && !s.h) {
        const c = drawColor(s.c) || DR_COLOR_DEFAULT;
        return `<path data-i="${i}" d="${drawVarPathD(s.p.map((q, k) => [q[0], q[1], s.q[k]]), drawClampStroke(s.w))}" fill="${c}" stroke="${c}" stroke-width="0.4" stroke-linejoin="round"/>`;
    }
    return `<path data-i="${i}" d="${drawPathD(s.p)}" ${drawStrokeAttrs(s)}/>`;
}

// Attributs de présentation d'un trait (couleur, épaisseur, translucidité du surligneur).
function drawStrokeAttrs(s) {
    return `fill="none" stroke="${drawColor(s.c) || DR_COLOR_DEFAULT}" stroke-width="${drawClampStroke(s.w)}" stroke-linecap="round" stroke-linejoin="round"${s.h ? ` stroke-opacity="${DR_HL_OPACITY}"` : ''}`;
}

// Contenu SVG du cadre (un <path> par trait).
function drawSvgInner(st) {
    return st.strokes.map(drawStrokeSvg).join('');
}

// ----- Modifications (renvoient un nouveau cadre ; l'ancien n'est pas touché) -----

const drawCopyStroke = (s) => { const o = { c: s.c, w: s.w, h: s.h, p: s.p.map(q => q.slice()) }; if (s.q) o.q = s.q.slice(); return o; };
const drawClone = (st) => ({ w: st.w, h: st.h, bg: drawBg(st.bg), strokes: st.strokes.map(drawCopyStroke) });

// Ajoute un trait (points bruts de l'écran : lissés au niveau `smooth` de 0 à 10, puis simplifiés). Renvoie null si le trait est vide ou si le dessin est plein.
function drawAddStroke(st, c, w, hl, rawPoints, smooth) {
    const s = drawStroke(c, w, hl, drawSimplify(drawSmooth(rawPoints, smooth || 0).map(q => q.length > 2 ? [drInt(q[0]), drInt(q[1]), q[2]] : [drInt(q[0]), drInt(q[1])]), 0.8));
    if (!s) return null;
    const out = drawClone(st);
    out.strokes.push(s);
    return drawFits(out) ? out : null;
}

// Gomme : efface, dans chaque trait, la partie touchée par le disque de centre (x, y) et de rayon r ; le reste du trait est conservé
// (un trait coupé en deux devient deux traits). Renvoie le cadre, ou null si rien n'est touché (ou si le résultat ne tiendrait plus dans un cadre).
function drawEraseAt(st, x, y, r) {
    const touched = (s) => {
        const reach = r + s.w / 2;
        if (s.p.length === 1) return Math.hypot(x - s.p[0][0], y - s.p[0][1]) <= reach;
        for (let i = 1; i < s.p.length; i++) if (drawSegDist(x, y, s.p[i - 1][0], s.p[i - 1][1], s.p[i][0], s.p[i][1]) <= reach) return true;
        return false;
    };
    let changed = false;
    const strokes = [];
    st.strokes.forEach((s) => {
        if (!touched(s)) { strokes.push(drawCopyStroke(s)); return; }
        changed = true;
        const reach = r + s.w / 2;
        const withQ = s.q && s.q.length === s.p.length ? s.p.map((q, k) => [q[0], q[1], s.q[k]]) : s.p;   // la pression suit les points
        const dense = s.p.length > 1 ? drawResample(withQ, 2) : s.p.map(q => q.slice());   // un point tous les 2 pixels : aucun passage sous la gomme n'est sauté
        let run = [];
        const flush = () => {
            if (run.length) { const n = drawStroke(s.c, s.w, s.h, drawSimplify(run.map(q => q.length > 2 ? [drInt(q[0]), drInt(q[1]), q[2]] : [drInt(q[0]), drInt(q[1])]), 0.8)); if (n) strokes.push(n); }
            run = [];
        };
        dense.forEach((q) => { if (Math.hypot(x - q[0], y - q[1]) <= reach) flush(); else run.push(q); });
        flush();
    });
    if (!changed) return null;
    const out = drawClone(st);
    out.strokes = strokes;
    return drawFits(out) ? out : null;
}

function drawClear(st) { if (!st.strokes.length) return null; const out = drawClone(st); out.strokes = []; return out; }

// Fond du cadre : 't' (transparent), couleur '#rrggbb' ou '' (par défaut) ; null s'il ne change pas.
function drawSetBg(st, bg) {
    const v = drawBg(bg);
    if (v === drawBg(st.bg)) return null;
    const out = drawClone(st); out.bg = v;
    return out;
}

// Nouvelle taille du cadre (les traits ne bougent pas) ; null si elle ne change pas.
function drawResize(st, w, h) {
    const W = drawClampWidth(w), H = drawClampHeight(h);
    if (W === st.w && H === st.h) return null;
    const out = drawClone(st); out.w = W; out.h = H;
    return out;
}

// Agrandit ou réduit le cadre ET son contenu (traits, épaisseurs) du facteur k, proportions conservées — comme les autres cadres des annotations.
// k est borné pour que le cadre reste dans ses limites. Renvoie null si rien ne change.
function drawScale(st, k) {
    k = Number(k);
    if (!Number.isFinite(k) || k <= 0) return null;
    k = drClamp(k, Math.max(DR_W_MIN / st.w, DR_H_MIN / st.h), Math.min(DR_W_MAX / st.w, DR_H_MAX / st.h));
    const W = drawClampWidth(st.w * k), H = drawClampHeight(st.h * k);
    if (W === st.w && H === st.h) return null;
    const out = drawClone(st);
    out.w = W; out.h = H;
    out.strokes = st.strokes.map(s => { const o = { c: s.c, w: drawClampStroke(s.w * k), h: s.h, p: s.p.map(q => [drClamp(drInt(q[0] * W / st.w), DR_COORD_MIN, DR_COORD_MAX), drClamp(drInt(q[1] * H / st.h), DR_COORD_MIN, DR_COORD_MAX)]) }; if (s.q) o.q = s.q.slice(); return o; });
    return out;
}

// ----- Enregistrement et presse-papiers -----

function drawStubHtml(st, at, border) {
    const p = DR_N.formatBlockAt(at);
    return `<div class="annot-draw" data-draw="${drawFormat(st || drawDefault())}"${p ? ` data-at="${p}"` : ''}${border === false ? ' data-border="0"' : ''}></div>`;
}

// Un cadre copié s'écrit « [dessin@x,y!:320,200|0f172a.3:…] » (place et « ! » facultatifs, comme « [accords…] »).
const DR_CLIP_RE = new RegExp(`\\[dessin(?:@(\\d{1,4}),(\\d{1,4}))?(!)?:([^\\]\\n]{1,${DR_MAX_LENGTH + 200}})\\]`, 'g');

function drawClipText(st, meta) {
    const at = meta && meta.at ? DR_N.formatBlockAt(meta.at) : '';
    return `[dessin${at ? `@${at}` : ''}${meta && meta.border === false ? '!' : ''}:${drawFormat(st)}]`;
}

// Comme chordsSplitClips (ui/chord-notes.js), avec en plus des morceaux { draw: texte canonique, at?, noBorder? } pour les repères « [dessin…] ».
function drawSplitClips(text) {
    const src = String(text === undefined || text === null ? '' : text);
    const out = [];
    let pos = 0, m;
    DR_CLIP_RE.lastIndex = 0;
    const plain = (s) => { if (s) DR_C.chordsSplitClips(s).forEach(p => out.push(p)); };
    while ((m = DR_CLIP_RE.exec(src))) {
        const canon = drawCanon(m[4]);
        if (!canon) continue;
        plain(src.slice(pos, m.index));
        const piece = { draw: canon };
        if (m[1] !== undefined) piece.at = { x: DR_N.clampBlockAt(m[1]), y: DR_N.clampBlockAt(m[2]) };
        if (m[3]) piece.noBorder = true;
        out.push(piece);
        pos = m.index + m[0].length;
    }
    plain(src.slice(pos));
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DR_W_MIN, DR_W_MAX, DR_W_DEFAULT, DR_H_MIN, DR_H_MAX, DR_H_DEFAULT, DR_STROKE_MIN, DR_STROKE_MAX, DR_MAX_STROKES, DR_MAX_POINTS, DR_MAX_LENGTH,
        DR_HL_OPACITY, DR_COLORS, DR_COLOR_DEFAULT, DR_BG_COLORS, DR_SMOOTH_MIN, DR_SMOOTH_MAX, DR_SMOOTH_DEFAULT, drawBg, drawBgCss, drawResample, drawSmooth, drawSetBg, drawClampWidth, drawClampHeight, drawClampStroke, drawColor, drawDefault, drawStroke, drawParse, drawFormat, drawCanon, drawFits,
        drawSegDist, drawSimplify, DR_LEVEL_MID, drawPressureLevel, drawLevelFactor, drawVarPathD, drawStrokeSvg, drawPathD, drawStrokeAttrs, drawSvgInner, drawAddStroke, drawEraseAt, drawClear, drawResize, drawScale, drawStubHtml, drawClipText, drawSplitClips };
}
