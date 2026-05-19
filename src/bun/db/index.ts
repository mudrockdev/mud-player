import { drizzle } from "drizzle-orm/bun-sql";
import schema from "./schema";
import { mkdir } from "fs/promises";

const homePath = Bun.env.HOME as string; // "/home/user"

const dbFolder = Bun.file(`${homePath}/.local/share/mud-player`);
if (!dbFolder.exists()) {
  await mkdir(`${homePath}/.local/share/mud-player`);
}

const dbPath = `${homePath}/.local/share/mud-player/database.sqlite`; // /home/user/.local/share/mud-player/database.sqlite

export const db = drizzle(dbPath, { schema: schema });
