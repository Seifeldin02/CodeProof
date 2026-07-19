export const PDF_RESUME_MAX_BYTES = 5 * 1024 * 1024;
const PDF_RESUME_MAX_TEXT_CHARACTERS = 50_000;

export type PdfResumeErrorCode = "INVALID_PDF_TYPE" | "PDF_TOO_LARGE" | "MALFORMED_PDF" | "PDF_HAS_NO_TEXT";

export class PdfResumeError extends Error {
  constructor(
    public readonly code: PdfResumeErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PdfResumeError";
  }
}

export async function extractPdfResumeText(file: File): Promise<string> {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new PdfResumeError("INVALID_PDF_TYPE", "Résumé uploads must be PDF files.", 400);
  }
  if (file.size === 0) throw new PdfResumeError("MALFORMED_PDF", "The uploaded PDF is empty.", 400);
  if (file.size > PDF_RESUME_MAX_BYTES) {
    throw new PdfResumeError("PDF_TOO_LARGE", "Résumé PDFs must be 5 MB or smaller.", 413);
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("ascii").decode(data.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new PdfResumeError("MALFORMED_PDF", "The uploaded file does not contain a valid PDF signature.", 400);
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    data,
    isEvalSupported: false,
    stopAtErrors: true,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\u0000/g, "").trim().slice(0, PDF_RESUME_MAX_TEXT_CHARACTERS);
    if (!text) {
      throw new PdfResumeError(
        "PDF_HAS_NO_TEXT",
        "No extractable text was found in the PDF. Scanned-image OCR is not supported; paste the résumé text instead.",
        422,
      );
    }
    return text;
  } catch (error) {
    if (error instanceof PdfResumeError) throw error;
    throw new PdfResumeError("MALFORMED_PDF", "The PDF could not be parsed safely.", 400);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
