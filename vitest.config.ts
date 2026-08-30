import { defineConfig } from 'vitest/config';

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
        ],
    },
});
