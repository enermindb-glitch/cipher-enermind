/* ===========================================================
   CIPHERMIND — app.js (auth page)
   =========================================================== */

const API_BASE = "https://script.google.com/macros/s/AKfycbza9s-gysxJB1TxA8JCZzqYQtVL2S-douMxZDKeRtdILNLZyjJQo6uIzC8TeQvMypAKuA/exec";

(function buildCipherWheel(){
  const PLAIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const CIPHER = "QWERTYUIOPASDFGHJKLZXCVBNM";

  const cx = 160, cy = 160;
  const outerR = 138, innerR = 104;

  function ringSVG(alphabet, radius){
    let out = "";
    for (let i = 0; i < alphabet.length; i++){
      const angle = (360 / alphabet.length) * i;
      out += `<g transform="rotate(${angle} ${cx} ${cy})">
                 <text x="${cx}" y="${cy - radius}">${alphabet[i]}</text>
               </g>`;
    }
    return out;
  }

  const outer = document.getElementById("wheelOuter");
  const inner = document.getElementById("wheelInner");
  if (outer) outer.innerHTML = ringSVG(PLAIN, outerR);
  if (inner) inner.innerHTML = ringSVG(CIPHER, innerR);

  const specCipher = document.getElementById("specCipher");
  if (specCipher){
    const sample = "MIND";
    const mapped = sample.split("").map(ch => CIPHER[PLAIN.indexOf(ch)]).join("");
    specCipher.textContent = `${sample} → ${mapped}`;
  }
})();

(function decryptReveal(){
  const el = document.getElementById("tagline");
  if (!el) return;
  const finalText = el.dataset.text || el.textContent;
  const glyphs = "!<>-_\\/[]{}—=+*^?#________";
  const duration = 900;
  const stepMs = 28;
  let frame = 0;
  const totalFrames = Math.ceil(duration / stepMs);

  function randomGlyph(){ return glyphs[Math.floor(Math.random() * glyphs.length)]; }

  const timer = setInterval(() => {
    frame++;
    const revealCount = Math.floor((frame / totalFrames) * finalText.length);
    let out = "";
    for (let i = 0; i < finalText.length; i++){
      if (finalText[i] === " "){ out += " "; continue; }
      out += i < revealCount ? finalText[i] : randomGlyph();
    }
    el.textContent = out;
    if (frame >= totalFrames){
      el.textContent = finalText;
      clearInterval(timer);
    }
  }, stepMs);
})();

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const panelLogin = document.getElementById("panelLogin");
const panelRegister = document.getElementById("panelRegister");
const tabIndicator = document.getElementById("tabIndicator");

function switchTo(mode){
  const toRegister = mode === "register";
  tabLogin.setAttribute("aria-selected", String(!toRegister));
  tabRegister.setAttribute("aria-selected", String(toRegister));
  tabIndicator.style.transform = toRegister ? "translateX(100%)" : "translateX(0)";
  panelLogin.hidden = toRegister;
  panelRegister.hidden = !toRegister;
  panelLogin.classList.toggle("panel--active", !toRegister);
  panelRegister.classList.toggle("panel--active", toRegister);
}

tabLogin.addEventListener("click", () => switchTo("login"));
tabRegister.addEventListener("click", () => switchTo("register"));
document.querySelectorAll("[data-switch]").forEach(btn => {
  btn.addEventListener("click", () => switchTo(btn.dataset.switch));
});

document.querySelectorAll(".field__toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.toggleFor);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "show" : "hide";
  });
});

const registerPassword = document.getElementById("registerPassword");
const strengthLabel = document.getElementById("strengthLabel");
const bars = Array.from(document.querySelectorAll(".strength__bar"));

function scorePassword(pw){
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

registerPassword?.addEventListener("input", () => {
  const score = scorePassword(registerPassword.value);
  const tier = score <= 1 ? "weak" : score <= 2 ? "fair" : "strong";
  const label = registerPassword.value.length === 0
    ? "key strength"
    : { weak: "weak key", fair: "fair key", strong: "strong key" }[tier];

  bars.forEach((bar, i) => {
    bar.className = "strength__bar";
    if (i < score) bar.classList.add(`on--${tier}`);
  });
  strengthLabel.textContent = label;
});

async function sha256Hex(message){
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(len = 16){
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function apiCall(action, payload){
  if (!API_BASE || API_BASE.startsWith("PASTE_")){
    document.getElementById("configWarning").hidden = false;
    throw new Error("Backend not configured yet.");
  }
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error(`Server error (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function fetchSalt(email){
  const url = `${API_BASE}?action=getSalt&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Account not found.");
  return data.salt;
}

const panelRegisterForm = document.getElementById("panelRegister");
const registerError = document.getElementById("registerError");
const registerSuccess = document.getElementById("registerSuccess");
const registerSubmit = document.getElementById("registerSubmit");

panelRegisterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  registerSuccess.textContent = "";

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim().toLowerCase();
  const password = registerPassword.value;

  if (!name || !email || password.length < 8){
    registerError.textContent = "Fill every field — passphrase needs 8+ characters.";
    return;
  }

  registerSubmit.classList.add("is-loading");
  registerSubmit.disabled = true;

  try {
    const salt = randomSalt();
    const passwordHash = await sha256Hex(password + salt);
    await apiCall("register", { name, email, passwordHash, salt });
    registerSuccess.textContent = "Key generated. You can sign in now.";
    panelRegisterForm.reset();
    bars.forEach(b => b.className = "strength__bar");
    strengthLabel.textContent = "key strength";
    setTimeout(() => switchTo("login"), 900);
  } catch (err){
    registerError.textContent = err.message;
  } finally {
    registerSubmit.classList.remove("is-loading");
    registerSubmit.disabled = false;
  }
});

const panelLoginForm = document.getElementById("panelLogin");
const loginError = document.getElementById("loginError");
const loginSubmit = document.getElementById("loginSubmit");

panelLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password){
    loginError.textContent = "Enter your email and passphrase.";
    return;
  }

  loginSubmit.classList.add("is-loading");
  loginSubmit.disabled = true;

  try {
    const salt = await fetchSalt(email);
    const passwordHash = await sha256Hex(password + salt);
    const data = await apiCall("login", { email, passwordHash });
    sessionStorage.setItem("ciphermind_user", JSON.stringify({ name: data.name, email }));
    window.location.href = "dashboard.html";
  } catch (err){
    loginError.textContent = "Incorrect email or passphrase.";
  } finally {
    loginSubmit.classList.remove("is-loading");
    loginSubmit.disabled = false;
  }
});
