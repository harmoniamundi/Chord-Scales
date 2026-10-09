// ui/grid-view.js — affichage de la grille d'accords (jam), sans DOM : découpage en lignes, « modèle » de chaque case
// (accord(s), gamme, reprises, 1re / 2e fin, case active) et HTML correspondant, repères d'impression, empreinte de rendu.
// Le moteur (JamEngine.renderSequenceUI / printCurrentGrid) ne fait plus que créer les éléments, brancher les clics
// et insérer le HTML produit ici. Chargé par index.html via <script src="ui/grid-view.js"> et testé par ui/grid-view.test.js.
//
// Contexte de vue `v` (construit une fois par rendu par le moteur) :
//   grid            grille (blocs)         flat      liste à plat des mesures (getFlatMeasureList)
//   effV            volta effective par bloc (_effectiveVolta)
//   scalesDb        catalogue des gammes   bpb / splitBeat   temps par mesure, temps où change l'accord d'une mesure à deux accords
//   currentBeat     temps courant dans le bloc    currentMeasureNum   numéro de la mesure en cours
//   showHarmonicFunctions, editBarOpen, sel ({from, to} ou null)
//   symbolHtml(chord)  symbole d'accord en HTML    fnLabel(chord, flat, index, half)  chiffrage de fonction
//   partLabelOf(m)  lettre de partie qui ouvre la mesure (ou null)    measureKey(m)  clé d'égalité de deux mesures

// Découpe la liste à plat en lignes de 4 mesures ; une nouvelle partie commence toujours une nouvelle ligne.
function layoutRows(flat, partLabelOf) {
    const rows = [];
    let cur = [];
    flat.forEach((m) => {
        if (cur.length && (cur.length === 4 || partLabelOf(m))) { rows.push(cur); cur = []; }
        cur.push(m);
    });
    if (cur.length) rows.push(cur);
    return rows;
}

// Classes de la case selon qu'elle est en cours de lecture ou non.
function cellClassName(isActive) {
    return `jam-cell p-2 rounded border text-center transition cursor-pointer select-none flex flex-col justify-between h-[64px] relative ${
        isActive
            ? 'bg-blue-600 border-blue-400 text-white shadow-lg ring-2 ring-blue-400/50 scale-[1.02] z-10'
            : 'bg-white border-slate-300 hover:border-slate-500 text-slate-900'
    }`;
}

// Tout ce qu'il faut savoir pour dessiner la case d'une mesure.
function measureCellModel(v, m) {
    const symA = v.symbolHtml(m);
    const previousMeasure = v.flat[m.measureNumber - 2];
    // « % » : la mesure répète exactement la précédente (les deux accords s'il y en a deux)
    const repeat = !!previousMeasure && !v.partLabelOf(m) && v.measureKey(previousMeasure) === v.measureKey(m);
    const showSplit = !!m.split && !repeat;
    const displayChordSymbol = repeat ? '%' : symA;
    const isActive = (m.measureNumber === v.currentMeasureNum);
    const activeHalf = (isActive && showSplit) ? ((v.currentBeat % v.bpb) >= v.splitBeat ? 1 : 0) : -1;
    const scaleShort = (id) => (v.scalesDb[id] && v.scalesDb[id].name.split(' ')[0]) || '';
    const scaleLabel = showSplit ? `${scaleShort(m.scaleId)} · ${scaleShort(m.split.scaleId)}` : scaleShort(m.scaleId);
    const centerHtml = showSplit
        ? `<div class="jam-split my-auto">
                                   <div class="jam-half${activeHalf === 0 ? ' jam-half-active' : ''}" data-half="0"><span class="jam-realbook-chord whitespace-nowrap">${symA}</span></div>
                                   <div class="jam-half${activeHalf === 1 ? ' jam-half-active' : ''}" data-half="1"><span class="jam-realbook-chord whitespace-nowrap">${v.symbolHtml(m.split)}</span></div>
                               </div>`
        : `<div class="jam-realbook-chord my-auto whitespace-nowrap overflow-visible">${displayChordSymbol}</div>`;
    let bottomHtml = '';
    if (v.showHarmonicFunctions) {
        const flatIdx = v.flat.indexOf(m);
        if (showSplit) {
            const fa = v.fnLabel({ rootIndex: m.rootIndex, chordId: m.chordId, harmonicFunction: null, fnLabel: m.fnLabel }, v.flat, flatIdx, 0);
            const fb = v.fnLabel({ rootIndex: m.split.rootIndex, chordId: m.split.chordId, harmonicFunction: null, fnLabel: m.split.fnLabel }, v.flat, flatIdx, 1);
            bottomHtml = `<div class="jam-half-fn jam-fn-label" data-fhalf="0" style="left:30px">${fa}</div><div class="jam-half-fn jam-fn-label" data-fhalf="1" style="right:8px">${fb}</div>`;
        } else {
            bottomHtml = `<div class="jam-cell-bottom jam-fn-label text-[10px] text-right font-normal jam-realbook-chord text-red-500" data-fhalf="0">${v.fnLabel(m, v.flat, flatIdx)}</div>`;
        }
    }
    // Signes de reprise de cette mesure (barres |: et :|, ×N, 1re / 2e fin)
    const stp = v.grid[m.stepIndex];
    const hasRS = !!stp.repeatStart && m.measureInStep === 1;
    const hasRE = !!stp.repeatEnd && m.measureInStep === stp.measures;
    let voltaFirst = false;
    const sv = v.effV[m.stepIndex]; // 1re / 2e fin effective (la 1re fin va jusqu'au :|)
    if (sv) {
        const prevM = v.flat[m.measureNumber - 2];
        voltaFirst = !prevM || v.effV[prevM.stepIndex] !== sv;
    }
    const selected = !!(v.sel && m.measureNumber >= v.sel.from && m.measureNumber <= v.sel.to);
    return {
        measureNumber: m.measureNumber, isActive, repeat, showSplit, activeHalf, scaleLabel, centerHtml, bottomHtml,
        hasRS, hasRE, sv, voltaFirst, repeatEnd: stp.repeatEnd, selected,
        ts3: showSplit && v.bpb === 3, editBarOpen: !!v.editBarOpen
    };
}

