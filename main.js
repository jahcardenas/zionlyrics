const { app, shell, BrowserWindow, ipcMain, screen, nativeTheme, dialog } = require('electron');
const projectorWindows = new Map();
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = app.getPath('userData');
const BUNDLED_RESOURCES_DIR = app.isPackaged ? process.resourcesPath : __dirname;
const USER_DIRS = new Set(['lang', 'json', 'fonts', 'media', 'sessions', 'logs']);

const CONFIG_FILE = getUserPath('config.json');
const CONFIG_BAK  = getUserPath('config.json.bak');
const THEMES_FILE = getUserPath('themes.json');
const THEMES_BAK  = getUserPath('themes.json.bak');

const debugState = { enabled: false };
const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

const TEXT_EXTS = new Set(['.html', '.htm', '.css', '.js', '.txt', '.md', '.svg', '.xml']);
const MIME_MAP = {
    '.json': 'application/json',
    '.html': 'text/html',    '.htm': 'text/html',
    '.css':  'text/css',     '.js':  'text/javascript',
    '.txt':  'text/plain',   '.md':  'text/markdown',
    '.svg':  'image/svg+xml','.xml': 'application/xml',
    '.png':  'image/png',    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',   '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4':  'video/mp4',    '.webm': 'video/webm',
    '.mov':  'video/quicktime', '.mkv': 'video/x-matroska',
    '.avi':  'video/x-msvideo',
    '.mp3':  'audio/mpeg',   '.wav': 'audio/wav',
    '.ogg':  'audio/ogg'
};

let logStream = null;
let logFilePath = null;
let mainWindow;
let _allowMainClose = false;



function getUserPath(...segments) {
    return path.join(USER_DATA_DIR, ...segments);
}

function seedUserDirectories() {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    for (const dirName of USER_DIRS) {
        const destDir = getUserPath(dirName);
        const srcDir = path.join(BUNDLED_RESOURCES_DIR, dirName);

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        if (fs.existsSync(srcDir) && fs.readdirSync(destDir).length === 0) {
            fs.cpSync(srcDir, destDir, { recursive: true });
        }
    }
}

function getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
}

function readByMimeType(fullPath, mimeType) {
    if (mimeType === 'application/json') {
        const text = fs.readFileSync(fullPath, 'utf8');
        try { return JSON.parse(text); } catch { return text; }
    }
    if (mimeType.startsWith('text/') ||
        mimeType === 'application/xml' ||
        mimeType === 'image/svg+xml') {
        return fs.readFileSync(fullPath, 'utf8');
    }
    return fs.readFileSync(fullPath);   // Buffer
}

function resolveSafePath(relPath) {
    if (typeof relPath !== 'string' || !relPath.trim()) return null;
    const safe = path.normalize(relPath);
    if (safe.startsWith('..') || path.isAbsolute(safe)) return null;

    const topSegment = safe.split(path.sep)[0];
    const baseDir = USER_DIRS.has(topSegment) ? USER_DATA_DIR : __dirname;
    return path.join(baseDir, safe);
}

function isConfigStructurallyValid(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (!obj.displays || typeof obj.displays !== 'object' || Array.isArray(obj.displays)) return false;
    if (!Array.isArray(obj.columnWidths)) return false;
    if (!Array.isArray(obj.mediaLibrary)) return false;
    return true;
}

function readJsonFile(filePath, bakPath, validator) {
    const fileName = path.basename(filePath);
    const bakName  = path.basename(bakPath);

    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (validator(parsed)) {
                try { fs.copyFileSync(filePath, bakPath); } catch (_) {}
                return { data: parsed, source: 'main', error: null };
            }
            console.warn(`Failed validating ${fileName} structure.`);
        } catch (e) {
            console.warn(`Failed reading ${fileName}:`, e.message);
        }
    }

    if (fs.existsSync(bakPath)) {
        try {
            const raw = fs.readFileSync(bakPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (validator(parsed)) {
                return { data: parsed, source: 'bak', error: `${fileName} is invalid. Restoring from backup.` };
            }
        } catch (e) {
            console.warn(`Failed reading ${bakName}:`, e.message);
        }
    }

    return { data: null, source: 'defaults', error: null };
}

