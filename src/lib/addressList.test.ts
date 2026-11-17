import { describe, expect, it } from "vitest";
import { addressKey, familyNames, listAddress, listMailingName, listName, matchRow, parseCsv, readAddressList, type HqPerson } from "./addressList";

const CSV = `First Name,Last Name,Display/Household Name (Smith Family),Address Line 1,Address Line 2,City,State,Postal
AJ & Emily,Pettersen,The Pettersen Family,5137 Clear Spring Drive,,Minnetonka,MN,55345
"Kate Conlon & Andy Martin",,,"2935 Fremont Ave S, Apt 418",,Minneapolis,mn,55408
The Anderson Family,,,701 Gleason Acres Drive,,Wayzata,MN,55391
Andy & Tracy Claeys,,,8692 Lake Riley Drive,,Chanhassen,MN,55317
Somebody,,,,,,,
Jo,Jersey,,1 Main St,Unit 2,Newark,NJ,7102
`;

describe("address list", () => {
  it("parses quoted CSV", () => {
    expect(parseCsv('a,"b, c","d ""q"""\n\n1,2,3')).toEqual([["a", "b, c", 'd "q"'], ["1", "2", "3"]]);
  });
  it("reads rows by heading, skips rows without an address, pads NJ zips", () => {
    const { rows, problem } = readAddressList(CSV);
    expect(problem).toBeNull();
    expect(rows).toHaveLength(5);
    expect(listName(rows[0])).toBe("AJ & Emily Pettersen");
    expect(listMailingName(rows[0])).toBe("The Pettersen Family");
    expect(listAddress(rows[0])).toBe("5137 Clear Spring Drive, Minnetonka, MN 55345");
    expect(listAddress(rows[1])).toBe("2935 Fremont Ave S, Apt 418, Minneapolis, MN 55408");
    expect(listName(rows[2])).toBe("The Anderson Family");
    expect(listMailingName(rows[2])).toBeNull();
    expect(listAddress(rows[4])).toBe("1 Main St, Unit 2, Newark, NJ 07102");
  });
  it("says when the headings are wrong", () => {
    expect(readAddressList("foo,bar\n1,2").problem).toMatch(/Couldn't find/);
  });
  it("keys and family names", () => {
    expect(addressKey("6428 15th Avenue S")).toBe("6428 15th");
    expect(addressKey("10127 W 199th Street West")).toBe("10127 199th");
    expect(familyNames("The Smith/Hess Family")).toEqual(["smith", "hess"]);
    expect(familyNames("Andy & Tracy Claeys")).toEqual(["claeys"]);
  });
  it("matches by name, address, then maybe", () => {
    const { rows } = readAddressList(CSV);
    const people: HqPerson[] = [
      { id: "1", name: "AJ and Emily Pettersen", addresses: [] },
      { id: "2", name: "Kate Conlon", addresses: ["2935 Fremont Ave S #418, Minneapolis, MN"] },
      { id: "3", name: "Andy Claeys", addresses: [] },
      { id: "4", name: "Mike Anderson", addresses: [] },
      { id: "5", name: "Tracy Smith", addresses: [] },
    ];
    expect(matchRow(rows[0], people).map((m) => [m.personId, m.how])).toEqual([["1", "name"]]);
    expect(matchRow(rows[1], people).map((m) => [m.personId, m.how])).toEqual([["2", "address"]]);
    expect(matchRow(rows[2], people).map((m) => [m.personId, m.how])).toEqual([["4", "maybe"]]);
    expect(matchRow(rows[3], people).map((m) => [m.personId, m.how])).toEqual([["3", "maybe"]]);
    expect(matchRow(rows[4], people)).toEqual([]);
  });
});
