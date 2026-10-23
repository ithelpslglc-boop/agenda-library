const savedAgendaMarkup = (() => {
  try { return localStorage.getItem("glc-agenda-markup-v1"); } catch { return null; }
})();
const PAGE_REFRESH_INTERVAL_MS = 60 * 1000;
if (savedAgendaMarkup) {
  const grid = document.querySelector(".resource-grid");
  if (grid) grid.innerHTML = savedAgendaMarkup;
}
for (const anchor of document.querySelectorAll(".resource-grid a")) {
  const fullLabel = anchor.textContent.trim();
  if (!anchor.title) anchor.title = fullLabel;
  if (!anchor.querySelector(":scope > .link-label")) {
    const label = document.createElement("span");
    label.className = "link-label";
    label.textContent = fullLabel;
    anchor.replaceChildren(label);
  }
  let badge = anchor.querySelector(":scope > .agenda-badge");
  if (anchor.dataset.badge) {
    if (!badge) { badge = document.createElement("span"); anchor.append(badge); }
    badge.className = `agenda-badge badge-${anchor.dataset.badge.toLowerCase()}`;
    badge.textContent = anchor.dataset.badge;
  } else badge?.remove();
  anchor.classList.toggle("is-cancelled", anchor.dataset.badge?.toLowerCase() === "cancelled");
}const searchInput = document.querySelector("#folder-search");
const status = document.querySelector("#search-status");
const cards = [...document.querySelectorAll(".resource-card")];
const monthOrder = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthColors = ["#3f69a8", "#92536f", "#347c71", "#a36b2e", "#5d783d", "#347d9b", "#95603d", "#6b5ba5", "#3e7880", "#a24f43", "#536e99", "#866033"];

function sortList(list, compare) {
  [...list.children].sort(compare).forEach((item) => list.append(item));
}

function setupMasterclassOrderAndToggles() {
  const root = document.querySelector("#masterclasses-title")?.closest(".resource-card")?.querySelector(":scope > .subfolder-list");
  if (!root) return;

  sortList(root, (a, b) => Number(b.querySelector(":scope > a")?.textContent.match(/\d{4}/)?.[0] || 0) - Number(a.querySelector(":scope > a")?.textContent.match(/\d{4}/)?.[0] || 0));
  for (const yearItem of root.children) {
    const yearLink = yearItem.querySelector(":scope > a");
    const year = yearLink?.textContent.match(/\d{4}/)?.[0];
    yearItem.style.setProperty("--year-accent", year === "2027" ? "#315d9d" : year === "2026" ? "#33705f" : "#5b6190");
    const yearMonths = [...yearItem.children].find((child) => child.tagName === "UL");
    if (!yearMonths) continue;
    sortList(yearMonths, (a, b) => monthOrder.indexOf(b.querySelector(":scope > a")?.textContent.replace("↗", "").trim().toLowerCase()) - monthOrder.indexOf(a.querySelector(":scope > a")?.textContent.replace("↗", "").trim().toLowerCase()));
    for (const monthItem of yearMonths.children) {
      const monthName = monthItem.querySelector(":scope > a")?.textContent.replace("↗", "").trim().toLowerCase();
      monthItem.style.setProperty("--month-accent", monthColors[Math.max(0, monthOrder.indexOf(monthName))]);
      const eventList = [...monthItem.children].find((child) => child.tagName === "UL");
      if (eventList) eventList.classList.add("masterclass-event-grid");
    }
  }

  for (const list of root.querySelectorAll(".nested-folder-list")) {
    const labels = [...list.children].map((item) => [...item.children].find((child) => child.tagName === "A")?.textContent.replace("↗", "").trim().toLowerCase());
    if (labels.length === 2 && labels.every((label) => label === "eu" || label === "us")) list.classList.add("edition-row");
  }

  let counter = 0;
  const toggleItems = [...root.children, ...[...root.children].flatMap((year) => { const months = [...year.children].find((child) => child.tagName === "UL"); return months ? [...months.children] : []; })];
  for (const item of toggleItems) {
    const childList = [...item.children].find((child) => child.tagName === "UL");
    const link = [...item.children].find((child) => child.tagName === "A");
    if (!childList || !link) continue;
    const toggle = document.createElement("button");
    const id = `masterclass-tree-${++counter}`;
    childList.id = id;
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.setAttribute("aria-label", `Collapse ${link.textContent.trim()}`);
    toggle.setAttribute("aria-controls", id);
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("data-expanded", "true");
    toggle.innerHTML = '<span class="toggle-chevron" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.setAttribute("aria-label", `${expanded ? "Expand" : "Collapse"} ${link.textContent.trim()}`);
      toggle.setAttribute("data-expanded", String(!expanded));
      childList.hidden = expanded;
    });
    item.classList.add("has-tree-toggle");
    item.append(toggle);
  }
}