function writeJsonFile(filePath, bakPath, data, validator, options = {}) {
    const { mirrorToBackup = false } = options;

    if (!validator(data)) {
        return { success: false, error: 'Failed validating JSON structure. It won\'t be saved to disk.' };
    }
    try {
        if (mirrorToBackup) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            fs.copyFileSync(filePath, bakPath);
        } else {
            if (fs.existsSync(filePath)) {
                try {
                    const currentRaw = fs.readFileSync(filePath, 'utf8');
                    const currentParsed = JSON.parse(currentRaw);
                    if (validator(currentParsed)) {
                        fs.copyFileSync(filePath, bakPath);
                    }
                } catch (_) {}
            }
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        }
        return { success: true, error: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function isValidLocale(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (typeof obj.id !== 'string' || !obj.id.trim()) return false;
    if (typeof obj.label !== 'string' || !obj.label.trim()) return false;
    if (!obj.strings || typeof obj.strings !== 'object' || Array.isArray(obj.strings)) return false;
    return true;
}

function readLocalesSync() {
    const langDir = getUserPath('lang');
    if (!fs.existsSync(langDir)) return [];

    const files = fs.readdirSync(langDir)
        .filter(f => path.extname(f).toLowerCase() === '.json');

    const locales = [];
    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(langDir, file), 'utf8');
            const data = JSON.parse(raw);
            if (!isValidLocale(data)) {
                console.warn(`[i18n] Locale file has an invalid structure: ${file}`);
                continue;
            }
            locales.push(data);
        } catch (e) {
            console.warn(`[i18n] Failed reading ${file}:`, e.message);
        }
    }
    return locales;
}

function localStamp({ forFile = false } = {}) {
    const d = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const Y  = d.getFullYear();
    const M  = pad(d.getMonth() + 1);
    const D  = pad(d.getDate());
    const h  = pad(d.getHours());
    const m  = pad(d.getMinutes());
    const s  = pad(d.getSeconds());
    const ms = pad(d.getMilliseconds(), 3);

    if (forFile) return `${Y}-${M}-${D}T${h}-${m}-${s}`;   // 2026-10-06T22-41-54
    return `${h}:${m}:${s}.${ms}`;                          // 22:41:54.026
}

