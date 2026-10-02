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
const annexRoot = path.join(projectRoot, "annex");
const storiesRoot = path.join(projectRoot, "stories");
const notesRoot = path.join(projectRoot, "notes");
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

const stableAnnexId = (value) =>
  `annex-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;

const stableStoryId = (value) =>
  `story-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;

const stableNoteId = (value) =>
  `note-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;

const normalizedKey = (value) =>
  String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja").trim();

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

const safeDownloadTitle = (value) => {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return [...(cleaned || "track")].slice(0, 120).join("");
};

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

const readLyrics = async (audioPath) => {
  const extension = path.extname(audioPath);
  const candidate = path.join(
    path.dirname(audioPath),
    `${path.basename(audioPath, extension)}.txt`
  );
  return await exists(candidate)
    ? (await readFile(candidate, "utf8")).trim()
    : "";
};

const readOptionalText = async (directoryPath, filename) => {
  const candidate = path.join(directoryPath, filename);
  return await exists(candidate)
    ? (await readFile(candidate, "utf8")).trim()
    : "";
};

const readAlbumReferences = async (directoryPath) => {
  const multiple = await readOptionalText(directoryPath, "albums.txt");
  const legacy = multiple
    ? ""
    : await readOptionalText(directoryPath, "album.txt");

  return [...new Set(
    String(multiple || legacy)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
};

const resolveRelatedAlbums = (references, releaseLookup, contextName) => {
  const relatedAlbums = [];

  references.forEach((reference) => {
    const release = releaseLookup.get(normalizedKey(reference));
    if (!release) {
      warnings.push(
        `${contextName}: 関連アルバム「${reference}」が見つかりませんでした`
      );
      return;
    }

    if (!relatedAlbums.some((item) => item.id === release.id)) {
      relatedAlbums.push({
        id: release.id,
        title: release.title,
        href: `index.html#${release.id}`,
      });
    }
  });

  return relatedAlbums;
};

const validDate = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : "";
};

const noteDateFromDirectory = (directoryName) =>
  validDate(directoryName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]);

const noteTitleFromDirectory = (directoryName) =>
  directoryName
    .replace(/^\d{4}-\d{2}-\d{2}[ _-]*/, "")
    .trim() || directoryName;

