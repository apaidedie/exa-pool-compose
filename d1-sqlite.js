import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function resolveDatabasePath(dbPath) {
  if (!dbPath || dbPath === ':memory:') {
    return ':memory:';
  }

  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

function normalizeRunMeta(result) {
  const changes = Number(result?.changes ?? 0);
  const rawLastInsertRowId = result?.lastInsertRowid;
  const lastInsertRowId = rawLastInsertRowId == null ? null : Number(rawLastInsertRowId);

  return {
    changes,
    changed_db: changes > 0,
    duration: 0,
    last_row_id: lastInsertRowId,
    rows_read: 0,
    rows_written: changes,
    served_by: 'local-sqlite',
    size_after: 0,
  };
}

class D1PreparedStatement {
  constructor(database, sql, boundValues = []) {
    this.database = database;
    this.sql = sql;
    this.boundValues = boundValues;
  }

  bind(...values) {
    return new D1PreparedStatement(this.database, this.sql, values);
  }

  async first() {
    const statement = this.database._prepare(this.sql);
    const row = statement.get(...this.boundValues);
    return row ?? null;
  }

  async all() {
    const statement = this.database._prepare(this.sql);
    const results = statement.all(...this.boundValues);
    return { results };
  }

  async run() {
    const statement = this.database._prepare(this.sql);
    const result = statement.run(...this.boundValues);
    return {
      success: true,
      meta: normalizeRunMeta(result),
    };
  }
}

export class D1Database {
  constructor(dbPath) {
    this.path = resolveDatabasePath(dbPath);
    this.sqlite = new DatabaseSync(this.path);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  _prepare(sql) {
    return this.sqlite.prepare(sql);
  }

  prepare(sql) {
    return new D1PreparedStatement(this, sql);
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { success: true };
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  close() {
    this.sqlite.close();
  }
}

export function createD1Database(dbPath) {
  return new D1Database(dbPath);
}

