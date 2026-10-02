const notesListElement = document.querySelector("#notes-list");
const notesSummaryElement = document.querySelector("#notes-summary");

const element = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const displayDate = (value) => value ? value.replaceAll("-", ".") : "DATE UNSET";

const excerptFrom = (text) => {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  const characters = [...compact];
  return characters.slice(0, 100).join("") + (characters.length > 100 ? "…" : "");
};

const createNoteItem = (item) => {
  const details = document.createElement("details");
  details.className = "note-item";
  details.id = item.id;

  const summary = element("summary", "note-summary");
  const heading = element("span", "note-heading");
  heading.append(
    element("time", "note-date", displayDate(item.date)),
    element("span", "note-title", item.title),
    element("span", "note-excerpt", excerptFrom(item.text)),
    element("span", "note-action", "読む")
  );
  if (item.date) heading.querySelector("time").dateTime = item.date;
  summary.append(heading);

  if (item.images?.length) {
    const thumb = element("span", "note-thumbnail");
    const image = document.createElement("img");
    image.src = item.images[0];
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    thumb.append(image);
    summary.append(thumb);
  }

  const body = element("div", "note-body");
  if (item.images?.length) {
    const gallery = element("div", "note-gallery");
    item.images.forEach((src, index) => {
      const image = document.createElement("img");
      image.src = src;
      image.alt = `${item.title} ${index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";
      gallery.append(image);
    });
    body.append(gallery);
  }

  body.append(element("div", "note-text", item.text));

  if (item.relatedAlbums?.length) {
    const related = element("div", "note-related");
    related.append(element("p", "note-related-label", "RELATED MUSIC"));
    const list = document.createElement("ul");
    item.relatedAlbums.forEach((album) => {
      const listItem = document.createElement("li");
      const link = element("a", "", `${album.title} →`);
      link.href = album.href;
      listItem.append(link);
      list.append(listItem);
    });
    related.append(list);
    body.append(related);
  }

  const permalink = element("a", "note-permalink", "このノートへのリンク");
  permalink.href = `#${item.id}`;
  body.append(permalink);

  details.append(summary, body);
  return details;
};

const activateSingleOpenNote = () => {
  const items = [...document.querySelectorAll(".note-item")];
  items.forEach((current) => {
    current.addEventListener("toggle", () => {
      const action = current.querySelector(".note-action");
      if (action) action.textContent = current.open ? "閉じる" : "読む";
      if (!current.open) return;
      items.forEach((other) => {
        if (other !== current) other.open = false;
      });
    });
  });
};

const loadNotes = async () => {
  try {
    const response = await fetch("notes.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const notes = await response.json();

    notesListElement.replaceChildren();
    if (notes.items.length === 0) {
      notesListElement.append(
        element("p", "empty-message", "Notesには、まだ記事がありません。")
      );
      notesSummaryElement.textContent = "準備中です。";
      return;
    }

    notes.items.forEach((item) => notesListElement.append(createNoteItem(item)));
    notesSummaryElement.textContent = `${notes.stats.items}件のノートを公開しています。`;
    activateSingleOpenNote();

    const targetId = window.location.hash.slice(1);
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
  } catch (error) {
    console.error(error);
    notesListElement.replaceChildren(
      element("p", "error-message", "Notesを読み込めませんでした。しばらくしてから再度お試しください。")
    );
    notesSummaryElement.textContent = "読み込みエラー";
  }
};

loadNotes();
