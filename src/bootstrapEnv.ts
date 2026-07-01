import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { loadSparkTelegramProfileEnv } from './profileEnv';

export const loadedTelegramProfile = loadSparkTelegramProfileEnv(process.argv.slice(2), process.env, {
  preserveExisting: true
});

if (!loadedTelegramProfile || loadedTelegramProfile === 'default') {
  loadEnv({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
}

loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });
