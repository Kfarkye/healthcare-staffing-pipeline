import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    hideWindow: () => ipcRenderer.send('cc:hide'),
    readClipboardImageDataUrl: () => ipcRenderer.invoke('cc:readClipboardImageDataUrl') as Promise<string | null>,
    writeClipboardText: (text: string) => ipcRenderer.invoke('cc:writeClipboardText', text) as Promise<boolean>,
    openExternal: (url: string) => ipcRenderer.invoke('cc:openExternal', url) as Promise<void>,

    secureGet: (key: string) => ipcRenderer.invoke('cc:secureGet', key) as Promise<string | null>,
    secureSet: (key: string, value: string) => ipcRenderer.invoke('cc:secureSet', key, value) as Promise<boolean>,
    secureDelete: (key: string) => ipcRenderer.invoke('cc:secureDelete', key) as Promise<boolean>,

    onDeepLink: (handler: (url: string) => void) => {
        const listener = (_: unknown, url: string) => handler(url);
        ipcRenderer.on('cc:deepLink', listener);
        return () => ipcRenderer.removeListener('cc:deepLink', listener);
    }
});
