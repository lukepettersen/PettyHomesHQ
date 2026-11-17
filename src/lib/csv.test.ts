import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => expect(toCsv([["a,b", 'say "hi"', "x\ny"]])).toBe('﻿"a,b","say ""hi""","x\ny"\r\n'));
  it("defuses spreadsheet formulas", () => expect(toCsv([["=HYPERLINK(1)", "+1", "-2", "@x", "ok"]])).toBe("﻿'=HYPERLINK(1),'+1,'-2,'@x,ok\r\n"));
});
