import { access, mkdir, mkdtemp, readdir, rm, stat, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateTail,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "../..");

const commonParams = {
	session: Type.Optional(
		Type.String({
			description:
				"agent-browser session id. Defaults to a stable Pi/worktree-scoped session for the current cwd.",
		}),
	),
	restore: Type.Optional(
		Type.Boolean({
			description: "Pass --restore so browser cookies/storage persist for this session. Defaults to true.",
		}),
	),
	extraArgs: Type.Optional(
		Type.Array(Type.String(), {
			description: "Advanced raw agent-browser CLI flags appended to this subcommand.",
		}),
	),
};

const BrowserOpenParams = Type.Object({
	...commonParams,
	url: Type.Optional(Type.String({ description: "URL to open. Omit to launch about:blank." })),
	profile: Type.Optional(
		Type.String({
			description:
				"Chrome profile name/path to snapshot and reuse for auth, e.g. Default. Use only on trusted machines.",
		}),
	),
	state: Type.Optional(Type.String({ description: "Path to an agent-browser auth state file to load." })),
	enableReactDevtools: Type.Optional(
		Type.Boolean({ description: "Launch with the embedded React DevTools hook for react_* debug commands." }),
	),
	headed: Type.Optional(Type.Boolean({ description: "Show a visible browser window. Defaults to agent-browser's headless/background mode." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh accessibility snapshot after opening. Defaults to true." })),
});

const BrowserSnapshotParams = Type.Object({
	...commonParams,
	interactiveOnly: Type.Optional(Type.Boolean({ description: "Pass -i to focus snapshot output on interactive elements." })),
});

const BrowserClickParams = Type.Object({
	...commonParams,
	selector: Type.String({ description: "Element ref from snapshot, e.g. @e2, or a CSS/semantic selector." }),
	newTab: Type.Optional(Type.Boolean({ description: "Open link target in a new tab when supported." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after the click. Defaults to true." })),
});

const BrowserFillParams = Type.Object({
	...commonParams,
	selector: Type.String({ description: "Element ref from snapshot, e.g. @e3, or selector." }),
	text: Type.String({ description: "Text/value to enter." }),
	submit: Type.Optional(Type.Boolean({ description: "Press Enter after filling." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after filling. Defaults to true." })),
});

const BrowserPressParams = Type.Object({
	...commonParams,
	key: Type.String({ description: "Key to press, e.g. Enter, Tab, Escape, Control+a." }),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after keypress. Defaults to true." })),
});

const BrowserWaitParams = Type.Object({
	...commonParams,
	target: Type.String({ description: "Selector, milliseconds, or wait target depending on mode." }),
	mode: Type.Optional(
		StringEnum(["selector", "ms", "text", "url", "load", "fn"] as const, {
			description: "Wait mode. Defaults to selector unless target is only digits, then ms.",
		}),
	),
	state: Type.Optional(Type.String({ description: "Element state for selector waits, e.g. visible or hidden." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after waiting. Defaults to true." })),
});

const BrowserScreenshotParams = Type.Object({
	...commonParams,
	path: Type.Optional(Type.String({ description: "Output image path. If omitted, agent-browser writes to a temp file." })),
	full: Type.Optional(Type.Boolean({ description: "Capture full page." })),
	annotate: Type.Optional(Type.Boolean({ description: "Annotate screenshot with element labels for visual QA." })),
});

const BrowserReadParams = Type.Object({
	...commonParams,
	url: Type.Optional(Type.String({ description: "URL to fetch/read. Omit to read rendered active-tab DOM." })),
	filter: Type.Optional(Type.String({ description: "Filter/narrow page sections or llms links." })),
	outline: Type.Optional(Type.Boolean({ description: "Print compact heading outline." })),
	llms: Type.Optional(StringEnum(["index", "full"] as const, { description: "Read nearest llms.txt index or llms-full.txt." })),
	requireMd: Type.Optional(Type.Boolean({ description: "Fail unless markdown is available." })),
	raw: Type.Optional(Type.Boolean({ description: "Print raw response body without extraction." })),
	json: Type.Optional(Type.Boolean({ description: "Request JSON output where supported." })),
});

const BrowserEvalParams = Type.Object({
	...commonParams,
	script: Type.String({ description: "JavaScript expression/script to evaluate in the active page." }),
	base64: Type.Optional(Type.Boolean({ description: "Pass script as base64 with -b." })),
});

const BrowserDebugParams = Type.Object({
	...commonParams,
	kind: StringEnum(
		[
			"console",
			"errors",
			"url",
			"title",
			"network",
			"vitals",
			"tabs",
			"react_tree",
			"session_info",
		] as const,
		{ description: "Browser/debug information to collect." },
	),
	json: Type.Optional(Type.Boolean({ description: "Request JSON output where supported." })),
	clear: Type.Optional(Type.Boolean({ description: "Clear console/errors after reading when supported." })),
	filter: Type.Optional(Type.String({ description: "Filter network requests when kind=network." })),
});

const BrowserBatchParams = Type.Object({
	...commonParams,
	commands: Type.Array(Type.String(), {
		description:
			"agent-browser commands to run as one batch, e.g. ['open http://localhost:3000', 'snapshot -i'].",
	}),
	bail: Type.Optional(Type.Boolean({ description: "Stop batch at first failing command." })),
});

const BrowserCloseParams = Type.Object({
	...commonParams,
	all: Type.Optional(Type.Boolean({ description: "Close all active agent-browser sessions." })),
});

const BrowserConsoleParams = Type.Object({
	...commonParams,
	json: Type.Optional(Type.Boolean({ description: "Return raw JSON console payload where supported." })),
	clear: Type.Optional(Type.Boolean({ description: "Clear console messages after reading." })),
});

const BrowserErrorsParams = Type.Object({
	...commonParams,
	clear: Type.Optional(Type.Boolean({ description: "Clear page errors after reading." })),
});

const BrowserNetworkParams = Type.Object({
	...commonParams,
	filter: Type.Optional(Type.String({ description: "Filter requests by substring." })),
	type: Type.Optional(Type.String({ description: "Resource type filter, e.g. xhr,fetch." })),
	method: Type.Optional(Type.String({ description: "HTTP method filter, e.g. POST." })),
	status: Type.Optional(Type.String({ description: "Status filter, e.g. 2xx or 400-499." })),
	requestId: Type.Optional(Type.String({ description: "Specific request id to inspect in detail." })),
});

const BrowserVitalsParams = Type.Object({
	...commonParams,
	url: Type.Optional(Type.String({ description: "Optional URL to measure. Omit for active page." })),
	json: Type.Optional(Type.Boolean({ description: "Return structured JSON. Defaults to true." })),
});

const BrowserTabsParams = Type.Object({
	...commonParams,
	action: StringEnum(["list", "new", "switch", "close"] as const, { description: "Tab action to perform." }),
	target: Type.Optional(Type.String({ description: "Tab id or label for switch/close, e.g. t1 or docs." })),
	url: Type.Optional(Type.String({ description: "URL for a new tab." })),
	label: Type.Optional(Type.String({ description: "Optional label for a new tab." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after new/switch. Defaults to true." })),
});

const BrowserSetViewportParams = Type.Object({
	...commonParams,
	preset: Type.Optional(StringEnum(["desktop", "tablet", "mobile"] as const, { description: "Viewport preset." })),
	width: Type.Optional(Type.Number({ description: "Viewport width in CSS pixels." })),
	height: Type.Optional(Type.Number({ description: "Viewport height in CSS pixels." })),
	scale: Type.Optional(Type.Number({ description: "Device scale factor, e.g. 2 for retina." })),
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after resizing. Defaults to true." })),
});

const BrowserNavigationParams = Type.Object({
	...commonParams,
	snapshotAfter: Type.Optional(Type.Boolean({ description: "Return a fresh snapshot after navigation. Defaults to true." })),
});

const BrowserArtifactsListParams = Type.Object({
	...commonParams,
	allSessions: Type.Optional(Type.Boolean({ description: "List artifacts for all browser sessions instead of the current/default session." })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of artifacts to return. Defaults to 50." })),
});

const BrowserArtifactsCleanParams = Type.Object({
	...commonParams,
	allSessions: Type.Optional(Type.Boolean({ description: "Clean artifacts for all sessions instead of the current/default session." })),
	olderThanDays: Type.Optional(Type.Number({ description: "Only clean artifacts older than this many days." })),
	confirm: Type.Optional(Type.Boolean({ description: "Actually delete files. Defaults to false, which performs a dry run." })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of artifacts to consider. Defaults to 500." })),
});

const BrowserArtifactsLatestParams = Type.Object({
	...commonParams,
	allSessions: Type.Optional(Type.Boolean({ description: "Find the latest artifact across all sessions instead of the current/default session." })),
});

const BrowserQaParams = Type.Object({
	...commonParams,
	url: Type.String({ description: "URL to open and visually QA." }),
	viewports: Type.Optional(
		Type.Array(StringEnum(["desktop", "tablet", "mobile"] as const), {
			description: "Viewport presets to capture. Defaults to desktop, tablet, mobile.",
		}),
	),
	headed: Type.Optional(Type.Boolean({ description: "Show a visible browser window during the QA pass." })),
	full: Type.Optional(Type.Boolean({ description: "Capture full-page screenshots. Defaults to true." })),
	annotate: Type.Optional(Type.Boolean({ description: "Annotate screenshots with element labels." })),
	checkNetworkErrors: Type.Optional(Type.Boolean({ description: "Report 4xx/5xx network requests. Defaults to true." })),
});

type CommonParams = Static<typeof BrowserSnapshotParams>;
type ExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;

interface BrowserDetails {
	command: string;
	args: string[];
	code: number;
	fullOutputPath?: string;
	truncation?: TruncationResult;
	session?: string;
	artifactPath?: string;
}

interface BrowserToolsConfig {
	headed?: "on" | "off" | "auto";
	defaultSession?: string;
	defaultViewport?: "desktop" | "tablet" | "mobile";
	artifactDir?: string;
}

interface ArtifactManifestEntry {
	path: string;
	name: string;
	session: string;
	createdAt: string;
	kind: "screenshot" | "qa-screenshot" | "other";
	url?: string;
	viewport?: string;
	annotated?: boolean;
	fullPage?: boolean;
}

let cachedAgentBrowserBin: string | undefined;
let currentSessionOverride: string | undefined;
let headedPreference: boolean | undefined;
let configCache: BrowserToolsConfig = {};

function configPath(): string {
	return join(homedir(), ".pi", "agent", "browser-tools.json");
}

function expandHome(path: string): string {
	return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function validateConfig(value: unknown): BrowserToolsConfig {
	if (!value || typeof value !== "object") return {};
	const raw = value as Record<string, unknown>;
	const config: BrowserToolsConfig = {};
	if (raw.headed === "on" || raw.headed === "off" || raw.headed === "auto") config.headed = raw.headed;
	if (typeof raw.defaultSession === "string" && raw.defaultSession.trim()) config.defaultSession = raw.defaultSession.trim();
	if (raw.defaultViewport === "desktop" || raw.defaultViewport === "tablet" || raw.defaultViewport === "mobile") config.defaultViewport = raw.defaultViewport;
	if (typeof raw.artifactDir === "string" && raw.artifactDir.trim()) config.artifactDir = raw.artifactDir.trim();
	return config;
}

async function loadConfig(): Promise<BrowserToolsConfig> {
	try {
		configCache = validateConfig(JSON.parse(await readFile(configPath(), "utf8")));
	} catch {
		configCache = {};
	}
	return configCache;
}

async function saveConfig(patch: BrowserToolsConfig): Promise<BrowserToolsConfig> {
	const merged: Record<string, unknown> = { ...(await loadConfig()), ...patch };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete merged[key];
	}
	const next = validateConfig(merged);
	await mkdir(dirname(configPath()), { recursive: true });
	await writeFile(configPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
	configCache = next;
	return next;
}

function applyLoadedConfig(config: BrowserToolsConfig): void {
	currentSessionOverride = config.defaultSession;
	headedPreference = config.headed === "auto" || config.headed === undefined ? undefined : config.headed === "on";
}

async function resolveAgentBrowserBin(): Promise<string> {
	if (cachedAgentBrowserBin) return cachedAgentBrowserBin;
	if (process.env.PI_BROWSER_AGENT_BROWSER_BIN) {
		cachedAgentBrowserBin = process.env.PI_BROWSER_AGENT_BROWSER_BIN;
		return cachedAgentBrowserBin;
	}

	const candidates = [
		resolve(PACKAGE_ROOT, "node_modules/.bin/agent-browser"),
		resolve(PACKAGE_ROOT, "node_modules/.bin/agent-browser.cmd"),
	];
	for (const candidate of candidates) {
		try {
			await access(candidate);
			cachedAgentBrowserBin = candidate;
			return cachedAgentBrowserBin;
		} catch {
			// Try next candidate.
		}
	}

	cachedAgentBrowserBin = "agent-browser";
	return cachedAgentBrowserBin;
}

function stableSessionId(ctx: ExtensionContext): string {
	const name = basename(ctx.cwd).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32) || "worktree";
	const hash = createHash("sha1").update(ctx.cwd).digest("hex").slice(0, 10);
	return `pi-${name}-${hash}`;
}

function commonArgs(params: Partial<CommonParams>, ctx: ExtensionContext): { args: string[]; session: string } {
	const session = params.session || currentSessionOverride || stableSessionId(ctx);
	const args = ["--session", session];
	if (params.restore !== false) args.push("--restore");
	return { args, session };
}

function browserArtifactRoot(): string {
	return expandHome(process.env.PI_BROWSER_ARTIFACT_DIR || configCache.artifactDir || join(homedir(), ".pi", "agent", "browser-artifacts"));
}

async function ensureArtifactDir(session: string): Promise<string> {
	const dir = join(browserArtifactRoot(), session);
	await mkdir(dir, { recursive: true });
	return dir;
}

function timestampForFile(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function localhostTip(url?: string): string | undefined {
	if (!url?.includes("0.0.0.0")) return undefined;
	return "Tip: if service workers, cookies, or browser APIs behave oddly, try http://localhost instead of http://0.0.0.0.";
}

function improveErrorMessage(text: string): string {
	const hints: string[] = [];
	if (/Could not locate element|Invalid snapshot ref|No element found/i.test(text)) {
		hints.push("Hint: the element ref may be stale. Take a fresh browser_snapshot and retry with the new @e ref.");
	}
	if (/ERR_CONNECTION_REFUSED/i.test(text)) {
		hints.push("Hint: the web server is not reachable. Check that the dev server is running and the port is correct.");
	}
	if (/command not found|ENOENT|not recognized/i.test(text)) {
		hints.push("Hint: agent-browser was not found. Run `npm install` in the browser-goblin package directory or set PI_BROWSER_AGENT_BROWSER_BIN.");
	}
	if (/Target page, context or browser has been closed|browser.*closed|No browser/i.test(text)) {
		hints.push("Hint: the browser session may be closed or crashed. Run browser_open again, or browser_close all sessions and retry.");
	}
	return hints.length ? `${text}\n\n${hints.join("\n")}` : text;
}

function isEmptySnapshot(text: string): boolean {
	return /\(empty page\)/i.test(text);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return;
	if (signal?.aborted) throw new Error("Cancelled");
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal) {
			const onAbort = () => {
				clearTimeout(timer);
				reject(new Error("Cancelled"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

interface ArtifactFile {
	session: string;
	name: string;
	path: string;
	size: number;
	mtimeMs: number;
}

async function safeReaddir(path: string) {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return [];
	}
}

async function collectArtifacts(
	ctx: ExtensionContext,
	options: { session?: string; allSessions?: boolean; limit?: number },
): Promise<{ root: string; files: ArtifactFile[] }> {
	const root = browserArtifactRoot();
	const sessions: Array<{ session: string; dir: string }> = [];
	if (options.allSessions) {
		for (const entry of await safeReaddir(root)) {
			if (entry.isDirectory()) sessions.push({ session: entry.name, dir: join(root, entry.name) });
		}
	} else {
		const session = options.session || currentSessionOverride || stableSessionId(ctx);
		sessions.push({ session, dir: join(root, session) });
	}

	const files: ArtifactFile[] = [];
	async function walk(session: string, dir: string) {
		for (const entry of await safeReaddir(dir)) {
			if (entry.name === "manifest.json") continue;
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(session, fullPath);
				continue;
			}
			if (!entry.isFile()) continue;
			try {
				const info = await stat(fullPath);
				files.push({ session, name: entry.name, path: fullPath, size: info.size, mtimeMs: info.mtimeMs });
			} catch {
				// Ignore files that disappear while listing.
			}
		}
	}

	for (const session of sessions) await walk(session.session, session.dir);
	files.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return { root, files: files.slice(0, Math.max(1, options.limit ?? 50)) };
}

function formatArtifactFiles(root: string, files: ArtifactFile[], totalLabel?: string): string {
	if (files.length === 0) return `Browser artifacts: ${root}\nNo artifacts found.`;
	const lines = [`Browser artifacts: ${root}`, totalLabel ?? `${files.length} artifact(s):`];
	for (const file of files) {
		const when = new Date(file.mtimeMs).toISOString();
		lines.push(`- [${file.session}] ${file.path} (${formatSize(file.size)}, ${when})`);
	}
	return lines.join("\n");
}

function manifestPath(session: string): string {
	return join(browserArtifactRoot(), session, "manifest.json");
}

async function readManifest(session: string): Promise<ArtifactManifestEntry[]> {
	try {
		const parsed = JSON.parse(await readFile(manifestPath(session), "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry): entry is ArtifactManifestEntry =>
			entry && typeof entry === "object" && typeof (entry as ArtifactManifestEntry).path === "string",
		);
	} catch {
		return [];
	}
}

async function recordArtifact(entry: ArtifactManifestEntry): Promise<void> {
	await ensureArtifactDir(entry.session);
	const existing = await readManifest(entry.session);
	const next = [entry, ...existing.filter((item) => item.path !== entry.path)].slice(0, 500);
	await writeFile(manifestPath(entry.session), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function latestArtifact(
	ctx: ExtensionContext,
	options: { session?: string; allSessions?: boolean },
): Promise<{ root: string; file?: ArtifactFile; manifest?: ArtifactManifestEntry }> {
	const { root, files } = await collectArtifacts(ctx, { session: options.session, allSessions: options.allSessions, limit: 1 });
	const file = files[0];
	if (!file) return { root };
	const manifest = (await readManifest(file.session)).find((entry) => entry.path === file.path);
	return { root, file, manifest };
}

async function cleanArtifacts(
	ctx: ExtensionContext,
	options: { session?: string; allSessions?: boolean; olderThanDays?: number; confirm?: boolean; limit?: number },
): Promise<{ root: string; candidates: ArtifactFile[]; deleted: ArtifactFile[]; dryRun: boolean }> {
	const limit = Math.max(1, options.limit ?? 500);
	const { root, files } = await collectArtifacts(ctx, {
		session: options.session,
		allSessions: options.allSessions,
		limit,
	});
	const cutoff = options.olderThanDays === undefined ? undefined : Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
	const candidates = cutoff === undefined ? files : files.filter((file) => file.mtimeMs < cutoff);
	const dryRun = options.confirm !== true;
	const deleted: ArtifactFile[] = [];
	if (!dryRun) {
		for (const file of candidates) {
			await rm(file.path, { force: true });
			deleted.push(file);
		}
	}
	return { root, candidates, deleted, dryRun };
}

async function formatOutput(
	command: string,
	args: string[],
	result: ExecResult,
	session?: string,
): Promise<{ text: string; details: BrowserDetails }> {
	const rawParts: string[] = [];
	if (result.stdout?.trim()) rawParts.push(result.stdout.trimEnd());
	if (result.stderr?.trim()) rawParts.push(`[stderr]\n${result.stderr.trimEnd()}`);
	if (rawParts.length === 0) rawParts.push("(no output)");
	const raw = rawParts.join("\n\n");

	const truncation = truncateTail(raw, {
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	});

	const details: BrowserDetails = {
		command,
		args,
		code: result.code ?? 0,
		session,
	};

	let text = `$ ${command} ${args.join(" ")}\n${truncation.content}`;
	if (truncation.truncated) {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-browser-"));
		const fullOutputPath = join(tempDir, "output.txt");
		await writeFile(fullOutputPath, raw, "utf8");
		details.truncation = truncation;
		details.fullOutputPath = fullOutputPath;
		text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
		text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
		text += ` Full output saved to: ${fullOutputPath}]`;
	}
	return { text, details };
}

async function runAgentBrowser(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	args: string[],
	session?: string,
	signal?: AbortSignal,
): Promise<{ text: string; details: BrowserDetails }> {
	const command = await resolveAgentBrowserBin();
	const result = await pi.exec(command, args, { signal, timeout: 120_000 });
	const formatted = await formatOutput(command, args, result, session);
	if ((result.code ?? 0) !== 0) {
		throw new Error(improveErrorMessage(formatted.text));
	}
	return formatted;
}

async function runSnapshotWithRetry(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	params: Partial<CommonParams>,
	session: string,
	signal?: AbortSignal,
	interactiveOnly = false,
) {
	let snapshotArgs = [...commonArgs(params, ctx).args, "snapshot"];
	if (interactiveOnly) snapshotArgs.push("-i");
	snapshotArgs = withExtra(snapshotArgs, params.extraArgs);
	let snapshot = await runAgentBrowser(pi, ctx, snapshotArgs, session, signal);
	for (let attempt = 0; attempt < 2 && isEmptySnapshot(snapshot.text); attempt++) {
		await sleep(750, signal);
		snapshot = await runAgentBrowser(pi, ctx, snapshotArgs, session, signal);
	}
	return snapshot;
}

async function runWithSnapshot(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	args: string[],
	params: Partial<CommonParams> & { snapshotAfter?: boolean },
	session: string,
	signal?: AbortSignal,
	options: { waitMs?: number } = {},
) {
	const primary = await runAgentBrowser(pi, ctx, args, session, signal);
	if (params.snapshotAfter === false) {
		return { content: [{ type: "text" as const, text: primary.text }], details: primary.details };
	}

	await sleep(options.waitMs ?? 350, signal);
	const snapshot = await runSnapshotWithRetry(pi, ctx, params, session, signal);
	return {
		content: [{ type: "text" as const, text: `${primary.text}\n\n--- Fresh snapshot ---\n${snapshot.text}` }],
		details: { ...primary.details, snapshot: snapshot.details },
	};
}

const VIEWPORT_PRESETS = {
	desktop: { width: 1440, height: 1000, scale: 1 },
	tablet: { width: 834, height: 1112, scale: 2 },
	mobile: { width: 390, height: 844, scale: 3 },
} as const;

type ViewportPresetName = keyof typeof VIEWPORT_PRESETS;

function withExtra(args: string[], extraArgs?: string[]): string[] {
	return extraArgs?.length ? [...args, ...extraArgs] : args;
}

function slugifyForFile(value: string): string {
	return value.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "page";
}

function screenshotFileName(kind: "screenshot" | "qa", options: { url?: string; viewport?: string; annotated?: boolean } = {}): string {
	const parts = [kind, options.url ? slugifyForFile(options.url) : undefined, options.viewport, timestampForFile(), options.annotated ? "annotated" : undefined].filter(Boolean);
	return `${parts.join("-")}.png`;
}

function parseCommandPayload(text: string): string {
	return text.split("\n[stderr]")[0].split("\n").filter((line) => !line.startsWith("$")).join("\n").trim();
}

function payloadLines(text: string): string[] {
	return text.split("\n").map((line) => line.trim()).filter((line) => Boolean(line) && !line.startsWith("[stderr]"));
}

function hasPayload(text: string): boolean {
	return payloadLines(text).length > 0;
}

function summarizeNetworkIssues(text: string): string {
	const lines = payloadLines(text);
	if (lines.length === 0) return "none";
	const faviconOnly = lines.every((line) => line.includes("/favicon.ico") && /\b404\b/.test(line));
	return `${lines.length} request(s)${faviconOnly ? " (favicon.ico 404 only)" : ""}`;
}

function formatNumber(value: unknown, suffix = ""): string | undefined {
	return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${suffix}` : undefined;
}

function summarizeVitals(text: string): string {
	try {
		const parsed = JSON.parse(text) as { success?: boolean; data?: Record<string, unknown>; error?: unknown };
		if (!parsed.success || !parsed.data) return parsed.error ? `error: ${String(parsed.error)}` : "not captured";
		const data = parsed.data;
		const lcp = data.lcp && typeof data.lcp === "object" ? (data.lcp as Record<string, unknown>).startTime : undefined;
		const cls = data.cls && typeof data.cls === "object" ? (data.cls as Record<string, unknown>).score : undefined;
		const metrics = [
			formatNumber(data.fcp, "ms") ? `FCP ${formatNumber(data.fcp, "ms")}` : undefined,
			formatNumber(lcp, "ms") ? `LCP ${formatNumber(lcp, "ms")}` : undefined,
			formatNumber(cls) ? `CLS ${formatNumber(cls)}` : undefined,
			formatNumber(data.ttfb, "ms") ? `TTFB ${formatNumber(data.ttfb, "ms")}` : undefined,
		].filter(Boolean);
		return metrics.length ? metrics.join(" · ") : "captured";
	} catch {
		return text ? "captured" : "not captured";
	}
}

async function currentBrowserUrl(pi: ExtensionAPI, ctx: ExtensionContext, session: string, signal?: AbortSignal): Promise<string | undefined> {
	try {
		const result = await runAgentBrowser(pi, ctx, [...commonArgs({ session }, ctx).args, "get", "url"], session, signal);
		return parseCommandPayload(result.text).split("\n")[0]?.trim() || undefined;
	} catch {
		return undefined;
	}
}

interface BrowserQaOptions extends Partial<CommonParams> {
	url: string;
	viewports?: ViewportPresetName[];
	headed?: boolean;
	full?: boolean;
	annotate?: boolean;
	checkNetworkErrors?: boolean;
	extraArgs?: string[];
}

async function runBrowserQa(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	params: BrowserQaOptions,
	signal?: AbortSignal,
): Promise<{ text: string; details: Record<string, unknown> }> {
	const common = commonArgs(params, ctx);
	const selected = (params.viewports?.length ? params.viewports : (["desktop", "tablet", "mobile"] as ViewportPresetName[]));
	const viewports = [...new Set(selected)];
	const fullPage = params.full !== false;
	const checkNetworkErrors = params.checkNetworkErrors !== false;
	const lines = [`Browser QA: ${params.url}`, `Session: ${common.session}`];
	const screenshots: ArtifactManifestEntry[] = [];

	let openArgs = [...common.args, "open"];
	if (params.headed ?? headedPreference) openArgs.push("--headed");
	openArgs = withExtra(openArgs, params.extraArgs);
	openArgs.push(params.url);
	await runAgentBrowser(pi, ctx, openArgs, common.session, signal);
	await sleep(600, signal);

	for (const viewportName of viewports) {
		const viewport = VIEWPORT_PRESETS[viewportName];
		await runAgentBrowser(
			pi,
			ctx,
			[...common.args, "set", "viewport", String(viewport.width), String(viewport.height), String(viewport.scale)],
			common.session,
			signal,
		);
		await sleep(350, signal);
		const dir = await ensureArtifactDir(common.session);
		const outputPath = join(dir, screenshotFileName("qa", { url: params.url, viewport: viewportName, annotated: params.annotate }));
		const screenshotArgs = [...common.args, "screenshot"];
		if (fullPage) screenshotArgs.push("--full");
		if (params.annotate) screenshotArgs.push("--annotate");
		screenshotArgs.push(outputPath);
		await runAgentBrowser(pi, ctx, screenshotArgs, common.session, signal);
		const url = await currentBrowserUrl(pi, ctx, common.session, signal);
		const entry: ArtifactManifestEntry = {
			path: outputPath,
			name: basename(outputPath),
			session: common.session,
			createdAt: new Date().toISOString(),
			kind: "qa-screenshot",
			url,
			viewport: viewportName,
			annotated: Boolean(params.annotate),
			fullPage,
		};
		await recordArtifact(entry);
		screenshots.push(entry);
		lines.push(`- ${viewportName}: ${outputPath}`);
	}

	const consoleResult = await runAgentBrowser(pi, ctx, [...common.args, "console"], common.session, signal);
	const errorsResult = await runAgentBrowser(pi, ctx, [...common.args, "errors"], common.session, signal);
	const vitalsResult = await runAgentBrowser(pi, ctx, [...common.args, "vitals", "--json"], common.session, signal);
	const networkResult = checkNetworkErrors
		? await runAgentBrowser(pi, ctx, [...common.args, "network", "requests", "--status", "400-599"], common.session, signal)
		: undefined;

	const consoleText = parseCommandPayload(consoleResult.text);
	const errorsText = parseCommandPayload(errorsResult.text);
	const networkText = networkResult ? parseCommandPayload(networkResult.text) : "";
	const vitalsText = parseCommandPayload(vitalsResult.text);
	const vitalsSummary = summarizeVitals(vitalsText);
	lines.push("", "Checks:");
	lines.push(`- Console: ${hasPayload(consoleText) ? `${payloadLines(consoleText).length} message(s)` : "no messages"}`);
	lines.push(`- Page errors: ${hasPayload(errorsText) ? `${payloadLines(errorsText).length} error(s)` : "none"}`);
	if (checkNetworkErrors) lines.push(`- Network 4xx/5xx: ${summarizeNetworkIssues(networkText)}`);
	lines.push(`- Vitals: ${vitalsSummary}`);
	if (hasPayload(consoleText)) lines.push("\nConsole output:\n", consoleText);
	if (hasPayload(errorsText)) lines.push("\nPage errors:\n", errorsText);
	if (hasPayload(networkText)) lines.push("\nNetwork 4xx/5xx:\n", networkText);
	const tip = localhostTip(params.url);
	if (tip) lines.push("", tip);

	return {
		text: lines.join("\n"),
		details: { session: common.session, screenshots, console: consoleText, errors: errorsText, network: networkText, vitals: vitalsText },
	};
}

const BROWSER_TOOLS = [
	"browser_open",
	"browser_snapshot",
	"browser_click",
	"browser_fill",
	"browser_press",
	"browser_wait",
	"browser_screenshot",
	"browser_read",
	"browser_eval",
	"browser_debug",
	"browser_console",
	"browser_errors",
	"browser_network",
	"browser_tabs",
	"browser_vitals",
	"browser_set_viewport",
	"browser_reload",
	"browser_back",
	"browser_forward",
	"browser_artifacts_list",
	"browser_artifacts_latest",
	"browser_artifacts_clean",
	"browser_qa",
	"browser_batch",
	"browser_close",
];
const CORE_TOOLS = [
	"browser_open",
	"browser_snapshot",
	"browser_click",
	"browser_fill",
	"browser_press",
	"browser_wait",
	"browser_screenshot",
	"browser_read",
	"browser_tabs",
	"browser_set_viewport",
	"browser_reload",
	"browser_back",
	"browser_forward",
	"browser_artifacts_list",
	"browser_artifacts_latest",
	"browser_qa",
	"browser_close",
];
const DEBUG_TOOLS = [
	...CORE_TOOLS,
	"browser_eval",
	"browser_debug",
	"browser_console",
	"browser_errors",
	"browser_network",
	"browser_vitals",
	"browser_batch",
	"browser_artifacts_clean",
];

function setBrowserToolProfile(pi: ExtensionAPI, profile: "core" | "debug" | "all" | "off") {
	const active = pi.getActiveTools().filter((name) => !BROWSER_TOOLS.includes(name));
	const desired = profile === "off" ? [] : profile === "core" ? CORE_TOOLS : profile === "debug" ? DEBUG_TOOLS : BROWSER_TOOLS;
	pi.setActiveTools([...new Set([...active, ...desired])]);
}

export default function piBrowserExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyLoadedConfig(await loadConfig());
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === "browser-headed") {
				const data = entry.data as { headed?: boolean } | undefined;
				if (typeof data?.headed === "boolean") headedPreference = data.headed;
			}
			if (entry.type === "custom" && entry.customType === "browser-session") {
				const data = entry.data as { session?: string } | undefined;
				if (typeof data?.session === "string") currentSessionOverride = data.session || undefined;
			}
		}
	});

	pi.registerCommand("browser-tools", {
		description: "Enable browser tool profile: core, debug, all, or off",
		getArgumentCompletions: (prefix) =>
			["core", "debug", "all", "off"].filter((p) => p.startsWith(prefix)).map((p) => ({ value: p, label: p })),
		handler: async (args, ctx) => {
			const profile = args.trim() as "core" | "debug" | "all" | "off";
			if (!["core", "debug", "all", "off"].includes(profile)) {
				ctx.ui.notify("Usage: /browser-tools core|debug|all|off", "warning");
				return;
			}
			setBrowserToolProfile(pi, profile);
			ctx.ui.notify(`Browser tools profile: ${profile}`, "info");
		},
	});

	pi.registerCommand("browser-session", {
		description: "Show or set the default agent-browser session. Use default/auto to return to worktree-scoped sessions.",
		handler: async (args, ctx) => {
			const next = args.trim();
			if (next) {
				currentSessionOverride = ["default", "auto"].includes(next) ? undefined : next;
				await saveConfig({ defaultSession: currentSessionOverride });
				pi.appendEntry("browser-session", { session: currentSessionOverride });
			}
			ctx.ui.notify(`Browser session: ${currentSessionOverride || stableSessionId(ctx)}${currentSessionOverride ? " (persisted)" : " (auto)"}`, "info");
		},
	});

	pi.registerCommand("browser-headed", {
		description: "Show or set visible browser preference for browser_open: on, off, or auto",
		getArgumentCompletions: (prefix) =>
			["on", "off", "auto"].filter((p) => p.startsWith(prefix)).map((p) => ({ value: p, label: p })),
		handler: async (args, ctx) => {
			const value = args.trim().toLowerCase();
			if (!value) {
				ctx.ui.notify(`Browser headed preference: ${headedPreference === undefined ? "auto" : headedPreference ? "on" : "off"}`, "info");
				return;
			}
			if (!["on", "off", "auto"].includes(value)) {
				ctx.ui.notify("Usage: /browser-headed on|off|auto", "warning");
				return;
			}
			headedPreference = value === "auto" ? undefined : value === "on";
			await saveConfig({ headed: value as "on" | "off" | "auto" });
			pi.appendEntry("browser-headed", { headed: headedPreference });
			ctx.ui.notify(`Browser headed preference: ${value} (persisted)`, "info");
		},
	});

	pi.registerCommand("browser-config", {
		description: "Show or update browser-tools defaults: show, viewport <preset>, artifact-dir <path>, reset",
		getArgumentCompletions: (prefix) =>
			["show", "viewport", "artifact-dir", "reset", "desktop", "tablet", "mobile"].filter((p) => p.startsWith(prefix)).map((p) => ({ value: p, label: p })),
		handler: async (args, ctx) => {
			const [action, ...rest] = args.trim().split(/\s+/).filter(Boolean);
			if (!action || action === "show") {
				const config = await loadConfig();
				ctx.ui.notify(`Browser config: ${configPath()}\n${JSON.stringify(config, null, 2)}`, "info");
				return;
			}
			if (action === "viewport") {
				const value = rest[0];
				if (!["desktop", "tablet", "mobile"].includes(value)) {
					ctx.ui.notify("Usage: /browser-config viewport desktop|tablet|mobile", "warning");
					return;
				}
				await saveConfig({ defaultViewport: value as "desktop" | "tablet" | "mobile" });
				ctx.ui.notify(`Browser default viewport: ${value}`, "info");
				return;
			}
			if (action === "artifact-dir") {
				const value = rest.join(" ").trim();
				if (!value) {
					ctx.ui.notify("Usage: /browser-config artifact-dir <path>", "warning");
					return;
				}
				await saveConfig({ artifactDir: value });
				ctx.ui.notify(`Browser artifact directory: ${expandHome(value)}`, "info");
				return;
			}
			if (action === "reset") {
				await mkdir(dirname(configPath()), { recursive: true });
				await writeFile(configPath(), "{}\n", "utf8");
				applyLoadedConfig(await loadConfig());
				ctx.ui.notify("Browser config reset.", "info");
				return;
			}
			ctx.ui.notify("Usage: /browser-config [show|viewport|artifact-dir|reset]", "warning");
		},
	});

	pi.registerCommand("browser-artifacts", {
		description: "Show, list, latest, or clean browser artifacts: /browser-artifacts [list|latest|clean] [--all] [--confirm]",
		getArgumentCompletions: (prefix) =>
			["list", "latest", "clean", "--all", "--confirm"].filter((p) => p.startsWith(prefix)).map((p) => ({ value: p, label: p })),
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const action = parts[0];
			const allSessions = parts.includes("--all");
			const confirm = parts.includes("--confirm");
			const session = currentSessionOverride || stableSessionId(ctx);
			if (!action) {
				const dir = await ensureArtifactDir(session);
				ctx.ui.notify(`Browser artifacts: ${dir}`, "info");
				return;
			}
			if (action === "list") {
				const { root, files } = await collectArtifacts(ctx, { allSessions, limit: 20 });
				ctx.ui.notify(formatArtifactFiles(root, files), "info");
				return;
			}
			if (action === "latest") {
				const latest = await latestArtifact(ctx, { allSessions });
				ctx.ui.notify(latest.file ? formatArtifactFiles(latest.root, [latest.file], "Latest artifact:") : `Browser artifacts: ${latest.root}\nNo artifacts found.`, "info");
				return;
			}
			if (action === "clean") {
				if (!confirm) {
					const result = await cleanArtifacts(ctx, { allSessions, limit: 100 });
					ctx.ui.notify(`Dry run: ${result.candidates.length} artifact(s) would be deleted. Re-run /browser-artifacts clean --confirm to delete.`, "warning");
					return;
				}
				const ok = await ctx.ui.confirm("Clean browser artifacts?", allSessions ? "Delete artifacts for all sessions?" : `Delete artifacts for ${session}?`);
				if (!ok) return;
				const result = await cleanArtifacts(ctx, { allSessions, confirm: true, limit: 1000 });
				ctx.ui.notify(`Deleted ${result.deleted.length} browser artifact(s).`, "info");
				return;
			}
			ctx.ui.notify("Usage: /browser-artifacts [list|latest|clean] [--all] [--confirm]", "warning");
		},
	});

	pi.registerCommand("browser-qa", {
		description: "Run a desktop/tablet/mobile visual QA pass: /browser-qa <url> [--viewports=desktop,mobile] [--headed] [--annotate]",
		getArgumentCompletions: (prefix) =>
			["--viewports=desktop,tablet,mobile", "--headed", "--annotate", "--no-full"].filter((p) => p.startsWith(prefix)).map((p) => ({ value: p, label: p })),
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const url = parts.find((part) => !part.startsWith("--"));
			if (!url) {
				ctx.ui.notify("Usage: /browser-qa <url> [--viewports=desktop,tablet,mobile] [--headed] [--annotate] [--no-full]", "warning");
				return;
			}
			const viewportArg = parts.find((part) => part.startsWith("--viewports="))?.split("=")[1];
			const viewports = viewportArg
				?.split(",")
				.filter((value): value is ViewportPresetName => value === "desktop" || value === "tablet" || value === "mobile");
			try {
				const result = await runBrowserQa(pi, ctx, {
					url,
					viewports,
					headed: parts.includes("--headed") ? true : undefined,
					annotate: parts.includes("--annotate"),
					full: parts.includes("--no-full") ? false : undefined,
				}, ctx.signal);
				ctx.ui.notify(result.text, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerCommand("browser-doctor", {
		description: "Run agent-browser doctor diagnostics",
		handler: async (_args, ctx) => {
			try {
				const result = await runAgentBrowser(pi, ctx, ["doctor"], undefined, ctx.signal);
				ctx.ui.notify(result.text, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "browser_open",
		label: "Browser Open",
		description: "Open or launch a browser using agent-browser. Returns a fresh accessibility snapshot by default.",
		promptSnippet: "Open a browser URL/session for web app testing and debugging.",
		promptGuidelines: [
			"Use browser_open before browser_snapshot/click/fill when testing a web app in the browser.",
			"Prefer browser_snapshot refs such as @e3 over CSS selectors for browser_click and browser_fill.",
		],
		parameters: BrowserOpenParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args];
			if (params.profile) args.push("--profile", params.profile);
			if (params.state) args.push("--state", params.state);
			args.push("open");
			if (params.enableReactDevtools) args.push("--enable", "react-devtools");
			if (params.headed ?? headedPreference) args.push("--headed");
			if (params.extraArgs) args.push(...params.extraArgs);
			if (params.url) args.push(params.url);
			const result = await runWithSnapshot(pi, ctx, args, params, common.session, signal, { waitMs: 600 });
			const tip = localhostTip(params.url);
			if (tip) result.content[0].text += `\n\n[${tip}]`;
			return result;
		},
	});

	pi.registerTool({
		name: "browser_snapshot",
		label: "Browser Snapshot",
		description: "Capture an accessibility tree with stable element refs for browser interaction. Output is truncated if large.",
		promptSnippet: "Capture the current page accessibility tree with refs like @e1 for precise interaction.",
		promptGuidelines: [
			"Use browser_snapshot after navigation or DOM changes because element refs are valid only for the latest page state.",
		],
		parameters: BrowserSnapshotParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			const result = await runSnapshotWithRetry(pi, ctx, params, common.session, signal, Boolean(params.interactiveOnly));
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_click",
		label: "Browser Click",
		description: "Click an element by snapshot ref (preferred) or selector. Returns a fresh snapshot by default.",
		promptSnippet: "Click a page element using a snapshot ref such as @e2.",
		parameters: BrowserClickParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "click", params.selector];
			if (params.newTab) args.push("--new-tab");
			args = withExtra(args, params.extraArgs);
			return runWithSnapshot(pi, ctx, args, params, common.session, signal);
		},
	});

	pi.registerTool({
		name: "browser_fill",
		label: "Browser Fill",
		description: "Clear and fill an input by snapshot ref (preferred) or selector. Returns a fresh snapshot by default.",
		promptSnippet: "Fill an input using a snapshot ref such as @e3.",
		parameters: BrowserFillParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "fill", params.selector, params.text];
			args = withExtra(args, params.extraArgs);
			const result = await runWithSnapshot(pi, ctx, args, params, common.session, signal);
			if (params.submit) {
				return runWithSnapshot(pi, ctx, [...common.args, "press", "Enter"], params, common.session, signal);
			}
			return result;
		},
	});

	pi.registerTool({
		name: "browser_press",
		label: "Browser Press",
		description: "Press a keyboard key in the active page. Returns a fresh snapshot by default.",
		parameters: BrowserPressParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "press", params.key];
			args = withExtra(args, params.extraArgs);
			return runWithSnapshot(pi, ctx, args, params, common.session, signal);
		},
	});

	pi.registerTool({
		name: "browser_wait",
		label: "Browser Wait",
		description: "Wait for selector, text, URL, load state, JS condition, or milliseconds. Returns a fresh snapshot by default.",
		parameters: BrowserWaitParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			const mode = params.mode || (/^\d+$/.test(params.target) ? "ms" : "selector");
			let args = [...common.args, "wait"];
			if (mode === "text") args.push("--text", params.target);
			else if (mode === "url") args.push("--url", params.target);
			else if (mode === "load") args.push("--load", params.target);
			else if (mode === "fn") args.push("--fn", params.target);
			else args.push(params.target);
			if (params.state) args.push("--state", params.state);
			args = withExtra(args, params.extraArgs);
			return runWithSnapshot(pi, ctx, args, params, common.session, signal);
		},
	});

	pi.registerTool({
		name: "browser_screenshot",
		label: "Browser Screenshot",
		description: "Take a browser screenshot. Use only when visual context matters; prefer browser_snapshot for interaction.",
		promptSnippet: "Capture a screenshot for visual QA, layout bugs, charts, or canvas/image-heavy pages.",
		parameters: BrowserScreenshotParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "screenshot"];
			if (params.full) args.push("--full");
			if (params.annotate) args.push("--annotate");
			args = withExtra(args, params.extraArgs);
			let outputPath = params.path;
			if (!outputPath) {
				const dir = await ensureArtifactDir(common.session);
				outputPath = join(dir, `screenshot-${timestampForFile()}${params.annotate ? "-annotated" : ""}.png`);
			}
			args.push(outputPath);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			const artifactPath = resolve(ctx.cwd, outputPath);
			const url = await currentBrowserUrl(pi, ctx, common.session, signal);
			await recordArtifact({
				path: artifactPath,
				name: basename(artifactPath),
				session: common.session,
				createdAt: new Date().toISOString(),
				kind: "screenshot",
				url,
				annotated: Boolean(params.annotate),
				fullPage: Boolean(params.full),
			});
			result.details.artifactPath = artifactPath;
			result.text += `\n\n[Browser artifact: ${artifactPath}]`;
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_read",
		label: "Browser Read",
		description: "Read agent-friendly text from a URL or the rendered active tab DOM, including authenticated client-side pages.",
		promptSnippet: "Read markdown/text from docs or rendered browser DOM without using visual interaction.",
		parameters: BrowserReadParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "read"];
			if (params.outline) args.push("--outline");
			if (params.llms) args.push("--llms", params.llms);
			if (params.requireMd) args.push("--require-md");
			if (params.raw) args.push("--raw");
			if (params.json) args.push("--json");
			if (params.filter) args.push("--filter", params.filter);
			args = withExtra(args, params.extraArgs);
			if (params.url) args.push(params.url);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_eval",
		label: "Browser Eval",
		description: "Evaluate JavaScript in the active page. Use sparingly for inspection/debugging, not as the primary interaction path.",
		parameters: BrowserEvalParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "eval"];
			if (params.base64) args.push("-b");
			args = withExtra(args, params.extraArgs);
			args.push(params.script);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_debug",
		label: "Browser Debug",
		description: "Collect browser debugging data: console, errors, network requests, URL/title, tabs, React tree, vitals, session info.",
		promptSnippet: "Inspect browser console/errors/network/React/vitals while debugging web apps.",
		parameters: BrowserDebugParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args];
			switch (params.kind) {
				case "console":
					args.push("console");
					if (params.json) args.push("--json");
					if (params.clear) args.push("--clear");
					break;
				case "errors":
					args.push("errors");
					if (params.clear) args.push("--clear");
					break;
				case "url":
					args.push("get", "url");
					break;
				case "title":
					args.push("get", "title");
					break;
				case "network":
					args.push("network", "requests");
					if (params.filter) args.push("--filter", params.filter);
					break;
				case "vitals":
					args.push("vitals");
					if (params.json !== false) args.push("--json");
					break;
				case "tabs":
					args.push("tab");
					break;
				case "react_tree":
					args.push("react", "tree");
					break;
				case "session_info":
					args.push("session", "info", "--json");
					break;
			}
			args = withExtra(args, params.extraArgs);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});


	pi.registerTool({
		name: "browser_console",
		label: "Browser Console",
		description: "Read browser console messages. Optionally return JSON or clear after reading.",
		parameters: BrowserConsoleParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "console"];
			if (params.json) args.push("--json");
			if (params.clear) args.push("--clear");
			args = withExtra(args, params.extraArgs);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_errors",
		label: "Browser Errors",
		description: "Read uncaught JavaScript/page errors. Optionally clear after reading.",
		parameters: BrowserErrorsParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "errors"];
			if (params.clear) args.push("--clear");
			args = withExtra(args, params.extraArgs);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_network",
		label: "Browser Network",
		description: "Inspect tracked network requests or a specific request id.",
		parameters: BrowserNetworkParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "network"];
			if (params.requestId) {
				args.push("request", params.requestId);
			} else {
				args.push("requests");
				if (params.filter) args.push("--filter", params.filter);
				if (params.type) args.push("--type", params.type);
				if (params.method) args.push("--method", params.method);
				if (params.status) args.push("--status", params.status);
			}
			args = withExtra(args, params.extraArgs);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_vitals",
		label: "Browser Vitals",
		description: "Measure Web Vitals and hydration summary for the active page or URL.",
		parameters: BrowserVitalsParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "vitals"];
			if (params.json !== false) args.push("--json");
			args = withExtra(args, params.extraArgs);
			if (params.url) args.push(params.url);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_tabs",
		label: "Browser Tabs",
		description: "List, create, switch, or close browser tabs by stable tab id or label.",
		parameters: BrowserTabsParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "tab"];
			if (params.action === "new") {
				args.push("new");
				if (params.label) args.push("--label", params.label);
				if (params.url) args.push(params.url);
			} else if (params.action === "switch") {
				if (!params.target) throw new Error("browser_tabs switch requires target");
				args.push(params.target);
			} else if (params.action === "close") {
				args.push("close");
				if (params.target) args.push(params.target);
			}
			args = withExtra(args, params.extraArgs);
			if (params.action === "list" || params.action === "close" || params.snapshotAfter === false) {
				const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
				return { content: [{ type: "text" as const, text: result.text }], details: result.details };
			}
			return runWithSnapshot(pi, ctx, args, params, common.session, signal, { waitMs: 600 });
		},
	});

	pi.registerTool({
		name: "browser_set_viewport",
		label: "Browser Viewport",
		description: "Set viewport size directly or with desktop/tablet/mobile presets.",
		parameters: BrowserSetViewportParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			const presetName = params.preset || configCache.defaultViewport;
			const preset = presetName ? VIEWPORT_PRESETS[presetName] : undefined;
			const width = params.width ?? preset?.width;
			const height = params.height ?? preset?.height;
			const scale = params.scale ?? preset?.scale;
			if (!width || !height) throw new Error("browser_set_viewport requires width/height or a preset");
			let args = [...common.args, "set", "viewport", String(width), String(height)];
			if (scale) args.push(String(scale));
			args = withExtra(args, params.extraArgs);
			return runWithSnapshot(pi, ctx, args, params, common.session, signal, { waitMs: 500 });
		},
	});

	for (const [name, command, label] of [
		["browser_reload", "reload", "Browser Reload"],
		["browser_back", "back", "Browser Back"],
		["browser_forward", "forward", "Browser Forward"],
	] as const) {
		pi.registerTool({
			name,
			label,
			description: `${label.replace("Browser ", "")} the active browser page and return a fresh snapshot by default.`,
			parameters: BrowserNavigationParams,
			async execute(_id, params, signal, _onUpdate, ctx) {
				const common = commonArgs(params, ctx);
				let args = [...common.args, command];
				args = withExtra(args, params.extraArgs);
				return runWithSnapshot(pi, ctx, args, params, common.session, signal, { waitMs: 700 });
			},
		});
	}


	pi.registerTool({
		name: "browser_artifacts_list",
		label: "Browser Artifacts List",
		description: "List screenshot and browser artifacts saved by browser-goblin.",
		parameters: BrowserArtifactsListParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { root, files } = await collectArtifacts(ctx, {
				session: params.session,
				allSessions: params.allSessions,
				limit: params.limit,
			});
			return {
				content: [{ type: "text" as const, text: formatArtifactFiles(root, files) }],
				details: { root, files, count: files.length },
			};
		},
	});

	pi.registerTool({
		name: "browser_artifacts_latest",
		label: "Browser Artifacts Latest",
		description: "Return the newest browser artifact path and manifest metadata.",
		parameters: BrowserArtifactsLatestParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const latest = await latestArtifact(ctx, { session: params.session, allSessions: params.allSessions });
			if (!latest.file) {
				return {
					content: [{ type: "text" as const, text: `Browser artifacts: ${latest.root}\nNo artifacts found.` }],
					details: latest,
				};
			}
			const meta = latest.manifest ? `\nManifest: ${JSON.stringify(latest.manifest, null, 2)}` : "";
			return {
				content: [{ type: "text" as const, text: `${formatArtifactFiles(latest.root, [latest.file], "Latest artifact:")}${meta}` }],
				details: latest,
			};
		},
	});

	pi.registerTool({
		name: "browser_artifacts_clean",
		label: "Browser Artifacts Clean",
		description: "Clean screenshot and browser artifacts. Defaults to dry run; set confirm true to delete.",
		parameters: BrowserArtifactsCleanParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const result = await cleanArtifacts(ctx, {
				session: params.session,
				allSessions: params.allSessions,
				olderThanDays: params.olderThanDays,
				confirm: params.confirm,
				limit: params.limit,
			});
			const action = result.dryRun ? "would delete" : "deleted";
			const text = `${result.dryRun ? "Dry run: " : ""}${action} ${result.dryRun ? result.candidates.length : result.deleted.length} artifact(s).` +
				(result.candidates.length ? `\n\n${formatArtifactFiles(result.root, result.candidates, "Candidate artifact(s):")}` : `\nBrowser artifacts: ${result.root}`);
			return {
				content: [{ type: "text" as const, text }],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "browser_qa",
		label: "Browser QA",
		description: "Run a one-command visual QA pass: open URL, capture configured viewport screenshots, then report console/errors/network/vitals.",
		parameters: BrowserQaParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const viewports = params.viewports?.filter((value): value is ViewportPresetName => value === "desktop" || value === "tablet" || value === "mobile");
			const result = await runBrowserQa(pi, ctx, { ...params, viewports }, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_batch",
		label: "Browser Batch",
		description: "Run multiple agent-browser commands in one invocation for fast multi-step workflows.",
		parameters: BrowserBatchParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = [...common.args, "batch"];
			if (params.bail) args.push("--bail");
			args = withExtra(args, params.extraArgs);
			args.push(...params.commands);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.registerTool({
		name: "browser_close",
		label: "Browser Close",
		description: "Close the current browser session or all active agent-browser sessions.",
		parameters: BrowserCloseParams,
		async execute(_id, params, signal, _onUpdate, ctx) {
			const common = commonArgs(params, ctx);
			let args = params.all ? ["close", "--all"] : [...common.args, "close"];
			args = withExtra(args, params.extraArgs);
			const result = await runAgentBrowser(pi, ctx, args, common.session, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});
}
