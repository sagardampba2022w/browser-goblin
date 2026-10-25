import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import registerBrowserTools from "../extensions/pi-browser/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.PI_BROWSER_AGENT_BROWSER_BIN || join(root, "node_modules/.bin/agent-browser");
const session = `smoke-${randomUUID().slice(0, 8)}`;
await mkdir(join(root, "screenshots"), { recursive: true });
const workDir = await mkdtemp(join(root, "screenshots/smoke-"));
const configFile = join(workDir, "agent-browser.json");
await writeFile(configFile, "{}\n");
process.env.PI_BROWSER_AGENT_BROWSER_BIN = binary;
process.env.PI_BROWSER_ARTIFACT_DIR = join(workDir, "artifacts");

// Ignore personal backend defaults and use a unique daemon/restore namespace.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AGENT_BROWSER_")));
env.AGENT_BROWSER_CONFIG = configFile;
env.AGENT_BROWSER_NAMESPACE = session;
const exec = promisify(execFile);
const tools = new Map();
registerBrowserTools({
	on() {},
	registerCommand() {},
	registerTool(tool) { tools.set(tool.name, tool); },
	async exec(command, args, options) {
		try {
			const result = await exec(command, args, { ...options, cwd: root, env, maxBuffer: 8 * 1024 * 1024 });
			return { ...result, code: 0 };
		} catch (error) {
			if (typeof error.code !== "number" || error.killed) throw error;
			return { stdout: error.stdout, stderr: error.stderr, code: error.code };
		}
	},
});

async function call(name, params = {}) {
	const tool = tools.get(name);
	assert.ok(tool, `Tool registered: ${name}`);
	return tool.execute(randomUUID(), { session, restore: false, ...params }, undefined, undefined, { cwd: root });
}

function text(result) {
	return result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
}

function refFor(result, role, name) {
	const line = text(result).split("\n").find((line) => line.includes(`${role} "${name}"`));
	const ref = line?.match(/\[ref=(e\d+)\]/)?.[1];
	assert.ok(ref, `Snapshot contains ${role} ${name}: ${text(result)}`);
	return `@${ref}`;
}

const server = createServer((request, response) => {
	if (request.url === "/favicon.ico") {
		response.writeHead(204).end();
		return;
	}
	response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	response.end(`<!doctype html>
<html lang="en"><head><title>Goblin smoke fixture</title></head><body>
<h1>Goblin smoke fixture</h1>
<form><label for="name">Name</label><input id="name" name="name">
<button type="submit">Submit</button></form>
<p id="result" role="status">Ready</p>
<a href="/next">Next page</a>
<script>
console.info("goblin-smoke-console");
document.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#result").textContent = "Hello " + document.querySelector("#name").value;
});
</script></body></html>`);
});

try {
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const url = `http://127.0.0.1:${server.address().port}`;
	const opened = await call("browser_open", { url, enableReactDevtools: true, headed: false });
	assert.match(text(opened), /Goblin smoke fixture/);
	const nameRef = refFor(opened, "textbox", "Name");
	const submitRef = refFor(opened, "button", "Submit");

	// Reuse the original refs after another snapshot and same-document updates.
	await call("browser_snapshot", { interactiveOnly: true });
	await call("browser_fill", { selector: nameRef, text: "Goblin" });
	assert.match(text(await call("browser_click", { selector: submitRef })), /Hello Goblin/);
	assert.match(text(await call("browser_fill", { selector: nameRef, text: "Enter", submit: true })), /Hello Enter/);
	await call("browser_press", { key: "Tab" });
	await call("browser_wait", { mode: "text", target: "Hello Enter" });
	await call("browser_wait", { mode: "load", target: "domcontentloaded" });
	assert.match(text(await call("browser_read")), /Hello Enter/);
	assert.match(text(await call("browser_eval", { script: "document.title" })), /Goblin smoke fixture/);
	console.log("PASS: open, persistent refs, forms, waits, read, and eval");

	assert.match(text(await call("browser_console")), /goblin-smoke-console/);
	await call("browser_errors");
	await call("browser_network", { status: "2xx", method: "GET" });
	await call("browser_debug", { kind: "session_info" });
	const vitals = await call("browser_vitals");
	assert.match(text(vitals), /"success"\s*:\s*true/);
	await call("browser_batch", { commands: ["get title", "snapshot -i"], bail: true });
	await call("browser_snapshot", { extraArgs: ["--delta"] });
	await call("browser_snapshot", { extraArgs: ["--delta"] });
	console.log("PASS: diagnostics, vitals, batch, and snapshot delta compatibility");

	await call("browser_tabs", { action: "new", url, label: "smoke-tab" });
	assert.match(text(await call("browser_tabs", { action: "list" })), /smoke-tab/);
	await call("browser_tabs", { action: "switch", target: "smoke-tab" });
	await call("browser_tabs", { action: "close", target: "smoke-tab" });
	const snapshot = await call("browser_snapshot");
	await call("browser_click", { selector: refFor(snapshot, "link", "Next page") });
	assert.match(text(await call("browser_debug", { kind: "url" })), /\/next/);
	await call("browser_back");
	await call("browser_forward");
	await call("browser_reload");
	await call("browser_set_viewport", { preset: "mobile" });
	const screenshot = await call("browser_screenshot", { full: true, annotate: true });
	assert.ok((await stat(screenshot.details.artifactPath)).size > 0);
	assert.equal((await call("browser_artifacts_latest")).details.file.path, screenshot.details.artifactPath);
	console.log("PASS: tabs, navigation, viewport, screenshot, and artifact metadata");

	const qa = await call("browser_qa", { url, viewports: ["desktop", "tablet", "mobile"] });
	assert.equal(qa.details.screenshots.length, 3);
	for (const artifact of qa.details.screenshots) assert.ok((await stat(artifact.path)).size > 0);
	assert.match(text(qa), /Checks:/);
	assert.equal((await call("browser_artifacts_list")).details.count, 4);
	const cleanup = await call("browser_artifacts_clean");
	assert.equal(cleanup.details.dryRun, true);
	assert.equal(cleanup.details.candidates.length, 4);
	console.log("PASS: responsive QA and dry-run artifact cleanup");
	console.log(`Smoke test passed for session ${session}`);
} finally {
	try {
		await call("browser_close");
	} catch (error) {
		console.error("Failed to close the smoke-test browser:", error.message);
		process.exitCode = 1;
	} finally {
		await new Promise((resolve, reject) => {
			if (!server.listening) return resolve();
			server.close((error) => error ? reject(error) : resolve());
		});
		await rm(workDir, { recursive: true, force: true });
	}
}
