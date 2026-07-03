/* ===========================================================
   CIPHERMIND — dashboard.js
   =========================================================== */

const API_BASE = "https://script.google.com/macros/s/AKfycbza9s-gysxJB1TxA8JCZzqYQtVL2S-douMxZDKeRtdILNLZyjJQo6uIzC8TeQvMypAKuA/exec"; // same URL as app.js

/* ---- Session guard ------------------------------------------------ */
const session = JSON.parse(sessionStorage.getItem("ciphermind_user") || "null");
if (!session) window.location.href = "index.html";

let currentUser = { ...session, tier: "none", paymentStatus: "unpaid" };
let currentGroupId = null;

document.getElementById("userName").textContent = currentUser.name || currentUser.email;

/* ===========================================================
   API helpers
   =========================================================== */
async function apiPost(action, payload) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function apiGet(params) {
  const url = `${API_BASE}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

/* ===========================================================
   View switching
   =========================================================== */
const views = {
  feed: document.getElementById("viewFeed"),
  groups: document.getElementById("viewGroups"),
  groupDetail: document.getElementById("viewGroupDetail"),
  ideas: document.getElementById("viewIdeas"),
  jobs: document.getElementById("viewJobs"),
  upgrade: document.getElementById("viewUpgrade")
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove("view--active"));
  views[name].classList.add("view--active");
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
}

document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    showView(btn.dataset.view);
    if (btn.dataset.view === "feed") loadFeed();
    if (btn.dataset.view === "groups") loadGroups();
    if (btn.dataset.view === "ideas") loadIdeas();
    if (btn.dataset.view === "jobs") loadJobs();
  });
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("ciphermind_user");
  window.location.href = "index.html";
});

/* ===========================================================
   Tier / access status
   =========================================================== */
function tierRank(tier) { return { none: 0, basic: 1, pro: 2, premium: 3 }[tier] || 0; }

function applyTierUI() {
  const badge = document.getElementById("userTierBadge");
  badge.textContent = currentUser.paymentStatus === "paid" ? currentUser.tier : "no plan";
  badge.className = "tier-badge tier-badge--" + (currentUser.paymentStatus === "paid" ? currentUser.tier : "none");

  const canPost = currentUser.paymentStatus === "paid" && tierRank(currentUser.tier) >= tierRank("pro");
  document.getElementById("composeBtn").hidden = !canPost;
  document.getElementById("feedLock").hidden = canPost;

  const canCreateGroup = currentUser.paymentStatus === "paid" && tierRank(currentUser.tier) >= tierRank("premium");
  document.getElementById("newGroupBtn").hidden = !canCreateGroup;
}

async function refreshStatus() {
  try {
    const data = await apiGet({ action: "getUserStatus", email: currentUser.email });
    currentUser.tier = data.tier;
    currentUser.paymentStatus = data.paymentStatus;
  } catch (err) { /* leave defaults */ }
  applyTierUI();
}

/* ---- Returning from Pesapal's payment page ------------------------ */
async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") !== "return") return;

  // Clean the URL so a refresh doesn't re-trigger this
  window.history.replaceState({}, "", "dashboard.html");

  const banner = document.createElement("div");
  banner.className = "lock-notice";
  banner.style.margin = "0 0 20px";
  banner.textContent = "Confirming your payment with Pesapal — this can take a few seconds…";
  document.querySelector(".app-main").prepend(banner);

  // Pesapal's IPN call to our backend can land a moment after you're redirected
  // back here, so poll a few times rather than checking only once.
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(r => setTimeout(r, 2500));
    await refreshStatus();
    if (currentUser.paymentStatus === "paid") {
      banner.textContent = `Payment confirmed — you're on the ${currentUser.tier} plan.`;
      banner.style.color = "var(--signal)";
      setTimeout(() => banner.remove(), 4000);
      return;
    }
  }
  banner.textContent = "Still waiting on confirmation. If this doesn't update in a minute, check the payment went through on your end.";
}

/* ===========================================================
   Feed
   =========================================================== */
