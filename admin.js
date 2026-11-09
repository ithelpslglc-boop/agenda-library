const USERNAME = "Sasly";
const PASSWORD = "Sasly@1234";
const STORAGE_KEY = "glc-agenda-markup-v1";
const LINKEDIN_STORAGE_KEY = "glc-linkedin-banners-v1";
const LAYOUT_KEY = "glc-agenda-layout";
const BADGE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRING_BADGES = new Set(["new", "updated"]);
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
let linkedinSettings = { url: "", hidden: false };

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
function expireTimeLimitedBadge(anchor) {
  const badge = anchor.dataset.badge?.toLowerCase();
  if (!EXPIRING_BADGES.has(badge)) return;
  const expiresAt = Number(anchor.dataset.badgeExpiresAt);
  // Unstamped legacy NEW/UPDATED badges expire instead of lingering indefinitely.
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    delete anchor.dataset.badge;
    delete anchor.dataset.badgeExpiresAt;
  }
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
  expireTimeLimitedBadge(anchor);
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
  if (EXPIRING_BADGES.has(selectedBadge.toLowerCase())) currentAnchor.dataset.badgeExpiresAt = String(Date.now() + BADGE_EXPIRY_MS);
  else delete currentAnchor.dataset.badgeExpiresAt;
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
  const linkedinLink = sourceDocument.querySelector("#linkedin-banners-link");
  linkedinSettings = {
    url: linkedinLink?.getAttribute("href") || "",
    hidden: linkedinLink?.getAttribute("data-admin-hidden") === "true"
  };
  try {
    const savedLinkSettings = JSON.parse(localStorage.getItem(LINKEDIN_STORAGE_KEY) || "null");
    if (savedLinkSettings && typeof savedLinkSettings === "object" &&
      (String(savedLinkSettings.url || "").trim() || savedLinkSettings.hidden || Number(savedLinkSettings.updatedAt))) {
      linkedinSettings = { ...linkedinSettings, ...savedLinkSettings };
    }
  } catch { /* Use values saved in index.html if browser storage is unavailable. */ }
  applyLinkedInSettings(sourceDocument);
  grid = sourceDocument.querySelector(".resource-grid");
  if (!grid) throw new Error("Could not find the agenda in index.html.");
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) grid.innerHTML = saved;
  loginPanel.hidden = true;
  editor.hidden = false;
  renderPreview();
}
function applyLinkedInSettings(doc) {
  const link = doc.querySelector("#linkedin-banners-link");
  if (!link) return;
  const url = String(linkedinSettings.url || "").trim();
  if (url) link.setAttribute("href", url); else link.removeAttribute("href");
  if (linkedinSettings.hidden) link.setAttribute("data-admin-hidden", "true");
  else link.removeAttribute("data-admin-hidden");
  syncLinkedInPreview();
}
function syncLinkedInPreview() {
  const preview = document.querySelector("#admin-linkedin-banners-preview");
  const hiddenBadge = document.querySelector("#admin-linkedin-hidden-badge");
  if (!preview) return;
  const url = String(linkedinSettings.url || "").trim();
  if (url) preview.href = url; else preview.removeAttribute("href");
  const disabled = !url || Boolean(linkedinSettings.hidden);
  preview.setAttribute("aria-disabled", String(disabled));
  if (disabled) preview.setAttribute("tabindex", "-1"); else preview.removeAttribute("tabindex");
  preview.classList.toggle("is-hidden", Boolean(linkedinSettings.hidden));
  if (hiddenBadge) hiddenBadge.hidden = !linkedinSettings.hidden;
}
document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (document.querySelector("#username").value !== USERNAME || document.querySelector("#password").value !== PASSWORD) { loginMessage.textContent = "Username or password is incorrect."; return; }
  try { await loadData(); } catch (error) { loginMessage.textContent = error.message; }
});
function masterclassRootList() {
  return grid?.querySelector("#masterclasses-title")?.closest(".resource-card")?.querySelector(":scope > .subfolder-list");
}
function masterclassYears() {
  const root = masterclassRootList();
  return [...(root?.children || [])].filter((item) => /^\d{4}$/.test(labelOf(item.querySelector(":scope > a"))))
    .sort((a, b) => Number(labelOf(b.querySelector(":scope > a"))) - Number(labelOf(a.querySelector(":scope > a"))));
}
function yearItemFor(name) {
  return masterclassYears().find((item) => labelOf(item.querySelector(":scope > a")) === name);
}
function monthsInYear(yearItem) {
  const list = [...(yearItem?.children || [])].find((child) => child.tagName === "UL");
  return [...(list?.children || [])].filter((item) => MONTH_NAMES.includes(labelOf(item.querySelector(":scope > a"))))
    .sort((a, b) => MONTH_NAMES.indexOf(labelOf(b.querySelector(":scope > a"))) - MONTH_NAMES.indexOf(labelOf(a.querySelector(":scope > a"))));
}
function appendFolder(list, name, url, childListClass) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.textContent = name.trim(); link.href = url.trim(); link.target = "_blank"; link.rel = "noopener noreferrer";
  item.append(link);
  if (childListClass) { const childList = document.createElement("ul"); childList.className = childListClass; item.append(childList); }
  list.append(item);
  return item;
}
function createMasterclassYear(name, url) {
  const root = masterclassRootList();
  if (!root) throw new Error("Cannot find the Masterclasses section.");
  if (!/^\d{4}$/.test(name.trim()) || yearItemFor(name.trim())) throw new Error("Enter a new four-digit year that is not already listed.");
  return appendFolder(root, name, url, "nested-folder-list");
}
function createMasterclassMonth(yearItem, name, url) {
  if (!MONTH_NAMES.includes(name.trim()) || monthsInYear(yearItem).some((item) => labelOf(item.querySelector(":scope > a")) === name.trim())) throw new Error("Choose a month that is not already listed for this year.");
  let list = [...yearItem.children].find((child) => child.tagName === "UL");
  if (!list) { list = document.createElement("ul"); list.className = "nested-folder-list"; yearItem.append(list); }
  return appendFolder(list, name, url, "nested-folder-list");
}
function refreshAddYearChoices(selected = "") {
  const select = document.querySelector("#entry-year");
  select.replaceChildren(new Option("Choose year…", ""));
  for (const item of masterclassYears()) {
    const name = labelOf(item.querySelector(":scope > a"));
    select.add(new Option(name, name));
  }
  select.add(new Option("＋ Add a new year…", "__new_year__"));
  if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
  else if (masterclassYears().length) select.selectedIndex = 1;
  else select.value = "__new_year__";
  refreshAddMonthChoices();
}
function refreshAddMonthChoices() {
  const select = document.querySelector("#entry-month");
  const yearSelect = document.querySelector("#entry-year");
  const addingMonth = document.querySelector("#entry-type").value === "month";
  const months = monthsInYear(yearItemFor(yearSelect.value));
  const existingNames = new Set(months.map((item) => labelOf(item.querySelector(":scope > a"))));
  const availableNames = MONTH_NAMES.filter((name) => !existingNames.has(name));
  const newMonthName = document.querySelector("#entry-new-month-name");
  const oldMonthName = newMonthName.value;
  newMonthName.replaceChildren(...availableNames.map((name) => new Option(name, name)));
  if (availableNames.includes(oldMonthName)) newMonthName.value = oldMonthName;
  select.replaceChildren(new Option(addingMonth ? "Months in selected year" : (months.length ? "Choose month…" : "Add the first month…"), ""));
  for (const item of months) {
    const name = labelOf(item.querySelector(":scope > a"));
    const option = new Option(addingMonth ? `${name} (already added)` : name, addingMonth ? `existing:${name}` : name);
    option.disabled = addingMonth;
    select.add(option);
  }
  const addMonthOption = new Option("＋ Add a new month…", "__new_month__");
  addMonthOption.disabled = availableNames.length === 0;
  select.add(addMonthOption);
  if (yearSelect.value === "__new_year__" || addingMonth) select.value = "__new_month__";
  else if (months.length) select.selectedIndex = 1;
  updateAddFormVisibility();
}
function setRequired(selector, required) { const element = document.querySelector(selector); if (element) element.required = required; }
function updateAddFormVisibility() {
  const type = document.querySelector("#entry-type").value;
  const year = document.querySelector("#entry-year").value;
  const month = document.querySelector("#entry-month").value;
  const other = type === "other";
  const yearPicker = type === "event" || type === "month";
  const monthPicker = type === "event" || type === "month";
  const newYear = yearPicker && year === "__new_year__";
  const newMonth = type === "event" && (month === "__new_month__" || newYear);
  document.querySelector("#entry-parent-row").hidden = !other;
  document.querySelector("#entry-year-row").hidden = !yearPicker;
  document.querySelector("#entry-month-row").hidden = !monthPicker;
  document.querySelector("#entry-new-year-fields").hidden = !newYear;
  document.querySelector("#entry-new-month-fields").hidden = !newMonth;
  document.querySelector("#entry-parent").required = other;
  document.querySelector("#entry-year").required = yearPicker;
  document.querySelector("#entry-month").required = monthPicker;
  document.querySelector("#entry-new-month-name").required = newMonth;
  setRequired("#entry-new-year-name", newYear); setRequired("#entry-new-year-url", newYear);
  setRequired("#entry-new-month-url", newMonth);
  document.querySelector("#entry-main-fields").hidden = type === "month" && month !== "__new_month__";
  const nameLabel = document.querySelector("#entry-name-label");
  const urlLabel = document.querySelector("#entry-url-label");
  const nameTitle = type === "year" ? "Year" : type === "month" ? "Month name" : type === "event" ? "Event name" : "Name";
  const urlTitle = type === "year" ? "Year folder URL" : type === "month" ? "Month folder URL" : "Google Drive URL";
  nameLabel.firstChild.textContent = nameTitle;
  urlLabel.firstChild.textContent = urlTitle;
  document.querySelector("#entry-name").required = true;
  document.querySelector("#entry-url").required = true;
}
function populateOtherParents() {
  const select = document.querySelector("#entry-parent");
  select.replaceChildren();
  [...grid.querySelectorAll("a")].forEach((anchor, index) => {
    const option = document.createElement("option"); option.value = String(index);
    const isHeading = anchor === anchor.closest(".resource-card")?.querySelector(":scope > .resource-title");
    option.textContent = isHeading ? `${labelOf(anchor)} › add folder` : `${context(anchor)} › ${labelOf(anchor)}`;
    select.append(option);
  });
}
function openAddDialog() {
  addForm.reset();
  populateOtherParents();
  const monthSelect = document.querySelector("#entry-new-month-name");
  monthSelect.replaceChildren(...MONTH_NAMES.map((month) => new Option(month, month)));
  document.querySelector("#entry-type").value = "event";
  refreshAddYearChoices();
  updateAddFormVisibility();
  addDialog.showModal();
}
document.querySelector("#add-entry").addEventListener("click", openAddDialog);
document.querySelector("#entry-type").addEventListener("change", refreshAddMonthChoices);
document.querySelector("#entry-year").addEventListener("change", refreshAddMonthChoices);
document.querySelector("#entry-month").addEventListener("change", updateAddFormVisibility);
addDialog.addEventListener("click", (event) => { if (event.target === addDialog) addDialog.close(); });
document.querySelectorAll("[data-close-edit]").forEach((button) => button.addEventListener("click", () => editDialog.close()));
editDialog.addEventListener("click", (event) => { if (event.target === editDialog) editDialog.close(); });
editForm.addEventListener("submit", saveEdit);
document.querySelector("#delete-entry").addEventListener("click", removeCurrent);
document.querySelector("#edit-link-mode").addEventListener("change", (event) => { document.querySelector("#edit-edition-urls").hidden = event.target.value !== "editions"; });
addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const type = document.querySelector("#entry-type").value;
  const isDriveUrl = (value) => /^https:\/\/drive\.google\.com\//i.test(value.trim());
  const name = document.querySelector("#entry-name").value.trim();
  const url = document.querySelector("#entry-url").value.trim();
  const selectedYear = document.querySelector("#entry-year").value;
  const addsYear = selectedYear === "__new_year__";
  const newYearName = document.querySelector("#entry-new-year-name").value.trim();
  const newYearUrl = document.querySelector("#entry-new-year-url").value.trim();
  if (addsYear && (!/^\d{4}$/.test(newYearName) || yearItemFor(newYearName) || !isDriveUrl(newYearUrl))) return;
  let createdLink;
  if (type === "year") {
    if (!/^\d{4}$/.test(name) || yearItemFor(name) || !isDriveUrl(url)) return;
    createdLink = createMasterclassYear(name, url).querySelector(":scope > a");
  } else if (type === "month") {
    const existingYear = addsYear ? null : yearItemFor(selectedYear);
    const duplicateMonth = existingYear && monthsInYear(existingYear).some((item) => labelOf(item.querySelector(":scope > a")) === name);
    if ((!addsYear && !existingYear) || document.querySelector("#entry-month").value !== "__new_month__" || !MONTH_NAMES.includes(name) || duplicateMonth || !isDriveUrl(url)) return;
    const yearItem = addsYear ? createMasterclassYear(newYearName, newYearUrl) : existingYear;
    createdLink = createMasterclassMonth(yearItem, name, url).querySelector(":scope > a");
  } else if (type === "event") {
    const existingYear = addsYear ? null : yearItemFor(selectedYear);
    const newMonth = document.querySelector("#entry-month").value === "__new_month__";
    const newMonthName = document.querySelector("#entry-new-month-name").value;
    const newMonthUrl = document.querySelector("#entry-new-month-url").value.trim();
    const duplicateMonth = existingYear && monthsInYear(existingYear).some((item) => labelOf(item.querySelector(":scope > a")) === newMonthName);
    if ((!addsYear && !existingYear) || !name || !isDriveUrl(url) ||
      (newMonth && (!MONTH_NAMES.includes(newMonthName) || duplicateMonth || !isDriveUrl(newMonthUrl)))) return;
    const yearItem = addsYear ? createMasterclassYear(newYearName, newYearUrl) : existingYear;
    let monthItem = newMonth
      ? createMasterclassMonth(yearItem, newMonthName, newMonthUrl)
      : monthsInYear(yearItem).find((item) => labelOf(item.querySelector(":scope > a")) === document.querySelector("#entry-month").value);
    if (!monthItem) return;
    const monthList = [...monthItem.children].find((child) => child.tagName === "UL");
    if (!monthList) return;
    const item = document.createElement("li"); const link = document.createElement("a");
    link.textContent = name; link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    const badge = addForm.querySelector('input[name="add-badge"]:checked')?.value || "";
    if (badge) link.dataset.badge = badge;
    if (EXPIRING_BADGES.has(badge.toLowerCase())) link.dataset.badgeExpiresAt = String(Date.now() + BADGE_EXPIRY_MS);
    item.append(link); monthList.append(item); createdLink = link;
  } else {
    const parent = [...grid.querySelectorAll("a")][Number(document.querySelector("#entry-parent").value)];
    const li = parent?.closest("li"); const card = parent?.closest(".resource-card");
    let list = li?.querySelector(":scope > ul") || card?.querySelector(":scope > ul");
    if (!list && parent) { list = document.createElement("ul"); list.className = li ? "nested-folder-list" : "subfolder-list"; (li || card).append(list); }
    if (!list || !name || !isDriveUrl(url)) return;
    const item = document.createElement("li"); const link = document.createElement("a");
    link.textContent = name; link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    item.append(link); list.append(item); createdLink = link;
  }
  if (type !== "event" && createdLink) {
    const badge = addForm.querySelector('input[name="add-badge"]:checked')?.value || "";
    if (badge) createdLink.dataset.badge = badge;
    if (EXPIRING_BADGES.has(badge.toLowerCase())) createdLink.dataset.badgeExpiresAt = String(Date.now() + BADGE_EXPIRY_MS);
  }
  addDialog.close(); renderPreview();
});
document.querySelector("#save-changes").addEventListener("click", () => {
  try { localStorage.setItem(STORAGE_KEY, grid.innerHTML); localStorage.setItem(LINKEDIN_STORAGE_KEY, JSON.stringify(linkedinSettings)); status.textContent = "Saved in this browser. Download the updated index.html to publish these changes for everyone."; }
  catch { status.textContent = "Could not save in this browser. Download the updated index.html instead."; }
});
document.querySelector("#download-page").addEventListener("click", () => {
  sourceDocument.querySelector(".resource-grid").innerHTML = grid.innerHTML;
  applyLinkedInSettings(sourceDocument);
  const blob = new Blob([`<!doctype html>\n${sourceDocument.documentElement.outerHTML}`], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "index.html"; link.click(); URL.revokeObjectURL(url);
  localStorage.removeItem(STORAGE_KEY);
  status.textContent = "Downloaded index.html. Upload it to GitHub and commit the change to publish it.";
});
const linkedinDialog = document.querySelector("#linkedin-banners-dialog");
const linkedinForm = document.querySelector("#linkedin-banners-form");
document.querySelector("#manage-linkedin-banners").addEventListener("click", () => {
  document.querySelector("#linkedin-banners-url").value = linkedinSettings.url;
  document.querySelector("#linkedin-banners-hidden").checked = Boolean(linkedinSettings.hidden);
  linkedinDialog.showModal();
});
document.querySelector("#admin-linkedin-banners-preview").addEventListener("click", (event) => {
  if (!linkedinSettings.url || linkedinSettings.hidden) event.preventDefault();
});
document.querySelectorAll("[data-close-linkedin]").forEach((button) => button.addEventListener("click", () => linkedinDialog.close()));
linkedinDialog.addEventListener("click", (event) => { if (event.target === linkedinDialog) linkedinDialog.close(); });
linkedinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  linkedinSettings = {
    url: document.querySelector("#linkedin-banners-url").value.trim(),
    hidden: document.querySelector("#linkedin-banners-hidden").checked,
    updatedAt: Date.now()
  };
  applyLinkedInSettings(sourceDocument);
  try { localStorage.setItem(LINKEDIN_STORAGE_KEY, JSON.stringify(linkedinSettings)); } catch { /* Download still publishes settings. */ }
  linkedinDialog.close();
  status.textContent = "LinkedIn Banners button updated. Use Download updated index.html to publish it.";
});
search.addEventListener("input", () => { const preview = previewHost.querySelector(".resource-grid"); if (preview) filterPreview(preview); });
document.querySelector("#logout").addEventListener("click", () => { editor.hidden = true; loginPanel.hidden = false; document.querySelector("#password").value = ""; });
