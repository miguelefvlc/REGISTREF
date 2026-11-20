// =========================================================================
// REGISTRE DIARI EF — Native Multi-Asset Icon Generator
// =========================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// Run the user logo processor
import('./process_user_logo.js').catch(err => {
  console.error('Error running process_user_logo.js:', err);
});