function ensureLogStream() {
    if (logStream) return logStream;
    const logsDir = getUserPath('logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, `app-${localStamp({ forFile: true })}.log`);
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    return logStream;
}

function writeLog(tag, message) {
    if (!debugState.enabled) return;
    try {
        ensureLogStream().write(`[${localStamp()}] [${tag}] ${message}\n`);
    } catch (e) {
        console.error('writeLog failed: ', e);
    }
}

function mlog(tag, ...args) {
    if (!debugState.enabled) return;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    writeLog(tag, msg);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#f0f0f0',
        frame: false,
        titleBarStyle: 'hiddenInset',
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // macOS: el semáforo rojo, Cmd+Q y Cmd+W disparan este evento antes de cerrar. Si no permitimos, el renderer decide (vía requestQuit).
    mainWindow.on('close', (e) => {
        if (_allowMainClose) return;
        e.preventDefault();
        mainWindow.webContents.send('before-close-request');
    });
}

ipcMain.handle('load-file', async (event, { path: relPath }) => {
    try {
        const fullPath = resolveSafePath(relPath);
        if (!fullPath) return { success: false, error: 'Invalid path', path: relPath };
        if (!fs.existsSync(fullPath)) return { success: false, error: 'Not found', path: relPath };

        const stat = fs.statSync(fullPath);

        // Directorio → carga todos los archivos sueltos dentro
        if (stat.isDirectory()) {
            const names = fs.readdirSync(fullPath);
            const contents = [];
            for (const name of names) {
                const fileFullPath = path.join(fullPath, name);
                const fileStat = fs.statSync(fileFullPath);
                if (!fileStat.isFile()) continue;

                const mimeType = getMimeType(name);
                const relFilePath = path.join(relPath, name).replace(/\\/g, '/');

                // Binarios (imagen, video, audio, etc.): solo metadata, sin leer el archivo
                const isBinary = !mimeType.startsWith('text/') &&
                                 mimeType !== 'application/json' &&
                                 mimeType !== 'application/xml' &&
                                 mimeType !== 'image/svg+xml';

                const entry = {
                    path: relFilePath,
                    fileName: name,
                    mimeType,
                    size: fileStat.size,
                    lastModified: fileStat.mtimeMs,
                    data: null
                };

                if (!isBinary) {
                    try {
                        entry.data = readByMimeType(fileFullPath, mimeType);
                    } catch (e) {
                        entry.error = e.message;
                    }
                }

                contents.push(entry);
            }
            return { success: true, isDirectory: true, path: relPath, contents };
        }

        // Archivo único
        const mimeType = getMimeType(relPath);
        const data = readByMimeType(fullPath, mimeType);
        return { success: true, isDirectory: false, path: relPath, mimeType, data };

    } catch (error) {
        return { success: false, error: error.message, path: relPath };
    }
});

ipcMain.handle('save-file', async (event, { path: relPath, data }) => {
    try {
        const fullPath = resolveSafePath(relPath);
        if (!fullPath) return { success: false, error: 'Invalid path', path: relPath };

        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const ext = path.extname(relPath).toLowerCase();
        if (ext === '.json') {
            fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
        } else if (TEXT_EXTS.has(ext)) {
            fs.writeFileSync(fullPath, String(data), 'utf8');
        } else {
            fs.writeFileSync(fullPath, Buffer.from(data));
        }

        return { success: true, path: relPath };
    } catch (error) {
        return { success: false, error: error.message, path: relPath };
    }
});

ipcMain.handle('delete-file', async (event, { path: relPath }) => {
    try {
        const fullPath = resolveSafePath(relPath);
        if (!fullPath) return { success: false, error: 'Invalid path' };
        if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-package-info', () => {
    return {
        version: packageJson.version || '3.0.0',
        description: packageJson.description || '',
        author: packageJson.author || {},
        license: packageJson.license || '',
        repository: packageJson.repository || {},
        bugs: packageJson.bugs || {},
        homepage: packageJson.homepage || '',
        funding: packageJson.funding || {}
    };
});

ipcMain.handle('open-external', (event, url) => {
    if (/^https?:\/\//.test(url)) {
        shell.openExternal(url);
    }
    return { success: true };
});

// IPC para leer los archivos de la carpeta json/
ipcMain.handle('load-bibles', () => {
    const jsonDir = getUserPath('json');

    if (!fs.existsSync(jsonDir)) {
        return [];
    }

    const files = fs.readdirSync(jsonDir)
        .filter(fileName => path.extname(fileName).toLowerCase() === '.json');

    return files.map(fileName => {
        try {
            const filePath = path.join(jsonDir, fileName);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            return {
                fileName,
                data
            };
        } catch (error) {
            return {
                fileName,
                data: null
            };
        }
    });
});

// IPC para leer solo las cabeceras (metadata) de las biblias, sin cargar los libros
ipcMain.handle('load-json-headers', () => {
    const jsonDir = getUserPath('json');
    if (!fs.existsSync(jsonDir)) return [];

    const files = fs.readdirSync(jsonDir).filter(f => path.extname(f).toLowerCase() === '.json');
    const headers = [];

    for (const file of files) {
        try {
            const filePath = path.join(jsonDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Algunos JSON vienen como array de 1 elemento
            const bible = Array.isArray(data) ? data[0] : data;

            const name = bible.bible || bible.biblia || "";
            
            // FILTRO: Si no tiene nombre o no tiene el array de libros (estructura vieja), lo saltamos
            if (!name || !Array.isArray(bible.books)) {
                continue; 
            }

            headers.push({
                filename: file,
                bible: bible.bible || bible.biblia || "",
                abbrev: bible.abbrev || bible.abreviacion || "",
                lang: bible.lang || bible.idioma || "",
                copyright: bible.copyright || "",
                canon: bible.canon || ""
            });
        } catch (_) {
            // Si el JSON está roto, lo ignoramos
        }
    }

    return headers;
});

// IPC para guardar archivos JSON generales (coros, biblias, config)
ipcMain.handle('save-json-file', async (event, { fileName, dir, data }) => {
    try {
        const safeFilename = path.basename(fileName);
        let targetDir = USER_DATA_DIR;
        
        if (dir) {
            const safeDir = path.basename(dir);
            targetDir = getUserPath(safeDir);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
        }
        
        const filePath = path.join(targetDir, safeFilename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        
        return { success: true, file: dir ? `${dir}/${safeFilename}` : safeFilename };
    } catch (error) {
        console.error('Failed saving JSON file: ' + `${dir}/${safeFilename}`, error);
        return { success: false, error: error.message };
    }
});

// IPC para guardar archivos binarios o multimedia (imágenes/videos)
ipcMain.handle('save-media-file', async (event, { fileName, dir, bufferData }) => {
    try {
        const safeFilename = path.basename(fileName);
        const safeDir = path.basename(dir);
        const targetDir = getUserPath(safeDir);
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const filePath = path.join(targetDir, safeFilename);
        fs.writeFileSync(filePath, Buffer.from(bufferData));
        
        return { success: true, file: `${safeDir}/${safeFilename}` };
    } catch (error) {
        console.error('Failed saving media fle: ' + `${safeDir}/${safeFilename}`, error);
        return { success: false, error: error.message };
    }
});

// IPC para borrar archivos multimedia (reemplaza a delete.php)
ipcMain.handle('delete-media-file', async (event, { fileName, dir }) => {
    try {
        const safeFilename = path.basename(fileName);
        const safeDir = path.basename(dir);
        const filePath = getUserPath(safeDir, safeFilename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return { success: true };
    } catch (error) {
        console.error('Faile deleting media file: ' + `${safeDir}/${safeFilename}`, error);
        return { success: false, error: error.message };
    }
});

// Abrir diálogo de archivos nativo (devuelve paths absolutos)
ipcMain.handle('open-file-dialog', async (event, opts) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: opts?.filters || [
                { name: 'Multimedia', extensions: ['png','jpg','jpeg','gif','webp','svg','mp4','webm','mov','mkv','avi'] }
            ]
        });
        if (result.canceled) return { success: true, paths: [] };
        return { success: true, paths: result.filePaths };
    } catch (e) {
        return { success: false, error: e.message, paths: [] };
    }
});

// Verificar si un path absoluto existe en disco
ipcMain.handle('file-exists', async (event, absPath) => {
    try {
        if (typeof absPath !== 'string' || !absPath) return false;
        return fs.existsSync(absPath);
    } catch (_) {
        return false;
    }
});

// IPC para leer archivos JSON generales (reemplaza la lectura por HTTP de config.json)
ipcMain.handle('load-json-file', async (event, { fileName, dir }) => {
    try {
        const safeFilename = path.basename(fileName);
        let targetDir = USER_DATA_DIR;
        
        if (dir) {
            targetDir = path.join(__dirname, path.basename(dir));
        }
        
        const filePath = path.join(targetDir, safeFilename);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data;
    } catch (error) {
        console.error('Failed reading JSON file: ' + `${targetDir}/${safeFilename}`, error);
        return null;
    }
});

// IPC para obtener la lista de pantallas conectadas
ipcMain.handle('get-displays', () => {
    return {
        displays: screen.getAllDisplays(),
        primaryDisplay: screen.getPrimaryDisplay()
    };
});

// IPC para escuchar errores del proyector y los reenvía a la ventana principal
ipcMain.on('projector-error', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('projector-error', data);
    }
});

