import { describe, expect, it } from "vitest";
import { extractPdfResumeText, PDF_RESUME_MAX_BYTES } from "./pdf";

describe("PDF résumé validation", () => {
  it("rejects non-PDF uploads", async () => {
    const file = new File(["hello"], "resume.txt", { type: "text/plain" });
    await expect(extractPdfResumeText(file)).rejects.toMatchObject({ code: "INVALID_PDF_TYPE", status: 400 });
  });

  it("rejects oversized PDFs before parsing", async () => {
    const file = new File([new Uint8Array(PDF_RESUME_MAX_BYTES + 1)], "resume.pdf", { type: "application/pdf" });
    await expect(extractPdfResumeText(file)).rejects.toMatchObject({ code: "PDF_TOO_LARGE", status: 413 });
  });

  it("rejects malformed content with a PDF filename and MIME type", async () => {
    const file = new File(["not a pdf"], "resume.pdf", { type: "application/pdf" });
    await expect(extractPdfResumeText(file)).rejects.toMatchObject({ code: "MALFORMED_PDF", status: 400 });
  });
});
