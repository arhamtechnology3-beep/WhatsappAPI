import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMediaMessage, uploadMediaFromUrl } from "./meta-api";

// Capture the JSON body each helper POSTs to Meta so we can assert the
// exact payload shape per media kind without hitting the network.
interface CapturedBody {
  type?: string;
  image?: Record<string, unknown>;
  video?: Record<string, unknown>;
  document?: Record<string, unknown>;
  audio?: Record<string, unknown>;
}
let captured: CapturedBody | null = null;

function okFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    captured = init?.body ? (JSON.parse(init.body as string) as CapturedBody) : null;
    return {
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.TEST" }] }),
    } as Response;
  });
}

const BASE = {
  phoneNumberId: "test-phone",
  accessToken: "test-token",
  to: "1234567890",
  link: "https://cdn.example.com/file",
} as const;

describe("sendMediaMessage — payload shape", () => {
  beforeEach(() => {
    captured = null;
    vi.stubGlobal("fetch", okFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends image with a caption and no filename", async () => {
    await sendMediaMessage({ ...BASE, kind: "image", caption: "hello", filename: "x.png" });
    expect(captured?.type).toBe("image");
    expect(captured?.image).toEqual({ link: BASE.link, caption: "hello" });
    expect(captured?.image?.filename).toBeUndefined();
  });

  it("sends document with both caption and filename", async () => {
    await sendMediaMessage({
      ...BASE,
      kind: "document",
      caption: "invoice",
      filename: "invoice.pdf",
    });
    expect(captured?.type).toBe("document");
    expect(captured?.document).toEqual({
      link: BASE.link,
      caption: "invoice",
      filename: "invoice.pdf",
    });
  });

  it("sends audio with NO caption and NO filename (Meta rejects both)", async () => {
    await sendMediaMessage({
      ...BASE,
      kind: "audio",
      caption: "should be dropped",
      filename: "voice.ogg",
    });
    expect(captured?.type).toBe("audio");
    expect(captured?.audio).toEqual({ link: BASE.link });
  });

  it("throws when no link is provided", async () => {
    await expect(
      sendMediaMessage({ ...BASE, link: "", kind: "image" }),
    ).rejects.toThrow(/requires a link/);
  });
});

describe("uploadMediaFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads jpeg bytes to /media and returns the id", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, ...Array(40).fill(0)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("cdn.example.com")) {
          return {
            ok: true,
            headers: new Headers({ "content-type": "image/jpeg" }),
            arrayBuffer: async () => jpeg.buffer,
          } as Response;
        }
        expect(href).toContain("/media");
        return {
          ok: true,
          json: async () => ({ id: "MEDIA123" }),
        } as Response;
      }),
    );

    await expect(
      uploadMediaFromUrl({
        phoneNumberId: "test-phone",
        accessToken: "test-token",
        sourceUrl: "https://cdn.example.com/pickle.jpg",
      }),
    ).resolves.toBe("MEDIA123");
  });

  it("rejects webp that Meta cannot use as a template header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/webp" }),
        arrayBuffer: async () => new Uint8Array(40).buffer,
      })),
    );

    await expect(
      uploadMediaFromUrl({
        phoneNumberId: "test-phone",
        accessToken: "test-token",
        sourceUrl: "https://cdn.example.com/a.webp",
      }),
    ).rejects.toThrow(/Unsupported header image type/);
  });
});
