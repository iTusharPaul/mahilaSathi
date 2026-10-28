import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { SERVER_CONFIG } from '../config.js';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(SERVER_CONFIG.DB_FILE);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(SERVER_CONFIG.DB_FILE);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      handle TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY,
      codeHash TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      nexconnGroupId TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS circle_members (
      circleId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'guardian',
      joinedAt INTEGER NOT NULL,
      PRIMARY KEY (circleId, userId),
      FOREIGN KEY (circleId) REFERENCES circles (id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      corridorKey TEXT NOT NULL,
      nexconnGroupId TEXT NOT NULL,
      originArea TEXT NOT NULL,
      destArea TEXT NOT NULL,
      mode TEXT NOT NULL,
      score INTEGER NOT NULL,
      startedAt INTEGER NOT NULL,
      etaAt INTEGER NOT NULL,
      status TEXT NOT NULL,
      endedAt INTEGER,
      lastCheckinAt INTEGER,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS corridors (
      corridorKey TEXT PRIMARY KEY,
      nexconnGroupId TEXT NOT NULL,
      lastActiveAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporterId TEXT NOT NULL,
      targetType TEXT NOT NULL,
      targetId TEXT NOT NULL,
      channelId TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (reporterId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blocks (
      userId TEXT NOT NULL,
      blockedUserId TEXT NOT NULL,
      PRIMARY KEY (userId, blockedUserId),
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (blockedUserId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS community_reports (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      category TEXT NOT NULL,
      segmentId TEXT NOT NULL,
      areaLabel TEXT NOT NULL,
      note TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sos_events (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS places_cache (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      fetchedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walk_together_requests (
      id TEXT PRIMARY KEY,
      requesterId TEXT NOT NULL,
      requesterHandle TEXT NOT NULL,
      targetId TEXT NOT NULL,
      targetHandle TEXT NOT NULL,
      corridorKey TEXT NOT NULL,
      havenName TEXT NOT NULL,
      havenLat REAL NOT NULL,
      havenLon REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (requesterId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (targetId) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_trips_corridor ON trips (corridorKey, status);
    CREATE INDEX IF NOT EXISTS idx_trips_user ON trips (userId, status);
    CREATE INDEX IF NOT EXISTS idx_community_reports_created ON community_reports (createdAt);
    CREATE INDEX IF NOT EXISTS idx_community_reports_segment ON community_reports (segmentId);
  `);
}
