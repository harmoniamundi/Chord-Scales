// ui/scale-cards.js — cartes de gammes de la Jam (une par accord, ou deux accords glissants pendant la lecture), sans DOM :
// identifiants, classes, HTML de chaque carte, tâche de dessin des portées, signature qui permet de réutiliser les cartes
// d'une mesure à l'autre. Le moteur (JamEngine.renderJamScales / appendSplitScaleCard) crée les éléments et branche les clics.
// Chargé par index.html via <script src="ui/scale-cards.js"> et testé par ui/scale-cards.test.js.
//
// Champs communs des « p » (paramètres de carte) :
//   startMeasure   numéro de la première mesure du bloc      rootName / scaleDef   fondamentale affichée et gamme (scalesDb)
//   showScaleInfo  afficher catégorie et description         chordNameHtml / vizHtml   HTML déjà construits (nom d'accord, pastilles ou portée)

const SC_CARD_BASE = 'bg-[#1a1a1a] border transition-all duration-200 rounded-xl p-4 shadow relative';
const SC_ON = 'border-2 border-emerald-400 bg-[#1e293b] ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/10 scale-[1.01]';
const SC_OFF = 'border-[#333333] hover:border-[#555555]';

// Carte d'un accord (colonne de gauche à droite, cliquable pour écouter la gamme).
function scaleCardClass(isActive) {
    return `${SC_CARD_BASE} flex flex-col justify-between group cursor-pointer items-start self-start ${isActive ? SC_ON : SC_OFF}`;
}

// Carte d'une mesure à deux accords.
function splitCardClass(isActive) {
    return `${SC_CARD_BASE} flex flex-col gap-3 group ${isActive ? SC_ON : SC_OFF}`;
}

// Nom d'accord cliquable (joue l'accord).
function chordNameHtml(rootIndex, chordId, rootName, chordObj) {
    return `<span onclick="app.playJamChord(${rootIndex}, '${chordId}'); event.stopPropagation();" class="font-bold cursor-pointer select-none" style="font-size:1.25rem;line-height:1.2;color:#60a5fa;" title="Écouter l'accord">${rootName}${chordObj.name}</span>`;
}

// Pastille « moitié » (1re / 2e moitié de mesure).
function halfLabelHtml(text) {
    return `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2a2a2c] text-slate-300 font-bold border border-[#444]">${text}</span>`;
}

const halfSuffix = (half) => half === null ? 'single' : half === 0 ? 'a' : 'b';

// Identifiants d'une carte de la fenêtre glissante (pendant la lecture). half : null (accord simple), 0 ou 1.
function playingCardIds(idx, half, scaleId) {
    const suffix = halfSuffix(half);
    return {
        id: `jam-scale-card-play-${idx}-${suffix}`,
        canvasId: `jam-vexflow-canvas-play-${idx}-${suffix}`,
        scaleKey: half === null ? `jam-scale-${idx}-${scaleId}` : `jam-scale-${idx}-${half === 0 ? 'a' : 'b'}-${scaleId}`
    };
}

// Clé de lecture d'une gamme d'une moitié de mesure (carte à deux accords).
function halfScaleKey(idx, half, scaleId) {
    return `jam-scale-${idx}-${half === 0 ? 'a' : 'b'}-${scaleId}`;
}

// Identifiant de la portée d'une moitié de mesure (carte à deux accords).
function halfCanvasId(idx, half) {
    return `jam-vexflow-canvas-${idx}${half === 0 ? '' : '-b'}`;
}

// Contenu d'une carte de la fenêtre glissante : p.halfLabel (HTML, ou ''), p.isCurrent (« Active » / « Suivante »).
function playingCardHtml(p) {
    return `
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 select-none w-full">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-xs font-mono px-2 py-0.5 rounded bg-[#2a2a2c] text-slate-300 font-bold border border-[#444]">m.${p.startMeasure}</span>
                                    ${p.halfLabel}
                                    <h3 class="font-bold text-sm text-white">${p.rootName} ${p.scaleDef.name}</h3>
                                    ${p.showScaleInfo ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2a2a2c] text-slate-300 border border-[#333333]">${p.scaleDef.category}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-2">
                                    ${p.chordNameHtml}
                                    ${p.isCurrent ? '<span class="jam-active-badge px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 uppercase tracking-wider animate-pulse">Active</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 uppercase tracking-wider">Suivante</span>'}
                                </div>
                            </div>
                            ${p.showScaleInfo ? `<p class="text-xs text-slate-400 mb-3 select-none">${p.scaleDef.desc}</p>` : ''}
                            <div class="pt-2 border-t border-[#333333] w-full">
                                ${p.vizHtml}
                            </div>
                        `;
}

