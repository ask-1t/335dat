import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(process.cwd(), "dist");
const errors = [];

const checkFile = async (filename) => {
  if (typeof filename !== "string" || !filename.trim()) {
    errors.push(`Invalid file path: ${String(filename)}`);
    return false;
  }

  const absolutePath = path.resolve(outputRoot, filename);
  if (!absolutePath.startsWith(`${outputRoot}${path.sep}`)) {
    errors.push(`File path outside dist/: ${filename}`);
    return false;
  }

  try {
    const info = await stat(absolutePath);
    if (!info.isFile() || info.size === 0) {
      errors.push(`Missing or empty file: ${filename}`);
      return false;
    }
    return true;
  } catch {
    errors.push(`Missing or unreadable file: ${filename}`);
    return false;
  }
};

const checkHtml = async (filename) => {
  if (!(await checkFile(filename))) return;
  const html = await readFile(path.join(outputRoot, filename), "utf8");
  if (!/<html\b/i.test(html) || !/<\/html>/i.test(html)) {
    errors.push(`Not an HTML document: ${filename}`);
  }
  if (/\{\{[A-Z_]+\}\}/.test(html)) {
    errors.push(`Unresolved template placeholder: ${filename}`);
  }
};

const loadJson = async (filename) => {
  if (!(await checkFile(filename))) return null;
  try {
    return JSON.parse(await readFile(path.join(outputRoot, filename), "utf8"));
  } catch {
    errors.push(`Invalid JSON: ${filename}`);
    return null;
  }
};

await Promise.all([
  ...["index.html", "annex.html", "story.html", "notes.html"].map(checkHtml),
  ...["styles.css", "script.js", "annex.js", "story.js", "notes.js"].map(checkFile),
]);

const [catalog, annex, stories, notes] = await Promise.all([
  loadJson("catalog.json"),
  loadJson("annex.json"),
  loadJson("story.json"),
  loadJson("notes.json"),
]);

const checkItems = (data, key, filename) => {
  if (data === null) return [];
  if (!Array.isArray(data?.[key])) {
    errors.push(`Missing ${key} array: ${filename}`);
    return [];
  }
  if (data?.stats?.[key] !== data[key].length) {
    errors.push(`Incorrect ${key} count: ${filename}`);
  }
  return data[key];
};

const releases = checkItems(catalog, "releases", "catalog.json");
const annexItems = checkItems(annex, "items", "annex.json");
const storyItems = checkItems(stories, "items", "story.json");
const noteItems = checkItems(notes, "items", "notes.json");

if (catalog && releases.length === 0) errors.push("No albums generated");
const tracks = releases.flatMap((release) =>
  Array.isArray(release.tracks) ? release.tracks : []
);
if (catalog && tracks.length === 0) errors.push("No tracks generated");
if (catalog && catalog.stats?.tracks !== tracks.length) {
  errors.push("Incorrect track count: catalog.json");
}

const assets = new Set([
  ...releases.map((release) => release.cover),
  ...tracks.map((track) => track.src),
  ...annexItems.flatMap((item) => item.images ?? []),
  ...storyItems.map((item) => item.image).filter(Boolean),
  ...noteItems.flatMap((item) => item.images ?? []),
]);
await Promise.all([...assets].map(checkFile));

if (errors.length) {
  errors.forEach((error) => console.error(`::error::${error}`));
  process.exitCode = 1;
} else {
  console.log(`Build verified: ${releases.length} albums, ${tracks.length} tracks, ${assets.size} media files.`);
}
