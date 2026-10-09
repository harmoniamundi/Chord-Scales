// band/phrase-plan.js — choix faits une fois par phrase de la bande (motif de piano, reprise / variation, tour de phrase,
// motifs de basse, voicing, densité, fills) et extras propres à chaque orchestre. Sans DOM.
//   buildBandPhrase(ctx, index, style, prev)
//     ctx = { lib, bpb, ternary, bpm, isCuba, groove, rng }
//       lib      bibliothèque de motifs (patternLib) pour la signature et le style
//       bpb      nombre de temps par mesure ; ternary : mesure composée
//       bpm, isCuba, groove   réglages lus par les extras latin / classique / brass / piazzolla
//       rng      générateur pseudo-aléatoire de la phrase (makeVariationRng(seedBase + index * 7919 + 1, style))
//     prev      phrase précédente (ou null) : sert à enchaîner motif et extras
// Chargé par index.html via <script src="band/phrase-plan.js"> (après les modules de plan) et testé par band/phrase-plan.test.js.

if (typeof pickWeighted === 'undefined' && typeof require === 'function') {
    var { pickWeighted } = require('./band-helpers.js');
}
if (typeof varyCell === 'undefined' && typeof require === 'function') {
    var { varyCell } = require('./swing-plan.js');
}
if (typeof popPhraseExtras === 'undefined' && typeof require === 'function') { var { popPhraseExtras } = require('./pop-plan.js'); }
if (typeof latinPhraseExtras === 'undefined' && typeof require === 'function') { var { latinPhraseExtras } = require('./latin-plan.js'); }
if (typeof classicPhraseExtras === 'undefined' && typeof require === 'function') { var { classicPhraseExtras } = require('./classic-plan.js'); }
if (typeof brassPhraseExtras === 'undefined' && typeof require === 'function') { var { brassPhraseExtras } = require('./brass-plan.js'); }
if (typeof balkanPhraseExtras === 'undefined' && typeof require === 'function') { var { balkanPhraseExtras } = require('./balkan-plan.js'); }
if (typeof piazzollaPhraseExtras === 'undefined' && typeof require === 'function') { var { piazzollaPhraseExtras } = require('./piazzolla-plan.js'); }
if (typeof ternaryPhraseExtras === 'undefined' && typeof require === 'function') { var { ternaryPhraseExtras } = require('./ternary-plan.js'); }
if (typeof meterPhraseExtras === 'undefined' && typeof require === 'function') { var { meterPhraseExtras } = require('./meter-plan.js'); }

function buildBandPhrase(ctx, index, style, prev) {
    const { lib, bpb, rng } = ctx;
    const maxPos = bpb - 0.5; // dernière croche de la mesure : bornes des variations de cellule
    // Une phrase sur trois environ reprend le motif de la précédente (effet "question / réponse")
    const keep = !!(prev && prev.style === style && rng() < 0.35);
    const motif = keep ? prev.motif : pickWeighted(lib.piano, rng).hits;
    const phrase = {
        index, style, rng,
        motif,
        second: rng() < 0.5 ? motif : varyCell(motif, rng, maxPos),
        varied: varyCell(motif, rng, maxPos),
        turn: pickWeighted(lib.turn, rng).hits,
        bassMotif: lib.bass ? ((keep && prev.bassMotif) || pickWeighted(lib.bass, rng).hits) : null,
        bassAlt: lib.bass ? pickWeighted(lib.bass, rng).hits : null,
        bassTurn: lib.bassTurn ? pickWeighted(lib.bassTurn, rng).hits : null,
        voicing: rng() < lib.rootlessProb ? 'rootless' : 'closed',
        density: 0.4 + rng() * 0.55,
        feather: rng() < 0.65,
        kickPattern: lib.kicks ? lib.kicks[Math.floor(rng() * lib.kicks.length)] : null,
        hat16: rng() < 0.3,
        fill: rng() < lib.fillProb,
        fillKind: Math.floor(rng() * 2)
    };
    if (style === 'pop') Object.assign(phrase, popPhraseExtras(rng, prev, index));
    else if (style === 'latin') Object.assign(phrase, latinPhraseExtras({ isCuba: ctx.isCuba, bpm: ctx.bpm, groove: ctx.groove }, rng, prev, index));
    else if (style === 'classic') Object.assign(phrase, classicPhraseExtras(ctx.bpm, rng, prev, index));
    else if (style === 'brass') Object.assign(phrase, brassPhraseExtras({ groove: ctx.groove }, rng, prev, index));
    else if (style === 'balkan') Object.assign(phrase, balkanPhraseExtras(rng, prev, index));
    else if (style === 'piazzolla') Object.assign(phrase, piazzollaPhraseExtras({ groove: ctx.groove }, rng, prev, index));
    if (ctx.ternary) phrase.mx = ternaryPhraseExtras(bpb, style, lib, phrase, rng);
    else if (bpb !== 4) phrase.mx = meterPhraseExtras(bpb, style, lib, phrase, rng);
    return phrase;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildBandPhrase };
}
