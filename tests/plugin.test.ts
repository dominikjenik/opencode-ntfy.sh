import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  server,
  captureHandler,
  getCapturedRequest,
  resetCapturedRequest,
} from "./msw-helpers.js";
import { createMockShell } from "./mock-shell.js";
import { createPlugin } from "../src/index.js";
import type { NtfyConfig } from "../src/config.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  resetCapturedRequest();
  server.resetHandlers();
});
afterAll(() => server.close());

function fakeLoadConfig(config: NtfyConfig | undefined) {
  return () => config;
}

function buildConfig(overrides: Partial<NtfyConfig> = {}): NtfyConfig {
  return {
    topic: "test-topic",
    server: "https://ntfy.sh",
    priority: "default",
    iconUrl: "https://example.com/icon.png",
    ...overrides,
  };
}

/**
 * Creates a mock client whose session.get() returns the given session data.
 * Uses a plain function with a captured calls array instead of vi.fn().
 */
function createMockClient(sessionData: { parentID?: string } = {}) {
  const calls: Array<{ path: { id: string } }> = [];
  return {
    calls,
    session: {
      get: (arg: { path: { id: string } }) => {
        calls.push(arg);
        return Promise.resolve({
          data: {
            id: "test-session",
            projectID: "proj-1",
            directory: "/home/user/my-project",
            title: "Test Session",
            version: "1",
            time: { created: Date.now(), updated: Date.now() },
            ...sessionData,
          },
          error: undefined,
        });
      },
    },
  };
}

/**
 * Creates a mock client whose session.get() rejects with an error.
 */
function createFailingMockClient() {
  const calls: Array<{ path: { id: string } }> = [];
  return {
    calls,
    session: {
      get: (arg: { path: { id: string } }) => {
        calls.push(arg);
        return Promise.reject(new Error("Network error"));
      },
    },
  };
}

function createMockInput(
  overrides: Partial<PluginInput> = {}
): PluginInput {
  return {
    // @ts-expect-error - mock client for testing; real client is not needed
    client: {},
    project: {
      id: "proj-1",
      worktree: "/home/user/my-project",
      time: { created: Date.now() },
    },
    directory: "/home/user/my-project",
    worktree: "/home/user/my-project",
    serverUrl: new URL("http://localhost:3000"),
    $: createMockShell(),
    ...overrides,
  };
}

/**
 * Helper to invoke the event hook with an event object.
 * Uses @ts-expect-error for events not in the current SDK's Event union
 * (e.g., permission.asked) that nonetheless exist at runtime.
 */
async function fireEvent(
  hooks: Awaited<ReturnType<Plugin>>,
  event: { type: string; properties: Record<string, unknown> }
): Promise<void> {
  // @ts-expect-error - allows passing event types not yet in the SDK's Event union
  await hooks.event!({ event });
}

