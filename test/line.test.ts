import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "../src/line";

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
