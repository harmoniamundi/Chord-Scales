// ui/draw-notes.js — cadre de dessin libre des annotations de Chord Scales, sans DOM : format enregistré, simplification et rendu des traits, gomme, copier-coller.
// Un cadre de dessin est enregistré sous la forme <div class="annot-draw" data-draw="320,200|1e293b.3:12,30,2,1,3,-1|dc2626.14h:40,40" data-at="x,y" data-border="0"></div> :
//   data-draw = « largeur,hauteur[,fond] » du cadre en pixels, puis un trait par « | » ;
//     fond (facultatif) = couleur à 6 chiffres hexadécimaux, ou « t » (transparent) ; absent = fond blanc (sans bord visible : transparent, comme les autres blocs) ;
//   trait = couleur (6 chiffres hexadécimaux) . épaisseur (1 à 40 pixels, suivie de « h » pour un surligneur, translucide) : points ;
//     points = x,y du premier point, puis l'écart (dx,dy) de chaque point au précédent — entiers, en pixels du cadre (un point seul = un point posé) ;
//   remplissage (outil « seau ») = couleur (6 chiffres hexadécimaux) @ contours : un contour par « ; » (le premier est le bord de la forme, les suivants sont des
//     trous, remplissage pair-impair), chacun écrit comme les points d'un trait (x,y puis écarts) ; les remplissages sont écrits avant les traits et se dessinent
//     SOUS tous les traits (comme un coloriage : le trait reste net par-dessus) ;
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
const DR_MAX_FILLS = 20;                   // remplissages par cadre
const DR_FILL_MAX_POINTS = 1200;           // points de contour par remplissage (tous contours confondus)
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

// Cadre vide : { w, h, bg, strokes: [{ c, w, h, p: [[x, y], …] }], fills: [{ c, loops: [[[x, y], …], …] }] } (h : surligneur).
function drawDefault(w, h) { return { w: drawClampWidth(w === undefined ? DR_W_DEFAULT : w), h: drawClampHeight(h === undefined ? DR_H_DEFAULT : h), bg: '', strokes: [], fills: [] }; }

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
        const fm = /^([0-9a-fA-F]{6})@(-?\d+(?:,-?\d+)*(?:;-?\d+(?:,-?\d+)*)*)$/.exec(part);   // remplissage
        if (fm) {
            if (st.fills.length >= DR_MAX_FILLS) continue;
            const f = drawFillFromText(fm[1], fm[2]);
            if (f) st.fills.push(f);
            continue;
        }
        if (st.strokes.length >= DR_MAX_STROKES) continue;
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
    const out = Object.assign({}, st, { strokes: [], fills: [] });
    for (const f of st.fills || []) {
        out.fills.push(f);
        if (drawFormat(out).length > DR_MAX_LENGTH) { out.fills.pop(); break; }
    }
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
    return [`${drawClampWidth(s.w)},${drawClampHeight(s.h)}${bg ? `,${bg === 't' ? 't' : bg.slice(1)}` : ''}`]
        .concat((s.fills || []).slice(0, DR_MAX_FILLS).map(drawFillText), (s.strokes || []).slice(0, DR_MAX_STROKES).map(drawStrokeText)).join('|');
}

// Texte canonique d'un cadre (null si invalide) : ce qu'on garde dans le fichier.
function drawCanon(text) {
    const st = drawParse(text);
    return st ? drawFormat(st) : null;
}

// Le dessin peut-il encore s'écrire (nombre de traits, longueur du texte) ?
function drawFits(st) { return st.strokes.length <= DR_MAX_STROKES && (st.fills || []).length <= DR_MAX_FILLS && drawFormat(st).length <= DR_MAX_LENGTH; }

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

