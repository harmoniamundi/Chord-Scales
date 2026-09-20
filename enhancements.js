(() => {
    'use strict';

    const SCALE_STEP_MS = 350;
    const SCALE_END_PADDING_MS = 350;

    function stopScalePlayback(app, scaleKey) {
        const playback = app.activePlaybacks[scaleKey];
        if (!playback) return;

        playback.timers.forEach(clearTimeout);
        delete app.activePlaybacks[scaleKey];

        document
            .querySelectorAll(`[data-scale-key="${CSS.escape(scaleKey)}"]`)
            .forEach(element => element.classList.remove('ring-2', 'ring-blue-500'));
    }

    function stopAllSounds(app) {
        app.activeAudioNodes.forEach(node => {
            if (node && typeof node.stop === 'function') {
                try { node.stop(); } catch (_) { /* already stopped */ }
            }
        });
        app.activeAudioNodes = [];

        Object.keys(app.activePlaybacks).forEach(scaleKey => {
            stopScalePlayback(app, scaleKey);
        });
    }

    function getScaleIntervals(app, intervals, scaleKey) {
        const values = [...intervals, 12];
        return app.scaleDirections[scaleKey] ? values.reverse() : values;
    }

    function installScalePlayback(app) {
        app.stopAllSounds = () => stopAllSounds(app);

        app.toggleScalePlayback = async (scaleKey, intervals, scaleName, element) => {
            const existing = app.activePlaybacks[scaleKey];
            if (existing) {
                stopScalePlayback(app, scaleKey);
                return;
            }

            const piano = await app.loadPiano();
            if (!piano) return;

            if (app.audioCtx?.state === 'suspended') {
                await app.audioCtx.resume().catch(() => {});
            }

            const orderedIntervals = getScaleIntervals(app, intervals, scaleKey);
            const playback = { timers: [] };
            app.activePlaybacks[scaleKey] = playback;

            const target = element || document.querySelector(`[data-scale-key="${CSS.escape(scaleKey)}"]`);
            target?.classList.add('ring-2', 'ring-blue-500');

            orderedIntervals.forEach((interval, index) => {
                const timer = setTimeout(() => {
                    if (!app.activePlaybacks[scaleKey]) return;

                    const noteName = app.getAudioNoteName(app.selectedRootIndex, interval, 3);
                    try {
                        const node = piano.play(noteName, app.audioCtx.currentTime, {
                            duration: Math.max(0.8, SCALE_STEP_MS / 1000 + 0.15),
                            destination: app.reverbInput
                        });
                        app.activeAudioNodes.push(node);
                    } catch (error) {
                        console.error('Erreur de lecture de gamme:', error);
                    }
                }, index * SCALE_STEP_MS);
                playback.timers.push(timer);
            });

            const endTimer = setTimeout(() => stopScalePlayback(app, scaleKey),
                orderedIntervals.length * SCALE_STEP_MS + SCALE_END_PADDING_MS);
            playback.timers.push(endTimer);
        };
    }

    function bindDynamicScaleControls(app) {
        const container = document.getElementById('scales-container');
        if (!container || container.dataset.enhancementsBound === 'true') return;
        container.dataset.enhancementsBound = 'true';

        container.addEventListener('click', event => {
            const noteButton = event.target.closest('.note-badge');
            if (noteButton) {
                event.stopPropagation();
                const interval = Number(noteButton.dataset.interval);
                if (Number.isFinite(interval)) app.playSingleNote(interval);
                return;
            }

            const visual = event.target.closest('.staff-visual');
            if (visual) {
                const scaleKey = visual.dataset.scaleKey;
                const index = [...container.querySelectorAll('[data-scale-key]')]
                    .findIndex(element => element === visual);
                const card = visual.closest('.scale-card');
                const scale = card?.dataset.scaleIntervals;
                if (scaleKey && scale) {
                    app.toggleScalePlayback(scaleKey, JSON.parse(scale), '', visual);
                }
            }
        });

        container.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const visual = event.target.closest('.staff-visual');
            if (!visual) return;
            event.preventDefault();
            visual.click();
        });
    }

    function patchRendering(app) {
        const originalRenderScales = app.renderScales.bind(app);
        app.renderScales = (chord, root) => {
            originalRenderScales(chord, root);

            document.querySelectorAll('#scales-container .scale-card').forEach((card, index) => {
                const item = chord.scales[index];
                const scale = item && scaleDb[item.id];
                if (scale) card.dataset.scaleIntervals = JSON.stringify(scale.intervals);
            });
        };
    }

    function install(app) {
        if (!app || app.__scaleEnhancementsInstalled) return;
        app.__scaleEnhancementsInstalled = true;
        installScalePlayback(app);
        patchRendering(app);
        bindDynamicScaleControls(app);
    }

    const waitForApp = () => {
        if (window.app) {
            install(window.app);
            return;
        }
        window.setTimeout(waitForApp, 25);
    };

    waitForApp();
})();
