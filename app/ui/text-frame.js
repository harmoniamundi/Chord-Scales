// ui/text-frame.js — cadres de texte dans les annotations (onglet « Annotations » du mode Jam).
// Un cadre est un bloc <div class="annot-frame" data-frame="L,E" data-pos="x,y"> glissé dans le texte de l'annotation, comme une portée
// (ui/staff-editor.js), mais où l'on écrit du texte mis en forme (la barre de mise en forme de l'onglet s'applique à ce texte).
// Deux états, comme pour la portée :
//  - « en édition » (.is-editing) : le texte du cadre est modifiable (crayon ✎, double-clic sur le cadre, ou création par le bouton « Cadre » ;
//    Échap, un second clic sur ✎ ou un clic ailleurs en sort) ;
//  - « au repos » : le cadre se sélectionne d'un clic (Suppr. l'enlève), se déplace en le glissant (au pixel près, y compris dans l'autre zone),
//    et s'agrandit ou se réduit en tirant sur ses bords et ses coins (le curseur qui les survole change de forme). Le texte suit : tirer
//    change l'échelle d'affichage E (25 à 400 %), donc la taille visible de tout ce que contient le cadre ; la mise en page du texte ne bouge pas.
// Le texte enregistré ne garde que ce petit bloc et son texte mis en forme (format et nettoyage : ui/staff-notes.js et grid/grid-format.js).
// Chargé par index.html via <script src="app/ui/text-frame.js"> (après ui/staff-editor.js) et testé par ui/text-frame.test.js.

// Sous Node (tests), le format se charge ; en navigateur ce sont des globaux (ui/staff-notes.js).
const NTF_N = (typeof parseFrameBox !== 'undefined')
    ? { parseFrameBox, formatFrameBox, parseStaffPos, formatStaffPos, clampStaffPos, SN_FRAME_W_DEFAULT, SN_FRAME_SCALE_MIN, SN_FRAME_SCALE_MAX, SN_FRAME_SCALE_DEFAULT }
    : require('./staff-notes.js');

const NTF_EDGE = 6;          // épaisseur (pixels) de la zone sensible le long des bords, à la souris
const NTF_CORNER = 12;       // côté de la zone sensible des coins
const NTF_EDGE_TOUCH = 14;   // au doigt, les zones sont plus larges
const NTF_CORNER_TOUCH = 24;
const NTF_MIN_WIDTH = 40;    // largeur minimale affichée (pixels)

// ----- Fonctions sans état (testées sans navigateur) -----

// Zone sensible sous un point du cadre (x, y en pixels depuis son coin haut gauche, le cadre faisant w × h) :
// 'n', 's', 'e', 'w' (bords), 'nw', 'ne', 'sw', 'se' (coins) ou '' (intérieur ou hors du cadre).
function ntfHitZone(x, y, w, h, edge = NTF_EDGE, corner = NTF_CORNER) {
    if (!(x >= 0 && y >= 0 && x <= w && y <= h)) return '';
    const d = { w: x, e: w - x, n: y, s: h - y };
    const near = Object.keys(d).filter(k => d[k] <= edge);
    if (!near.length) return '';
    const hs = d.w <= corner ? 'w' : (d.e <= corner ? 'e' : '');
    const vs = d.n <= corner ? 'n' : (d.s <= corner ? 's' : '');
    const vertBand = near.includes('n') || near.includes('s');
    const horBand = near.includes('w') || near.includes('e');
    if (vertBand && hs) return (d.n <= edge ? 'n' : 's') + hs;
    if (horBand && vs) return vs + (d.w <= edge ? 'w' : 'e');
    return near.sort((a, b) => d[a] - d[b])[0];
}