// Un remplissage en SVG : un seul <path> (un sous-chemin par contour, remplissage pair-impair : les trous restent vides) ; le fin trait de même couleur
// évite le liseré clair entre deux aplats voisins.
function drawFillSvg(f, i) {
    const c = drawColor(f.c) || DR_COLOR_DEFAULT;
    const d = f.loops.map(l => `M${l.map(q => `${q[0]} ${q[1]}`).join('L')}Z`).join('');
    return `<path data-f="${i}" d="${d}" fill="${c}" fill-rule="evenodd" stroke="${c}" stroke-width="0.6" stroke-linejoin="round"/>`;
}

// Contenu SVG du cadre : les remplissages d'abord (dessous), puis un <path> par trait.
function drawSvgInner(st) {
    return (st.fills || []).map(drawFillSvg).join('') + st.strokes.map(drawStrokeSvg).join('');
}

// ----- Modifications (renvoient un nouveau cadre ; l'ancien n'est pas touché) -----

const drawCopyStroke = (s) => { const o = { c: s.c, w: s.w, h: s.h, p: s.p.map(q => q.slice()) }; if (s.q) o.q = s.q.slice(); return o; };
const drawCopyFill = (f) => ({ c: f.c, loops: f.loops.map(l => l.map(q => q.slice())) });
const drawClone = (st) => ({ w: st.w, h: st.h, bg: drawBg(st.bg), strokes: st.strokes.map(drawCopyStroke), fills: (st.fills || []).map(drawCopyFill) });

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

function drawClear(st) { if (!st.strokes.length && !(st.fills || []).length) return null; const out = drawClone(st); out.strokes = []; out.fills = []; return out; }

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
    out.fills = (st.fills || []).map(f => ({ c: f.c, loops: f.loops.map(l => l.map(q => [drClamp(drInt(q[0] * W / st.w), DR_COORD_MIN, DR_COORD_MAX), drClamp(drInt(q[1] * H / st.h), DR_COORD_MIN, DR_COORD_MAX)])) }));
    return out;
}

// ----- Remplissage d'une forme fermée (outil « seau ») -----
// Le clic est traité sur une image de travail : `barrier` (Uint8Array w × h, 1 = pixel d'un trait) est fournie par l'écran (draw-block.js : les traits tracés sur un
// canevas). Tout ce qui suit est pur et testé : on part du pixel touché, on étale la couleur jusqu'aux traits (un trou de 2 pixels dans le tracé ne fait pas fuir),
// puis on relève le contour de la zone (bord + trous) en polygones simplifiés, enregistrés comme les traits.

// Un remplissage lu dans le texte (couleur, contours) ; null s'il est inutilisable.
function drawFillFromText(color, text) {
    const loops = [];
    let total = 0;
    for (const part of String(text).split(';')) {
        const nums = part.split(',').map(Number);
        if (nums.length % 2 || nums.length < 6) return null;
        const pts = [];
        let x = 0, y = 0;
        for (let i = 0; i < nums.length; i += 2) {
            if (i === 0) { x = nums[0]; y = nums[1]; } else { x += nums[i]; y += nums[i + 1]; }
            pts.push([drClamp(x, DR_COORD_MIN, DR_COORD_MAX), drClamp(y, DR_COORD_MIN, DR_COORD_MAX)]);
        }
        total += pts.length;
        if (total > DR_FILL_MAX_POINTS) return null;
        loops.push(pts);
    }
    return loops.length ? { c: drawColor(color) || DR_COLOR_DEFAULT, loops } : null;
}

function drawFillText(f) {
    const loops = f.loops.map((l) => {
        const nums = [];
        l.forEach((q, i) => { if (i === 0) nums.push(q[0], q[1]); else nums.push(q[0] - l[i - 1][0], q[1] - l[i - 1][1]); });
        return nums.join(',');
    });
    return `${drawColor(f.c).slice(1) || DR_COLOR_DEFAULT.slice(1)}@${loops.join(';')}`;
}

