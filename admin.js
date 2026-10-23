const USERNAME = "Sasly";
const PASSWORD = "Sasly@1234";
const STORAGE_KEY = "glc-agenda-markup-v1";
const LAYOUT_KEY = "glc-agenda-layout";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const loginPanel = document.querySelector("#login-panel");
const editor = document.querySelector("#editor");
const loginMessage = document.querySelector("#login-message");
const status = document.querySelector("#admin-status");
const search = document.querySelector("#admin-search");
const previewHost = document.querySelector("#admin-agenda");
const addDialog = document.querySelector("#entry-dialog");
const addForm = document.querySelector("#entry-form");
const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
let sourceDocument;
let grid;
let currentAnchor;
let currentOwner;
let currentMonthInfo;

function labelOf(anchor) {
  const label = anchor?.querySelector(":scope > .link-label");
  if (label) return label.textContent.trim();
  return [...(anchor?.childNodes || [])].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim() || anchor?.textContent.trim() || "Untitled folder";
}
function setLabel(anchor, value) {
  const label = anchor.querySelector(":scope > .link-label");
  if (label) label.textContent = value;
  else {
    const badge = anchor.querySelector(":scope > .agenda-badge");
    anchor.textContent = value;
    if (badge) anchor.append(badge);
  }
  anchor.title = value;
}
function owner(anchor) { return anchor.closest("li") || anchor.closest(".resource-card"); }
function context(anchor) {
  const parents = [];
  let item = anchor.closest("li");
  while (item) {
    const link = [...item.children].find((child) => child.tagName === "A");
    if (link && link !== anchor) parents.unshift(labelOf(link));
    item = item.parentElement?.closest("li") || null;
  }
  const heading = anchor.closest(".resource-card")?.querySelector(":scope > .resource-title");
  return [heading && heading !== anchor ? labelOf(heading) : "", ...parents].filter(Boolean).join(" › ") || "Category";
}
function monthInfo(anchor) {
  const eventItem = anchor.closest("li");
  const monthItem = eventItem?.parentElement?.closest("li");
  const monthLink = monthItem?.querySelector(":scope > a");
  if (!monthItem || !monthLink || !MONTH_NAMES.includes(labelOf(monthLink))) return null;
  const yearItem = monthItem.parentElement?.closest("li");
  const yearList = yearItem?.querySelector(":scope > ul");
  const months = [...(yearList?.children || [])].filter((item) => MONTH_NAMES.includes(labelOf(item.querySelector(":scope > a"))));
  const years = [...(yearItem?.parentElement?.children || [])].filter((item) => /^\d{4}$/.test(labelOf(item.querySelector(":scope > a"))));
  return { eventItem, monthItem, months, yearItem, years };
}
function getEditionList(item) {
  const list = [...item.children].find((child) => child.tagName === "UL");
  if (!list) return null;
  const links = [...list.querySelectorAll(":scope > li > a")];
  return links.length && links.every((link) => ["eu", "us"].includes(labelOf(link).toLowerCase())) ? list : null;
}
function ensureLabelAndBadge(anchor) {
  const currentLabel = anchor.querySelector(":scope > .link-label");
  if (!currentLabel) {
    const label = document.createElement("span");
    label.className = "link-label";
    label.textContent = labelOf(anchor);
    anchor.replaceChildren(label);
  }
  anchor.title = labelOf(anchor);
  anchor.classList.toggle("is-cancelled", anchor.dataset.badge?.toLowerCase() === "cancelled");
  let badge = anchor.querySelector(":scope > .agenda-badge");
  if (anchor.dataset.badge) {
    if (!badge) { badge = document.createElement("span"); badge.className = "agenda-badge"; anchor.append(badge); }
    badge.className = `agenda-badge badge-${anchor.dataset.badge.toLowerCase()}`;
    badge.textContent = anchor.dataset.badge;
  } else badge?.remove();
}
function markHidden(owner, placement) {
  if (!owner?.hasAttribute("data-admin-hidden")) return;
  const badge = document.createElement("span");
  badge.className = "agenda-badge badge-hidden";
  badge.textContent = "HIDDEN";
  badge.style.setProperty("background-color", "#eaf3ff", "important");
  badge.style.setProperty("border-color", "#bad3f5", "important");
  badge.style.setProperty("color", "#24508c", "important");
  placement.insertAdjacentElement("afterend", badge);
}
function sortMasterclasses(preview) {
  const root = preview.querySelector("#masterclasses-title")?.closest(".resource-card")?.querySelector(":scope > .subfolder-list");
  if (!root) return;
  [...root.children].sort((a, b) => Number(labelOf(b.querySelector(":scope > a")).match(/\d{4}/)?.[0] || 0) - Number(labelOf(a.querySelector(":scope > a")).match(/\d{4}/)?.[0] || 0)).forEach((item) => root.append(item));
  for (const year of root.children) {
    const yearList = [...year.children].find((child) => child.tagName === "UL");
    if (!yearList) continue;
    [...yearList.children].sort((a, b) => MONTH_NAMES.indexOf(labelOf(b.querySelector(":scope > a"))) - MONTH_NAMES.indexOf(labelOf(a.querySelector(":scope > a")))).forEach((item) => yearList.append(item));
    for (const month of yearList.children) [...month.children].find((child) => child.tagName === "UL")?.classList.add("masterclass-event-grid");
  }
}
function filterPreview(preview) {
  const query = search.value.trim().toLowerCase();
  for (const card of preview.querySelectorAll(".resource-card")) {
    const cardLinks = [...card.querySelectorAll("a")];
    if (!query) {
      // Admin must retain access to hidden items so they can be edited and restored.
      card.hidden = false;
      for (const item of card.querySelectorAll("li")) item.hidden = false;
      continue;
    }
    const matches = new Set(cardLinks.filter((a) => `${labelOf(a)} ${a.href}`.toLowerCase().includes(query)));
    for (const match of matches) {
      let item = match.closest("li");
      while (item && card.contains(item)) { item.hidden = false; item = item.parentElement?.closest("li") || null; }
    }
    for (const item of card.querySelectorAll("li")) if (!matches.size || ![...item.querySelectorAll(":scope > a")].some((a) => matches.has(a)) && ![...item.querySelectorAll("li a")].some((a) => matches.has(a))) item.hidden = true;
    card.hidden = !matches.size && !labelOf(card.querySelector(":scope > .resource-title")).toLowerCase().includes(query);
    if (card.hidden) continue;
    for (const link of cardLinks) {
      if (matches.has(link)) continue;
      const item = link.closest("li");
      if (item && ![...item.querySelectorAll("li a")].some((a) => matches.has(a))) item.hidden = true;
    }
  }
}
function renderPreview() {
  const preview = grid.cloneNode(true);
  preview.classList.remove("search-active", "layout-two", "layout-three");
  let layout = "two";
  try { if (localStorage.getItem(LAYOUT_KEY) === "three") layout = "three"; } catch { /* Default to two columns. */ }
  preview.classList.add(`layout-${layout}`);
  const sourceLinks = [...grid.querySelectorAll("a")];
  const previewLinks = [...preview.querySelectorAll("a")];
  previewLinks.forEach((anchor, index) => { anchor.dataset.adminSourceIndex = String(index); });
  sortMasterclasses(preview);
  [...preview.querySelectorAll("a")].forEach((anchor) => {
    const sourceIndex = Number(anchor.dataset.adminSourceIndex);
    const sourceAnchor = sourceLinks[sourceIndex];
    delete anchor.dataset.adminSourceIndex;
    ensureLabelAndBadge(anchor);
    const masterclassFolder = sourceAnchor.closest(".masterclass-card");
    const sourceName = labelOf(sourceAnchor);
    if (masterclassFolder && (/^\d{4}$/.test(sourceName) || MONTH_NAMES.includes(sourceName))) return;
    if (sourceAnchor.closest(".edition-row") || ["eu", "us"].includes(sourceName.trim().toLowerCase())) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-edit-button";
    button.textContent = "Edit";
    button.setAttribute("aria-label", `Edit ${labelOf(sourceAnchor)}`);
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openEdit(sourceAnchor); });
    if (anchor.closest("li")) {
      const row = document.createElement("div");
      row.className = "admin-entry-row";
      row.style.setProperty("display", "flex", "important");
      row.style.setProperty("flex-flow", "row nowrap", "important");
      row.style.setProperty("align-items", "center", "important");
      row.style.setProperty("gap", "8px", "important");
      row.style.setProperty("width", "100%", "important");
      row.style.setProperty("min-width", "0", "important");
      row.style.setProperty("flex", "1 1 100%", "important");
      anchor.before(row);
      anchor.style.setProperty("flex", "1 1 0", "important");
      anchor.style.setProperty("width", "auto", "important");
      anchor.style.setProperty("min-width", "0", "important");
      anchor.style.setProperty("margin", "0", "important");
      row.append(anchor);
      const item = anchor.closest("li");
      const editions = getEditionList(item);
      if (editions) {
        editions.classList.add("edition-row");
        editions.style.setProperty("display", "flex", "important");
        editions.style.setProperty("flex", "0 0 auto", "important");
        editions.style.setProperty("margin", "0", "important");
        editions.style.setProperty("padding", "0", "important");
        editions.style.setProperty("border", "0", "important");
        row.append(editions);
      }
      button.style.setProperty("position", "static", "important");
      button.style.setProperty("flex", "0 0 auto", "important");
      button.style.setProperty("margin", "0 2px 0 0", "important");
      button.style.setProperty("transform", "none", "important");
      button.style.setProperty("white-space", "nowrap", "important");
      row.append(button);
      markHidden(item, button);
    } else {
      anchor.insertAdjacentElement("afterend", button);
      markHidden(anchor.closest("li") || anchor.closest(".resource-card"), button);
    }
  });
  previewHost.replaceChildren(preview);
  filterPreview(preview);
}
function fillMonths(yearSelect, monthSelect, selectedMonth = "") {
  const yearName = yearSelect.value;
  const year = currentMonthInfo?.years.find((item) => labelOf(item.querySelector(":scope > a")) === yearName);
  const yearList = year && [...year.children].find((child) => child.tagName === "UL");
  const months = [...(yearList?.children || [])].filter((item) => MONTH_NAMES.includes(labelOf(item.querySelector(":scope > a"))));
  monthSelect.replaceChildren();
  months.forEach((item) => {
    const name = labelOf(item.querySelector(":scope > a"));
    const option = document.createElement("option"); option.value = name; option.textContent = name; option.selected = name === selectedMonth;
    monthSelect.append(option);
  });
}
function openEdit(anchor) {
  currentAnchor = anchor;
  currentOwner = owner(anchor);
  currentMonthInfo = monthInfo(anchor);
  document.querySelector("#edit-dialog-title").textContent = `Edit ${labelOf(anchor)}`;
  document.querySelector("#edit-name").value = labelOf(anchor);
  document.querySelector("#edit-url").value = anchor.getAttribute("href") || "";
  document.querySelector("#edit-hidden").checked = currentOwner?.hasAttribute("data-admin-hidden") || false;
  const badge = anchor.dataset.badge || "";
  [...editForm.querySelectorAll('input[name="edit-badge"]')].forEach((radio) => { radio.checked = radio.value === badge; });
  const placement = document.querySelector("#edit-placement");
  const yearSelect = document.querySelector("#edit-year");
  const monthSelect = document.querySelector("#edit-month");
  placement.hidden = !currentMonthInfo?.years.length;
  if (currentMonthInfo?.years.length) {
    yearSelect.replaceChildren();
    currentMonthInfo.years.forEach((item) => { const option = document.createElement("option"); option.value = labelOf(item.querySelector(":scope > a")); option.textContent = option.value; option.selected = item === currentMonthInfo.yearItem; yearSelect.append(option); });
    fillMonths(yearSelect, monthSelect, labelOf(currentMonthInfo.monthItem.querySelector(":scope > a")));
    yearSelect.onchange = () => fillMonths(yearSelect, monthSelect);
  }
  const itemForEditions = currentMonthInfo?.eventItem || currentOwner;
  const children = [...itemForEditions.children].find((child) => child.tagName === "UL");
  const editions = getEditionList(itemForEditions);
  const editionControls = document.querySelector("#edit-editions");
  const isPrimaryItemLink = currentAnchor === [...currentOwner.children].find((child) => child.tagName === "A");
  const canEditEditions = isPrimaryItemLink && (!children || !!editions);
  editionControls.hidden = !canEditEditions;
  document.querySelector("#edit-link-mode").value = editions ? "editions" : "single";
  document.querySelector("#edit-eu-url").value = editions && [...editions.querySelectorAll(":scope > li > a")].find((a) => labelOf(a).toLowerCase() === "eu")?.getAttribute("href") || "";
  document.querySelector("#edit-us-url").value = editions && [...editions.querySelectorAll(":scope > li > a")].find((a) => labelOf(a).toLowerCase() === "us")?.getAttribute("href") || "";
  document.querySelector("#edit-edition-urls").hidden = !editions;
  editDialog.showModal();
}
function saveEdit(event) {
  event.preventDefault();
  if (!currentAnchor) return;
  setLabel(currentAnchor, document.querySelector("#edit-name").value.trim());
  currentAnchor.href = document.querySelector("#edit-url").value.trim();
  const selectedBadge = editForm.querySelector('input[name="edit-badge"]:checked')?.value || "";
  if (selectedBadge) currentAnchor.dataset.badge = selectedBadge; else delete currentAnchor.dataset.badge;
  if (currentOwner) {
    if (document.querySelector("#edit-hidden").checked) currentOwner.setAttribute("data-admin-hidden", "true");
    else currentOwner.removeAttribute("data-admin-hidden");
  }
  if (currentMonthInfo && !document.querySelector("#edit-placement").hidden) {
    const targetYear = currentMonthInfo.years.find((item) => labelOf(item.querySelector(":scope > a")) === document.querySelector("#edit-year").value);
    const targetMonths = [...(targetYear?.querySelector(":scope > ul")?.children || [])].filter((item) => MONTH_NAMES.includes(labelOf(item.querySelector(":scope > a"))));
    const targetMonth = targetMonths.find((item) => labelOf(item.querySelector(":scope > a")) === document.querySelector("#edit-month").value);
    if (targetMonth && (targetMonth !== currentMonthInfo.monthItem || targetYear !== currentMonthInfo.yearItem)) {
      let list = [...targetMonth.children].find((child) => child.tagName === "UL");
      if (!list) { list = document.createElement("ul"); list.className = "nested-folder-list"; targetMonth.append(list); }
      list.append(currentMonthInfo.eventItem);
    }
  }
  if (!document.querySelector("#edit-editions").hidden) {
    const mode = document.querySelector("#edit-link-mode").value;
    const eventItem = currentMonthInfo?.eventItem || currentOwner;
    let list = getEditionList(eventItem);
    if (mode === "single") list?.remove();
    else {
      if (!list) { list = document.createElement("ul"); list.className = "nested-folder-list edition-row"; eventItem.append(list); }
      for (const [label, value] of [["EU", document.querySelector("#edit-eu-url").value.trim()], ["US", document.querySelector("#edit-us-url").value.trim()]]) {
        let link = [...list.querySelectorAll(":scope > li > a")].find((item) => labelOf(item).toLowerCase() === label.toLowerCase());
        if (!value) { link?.closest("li")?.remove(); continue; }
        if (!link) { const li = document.createElement("li"); link = document.createElement("a"); link.textContent = label; link.target = "_blank"; link.rel = "noopener noreferrer"; li.append(link); list.append(li); }
        link.href = value;
      }
    }
  }
  editDialog.close();
  renderPreview();
  status.textContent = "Item updated. Use Save changes here or download the updated index.html to publish it.";
}
function removeCurrent() {
  if (!currentAnchor || !confirm(`Delete “${labelOf(currentAnchor)}” and its nested entries?`)) return;
  const card = currentAnchor.closest(".resource-card");
  if (currentAnchor === card?.querySelector(":scope > .resource-title")) card.remove(); else currentOwner?.remove();
  editDialog.close(); renderPreview();
  status.textContent = "Item deleted. Save or download the updated page to publish the change.";
}
async function loadData() {
  const response = await fetch("index.html", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load index.html. Open this page from GitHub Pages.");
  sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
  grid = sourceDocument.querySelector(".resource-grid");
  if (!grid) throw new Error("Could not find the agenda in index.html.");
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) grid.innerHTML = saved;
  loginPanel.hidden = true;
  editor.hidden = false;
  renderPreview();
}
document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (document.querySelector("#username").value !== USERNAME || document.querySelector("#password").value !== PASSWORD) { loginMessage.textContent = "Username or password is incorrect."; return; }
  try { await loadData(); } catch (error) { loginMessage.textContent = error.message; }
});
function openAddDialog() {
  const select = document.querySelector("#entry-parent");
  select.replaceChildren();
  [...grid.querySelectorAll("a")].forEach((anchor, index) => {
    const option = document.createElement("option"); option.value = String(index);
    const isHeading = anchor === anchor.closest(".resource-card")?.querySelector(":scope > .resource-title");
    option.textContent = isHeading ? `${labelOf(anchor)} › add folder` : `${context(anchor)} › ${labelOf(anchor)}`;
    select.append(option);
  });
  addForm.reset();
  addDialog.showModal();
}
document.querySelector("#add-entry").addEventListener("click", openAddDialog);
addDialog.addEventListener("click", (event) => { if (event.target === addDialog) addDialog.close(); });
document.querySelectorAll("[data-close-edit]").forEach((button) => button.addEventListener("click", () => editDialog.close()));
editDialog.addEventListener("click", (event) => { if (event.target === editDialog) editDialog.close(); });
editForm.addEventListener("submit", saveEdit);
document.querySelector("#delete-entry").addEventListener("click", removeCurrent);
document.querySelector("#edit-link-mode").addEventListener("change", (event) => { document.querySelector("#edit-edition-urls").hidden = event.target.value !== "editions"; });
addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const parent = [...grid.querySelectorAll("a")][Number(document.querySelector("#entry-parent").value)];
  const li = parent?.closest("li"); const card = parent?.closest(".resource-card");
  let list = li?.querySelector(":scope > ul") || card?.querySelector(":scope > ul");
  if (!list && parent) { list = document.createElement("ul"); list.className = li ? "nested-folder-list" : "subfolder-list"; (li || card).append(list); }
  const url = document.querySelector("#entry-url").value.trim();
  if (!list || !/^https:\/\/drive\.google\.com\//i.test(url)) return;
  const item = document.createElement("li"); const link = document.createElement("a");
  link.textContent = document.querySelector("#entry-name").value.trim(); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  const badge = addForm.querySelector('input[name="add-badge"]:checked')?.value || ""; if (badge) link.dataset.badge = badge;
  item.append(link); list.append(item); addDialog.close(); renderPreview();
});
document.querySelector("#save-changes").addEventListener("click", () => {
  try { localStorage.setItem(STORAGE_KEY, grid.innerHTML); status.textContent = "Saved in this browser. Download the updated index.html to publish these changes for everyone."; }
  catch { status.textContent = "Could not save in this browser. Download the updated index.html instead."; }
});
document.querySelector("#download-page").addEventListener("click", () => {
  sourceDocument.querySelector(".resource-grid").innerHTML = grid.innerHTML;
  const blob = new Blob([`<!doctype html>\n${sourceDocument.documentElement.outerHTML}`], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "index.html"; link.click(); URL.revokeObjectURL(url);
  localStorage.removeItem(STORAGE_KEY);
  status.textContent = "Downloaded index.html. Upload it to GitHub and commit the change to publish it.";
});
search.addEventListener("input", () => { const preview = previewHost.querySelector(".resource-grid"); if (preview) filterPreview(preview); });
document.querySelector("#logout").addEventListener("click", () => { editor.hidden = true; loginPanel.hidden = false; document.querySelector("#password").value = ""; });