// Forme du curseur qui survole une zone sensible.
function ntfCursor(zone) {
    return ({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' })[zone] || '';
}

// Nouvelle échelle (%) quand on tire la poignée `zone` de (dx, dy) pixels, le cadre faisant w0 × h0 pixels à l'écran à l'échelle s0.
// Un coin suit la diagonale (la projection du déplacement sur elle), un bord suit sa seule direction ; le cadre garde ses proportions.
// opts.maxScale : échelle maximale (le cadre ne dépasse pas la largeur de la zone) ; opts.baseWidth : largeur de mise en page (fixe l'échelle minimale
// pour que le cadre ne devienne pas plus étroit que NTF_MIN_WIDTH pixels).
// Renvoie { s, ax, ay } : s = échelle, (ax, ay) = point du cadre qui reste en place pendant le tirage (0, .5 ou 1 sur chaque axe : le coin ou le bord opposé).
function ntfResizeScale(zone, w0, h0, s0, dx, dy, opts = {}) {
    const sx = zone.includes('e') ? 1 : (zone.includes('w') ? -1 : 0);
    const sy = zone.includes('s') ? 1 : (zone.includes('n') ? -1 : 0);
    let r = 1;
    if (sx && sy) r = 1 + (sx * dx * w0 + sy * dy * h0) / (w0 * w0 + h0 * h0);
    else if (sx) r = (w0 + sx * dx) / w0;
    else if (sy) r = (h0 + sy * dy) / h0;
    let lo = NTF_N.SN_FRAME_SCALE_MIN, hi = NTF_N.SN_FRAME_SCALE_MAX;
    if (opts.baseWidth > 0) lo = Math.max(lo, Math.ceil(NTF_MIN_WIDTH / opts.baseWidth * 100));
    if (opts.maxScale > 0) hi = Math.min(hi, Math.max(lo, s0, Math.floor(opts.maxScale))); // déjà plus grand que la zone : on peut seulement réduire, sans saut
    const s = Math.max(lo, Math.min(hi, Math.round(s0 * (Number.isFinite(r) ? r : 1))));
    return { s, ax: sx > 0 ? 0 : (sx < 0 ? 1 : 0.5), ay: sy > 0 ? 0 : (sy < 0 ? 1 : 0.5) };
}

// Petit bloc enregistré dans l'annotation pour un cadre : sa largeur / échelle, son décalage libre et son texte (déjà en HTML restreint).
function noteFrameStubHtml(box, pos, innerHtml) {
    const b = NTF_N.formatFrameBox(box || { w: NTF_N.SN_FRAME_W_DEFAULT });
    const p = NTF_N.formatStaffPos(pos);
    return `<div class="annot-frame" data-frame="${b}"${p ? ` data-pos="${p}"` : ''}>${innerHtml || ''}</div>`;
}

// ----- Cadre -----

let NTF_ACTIVE = null; // le cadre dont le texte est en cours d'édition (un seul à la fois)

// opts : isEditable() → l'annotation est modifiable ; keepOpen(cible) → un clic sur cette cible (barre, menus) ne fait pas sortir de l'édition ;
//        onChange(view) après chaque changement (texte à la sortie de l'édition, position, taille) ; onActivate(view) / onDeactivate(view) ;
//        onFocusBack(view) quand on sort de l'édition au clavier ou par le crayon (le curseur revient dans le texte de la zone) ;
//        zones() → les zones d'annotation modifiables où l'on peut déposer le cadre ; maxFrames : nombre de cadres permis par zone ;
//        onGrab(view) quand le cadre est saisi ; onPick(view) quand il est sélectionné ; onMoved(view, serie) quand il vient d'être déplacé,
//        décalé ou redimensionné ; onTransfer(view, zone, range, desired, snap) quand il est déposé dans une autre zone.
class NoteFrameView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.box = NTF_N.parseFrameBox(el.getAttribute('data-frame') || '') || { w: NTF_N.SN_FRAME_W_DEFAULT, s: NTF_N.SN_FRAME_SCALE_DEFAULT };
        this.pos = NTF_N.parseStaffPos(el.getAttribute('data-pos') || '') || { x: 0, y: 0 };
        const inner = el.innerHTML;
        el.__noteFrame = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Cadre de texte');
        el.innerHTML = '<button type="button" class="annot-frame-edit" contenteditable="false" title="Écrire dans le cadre (un second clic en sort)" aria-label="Écrire dans le cadre">✎</button>'
            + '<div class="annot-frame-clip"><div class="annot-frame-body" data-placeholder="Écrivez ici…"></div></div>';
        this.editBtn = el.querySelector('.annot-frame-edit');
        this.body = el.querySelector('.annot-frame-body');
        this.body.innerHTML = inner;
        this._showPos();
        this._layout();
        this._bind();
        this._observe();
    }

    get editable() { return !!this.opts.isEditable(); }

    get isActive() { return this.el.classList.contains('is-editing'); }

    // La zone d'annotation qui contient le cadre (sa largeur limite celle du cadre).
    _zone() { return this.el.closest('.jam-annot-text') || this.el.parentElement; }

    // Taille du cadre : le texte est mis en page à la largeur box.w, puis agrandi / réduit à l'échelle box.s (transformation CSS) ;
    // le cadre prend la taille obtenue. La hauteur suit le texte (observée : taper une ligne de plus agrandit le cadre).
    _layout() {
        const k = this.box.s / 100;
        this.body.style.width = `${this.box.w}px`;
        this.body.style.transform = k === 1 ? '' : `scale(${k})`;
        const h = this.body.offsetHeight;
        this.el.style.width = `${Math.round(this.box.w * k)}px`;
        this.el.style.height = h ? `${Math.max(12, Math.round(h * k))}px` : '';
    }

    _observe() {
        if (this._ro || typeof ResizeObserver === 'undefined') return;
        this._ro = new ResizeObserver(() => {
            if (!this.el.isConnected) { this.destroy(); return; }
            this._layout();
        });
        this._ro.observe(this.body);
    }

    destroy() {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (NTF_ACTIVE === this) NTF_ACTIVE = null;
    }

    // ----- Édition du texte -----

    activate() {
        if (!this.editable) return;
        if (NTF_ACTIVE && NTF_ACTIVE !== this) NTF_ACTIVE.deactivate();
        if (typeof NSE_ACTIVE !== 'undefined' && NSE_ACTIVE) NSE_ACTIVE.deactivate();
        NTF_ACTIVE = this;
        this.el.classList.add('is-editing');
        this.el.classList.remove('is-picked');
        this.el.style.cursor = '';
        this.body.setAttribute('contenteditable', 'true');
        this.body.setAttribute('role', 'textbox');
        this.body.setAttribute('aria-multiline', 'true');
        this.body.setAttribute('spellcheck', 'false');
        if (this.opts.onActivate) this.opts.onActivate(this);
        try { this.body.focus({ preventScroll: true }); } catch (e) { /* non pris en charge */ }
        const sel = window.getSelection();
        if (sel) { const r = document.createRange(); r.selectNodeContents(this.body); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
        if (!this._outside) {
            this._outside = (ev) => {
                const t = ev.target;
                if (!t || this.el.contains(t)) return;
                if (this.opts.keepOpen && this.opts.keepOpen(t)) return;
                this.deactivate();
            };
            document.addEventListener('pointerdown', this._outside, true);
        }
    }

    deactivate() {
        if (!this.isActive) return;
        this.el.classList.remove('is-editing');
        ['contenteditable', 'role', 'aria-multiline', 'spellcheck'].forEach(a => this.body.removeAttribute(a));
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (NTF_ACTIVE === this) NTF_ACTIVE = null;
        this._layout();
        this.commit();
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    // ----- Enregistrement -----

    commit() {
        this.el.setAttribute('data-frame', NTF_N.formatFrameBox(this.box));
        this._showPos();
        if (this.opts.onChange) this.opts.onChange(this);
    }

    // ----- Souris et doigt -----

    _bind() {
        const el = this.el;
        // Crayon ✎ : ouvre le texte en édition, un second clic en sort.
        this.editBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        this.editBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!this.editable) return;
            if (this.isActive) { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); } else this.activate();
        });
        // Au repos : un clic le sélectionne, un glisser au milieu le déplace, un glisser sur un bord ou un coin le redimensionne.
        el.addEventListener('pointerdown', (ev) => this._down(ev));
        el.addEventListener('pointermove', (ev) => this._hover(ev));
        el.addEventListener('pointerleave', () => { if (!this._resizing) el.style.cursor = ''; });
        el.addEventListener('dblclick', (ev) => {
            if (ev.target.closest('.annot-frame-edit') || this.isActive || !this.editable) return;
            ev.preventDefault(); ev.stopPropagation();
            this.activate();
        });
        this.body.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Escape' || !this.isActive) return;
            ev.preventDefault(); ev.stopPropagation();
            this.deactivate();
            if (this.opts.onFocusBack) this.opts.onFocusBack(this);
        });
    }

    // Zone sensible sous le pointeur ('' = le milieu du cadre, ou le crayon).
    _zoneAt(ev) {
        if (ev.target.closest && ev.target.closest('.annot-frame-edit')) return '';
        const r = this.el.getBoundingClientRect();
        const touch = ev.pointerType === 'touch';
        return ntfHitZone(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, touch ? NTF_EDGE_TOUCH : NTF_EDGE, touch ? NTF_CORNER_TOUCH : NTF_CORNER);
    }

    // Survol à la souris : le curseur change de forme sur les bords et les coins.
    _hover(ev) {
        if (ev.buttons || this._resizing || ev.pointerType === 'touch') return;
        this.el.style.cursor = (!this.editable || this.isActive) ? '' : ntfCursor(this._zoneAt(ev));
    }

    _down(ev) {
        if (!this.editable || ev.button > 0 || this.isActive) return;
        if (ev.target.closest && ev.target.closest('.annot-frame-edit')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const zone = this._zoneAt(ev);
        if (zone) this._resizeDown(ev, zone); else this._moveDown(ev);
    }

    // ----- Redimensionner : bords et coins (hors édition) -----

    // Largeur maximale du cadre : celle de la zone (échelle maximale correspondante).
    _maxScale() {
        const z = this._zone();
        if (!z) return NTF_N.SN_FRAME_SCALE_MAX;
        const px = (v) => parseFloat(v) || 0;
        const zs = getComputedStyle(z);
        const room = z.clientWidth - px(zs.paddingLeft) - px(zs.paddingRight) - 12;
        return Math.max(NTF_N.SN_FRAME_SCALE_MIN, room / this.box.w * 100);
    }

    _resizeDown(ev, zone) {
        const el = this.el;
        if (this.opts.onGrab) this.opts.onGrab(this);
        const r0 = el.getBoundingClientRect();
        const s0 = this.box.s, pos0 = { ...this.pos };
        const x0 = ev.clientX, y0 = ev.clientY;
        const maxScale = this._maxScale();
        let changed = false;
        this._resizing = true;
        el.style.cursor = ntfCursor(zone);
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const apply = (s, ax, ay) => {
            this.box = { w: this.box.w, s };
            this._layout();
            const r1 = el.getBoundingClientRect();
            // le coin ou le bord opposé à la poignée reste en place
            this.placeAt({ left: r0.left + ax * (r0.width - r1.width), top: r0.top + ay * (r0.height - r1.height) }, false);
        };
        const end = (drop) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKey, true);
            try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            this._resizing = false;
            el.style.cursor = '';
            if (!drop) {
                if (changed) { this.pos = pos0; this.box = { w: this.box.w, s: s0 }; this._layout(); this._showPos(); }
                return;
            }
            if (!changed) { this._pick(); return; }
            this.commit();
            if (this.opts.onMoved) this.opts.onMoved(this);
            this._pick();
        };
        const onMove = (e2) => {
            const res = ntfResizeScale(zone, r0.width, r0.height, s0, e2.clientX - x0, e2.clientY - y0, { maxScale, baseWidth: this.box.w });
            if (!changed && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 3) return;
            if (res.s === this.box.s) { changed = changed || res.s !== s0; return; }
            changed = true;
            apply(res.s, res.ax, res.ay);
        };
        const onUp = () => end(true);
        const onCancel = () => end(false);
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
    }

    // ----- Déplacer le cadre : hors édition, comme un bloc portée -----

    // Décalage libre : le cadre garde sa place dans le texte et est simplement décalé de pos.x, pos.y pixels (data-pos, enregistré avec l'annotation).
    _showPos() {
        const { x, y } = this.pos;
        this.el.style.left = x ? `${x}px` : '';
        this.el.style.top = y ? `${y}px` : '';
        const t = NTF_N.formatStaffPos(this.pos);
        if (t) this.el.setAttribute('data-pos', t); else this.el.removeAttribute('data-pos');
    }

    // Pose le décalage (après l'avoir ramené dans la zone) ; renvoie true s'il a changé.
    setPos(pos, opts = {}) {
        let x = NTF_N.clampStaffPos(pos.x), y = NTF_N.clampStaffPos(pos.y);
        if (opts.clamp !== false) {
            const z = this._zone();
            if (z && this.el.isConnected) {
                const zr = z.getBoundingClientRect(), r = this.el.getBoundingClientRect();
                const nat = { l: r.left - this.pos.x, t: r.top - this.pos.y };           // place du cadre sans décalage
                const minX = zr.left + z.clientLeft - nat.l, maxX = zr.left + z.clientLeft + z.clientWidth - r.width - nat.l;
                const minY = zr.top + z.clientTop - z.scrollTop - nat.t;                  // le haut du contenu de la zone
                x = Math.max(Math.min(x, Math.floor(maxX)), Math.ceil(minX));
                if (!(maxX >= minX)) x = Math.ceil(minX);
                y = Math.max(y, Math.ceil(minY));
            }
        }
        if (x === this.pos.x && y === this.pos.y) return false;
        this.pos = { x, y };
        this._showPos();
        return true;
    }

    // Décale le cadre de dx, dy pixels (flèches du clavier quand il est sélectionné).
    nudge(dx, dy) {
        if (!this.setPos({ x: this.pos.x + dx, y: this.pos.y + dy })) return false;
        this.commit();
        if (this.opts.onMoved) this.opts.onMoved(this, true);
        return true;
    }

    // Remet le cadre à sa place dans le texte.
    resetPos() {
        if (!this.pos.x && !this.pos.y) return;
        this.pos = { x: 0, y: 0 };
        this.commit();
        if (this.opts.onMoved) this.opts.onMoved(this);
    }

    // Place le cadre pour que son coin haut gauche tombe en `desired` { left, top } (pixels de l'écran) : on mesure sa place dans le texte sans décalage,
    // le décalage est la différence. `snap` : un écart de 3 pixels ou moins revient à la place du texte.
    placeAt(desired, snap = true) {
        this.pos = { x: 0, y: 0 };
        this._showPos();
        const r = this.el.getBoundingClientRect();
        let x = Math.round(desired.left - r.left), y = Math.round(desired.top - r.top);
        if (snap && Math.abs(x) <= 3 && Math.abs(y) <= 3) { x = 0; y = 0; }
        this.setPos({ x, y });
    }

    // Le cadre peut être déposé dans la zone où il est, ou dans une autre zone modifiable qui a encore de la place.
    _canDropIn(zone) {
        return zone === this._zone() || zone.querySelectorAll('.annot-frame').length < (this.opts.maxFrames || 8);
    }

    // Appui au milieu du cadre : un clic le sélectionne (Suppr. l'enlève, les flèches le décalent) ; glisser le déplace au pixel près,
    // là où l'aperçu se trouve, y compris dans l'autre zone ; Échap annule. Un décalage de 3 pixels ou moins revient à la place du texte (Alt : pas d'aimant).
    _moveDown(ev) {
        const el = this.el, grip = el;
        if (this.opts.onGrab) this.opts.onGrab(this);
        const x0 = ev.clientX, y0 = ev.clientY;
        const r0 = el.getBoundingClientRect();
        const gx = x0 - r0.left, gy = y0 - r0.top;      // où le cadre a été saisi
        const zones = () => (this.opts.zones ? this.opts.zones() : [this._zone()]).filter(Boolean);
        let dragging = false, ghost = null, timer = null, lastX = x0, lastY = y0, alt = false;
        try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const where = document.fullscreenElement || document.body;
        const refresh = () => { if (ghost) { ghost.style.left = `${Math.round(lastX - gx)}px`; ghost.style.top = `${Math.round(lastY - gy)}px`; } };
        const begin = () => {
            dragging = true;
            el.classList.add('is-dragging-src');
            ghost = document.createElement('div');
            ghost.className = 'annot-drag-ghost annot-drag-ghost-frame';
            ghost.style.boxSizing = 'border-box'; ghost.style.width = `${Math.round(r0.width)}px`; ghost.style.height = `${Math.round(r0.height)}px`; ghost.style.maxWidth = 'none';
            const clip = el.querySelector('.annot-frame-clip');
            if (clip) ghost.appendChild(clip.cloneNode(true));
            where.appendChild(ghost);
            // près du haut ou du bas d'une zone, elle défile toute seule
            timer = setInterval(() => {
                const z = zones().find((q) => { const r = q.getBoundingClientRect(); return lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom; });
                if (!z) return;
                const r = z.getBoundingClientRect();
                if (lastY < r.top + 26) z.scrollTop -= 14; else if (lastY > r.bottom - 26) z.scrollTop += 14; else return;
            }, 50);
        };
        const end = (drop) => {
            grip.removeEventListener('pointermove', onMove);
            grip.removeEventListener('pointerup', onUp);
            grip.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKey, true);
            try { grip.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (timer) clearInterval(timer);
            if (ghost) ghost.remove();
            el.classList.remove('is-dragging-src');
            if (!dragging) { if (drop) this._pick(); return; }
            if (!drop) return;
            const target = nseDropTarget(zones(), lastX, lastY);       // la zone sous le pointeur
            if (!target || !this._canDropIn(target.zone)) return;      // lâché hors d'une zone : rien ne bouge
            this._dropAt(target, { left: lastX - gx, top: lastY - gy }, !alt);
        };
        const onMove = (e2) => {
            lastX = e2.clientX; lastY = e2.clientY; alt = !!e2.altKey;
            if (!dragging) { if (Math.hypot(lastX - x0, lastY - y0) < 5) return; begin(); }
            refresh();
        };
        const onUp = (e2) => { alt = !!(e2 && e2.altKey); end(true); };
        const onCancel = () => end(false);
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
        grip.addEventListener('pointermove', onMove);
        grip.addEventListener('pointerup', onUp);
        grip.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
    }

    // Sélectionne le cadre entier (comme une image dans un texte) : la zone prend le focus pour que Suppr. et les flèches s'appliquent à lui.
    _pick() {
        if (this.opts.onPick) this.opts.onPick(this);
        const sel = window.getSelection();
        if (!sel) return;
        const r = document.createRange();
        r.selectNode(this.el);
        sel.removeAllRanges();
        sel.addRange(r);
        this.el.classList.add('is-picked');
    }

    // Dépose le cadre : il s'accroche au texte près du coin haut gauche de l'aperçu (dans la zone sous le pointeur) puis y est décalé au pixel près.
    // Autre zone : le cadre y est recréé (onTransfer) et décalé de la même façon.
    _dropAt(target, desired, snap) {
        const el = this.el, zone = target.zone;
        const zr = zone.getBoundingClientRect();
        const ax = Math.max(zr.left + 2, Math.min(zr.right - 2, desired.left + 8)), ay = Math.max(zr.top + 2, Math.min(zr.bottom - 2, desired.top + 8));
        const anchor = nseDropTarget([zone], ax, ay) || target;
        if (zone === this._zone()) {
            const r = anchor.range;
            const parent = el.parentNode;
            const idx = Array.prototype.indexOf.call(parent.childNodes, el);
            const inPlace = r.startContainer === parent && (r.startOffset === idx || r.startOffset === idx + 1);
            if (!inPlace) {
                r.insertNode(el);
                zone.normalize(); // recolle les morceaux de texte coupés par l'insertion
            }
            this.placeAt(desired, snap);
            this.commit();
            if (this.opts.onMoved) this.opts.onMoved(this);
            this._pick();
        } else if (this.opts.onTransfer) {
            this.opts.onTransfer(this, zone, anchor.range, desired, snap);
        }
    }
}

// Transforme chaque bloc « annot-frame » de `root` en cadre de texte (affiché sans pouvoir être modifié si l'annotation est en lecture seule).
function hydrateNoteFrames(root, opts) {
    root.querySelectorAll('.annot-frame').forEach((el) => {
        if (el.__noteFrame && el.isConnected && el.__noteFrame.el === el && el.querySelector(':scope > .annot-frame-clip')) return;
        new NoteFrameView(el, opts);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NTF_EDGE, NTF_CORNER, NTF_MIN_WIDTH, ntfHitZone, ntfCursor, ntfResizeScale, noteFrameStubHtml };
}
