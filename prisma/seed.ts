// Seeds the two default roles and the team. Safe to run more than once.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLES } from "../src/server/permissions";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const TEAM = [
  { email: "luke@pettyhomes.com", name: "Luke Pettersen", role: "Admin", isOwner: true },
  { email: "assistant@pettyhomes.com", name: "Alyssa Chakiton", role: "Assistant", isOwner: false },
];

async function main() {
  for (const [name, permissions] of Object.entries(DEFAULT_ROLES)) {
    await db.role.upsert({ where: { name }, update: {}, create: { name, permissions } });
  }
  for (const m of TEAM) {
    const role = await db.role.findUniqueOrThrow({ where: { name: m.role } });
    await db.user.upsert({ where: { email: m.email }, update: {}, create: { email: m.email, name: m.name, isOwner: m.isOwner, roleId: role.id } });
  }
  console.log("Seeded roles and team.");
}

main().finally(() => db.$disconnect());
