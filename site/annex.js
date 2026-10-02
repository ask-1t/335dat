const annexListElement = document.querySelector("#annex-list");
const annexSummaryElement = document.querySelector("#annex-summary");

const element = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const createAnnexItem = (item) => {
  const details = document.createElement("details");
  details.className = "annex-item";
  details.id = item.id;
  const images = item.images?.length
    ? item.images
    : [item.image].filter(Boolean);

  const summary = element("summary", "annex-item-summary");
  const imageWrap = element("span", "annex-artwork");
  const image = document.createElement("img");
  image.src = images[0];
  image.alt = item.title;
  image.loading = "lazy";
  image.decoding = "async";
  imageWrap.append(image);

  const heading = element("span", "annex-item-heading");
  heading.append(
    element("span", "annex-item-label", "ANNEX"),
    element("span", "annex-item-title", item.title),
    element("span", "annex-item-action", "詳細を見る")
  );
  summary.append(imageWrap, heading);

  const body = element("div", "annex-item-body");
  if (images.length > 1) {
    const gallery = element("div", "annex-gallery");
    images.slice(1).forEach((src, index) => {
      const galleryImage = document.createElement("img");
      galleryImage.src = src;
      galleryImage.alt = `${item.title} ${index + 2}`;
      galleryImage.loading = "lazy";
      galleryImage.decoding = "async";
      gallery.append(galleryImage);
    });
    body.append(gallery);
  }

  if (item.description) {
    body.append(element("p", "annex-description", item.description));
  } else {
    body.append(element("p", "annex-description annex-description-empty", "テキストはありません。"));
  }

  const relatedAlbums = item.relatedAlbums?.length
    ? item.relatedAlbums
    : [item.relatedAlbum].filter(Boolean);
  if (relatedAlbums.length > 0) {
    const relatedList = element("div", "annex-related-list");
    relatedAlbums.forEach((album) => {
      const related = element("a", "annex-related", `関連アルバム：${album.title} →`);
      related.href = album.href;
      relatedList.append(related);
    });
    body.append(relatedList);
  }

  details.append(summary, body);
  return details;
};

const activateSingleOpenItem = () => {
  const items = [...document.querySelectorAll(".annex-item")];
  items.forEach((current) => {
    current.addEventListener("toggle", () => {
      const action = current.querySelector(".annex-item-action");
      if (action) {
        action.textContent = current.open ? "詳細を閉じる" : "詳細を見る";
      }
      if (!current.open) return;
      items.forEach((other) => {
        if (other !== current) other.open = false;
      });
    });
  });
};

const loadAnnex = async () => {
  try {
    const response = await fetch("annex.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const annex = await response.json();

    annexListElement.replaceChildren();

    if (annex.items.length === 0) {
      annexListElement.append(
        element("p", "empty-message", "ANNEXには、まだ作品がありません。")
      );
      annexSummaryElement.textContent = "準備中です。";
      return;
    }

    annex.items.forEach((item) => {
      annexListElement.append(createAnnexItem(item));
    });
    const imageCount = annex.stats.images ?? annex.stats.items;
    annexSummaryElement.textContent = `${annex.stats.items}作品・${imageCount}点を収録しています。`;
    activateSingleOpenItem();

    const targetId = window.location.hash.slice(1);
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.open = true;
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
      });
    }
  } catch (error) {
    console.error(error);
    annexListElement.replaceChildren(
      element("p", "error-message", "ANNEXを読み込めませんでした。しばらくしてから再度お試しください。")
    );
    annexSummaryElement.textContent = "読み込みエラー";
  }
};

loadAnnex();