// IPC para abrir una ventana de proyección en un monitor específico
ipcMain.handle('open-projector-window', (event, { electronInternalId, displayId, label }) => {
    mlog('WIN', `open-projector-window called | displayId=${displayId} | electronInternalId=${electronInternalId} | label=${label}`);

    if (projectorWindows.has(displayId)) {
        const existing = projectorWindows.get(displayId);
        if (!existing.isDestroyed()) {
            existing.focus();
            mlog('WIN', `Existing window for ${displayId} — only focus`);
            return { success: true, existed: true };
        }
        projectorWindows.delete(displayId);
    }

    const displays = screen.getAllDisplays();
    mlog('WIN', `Detected displays by screen.getAllDisplays:`);
    displays.forEach(d => {
        mlog('WIN', `  · id=${d.id} | label="${d.label}" | bounds=${JSON.stringify(d.bounds)} | internal=${d.internal} | primary=${d.id === screen.getPrimaryDisplay().id}`);
    });

    // 1) Match directo por id interno (caso normal, sin cambios)
    let targetDisplay = displays.find(d => d.id === electronInternalId);
    let matchType = 'ID_DIRECTO';

    // 2) Si el id ya no existe (reconexión reasignó el id), intenta por label —
    //    mucho más confiable que adivinar por posición en el array
    if (!targetDisplay && label) {
        targetDisplay = displays.find(d => d.label === label);
        if (targetDisplay) matchType = 'LABEL';
    }

    // 3) Último recurso: solo si de verdad no hay forma de saber cuál es.
    //    Aquí SÍ avisamos — abrir en el monitor equivocado en vivo es peor que un error visible.
    const usedBlindFallback = !targetDisplay;
    if (usedBlindFallback) {
        targetDisplay = displays[1] || displays[0];
        matchType = 'FALLBACK_CIEGO';
        mlog('WIN', `⚠️ WARNING: there is no match by id nor label for "${label}". Using blind fallback — chosen display might be unaccurate.`);
    }

    const finalDisplay = targetDisplay;
    mlog('WIN', `Selected target: ${matchType} | label="${finalDisplay.label}" | id=${finalDisplay.id} | bounds=${JSON.stringify(finalDisplay.bounds)}`);

    if (usedBlindFallback) {
        event.sender.send('projector-fallback-warning', { displayId, label, chosenLabel: finalDisplay.label });
    }

    const { x, y, width, height } = finalDisplay.bounds;
    mlog('WIN', `Creating window at x=${x} y=${y} w=${width} h=${height}`);

    const win = new BrowserWindow({
        x, y, width, height,
        show: false,            // no mostrar aún
        frame: false,
        autoHideMenuBar: true,
        fullscreen: false,      // fullscreen se activa después
        fullscreenable: false,  // nuevo: evita que macOS trate la ventana como candidata a space
        roundedCorners: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false
        }
    });

    win._targetBounds = { x, y, width, height };
    win._displayLabel = finalDisplay.label;

    win.loadFile(path.join(__dirname, 'templates', 'proyector.html'), {
        search: `id=${displayId}`
    });

    win.webContents.on('did-finish-load', () => {
        mlog('WIN', `did-finish-load for ${displayId} | current bounds: ${JSON.stringify(win.getBounds())}`);
    });

    win.webContents.on('did-fail-load', (e, code, desc, url) => {
        mlog('WIN', `did-fail-load for ${displayId} | code=${code} | desc=${desc} | url=${url}`);
    });

    win.once('ready-to-show', () => {
        mlog('WIN', `ready-to-show for ${displayId}`);
        win.showInactive();

        if (process.platform === 'darwin') {
            try {
                win.setWindowButtonVisibility?.(false);
                win.setAlwaysOnTop(true, 'main-menu', 1);
                win.moveTop();

                // macOS recorta la ventana 30px por arriba cuando es frame:false
                // (para no tapar la menu bar). Con alwaysOnTop ya elevada, reaplicamos
                // los bounds completos para cubrir hasta y=0.
                win.setBounds({ x, y, width, height });

                mlog('WIN', `macOS: alwaysOnTop + setBounds | bounds: ${JSON.stringify(win.getBounds())}`);

                // Segunda pasada por si macOS vuelve a ajustar en el siguiente tick
                setTimeout(() => {
                    if (!win.isDestroyed()) {
                        win.setBounds({ x, y, width, height });
                        mlog('WIN', `macOS: setBounds reinforcement | bounds: ${JSON.stringify(win.getBounds())}`);
                    }
                }, 100);
            } catch (e) {
                mlog('WIN', `macOS: error in elevation: ${e.message}`);
            }
        }
    });

    win.on('close', (e) => {
        mlog('WIN', `Window CLOSE event | displayId=${displayId} | defaultPrevented=${e.defaultPrevented}`);
    });

    win.on('closed', () => {
        mlog('WIN', `Window CLOSED | displayId=${displayId} | projectorWindows keys antes de borrar: ${[...projectorWindows.keys()].join(',')}`);
        projectorWindows.delete(displayId);

        const mainWin = BrowserWindow.getAllWindows().find(w =>
            !w.isDestroyed() &&
            w !== win &&
            ![...projectorWindows.values()].includes(w)
        );
        if (mainWin) mainWin.webContents.send('projector-closed', displayId);
    });

    projectorWindows.set(displayId, win);

    return { success: true, existed: false };
});

