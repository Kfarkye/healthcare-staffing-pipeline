import {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    Menu,
    Tray,
    clipboard,
    shell
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';

type WindowBounds = { x: number; y: number; width: number; height: number };

const store = new Store<{
    windowBounds?: WindowBounds;
    secureFallback?: Record<string, string>;
}>();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function safeGetBounds(): WindowBounds | null {
    const b = store.get('windowBounds');
    if (!b) return null;
    if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') return null;
    return b;
}

function persistBounds() {
    if (!win) return;
    const b = win.getBounds();
    store.set('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height });
}

function createWindow() {
    const saved = safeGetBounds();

    win = new BrowserWindow({
        width: saved?.width ?? 460,
        height: saved?.height ?? 680,
        minWidth: 400,
        minHeight: 500,
        x: typeof saved?.x === 'number' ? saved.x : undefined,
        y: typeof saved?.y === 'number' ? saved.y : undefined,
        alwaysOnTop: true,
        resizable: true,
        frame: true,
        backgroundColor: '#030303',
        ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, vibrancy: 'under-window' as const } : {}),
        webPreferences: {
            preload: path.join(app.getAppPath(), 'dist/electron/preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.on('move', persistBounds);
    win.on('resize', persistBounds);

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch(() => { });
        return { action: 'deny' };
    });

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        win.loadURL(devUrl).catch(() => { });
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        const indexHtml = path.join(app.getAppPath(), 'dist/renderer/index.html');
        win.loadFile(indexHtml).catch(() => { });
    }

    win.on('closed', () => { win = null; });
    return win;
}

function toggleWindow() {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else {
        win.show();
        win.focus();
    }
}

function setupGlobalShortcut() {
    globalShortcut.register('CommandOrControl+Shift+D', () => toggleWindow());
}

function setupTray() {
    try {
        const trayPath = path.join(app.getAppPath(), 'assets', 'tray-icon.png');
        if (!fs.existsSync(trayPath)) return;

        tray = new Tray(trayPath);
        const menu = Menu.buildFromTemplate([
            { label: 'Show', click: () => win?.show() },
            { label: 'Hide', click: () => win?.hide() },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        ]);
        tray.setToolTip('Command Center');
        tray.setContextMenu(menu);
        tray.on('click', () => toggleWindow());
    } catch {
        // skip tray
    }
}

function parseDeepLink(url: string) {
    win?.webContents.send('cc:deepLink', url);
}

function setupDeepLinking() {
    if (process.defaultApp) {
        if (process.argv.length >= 2) app.setAsDefaultProtocolClient('commandcenter', process.execPath, [path.resolve(process.argv[1])]);
    } else {
        app.setAsDefaultProtocolClient('commandcenter');
    }

    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (!win) createWindow();
        win?.show();
        win?.focus();
        parseDeepLink(url);
    });

    app.on('second-instance', (_event, argv) => {
        const url = argv.find((a) => a.startsWith('commandcenter://'));
        if (url) {
            if (!win) createWindow();
            win?.show();
            win?.focus();
            parseDeepLink(url);
        }
    });
}

async function secureGet(key: string): Promise<string | null> {
    const k = (key || '').trim();
    if (!k) return null;
    try {
        const keytar = await import('keytar');
        const v = await keytar.default.getPassword('CommandCenter', k);
        if (typeof v === 'string') return v;
    } catch {
        // ignore
    }
    const fallback = store.get('secureFallback') ?? {};
    return typeof fallback[k] === 'string' ? fallback[k] : null;
}

async function secureSet(key: string, value: string): Promise<boolean> {
    const k = (key || '').trim();
    if (!k) return false;
    const v = value ?? '';
    try {
        const keytar = await import('keytar');
        await keytar.default.setPassword('CommandCenter', k, v);
        const fallback = store.get('secureFallback') ?? {};
        delete fallback[k];
        store.set('secureFallback', fallback);
        return true;
    } catch {
        const fallback = store.get('secureFallback') ?? {};
        fallback[k] = v;
        store.set('secureFallback', fallback);
        return true;
    }
}

async function secureDelete(key: string): Promise<boolean> {
    const k = (key || '').trim();
    if (!k) return false;
    try {
        const keytar = await import('keytar');
        await keytar.default.deletePassword('CommandCenter', k);
    } catch {
        // ignore
    }
    const fallback = store.get('secureFallback') ?? {};
    delete fallback[k];
    store.set('secureFallback', fallback);
    return true;
}

function setupIpc() {
    ipcMain.on('cc:hide', () => win?.hide());

    ipcMain.handle('cc:readClipboardImageDataUrl', () => {
        const img = clipboard.readImage();
        if (img.isEmpty()) return null;
        return img.toDataURL();
    });

    ipcMain.handle('cc:writeClipboardText', (_e, text: string) => {
        clipboard.writeText((text ?? '').toString());
        return true;
    });

    ipcMain.handle('cc:openExternal', (_e, url: string) => shell.openExternal(url));

    ipcMain.handle('cc:secureGet', (_e, key: string) => secureGet(key));
    ipcMain.handle('cc:secureSet', (_e, key: string, value: string) => secureSet(key, value));
    ipcMain.handle('cc:secureDelete', (_e, key: string) => secureDelete(key));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.whenReady().then(() => {
    createWindow();
    setupIpc();
    setupDeepLinking();
    setupGlobalShortcut();
    setupTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
