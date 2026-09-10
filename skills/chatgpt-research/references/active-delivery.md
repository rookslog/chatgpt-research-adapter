# Active caller delivery

Development binding candidate: Codex Desktop's caller-owned code-mode cell with an awaited process watcher and `notify`. Installed-path qualification is required before advertising the tuple as supported. This is not a general promise for every Codex or other-harness session.

## Binding responsibilities

Use this path only when the current tool surface supplies `functions.exec`, `yield_control`, `notify`, ordinary process execution and process-output polling. An idle task, a closed app, and an active caller are different lifetimes. If required active delivery is unavailable, keep the operation activation-pending and report the limitation; a polling model agent is not a substitute.

After submit returns, retain the runtime config, operation reference, observer ID, route generation and last durable cursor. The integration cell—not the watch process—owns activation/renewal while that cell remains alive. Use the CLI's `runtime activate`, `renew` and `watch` help for exact arguments.

A bounded bridge does the following:

1. Activate the exact operation/observer/generation with a finite lease of at most60seconds. Establish a watcher from the retained cursor so events arriving during activation are recovered.
2. Yield control while keeping the cell's promises awaited. The caller can do independent work. A detached promise discarded when the cell ends does not provide active delivery.
3. Renew from the still-live cell before expiry; watch durable NDJSON events in bounded intervals shorter than the lease. Validate schema, operation identity, cursor and event IDs. Maintain a separate cursor for each observer. Reject malformed/truncated output instead of pretending delivery succeeded.
4. Send only concise completion/attention references through `notify`. Deduplicate stable event IDs; ignore routine watch-timeout events. Do not inject report content, credentials or provider-page text into an event notification.
5. Finish the bridge at the task's authorized deadline, on delivery loss, or after its selected result/attention has been delivered. Preserve references for reconnect; expiry does not clear browser-effect ownership, cancel work or resend a prompt.

`notify` is a helper supplied to the active code-mode cell. A child CLI cannot call it directly. CLI stdout alone is not proof that the requesting model context received an event. Root-only synthetic injection is not evidence for the installed runtime/binding path.

## Hosts and access

For a remote Linux runtime, use the already configured SSH route to execute the same CLI watch/renew commands. Quote structured arguments for the remote shell; a JSON-encoded string is not shell escaping. A job cannot choose an arbitrary SSH host or executable. A Linux result path is not a local Mac file: use authorized retrieval/export and compare hash/size before handing it back.

General task authorization belongs to the calling harness. Observer labels and parent references do not grant replacement authority. A stale generation must not silently replace an active recipient. A later binding for another harness should translate the same durable events rather than introduce a separate queue or model watcher.

## Qualification record

Before release, the installed path must demonstrate submit-return followed by independent caller work, completion/attention from product events, activation catch-up, duplicate/stale handling, and permitted remote result access. Use the release's bounded synthetic-event allowance. The command recipe is an implementation aid; reading it does not satisfy those checks.

## Bounded code-mode recipe

This is code for an active Codex `functions.exec` cell, not a Node script or a new model task. Fill the explicit installed executable, runtime config and returned operation reference from the caller's own receipts. Keep a persisted cursor/event-ID set when reconnecting. The local installed path and the equivalent explicitly quoted SSH command were exercised with synthetic events; live-provider completion is a separate gate.

```js
// @exec: {"yield_time_ms": 1000, "max_output_tokens": 1500}
const cli = "/absolute/installed/bin/chatgpt-research";
const config = "/absolute/runtime.json";
const operation = "operation reference from submit";
const observer = "caller-owned observer ID";
const generation = "unique generation for this active cell";
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const command = args => [cli, ...args].map(quote).join(" ");
let pending = "", cursor = 0;
const seen = new Set();
function consume(output) {
  pending += output;
  const lines = pending.split("\n");
  pending = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.schema !== "research.event.v1" || e.operation_ref !== operation ||
        !Number.isInteger(e.cursor) || typeof e.event_id !== "string")
      throw Error("Invalid watcher event");
    if (e.type === "watch.timeout" || seen.has(e.event_id)) continue;
    if (e.cursor <= cursor) throw Error("Non-monotonic event cursor");
    cursor = e.cursor; seen.add(e.event_id);
    if (e.type === "result.available" || e.type.endsWith(".attention"))
      notify({type:e.type, operation_ref:operation, result_ref:e.result_ref ?? null, event_id:e.event_id});
  }
}
let child = await tools.exec_command({
  cmd:command(["runtime","watch","--runtime",config,"--operation",operation,
    "--observer",observer,"--after",String(cursor),"--timeout-ms","50000","--json"]),
  yield_time_ms:1000, max_output_tokens:2500
});
consume(child.output);
if (!child.session_id) throw Error("Watcher exited before activation");
const active = await tools.exec_command({
  cmd:command(["runtime","activate","--runtime",config,"--operation",operation,
    "--observer",observer,"--generation",generation,"--ttl-ms","60000","--json"]),
  yield_time_ms:1000, max_output_tokens:1500
});
if (active.exit_code !== 0) throw Error("Observer activation failed");
text({watcher:"armed",operation_ref:operation});
await yield_control();
while (child.session_id) {
  child = await tools.write_stdin({session_id:child.session_id,chars:"",
    yield_time_ms:1000,max_output_tokens:2500});
  consume(child.output);
}
if (pending.trim() || child.exit_code !== 0) throw Error("Incomplete watcher stream");
text({watcher:"bounded interval ended",operation_ref:operation,cursor});
```

This example watches one bounded interval. For a longer authorized research run, the still-active cell must renew the same generation before expiry and keep watching from its cursor; ending this interval does not establish continued delivery. Preserve state on any watcher/renewal failure and report delivery attention. Do not restart research to repair notification. A changed harness/tool surface needs binding qualification before reuse.
