import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { isPartnerType } from "@/lib/partners";

export const dynamic = "force-dynamic";

/** Purchase agreement people sections: partner contacts of a type (lender, title, realtor…) matching what's typed. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") ?? "", q = (sp.get("q") ?? "").trim().slice(0, 80);
  const words = q.split(/\s+/).filter(Boolean);
  const people = await db.person.findMany({
    where: {
      deletedAt: null, partnerType: isPartnerType(type) ? type : { not: null },
      AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { company: { contains: w, mode: "insensitive" as const } }, { emails: { some: { normalized: { contains: w.toLowerCase() } } } }] })),
    },
    include: { emails: { orderBy: { position: "asc" }, take: 1 }, phones: { orderBy: { position: "asc" }, take: 1 }, _count: { select: { partnerOn: true } } },
    orderBy: [{ partnerOn: { _count: "desc" } }, { name: "asc" }], // the ones you use most first
    take: 8,
  });
  return Response.json({
    results: people.map((p) => ({ id: p.id, name: p.name, company: p.company ?? "", email: p.emails[0]?.address ?? "", phone: p.phones[0]?.number ?? "" })),
  }, { headers: { "Cache-Control": "no-store" } });
}
