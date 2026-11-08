// ui/annot-canvas.js — la zone d'annotation vue comme un CANEVAS (onglet « Annotations » du mode Jam).
// Chaque zone contient des blocs (portées « annot-staff » et cadres de texte « annot-frame ») qui ont chacun leur PROPRE place,
// en pixels depuis le coin haut gauche de la zone (attribut data-at) : déplacer un bloc ne touche pas aux autres, et deux blocs peuvent se recouvrir.
// On n'écrit jamais dans la zone elle-même : tout le texte est dans un cadre (le cadre peut avoir un bord visible ou non, data-border="0").
// Ce module donne :
//  - des fonctions pures, testées sans navigateur : rectangles, repères d'alignement et aimant (acSnap), première place libre, bornes d'un groupe ;
//  - AnnotCanvas : la sélection de plusieurs blocs (clic, Maj / ⌘ / Ctrl + clic, rectangle tiré sur le fond, ⌘A), le déplacement d'un groupe
//    (avec repères et aimant, ou vers l'autre zone), les flèches, la suppression.
// Les portées (ui/staff-editor.js) et les cadres (ui/text-frame.js) lui confient leur déplacement ; l'enregistrement et le presse-papiers sont dans index.html (JamEngine).
// Chargé par index.html via <script src="app/ui/annot-canvas.js"> (après ui/text-frame.js) et testé par ui/annot-canvas.test.js.

const AC_SNAP = 6;            // distance (pixels) à laquelle un repère apparaît, et à laquelle l'aimant attire un bloc
const AC_DRAG_MIN = 5;        // déplacement minimal (pixels) avant qu'un appui devienne un glisser
const AC_MARGIN = 12;         // marge de la première place libre
const AC_CASCADE = 22;        // décalage entre deux blocs créés l'un après l'autre
const AC_BLOCKS = '.annot-staff, .annot-frame';
const AC_ZOOM_MIN = 0.5;      // zoom de lecture : de 50 % à 300 %
const AC_ZOOM_MAX = 3;
const AC_ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]; // crans des boutons − / +

// ----- Fonctions pures (rectangles { x, y, w, h } en pixels du canevas) -----

