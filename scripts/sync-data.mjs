import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
copyFileSync(new URL('../backend/src/static-data.json', import.meta.url), new URL('../public/data/bmtc-static.json', import.meta.url));
