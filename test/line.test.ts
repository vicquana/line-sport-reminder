import { afterEach, describe, expect, it, vi } from "vitest";
import { LineClient, verifyLineSignature } from "../src/line";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return btoa(String.fromCharCode(...signature));
}

describe("verifyLineSignature", () => {
  it("接受正確簽章並拒絕遭修改的 payload", async () => {
    const secret = "test-channel-secret";
    const body = '{"events":[]}';
    const signature = await sign(body, secret);

    await expect(verifyLineSignature(body, signature, secret)).resolves.toBe(true);
    await expect(verifyLineSignature(`${body} `, signature, secret)).resolves.toBe(false);
  });

  it("拒絕不合法 base64", async () => {
    await expect(verifyLineSignature("{}", "not-valid-base64!", "secret")).resolves.toBe(false);
  });
});

describe("LineClient.push", () => {
  it("5xx 時使用同一個 retry key 安全重試", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const retryKey = "4c476a24-9d64-4c1a-8d3f-bf4da024fc72";
    await new LineClient("token").push("C123", [{ type: "text", text: "test" }], retryKey);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.headers).toMatchObject({ "X-Line-Retry-Key": retryKey });
    }
  });

  it("LINE 回傳 409 時視為相同 retry key 已成功送達", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new LineClient("token").push(
        "C123",
        [{ type: "text", text: "test" }],
        "4c476a24-9d64-4c1a-8d3f-bf4da024fc72",
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("不可重試的 4xx 不會重送", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new LineClient("token").push(
        "C123",
        [{ type: "text", text: "test" }],
        "4c476a24-9d64-4c1a-8d3f-bf4da024fc72",
      ),
    ).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
