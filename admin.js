const USERNAME = "Sasly";
const PASSWORD = "Sasly@1234";
const STORAGE_KEY = "glc-agenda-markup-v1";
const loginPanel = document.querySelector("#login-panel");
const editor = document.querySelector("#editor");
const loginMessage = document.querySelector("#login-message");
const status = document.querySelector("#admin-status");
const entryList = document.querySelector("#entry-list");
const search = document.querySelector("#admin-search");
const dialog = document.querySelector("#entry-dialog");
const form = document.querySelector("#entry-form");
let sourceDocument;
let grid;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function text(anchor) { return anchor?.textContent.trim() || "Untitled folder"; }
function owner(anchor) { return anchor.closest("li") || anchor.closest(".resource-card"); }
function context(anchor) {
  const parents = [];
  let item = anchor.closest("li");
  while (item) {
    const link = [...item.children].find((child) => child.tagName === "A");
    if (link && link !== anchor) parents.unshift(text(link));
    item = item.parentElement?.closest("li") || null;
  }
  const heading = anchor.closest(".resource-card")?.querySelector(":scope > .resource-title");
  return [heading && heading !== anchor ? text(heading) : "", ...parents].filter(Boolean).join(" › ") || "Category";
}
function monthInfo(anchor) {
  const eventItem = anchor.closest("li");
  const monthItem = eventItem?.parentElement?.closest("li");
  const monthLink = monthItem?.querySelector(":scope > a");
  if (!monthItem || !monthLink || !MONTH_NAMES.includes(text(monthLink))) return null;
  const yearItem = monthItem.parentElement?.closest("li");
  const yearList = yearItem?.querySelector(":scope > ul");
  const months = [...(yearList?.children || [])].filter((item) => {
    const link = item.querySelector(":scope > a");
    return link && MONTH_NAMES.includes(text(link));
  });
  const yearsList = yearItem?.parentElement;
  const years = [...(yearsList?.children || [])].filter((item) => item.querySelector(":scope > a") && /^\d{4}$/.test(text(item.querySelector(":scope > a"))));
  return { eventItem, monthItem, months, yearItem, years };
}
function editionList(eventItem) {
  const list = [...eventItem.children].find((child) => child.tagName === "UL");
  if (!list) return null;
  const links = [...list.querySelectorAll(":scope > li > a")];
  return links.length && links.every((link) => ["eu", "us"].includes(text(link).toLowerCase())) ? list : null;
}
function render() {
  entryList.replaceChildren();
  const query = search.value.trim().toLowerCase();
  let count = 0;
  for (const anchor of [...grid.querySelectorAll("a")]) {
    const parentPath = context(anchor);
    if (query && !`${text(anchor)} ${anchor.getAttribute("href")} ${parentPath}`.toLowerCase().includes(query)) continue;
    count++;
    const node = owner(anchor);
    const row = document.createElement("article");
    row.className = "entry-row";
    if (node?.hasAttribute("data-admin-hidden")) row.classList.add("is-hidden");
    const place = document.createElement("div"); place.className = "entry-context"; place.textContent = parentPath;
    const fields = document.createElement("div"); fields.className = "entry-fields";
    const name = document.createElement("input"); name.value = text(anchor); name.setAttribute("aria-label", "Display name");
    const url = document.createElement("input"); url.value = anchor.getAttribute("href") || ""; url.setAttribute("aria-label", "Google Drive link");
    fields.append(name, url);
    const month = monthInfo(anchor);
    if (month?.months.length) {
      if (month.years.length) {
        const yearSelect = document.createElement("select");
        yearSelect.className = "entry-month-select";
        yearSelect.setAttribute("aria-label", "Move event to year");
        month.years.forEach((yearItem) => {
          const option = document.createElement("option");
          option.value = text(yearItem.querySelector(":scope > a"));
          option.textContent = `Year: ${option.value}`;
          option.selected = yearItem === month.yearItem;
          yearSelect.append(option);
        });
        yearSelect.addEventListener("change", () => {
          const destinationYear = month.years.find((yearItem) => text(yearItem.querySelector(":scope > a")) === yearSelect.value);
          const destinationYearList = destinationYear?.querySelector(":scope > ul");
          const yearMonths = [...(destinationYearList?.children || [])].filter((item) => MONTH_NAMES.includes(text(item.querySelector(":scope > a"))));
          const currentMonth = text(month.monthItem.querySelector(":scope > a"));
          const destinationMonth = yearMonths.find((item) => text(item.querySelector(":scope > a")) === currentMonth) || yearMonths[0];
          if (!destinationMonth || destinationYear === month.yearItem) return;
          let destinationList = destinationMonth.querySelector(":scope > ul");
          if (!destinationList) {
            destinationList = document.createElement("ul");
            destinationList.className = "nested-folder-list";
            destinationMonth.append(destinationList);
          }
          destinationList.append(month.eventItem);
          render();
        });
        fields.append(yearSelect);
      }
      const monthSelect = document.createElement("select");
      monthSelect.className = "entry-month-select";
      monthSelect.setAttribute("aria-label", "Move event to month");
      month.months.forEach((monthItem) => {
        const monthLink = monthItem.querySelector(":scope > a");
        const option = document.createElement("option");
        option.value = text(monthLink);
        option.textContent = `Month: ${text(monthLink)}`;
        option.selected = monthItem === month.monthItem;
        monthSelect.append(option);
      });
      monthSelect.addEventListener("change", () => {
        const destination = month.months.find((monthItem) => text(monthItem.querySelector(":scope > a")) === monthSelect.value);
        if (!destination || destination === month.monthItem) return;
        let destinationList = destination.querySelector(":scope > ul");
        if (!destinationList) {
          destinationList = document.createElement("ul");
          destinationList.className = "nested-folder-list";
          destination.append(destinationList);
        }
        destinationList.append(month.eventItem);
        render();
      });
      fields.append(monthSelect);

      const childList = [...month.eventItem.children].find((child) => child.tagName === "UL");
      const editions = editionList(month.eventItem);
      if (!childList || editions) {
        if (editions) editions.classList.add("edition-row");
        const editionEditor = document.createElement("div");
        editionEditor.className = "edition-editor";
        const mode = document.createElement("select");
        mode.setAttribute("aria-label", "Event link format");
        mode.innerHTML = '<option value="single">Single link</option><option value="editions">EU and US editions</option>';
        mode.value = editions ? "editions" : "single";
        const editionFields = document.createElement("div");
        editionFields.className = "edition-fields";
        const makeEditionInput = (label) => {
          const input = document.createElement("input");
          input.type = "url";
          input.placeholder = `${label} edition folder URL`;
          input.setAttribute("aria-label", `${label} edition folder URL`);
          const existing = editions && [...editions.querySelectorAll(":scope > li > a")].find((link) => text(link).toLowerCase() === label.toLowerCase());
          input.value = existing?.getAttribute("href") || "";
          return input;
        };
        const euInput = makeEditionInput("EU");
        const usInput = makeEditionInput("US");
        editionFields.append(euInput, usInput);
        const syncEditionUrls = () => {
          if (mode.value !== "editions") return;
          let list = editionList(month.eventItem);
          if (!list) {
            list = document.createElement("ul");
            list.className = "nested-folder-list edition-row";
            month.eventItem.append(list);
          }
          for (const [label, input] of [["EU", euInput], ["US", usInput]]) {
            let link = [...list.querySelectorAll(":scope > li > a")].find((item) => text(item).toLowerCase() === label.toLowerCase());
            if (!input.value.trim()) {
              link?.closest("li")?.remove();
              continue;
            }
            if (!link) {
              const item = document.createElement("li");
              link = document.createElement("a");
              link.textContent = label;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              item.append(link);
              list.append(item);
            }
            link.href = input.value.trim();
          }
        };
        mode.addEventListener("change", () => {
          editionFields.hidden = mode.value !== "editions";
          if (mode.value === "single") editionList(month.eventItem)?.remove();
          else syncEditionUrls();
        });
        euInput.addEventListener("input", syncEditionUrls);
        usInput.addEventListener("input", syncEditionUrls);
        editionFields.hidden = mode.value !== "editions";
        editionEditor.append(mode, editionFields);
        fields.append(editionEditor);
      }
    }
    name.addEventListener("input", () => { anchor.textContent = name.value; anchor.title = name.value; });
    url.addEventListener("input", () => anchor.setAttribute("href", url.value));
    const actions = document.createElement("div"); actions.className = "entry-actions";
    const hideLabel = document.createElement("label"); hideLabel.className = "hide-control";
    const hide = document.createElement("input"); hide.type = "checkbox"; hide.checked = node?.hasAttribute("data-admin-hidden") || false;
    hideLabel.append(hide, document.createTextNode("Hide"));
    hide.addEventListener("change", () => { if (hide.checked) node.setAttribute("data-admin-hidden", "true"); else node.removeAttribute("data-admin-hidden"); row.classList.toggle("is-hidden", hide.checked); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-button"; remove.textContent = "Delete";
    remove.addEventListener("click", () => { if (!confirm(`Delete “${text(anchor)}”?`)) return; const card = anchor.closest(".resource-card"); if (anchor === card?.querySelector(":scope > .resource-title")) card.remove(); else node?.remove(); render(); });
    actions.append(hideLabel, remove); row.append(place, fields, actions); entryList.append(row);
  }
  status.textContent = `${count} entries. Save keeps a local copy; download the HTML file to publish edits for everyone.`;
  if (!count) { const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "No matching entries."; entryList.append(empty); }
}
async function loadData() {
  const response = await fetch("index.html", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load index.html.");
  sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
  grid = sourceDocument.querySelector(".resource-grid");
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) grid.innerHTML = saved;
  loginPanel.hidden = true;
  editor.hidden = false;
  render();
}
document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (document.querySelector("#username").value !== USERNAME || document.querySelector("#password").value !== PASSWORD) {
    loginMessage.textContent = "Username or password is incorrect.";
    return;
  }
  try { await loadData(); } catch (error) { loginMessage.textContent = `${error.message} Open this page from GitHub Pages.`; }
});
function openAddDialog() {
  const select = document.querySelector("#entry-parent");
  select.replaceChildren();
  [...grid.querySelectorAll("a")].forEach((anchor, index) => {
    const option = document.createElement("option"); option.value = String(index);
    const isHeading = anchor === anchor.closest(".resource-card")?.querySelector(":scope > .resource-title");
    option.textContent = isHeading ? `${text(anchor)} › add folder` : `${context(anchor)} › ${text(anchor)}`;
    select.append(option);
  });
  form.reset(); dialog.showModal();
}
document.querySelector("#add-entry").addEventListener("click", openAddDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parent = [...grid.querySelectorAll("a")][Number(document.querySelector("#entry-parent").value)];
  const li = parent?.closest("li"); const card = parent?.closest(".resource-card");
  let list = li?.querySelector(":scope > ul") || card?.querySelector(":scope > ul");
  if (!list && parent) { list = document.createElement("ul"); list.className = li ? "nested-folder-list" : "subfolder-list"; (li || card).append(list); }
  const url = document.querySelector("#entry-url").value.trim();
  if (!list || !/^https:\/\/drive\.google\.com\//i.test(url)) return;
  const item = document.createElement("li"); const link = document.createElement("a");
  link.textContent = document.querySelector("#entry-name").value.trim(); link.title = link.textContent; link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  item.append(link); list.append(item); dialog.close(); render();
});
document.querySelector("#save-changes").addEventListener("click", () => {
  try { localStorage.setItem(STORAGE_KEY, grid.innerHTML); status.textContent = "Saved in this browser. Download the updated index.html to publish the changes."; }
  catch { status.textContent = "Could not save in this browser. Download the updated index.html instead."; }
});
document.querySelector("#download-page").addEventListener("click", () => {
  sourceDocument.querySelector(".resource-grid").innerHTML = grid.innerHTML;
  const blob = new Blob([`<!doctype html>\n${sourceDocument.documentElement.outerHTML}`], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = "index.html"; link.click(); URL.revokeObjectURL(url);
  localStorage.removeItem(STORAGE_KEY);
  status.textContent = "Downloaded index.html. Upload it to your GitHub repository and commit the change to publish it.";
});
search.addEventListener("input", render);
document.querySelector("#logout").addEventListener("click", () => { editor.hidden = true; loginPanel.hidden = false; document.querySelector("#password").value = ""; });