function showTree(list) {
  list.hidden = false;
  for (const item of list.children) {
    item.hidden = item.hasAttribute("data-admin-hidden");
    const childList = [...item.children].find((child) => child.tagName === "UL");
    if (!childList) continue;
    const toggle = [...item.children].find((child) => child.classList.contains("tree-toggle"));
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("data-expanded", "true");
      toggle.setAttribute("aria-label", `Collapse ${[...item.children].find((child) => child.tagName === "A")?.textContent.trim() || "section"}`);
    }
    showTree(childList);
  }
}

function resetTree(list) {
  for (const item of list.children) {
    item.hidden = item.hasAttribute("data-admin-hidden");
    const childList = [...item.children].find((child) => child.tagName === "UL");
    if (childList) resetTree(childList);
  }
}

function filterTree(list, query) {
  let found = false;
  for (const item of list.children) {
    const link = [...item.children].find((child) => child.tagName === "A");
    const childList = [...item.children].find((child) => child.tagName === "UL");
    const directMatch = link?.textContent.toLocaleLowerCase().includes(query) ?? false;
    const descendantMatch = childList ? filterTree(childList, query) : false;
    item.hidden = item.hasAttribute("data-admin-hidden") || !(directMatch || descendantMatch);
    if (childList && (directMatch || descendantMatch)) {
      childList.hidden = false;
      const toggle = [...item.children].find((child) => child.classList.contains("tree-toggle"));
      if (toggle) {
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("data-expanded", "true");
      }
      if (directMatch) showTree(childList);
    }
    found ||= directMatch || descendantMatch;
  }
  return found;
}

function applySearch() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  document.querySelector(".resource-grid")?.classList.toggle("search-active", query.length > 0);
  let visibleCategories = 0;
  let visibleFolders = 0;

  for (const card of cards) {
    const title = card.querySelector(".resource-title");
    const titleMatches = title?.textContent.toLocaleLowerCase().includes(query) ?? false;
    const lists = [...card.querySelectorAll(":scope > .subfolder-list")];
    let treeMatches = false;
    for (const list of lists) {
      if (query) treeMatches = filterTree(list, query) || treeMatches;
      else resetTree(list);
      if (query && titleMatches) showTree(list);
    }
    const visible = !card.hasAttribute("data-admin-hidden") && (!query || titleMatches || treeMatches);
    card.hidden = !visible;
    if (visible) {
      visibleCategories += 1;
      visibleFolders += 1 + card.querySelectorAll(".subfolder-list li:not([hidden]) > a").length;
    }
  }

  for (const column of document.querySelectorAll(".resource-column")) {
    column.hidden = !column.querySelector(".resource-card:not([hidden])");
  }

  if (!query) {
    status.innerHTML = 'Search event names, programs, and editions';
  } else if (!visibleCategories) {
    status.textContent = "No matching folders found.";
  } else {
    status.textContent = `Showing ${visibleFolders} folder links in ${visibleCategories} categor${visibleCategories === 1 ? "y" : "ies"}`;
  }
}

setupMasterclassOrderAndToggles();
const layoutButtons = [...document.querySelectorAll("[data-page-layout]")];
const resourceGrid = document.querySelector(".resource-grid");
function setPageLayout(layout) {
  const selectedLayout = layout === "three" ? "three" : "two";
  resourceGrid?.classList.toggle("layout-two", selectedLayout === "two");
  resourceGrid?.classList.toggle("layout-three", selectedLayout === "three");
  layoutButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.pageLayout === selectedLayout)));
  try { localStorage.setItem("glc-agenda-layout", selectedLayout); } catch { /* Layout still works when storage is unavailable. */ }
}
let savedLayout = "two";
try { if (localStorage.getItem("glc-agenda-layout") === "three") savedLayout = "three"; } catch { /* Use the default layout. */ }
setPageLayout(savedLayout);
layoutButtons.forEach((button) => button.addEventListener("click", () => setPageLayout(button.dataset.pageLayout)));
searchInput.addEventListener("input", applySearch);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    applySearch();
    searchInput.blur();
  }
});

applySearch();

// Periodically reload the published static page so visitors pick up new deployments.
window.setInterval(() => {
  if (!document.hidden && document.activeElement !== searchInput) window.location.reload();
}, PAGE_REFRESH_INTERVAL_MS);
