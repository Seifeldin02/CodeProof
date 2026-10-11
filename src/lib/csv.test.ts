import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv export", () => {
  it("quotes cells that contain separators, quotes or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(3)).toBe("3");
  });

  it("keeps a cell that looks like a formula as text", () => {
    expect(csvCell("=HYPERLINK(\"https://example.test\")")).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvCell("+966 500 000 000")).toBe("'+966 500 000 000");
    expect(csvCell("-injected")).toBe("'-injected");
    expect(csvCell("@handle")).toBe("'@handle");
  });

  it("starts with a byte-order mark so Arabic text opens correctly", () => {
    const csv = toCsv([["المرشح", "Role"], ["أمينة حسن", "Backend Engineer"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe("\uFEFFالمرشح,Role\r\nأمينة حسن,Backend Engineer\r\n");
  });
});