ipcMain.handle('close-projector-window', (event, displayId) => {
    mlog('WIN', `close-projector-window (IPC) | displayId=${displayId} | caller webContents=${event.sender.id}`);

    const win = projectorWindows.get(displayId);
    if (win && !win.isDestroyed()) {
        win.close();
    }
    projectorWindows.delete(displayId);
    return { success: true };
});

ipcMain.handle('focus-projector-window', (event, displayId) => {
    const win = projectorWindows.get(displayId);
    if (win && !win.isDestroyed()) {
        win.focus();
        return { success: true };
    }
    return { success: false };
});

ipcMain.handle('is-projector-open', (event, displayId) => {
    const win = projectorWindows.get(displayId);
    return !!(win && !win.isDestroyed());
});

ipcMain.handle('close-all-projectors', () => {
    projectorWindows.forEach((win) => {
        if (!win.isDestroyed()) win.close();
    });
    projectorWindows.clear();
    return { success: true };
});

ipcMain.handle('app-quit', () => {
    _allowMainClose = true;
    projectorWindows.forEach(win => {
        win.destroy();
    });
    app.quit();
});

ipcMain.handle('close-window-confirmed', () => {
    _allowMainClose = true;
    mainWindow.close();
});

ipcMain.handle('app-reload', () => {
    projectorWindows.forEach((win) => {
        if (!win.isDestroyed()) { win.close(); }
    });
    projectorWindows.clear();
    mainWindow.reload();
});

