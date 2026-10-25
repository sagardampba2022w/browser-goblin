import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
assert.ok(process.env.npm_execpath, "Run this check with npm run check:package");
const output = execFileSync(process.execPath, [process.env.npm_execpath, "pack", "--dry-run", "--json"], {
	cwd: root,
	encoding: "utf8",
});
const [pack] = JSON.parse(output);
const paths = new Set(pack.files.map((file) => file.path));
for (const required of ["README.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "LICENSE", "assets/preview.png", "assets/preview.svg", "assets/logo.png", "assets/logo.svg"]) {
	assert.ok(paths.has(required), `Required package file is missing: ${required}`);
}

for (const [file, width, height] of [["assets/preview.png", 1200, 630], ["assets/logo.png", 512, 512]]) {
	const png = await readFile(join(root, file));
	assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Invalid PNG: ${file}`);
	assert.equal(png.readUInt32BE(16), width, `Incorrect width: ${file}`);
	assert.equal(png.readUInt32BE(20), height, `Incorrect height: ${file}`);
}

let checkedLinks = 0;
for (const file of pack.files.filter((file) => file.path.endsWith(".md"))) {
	const markdown = await readFile(join(root, file.path), "utf8");
	for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
		const href = match[1];
		if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
		const pathname = decodeURIComponent(href.split(/[?#]/)[0]);
		if (!pathname) continue;
		const target = posix.normalize(posix.join(posix.dirname(file.path), pathname));
		assert.ok(paths.has(target), `Broken packaged link: ${file.path} -> ${href} (${target} is not included)`);
		checkedLinks++;
	}
}
console.log(`Package check passed: ${pack.files.length} files, required docs/brand assets included, PNG dimensions verified, ${checkedLinks} relative Markdown links checked.`);
