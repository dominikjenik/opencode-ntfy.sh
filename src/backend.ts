import type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
} from "opencode-notification-sdk";
import type { NtfyBackendConfig } from "./config.js";

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
  config: NtfyBackendConfig
): NotificationBackend {
  return {
    async send(context: NotificationContext): Promise<void> {
      const url = `${config.server}/${config.topic}`;

      const title = DEFAULT_TITLES[context.event] ?? "";
      const message = DEFAULT_MESSAGES[context.event] ?? "";
      const tags = DEFAULT_TAGS[context.event] ?? "";

      const headers: Record<string, string> = {
        Title: title,
        Priority: config.priority,
        Tags: tags,
        "X-Icon": config.iconUrl,
        ...(config.token
          ? { Authorization: `Bearer ${config.token}` }
          : {}),
      };

      const fetchOptions: RequestInit = {
        method: "POST",
        headers,
        body: message,
        ...(config.fetchTimeout !== undefined
          ? { signal: AbortSignal.timeout(config.fetchTimeout) }
          : {}),
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(
          `ntfy request failed: ${response.status} ${response.statusText}`
        );
      }
    },
  };
}
