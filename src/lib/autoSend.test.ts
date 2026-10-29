import { describe, expect, it } from "vitest";
import { resolveRecipients } from "./autoSend";

const ctx = {
  clientName: "Emma Sharpe & Vy Nguyen", clientPhones: ["952-607-6774", "9524268693"], clientEmails: ["Esharpe13@gmail.com"],
  deal: [{ sectionId: "lender", role: "Buyer's lender", name: "Bryan Meredith", email: "bryan@envcap.com", phone: "612-839-1903" },
    { sectionId: "buyerTitle", role: "Buyer's title", name: "Flex Title", email: "team@flextitle.com", phone: "" }],
  team: [{ first: "Luke", name: "Luke Pettersen", email: "luke@pettyhomes.com", cell: "+16127020295" }],
};

describe("resolveRecipients", () => {
  it("texts the client's numbers, the lender and Luke's cell", () => {
    const r = resolveRecipients("text", ["client", "people:lender", "team:Luke"], ctx);
    expect(r.numbers).toEqual(["9526076774", "9524268693", "6128391903", "6127020295"]);
    expect(r.names).toEqual(["Emma Sharpe & Vy Nguyen", "Bryan Meredith", "Luke"]);
    expect(r.missing).toEqual([]);
  });
  it("lists who has nothing on file and skips roles the deal doesn't have", () => {
    const r = resolveRecipients("text", ["people:buyerTitle", "people:sellerTitle"], ctx);
    expect(r.numbers).toEqual([]);
    expect(r.missing).toEqual(["Flex Title"]);
  });
  it("emails lower-cased, no doubles", () => {
    const r = resolveRecipients("email", ["client", "client", "people:buyerTitle"], ctx);
    expect(r.emails).toEqual(["esharpe13@gmail.com", "team@flextitle.com"]);
  });
});