const orderedDirectoryNames = async (rootPath) => {
  if (!(await exists(rootPath))) return [];

  const entries = await readdir(rootPath, { withFileTypes: true });
  const orderPath = path.join(rootPath, "order.txt");
  const preferredOrder = await exists(orderPath)
    ? (await readFile(orderPath, "utf8"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const orderIndex = new Map(
    preferredOrder.map((name, index) => [name, index])
  );

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aOrder = orderIndex.get(a);
      const bOrder = orderIndex.get(b);

      if (aOrder !== undefined || bOrder !== undefined) {
        return (
          (aOrder ?? Number.MAX_SAFE_INTEGER) -
          (bOrder ?? Number.MAX_SAFE_INTEGER)
        );
      }

      return collator.compare(a, b);
    });
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

const findArtworkFiles = (files) =>
  files.filter((filename) =>
    imageExtensions.has(path.extname(filename).toLowerCase())
  );

const processAnnexItem = async (directoryName, releaseLookup) => {
  const itemPath = path.join(annexRoot, directoryName);
  const files = (await readdir(itemPath)).sort(collator.compare);
  const artworkFiles = findArtworkFiles(files);

  if (artworkFiles.length === 0) {
    warnings.push(`${directoryName}: ANNEX用の画像がないためスキップしました`);
    return null;
  }

  const id = stableAnnexId(directoryName);
  const itemOutput = path.join(mediaRoot, "annex", id);
  await mkdir(itemOutput, { recursive: true });

  const images = [];
  for (const [index, artworkName] of artworkFiles.entries()) {
    const outputName = `artwork-${String(index + 1).padStart(2, "0")}.webp`;
    try {
      await sharp(path.join(itemPath, artworkName))
        .rotate()
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toFile(path.join(itemOutput, outputName));
      images.push(`media/annex/${id}/${outputName}`);
    } catch (error) {
      warnings.push(
        `${directoryName}/${artworkName}: ANNEX画像の変換に失敗しました (${error.message})`
      );
    }
  }

  if (images.length === 0) return null;

  const customTitle = await readOptionalText(itemPath, "title.txt");
  const description = await readOptionalText(itemPath, "text.txt");
  const albumReferences = await readAlbumReferences(itemPath);
  const relatedAlbums = resolveRelatedAlbums(
    albumReferences,
    releaseLookup,
    directoryName
  );

  return {
    id,
    title: customTitle || directoryName,
    description,
    images,
    image: images[0],
    relatedAlbums,
    relatedAlbum: relatedAlbums[0] ?? null,
  };
};

const processStoryItem = async (directoryName, releaseLookup) => {
  const itemPath = path.join(storiesRoot, directoryName);
  const files = (await readdir(itemPath)).sort(collator.compare);
  const artworkName = findArtworkFiles(files)[0] ?? null;
  const id = stableStoryId(directoryName);
  const itemOutput = path.join(mediaRoot, "stories", id);
  let image = null;

  if (artworkName) {
    await mkdir(itemOutput, { recursive: true });
    try {
      await sharp(path.join(itemPath, artworkName))
        .rotate()
        .resize(1400, 1800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toFile(path.join(itemOutput, "cover.webp"));
      image = `media/stories/${id}/cover.webp`;
    } catch (error) {
      warnings.push(
        `${directoryName}/${artworkName}: Story画像の変換に失敗しました (${error.message})`
      );
    }
  }

  const customTitle = await readOptionalText(itemPath, "title.txt");
  const description = await readOptionalText(itemPath, "text.txt");
  const url = await readOptionalText(itemPath, "url.txt");
  const albumReferences = await readAlbumReferences(itemPath);
  const relatedAlbums = resolveRelatedAlbums(
    albumReferences,
    releaseLookup,
    directoryName
  );

  if (!url) {
    warnings.push(`${directoryName}: url.txtがないためStoryからの外部リンクは表示しません`);
  }

  return {
    id,
    title: customTitle || directoryName,
    description,
    url,
    image,
    relatedAlbums,
  };
};

const processNoteItem = async (directoryName, releaseLookup) => {
  const itemPath = path.join(notesRoot, directoryName);
  const files = (await readdir(itemPath)).sort(collator.compare);
  const text = await readOptionalText(itemPath, "text.txt");

  if (!text) {
    warnings.push(`${directoryName}: text.txtがないためNotesからスキップしました`);
    return null;
  }

  const id = stableNoteId(directoryName);
  const customTitle = await readOptionalText(itemPath, "title.txt");
  const rawDate = await readOptionalText(itemPath, "date.txt");
  const date = validDate(rawDate) || noteDateFromDirectory(directoryName);
  if (!date) {
    warnings.push(`${directoryName}: 日付がないためNotesの末尾に表示します`);
  }

  const artworkFiles = findArtworkFiles(files);
  const images = [];
  if (artworkFiles.length > 0) {
    const itemOutput = path.join(mediaRoot, "notes", id);
    await mkdir(itemOutput, { recursive: true });

    for (const [index, artworkName] of artworkFiles.entries()) {
      const outputName = `image-${String(index + 1).padStart(2, "0")}.webp`;
      try {
        await sharp(path.join(itemPath, artworkName))
          .rotate()
          .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 86 })
          .toFile(path.join(itemOutput, outputName));
        images.push(`media/notes/${id}/${outputName}`);
      } catch (error) {
        warnings.push(
          `${directoryName}/${artworkName}: Notes画像の変換に失敗しました (${error.message})`
        );
      }
    }
  }

  const albumReferences = await readAlbumReferences(itemPath);
  const relatedAlbums = resolveRelatedAlbums(
    albumReferences,
    releaseLookup,
    directoryName
  );

  return {
    id,
    title: customTitle || noteTitleFromDirectory(directoryName),
    date,
    text,
    images,
    relatedAlbums,
  };
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
    const trackTitle = parsed.metadata.common.title || cleanFilenameTitle(parsed.filename);
    const downloadName = `${path.basename(outputName, extension)} - ${safeDownloadTitle(trackTitle)}${extension}`;
    await copyFile(parsed.filePath, path.join(releaseOutput, outputName));

    tracks.push({
      number: trackNumber,
      title: trackTitle,
      duration: parsed.metadata.format.duration ?? null,
      src: `media/${id}/${outputName}`,
      downloadName,
      mime: mimeFor(extension),
      format: formatFor(extension),
      lyrics: await readLyrics(parsed.filePath),
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
    sourceDirectory: directoryName,
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

  for (const templateName of ["index.html", "annex.html", "story.html", "notes.html"]) {
    const templatePath = path.join(outputRoot, templateName);
    if (!(await exists(templatePath))) continue;

    let html = await readFile(templatePath, "utf8");
    for (const [key, value] of Object.entries(replacements)) {
      const rendered = key.endsWith("_BLOCK") ? String(value) : escapeHtml(value);
      html = html.replaceAll(`{{${key}}}`, rendered);
    }
    html = html.replace(/[ \t]+$/gm, "");
    await writeFile(templatePath, html);
  }

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

const directoryNames = await orderedDirectoryNames(albumsRoot);

const releases = (
  await Promise.all(directoryNames.map(processAlbum))
).filter(Boolean);

const releaseLookup = new Map();
releases.forEach((release) => {
  releaseLookup.set(normalizedKey(release.sourceDirectory), release);
  releaseLookup.set(normalizedKey(release.title), release);
});

const annexDirectoryNames = await orderedDirectoryNames(annexRoot);
const annexItems = (
  await Promise.all(
    annexDirectoryNames.map((directoryName) =>
      processAnnexItem(directoryName, releaseLookup)
    )
  )
).filter(Boolean);

const storyDirectoryNames = await orderedDirectoryNames(storiesRoot);
const storyItems = (
  await Promise.all(
    storyDirectoryNames.map((directoryName) =>
      processStoryItem(directoryName, releaseLookup)
    )
  )
).filter(Boolean);

const noteDirectoryNames = await orderedDirectoryNames(notesRoot);
const noteItems = (
  await Promise.all(
    noteDirectoryNames.map((directoryName) =>
      processNoteItem(directoryName, releaseLookup)
    )
  )
).filter(Boolean).sort((a, b) =>
  b.date.localeCompare(a.date) || collator.compare(b.title, a.title)
);

releases.forEach((release) => {
  release.relatedAnnex = annexItems
    .filter((item) =>
      item.relatedAlbums.some((album) => album.id === release.id)
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      href: `annex.html#${item.id}`,
      imageCount: item.images.length,
    }));

  release.relatedStories = storyItems
    .filter((item) =>
      item.relatedAlbums.some((album) => album.id === release.id)
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      href: `story.html#${item.id}`,
    }));

  release.relatedNotes = noteItems
    .filter((item) =>
      item.relatedAlbums.some((album) => album.id === release.id)
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      href: `notes.html#${item.id}`,
    }));
});

