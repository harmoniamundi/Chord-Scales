// grid/transport.js — la « mécanique » de la lecture de la Jam, sans horloge, sans audio, sans DOM :
// grille de temps en secondes audio, intro, où se trouve-t-on après un temps (suite du bloc, nouveau bloc, fin de plage,
// retour au début, arrêt) et ce que l'affichage doit faire à ce temps. Le moteur (JamEngine.tick) programme le son et
// l'affichage, applique la position calculée ici et arme le tick suivant.
// Chargé par index.html via <script src="grid/transport.js"> et testé par grid/transport.test.js.
//
// Position de lecture : { currentStepIndex, currentBeat, activeSlot }
//   currentStepIndex   bloc de la grille en cours       currentBeat   temps dans ce bloc (0 = 1er temps de sa 1re mesure)
//   activeSlot         créneau (0 ou 1) occupé par la gamme active, inversé à chaque nouveau bloc

// Grille de temps : instant audio du temps à programmer (le premier temps part après firstLead, un retard de plus d'un
// temps recale sur lead) et instant du temps suivant.
function beatClock({ beatAudio, now, intervalSec, firstLead, lead }) {
    let t = beatAudio;
    if (t == null) t = now + firstLead;
    else if (t < now - intervalSec) t = now + lead;
    return { t, next: t + intervalSec };
}

// Délai (ms) avant le prochain tick : il part « lead » secondes avant son temps, sans jamais dépasser 90 % d'un temps.
function nextTickDelayMs({ beatAudio, now, lead, intervalSec }) {
    const target = beatAudio - Math.min(lead, 0.9 * intervalSec);
    return Math.max(0, (target - now) * 1000);
}

// Temps d'intro (métronome seul) : numéro 0..bpb-1 du temps, accent sur le premier, texte du compteur.
function countInBeat(countInBeats, bpb) {
    const n = bpb - countInBeats;
    return { n, accent: n === 0, label: `Intro : ${n + 1}/${bpb}` };
}

// Ce que l'affichage fait au temps `beat` (numéroté depuis le début du bloc) : redessiner à chaque nouvelle mesure,
// mettre à jour la moitié de mesure au temps de l'autre accord, et le compteur de mesure.
function beatDisplayPlan({ beat, bpb, measures, isSplitStep, splitBeat }) {
    const inBar = beat % bpb;
    return {
        newMeasure: inBar === 0,
        splitHalf: inBar !== 0 && !!isSplitStep && inBar === splitBeat,
        counter: `Mesure : ${Math.floor(beat / bpb) + 1}/${measures}`,
    };
}

// Position après avoir joué le temps `beat` du bloc `stepIdx`.
//   p = { stepIdx, beat, bpb, totalBeatsInStep, activeSlot, playRange ({from,to} ou null), loopEnabled,
//         nav: { stepSpan(idx) → {first}, nextStepInfo(idx, commit) → {idx, wrapped}, stepOfMeasure(n) → {idx, measureInStep} } }
// Renvoie { kind, currentStepIndex, currentBeat, activeSlot, resetPasses } où kind vaut :
//   'continue'   on reste dans le bloc (ou la position avancée d'un temps)
//   'next-step'  nouveau bloc (le créneau actif est inversé)
//   'range-loop' fin de la plage sélectionnée avec boucle : retour à son début (resetPasses : oublier les passages de reprise)
//   'stop'       fin de la plage ou de la grille sans boucle : le dernier temps sonne, puis la jam s'arrête
// nav.nextStepInfo(idx, true) mémorise le passage (reprises) : il n'est appelé qu'aux fins de bloc, comme avant.
function advanceAfterBeat(p) {
    const { stepIdx, beat, bpb, nav } = p;
    const currentBeat = beat + 1;
    const stay = { kind: 'continue', currentStepIndex: stepIdx, currentBeat, activeSlot: p.activeSlot, resetPasses: false };

    // Lecture d'une plage sélectionnée : fin de plage = arrêt, ou retour à son début si la boucle est activée.
    const rg = p.playRange;
    let forwardIdx = null;
    if (rg && beat % bpb === bpb - 1) {
        const finished = nav.stepSpan(stepIdx).first + Math.floor(beat / bpb); // mesure qui vient de se terminer
        const stepEnds = currentBeat >= p.totalBeatsInStep;
        let rangeEnd = false;
        if (!stepEnds) {
            rangeEnd = finished >= rg.to;
        } else {
            const pk = nav.nextStepInfo(stepIdx, false);
            const nm = nav.stepSpan(pk.idx).first;
            if (!pk.wrapped && nm >= rg.from && nm <= rg.to) {
                // suite normale (y compris une reprise qui renvoie à l'intérieur de la plage)
            } else if (finished + 1 <= rg.to) {
                forwardIdx = stepIdx + 1; // un saut qui quitterait la plage est ignoré
            } else {
                rangeEnd = true;
            }
        }
        if (rangeEnd) {
            if (!p.loopEnabled) return { ...stay, kind: 'stop' };
            const st = nav.stepOfMeasure(rg.from);
            return {
                kind: 'range-loop', currentStepIndex: st.idx, currentBeat: (st.measureInStep - 1) * bpb,
                activeSlot: 1 - p.activeSlot, resetPasses: true,
            };
        }
    }

    if (currentBeat >= p.totalBeatsInStep) {
        const nx = forwardIdx !== null ? { idx: forwardIdx, wrapped: false } : nav.nextStepInfo(stepIdx, true);
        if (nx.wrapped && !p.loopEnabled) return { ...stay, kind: 'stop' };
        return { kind: 'next-step', currentStepIndex: nx.idx, currentBeat: 0, activeSlot: 1 - p.activeSlot, resetPasses: false };
    }

    return stay;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { beatClock, nextTickDelayMs, countInBeat, beatDisplayPlan, advanceAfterBeat };
}
