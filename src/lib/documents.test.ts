import { describe, expect, it } from "vitest";
import { extLabel, safeName, sizeLabel, storageProblem, storageSettings, uploadProblem } from "./documents";

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
    expect(uploadProblem("a.pdf", 101 * 1024 * 1024)).toMatch(/100 MB/);
    expect(uploadProblem("setup.EXE", 10)).toMatch(/program file/);
    expect(uploadProblem("PA.pdf", 1000)).toBeNull();
  });
});

describe("storage settings and errors", () => {
  it("trims values and cuts the bucket off the endpoint", () => {
    const s = storageSettings({ S3_ENDPOINT: " https://abc.r2.cloudflarestorage.com/pettyhomes-hq-files ", S3_BUCKET: "pettyhomes-hq-files\n", S3_ACCESS_KEY_ID: " k ", S3_SECRET_ACCESS_KEY: "s " });
    expect(s).toEqual({ endpoint: "https://abc.r2.cloudflarestorage.com", region: "auto", bucket: "pettyhomes-hq-files", accessKeyId: "k", secretAccessKey: "s" });
  });
  it("names the variable to fix", () => {
    expect(storageProblem({ name: "SignatureDoesNotMatch", message: "x" })).toMatch(/S3_SECRET_ACCESS_KEY/);
    expect(storageProblem({ name: "InvalidAccessKeyId" })).toMatch(/S3_ACCESS_KEY_ID/);
    expect(storageProblem({ name: "NoSuchBucket" })).toMatch(/S3_BUCKET/);
    expect(storageProblem({ name: "Forbidden", $metadata: { httpStatusCode: 403 } })).toMatch(/Object Read & Write/);
    expect(storageProblem({ name: "Error", message: "getaddrinfo ENOTFOUND x" })).toMatch(/S3_ENDPOINT/);
    expect(storageProblem({ name: "NotImplemented", message: "Header not implemented" })).toBe("The storage provider said: NotImplemented — Header not implemented");
  });
});
