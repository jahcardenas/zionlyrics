const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    getPathForFile: (file) => require('electron').webUtils.getPathForFile(file),
    openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
    fileExists:     (absPath) => ipcRenderer.invoke('file-exists', absPath),

    // Archivos (genérico: json, texto, binario, carpeta)
    loadFile:    (path)         => ipcRenderer.invoke('load-file',   { path }),
    saveFile:    (path, data)   => ipcRenderer.invoke('save-file',   { path, data }),
    deleteFile:  (path)         => ipcRenderer.invoke('delete-file', { path }),
    loadJsonHeaders: ()         => ipcRenderer.invoke('load-json-headers'),

    // Config (con rotación de .bak — caso especial, no genérico)
    loadConfig:  ()             => ipcRenderer.invoke('load-config'),
    saveConfig:  (data, opts)   => ipcRenderer.invoke('save-config', data, opts),

    // Locales (sync, requerido antes de whenReady)
    loadLocalesSync: ()         => ipcRenderer.sendSync('load-locales-sync'),

    // Displays y proyectores
    getDisplays:            ()          => ipcRenderer.invoke('get-displays'),
    openProjectorWindow:    (payload)   => ipcRenderer.invoke('open-projector-window', payload),
    closeProjectorWindow:   (displayId) => ipcRenderer.invoke('close-projector-window', displayId),
    focusProjectorWindow:   (displayId) => ipcRenderer.invoke('focus-projector-window', displayId),
    isProjectorOpen:        (displayId) => ipcRenderer.invoke('is-projector-open', displayId),
    closeAllProjectors:     ()          => ipcRenderer.invoke('close-all-projectors'),
    onProjectorClosed:      (cb)        => ipcRenderer.on('projector-closed', (e, id) => cb(id)),
    onProjectorFallbackWarning: (cb)    => ipcRenderer.on('projector-fallback-warning', (e, data) => cb(data)),
    sendProjectorError:     (displayId, message) => ipcRenderer.send('projector-error', { displayId, message }),
    onProjectorError:       (cb)        => ipcRenderer.on('projector-error', (e, data) => cb(data)),

    // Ventana
    quitApp:          () => ipcRenderer.invoke('app-quit'),
    reloadApp:        () => ipcRenderer.invoke('app-reload'),
    windowMinimize:   () => ipcRenderer.send('window-minimize'),
    windowMaximize:   () => ipcRenderer.send('window-maximize'),
    windowClose:      () => ipcRenderer.send('window-close'),
    windowIsMaximized:() => ipcRenderer.invoke('window-is-maximized'),

    // Cierre nativo (macOS: semáforo, Cmd+Q, Cmd+W)
    onBeforeCloseRequest:  (cb) => ipcRenderer.on('before-close-request', () => cb()),
    closeWindowConfirmed:  () => ipcRenderer.invoke('close-window-confirmed'),

    // Dev / debug
    openDevTools:     ()           => ipcRenderer.send('open-devtools'),
    setDebugLogging:  (enabled)    => ipcRenderer.invoke('set-debug-logging', enabled),
    debugLog:         (tag, msg)   => ipcRenderer.invoke('debug-log', tag, msg),
    getLogPath:       ()           => ipcRenderer.invoke('get-log-path'),
    getPackageInfo:   ()           => ipcRenderer.invoke('get-package-info'),
    openExternal:     (url)        => ipcRenderer.invoke('open-external', url),
});