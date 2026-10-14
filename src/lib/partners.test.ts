import { describe, expect, it } from "vitest";
import { DEFAULT_FORMS } from "./pa";
import { fillFromPartner, partnerFromAnswers, sectionPartnerType } from "./partners";

const sec = (id: string) => DEFAULT_FORMS.buyer.concat(DEFAULT_FORMS.seller).find((s) => s.id === id)!;
const pat = { id: "p1", name: "Pat Lee", company: "Bell Bank Mortgage", email: "pat@bell.com", phone: "6125550100" };

describe("industry partners", () => {
  it("knows which kind of partner each people section wants", () => {
    expect(sectionPartnerType(sec("lender"))).toBe("lender");
    expect(sectionPartnerType(sec("buyerTitle"))).toBe("title");
    expect(sectionPartnerType(sec("sellerTitle"))).toBe("title");
    expect(sectionPartnerType(sec("sellerAgent"))).toBe("realtor");
    expect(sectionPartnerType(sec("buyerAgent"))).toBe("realtor");
    expect(sectionPartnerType(sec("sellerTc"))).toBe("tc");
  });
  it("fills a section from a picked contact", () => {
    expect(fillFromPartner(sec("lender"), pat)).toEqual({ lenderName: "Pat Lee", lenderEmail: "pat@bell.com", lenderCompany: "Bell Bank Mortgage" });
    expect(fillFromPartner(sec("buyerTitle"), { ...pat, name: "Kim Olson", company: "Edina Title" })).toEqual({ titleCompany: "Edina Title", titleContact: "Kim Olson", titleContactInfo: "pat@bell.com · 6125550100" });
    expect(fillFromPartner(sec("sellerAgent"), pat)).toEqual({ sAgentName: "Pat Lee", sAgentEmail: "pat@bell.com" });
  });
  it("reads a typed-in partner back for Save as contact", () => {
    expect(partnerFromAnswers(sec("buyerTitle"), { titleCompany: "Edina Title", titleContact: "Kim Olson", titleContactInfo: "kim@edinatitle.com · 952-555-0101" }))
      .toEqual({ name: "Kim Olson", company: "Edina Title", email: "kim@edinatitle.com", phone: "952-555-0101" });
    expect(partnerFromAnswers(sec("sellerTitle"), { sTitleCompany: "Edina Title" })).toMatchObject({ name: "Edina Title", company: "Edina Title" });
  });
});