const catalog = {
  generatedAt: new Date().toISOString(),
  stats: {
    releases: releases.length,
    tracks: releases.reduce((sum, release) => sum + release.tracks.length, 0),
  },
  releases,
};

const annex = {
  generatedAt: new Date().toISOString(),
  stats: {
    items: annexItems.length,
    images: annexItems.reduce((sum, item) => sum + item.images.length, 0),
  },
  items: annexItems,
};

const stories = {
  generatedAt: new Date().toISOString(),
  stats: {
    items: storyItems.length,
  },
  items: storyItems,
};

const notes = {
  generatedAt: new Date().toISOString(),
  stats: {
    items: noteItems.length,
  },
  items: noteItems,
};

await writeFile(path.join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(path.join(outputRoot, "annex.json"), `${JSON.stringify(annex, null, 2)}\n`);
await writeFile(path.join(outputRoot, "story.json"), `${JSON.stringify(stories, null, 2)}\n`);
await writeFile(path.join(outputRoot, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
await renderSiteConfig();

console.log(`Build complete: ${catalog.stats.releases} releases / ${catalog.stats.tracks} tracks`);
console.log(`ANNEX complete: ${annex.stats.items} items / ${annex.stats.images} images`);
console.log(`Story complete: ${stories.stats.items} items`);
console.log(`Notes complete: ${notes.stats.items} items`);
if (warnings.length) {
  console.warn("Warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}
