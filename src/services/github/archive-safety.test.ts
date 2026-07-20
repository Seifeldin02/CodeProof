import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "./index";

/**
 * Regression cover for the untrusted-archive path guard in `client.ts`.
 *
 * A downloaded repository ZIP is attacker-controlled: any public repository can
 * contain entries that try to escape the extraction root. The client never
 * writes archives to disk, but these paths still flow into evidence citations,
 * so a traversal entry must be dropped rather than normalised into something
 * that looks like a legitimate source reference.
 */

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(files: Record<string, string>): ArrayBuffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const fileName = Buffer.from(name, "binary");
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    localParts.push(local, fileName, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  const output = Buffer.concat([...localParts, central, end]);
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

async function ingest(files: Record<string, string>) {
  const archive = storedZip(files);
  const fetcher = vi.fn(async () => new Response(archive, {
    status: 200,
    headers: { "content-length": String(archive.byteLength) },
  })) as unknown as typeof fetch;
  return new GitHubClient(fetcher).ingest("https://github.com/example/project");
}

const NUL = String.fromCharCode(0);

describe("untrusted archive path handling", () => {
  // Outer layer: the ZIP reader fails the whole archive closed rather than
  // partially trusting it, so a traversal entry never reaches path handling.
  it("rejects an archive containing directory-traversal entries", async () => {
    await expect(ingest({
      "project-main/src/index.ts": "export const value = 1;\n",
      "project-main/../../../etc/passwd": "root:x:0:0\n",
    })).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  it("rejects an archive containing absolute paths", async () => {
    await expect(ingest({
      "project-main/src/app.ts": "export const app = 1;\n",
      "/etc/shadow": "secret\n",
    })).rejects.toMatchObject({ code: "INVALID_ARCHIVE" });
  });

  // Inner layer: entries the ZIP reader accepts are still filtered by
  // `safeRelativePath` before they can become evidence citations.
  it("drops entries containing a null byte", async () => {
    const result = await ingest({
      "project-main/src/real.ts": "export const real = 1;\n",
      [`project-main/evil${NUL}.ts`]: "export const evil = 1;\n",
    });

    expect(result.treePaths).toEqual(["src/real.ts"]);
  });

  it("ignores bare root-level entries that carry no repository path", async () => {
    const result = await ingest({
      "project-main/src/kept.ts": "export const kept = 1;\n",
      "LICENSE": "MIT\n",
    });

    expect(result.treePaths).toEqual(["src/kept.ts"]);
  });
});
