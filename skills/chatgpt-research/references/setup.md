# Setup reference

This development candidate stages an owned local application. It does not yet qualify a public Standard research release. Read `setup --help` from the installed version; select local macOS, local Linux, or an SSH session on Linux. Remote macOS is deferred.

## Explicit locations

Choose an absolute, new versioned installation prefix, an existing source/package directory, and the dedicated Chrome profile. Keep durable runtime state, prepared prompts and content outside the versioned application prefix. The runtime root itself is created by `runtime init`; its parent must exist, and its ancestors must not be symlinks. Create the chosen content and preparation directories before use.

A components JSON file names already installed Node, Chrome, OpenCLI package and Bridge paths. Linux additionally names Xpra, Xvfb, the Xpra HTML client, display and viewer port. Missing components remain pending prerequisites. The current plan is explicit configuration, not automatic dependency discovery. Do not fill missing paths with guesses.

Run `setup plan` with the paths and topology shown by help, inspect its owned inventory and pending steps, then `setup apply --plan /absolute/plan.json`. The installed executable is `<prefix>/bin/chatgpt-research`. Repeating an identical plan preserves matching installed bytes; unknown edits are refused. Stage an update in a new versioned prefix; replacing a different installed version in place is not supported by this candidate. Preserve runtime history and profile when changing the application path.

## Runtime and authentication

Use `runtime init`, then `runtime configure` with its returned epoch and explicit execution host, browser context, content root, pinned OpenCLI source identity and browser-host JSON. The exact command flags are in `runtime --help`. This is a pre-release assembly path; a coherent fresh-host installation flow remains a release gate.

Start the ordinary software service with `runtime start`; `started` requires matching live service ownership. `runtime inspect` reports job state. `runtime stop` asks the owned service to stop observing/dispatching and does not cancel provider research or delete history.

Use `auth show` for necessary human sign-in in the same dedicated profile and `auth check` for observed handback. Linux's viewer binds only to loopback, with a private password file. Access it locally or through the explicitly configured SSH tunnel; keep that credential out of reports and logs. Human control pauses competing automation. A successful auth check means browser access is restored. It does not establish that provider research restarted.

Uninstall removes only inventory-checked application files and launcher. It preserves the profile and research history. An edited launcher or application file causes refusal. Never treat an unknown owner, stale PID or missing receipt as permission to erase state.
