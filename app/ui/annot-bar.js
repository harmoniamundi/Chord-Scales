// ui/annot-bar.js — barre de mise en forme de l'onglet « Annotations » (mode Jam), comme dans un traitement de texte :
// police, taille (boutons − / + et menu avec curseur), gras / italique / souligné / barré, alignement, puces, couleur du texte,
// surlignage, symboles et nuances, portée et cadre de texte à insérer, effacement de la mise en forme. Fonctions pures : elles ne font que fabriquer le HTML ;
// les clics, la sélection du texte et les menus flottants sont dans index.html (JamEngine, « Onglet Annotations »).
// Chargé par index.html via <script src="ui/annot-bar.js"> et testé par ui/annot-bar.test.js.

const ANNOT_SIZE_MIN = 8;
const ANNOT_SIZE_MAX = 72;
const ANNOT_SIZE_DEFAULT = 15;
// Crans des boutons − / + (comme dans un traitement de texte) et tailles proposées dans le menu.
const ANNOT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72];
const ANNOT_SIZE_PRESETS = [10, 12, 14, 16, 20, 24, 32, 48];

// Polices : libellé affiché → valeur CSS (les mêmes que NOTE_FONTS de grid/grid-format.js, qui ne laisse passer que celles-ci).
// « Real Book » (Kalam, la police des accords de la grille, fournie avec l'appli) est la première et la police par défaut des zones
// (voir .jam-annot-text dans style.css). Les autres sont des polices du système, avec des polices de rechange pour Mac, Windows et Linux :
// une police absente de la machine est remplacée par la suivante de sa liste.
const ANNOT_FONT_DEFAULT_CSS = 'Kalam,cursive';
const ANNOT_FONT_CHOICES = [
    { label: 'Real Book', css: ANNOT_FONT_DEFAULT_CSS },
    { label: 'Système', css: "system-ui,-apple-system,'Segoe UI',sans-serif" },
    { label: 'Arial', css: 'Arial,Helvetica,sans-serif' },
    { label: 'Verdana', css: 'Verdana,Geneva,sans-serif' },
    { label: 'Trebuchet', css: "'Trebuchet MS',sans-serif" },
    { label: 'Gill Sans', css: "'Gill Sans','Gill Sans MT',Calibri,sans-serif" },
    { label: 'Futura', css: "Futura,'Century Gothic','Trebuchet MS',sans-serif" },
    { label: 'Georgia', css: 'Georgia,serif' },
    { label: 'Times', css: "'Times New Roman',Times,serif" },
    { label: 'Palatino', css: "'Palatino Linotype',Palatino,'Book Antiqua',serif" },
    { label: 'Baskerville', css: "Baskerville,'Baskerville Old Face',Georgia,serif" },
    { label: 'Machine à écrire', css: "'Courier New',Courier,monospace" },
    { label: 'Code (Menlo)', css: "Menlo,Monaco,Consolas,'DejaVu Sans Mono',monospace" },
    { label: 'Titre (Impact)', css: "Impact,'Arial Narrow',sans-serif" },
    { label: 'Feutre (Marker Felt)', css: "'Marker Felt','Segoe Print','Comic Sans MS',cursive" },
    { label: 'Stylo (Bradley Hand)', css: "'Bradley Hand','Segoe Script','Comic Sans MS',cursive" },
    { label: 'Calligraphie', css: "'Snell Roundhand','Brush Script MT','Lucida Handwriting',cursive" }
];

const ANNOT_TEXT_COLORS = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#6b7280'];
const ANNOT_HILITE_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e5e7eb'];
const ANNOT_SYMBOLS = ['♭', '♯', '♮', 'Δ', 'ø', '°', '⁷', '⁹', '¹¹', '¹³', '♩', '♪', '♫', '‖', '→', '↑', '↓', '↗', '↘', '✓', '×'];
const ANNOT_NUANCES = ['p', 'mp', 'mf', 'f', 'ff', 'cresc.', 'dim.', 'rit.', 'a tempo', 'solo', 'tutti'];