// Zone atteinte depuis (sx, sy) sans traverser un pixel `blocked` (4 voisins) : Uint8Array w × h (1 = dans la zone), ou null si le départ est bloqué.
function drawFloodRegion(blocked, w, h, sx, sy) {
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return null;
    const region = new Uint8Array(w * h);
    const stack = [sx, sy];
    while (stack.length) {
        const y = stack.pop(), x0 = stack.pop();
        let x = x0;
        while (x >= 0 && !blocked[y * w + x] && !region[y * w + x]) x--;
        x++;
        let up = false, down = false;
        while (x < w && !blocked[y * w + x] && !region[y * w + x]) {
            region[y * w + x] = 1;
            if (y > 0) { const o = (y - 1) * w + x, free = !blocked[o] && !region[o]; if (free && !up) { stack.push(x, y - 1); up = true; } else if (!free) up = false; }
            if (y < h - 1) { const o = (y + 1) * w + x, free = !blocked[o] && !region[o]; if (free && !down) { stack.push(x, y + 1); down = true; } else if (!free) down = false; }
            x++;
        }
    }
    return region;
}

// Épaissit de `n` pixels (voisinage de 8) les pixels à 1 d'un masque : renvoie un nouveau masque.
function drawDilate(mask, w, h, n) {
    let cur = mask;
    for (let k = 0; k < n; k++) {
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (cur[y * w + x]) { out[y * w + x] = 1; continue; }
                let hit = 0;
                for (let dy = -1; dy <= 1 && !hit; dy++) {
                    const yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && cur[yy * w + xx]) { hit = 1; break; } }
                }
                out[y * w + x] = hit;
            }
        }
        cur = out;
    }
    return cur;
}

// Étend `region` de `n` pixels (4 voisins) mais seulement sur les pixels `allowed` : la couleur passe ainsi sous les traits et sous les petits trous du tracé.
function drawGrowInto(region, allowed, w, h, n) {
    let cur = region;
    for (let k = 0; k < n; k++) {
        const out = cur.slice();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (cur[i] || !allowed[i]) continue;
                if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) out[i] = 1;
            }
        }
        cur = out;
    }
    return cur;
}

// Contours d'une zone (masque w × h) : bord extérieur et trous, en polygones aux coins de pixels (sans point intermédiaire sur les lignes droites).
function drawRegionLoops(region, w, h) {
    const W1 = w + 1;
    const out = new Map();                       // sommet (y × (w+1) + x) → arêtes qui en partent (sommets d'arrivée) ; la zone est à droite de l'arête
    const add = (ax, ay, bx, by) => { const k = ay * W1 + ax; const l = out.get(k); if (l) l.push(by * W1 + bx); else out.set(k, [by * W1 + bx]); };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!region[y * w + x]) continue;
            if (y === 0 || !region[(y - 1) * w + x]) add(x, y, x + 1, y);
            if (x === w - 1 || !region[y * w + x + 1]) add(x + 1, y, x + 1, y + 1);
            if (y === h - 1 || !region[(y + 1) * w + x]) add(x + 1, y + 1, x, y + 1);
            if (x === 0 || !region[y * w + x - 1]) add(x, y + 1, x, y);
        }
    }
    const loops = [];
    for (const [k0, list0] of out) {
        while (list0.length) {
            const loop = [];
            let from = k0, to = list0.pop();
            let guard = 0;
            for (;;) {
                loop.push([from % W1, Math.floor(from / W1)]);
                if (to === k0 || ++guard > 4000000) break;
                const l = out.get(to);
                if (!l || !l.length) break;
                from = to; to = l.pop();
            }
            // retire les sommets alignés avec leurs voisins
            const n = loop.length, pts = [];
            for (let i = 0; i < n; i++) {
                const a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
                if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) pts.push(b);
            }
            if (pts.length >= 3) loops.push(pts);
        }
    }
    return loops;
}

// Polygone fermé simplifié (Douglas-Peucker, tolérance eps en pixels) ; points entiers.
function drawSimplifyLoop(loop, eps) {
    if (loop.length < 4) return loop.map(q => q.slice());
    const open = loop.concat([loop[0]]);
    const s = drawSimplify(open, eps);
    s.pop();
    return s.map(q => [drInt(q[0]), drInt(q[1])]);
}

