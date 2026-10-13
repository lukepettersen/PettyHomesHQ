import { describe, expect, it } from "vitest";
import { extLabel, safeName, sizeLabel, uploadProblem } from "./documents";

describe("files", () => {
  it("cleans names", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("C:\\Users\\Luke\\PA <final>.pdf")).toBe("PA _final_.pdf");
    expect(safeName("..")).toBe("file");
  });
  it("labels and sizes", () => {
    expect(extLabel("Purchase Agreement.PDF")).toBe("PDF");
    expect(extLabel("notes")).toBe("FILE");
    expect(sizeLabel(2_500_000)).toBe("2.4 MB");
    expect(sizeLabel(300)).toBe("1 KB");
  });
  it("blocks empty, huge and program files", () => {
    expect(uploadProblem("a.pdf", 0)).toMatch(/empty/);
    expect(uploadProblem("a.pdf", 26 * 1024 * 1024)).toMatch(/25 MB/);
    expect(uploadProblem("setup.EXE", 10)).toMatch(/program file/);
    expect(uploadProblem("PA.pdf", 1000)).toBeNull();
  });
});
