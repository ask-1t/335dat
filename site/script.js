const catalogElement = document.querySelector("#catalog-list");
const summaryElement = document.querySelector("#catalog-summary");
const searchElement = document.querySelector("#catalog-search");

const element = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return "";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
};

const normalized = (value) =>
  String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja");

const createRelatedWorks = (release) => {
  const annexItems = release.relatedAnnex ?? [];
  const storyItems = release.relatedStories ?? [];
  const noteItems = release.relatedNotes ?? [];
  const count = annexItems.length + storyItems.length + noteItems.length;
  if (count === 0) return null;

  const details = document.createElement("details");
  details.className = "release-related";
  const summary = element("summary", "", `関連作品（${count}）`);
  const list = element("ul", "release-related-list");

  annexItems.forEach((item) => {
    const listItem = document.createElement("li");
    const countText = item.imageCount > 1 ? `（${item.imageCount}点）` : "";
    const link = element("a", "", `Annex：${item.title}${countText} →`);
    link.href = item.href;
    listItem.append(link);
    list.append(listItem);
  });

  storyItems.forEach((item) => {
    const listItem = document.createElement("li");
    const link = element("a", "", `Story：${item.title} →`);
    link.href = item.href;
    listItem.append(link);
    list.append(listItem);
  });

  noteItems.forEach((item) => {
    const listItem = document.createElement("li");
    const link = element("a", "", `Notes：${item.title} →`);
    link.href = item.href;
    listItem.append(link);
    list.append(listItem);
  });

  details.append(summary, list);
  return details;
};

const createTrack = (track) => {
  const item = element("li", "track");
  item.dataset.search = normalized(track.title);

  const heading = element("div", "track-heading");
  heading.append(
    element("span", "track-number", String(track.number).padStart(2, "0")),
    element("span", "track-name", track.title),
    element("span", "track-time", formatDuration(track.duration))
  );

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "metadata";
  const source = document.createElement("source");
  source.src = track.src;
  source.type = track.mime;
  player.append(source);

  const download = element("a", "download-link", "DL");
  download.href = track.src;
  download.download = track.downloadName || "";

const utilities = element("div", "track-utilities");
utilities.append(download);

if (track.lyrics) {
  const lyrics = document.createElement("details");
  lyrics.className = "lyrics";

  const summary = element("summary", "", "歌詞");
  const lyricsText = element("div", "lyrics-text", track.lyrics);

  lyrics.append(summary, lyricsText);
  utilities.append(lyrics);
}

item.append(heading, player, utilities);
return item;
};

const createRelease = (release) => {
  const article = element("article", "release");
  article.id = release.id;
  article.dataset.search = normalized(
    `${release.title} ${release.artist} ${release.year ?? ""}`
  );

  const artworkWrap = element("div", "release-artwork");
  const artwork = document.createElement("img");
  artwork.src = release.cover;
  artwork.alt = `${release.title}のジャケット`;
  artwork.width = 1200;
  artwork.height = 1200;
  artwork.loading = "lazy";
  artworkWrap.append(artwork);

  const body = element("div", "release-body");
  const metaParts = [release.type || "RELEASE", release.year].filter(Boolean);
  body.append(
    element("p", "release-meta", metaParts.join(" · ")),
    element("h3", "", release.title)
  );

  if (release.artist) {
    body.append(element("p", "release-artist", release.artist));
  }

  if (release.description) {
    body.append(element("p", "release-description", release.description));
  }

  const trackList = element("ol", "track-list");
  release.tracks.forEach((track) => trackList.append(createTrack(track)));
  body.append(trackList);

  const notes = element("dl", "release-notes");
  const formatRow = element("div");
  formatRow.append(
    element("dt", "", "Format"),
    element("dd", "", [...new Set(release.tracks.map((track) => track.format))].join(" / "))
  );
  const countRow = element("div");
  countRow.append(
    element("dt", "", "Tracks"),
    element("dd", "", String(release.tracks.length))
  );
  notes.append(formatRow, countRow);
  body.append(notes);

  const relatedWorks = createRelatedWorks(release);
  if (relatedWorks) {
    body.append(relatedWorks);
  }

  article.append(artworkWrap, body);
  return article;
};

const activatePlayback = () => {
  const players = [...document.querySelectorAll("audio")];
  players.forEach((current) => {
    current.addEventListener("play", () => {
      players.forEach((other) => {
        if (other !== current) other.pause();
      });
    });
  });

  document.querySelectorAll(".release").forEach((release) => {
    const releasePlayers = [...release.querySelectorAll("audio")];
    releasePlayers.forEach((current, index) => {
      const next = releasePlayers[index + 1];
      if (!next) return;

      current.addEventListener("ended", () => {
        next.currentTime = 0;
        next.play().catch(() => {
          // ブラウザ側で連続再生が拒否された場合は、次の曲で静かに停止します。
        });
      });
    });
  });
};

const activateSearch = () => {
  searchElement.disabled = false;
  searchElement.addEventListener("input", () => {
    const query = normalized(searchElement.value.trim());
    let shownReleases = 0;
    let shownTracks = 0;

    document.querySelectorAll(".release").forEach((releaseElement) => {
      const releaseMatches = releaseElement.dataset.search.includes(query);
      let releaseTrackCount = 0;

      releaseElement.querySelectorAll(".track").forEach((trackElement) => {
        const trackMatches = !query || releaseMatches || trackElement.dataset.search.includes(query);
        trackElement.hidden = !trackMatches;
        if (trackMatches) releaseTrackCount += 1;
      });

      releaseElement.hidden = releaseTrackCount === 0;
      if (releaseTrackCount > 0) {
        shownReleases += 1;
        shownTracks += releaseTrackCount;
      }
    });

    summaryElement.textContent = query
      ? `${shownReleases}作品・${shownTracks}曲が一致しました。`
      : summaryElement.dataset.defaultText;
  });
};

const loadCatalog = async () => {
  try {
    const response = await fetch("catalog.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = await response.json();

    catalogElement.replaceChildren();
    catalog.releases.forEach((release) => catalogElement.append(createRelease(release)));

    const summary = `${catalog.stats.releases}作品・${catalog.stats.tracks}曲を公開しています。`;
    summaryElement.textContent = summary;
    summaryElement.dataset.defaultText = summary;
    activatePlayback();
    if (searchElement) activateSearch();

    const targetId = window.location.hash.slice(1);
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
      });
    }
  } catch (error) {
    console.error(error);
    catalogElement.replaceChildren(
      element("p", "error-message", "カタログを読み込めませんでした。しばらくしてから再度お試しください。")
    );
    summaryElement.textContent = "読み込みエラー";
  }
};

loadCatalog();