const drLoopArea = (l) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

// (x, y) est-il dans le remplissage `f` (contours pair-impair : un trou n'en fait pas partie) ?
function drawInFill(f, x, y) {
    let inside = false;
    f.loops.forEach((l) => {
        for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
            const a = l[i], b = l[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
    });
    return inside;
}

// Indice du remplissage le plus haut (le dernier posé) qui contient le point, ou -1.
function drawFillHit(st, x, y) {
    const fills = st.fills || [];
    for (let i = fills.length - 1; i >= 0; i--) if (drawInFill(fills[i], x, y)) return i;
    return -1;
}

// Enlève le remplissage d'indice i ; null s'il n'existe pas.
function drawRemoveFill(st, i) {
    if (!st.fills || !st.fills[i]) return null;
    const out = drawClone(st);
    out.fills.splice(i, 1);
    return out;
}

// Remplit de la couleur c la forme touchée en (x, y) (pixels du cadre). barrier : pixels des traits (voir plus haut), w × h = taille du cadre.
// Un remplissage déjà posé sous ce point est remplacé (changer de couleur = refaire un clic). Un point posé sur un trait est ramené au pixel libre le plus proche (3 pixels).
// Renvoie le nouveau cadre, ou null (rien à remplir, rien de changé, ou le dessin ne tiendrait plus dans un cadre).
function drawFillAt(st, barrier, w, h, x, y, c) {
    const color = drawColor(c);
    if (!color || !(w > 0 && h > 0) || barrier.length !== w * h) return null;
    const blocked = drawDilate(barrier, w, h, 1);   // un trou d'un ou deux pixels dans le tracé ne laisse pas passer la couleur
    let sx = Math.floor(x), sy = Math.floor(y);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    if (blocked[sy * w + sx]) {
        let best = null, bd = 1e9;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const xx = sx + dx, yy = sy + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || blocked[yy * w + xx]) continue;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = [xx, yy]; }
        }
        if (!best) return null;
        [sx, sy] = best;
    }
    let region = drawFloodRegion(blocked, w, h, sx, sy);
    if (!region) return null;
    region = drawGrowInto(region, blocked, w, h, 2);   // sous les traits et leurs bords (un trait fin n'est pas dépassé de l'autre côté)
    const raw = drawRegionLoops(region, w, h);
    if (!raw.length) return null;
    let loops = null;
    for (const eps of [0.7, 1.4, 2.5, 4, 7]) {
        const cand = raw.map(l => drawSimplifyLoop(l, eps)).filter(l => l.length >= 3 && drLoopArea(l) >= 2);
        if (cand.length && cand.reduce((n, l) => n + l.length, 0) <= DR_FILL_MAX_POINTS) { loops = cand; break; }
    }
    if (!loops) return null;
    const out = drawClone(st);
    const px = sx + 0.5, py = sy + 0.5;
    out.fills = out.fills.filter(f => !drawInFill(f, px, py));
    out.fills.push({ c: color, loops });
    if (out.fills.length > DR_MAX_FILLS) out.fills.shift();
    if (drawFormat(out) === drawFormat(st)) return null;
    return drawFits(out) ? out : null;
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
        DR_MAX_FILLS, DR_FILL_MAX_POINTS, drawFillFromText, drawFillText, drawFillSvg, drawFloodRegion, drawDilate, drawGrowInto, drawRegionLoops, drawSimplifyLoop, drawInFill, drawFillHit, drawRemoveFill, drawFillAt,
        drawSegDist, drawSimplify, DR_LEVEL_MID, drawPressureLevel, drawLevelFactor, drawVarPathD, drawStrokeSvg, drawPathD, drawStrokeAttrs, drawSvgInner, drawAddStroke, drawEraseAt, drawClear, drawResize, drawScale, drawStubHtml, drawClipText, drawSplitClips };
}
