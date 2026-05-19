import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";
import { migrationsFolder } from "./migrations.generated";

const homePath = Bun.env.HOME as string;
const dbDir = join(homePath, ".local/share/mud-player");

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const dbPath = join(dbDir, "database.sqlite");

export const db = drizzle(`file:${dbPath}`, { schema });

await migrate(db, { migrationsFolder });

export { schema };
