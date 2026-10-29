import { TemplatesPage } from "../messages/TemplatesPage";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  return <TemplatesPage kind="text" t={(await searchParams).t} />;
}