// Classes ajoutées à la case en plus de cellClassName.
function cellExtraClasses(c) {
    const out = [];
    if (c.selected) out.push('jam-sel');
    if (c.hasRS) out.push('rp-has-l');
    if (c.hasRE) out.push('rp-has-r');
    if (c.sv) out.push('rp-has-v');
    if (c.ts3) out.push('jam-ts3');
    return out;
}

// Contenu de la case : ligne du haut (n° de mesure, fin, ×N, gamme), accord(s), fonction, boutons d'arpège.
function cellInnerHtml(c) {
    return `
                            <div class="jam-cell-top flex justify-between items-center text-[9px] font-mono ${c.isActive ? 'text-blue-200 font-bold' : 'text-slate-400'}">
                                <span>${c.voltaFirst ? `<b class="rp-vtxt" title="${c.sv === 1 ? '1re' : '2e'} fin">${c.sv}.</b>` : ''}|${c.measureNumber}${c.editBarOpen ? '<span class="jam-edit-btn" role="button" aria-label="Éditer la mesure" title="Éditer cette mesure">✎</span>' : ''}</span>
                                ${(c.hasRE && c.repeatEnd > 2) ? `<span class="rp-xn" title="Reprise jouée ${c.repeatEnd} fois">×${c.repeatEnd}</span>` : ''}
                                <span class="text-[8px] text-emerald-400 font-medium truncate max-w-[60px]">${c.scaleLabel}</span>
                            </div>
                            ${c.centerHtml}
                            ${c.bottomHtml}
                            <span class="jam-arp-btn" role="button" aria-label="Écouter l'arpège" title="Écouter l'arpège">&gt;&gt;</span>
                            ${c.showSplit ? `<span class="jam-arp-btn jam-arp-btn-b" role="button" aria-label="Écouter l'arpège du second accord" title="Écouter l'arpège du second accord">&gt;&gt;</span>` : ''}
                        `;
}

// Barres de reprise et ligne de 1re / 2e fin (le texte « 1. » et « ×N » est dans la ligne du haut).
function cellMarksHtml(c) {
    let marksHtml = '';
    if (c.hasRS) marksHtml += '<span class="rp-l" title="Début de reprise"></span>';
    if (c.hasRE) marksHtml += '<span class="rp-r" title="Fin de reprise"></span>';
    if (c.sv) {
        marksHtml += '<span class="rp-vl"></span>';
        if (c.voltaFirst) marksHtml += '<span class="rp-vt"></span>';
    }
    return marksHtml;
}

