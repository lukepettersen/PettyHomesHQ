import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Railway sets DATABASE_URL. Generating the client doesn't need a real database.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});
