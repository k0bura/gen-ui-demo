import { describe, expect, it } from "vitest";
import { checkTurnstile, isLocalHost, type Fetcher } from "../src/demo/turnstile-verify";

const answering = (body: unknown) => {
  const calls: { url: string; body: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fetcher, calls };
};

describe("checkTurnstile", () => {
  it("lets local development through when no secret is set", async () => {
    for (const hostname of ["localhost", "127.0.0.1"]) {
      expect(await checkTurnstile({ secret: undefined, token: undefined, hostname })).toEqual({ ok: true });
    }
    expect(isLocalHost("gen-ui.example.com")).toBe(false);
  });

  it("fails closed on a deployed host with no secret", async () => {
    const r = await checkTurnstile({ secret: undefined, token: "t", hostname: "gen-ui.example.com" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it("rejects a missing or oversized token without calling Cloudflare", async () => {
    const { fetcher, calls } = answering({ success: true });
    for (const token of [undefined, "", 42, "x".repeat(3000)]) {
      const r = await checkTurnstile({ secret: "s", token, hostname: "localhost", fetcher });
      expect(r).toMatchObject({ ok: false, status: 403 });
    }
    expect(calls).toHaveLength(0);
  });

  it("requires a token even on localhost once a secret is set", async () => {
    const r = await checkTurnstile({ secret: "s", token: undefined, hostname: "localhost" });
    expect(r.ok).toBe(false);
  });

  it("accepts a token Cloudflare verifies, and sends secret, token and ip", async () => {
    const { fetcher, calls } = answering({ success: true });
    const r = await checkTurnstile({ secret: "sek", token: "tok", hostname: "h.example", remoteIp: "203.0.113.9", fetcher });
    expect(r).toEqual({ ok: true });
    expect(calls[0].url).toContain("/turnstile/v0/siteverify");
    const sent = new URLSearchParams(calls[0].body);
    expect(sent.get("secret")).toBe("sek");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("203.0.113.9");
  });

  it("rejects a token Cloudflare does not verify", async () => {
    const { fetcher } = answering({ success: false, "error-codes": ["invalid-input-response"] });
    const r = await checkTurnstile({ secret: "s", token: "bad", hostname: "h.example", fetcher });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses when the verification service cannot be reached", async () => {
    const fetcher: Fetcher = async () => {
      throw new Error("network down");
    };
    const r = await checkTurnstile({ secret: "s", token: "tok", hostname: "h.example", fetcher });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
});
