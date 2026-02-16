import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { sendNotification } from "../src/notify.js";
import type { NtfyConfig } from "../src/config.js";
import {
  server,
  captureHandler,
  getCapturedRequest,
  resetCapturedRequest,
} from "./msw-helpers.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  resetCapturedRequest();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("sendNotification", () => {
  it("should send a POST request to the ntfy server with correct headers and body", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test Title",
      message: "Test body",
      tags: "robot",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://ntfy.sh/my-topic");
    expect(captured!.method).toBe("POST");
    expect(captured!.headers.get("Title")).toBe("Test Title");
    expect(captured!.headers.get("Priority")).toBe("default");
    expect(captured!.headers.get("Tags")).toBe("robot");
    expect(captured!.body).toBe("Test body");
  });

  it("should not include Authorization header when token is not set", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test Title",
      message: "Test body",
      tags: "robot",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Authorization")).toBeNull();
  });

  it("should include Authorization header when token is set", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      token: "my-secret-token",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test",
      message: "body",
      tags: "tag",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Authorization")).toBe(
      "Bearer my-secret-token"
    );
  });

  it("should use payload.priority when set, overriding config.priority", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test",
      message: "body",
      tags: "tag",
      priority: "high",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Priority")).toBe("high");
  });

  it("should use config.priority when payload.priority is not set", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "low",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test",
      message: "body",
      tags: "tag",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Priority")).toBe("low");
  });

  it("should include X-Icon header from config.iconUrl", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await sendNotification(config, {
      title: "Test",
      message: "body",
      tags: "tag",
    });

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("X-Icon")).toBe(
      "https://example.com/icon.png"
    );
  });

  it("should abort the request when fetchTimeout is set and server is slow", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", async () => {
        await delay(5000);
        return HttpResponse.text("ok");
      })
    );

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
      fetchTimeout: 50,
    };

    await expect(
      sendNotification(config, {
        title: "Test",
        message: "body",
        tags: "tag",
      })
    ).rejects.toThrow();
  });

  it("should succeed when fetchTimeout is not set even with a slightly slow server", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", async () => {
        await delay(50);
        return HttpResponse.text("ok");
      })
    );

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await expect(
      sendNotification(config, {
        title: "Test",
        message: "body",
        tags: "tag",
      })
    ).resolves.toBeUndefined();
  });

  it("should throw when the server responds with a non-ok status", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", () => {
        return new HttpResponse(null, {
          status: 500,
          statusText: "Server Error",
        });
      })
    );

    const config: NtfyConfig = {
      topic: "my-topic",
      server: "https://ntfy.sh",
      priority: "default",
      iconUrl: "https://example.com/icon.png",
    };

    await expect(
      sendNotification(config, {
        title: "Test",
        message: "body",
        tags: "tag",
      })
    ).rejects.toThrow("500");
  });
});
