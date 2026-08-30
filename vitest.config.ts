import { configDefaults, defineConfig } from 'vitest/config';

// Everything here reads a clock against a real socket. Run beside forty other files
// they lose the processor to them: a rate is measured over a window in which nothing
// arrived, and a server takes longer to close than the hook waits.
const TIMED =
[
    'apps/api/src/speed/transfer.spec.ts',
    'apps/api/src/http/smoke.spec.ts',
];

export default defineConfig(
{
    test:
    {
        include: ['apps/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.tsx'],

        // Only the files that draw need a document; everything else runs faster
        // without one, and most of this suite is everything else.
        projects:
        [
            {
                test:
                {
                    name: 'unit',
                    include: ['apps/*/src/**/*.spec.ts'],
                    exclude: [...configDefaults.exclude, ...TIMED],
                    environment: 'node',
                },
            },
            {
                test:
                {
                    name: 'page',
                    include: ['apps/web/src/**/*.spec.tsx'],
                    environment: 'happy-dom',
                },
            },
            {
                test:
                {
                    name: 'timed',
                    include: TIMED,
                    environment: 'node',
                    fileParallelism: false,
                    hookTimeout: 30_000,
                },
            },
        ],
    },
});
