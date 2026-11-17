import { describe, expect, it } from "vitest";
import { cleanAddresses, splitAddress } from "./addresses";

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

describe("splitAddress (direct mail, owner request 2026-11-02)", () => {
  it("splits the usual formats", () => {
    expect(splitAddress("2215 Hillside Ave, Edina, MN 55436, USA")).toEqual({ street: "2215 Hillside Ave", city: "Edina", state: "MN", zip: "55436" });
    expect(splitAddress("2215 Hillside Ave, Apt 4, Edina, MN 55436")).toEqual({ street: "2215 Hillside Ave, Apt 4", city: "Edina", state: "MN", zip: "55436" });
    expect(splitAddress("3274 68th Court E, Inver Grove Heights, MN, 55076")).toEqual({ street: "3274 68th Court E", city: "Inver Grove Heights", state: "MN", zip: "55076" });
    expect(splitAddress("10 Elm St, Edina MN 55436")).toEqual({ street: "10 Elm St", city: "Edina", state: "MN", zip: "55436" });
    expect(splitAddress("10 Elm St, Edina, mn")).toEqual({ street: "10 Elm St", city: "Edina", state: "MN", zip: "" });
  });
  it("keeps everything in street when it can't tell", () => {
    expect(splitAddress("10 Elm St Edina")).toEqual({ street: "10 Elm St Edina", city: "", state: "", zip: "" });
    expect(splitAddress("Lake cabin, up north")).toEqual({ street: "Lake cabin, up north", city: "", state: "", zip: "" });
    expect(splitAddress(null)).toEqual({ street: "", city: "", state: "", zip: "" });
  });
});