function renderPostCard(p) {
  let mediaHtml = "";
  if (p.type === "image") mediaHtml = `<img class="post-card__media" src="${escapeAttr(p.content)}" alt="">`;
  if (p.type === "video") mediaHtml = `<video class="post-card__media" src="${escapeAttr(p.content)}" controls></video>`;
  const textHtml = p.type === "text" ? `<p class="post-card__text">${escapeHtml(p.content)}</p>` : "";
  const captionHtml = p.caption ? `<p class="post-card__caption">${escapeHtml(p.caption)}</p>` : "";
  return `
    <article class="post-card">
      <header class="post-card__head">
        <span class="post-card__author">${escapeHtml(p.authorName || p.authorEmail)}</span>
        <span class="post-card__time">${formatDate(p.createdAt)}</span>
      </header>
      ${mediaHtml}
      ${textHtml}
      ${captionHtml}
    </article>`;
}

async function loadFeed() {
  const list = document.getElementById("feedList");
  list.innerHTML = `<p class="empty-state">Loading the feed…</p>`;
  try {
    const data = await apiGet({ action: "getFeed" });
    list.innerHTML = data.posts.length
      ? data.posts.map(renderPostCard).join("")
      : `<p class="empty-state">Nothing here yet — be the first to post.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Couldn't load the feed: ${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("composeBtn").addEventListener("click", () => {
  document.getElementById("composeForm").hidden = false;
});
document.getElementById("composeCancel").addEventListener("click", () => {
  document.getElementById("composeForm").hidden = true;
});
document.getElementById("composeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = document.getElementById("composeType").value;
  const content = document.getElementById("composeContent").value.trim();
  const caption = document.getElementById("composeCaption").value.trim();
  const errEl = document.getElementById("composeError");
  errEl.textContent = "";
  if (!content) { errEl.textContent = "Say something or paste a URL first."; return; }
  try {
    await apiPost("createPost", { email: currentUser.email, groupId: "public", type, content, caption });
    document.getElementById("composeForm").reset();
    document.getElementById("composeForm").hidden = true;
    loadFeed();
  } catch (err) { errEl.textContent = err.message; }
});

/* ===========================================================
   Groups
   =========================================================== */
function renderGroupCard(g) {
  return `
    <article class="group-card" data-group-id="${escapeAttr(g.groupId)}">
      <p class="group-card__name">${escapeHtml(g.name)}</p>
      <p class="group-card__desc">${escapeHtml(g.description || "")}</p>
      <div class="group-card__actions">
        <button class="btn btn--ghost btn--sm open-group-btn" data-group-id="${escapeAttr(g.groupId)}">Open</button>
        <button class="btn btn--primary btn--sm join-group-btn" data-group-id="${escapeAttr(g.groupId)}">Join</button>
      </div>
    </article>`;
}

let groupsCache = [];

async function loadGroups() {
  const list = document.getElementById("groupList");
  list.innerHTML = `<p class="empty-state">Loading groups…</p>`;
  try {
    const data = await apiGet({ action: "getGroups" });
    groupsCache = data.groups;
    list.innerHTML = data.groups.length
      ? data.groups.map(renderGroupCard).join("")
      : `<p class="empty-state">No groups yet — Premium members can start one.</p>`;
    list.querySelectorAll(".open-group-btn").forEach(btn =>
      btn.addEventListener("click", () => openGroup(btn.dataset.groupId)));
    list.querySelectorAll(".join-group-btn").forEach(btn =>
      btn.addEventListener("click", () => joinGroup(btn.dataset.groupId)));
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Couldn't load groups: ${escapeHtml(err.message)}</p>`;
  }
}

async function joinGroup(groupId) {
  try {
    await apiPost("joinGroup", { email: currentUser.email, groupId });
    alert("Joined. Tap Open to see the group.");
  } catch (err) { alert(err.message); }
}

document.getElementById("newGroupBtn").addEventListener("click", () => {
  document.getElementById("groupForm").hidden = false;
});
document.getElementById("groupCancel").addEventListener("click", () => {
  document.getElementById("groupForm").hidden = true;
});
document.getElementById("groupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("groupName").value.trim();
  const description = document.getElementById("groupDesc").value.trim();
  const errEl = document.getElementById("groupError");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Give the group a name."; return; }
  try {
    await apiPost("createGroup", { email: currentUser.email, name, description });
    document.getElementById("groupForm").reset();
    document.getElementById("groupForm").hidden = true;
    loadGroups();
  } catch (err) { errEl.textContent = err.message; }
});

