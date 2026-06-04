import dotenv from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
// Only load env files if DATABASE_URL is not already set externally
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), ".env") });
  dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true });
  if (existsSync(resolve(process.cwd(), ".env.development.local"))) {
    dotenv.config({ path: resolve(process.cwd(), ".env.development.local"), override: true });
  }
}
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
