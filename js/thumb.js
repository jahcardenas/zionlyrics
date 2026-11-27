/**
 * thumb.js — Extracción de frames de video como thumbnails
 *
 * Uso:
 *   const blobUrl = await VideoThumb.extractUrl('media/clip.mp4');
 *   <img src={blobUrl}>
 *
 * Diseñado para videos locales (blob: URLs o paths relativos en Electron).
 * Funciona con cualquier formato que el motor Chromium de Electron soporte.
 */
(function () {
    'use strict';

    /**
     * Extrae un frame de un video y devuelve un Blob (image/jpeg).
     *
     * @param {string} src            - URL del video (blob:, media/..., file://)
     * @param {object} opts
     * @param {number} [opts.time]    - segundo exacto. Si se omite, se elige aleatorio
     *                                  entre [minTime, maxTime].
     * @param {number} [opts.minTime] - default: 10% de la duración
     * @param {number} [opts.maxTime] - default: 90% de la duración
     * @param {number} [opts.quality] - default: 0.85 (JPEG)
     * @returns {Promise<Blob>}
     */
    async function extract(src, opts = {}) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;

            const cleanup = () => {
                video.removeAttribute('src');
                video.load();
            };

            video.onloadedmetadata = () => {
                const duration = video.duration;
                if (!isFinite(duration) || duration <= 0) {
                    cleanup();
                    reject(new Error('Invalid video duration'));
                    return;
                }

                let target;
                if (typeof opts.time === 'number') {
                    target = opts.time;
                } else {
                    const minT = typeof opts.minTime === 'number' ? opts.minTime : duration * 0.10;
                    const maxT = typeof opts.maxTime === 'number' ? opts.maxTime : duration * 0.90;
                    target = minT + Math.random() * (maxT - minT);
                }

                video.currentTime = Math.min(target, Math.max(0, duration - 0.05));
            };

            video.onseeked = () => {
                try {
                    const w = video.videoWidth;
                    const h = video.videoHeight;
                    if (!w || !h) {
                        cleanup();
                        reject(new Error('Video has no dimensions'));
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, w, h);

                    canvas.toBlob(blob => {
                        cleanup();
                        if (!blob) {
                            reject(new Error('Failed to encode thumbnail'));
                            return;
                        }
                        resolve(blob);
                    }, 'image/jpeg', opts.quality ?? 0.85);
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };

            video.onerror = () => {
                cleanup();
                reject(new Error('Failed to load video: ' + src));
            };

            video.src = src;
        });
    }

    /**
     * Igual que extract(), pero devuelve directamente un object URL listo
     * para asignar a un <img>. El caller es responsable de revocarlo con
     * URL.revokeObjectURL cuando ya no se use.
     */
    async function extractUrl(src, opts = {}) {
        const blob = await extract(src, opts);
        return URL.createObjectURL(blob);
    }

    window.VideoThumb = { extract, extractUrl };
})();