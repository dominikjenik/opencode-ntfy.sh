import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type ConfigDeps } from "../src/config.js";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")
);
const VERSION: string = pkg.version;

const CONFIG_PATH = join(
  "/mock-home",
  ".config",
  "opencode",
  "opencode-ntfy.json"
);

function createDeps(
  configExists: boolean,
  configContent?: string
): ConfigDeps {
  return {
    homedir: () => "/mock-home",
    existsSync: (path) => {
      if (String(path) === CONFIG_PATH) return configExists;
      return existsSync(String(path));
    },
    readConfigFile: (path) => {
      if (String(path) === CONFIG_PATH) {
        if (configContent === undefined) {
          throw new Error(`ENOENT: no such file or directory, open '${String(path)}'`);
        }
        return configContent;
      }
      return readFileSync(String(path), "utf-8");
    },
  };
}

function createDepsWithConfig(config: Record<string, unknown>): ConfigDeps {
  return createDeps(true, JSON.stringify(config));
}

function createDepsNoConfig(): ConfigDeps {
  return createDeps(false);
}

function createDepsInvalidJson(): ConfigDeps {
  return createDeps(true, "not valid json {{{");
}

describe("loadConfig", () => {
  it("should return undefined when config file does not exist", () => {
    expect(loadConfig(createDepsNoConfig())).toBeUndefined();
  });

  it("should return a config object with the topic when config file exists", () => {
    const config = loadConfig(createDepsWithConfig({ topic: "my-topic" }));
    expect(config).toBeDefined();
    expect(config!.topic).toBe("my-topic");
  });

  it("should throw when config file contains invalid JSON", () => {
    expect(() => loadConfig(createDepsInvalidJson())).toThrow("invalid JSON");
  });

  it("should throw when topic is missing", () => {
    expect(() => loadConfig(createDepsWithConfig({}))).toThrow("topic");
  });

  it("should throw when topic is empty string", () => {
    expect(() => loadConfig(createDepsWithConfig({ topic: "" }))).toThrow(
      "topic"
    );
  });

  it("should use default server and priority when not specified", () => {
    const config = loadConfig(createDepsWithConfig({ topic: "test" }));
    expect(config!.server).toBe("https://ntfy.sh");
    expect(config!.priority).toBe("default");
    expect(config!.token).toBeUndefined();
  });

  it("should use custom server, token, and priority from config file", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        server: "https://custom.ntfy.sh",
        token: "my-secret-token",
        priority: "high",
      })
    );
    expect(config!.server).toBe("https://custom.ntfy.sh");
    expect(config!.token).toBe("my-secret-token");
    expect(config!.priority).toBe("high");
  });

  it("should throw when priority is not a valid value", () => {
    expect(() =>
      loadConfig(createDepsWithConfig({ topic: "test", priority: "invalid" }))
    ).toThrow("priority");
  });

  it("should default iconUrl to dark mode GitHub raw URL using package version", () => {
    const config = loadConfig(createDepsWithConfig({ topic: "test" }));
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use light mode icon URL when icon.mode is light", () => {
    const config = loadConfig(
      createDepsWithConfig({ topic: "test", icon: { mode: "light" } })
    );
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should use dark mode icon URL when icon.mode is dark", () => {
    const config = loadConfig(
      createDepsWithConfig({ topic: "test", icon: { mode: "dark" } })
    );
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should default to dark mode when icon.mode is an invalid value", () => {
    const config = loadConfig(
      createDepsWithConfig({ topic: "test", icon: { mode: "neon" } })
    );
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use icon.variant.dark override when mode is dark", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        icon: { variant: { dark: "https://example.com/my-dark-icon.png" } },
      })
    );
    expect(config!.iconUrl).toBe("https://example.com/my-dark-icon.png");
  });

  it("should use icon.variant.light override when mode is light", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        icon: {
          mode: "light",
          variant: { light: "https://example.com/my-light-icon.png" },
        },
      })
    );
    expect(config!.iconUrl).toBe("https://example.com/my-light-icon.png");
  });

  it("should ignore icon.variant.light when mode is dark", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        icon: {
          mode: "dark",
          variant: { light: "https://example.com/my-light-icon.png" },
        },
      })
    );
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should ignore icon.variant.dark when mode is light", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        icon: {
          mode: "light",
          variant: { dark: "https://example.com/my-dark-icon.png" },
        },
      })
    );
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should default fetchTimeout to undefined when not set", () => {
    const config = loadConfig(createDepsWithConfig({ topic: "test" }));
    expect(config!.fetchTimeout).toBeUndefined();
  });

  it("should set fetchTimeout in milliseconds from config file", () => {
    const config = loadConfig(
      createDepsWithConfig({ topic: "test", fetchTimeout: "PT10S" })
    );
    expect(config!.fetchTimeout).toBe(10000);
  });

  it("should throw for invalid fetchTimeout value", () => {
    expect(() =>
      loadConfig(
        createDepsWithConfig({ topic: "test", fetchTimeout: "invalid" })
      )
    ).toThrow("Invalid ISO 8601 duration");
  });

  it("should parse events object with custom commands", () => {
    const config = loadConfig(
      createDepsWithConfig({
        topic: "test",
        events: {
          "session.idle": {
            titleCmd: 'printf "%s" "Custom Title"',
            messageCmd: 'printf "%s" "Custom Message"',
          },
        },
      })
    );
    expect(config!.events).toBeDefined();
    expect(config!.events!["session.idle"]!.titleCmd).toBe(
      'printf "%s" "Custom Title"'
    );
    expect(config!.events!["session.idle"]!.messageCmd).toBe(
      'printf "%s" "Custom Message"'
    );
  });

  it("should return undefined events when events is not in config", () => {
    const config = loadConfig(createDepsWithConfig({ topic: "test" }));
    expect(config!.events).toBeUndefined();
  });
});

describe("JSON Schema", () => {
  it("should have a valid JSON Schema file at opencode-ntfy.schema.json", () => {
    const schemaPath = join(
      import.meta.dirname,
      "..",
      "opencode-ntfy.schema.json"
    );
    expect(existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("topic");
    expect(schema.additionalProperties).toBe(false);
  });

  it("should define all config properties in the schema", () => {
    const schemaPath = join(
      import.meta.dirname,
      "..",
      "opencode-ntfy.schema.json"
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const properties = Object.keys(schema.properties);
    expect(properties).toContain("$schema");
    expect(properties).toContain("topic");
    expect(properties).toContain("server");
    expect(properties).toContain("token");
    expect(properties).toContain("priority");
    expect(properties).toContain("icon");
    expect(properties).toContain("fetchTimeout");
    expect(properties).toContain("events");
  });

  it("should be listed in package.json files array", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkgContent = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkgContent.files).toContain("opencode-ntfy.schema.json");
  });
});
