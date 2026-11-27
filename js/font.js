
(function () {
    'use strict';

    const FONT_KEYS = [
        'coroFont', 
        'refFont', 
        'verseFont', 
        'versionFont',
        'marqueeFont', 
        'sermonFont', 
        'wordy1Font',
        'wordy2Font',
        'wordy3Font'
    ];

    function getSystemSans() {
        const p = navigator.userAgentData?.platform || navigator.platform || '';
        if (/mac/i.test(p))   return "-apple-system, 'Helvetica Neue', sans-serif";
        if (/win/i.test(p))   return "'Segoe UI', sans-serif";
        if (/linux/i.test(p)) return "Ubuntu, Cantarell, 'DejaVu Sans', sans-serif";
        return 'system-ui, sans-serif';
    }

    function humanizeFamily(raw) {
        return raw
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // EBGaramond → EB Garamond
            .replace(/([a-z])([A-Z])/g, '$1 $2')        // SourceSans → Source Sans
            .replace(/([a-zA-Z])(\d)/g, '$1 $2')        // Source Sans3 → Source Sans 3
            .replace(/\s+/g, ' ')
            .trim();
    }

    function deriveFontFamily(fileName) {
        const raw = fileName
            .replace(/\.(ttf|otf|woff2?)$/i, '')
            .replace(/[-_]?(VariableFont[\w,]*|VF|Upright|Italic|Regular|Bold|Light|Medium|Semibold|Black|Thin|ExtraLight|ExtraBold)$/gi, '')
            .replace(/[-_,]+$/, '')
            .trim();
        return humanizeFamily(raw);
    }

    function normalizeFamily(name) {
        if (!name) return '';
        return String(name).toLowerCase().replace(/[\s\-_]+/g, '');
    }

    function detectFontType(family) {
        return /serif|garamond|georgia|times|playfair|merriweather|lora|crimson|baskerville|didot|bodoni|slab/i.test(family)
            ? 'serif' : 'sans';
    }

    async function scan() {
        const r = await window.electronAPI.loadFile('fonts');
        if (!r.success || !r.isDirectory) {
            debugLog('FONTS', `Failed to scan fonts: ${r.error || 'not a directory'}`);
            return [];
        }

        const byFamily = new Map();
        for (const f of r.contents) {
            if (!/\.(ttf|otf|woff2?)$/i.test(f.fileName)) continue;
            const family = deriveFontFamily(f.fileName);
            if (!family) continue;

            const isItalic = /italic|oblique/i.test(f.fileName);
            const isBold = /bold|black|heavy/i.test(f.fileName);
            const isLight = /light|thin/i.test(f.fileName);
            const isRegular = !isItalic && !isBold && !isLight;

            if (!byFamily.has(family)) {
                byFamily.set(family, {
                    family,
                    file: f.fileName,
                    type: detectFontType(family),
                    hasRegular: isRegular
                });
            } else {
                const current = byFamily.get(family);
                // Si encontramos un archivo "Regular" y el actual no lo es, lo preferimos
                if (isRegular && !current.hasRegular) {
                    current.file = f.fileName;
                    current.hasRegular = true;
                }
            }
        }
        return Array.from(byFamily.values());
    }

    async function registerAll(fonts) {
        for (const entry of fonts) {
            const fileResult = await window.electronAPI.loadFile(`fonts/${entry.file}`);
            if (!fileResult.success || fileResult.isDirectory) continue;

            const isVariable = /variable|vf/i.test(entry.file);
            const weight = isVariable ? '100 900' : '400';
            
            // Detectar el estilo para que el navegador sepa cómo renderizarla si se necesita
            const style = /italic|oblique/i.test(entry.file) ? 'italic' : 'normal';

            try {
                const font = new FontFace(entry.family, fileResult.data, { weight, style });
                await font.load();
                document.fonts.add(font);
            } catch (err) {
                debugLog('FONTS', `Failed to register "${entry.family}": ${err.message}`);
            }
        }
    }

    function resolve(savedValue) {
        const available = (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.availableFonts) || [];
        const target = savedValue || (typeof zionLyricsObj !== 'undefined' ? zionLyricsObj.defaultFont : null);

        if (!target) return null; // Si no hay fuente asignada, que el CSS decida (var(--font-content))

        if (target) {
            const entry = available.find(f => f.family === target);
            if (entry) {
                const fallback = entry.type === 'serif' ? 'serif' : 'sans-serif';
                return `'${entry.family}', ${fallback}`;
            }
        }

        const firstSans = available.find(f => f.type === 'sans');
        if (firstSans) {
            return `'${firstSans.family}', sans-serif`;
        }

        return getSystemSans();
    }

    function buildDynamicStack() {
        const available = (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.availableFonts) || [];
        const families = available.map(f => `"${f.family}"`).join(', ');
        
        // Prioridades base + las fuentes instaladas en la carpeta
        const baseFallbacks = `"Inter", "Roboto", "Soto Sans", "Noto Sans", sans-serif`;
        return families ? `${families}, ${baseFallbacks}` : baseFallbacks;
    }

    function applyFontVariables() {
        const stack = buildDynamicStack();
        const type = (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.typography) || {};
        
        const uiVal = (type.uiFont && type.uiFont !== 'auto') ? `"${type.uiFont}", ${stack}` : stack;
        const contentVal = (type.defaultContentFont && type.defaultContentFont !== 'auto') ? `"${type.defaultContentFont}", ${stack}` : stack;

        document.documentElement.style.setProperty('--font-ui', uiVal);
        document.documentElement.style.setProperty('--font-content', contentVal);
    }

    function resolveContentFont(bibleAbbrev, bibleLang, explicitStyleFont) {
        const type = (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.typography) || {};
        const stack = buildDynamicStack();

        // 1. Si el usuario forzó una fuente en el Stage Editor para este texto
        if (explicitStyleFont) return `"${explicitStyleFont}", ${stack}`;

        // 2. Override por Biblia específica
        if (bibleAbbrev && type.bibleFonts && type.bibleFonts[bibleAbbrev] && type.bibleFonts[bibleAbbrev] !== 'auto') {
            return `"${type.bibleFonts[bibleAbbrev]}", ${stack}`;
        }

        // 3. Fuente asignada al Idioma de la biblia
        if (bibleLang && type.languageFonts && type.languageFonts[bibleLang]) {
            return `"${type.languageFonts[bibleLang]}", ${stack}`;
        }

        // 4. Fallback general
        return `var(--font-content)`;
    }

    async function reconcile() {
        const scanned = await scan();
        const scannedFamilies = new Set(scanned.map(f => normalizeFamily(f.family)));
        const existing = (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.availableFonts) || [];

        // Fuentes registradas antes que ya no están en disco (comparación normalizada)
        const removedFamilies = existing
            .filter(f => !scannedFamilies.has(normalizeFamily(f.family)))
            .map(f => f.family);

        // Fuentes referenciadas en contentStyles que no están en disco
        const orphanRefs = new Set();
        if (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.displays) {
            Object.values(zionLyricsObj.displays).forEach(entry => {
                const styles = entry.contentStyles;
                if (!styles) return;
                FONT_KEYS.forEach(k => {
                    const v = styles[k];
                    if (v && !scannedFamilies.has(normalizeFamily(v))) {
                        orphanRefs.add(v);
                        styles[k] = '';
                    } else if (v) {
                        // Normalizar el valor al nombre canónico del scanner
                        const match = scanned.find(f => normalizeFamily(f.family) === normalizeFamily(v));
                        if (match && match.family !== v) {
                            styles[k] = match.family;
                        }
                    }
                });
            });
        }

        // defaultFont
        let defaultReassigned = false;
        let oldDefault = null;
        if (typeof zionLyricsObj !== 'undefined' && zionLyricsObj.defaultFont) {
            const canonical = scanned.find(f => normalizeFamily(f.family) === normalizeFamily(zionLyricsObj.defaultFont));
            if (!canonical) {
                oldDefault = zionLyricsObj.defaultFont;
                const firstSans = scanned.find(f => f.type === 'sans');
                zionLyricsObj.defaultFont = firstSans ? firstSans.family : null;
                defaultReassigned = true;
            } else if (canonical.family !== zionLyricsObj.defaultFont) {
                zionLyricsObj.defaultFont = canonical.family;
                defaultReassigned = true;
            }
        }

        if (typeof zionLyricsObj !== 'undefined') {
            zionLyricsObj.availableFonts = scanned;
        }

        const allMissing = new Set([...removedFamilies, ...orphanRefs]);
        if (oldDefault) allMissing.add(oldDefault);

        if (
            scanned.length !== existing.length ||
            defaultReassigned ||
            orphanRefs.size > 0 ||
            removedFamilies.length > 0
        ) {
            if (typeof saveZionLyricsObj === 'function') {
                await saveZionLyricsObj();
            }
        }

        if (allMissing.size > 0) {
            customAlert(setLang('str287').replace('{list}', [...allMissing].join(', ')));
        }

        await registerAll(scanned);
    }

    function migrateLegacyValues() {
        if (typeof zionLyricsObj === 'undefined' || !zionLyricsObj.displays) return false;
        let changed = false;

        Object.values(zionLyricsObj.displays).forEach(entry => {
            const styles = entry.contentStyles;
            if (!styles) return;
            FONT_KEYS.forEach(k => {
                const v = styles[k];
                if (v && v.includes(',')) {
                    const m = v.match(/^['"]?([^'",]+)['"]?/);
                    if (m) {
                        styles[k] = m[1].trim();
                        changed = true;
                    }
                }
            });
        });

        return changed;
    }

    window.Fonts = {
        scan,
        registerAll,
        resolve,
        reconcile,
        migrateLegacyValues,
        getSystemSans,
        deriveFontFamily,
        humanizeFamily,
        normalizeFamily,
        detectFontType,
        applyFontVariables,
        resolveContentFont,
        FONT_KEYS
    };
})();