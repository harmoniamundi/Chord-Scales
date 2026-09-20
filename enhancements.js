(() => {
    'use strict';

    const SCALE_STEP_MS = 350;
    const SCALE_END_PADDING_MS = 350;

    function escapeSelector(value) {
        return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(value)
            : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function getScaleElement(scaleKey) {
        return document.querySelector(`[data-scale-key="${escapeSelector(scaleKey)}"]`);
    }

    function stopScalePlayback(app, scaleKey) {
        const playback = app.activePlaybacks[scaleKey];
        if (!playback) return;

        playback.timers.forEach(clearTimeout);
        delete app.activePlaybacks[scaleKey];

        document
            .querySelectorAll(`[data-scale-key="${escapeSelector(scaleKey)}"]`)
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

        app.toggleScalePlayback = async (scaleKey, intervals, _scaleName, element) => {
            if (app.activePlaybacks[scaleKey]) {
                stopScalePlayback(app, scaleKey);
                return;
            }

            // Stop other scale playbacks before starting a new one.
            Object.keys(app.activePlaybacks).forEach(activeKey => {
                if (activeKey !== scaleKey) stopScalePlayback(app, activeKey);
            });

            const piano = await app.loadPiano();
            if (!piano) return;

            if (app.audioCtx?.state === 'suspended') {
                await app.audioCtx.resume().catch(() => {});
            }

            const orderedIntervals = getScaleIntervals(app, intervals, scaleKey);
            const playback = { timers: [] };
            app.activePlaybacks[scaleKey] = playback;

            const target = element || getScaleElement(scaleKey);
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
                        if (node) app.activeAudioNodes.push(node);
                    } catch (error) {
                        console.error('Erreur de lecture de gamme:', error);
                    }
                }, index * SCALE_STEP_MS);
                playback.timers.push(timer);
            });

            playback.timers.push(setTimeout(
                () => stopScalePlayback(app, scaleKey),
                orderedIntervals.length * SCALE_STEP_MS + SCALE_END_PADDING_MS
            ));
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
            if (!visual) return;

            const scaleKey = visual.dataset.scaleKey;
            const card = visual.closest('.scale-card');
            const encodedIntervals = card?.dataset.scaleIntervals;
            if (!scaleKey || !encodedIntervals) return;

            try {
                app.toggleScalePlayback(scaleKey, JSON.parse(encodedIntervals), '', visual);
            } catch (error) {
                console.error('Impossible de lire cette gamme:', error);
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
        if (app.__scaleRenderPatched) return;
        app.__scaleRenderPatched = true;

        const originalRenderScales = app.renderScales.bind(app);
        app.renderScales = (chord, root) => {
            originalRenderScales(chord, root);

            const scaleDatabase = window.scaleDb;
            document.querySelectorAll('#scales-container .scale-card').forEach((card, index) => {
                const item = chord.scales?.[index];
                const scale = item && scaleDatabase?.[item.id];
                if (scale) {
                    card.dataset.scaleIntervals = JSON.stringify(scale.intervals);
                }
            });
        };

        // The first render happens in the app constructor, before this module
        // observes the application. Re-render once so existing cards receive metadata.
        const chord = app.getCurrentChordObj?.();
        const root = window.rootLabels?.[app.selectedRootIndex];
        if (chord && root) app.renderScales(chord, root);
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
