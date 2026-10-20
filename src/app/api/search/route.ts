import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { formatPhone } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/** Search-as-you-type for the top bar: people by name, phone or email (8 at most). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  const people = await db.person.findMany({
    where: {
      deletedAt: null,
      OR: [
        { AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
        { emails: { some: { normalized: { contains: q.toLowerCase() } } } },
        ...(digits.length >= 3 ? [{ phones: { some: { normalized: { contains: digits } } } }] : []),
      ],
    },
    include: { phones: { orderBy: { position: "asc" } }, emails: { orderBy: { position: "asc" } }, stage: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });
  const results = people.map((p) => {
    // Show what matched: the phone or email, else the first phone/email.
    const phone = digits.length >= 3 ? p.phones.find((x) => x.normalized.includes(digits)) : undefined;
    const email = p.emails.find((x) => x.normalized.includes(q.toLowerCase()));
    const detail = phone ? formatPhone(phone.number) : email ? email.address : p.phones[0] ? formatPhone(p.phones[0].number) : p.emails[0]?.address ?? "";
    // phones (10 digits) and emails: for New message and adding people to an email or text.
    return { id: p.id, name: p.name, detail, stage: p.stage?.name ?? "", phones: p.phones.map((x) => x.normalized).filter((n) => n.length === 10), emails: p.emails.map((x) => x.address) };
  });
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
