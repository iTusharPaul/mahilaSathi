import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config(); // fallback to current dir

export {
  PRODUCT_CONSTANTS,
  SCORE_WEIGHTS,
  HANDLE_WORD_LIST,
  SEEDED_NEIGHBOURHOODS,
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS,
  type ScoreFactorKey,
  type CustomMessageType,
} from '@nightwise/shared';

export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '8080', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'nightwise-jwt-secret-demo-key-2026',
  DEMO_MODE: process.env.DEMO_MODE !== 'false', // Default true for hackathon
  GEOAPIFY_API_KEY: process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '',
  NEXCONN_APP_KEY: process.env.NEXCONN_APP_KEY || '',
  NEXCONN_APP_SECRET: process.env.NEXCONN_APP_SECRET || '',
  NEXCONN_BASE_URL: process.env.NEXCONN_BASE_URL || 'api.sg-light-api.com',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'nightwise-admin-secret-2026',
  DB_FILE: process.env.DB_FILE || path.resolve(process.cwd(), 'data/nightwise.db'),
  DEMO_OTP: '123456', // Deterministic demo OTP in demo mode for tests/evaluations

  // Server-side profanity / harmful keywords filter (§8.4)
  BANNED_KEYWORDS: [
    'abuse', 'kill', 'attack', 'rape', 'harass', 'stalk', 'threat', 'die', 'murder',
    'bitch', 'whore', 'slut', 'fuck', 'shit', 'asshole', 'bastard'
  ],
};