ipcMain.on('window-minimize', () => mainWindow.minimize());

ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    projectorWindows.forEach((win) => {
        if (!win.isDestroyed()) { win.close(); }
    });
    projectorWindows.clear();
});

ipcMain.on('open-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    win.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.handle('set-debug-logging', (event, enabled) => {
    debugState.enabled = !!enabled;
    if (enabled) {
        ensureLogStream();
        writeLog('SYS', '=== Debug logging enabled ===');
        writeLog('SYS', `File: ${logFilePath}`);
    }
    return { success: true, path: logFilePath };
});

ipcMain.handle('debug-log', (event, tag, message) => {
    writeLog(tag, message);
    return { success: true };
});

ipcMain.on('load-locales-sync', (event) => {
    event.returnValue = readLocalesSync();
});

ipcMain.handle('get-log-path', () => logFilePath);

ipcMain.handle('load-config', () => readJsonFile(CONFIG_FILE, CONFIG_BAK, isConfigStructurallyValid));
ipcMain.handle('save-config', (event, data, options) => writeJsonFile(CONFIG_FILE, CONFIG_BAK, data, isConfigStructurallyValid, options));

ipcMain.handle('load-themes', () => readJsonFile(THEMES_FILE, THEMES_BAK, Array.isArray));
ipcMain.handle('save-themes', (event, data) => writeJsonFile(THEMES_FILE, THEMES_BAK, data, Array.isArray));

app.whenReady().then(() => {
    seedUserDirectories();
    createWindow();

    // Red de seguridad ante reconfiguración de topología de displays en macOS/Windows.
    // Cuando un monitor se desconecta (AirPlay, HDMI, etc.), el WindowServer puede
    // reubicar o compactar las ventanas de los proyectores que NO fueron removidos.
    // Aquí reafirmamos sus bounds originales para que se queden donde les toca.
    screen.on('display-removed', () => {
        mlog('WIN', 'display-removed triggered — repositioning windows according to current topology');

        const displays = screen.getAllDisplays();

        projectorWindows.forEach((win, displayId) => {
            if (!win || win.isDestroyed()) return;

            // Buscar el monitor por label — el id interno puede cambiar entre
            // reconexiones, el label es lo más estable que tenemos.
            const disp = displays.find(d => d.label === win._displayLabel);

            if (!disp) {
                // El monitor de esta ventana ya no existe. No movemos; probablemente
                // va a ser cerrada por su propio flujo (handleRemovedDisplay).
                mlog('WIN', `display-removed: no monitor for "${win._displayLabel}" (${displayId})`);
                return;
            }

            const target = disp.bounds;
            const current = win.getBounds();
            const off =
                current.x !== target.x ||
                current.y !== target.y ||
                current.width !== target.width ||
                current.height !== target.height;

            if (off) {
                mlog('WIN', `repositioning ${displayId} | actual=${JSON.stringify(current)} | nuevo=${JSON.stringify(target)}`);
                win.setBounds(target);
            } else {
                mlog('WIN', `${displayId} is already within correct bounds`);
            }
        });
    });

    screen.on('display-added', () => {
        mlog('WIN', 'display-added triggered');
    });
});