describe("plugin", () => {
  it("should satisfy the Plugin type from @opencode-ai/plugin", async () => {
    const { plugin } = await import("../src/index.js");
    const p: Plugin = plugin;
    expect(p).toBe(plugin);
  });

  it("should be an async function that returns hooks with an event handler", async () => {
    server.use(captureHandler("https://ntfy.sh/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(buildConfig()),
    });
    const hooks = await pluginFn(createMockInput());

    expect(hooks).toBeDefined();
    expect(hooks.event).toBeDefined();
    expect(typeof hooks.event).toBe("function");
  });

  it("should send a notification when a session.idle event is received", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe(
      "https://ntfy.example.com/test-topic"
    );
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
  });

  it("should send a notification with error message when a session.error event is received", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe(
      "https://ntfy.example.com/test-topic"
    );
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Error");
  });

  it("should return empty hooks when config file does not exist", async () => {
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(undefined),
    });
    const hooks = await pluginFn(createMockInput());
    expect(hooks.event).toBeUndefined();
  });

  it("should not send a notification for non-session events", async () => {
    server.use(captureHandler("https://ntfy.sh/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(buildConfig()),
    });
    const hooks = await pluginFn(createMockInput());

    await fireEvent(hooks, {
      type: "message.updated",
      properties: { info: {} },
    });

    expect(getCapturedRequest()).toBeNull();
  });

  it("should send a notification when a permission.asked event is received via the event hook", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe(
      "https://ntfy.example.com/test-topic"
    );
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Permission Asked");
  });

  it("should have a default export that is the same as the named plugin export", async () => {
    const mod = await import("../src/index.js");
    expect(mod.default).toBe(mod.plugin);
  });

  it("should use custom title command for session.idle from events config", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "Custom Idle Title"') {
        return { stdout: "Custom Idle Title", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          events: {
            "session.idle": {
              titleCmd: 'echo "Custom Idle Title"',
            },
          },
        })
      ),
    });
    const hooks = await pluginFn(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe(
      "Custom Idle Title"
    );
  });

  it("should use custom priority command for session.error from events config", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const mock$ = createMockShell((cmd) => {
      if (cmd === "echo max") {
        return { stdout: "max", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          events: {
            "session.error": {
              priorityCmd: "echo max",
            },
          },
        })
      ),
    });
    const hooks = await pluginFn(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Priority")).toBe("max");
  });

  it("should substitute template variables in custom commands using underscored names", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "session.idle is done"') {
        return { stdout: "session.idle is done", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          events: {
            "session.idle": {
              titleCmd: 'echo "${event} is done"',
            },
          },
        })
      ),
    });
    const hooks = await pluginFn(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe(
      "session.idle is done"
    );
  });

  it("should include X-Icon header with the configured icon URL in session.idle notification", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          iconUrl:
            "https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v0.0.0/assets/opencode-icon-dark.png",
        })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    const iconHeader = getCapturedRequest()!.headers.get("X-Icon");
    expect(iconHeader).not.toBeNull();
    expect(iconHeader).toContain("opencode-icon-dark.png");
    expect(iconHeader).toContain("raw.githubusercontent.com");
  });

  it("should include X-Icon header with light icon URL when icon config resolves to light", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          iconUrl:
            "https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v0.0.0/assets/opencode-icon-light.png",
        })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    const iconHeader = getCapturedRequest()!.headers.get("X-Icon");
    expect(iconHeader).not.toBeNull();
    expect(iconHeader).toContain("opencode-icon-light.png");
    expect(iconHeader).toContain("raw.githubusercontent.com");
  });

  it("should use default title 'Agent Idle' for session.idle events", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
  });

  it("should use default title 'Agent Error' for session.error events", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Error");
  });

  it("should use default title 'Permission Asked' for permission.asked events", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Permission Asked");
  });

  it("should use default message for session.idle per spec", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "The agent has finished and is waiting for input."
    );
  });

  it("should use default message for session.error per spec", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "An error has occurred. Check the session for details."
    );
  });

  it("should use default message for permission.asked per spec", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({ server: "https://ntfy.example.com" })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "The agent needs permission to continue. Review and respond."
    );
  });

  it("should use custom icon URL from config", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          iconUrl: "https://example.com/custom-dark.png",
        })
      ),
    });
    const hooks = await pluginFn(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("X-Icon")).toBe(
      "https://example.com/custom-dark.png"
    );
  });

  describe("subagent suppression", () => {
    it("should suppress session.idle from child sessions (parentID is set)", async () => {
      server.use(captureHandler("https://ntfy.example.com/test-topic"));
      const mockClient = createMockClient({ parentID: "parent-session" });

      const pluginFn = createPlugin({
        loadConfig: fakeLoadConfig(
          buildConfig({ server: "https://ntfy.example.com" })
        ),
      });
      // @ts-expect-error - mock client for testing
      const hooks = await pluginFn(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "child-session" },
        },
      });

      expect(getCapturedRequest()).toBeNull();
      expect(mockClient.calls).toHaveLength(1);
      expect(mockClient.calls[0]).toEqual({
        path: { id: "child-session" },
      });
    });

    it("should suppress session.error from child sessions (parentID is set)", async () => {
      server.use(captureHandler("https://ntfy.example.com/test-topic"));
      const mockClient = createMockClient({ parentID: "parent-session" });

      const pluginFn = createPlugin({
        loadConfig: fakeLoadConfig(
          buildConfig({ server: "https://ntfy.example.com" })
        ),
      });
      // @ts-expect-error - mock client for testing
      const hooks = await pluginFn(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.error",
          properties: {
            sessionID: "child-session",
            error: {
              name: "UnknownError",
              data: { message: "Something went wrong" },
            },
          },
        },
      });

      expect(getCapturedRequest()).toBeNull();
      expect(mockClient.calls).toHaveLength(1);
      expect(mockClient.calls[0]).toEqual({
        path: { id: "child-session" },
      });
    });

    it("should send session.idle notification for parent sessions (no parentID)", async () => {
      server.use(captureHandler("https://ntfy.example.com/test-topic"));
      const mockClient = createMockClient();

      const pluginFn = createPlugin({
        loadConfig: fakeLoadConfig(
          buildConfig({ server: "https://ntfy.example.com" })
        ),
      });
      // @ts-expect-error - mock client for testing
      const hooks = await pluginFn(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "parent-session" },
        },
      });

      expect(getCapturedRequest()).not.toBeNull();
      expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
      expect(mockClient.calls).toHaveLength(1);
      expect(mockClient.calls[0]).toEqual({
        path: { id: "parent-session" },
      });
    });

    it("should send notification when session lookup fails (fall through on error)", async () => {
      server.use(captureHandler("https://ntfy.example.com/test-topic"));
      const mockClient = createFailingMockClient();

      const pluginFn = createPlugin({
        loadConfig: fakeLoadConfig(
          buildConfig({ server: "https://ntfy.example.com" })
        ),
      });
      // @ts-expect-error - mock client for testing
      const hooks = await pluginFn(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "some-session" },
        },
      });

      expect(getCapturedRequest()).not.toBeNull();
      expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
      expect(mockClient.calls).toHaveLength(1);
      expect(mockClient.calls[0]).toEqual({
        path: { id: "some-session" },
      });
    });

    it("should NOT suppress permission.asked events from subagent sessions", async () => {
      server.use(captureHandler("https://ntfy.example.com/test-topic"));
      const mockClient = createMockClient({ parentID: "parent-session" });

      const pluginFn = createPlugin({
        loadConfig: fakeLoadConfig(
          buildConfig({ server: "https://ntfy.example.com" })
        ),
      });
      // @ts-expect-error - mock client for testing
      const hooks = await pluginFn(createMockInput({ client: mockClient }));

      await fireEvent(hooks, {
        type: "permission.asked",
        properties: {
          id: "perm-1",
          permission: "file.write",
          sessionID: "child-session",
          patterns: ["config.json"],
          metadata: {},
          always: ["config.json"],
        },
      });

      expect(getCapturedRequest()).not.toBeNull();
      expect(getCapturedRequest()!.headers.get("Title")).toBe(
        "Permission Asked"
      );
    });
  });

  it("should not include a permission.ask hook (spec only uses event hook)", async () => {
    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(buildConfig()),
    });
    const hooks = await pluginFn(createMockInput());
    expect(hooks["permission.ask"]).toBeUndefined();
  });

  it("should use custom commands for permission.asked event via event hook", async () => {
    server.use(captureHandler("https://ntfy.example.com/test-topic"));
    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "Custom Permission"') {
        return { stdout: "Custom Permission", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const pluginFn = createPlugin({
      loadConfig: fakeLoadConfig(
        buildConfig({
          server: "https://ntfy.example.com",
          events: {
            "permission.asked": {
              titleCmd: 'echo "Custom Permission"',
            },
          },
        })
      ),
    });
    const hooks = await pluginFn(createMockInput({ $: mock$ }));

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe(
      "Custom Permission"
    );
  });
});
