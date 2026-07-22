import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const albumsRoot = path.join(projectRoot, "albums");
const siteRoot = path.join(projectRoot, "site");
const outputRoot = path.join(projectRoot, "dist");
const mediaRoot = path.join(outputRoot, "media");

const audioExtensions = new Set([".m4a", ".mp3"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
const warnings = [];

const exists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const stableId = (value) =>
  `release-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;

const yearFrom = (value) => {
  const match = String(value ?? "").match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};

const numberFromFilename = (filename) => {
  const match = filename.match(/(?:^|\s|-)(\d{1,3})(?:\s|\.|-|_)/);
  return match ? Number(match[1]) : null;
};

const cleanFilenameTitle = (filename) =>
  path.basename(filename, path.extname(filename))
    .replace(/^.*?\s-\s\d{1,3}\s+/, "")
    .replace(/^\d{1,3}[. _-]+/, "")
    .trim();

const mode = (values) => {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const mimeFor = (extension) => extension === ".mp3" ? "audio/mpeg" : "audio/mp4";
const formatFor = (extension) => extension === ".mp3" ? "MP3" : "M4A";

const readDescription = async (albumPath) => {
  for (const filename of ["description.txt", "README.txt"]) {
    const candidate = path.join(albumPath, filename);
    if (await exists(candidate)) return (await readFile(candidate, "utf8")).trim();
  }
  return "";
};

const findCover = (files) => {
  const images = files.filter((filename) => imageExtensions.has(path.extname(filename).toLowerCase()));
  const preferred = images.find((filename) => /^(cover|folder|front|artwork)\./i.test(filename));
  return preferred ?? images[0] ?? null;
};

const createCover = async ({ albumPath, files, firstMetadata, releaseOutput }) => {
  const externalCover = findCover(files);
  const outputFile = path.join(releaseOutput, "cover.webp");

  try {
    if (externalCover) {
      await sharp(path.join(albumPath, externalCover))
        .rotate()
        .resize(1200, 1200, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(outputFile);
      return "cover.webp";
    }

    const embedded = firstMetadata?.common?.picture?.[0]?.data;
    if (embedded) {
      await sharp(embedded)
        .rotate()
        .resize(1200, 1200, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(outputFile);
      return "cover.webp";
    }
  } catch (error) {
    warnings.push(`${path.basename(albumPath)}: ジャケット変換に失敗しました (${error.message})`);
  }

  await copyFile(path.join(siteRoot, "fallback-cover.svg"), path.join(releaseOutput, "cover.svg"));
  warnings.push(`${path.basename(albumPath)}: ジャケットがないため代替画像を使用しました`);
  return "cover.svg";
};

const processAlbum = async (directoryName) => {
  const albumPath = path.join(albumsRoot, directoryName);
  const files = (await readdir(albumPath)).sort(collator.compare);
  const audioFiles = files.filter((filename) => audioExtensions.has(path.extname(filename).toLowerCase()));

  if (audioFiles.length === 0) {
    warnings.push(`${directoryName}: M4AまたはMP3が見つからないためスキップしました`);
    return null;
  }

  const parsedTracks = [];
  for (const filename of audioFiles) {
    const filePath = path.join(albumPath, filename);
    try {
      const metadata = await parseFile(filePath, { duration: true });
      parsedTracks.push({ filename, filePath, metadata });
    } catch (error) {
      warnings.push(`${directoryName}/${filename}: 情報を読めませんでした (${error.message})`);
    }
  }

  if (parsedTracks.length === 0) return null;

  parsedTracks.sort((a, b) => {
    const aDisc = a.metadata.common.disk?.no ?? 1;
    const bDisc = b.metadata.common.disk?.no ?? 1;
    const aTrack = a.metadata.common.track?.no ?? numberFromFilename(a.filename) ?? 9999;
    const bTrack = b.metadata.common.track?.no ?? numberFromFilename(b.filename) ?? 9999;
    return aDisc - bDisc || aTrack - bTrack || collator.compare(a.filename, b.filename);
  });

  const id = stableId(directoryName);
  const releaseOutput = path.join(mediaRoot, id);
  await mkdir(releaseOutput, { recursive: true });

  const title = mode(parsedTracks.map(({ metadata }) => metadata.common.album))
    ?? directoryName.replace(/^.*?\s-\s/, "");
  const artist = mode(parsedTracks.map(({ metadata }) => metadata.common.albumartist || metadata.common.artist))
    ?? "";
  const years = parsedTracks
    .map(({ metadata }) => yearFrom(metadata.common.date || metadata.common.year))
    .filter(Boolean);
  const year = years.length ? Math.max(...years) : null;

  const tracks = [];
  for (const [index, parsed] of parsedTracks.entries()) {
    const extension = path.extname(parsed.filename).toLowerCase();
    const disc = parsed.metadata.common.disk?.no ?? 1;
    const trackNumber = parsed.metadata.common.track?.no ?? numberFromFilename(parsed.filename) ?? index + 1;
    const outputName = parsedTracks.some(({ metadata }) => (metadata.common.disk?.no ?? 1) > 1)
      ? `${String(disc).padStart(2, "0")}-${String(trackNumber).padStart(2, "0")}${extension}`
      : `${String(trackNumber).padStart(2, "0")}${extension}`;
    await copyFile(parsed.filePath, path.join(releaseOutput, outputName));

    tracks.push({
      number: trackNumber,
      title: parsed.metadata.common.title || cleanFilenameTitle(parsed.filename),
      duration: parsed.metadata.format.duration ?? null,
      src: `media/${id}/${outputName}`,
      mime: mimeFor(extension),
      format: formatFor(extension),
    });
  }

  const coverName = await createCover({
    albumPath,
    files,
    firstMetadata: parsedTracks[0].metadata,
    releaseOutput,
  });

  return {
    id,
    title,
    artist,
    year,
    type: tracks.length === 1 ? "SINGLE" : "RELEASE",
    description: await readDescription(albumPath),
    cover: `media/${id}/${coverName}`,
    tracks,
  };
};

const renderSiteConfig = async () => {
  const config = JSON.parse(await readFile(path.join(siteRoot, "config.json"), "utf8"));
  const templatePath = path.join(outputRoot, "index.html");
  let html = await readFile(templatePath, "utf8");

  const contactBlock = config.contactEmail
    ? `<p>Contact: <a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(config.contactEmail)}</a></p>`
    : "";
  const supportBlock = config.supportUrl
    ? `<section id="support" class="support" aria-labelledby="support-title"><p class="eyebrow">SUPPORT</p><h2 id="support-title">制作を支援する</h2><p>継続的な音楽制作への支援を受け付けています。</p><a class="button" href="${escapeHtml(config.supportUrl)}" target="_blank" rel="noopener">支援ページを開く</a></section>`
    : "";

  const replacements = {
    SITE_TITLE: config.siteTitle,
    TAGLINE: config.tagline,
    INTRO: config.intro,
    ABOUT: config.about,
    CONTACT_BLOCK: contactBlock,
    SUPPORT_BLOCK: supportBlock,
    YEAR: new Date().getUTCFullYear(),
    COPYRIGHT_HOLDER: config.copyrightHolder || config.siteTitle,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const rendered = key.endsWith("_BLOCK") ? String(value) : escapeHtml(value);
    html = html.replaceAll(`{{${key}}}`, rendered);
  }
  html = html.replace(/[ \t]+$/gm, "");
  await writeFile(templatePath, html);

  const notFoundPath = path.join(outputRoot, "404.html");
  if (await exists(notFoundPath)) {
    const notFound = (await readFile(notFoundPath, "utf8")).replaceAll("ARTIST NAME", escapeHtml(config.siteTitle));
    await writeFile(notFoundPath, notFound);
  }
};

await rm(outputRoot, { recursive: true, force: true });
await cp(siteRoot, outputRoot, {
  recursive: true,
  filter: (source) => path.basename(source) !== "config.json" && path.basename(source) !== "fallback-cover.svg",
});
await mkdir(mediaRoot, { recursive: true });
await writeFile(path.join(outputRoot, ".nojekyll"), "");

const entries = await readdir(albumsRoot, { withFileTypes: true });
const directoryNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(collator.compare);
const releases = (await Promise.all(directoryNames.map(processAlbum))).filter(Boolean);

releases.sort((a, b) =>
  (b.year ?? 0) - (a.year ?? 0) || collator.compare(a.title, b.title)
);

const catalog = {
  generatedAt: new Date().toISOString(),
  stats: {
    releases: releases.length,
    tracks: releases.reduce((sum, release) => sum + release.tracks.length, 0),
  },
  releases,
};

await writeFile(path.join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
await renderSiteConfig();

console.log(`Build complete: ${catalog.stats.releases} releases / ${catalog.stats.tracks} tracks`);
if (warnings.length) {
  console.warn("Warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}
