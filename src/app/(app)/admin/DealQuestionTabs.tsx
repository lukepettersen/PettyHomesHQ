import Link from "next/link";

/** Deal questions (owner-approved Admin redesign 2026-10-29): the buyer/seller forms and the purchase agreement as tabs. */
export function DealQuestionTabs({ on }: { on: "files" | "pa" }) {
  const tab = (key: "files" | "pa", href: string, label: string) => (
    <Link href={href} aria-current={on === key ? "page" : undefined}
      className={`-mb-px border-b-[3px] px-3 py-2 ${on === key ? "border-coral font-semibold" : "border-transparent muted hover:text-charcoal"}`}>{label}</Link>
  );
  return (
    <>
      <h1 className="text-2xl font-extrabold">Deal questions</h1>
      <nav aria-label="Which questions" className="mb-3 mt-2 flex gap-1 border-b border-misty">
        {tab("files", "/admin/file-forms", "Buyer & seller (before contract)")}
        {tab("pa", "/admin/forms", "Purchase agreement")}
      </nav>
    </>
  );
}