// Contenu d'une carte de la vue complète de la grille (hors lecture).
function idleCardHtml(p) {
    return `
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 select-none w-full">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-xs font-mono px-2 py-0.5 rounded bg-[#2a2a2c] text-slate-300 font-bold border border-[#444]">m.${p.startMeasure}</span>
                                    <h3 class="font-bold text-sm text-white">${p.rootName} ${p.scaleDef.name}</h3>
                                    ${p.showScaleInfo ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2a2a2c] text-slate-300 border border-[#333333]">${p.scaleDef.category}</span>` : ''}
                                </div>
                                ${p.chordNameHtml}
                            </div>
                            ${p.showScaleInfo ? `<p class="text-xs text-slate-400 mb-3 select-none">${p.scaleDef.desc}</p>` : ''}
                            <div class="pt-2 border-t border-[#333333] w-full">
                                ${p.vizHtml}
                            </div>`;
}

// Un des deux blocs d'une carte à deux accords : p.half (0 ou 1), p.idx, p.on (moitié en cours), p.halfLabelText.
function halfBlockHtml(p) {
    return `
                        <div class="jam-half-block rounded-lg p-2 border cursor-pointer ${p.on ? 'border-emerald-400 bg-[#1e293b]' : 'border-[#333333]'}" data-half="${p.half}" data-jam-step-index="${p.idx}">
                            <div class="flex items-center gap-2 flex-wrap mb-1 select-none">
                                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2a2a2c] text-slate-300 font-bold border border-[#444]">${p.halfLabelText}</span>
                                <h3 class="font-bold text-sm text-white">${p.rootName} ${p.scaleDef.name}</h3>
                                ${p.showScaleInfo ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2a2a2c] text-slate-300 border border-[#333333]">${p.scaleDef.category}</span>` : ''}
                                ${p.chordNameHtml}
                            </div>
                            ${p.showScaleInfo ? `<p class="text-xs text-slate-400 mb-2 select-none">${p.scaleDef.desc}</p>` : ''}
                            ${p.vizHtml}
                        </div>`;
}

// Carte à deux accords : en-tête, badge « Active » si le bloc est en cours, puis les blocs (HTML).
function splitCardHtml(p) {
    return `
                    <div class="flex items-center justify-between gap-2 select-none">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono px-2 py-0.5 rounded bg-[#2a2a2c] text-slate-300 font-bold border border-[#444]">m.${p.startMeasure}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2a2a2c] text-slate-300 border border-[#333333]">2 accords dans la mesure</span>
                        </div>
                        ${p.isActive ? '<span class="jam-active-badge px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 uppercase tracking-wider animate-pulse">Active</span>' : ''}
                    </div>
                    ${p.blocksHtml}
                `;
}

// Tâche de dessin d'une portée (exécutée une fois les cartes en place).
function staffTask(canvasId, scaleDef, rootName, avoidNotes, characteristicInterval, chordObj, showTargetNotes) {
    return { canvasId, intervals: scaleDef.intervals, rootName, isDesc: false, avoidNotes, characteristicInterval, chordObj, showTargetNotes };
}

// Signature de ce qui détermine l'aspect des deux cartes affichées : identique d'une mesure à l'autre → cartes réutilisées.
// v : grid, currentItem / nextItem ({ idx, half } ou null), halvesOf(step), startMeasureOf(idx), flags (tableau de réglages
// d'affichage), frenchSharp / frenchFlat (noms français de C# et Bb, qui changent avec la notation).
function scalesSignature(v) {
    const sigOf = (it, cur) => {
        if (!it) return '-';
        const st = v.grid[it.idx];
        if (!st) return 'x';
        const d = it.half !== null ? v.halvesOf(st)[it.half] : st;
        return d ? [it.idx, it.half, d.rootIndex, d.chordId, d.scaleId, cur].join(',') : 'y';
    };
    return [sigOf(v.currentItem, 1), sigOf(v.nextItem, 0), ...v.flags,
        v.startMeasureOf(v.currentItem.idx), v.nextItem ? v.startMeasureOf(v.nextItem.idx) : '',
        v.frenchSharp, v.frenchFlat].join('|');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scaleCardClass, splitCardClass, chordNameHtml, halfLabelHtml, playingCardIds, halfScaleKey, halfCanvasId, playingCardHtml, idleCardHtml, halfBlockHtml, splitCardHtml, staffTask, scalesSignature };
}
