import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const logo = await readFile(join(root, "assets/logo.svg"), "utf8");
const mark = logo.match(/<g id="mark"[\s\S]*?<\/g>/)?.[0];
assert.ok(mark, "assets/logo.svg must contain the shared mark group");
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Browser Goblin</title>
  <desc id="description">Browser testing for Pi. A minimal browser mark beside the Browser Goblin wordmark.</desc>
  <rect width="1200" height="630" fill="#F4F5F2"/>
  <g transform="translate(238 222) scale(2.75)">
    ${mark}
  </g>
  <text x="450" y="309" fill="#26312B" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="600" letter-spacing="-2">Browser Goblin</text>
  <text x="453" y="356" fill="#626C66" font-family="Arial, Helvetica, sans-serif" font-size="26">Browser testing for Pi</text>
</svg>
`;

await mkdir(join(root, "screenshots"), { recursive: true });
const workDir = await mkdtemp(join(root, "screenshots/brand-"));
const config = join(workDir, "agent-browser.json");
await writeFile(config, "{}\n");
const session = `brand-${randomUUID().slice(0, 8)}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AGENT_BROWSER_")));
env.AGENT_BROWSER_CONFIG = config;
env.AGENT_BROWSER_NAMESPACE = session;
const exec = promisify(execFile);
const launcher = join(root, "node_modules/agent-browser/bin/agent-browser.js");
async function browser(...args) {
	return exec(process.execPath, [launcher, "--session", session, ...args], { cwd: root, env, timeout: 120_000 });
}

const server = createServer((request, response) => {
	const asset = request.url === "/preview.svg" ? preview : request.url === "/logo.svg" ? logo : undefined;
	if (!asset) return response.writeHead(404).end();
	response.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" }).end(asset);
});

try {
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const url = `http://127.0.0.1:${server.address().port}`;
	const rendered = [];
	for (const [name, width, height] of [["preview", 1200, 630], ["logo", 512, 512]]) {
		await browser("--headed", "false", "open", `${url}/${name}.svg`);
		await browser("set", "viewport", String(width), String(height), "1");
		await browser("wait", "--fn", "document.fonts.status === 'loaded'");
		const output = join(workDir, `${name}.png`);
		await browser("screenshot", output);
		const png = await readFile(output);
		assert.equal(png.subarray(1, 4).toString(), "PNG");
		assert.equal(png.readUInt32BE(16), width);
		assert.equal(png.readUInt32BE(20), height);
		rendered.push({ name, png, width, height });
	}
	await writeFile(join(root, "assets/preview.svg"), preview);
	for (const { name, png, width, height } of rendered) {
		await writeFile(join(root, `assets/${name}.png`), png);
		console.log(`Rendered assets/${name}.png (${width} x ${height}, ${png.length} bytes)`);
	}
} finally {
	try {
		await browser("close");
	} catch (error) {
		console.error("Failed to close the brand-render browser:", error.message);
		process.exitCode = 1;
	} finally {
		await new Promise((resolve, reject) => {
			if (!server.listening) return resolve();
			server.close((error) => error ? reject(error) : resolve());
		});
		await rm(workDir, { recursive: true, force: true });
	}
}
