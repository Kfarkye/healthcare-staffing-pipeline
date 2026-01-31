export { };

declare global {
    interface Window {
        electronAPI?: {
            hideWindow: () => void;
            readClipboardImageDataUrl: () => Promise<string | null>;
            writeClipboardText: (text: string) => Promise<boolean>;
            openExternal: (url: string) => Promise<void>;

            secureGet: (key: string) => Promise<string | null>;
            secureSet: (key: string, value: string) => Promise<boolean>;
            secureDelete: (key: string) => Promise<boolean>;

            onDeepLink: (handler: (url: string) => void) => () => void;
        };
    }
}
