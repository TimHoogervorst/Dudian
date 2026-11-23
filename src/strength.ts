import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ItemKind } from './catalog.ts';

const statements = new WeakMap<DatabaseSync, {read: StatementSync; adjust: StatementSync}>();
function strengthStatements(db: DatabaseSync) {
  const existing = statements.get(db);
  if (existing) return existing;
  db.exec(`CREATE TABLE IF NOT EXISTS reading_strength (
    kind TEXT NOT NULL, text TEXT NOT NULL, score INTEGER NOT NULL,
    PRIMARY KEY (kind,text)
  )`);
  const prepared = {
    read: db.prepare('SELECT score FROM reading_strength WHERE kind=? AND text=?'),
    adjust: db.prepare(`INSERT INTO reading_strength(kind,text,score) VALUES(?,?,min(12,max(-6,?)))
      ON CONFLICT(kind,text) DO UPDATE SET score=min(12,max(-6,reading_strength.score+excluded.score))
      RETURNING score`),
  };
  statements.set(db, prepared);
  return prepared;
}

function strength(score: number | null) {
  const color = score === null ? 'gray' : score < 0 ? 'red' : score >= 6 ? 'green' : 'yellow';
  return {score, color};
}
export function strengthFor(db: DatabaseSync, kind: ItemKind, text: string) {
  const row = strengthStatements(db).read.get(kind,text);
  return strength(row ? Number(row.score) : null);
}
export function adjustStrength(db: DatabaseSync, kind: ItemKind, text: string, delta: number) {
  const row = strengthStatements(db).adjust.get(kind,text,delta)!;
  return strength(Number(row.score));
}

export function recordedStrengths(db: DatabaseSync) {
  strengthStatements(db);
  return db.prepare('SELECT kind,text,score FROM reading_strength').all().map(row=>({
    kind:row.kind as ItemKind, text:String(row.text), score:Number(row.score),
  }));
}