/* ---- Group detail --------------------------------------------- */
async function openGroup(groupId) {
  currentGroupId = groupId;
  const g = groupsCache.find(x => x.groupId === groupId) || {};
  document.getElementById("groupDetailName").textContent = g.name || "Group";
  document.getElementById("groupDetailDesc").textContent = g.description || "";

  const meetBtn = document.getElementById("joinMeetLink");
  if (g.meetLink) { meetBtn.href = g.meetLink; meetBtn.hidden = false; }
  else { meetBtn.hidden = true; }

  showView("groupDetail");

  const list = document.getElementById("groupPostList");
  list.innerHTML = `<p class="empty-state">Loading posts…</p>`;
  try {
    const data = await apiGet({ action: "getGroupPosts", groupId });
    list.innerHTML = data.posts.length
      ? data.posts.map(renderPostCard).join("")
      : `<p class="empty-state">No posts in this group yet.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Couldn't load posts: ${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("backToGroups").addEventListener("click", () => {
  showView("groups");
  loadGroups();
});

document.getElementById("scheduleMeetingBtn").addEventListener("click", () => {
  document.getElementById("meetingForm").hidden = false;
});
document.getElementById("meetingCancel").addEventListener("click", () => {
  document.getElementById("meetingForm").hidden = true;
});
document.getElementById("meetingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("meetingTitle").value.trim();
  const startTimeIso = document.getElementById("meetingStart").value;
  const durationMinutes = document.getElementById("meetingDuration").value;
  const errEl = document.getElementById("meetingError");
  errEl.textContent = "";
  if (!title || !startTimeIso) { errEl.textContent = "Add a title and a start time."; return; }
  try {
    const data = await apiPost("scheduleMeeting", {
      email: currentUser.email, groupId: currentGroupId, title, startTimeIso, durationMinutes
    });
    document.getElementById("meetingForm").hidden = true;
    const meetBtn = document.getElementById("joinMeetLink");
    meetBtn.href = data.meetLink;
    meetBtn.hidden = false;
  } catch (err) { errEl.textContent = err.message; }
});

/* ===========================================================
   Ideas & Jobs (read-only, curated in the Sheet)
   =========================================================== */
async function loadIdeas() {
  const list = document.getElementById("ideasList");
  list.innerHTML = `<p class="empty-state">Loading…</p>`;
  try {
    const data = await apiGet({ action: "getIdeas" });
    list.innerHTML = data.ideas.length ? data.ideas.map(i => `
      <article class="idea-card">
        <p class="idea-card__title">${escapeHtml(i.title)}</p>
        <p class="idea-card__summary">${escapeHtml(i.summary)}</p>
        ${i.riskNote ? `<p class="idea-card__risk">${escapeHtml(i.riskNote)}</p>` : ""}
      </article>`).join("") : `<p class="empty-state">Nothing posted yet.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Couldn't load ideas: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadJobs() {
  const list = document.getElementById("jobsList");
  list.innerHTML = `<p class="empty-state">Loading…</p>`;
  try {
    const data = await apiGet({ action: "getJobs" });
    list.innerHTML = data.jobs.length ? data.jobs.map(j => `
      <article class="job-card">
        <p class="job-card__title">${escapeHtml(j.title)}</p>
        <p class="job-card__meta">${escapeHtml(j.company)} · ${escapeHtml(j.location)}</p>
        <a class="btn btn--ghost btn--sm" href="${escapeAttr(j.link)}" target="_blank" rel="noopener">View listing</a>
      </article>`).join("") : `<p class="empty-state">No openings posted yet.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Couldn't load jobs: ${escapeHtml(err.message)}</p>`;
  }
}

/* ===========================================================
   Upgrade / payments
   =========================================================== */
document.querySelectorAll(".pay-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const errEl = document.getElementById("upgradeError");
    errEl.textContent = "";
    btn.disabled = true;
    try {
      const data = await apiPost("initiatePayment", { email: currentUser.email, tier: btn.dataset.tier });
      window.location.href = data.redirectUrl; // send the user to Pesapal's hosted payment page
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
    }
  });
});

/* ===========================================================
   Small utilities
   =========================================================== */
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str = "") { return escapeHtml(str); }
function formatDate(v) {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
}

/* ===========================================================
   Init
   =========================================================== */
(async function init() {
  if (!API_BASE || API_BASE.startsWith("PASTE_")) {
    document.querySelector(".app-main").innerHTML =
      `<p class="empty-state" style="padding:40px">Backend not configured yet — set API_BASE in dashboard.js.</p>`;
    return;
  }
  await refreshStatus();
  await handlePaymentReturn();
  loadFeed();
})();
