import type { PluginInput } from "@opencode-ai/plugin";
import type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
} from "opencode-notification-sdk";
import { execSync } from "node:child_process";

const DEFAULT_TITLES: Record<NotificationEvent, string> = {
  "session.idle": "Agent Idle",
  "session.error": "Agent Error",
  "permission.asked": "Permission Asked",
};

const DEFAULT_MESSAGES: Record<NotificationEvent, string> = {
  "session.idle": "The agent has finished and is waiting for input.",
  "session.error": "An error has occurred. Check the session for details.",
  "permission.asked":
    "The agent needs permission to continue. Review and respond.",
};

const DEFAULT_TAGS: Record<NotificationEvent, string> = {
  "session.idle": "hourglass_done",
  "session.error": "warning",
  "permission.asked": "lock",
};

export function createNtfyBackend(
  config: NtfyBackendConfig,
  _?: PluginInput["$"]
): NotificationBackend {
  return {
    async send(context: NotificationContext): Promise<void> {
      const server = config.server || "https://ntfy.sh";
      const topic = config.topic;
      
      const title = DEFAULT_TITLES[context.event] || "OpenCode";
      const message = DEFAULT_MESSAGES[context.event] || "OpenCode event";
      const tags = DEFAULT_TAGS[context.event] || "";
      
      const safeMessage = message.replace(/'/g, "'\\''");
      const safeTitle = title.replace(/'/g, "'\\''");
      const cmd = `curl -s -m 10 -d '${safeMessage}' -H 'Title: ${safeTitle}' -H 'Tags: ${tags}' ${server}/${topic}`;
      
      try {
        execSync(cmd, { encoding: "utf-8", timeout: 15000 });
      } catch (e) {
        console.error("NTFY: notification failed:", (e as Error).message);
      }
    },
  };
}

export interface ValueTemplate {
  readonly value: string;
}

export interface CommandTemplate {
  readonly command: string;
}

export type ContentTemplate = ValueTemplate | CommandTemplate;

export type ContentTemplateMap = Partial<
  Record<NotificationEvent, ContentTemplate>
>;

export interface NtfyBackendConfig {
  topic: string;
  server: string;
  token?: string;
  priority: string;
  iconUrl: string;
  fetchTimeout?: number;
  title?: ContentTemplateMap;
  message?: ContentTemplateMap;
}