// Taille suivante (dir = 1) ou précédente (dir = -1) dans les crans ; reste dans les bornes.
function nextAnnotSize(px, dir) {
    const v = Math.round(Number(px)) || ANNOT_SIZE_DEFAULT;
    if (dir > 0) { const n = ANNOT_SIZE_STEPS.find(s => s > v); return n === undefined ? ANNOT_SIZE_MAX : n; }
    const smaller = ANNOT_SIZE_STEPS.filter(s => s < v);
    return smaller.length ? smaller[smaller.length - 1] : ANNOT_SIZE_MIN;
}

function clampAnnotSize(px) {
    const v = Math.round(Number(px));
    if (!Number.isFinite(v)) return ANNOT_SIZE_DEFAULT;
    return Math.max(ANNOT_SIZE_MIN, Math.min(ANNOT_SIZE_MAX, v));
}

// Valeur CSS de police → libellé du menu (null si ce n'est pas l'une des polices proposées). Seule la première famille compte.
function annotFontLabel(cssFamily) {
    const first = String(cssFamily || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    const hit = ANNOT_FONT_CHOICES.find(f => f.css.split(',')[0].replace(/^["']|["']$/g, '').toLowerCase() === first);
    return hit ? hit.label : null;
}

function annotAlignIcon(kind) {
    const x = { left: [1, 9], center: [4, 8], right: [7, 8] }[kind]; // début et longueur des lignes courtes
    return `<svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 2h14M${x[0]} 5.5h${x[1]}M1 9h14M${x[0]} 12.5h${x[1]}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
}

// Icônes de la barre (dessinées en SVG, comme les autres : elles prennent la couleur du texte du bouton).
// Cadre : un rectangle avec des lignes de texte. Effacer la mise en forme : un T barré d'une croix (le « Tx » des traitements de texte).
const ANNOT_FRAME_ICON = '<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><rect x="1.5" y="1.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 5.5h9M4.5 8.5h9M4.5 11.5h5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg>';
const ANNOT_CLEAR_ICON = '<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M2 2.5h9M6.5 2.5v10M4.5 12.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M11.5 8l4.5 4.5M16 8l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';

// La barre elle-même (toujours visible dans l'onglet ; les boutons n'agissent que lorsqu'une zone de texte est active).
function annotBarHtml() {
    const btn = (label, attrs, title, cls = '') => `<button type="button" class="ab-btn ${cls}" ${attrs} title="${title}" aria-label="${title}">${label}</button>`;
    const fonts = ANNOT_FONT_CHOICES.map(f => `<option value="${f.css.replace(/"/g, '&quot;')}" style="font-family:${f.css.replace(/"/g, '&quot;')}">${f.label}</option>`).join('');
    return `<div id="jam-annot-bar" class="annot-bar is-idle" role="toolbar" aria-label="Mise en forme du texte">
        <select class="ab-sel ab-font" data-font title="Police" aria-label="Police">${fonts}</select>
        <div class="ab-grp" role="group" aria-label="Taille du texte">
            ${btn('−', 'data-size-step="-1"', 'Diminuer la taille du texte', 'ab-step')}
            ${btn(`<span data-size-label>${ANNOT_SIZE_DEFAULT}</span><small>px</small>`, 'data-menu="size" aria-haspopup="true"', 'Taille du texte : ouvrir le curseur', 'ab-size')}
            ${btn('+', 'data-size-step="1"', 'Augmenter la taille du texte', 'ab-step')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Style">
            ${btn('<b>G</b>', 'data-cmd="bold" data-state="bold"', 'Gras (⌘B)')}
            ${btn('<i>I</i>', 'data-cmd="italic" data-state="italic"', 'Italique (⌘I)')}
            ${btn('<u>S</u>', 'data-cmd="underline" data-state="underline"', 'Souligné (⌘U)')}
            ${btn('<s>B</s>', 'data-cmd="strikeThrough" data-state="strikeThrough"', 'Barré')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Couleurs">
            ${btn('<span class="ab-a">A</span><i class="ab-bar" data-color-bar></i>', 'data-menu="color" aria-haspopup="true"', 'Couleur du texte', 'ab-color')}
            ${btn('<span class="ab-hl">ab</span>', 'data-menu="hilite" aria-haspopup="true"', 'Surlignage', 'ab-color')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Paragraphe">
            ${btn(annotAlignIcon('left'), 'data-cmd="justifyLeft"', 'Aligner à gauche')}
            ${btn(annotAlignIcon('center'), 'data-cmd="justifyCenter"', 'Centrer')}
            ${btn(annotAlignIcon('right'), 'data-cmd="justifyRight"', 'Aligner à droite')}
            ${btn('• Liste', 'data-cmd="insertUnorderedList" data-state="insertUnorderedList"', 'Liste à puces', 'ab-txt')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Insérer">
            ${btn('♯ ♩ ▾', 'data-menu="insert" aria-haspopup="true"', 'Insérer un symbole ou une nuance', 'ab-txt')}
            ${btn('<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M1 3h16M1 6.5h16M1 10h16M1 13.5h16" stroke="currentColor" stroke-width="1.2" fill="none"/><ellipse cx="9" cy="10" rx="2.6" ry="1.9" transform="rotate(-20 9 10)" fill="currentColor"/><path d="M11.4 9V1.5" stroke="currentColor" stroke-width="1.3"/></svg> Portée', 'data-insert-staff="1"', 'Ajouter une portée éditable (à la première place libre de la zone)', 'ab-txt ab-staff')}
            ${btn(ANNOT_FRAME_ICON + ' Cadre', 'data-insert-frame="1"', 'Ajouter un cadre de texte (ou double-clic sur le fond de la zone) : on écrit dedans ; une fois sorti de l\'édition, on le déplace, et on l\'agrandit ou le réduit en tirant sur ses bords et ses coins (le texte suit)', 'ab-txt ab-frame')}
        </div>
        <span class="ab-sep"></span>
        ${btn(ANNOT_CLEAR_ICON, 'data-clear="1"', 'Effacer la mise en forme : retire gras, couleur, taille, police… de la sélection', 'ab-clear')}
        <div id="jam-annot-staff-host" class="ab-staff-host"></div>
    </div>`;
}

// Boutons de disposition, en tête de chaque zone d'annotation : aimant (léger magnétisme entre blocs), cadre visible / caché,
// premier plan, arrière-plan. L'aimant est un réglage de la page ; les trois autres s'appliquent aux blocs sélectionnés de la zone.
// Les boutons ne prennent pas le focus (la sélection de blocs, ou le texte en cours d'écriture, reste en place).
const ANNOT_TOOL_ICONS = {
    magnet: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7v1.2a5 5 0 0 0 10 0V7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M3 1.8V5.4M13 1.8V5.4" fill="none" stroke="currentColor" stroke-width="3" opacity=".5"/></svg>',
    border: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 1.8"/><path d="M5 6.5h6M5 9.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    front: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/><rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="6" y="6" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/></svg>'
};
const ANNOT_TOOLS = [
    { act: 'magnet', title: 'Aimant : les blocs se collent légèrement les uns aux autres et aux bords quand on les déplace (Alt pour l\'ignorer le temps d\'un geste)' },
    { act: 'border', title: 'Cadre visible / caché pour les blocs sélectionnés' },
    { act: 'front', title: 'Mettre les blocs sélectionnés au premier plan' },
    { act: 'back', title: 'Mettre les blocs sélectionnés à l\'arrière-plan' }
];
function annotToolsHtml() {
    const b = ANNOT_TOOLS.map(t => `<button type="button" class="ab-btn at-btn" data-annot-act="${t.act}" title="${t.title}" aria-label="${t.title}"${t.act === 'magnet' ? ' aria-pressed="false"' : ' disabled'}
        onmousedown="event.preventDefault()" onclick="app.jam.annotToolAct('${t.act}')">${ANNOT_TOOL_ICONS[t.act]}</button>`).join('');
    return `<span class="jam-annot-tools" role="group" aria-label="Disposition des blocs">${b}</span>`;
}

// ----- En-tête de chaque zone : crayon (mode édition) et zoom de lecture -----
// Le mode édition se règle zone par zone (« Grille », « Mesure ») ; hors édition les blocs sont figés et la zone se lit, avec un zoom.
const ANNOT_PENCIL_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.2 2.2a1.6 1.6 0 0 1 2.3 0l.3.3a1.6 1.6 0 0 1 0 2.3L5.6 13 2 14l1-3.6z" fill="currentColor"/></svg>';
const ANNOT_ZONES = ['general', 'measure'];
function annotModeHtml(which) {
    const t = 'Modifier les annotations (déplacer, écrire, ajouter des blocs)';
    return `<button type="button" class="ab-btn jam-annot-pencil" data-annot-mode="${which}" aria-pressed="false" title="${t}" aria-label="${t}"
        onmousedown="event.preventDefault()" onclick="app.jam.annotToggleMode('${which}')">${ANNOT_PENCIL_ICON}</button>`;
}
function annotZoomHtml(which) {
    const b = (act, label, title) => `<button type="button" class="ab-btn at-btn jam-annot-zbtn" data-zoom-act="${act}" title="${title}" aria-label="${title}"
        onmousedown="event.preventDefault()" onclick="app.jam.annotZoomAct('${which}', '${act}')">${label}</button>`;
    return `<span class="jam-annot-zoom" role="group" aria-label="Zoom de lecture">${b('out', '−', 'Dézoomer')}${b('reset', '100 %', 'Zoom à 100 %')}${b('in', '+', 'Zoomer')}</span>`;
}

// Contenu des menus flottants. state : { size } pour le menu de taille.
function annotMenuHtml(kind, state = {}) {
    const sw = (color, attr, label) => `<button type="button" class="annot-sw" ${attr}="${color}" style="background:${color}" title="${color}" aria-label="${label} ${color}"></button>`;
    const chip = (label, attrs, title, cls = '') => `<button type="button" class="jm-chip annot-chip ${cls}" ${attrs} title="${title}" aria-label="${title}">${label}</button>`;
    if (kind === 'size') {
        const size = clampAnnotSize(state.size);
        return `<div class="ab-menu-title">Taille du texte</div>
            <div class="ab-size-row">
                <input type="range" class="ab-range" min="${ANNOT_SIZE_MIN}" max="${ANNOT_SIZE_MAX}" step="1" value="${size}" data-size-range aria-label="Taille du texte, en pixels">
                <output class="ab-size-out" data-size-out>${size}</output><small>px</small>
            </div>
            <div class="jm-row ab-presets">${ANNOT_SIZE_PRESETS.map(p => chip(String(p), `data-size="${p}"`, `${p} px`)).join('')}</div>
            <div class="ab-hint">Sans texte sélectionné, la taille s'applique à ce que vous écrivez ensuite.</div>`;
    }
    if (kind === 'color') {
        return `<div class="ab-menu-title">Couleur du texte</div>
            <div class="jm-row annot-colors">${ANNOT_TEXT_COLORS.map(c => sw(c, 'data-color', 'Couleur')).join('')}
                <label class="annot-sw annot-sw-custom" title="Autre couleur…"><input type="color" data-color-custom value="#dc2626" aria-label="Autre couleur de texte"></label></div>`;
    }
    if (kind === 'hilite') {
        return `<div class="ab-menu-title">Surlignage</div>
            <div class="jm-row annot-colors">${ANNOT_HILITE_COLORS.map(c => sw(c, 'data-hilite', 'Surlignage')).join('')}
                <button type="button" class="jm-chip annot-chip annot-none" data-hilite="transparent" title="Retirer le surlignage">Aucun</button></div>`;
    }
    if (kind === 'insert') {
        return `<div class="ab-menu-title">Symboles</div>
            <div class="jm-row">${ANNOT_SYMBOLS.map(x => chip(x, `data-ins="${x}"`, `Insérer ${x}`, 'annot-sym')).join('')}</div>
            <div class="ab-menu-title ab-menu-gap">Nuances et indications</div>
            <div class="jm-row">${ANNOT_NUANCES.map(x => chip(x, `data-ins="${x}"`, `Insérer « ${x} »`, 'annot-nu')).join('')}</div>`;
    }
    return '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ANNOT_SIZE_MIN, ANNOT_SIZE_MAX, ANNOT_SIZE_DEFAULT, ANNOT_SIZE_STEPS, ANNOT_FONT_DEFAULT_CSS, ANNOT_FONT_CHOICES, nextAnnotSize, clampAnnotSize, annotFontLabel, annotBarHtml, annotMenuHtml, annotToolsHtml, ANNOT_TOOLS, ANNOT_ZONES, annotModeHtml, annotZoomHtml };
}
