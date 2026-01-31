import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: ['electron/main.ts'],
        outDir: 'dist/electron',
        format: ['cjs'],
        platform: 'node',
        target: 'node18',
        sourcemap: true,
        clean: false,
        external: ['electron', 'keytar']
    },
    {
        entry: ['electron/preload.ts'],
        outDir: 'dist/electron',
        format: ['cjs'],
        platform: 'node',
        target: 'node18',
        sourcemap: true,
        clean: false,
        external: ['electron']
    }
]);
