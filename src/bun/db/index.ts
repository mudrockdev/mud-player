import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import * as schema from "./schema";

const homePath = Bun.env.HOME as string;
const dbDir = join(homePath, ".local/share/mud-player");

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const dbPath = join(dbDir, "database.sqlite");

export const db = drizzle(`file:${dbPath}`, { schema });

// Resolve the migrations folder for both the bundled app (Resources/app/drizzle)
// and direct `bun run` from source (./drizzle at the repo root).
function resolveMigrationsFolder(): string {
  const candidates = [
    resolve(import.meta.dir, "../drizzle"), // bundled: app/bun/db -> app/drizzle
    resolve(import.meta.dir, "../../drizzle"), // bundled flat: app/bun -> app/drizzle (alt)
    resolve(import.meta.dir, "../../../drizzle"), // source: src/bun/db -> repo/drizzle
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "meta/_journal.json"))) return c;
  }
  return candidates[0];
}

await migrate(db, { migrationsFolder: resolveMigrationsFolder() });

export { schema };
