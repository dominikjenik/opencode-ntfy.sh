# opencode-ntfy.sh

[![CI](https://github.com/lannuttia/opencode-ntfy.sh/actions/workflows/ci.yml/badge.svg)](https://github.com/lannuttia/opencode-ntfy.sh/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/lannuttia/opencode-ntfy.sh/graph/badge.svg)](https://codecov.io/gh/lannuttia/opencode-ntfy.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/lannuttia/opencode-ntfy.sh/blob/main/LICENSE)
[![Snyk Advisor](https://snyk.io/advisor/npm-package/opencode-ntfy.sh/badge.svg)](https://snyk.io/advisor/npm-package/opencode-ntfy.sh)

An [OpenCode](https://opencode.ai) notification backend plugin for
[ntfy.sh](https://ntfy.sh). Built on the
[`opencode-notification-sdk`](https://www.npmjs.com/package/opencode-notification-sdk),
this plugin delivers push notifications to your phone or desktop when your AI
coding session finishes, encounters an error, or needs permission. Start a
long-running task, walk away, and get notified when it needs your attention.

## How It Works

This plugin is a **notification backend** for the `opencode-notification-sdk`.
The SDK handles common notification logic:

- **Event routing** -- classifying OpenCode events into notification types
- **Subagent suppression** -- silently suppressing notifications from sub-agent
  (child) sessions for `session.idle` and `session.error` events
- **Configuration loading** -- reading and parsing the config file, handling the
  `enabled` and `events` sections

This plugin is responsible for the ntfy.sh-specific concerns: producing
notification content (title and message), formatting and sending the HTTP POST
request, validating ntfy-specific configuration, and resolving the notification
icon URL.

## Notifications

The plugin sends notifications for three events:

- **Session Idle** -- The AI agent has finished its work and is waiting for
  input.
- **Session Error** -- The session encountered an error.
- **Permission Asked** -- The agent needs permission to perform an action.

### Default Tags

Each event type has a default tag corresponding to an
[emoji shortcode](https://docs.ntfy.sh/emojis/) supported by ntfy.sh:

| Event | Default Tag | Emoji |
|---|---|---|
| `session.idle` | `hourglass_done` | ⌛ |
| `session.error` | `warning` | ⚠️ |
| `permission.asked` | `lock` | 🔒 |

## Install

Add the package name to the `plugin` array in your OpenCode config file.

opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-ntfy.sh"]
}
```

## Configuration

Configuration is done through a JSON file at
`~/.config/opencode/notification-ntfy.json`.

You can reference the bundled JSON Schema for editor autocompletion and
validation by adding a `$schema` property:

```json
{
  "$schema": "node_modules/opencode-ntfy.sh/opencode-ntfy.schema.json",
  "backend": {
    "topic": "my-notifications"
  }
}
```

### Full Configuration Structure

The config file follows the SDK's configuration schema at the top level, with
ntfy-specific settings under the `backend` key.

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | `boolean` | No | `true` | Global kill switch for all notifications (handled by SDK). |
| `events` | `object` | No | (all enabled) | Per-event enable/disable toggles (handled by SDK). |
| `events.<type>.enabled` | `boolean` | No | `true` | Whether this event type triggers notifications (handled by SDK). |
| `backend` | `object` | No | `{}` | ntfy.sh-specific configuration (see below). |

### Backend Configuration Properties

The `backend` object contains all ntfy.sh-specific settings:

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `backend.topic` | `string` | **Yes** | -- | The ntfy.sh topic to publish to. |
| `backend.server` | `string` | No | `https://ntfy.sh` | The ntfy server URL. |
| `backend.token` | `string` | No | -- | Bearer token for authentication. |
| `backend.priority` | `string` | No | `default` | Notification priority (`min`, `low`, `default`, `high`, `max`). |
| `backend.icon` | `object` | No | -- | Icon configuration object. |
| `backend.icon.mode` | `string` | No | `dark` | Whether the target device uses `light` or `dark` mode. |
| `backend.icon.variant` | `object` | No | -- | Custom icon URL overrides per mode variant. |
| `backend.icon.variant.light` | `string` | No | -- | Custom icon URL override for light mode. |
| `backend.icon.variant.dark` | `string` | No | -- | Custom icon URL override for dark mode. |
| `backend.fetchTimeout` | `string` | No | -- | ISO 8601 duration for the HTTP request timeout (e.g., `PT10S`). |

### Example Configurations

Minimal configuration (`~/.config/opencode/notification-ntfy.json`):

```json
{
  "backend": {
    "topic": "my-opencode-notifications"
  }
}
```

With authentication and a self-hosted server:

```json
{
  "backend": {
    "topic": "my-opencode-notifications",
    "server": "https://ntfy.example.com",
    "token": "tk_mytoken",
    "priority": "high"
  }
}
```

Full configuration:

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "topic": "my-notifications",
    "server": "https://ntfy.sh",
    "priority": "default",
    "icon": {
      "mode": "dark"
    },
    "fetchTimeout": "PT10S"
  }
}
```

### Subscribing to Notifications

To receive notifications, subscribe to your topic using any
[ntfy client](https://docs.ntfy.sh/subscribe/):

- **Phone**: Install the ntfy app
  ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy),
  [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)) and subscribe to
  your topic.
- **Desktop**: Open `https://ntfy.sh/<your-topic>` in a browser.
- **CLI**: `curl -s ntfy.sh/<your-topic>/json`

## Development

### Prerequisites

- [Bun](https://bun.sh)

### Setup

```sh
git clone https://github.com/lannuttia/opencode-ntfy.sh.git
cd opencode-ntfy.sh
bun install
```

### Build

```sh
bun run build
```

This compiles TypeScript from `src/` to `dist/` via `tsc`.

### Test

```sh
bun run test
```

Or in watch mode:

```sh
bun run test:watch
```

## License

MIT