// Empreinte de tout ce qui détermine l'aspect des cases de la grille, hors mesure en cours.
function sequenceFingerprint(v, chordSymbol) {
    const sym = v.flat.map(m => chordSymbol(m) + (m.split ? '/' + chordSymbol(m.split) : '')).join(';');
    let fn = '';
    if (v.showHarmonicFunctions) {
        fn = v.flat.map((m, i) => v.fnLabel(m, v.flat, i) + (m.split ? '/' + v.fnLabel(m.split, v.flat, i, 1) : '')).join(';');
    }
    return [JSON.stringify(v.grid), sym, fn, v.mainKey, v.bpb, v.showHarmonicFunctions ? 1 : 0,
        v.editBarOpen ? 1 : 0, v.sel ? v.sel.from + '-' + v.sel.to : ''].join('\u0001');
}

// Repères d'impression d'une mesure : barres de reprise, ×N, 1re / 2e fin. Renvoie { cls, html }.
function printMarks(grid, effV, m, flat) {
    const st = grid[m.stepIndex];
    const dots = '<svg viewBox="0 0 6 24" width="6pt" height="24pt" aria-hidden="true"><circle cx="3" cy="8" r="2" fill="#000"/><circle cx="3" cy="16" r="2" fill="#000"/></svg>';
    let cls = '', html = '';
    if (st.repeatStart && m.measureInStep === 1) {
        cls += ' has-rs';
        html += `<span class="jam-print-rs"><i class="b1"></i><i class="b2"></i>${dots}</span>`;
    }
    if (st.repeatEnd && m.measureInStep === st.measures) {
        cls += ' has-re';
        html += `<span class="jam-print-re"><i class="b1"></i><i class="b2"></i>${dots}</span>`;
        if (st.repeatEnd > 2) html += `<span class="jam-print-times">×${st.repeatEnd}</span>`;
    }
    const sv = effV[m.stepIndex];
    if (sv) {
        const prev = flat[m.measureNumber - 2];
        const first = !prev || effV[prev.stepIndex] !== sv;
        html += '<span class="jam-print-vo"></span>';
        if (first) html += `<span class="jam-print-vt"></span><span class="jam-print-vl">${sv}.</span>`;
    }
    return { cls, html };
}

// HTML de la page d'impression de la grille. Les symboles sont posés ensuite via data-symbol (texte, pas HTML).
// v : grid, flat, effV, bpb, partLabelOf, measureKey, chordSymbol(chord) (texte).
function printGridHtml(v) {
    const systems = layoutRows(v.flat, v.partLabelOf);
    const hasParts = v.flat.some(m => !!v.partLabelOf(m));
    let rowsHtml = '';
    systems.forEach((systemMeasures) => {
        let cellsHtml = '';
        systemMeasures.forEach((m) => {
            const previousMeasure = v.flat[m.measureNumber - 2];
            const repeat = !!previousMeasure && !v.partLabelOf(m) && v.measureKey(previousMeasure) === v.measureKey(m);
            const pm = printMarks(v.grid, v.effV, m, v.flat);
            if (m.split && !repeat) {
                cellsHtml += `<div class="jam-print-cell${pm.cls}"><div class="jam-print-split${v.bpb === 3 ? ' jam-print-split-3' : ''}"><span class="jam-print-chord" data-symbol="${encodeURIComponent(v.chordSymbol(m))}"></span><span class="jam-print-chord" data-symbol="${encodeURIComponent(v.chordSymbol(m.split))}"></span></div>${pm.html}</div>`;
            } else {
                const displayChordSymbol = repeat ? '%' : v.chordSymbol(m);
                cellsHtml += `<div class="jam-print-cell${pm.cls}"><span class="jam-print-chord" data-symbol="${encodeURIComponent(displayChordSymbol)}"></span>${pm.html}</div>`;
            }
        });
        for (let k = systemMeasures.length; k < 4; k++) {
            cellsHtml += `<div class="jam-print-cell jam-print-cell-empty"></div>`;
        }
        const rowPart = v.partLabelOf(systemMeasures[0]);
        const gutterHtml = hasParts ? `<div class="jam-print-gutter">${rowPart ? `<span class="jam-print-part${rowPart.length > 1 ? ' jam-part-long' : ''}${rowPart.length > 2 ? ' jam-part-l3' : ''}">${rowPart}</span>` : ''}</div>` : '';
        rowsHtml += `<div class="jam-print-row">${gutterHtml}${cellsHtml}</div>`;
    });
    return `
                    <div class="jam-print-title"></div>
                    <div class="jam-print-grid${hasParts ? ' has-parts' : ''}">${rowsHtml}</div>
                `;
}

