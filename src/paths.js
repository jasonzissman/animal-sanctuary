import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** All runtime data lives here (gitignored). Override with SANTUARIO_DATA_DIR in tests. */
export const dataDir = () => process.env.SANTUARIO_DATA_DIR || path.join(ROOT, 'data');
export const dataFile = (name) => path.join(dataDir(), name);
