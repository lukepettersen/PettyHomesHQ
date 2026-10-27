import { describe, expect, it } from "vitest";
import { cleanAddresses } from "./addresses";

describe("contact addresses (owner request 2026-10-27)", () => {
  it("uses the only address as the mailing address without marking it", () => {
    expect(cleanAddresses([{ label: "Home", value: " 1 Main St ", mailing: true }, { label: "", value: "  ", mailing: false }]))
      .toEqual({ rows: [{ label: "Home", value: "1 Main St", mailing: false, position: 0 }], primary: "1 Main St" });
  });
  it("keeps one mailing address when there are two or more", () => {
    const r = cleanAddresses([{ label: "Home", value: "1 Main St", mailing: false }, { label: "Cabin", value: "2 Lake Rd", mailing: true }, { label: "", value: "3 Oak", mailing: true }]);
    expect(r.rows.map((x) => x.mailing)).toEqual([false, true, false]);
    expect(r.primary).toBe("2 Lake Rd");
    expect(cleanAddresses([{ label: "", value: "1 Main St", mailing: false }, { label: "", value: "2 Lake Rd", mailing: false }]).rows[0].mailing).toBe(true);
    expect(cleanAddresses([]).primary).toBeNull();
  });
});