// ---- Position, sélection et défilement de la grille ----

// Numéro (à partir de 1) de la mesure en cours de lecture ; 1 si aucun bloc n'est en cours.
function currentMeasureNumber(grid, currentStepIndex, currentBeat, bpb) {
    if (!(currentStepIndex >= 0 && currentStepIndex < grid.length)) return 1;
    let count = 0;
    for (let i = 0; i < currentStepIndex; i++) count += grid[i].measures;
    return count + Math.floor(currentBeat / bpb) + 1;
}

// La grille a raccourci : que faire de la sélection { from, to } et de l'ancre ? Renvoie
// { clearSel (sélection entièrement hors grille), newTo (fin ramenée à la dernière mesure, ou null), clearAnchor }.
function selectionFix(sel, anchor, total) {
    const fix = { clearSel: false, newTo: null, clearAnchor: false };
    if (sel && sel.from > total) fix.clearSel = true;
    else if (sel && sel.to > total) fix.newTo = total;
    if (anchor && anchor > total) fix.clearAnchor = true;
    return fix;
}

// Repère de partie dans la gouttière d'une ligne (lettre encadrée), ou null si la ligne n'ouvre pas de partie.
function gutterMark(rowPart) {
    if (!rowPart) return null;
    return {
        className: 'jam-part-mark' + (rowPart.length > 1 ? ' jam-part-long' : '') + (rowPart.length > 2 ? ' jam-part-l3' : ''),
        text: rowPart,
        title: rowPart === 'in' ? 'Introduction' : rowPart === 'out' ? 'Conclusion (outro)' : `Partie ${rowPart}`,
    };
}

// Cases à ajouter pour compléter une ligne de 4 mesures : 'gap' (fin de partie, la suivante commence à la ligne),
// 'add' (bouton « + » en dernière ligne, en mode édition à l'arrêt) ou 'empty' (case vide en pointillés).
function rowFillers(count, rowIndex, rowCount, canAdd) {
    const out = [];
    for (let k = count; k < 4; k++) {
        if (rowIndex < rowCount - 1) out.push('gap');
        else if (k === count && rowIndex === rowCount - 1 && canAdd) out.push('add');
        else out.push('empty');
    }
    return out;
}

// Faut-il une ligne de plus pour le bouton « + » (dernière ligne pleine) ?
function needsAddRow(canAdd, lastRowLength) {
    return !!canAdd && lastRowLength === 4;
}

// Position de lecture après un clic sur la mesure m (moitié cliquée : 0 ou 1).
function clickPosition(m, half, bpb, splitBeat) {
    return { stepIndex: m.stepIndex, beat: (m.measureInStep - 1) * bpb + (half === 1 ? splitBeat : 0) };
}

// Pendant la lecture, un clic hors de la plage jouée l'abandonne.
function playRangeAfterClick(range, measureNumber) {
    return range && (measureNumber < range.from || measureNumber > range.to) ? null : range;
}

// Moitié à surligner dans une case à deux accords : -1 si la case n'est pas la mesure en cours, sinon 0 ou 1.
function halfToHighlight(isCurrentMeasure, currentBeat, bpb, splitBeat) {
    return isCurrentMeasure ? ((currentBeat % bpb) >= splitBeat ? 1 : 0) : -1;
}

// Défilement de la grille pendant la lecture : la ligne de l'accord en cours doit rester entièrement visible.
// Renvoie la nouvelle position de défilement, ou null si la ligne est déjà visible.
function scrollTargetFor(containerTop, clientHeight, rowTop, rowHeight) {
    const rowBottom = rowTop + rowHeight;
    const above = rowTop < containerTop;
    const below = rowBottom > containerTop + clientHeight;
    if (!above && !below) return null;
    return Math.max(0, above ? rowTop : rowBottom - clientHeight);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        layoutRows, cellClassName, measureCellModel, cellExtraClasses, cellInnerHtml, cellMarksHtml, sequenceFingerprint, printMarks, printGridHtml,
        currentMeasureNumber, selectionFix, gutterMark, rowFillers, needsAddRow, clickPosition, playRangeAfterClick, halfToHighlight, scrollTargetFor,
    };
}