function acBounds(rects) {
    if (!rects.length) return null;
    const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
    const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Les deux rectangles se recouvrent-ils (même d'un pixel) ?
function acIntersects(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Rectangle tiré de (x0, y0) à (x1, y1), quel que soit le sens du tracé.
function acNormRect(x0, y0, x1, y1) {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

// Déplacement (dx, dy) ramené pour que le groupe `b` ne sorte pas par le haut ni par la gauche, ni par la droite quand il tient dans la zone (largeur zoneW).
function acClampMove(b, dx, dy, zoneW) {
    let x = dx, y = dy;
    if (b.x + x < 0) x = -b.x;
    if (b.y + y < 0) y = -b.y;
    if (zoneW > 0 && b.w <= zoneW && b.x + b.w + x > zoneW) x = zoneW - b.w - b.x;
    return { dx: Math.round(x), dy: Math.round(y) };
}

// Repères d'alignement. `m` : rectangle du groupe qu'on déplace (à la place où le pointeur le mène) ; `others` : rectangles des autres blocs ;
// `zone` : { w, h } (les bords et le milieu de la zone sont aussi des repères) ; `threshold` : distance maximale.
// Sont comparés les bords gauche / milieu / droit en x, haut / milieu / bas en y. Renvoie
//   { dx, dy }  : le déplacement qui aligne exactement le groupe sur le repère le plus proche (0 si rien à moins de `threshold`) ;
//   guides      : [{ axis: 'x', at, from, to }] (trait vertical à x = at, de from à to) ou [{ axis: 'y', … }] (trait horizontal), à afficher.
// Les traits sont tracés sur la ligne du repère, que l'aimant soit actif (snap = true : le groupe y est ramené) ou non (le groupe reste où il est :
// le trait montre alors où serait l'alignement, à quelques pixels près).
function acSnap(m, others, zone, threshold = AC_SNAP, snap = true) {
    const out = { dx: 0, dy: 0, guides: [] };
    const axes = [
        { axis: 'x', pos: 'x', size: 'w', cross: 'y', crossSize: 'h', zoneSize: zone && zone.w },
        { axis: 'y', pos: 'y', size: 'h', cross: 'x', crossSize: 'w', zoneSize: zone && zone.h }
    ];
    for (const A of axes) {
        const mine = [m[A.pos], m[A.pos] + m[A.size] / 2, m[A.pos] + m[A.size]];
        const pairs = []; // { d, at, o }  d = distance à parcourir pour aligner
        const targets = others.map(o => ({ o, v: [o[A.pos], o[A.pos] + o[A.size] / 2, o[A.pos] + o[A.size]] }));
        if (zone && A.zoneSize > 0) targets.push({ o: null, v: A.axis === 'x' ? [0, A.zoneSize / 2, A.zoneSize] : [0] });
        for (const t of targets) for (const tv of t.v) for (const mv of mine) pairs.push({ d: tv - mv, at: tv, o: t.o });
        let best = null;
        for (const p of pairs) if (Math.abs(p.d) <= threshold && (!best || Math.abs(p.d) < Math.abs(best.d) - 1e-6)) best = p;
        if (!best) continue;
        const shift = snap ? best.d : 0;
        if (A.axis === 'x') out.dx = Math.round(shift); else out.dy = Math.round(shift);
        // tous les repères à la même distance (plusieurs blocs alignés entre eux) : un seul trait par position
        const seen = new Set();
        for (const p of pairs) {
            if (Math.abs(p.d - best.d) > 0.5 || seen.has(Math.round(p.at * 2))) continue;
            seen.add(Math.round(p.at * 2));
            const mm = { x: m.x + (A.axis === 'x' ? shift : 0), y: m.y + (A.axis === 'y' ? shift : 0), w: m.w, h: m.h };
            let from = mm[A.cross], to = mm[A.cross] + mm[A.crossSize];
            if (p.o) { from = Math.min(from, p.o[A.cross]); to = Math.max(to, p.o[A.cross] + p.o[A.crossSize]); }
            else { from = 0; to = Math.max(to, (A.axis === 'x' ? zone.h : zone.w) || to); }
            out.guides.push({ axis: A.axis, at: Math.round(p.at), from: Math.round(from), to: Math.round(to) });
        }
    }
    return out;
}

// Première place libre pour un bloc créé à la main : en cascade depuis le coin haut gauche, en évitant de tomber pile sur un bloc existant.
function acFreeSpot(rects, start) {
    const x0 = start && Number.isFinite(start.x) ? start.x : AC_MARGIN, y0 = start && Number.isFinite(start.y) ? start.y : AC_MARGIN;
    for (let k = 0; k < 40; k++) {
        const p = { x: Math.round(x0 + k * AC_CASCADE), y: Math.round(y0 + k * AC_CASCADE) };
        if (!rects.some(r => Math.abs(r.x - p.x) < 8 && Math.abs(r.y - p.y) < 8)) return p;
    }
    return { x: Math.round(x0), y: Math.round(y0) };
}

// ----- Zoom de lecture (zone verrouillée) : chaque bloc est agrandi autour du coin haut gauche de la zone -----

// Zoom ramené dans les bornes (valeur invalide : 100 %), arrondi au centième.
function acClampZoom(z) {
    const v = Number(z);
    if (!isFinite(v) || v <= 0) return 1;
    return Math.round(Math.min(AC_ZOOM_MAX, Math.max(AC_ZOOM_MIN, v)) * 100) / 100;
}

// Cran suivant (dir > 0) ou précédent (dir < 0) à partir d'un zoom quelconque.
function acZoomStep(z, dir) {
    const v = acClampZoom(z), eps = 0.001;
    if (dir > 0) { const n = AC_ZOOM_STEPS.find(s => s > v + eps); return n === undefined ? AC_ZOOM_MAX : n; }
    const prev = AC_ZOOM_STEPS.filter(s => s < v - eps);
    return prev.length ? prev[prev.length - 1] : AC_ZOOM_MIN;
}

// Zoom après un cran de molette (Ctrl / ⌘ + molette, ou pincement du pavé tactile) : exponentiel, avec un cran maximal par événement.
function acZoomWheel(z, deltaY, deltaMode = 0) {
    const d = Math.max(-30, Math.min(30, Number(deltaY) * (deltaMode === 1 ? 12 : 1) || 0));
    return acClampZoom(acClampZoom(z) * Math.exp(-d * 0.01));
}

// Décalage CSS (translate) d'un bloc posé en (x, y) pour que scale(z) autour du coin de la zone le mette en (x·z, y·z).
function acZoomOffset(at, z) {
    const k = acClampZoom(z) - 1;
    return { x: (Number(at.x) || 0) * k, y: (Number(at.y) || 0) * k };
}

// Défilement à donner à un axe après un changement de zoom z0 → z1, pour que le point sous le pointeur (à p pixels du bord visible) ne bouge pas.
function acZoomScroll(scroll, p, z0, z1) {
    return Math.max(0, (scroll + p) * (z1 / z0) - p);
}

// ----- Le canevas d'une zone -----

// opts : isEditable() → la zone est modifiable ; magnet() → l'aimant est enclenché ; zones() → les zones modifiables (cible d'un déplacement vers l'autre zone) ;
//        onSelect(canvas, quiet) quand la sélection change ; onBackground(canvas) clic sur le fond de la zone (rien tiré) ; onCreateAt(canvas, x, y) double-clic sur le fond ;
//        onGrab() un bloc va être déplacé ; onMoved(views, serie) des blocs viennent d'être déplacés (serie = flèches) ;
//        onTransfer(items, zone, points) des blocs sont lâchés dans une autre zone : items = [{ el, view }], points = [{ x, y }] (places dans l'autre zone).
class AnnotCanvas {
    constructor(zone, opts) {
        this.zone = zone;
        this.opts = opts || {};
        this.sel = [];
        zone.__canvas = this;
        zone.addEventListener('pointerdown', (ev) => this._bgDown(ev));
        zone.addEventListener('dblclick', (ev) => this._bgDouble(ev));
    }

    get editable() { return !this.opts.isEditable || !!this.opts.isEditable(); }

    blocks() { return Array.from(this.zone.querySelectorAll(':scope > .annot-staff, :scope > .annot-frame')); }

    viewOf(el) { return el.__noteStaff || el.__noteFrame || null; }

    // Rectangle d'un bloc dans les coordonnées du canevas (origine : coin haut gauche de la zone, défilement compris).
    rectOf(el) { return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }

    // Place d'un point de l'écran sur le canevas.
    pointOf(clientX, clientY, zone = this.zone) {
        const r = zone.getBoundingClientRect();
        return { x: Math.round(clientX - r.left - zone.clientLeft + zone.scrollLeft), y: Math.round(clientY - r.top - zone.clientTop + zone.scrollTop) };
    }

    zoneSize() { return { w: this.zone.clientWidth, h: Math.max(this.zone.clientHeight, this.zone.scrollHeight) }; }

    // ----- Sélection -----

    isSelected(el) { return this.sel.includes(el); }

    // mode : 'set' (remplace), 'add' (ajoute), 'toggle' (inverse). quiet : ne fait pas apparaître la barre de mise en forme.
    select(els, mode = 'set', quiet = true) {
        const list = (Array.isArray(els) ? els : [els]).filter(e => e && e.isConnected);
        let next;
        if (mode === 'add') next = this.sel.concat(list.filter(e => !this.sel.includes(e)));
        else if (mode === 'toggle') { next = this.sel.slice(); list.forEach(e => { const i = next.indexOf(e); if (i >= 0) next.splice(i, 1); else next.push(e); }); }
        else next = list.slice();
        this._setSel(next, quiet);
    }

    _setSel(next, quiet = true) {
        const same = next.length === this.sel.length && next.every((e, i) => e === this.sel[i]);
        this.sel = next;
        this._paint();
        if (!same && this.opts.onSelect) this.opts.onSelect(this, quiet);
    }

    clearSelection(quiet = true) { if (this.sel.length) this._setSel([], quiet); }

    selectAll() { this._setSel(this.blocks().filter(e => !e.classList.contains('is-active') && !e.classList.contains('is-editing')), false); }

    // Les blocs encore là (la zone peut avoir été redessinée) et pas en cours d'édition.
    picked() { this.sel = this.sel.filter(e => e.isConnected && this.zone.contains(e)); return this.sel.slice(); }

    _paint() {
        const mine = this.sel.filter(e => e.isConnected);
        this.zone.querySelectorAll(AC_BLOCKS).forEach((el) => el.classList.toggle('is-picked', mine.includes(el) && !el.classList.contains('is-active') && !el.classList.contains('is-editing')));
        this.zone.classList.toggle('has-picks', mine.length > 0);
    }

    // ----- Fond de la zone : clic, rectangle de sélection, double-clic -----

    _bgDown(ev) {
        if (!this.editable || ev.button > 0 || (ev.target.closest && ev.target.closest(AC_BLOCKS))) return;
        if (ev.target !== this.zone && !(ev.target.classList && ev.target.classList.contains('annot-overlay'))) return;
        const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        const zone = this.zone, touch = ev.pointerType === 'touch';
        const p0 = this.pointOf(ev.clientX, ev.clientY);
        const base = additive ? this.sel.slice() : [];
        let moved = false, box = null;
        if (!touch) ev.preventDefault();                     // pas de sélection de texte pendant le tracé ; le doigt, lui, fait défiler la zone
        try { zone.focus({ preventScroll: true }); } catch (e) { /* non pris en charge */ }
        if (!additive) this.clearSelection(true);
        if (!touch) { try { zone.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ } }
        const onMove = (e2) => {
            if (touch) return;
            if (!moved && Math.hypot(e2.clientX - ev.clientX, e2.clientY - ev.clientY) < 4) return;
            moved = true;
            const p1 = this.pointOf(e2.clientX, e2.clientY);
            const r = acNormRect(p0.x, p0.y, p1.x, p1.y);
            if (!box) { box = document.createElement('div'); box.className = 'annot-marquee'; this._overlay().appendChild(box); }
            box.style.left = `${r.x}px`; box.style.top = `${r.y}px`; box.style.width = `${r.w}px`; box.style.height = `${r.h}px`;
            const hit = this.blocks().filter(el => acIntersects(r, this.rectOf(el)));
            const next = base.concat(hit.filter(e => !base.includes(e)));
            this._setSel(next, true);
        };
        const end = (up) => {
            zone.removeEventListener('pointermove', onMove);
            zone.removeEventListener('pointerup', onUp);
            zone.removeEventListener('pointercancel', onCancel);
            try { zone.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (box) { box.remove(); this._dropOverlay(); }
            if (up && !moved && !additive && this.opts.onBackground) this.opts.onBackground(this);
        };
        const onUp = () => end(true);
        const onCancel = () => end(false);
        zone.addEventListener('pointermove', onMove);
        zone.addEventListener('pointerup', onUp);
        zone.addEventListener('pointercancel', onCancel);
    }

    _bgDouble(ev) {
        if (!this.editable || (ev.target.closest && ev.target.closest(AC_BLOCKS)) || ev.target !== this.zone) return;
        const p = this.pointOf(ev.clientX, ev.clientY);
        if (this.opts.onCreateAt) { ev.preventDefault(); this.opts.onCreateAt(this, p.x, p.y); }
    }

    // ----- Calque des repères et du rectangle de sélection (retiré dès que plus rien n'est tracé : il ne reste jamais dans l'annotation) -----

    _overlay() {
        let o = this.zone.querySelector(':scope > .annot-overlay');
        if (!o) { o = document.createElement('div'); o.className = 'annot-overlay'; o.setAttribute('aria-hidden', 'true'); this.zone.appendChild(o); }
        return o;
    }

    _dropOverlay() {
        const o = this.zone.querySelector(':scope > .annot-overlay');
        if (o && !o.children.length) o.remove();
    }

    showGuides(guides) {
        const o = this._overlay();
        o.querySelectorAll('.annot-guide').forEach(g => g.remove());
        guides.forEach((g) => {
            const d = document.createElement('div');
            d.className = `annot-guide annot-guide-${g.axis}`;
            if (g.axis === 'x') { d.style.left = `${g.at}px`; d.style.top = `${g.from}px`; d.style.height = `${Math.max(1, g.to - g.from)}px`; }
            else { d.style.top = `${g.at}px`; d.style.left = `${g.from}px`; d.style.width = `${Math.max(1, g.to - g.from)}px`; }
            o.appendChild(d);
        });
        if (!guides.length) this._dropOverlay();
    }

    hideGuides() { this.showGuides([]); }

    // ----- Déplacer les blocs sélectionnés -----

    // Appui sur le corps d'un bloc (hors bords, qui redimensionnent) : Maj / ⌘ / Ctrl + clic ajoute ou retire le bloc de la sélection ;
    // un appui simple le sélectionne (sans toucher à un groupe déjà choisi dont il fait partie) ; glisser déplace toute la sélection, au pixel près,
    // avec les repères d'alignement (et l'aimant s'il est enclenché, Alt le suspend) ; lâché dans l'autre zone, le groupe y passe ; Échap annule.
    startMove(view, ev) {
        const el = view.el;
        const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        if (additive) { this.select([el], 'toggle', true); try { this.zone.focus({ preventScroll: true }); } catch (e) { /* non pris en charge */ } return; }
        let reduceOnClick = false;
        if (!this.isSelected(el)) this.select([el], 'set', true); else if (this.sel.length > 1) reduceOnClick = true;
        try { this.zone.focus({ preventScroll: true }); } catch (e) { /* non pris en charge */ }
        if (this.opts.onGrab) this.opts.onGrab();
        const group = this.picked();
        const items = group.map((b) => ({ el: b, view: this.viewOf(b), r0: this.rectOf(b), s0: b.getBoundingClientRect() })).filter(i => i.view);
        if (!items.length) return;
        const bbox = acBounds(items.map(i => i.r0));
        const others = this.blocks().filter(b => !group.includes(b)).map(b => this.rectOf(b));
        const zones = () => (this.opts.zones ? this.opts.zones() : [this.zone]).filter(Boolean);
        const x0 = ev.clientX, y0 = ev.clientY, sl0 = this.zone.scrollLeft, st0 = this.zone.scrollTop;
        let dragging = false, lastX = x0, lastY = y0, alt = false, timer = null, ghosts = null, over = this.zone;
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const where = document.fullscreenElement || document.body;

        const restore = () => items.forEach(i => i.view.setAt({ x: i.r0.x, y: i.r0.y }));
        const clearGhosts = () => { if (ghosts) { ghosts.forEach(g => g.remove()); ghosts = null; } };
        const makeGhosts = () => {
            ghosts = items.map((i) => {
                const g = document.createElement('div');
                g.className = 'annot-drag-ghost' + (i.el.classList.contains('annot-frame') ? ' annot-drag-ghost-frame' : '');
                g.style.boxSizing = 'border-box'; g.style.width = `${Math.round(i.s0.width)}px`; g.style.height = `${Math.round(i.s0.height)}px`; g.style.maxWidth = 'none';
                const clip = i.el.querySelector('.annot-frame-clip'), svg = i.el.querySelector('.annot-staff-svg svg');
                if (clip) g.appendChild(clip.cloneNode(true)); else if (svg) g.appendChild(svg.cloneNode(true));
                where.appendChild(g);
                return g;
            });
        };
        const zoneUnder = () => zones().find((q) => { const r = q.getBoundingClientRect(); return lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom; }) || null;
        const update = () => {
            const target = zoneUnder();
            over = target || this.zone;
            if (over === this.zone) {
                clearGhosts();
                items.forEach(i => i.el.classList.remove('is-dragging-src'));
                const rawDx = (lastX - x0) + (this.zone.scrollLeft - sl0), rawDy = (lastY - y0) + (this.zone.scrollTop - st0);
                const c = acClampMove(bbox, rawDx, rawDy, this.zone.clientWidth);
                let dx = c.dx, dy = c.dy;
                const moved = { x: bbox.x + dx, y: bbox.y + dy, w: bbox.w, h: bbox.h };
                const s = acSnap(moved, others, this.zoneSize(), AC_SNAP, !!(this.opts.magnet && this.opts.magnet()) && !alt);
                if (!alt) {
                    dx += s.dx; dy += s.dy;
                    const c2 = acClampMove(bbox, dx, dy, this.zone.clientWidth); dx = c2.dx; dy = c2.dy;
                    this.showGuides(s.guides);
                } else this.hideGuides();
                items.forEach(i => i.view.setAt({ x: i.r0.x + dx, y: i.r0.y + dy }));
            } else {
                this.hideGuides();
                restore();
                items.forEach(i => i.el.classList.add('is-dragging-src'));
                if (!ghosts) makeGhosts();
                ghosts.forEach((g, k) => { g.style.left = `${Math.round(lastX - (x0 - items[k].s0.left))}px`; g.style.top = `${Math.round(lastY - (y0 - items[k].s0.top))}px`; });
            }
        };
        const begin = () => {
            dragging = true;
            timer = setInterval(() => { // près du haut ou du bas de la zone, elle défile toute seule
                if (over !== this.zone) { const z = over; const r = z.getBoundingClientRect(); if (lastY < r.top + 26) z.scrollTop -= 14; else if (lastY > r.bottom - 26) z.scrollTop += 14; return; }
                const r = this.zone.getBoundingClientRect();
                const before = this.zone.scrollTop;
                if (lastY < r.top + 26) this.zone.scrollTop -= 14; else if (lastY > r.bottom - 26) this.zone.scrollTop += 14; else return;
                if (this.zone.scrollTop !== before) update();
            }, 50);
        };
        const end = (drop) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKey, true);
            try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (timer) clearInterval(timer);
            clearGhosts();
            this.hideGuides();
            items.forEach(i => i.el.classList.remove('is-dragging-src'));
            if (!dragging) {
                if (drop && reduceOnClick) this.select([el], 'set', true);
                return;
            }
            if (!drop) { restore(); return; }
            if (over === this.zone) {
                items.forEach(i => i.view.commit());
                if (this.opts.onMoved) this.opts.onMoved(items.map(i => i.view), false);
                return;
            }
            // lâché dans une autre zone : les blocs y passent, chacun gardant sa place par rapport au pointeur
            restore();
            const points = items.map((i) => {
                const left = lastX - (x0 - i.s0.left), top = lastY - (y0 - i.s0.top);
                const r = over.getBoundingClientRect();
                return { x: Math.max(0, Math.round(left - r.left - over.clientLeft + over.scrollLeft)), y: Math.max(0, Math.round(top - r.top - over.clientTop + over.scrollTop)) };
            });
            if (this.opts.onTransfer) this.opts.onTransfer(items, over, points);
        };
        const onMove = (e2) => {
            lastX = e2.clientX; lastY = e2.clientY; alt = !!e2.altKey;
            if (!dragging) { if (Math.hypot(lastX - x0, lastY - y0) < AC_DRAG_MIN) return; begin(); }
            update();
        };
        const onUp = (e2) => { alt = !!(e2 && e2.altKey); end(true); };
        const onCancel = () => end(false);
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
    }

    // Flèches : la sélection entière se décale de dx, dy pixels (une seule étape d'annulation pour une série).
    nudgeSelected(dx, dy) {
        const items = this.picked().map(b => ({ el: b, view: this.viewOf(b), r: this.rectOf(b) })).filter(i => i.view);
        if (!items.length) return false;
        const bbox = acBounds(items.map(i => i.r));
        const c = acClampMove(bbox, dx, dy, 0);
        if (!c.dx && !c.dy) return false;
        items.forEach(i => { i.view.setAt({ x: i.r.x + c.dx, y: i.r.y + c.dy }); i.view.commit(); });
        if (this.opts.onMoved) this.opts.onMoved(items.map(i => i.view), true);
        return true;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AC_SNAP, AC_DRAG_MIN, AC_MARGIN, AC_CASCADE, AC_BLOCKS, acBounds, acIntersects, acNormRect, acClampMove, acSnap, acFreeSpot,
        AC_ZOOM_MIN, AC_ZOOM_MAX, AC_ZOOM_STEPS, acClampZoom, acZoomStep, acZoomWheel, acZoomOffset, acZoomScroll };
}
