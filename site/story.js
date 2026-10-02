const storyListElement = document.querySelector("#story-list");
const storySummaryElement = document.querySelector("#story-summary");

const element = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const createStoryItem = (item) => {
  const article = element("article", "story-item");
  article.id = item.id;

  const visual = element("div", "story-visual");
  if (item.image) {
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = `${item.title}の表紙`;
    image.loading = "lazy";
    image.decoding = "async";
    visual.append(image);
  } else {
    const placeholder = element("div", "story-placeholder");
    placeholder.append(
      element("span", "story-placeholder-label", "STORY"),
      element("span", "story-placeholder-title", item.title)
    );
    visual.append(placeholder);
  }

  const body = element("div", "story-body");
  body.append(
    element("p", "eyebrow", "FICTION"),
    element("h2", "", item.title)
  );

  if (item.description) {
    body.append(element("p", "story-description", item.description));
  }

  if (item.url) {
    const readLink = element("a", "button story-read", "小説を読む →");
    readLink.href = item.url;
    body.append(readLink);
  }

  if (item.relatedAlbums?.length) {
    const related = element("div", "story-related");
    related.append(element("p", "story-related-label", "RELATED MUSIC"));
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

  article.append(visual, body);
  return article;
};

const loadStories = async () => {
  try {
    const response = await fetch("story.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stories = await response.json();

    storyListElement.replaceChildren();

    if (stories.items.length === 0) {
      storyListElement.append(
        element("p", "empty-message", "Storyには、まだ作品がありません。")
      );
      storySummaryElement.textContent = "準備中です。";
      return;
    }

    stories.items.forEach((item) => {
      storyListElement.append(createStoryItem(item));
    });
    storySummaryElement.textContent = `${stories.stats.items}作品を公開しています。`;

    const targetId = window.location.hash.slice(1);
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
      });
    }
  } catch (error) {
    console.error(error);
    storyListElement.replaceChildren(
      element("p", "error-message", "Storyを読み込めませんでした。しばらくしてから再度お試しください。")
    );
    storySummaryElement.textContent = "読み込みエラー";
  }
};

loadStories();
