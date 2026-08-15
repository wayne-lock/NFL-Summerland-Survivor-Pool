const C = window.POOL_CONFIG || {};
const configured =
  C.SUPABASE_URL &&
  !C.SUPABASE_URL.includes("PASTE_") &&
  C.SUPABASE_PUBLISHABLE_KEY &&
  !C.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");

const sb = configured
  ? supabase.createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY)
  : null;

const $ = id => document.getElementById(id);

let me = null;
let settings = null;
let games = [];
let usedTeams = [];
let allProfiles = [];
let allInvites = [];
let currentWeekPicks = [];
let currentPick = null;
let myPickHistory = [];
let pickCountdownTimer = null;
let playerNameCheckTimer = null;
let playerNameAvailable = false;
let smashTalkPosts = [];
let selectedPickWeek = null;
let scheduleWeekLoaded = null;

const CHARACTER_CHOICES = [{"id":"clutch-chris","name":"Clutch Chris","group":"men","skin":"#D9A06C","hair":"#3A241B","clothing":"#123A63","accent":"#D5A62A","style":"jersey"},{"id":"sunday-sniper","name":"Sunday Sniper","group":"men","skin":"#B97850","hair":"#151515","clothing":"#17191D","accent":"#D6AE42","style":"hoodie"},{"id":"gridiron-gary","name":"Gridiron Gary","group":"men","skin":"#E0AE7A","hair":"#6A3922","clothing":"#263E58","accent":"#E0B440","style":"varsity"},{"id":"the-general","name":"The General","group":"men","skin":"#9E6448","hair":"#27211D","clothing":"#2C2F33","accent":"#D0A43A","style":"coach"},{"id":"ice-man","name":"Ice Man","group":"men","skin":"#F0C59A","hair":"#8A6B58","clothing":"#D9E0E5","accent":"#52748F","style":"winter"},{"id":"blitz-ben","name":"Blitz Ben","group":"men","skin":"#6F442E","hair":"#17110E","clothing":"#7A1F25","accent":"#DBA92E","style":"athletic"},{"id":"fourth-and-long","name":"Fourth & Long","group":"men","skin":"#C98B5D","hair":"#5A3427","clothing":"#2B5A3B","accent":"#E1C36A","style":"practice"},{"id":"captain-jack","name":"Captain Jack","group":"men","skin":"#E3B88F","hair":"#2B201B","clothing":"#244F7A","accent":"#E1B53C","style":"captain"},{"id":"raven-queen","name":"Raven Queen","group":"women","skin":"#A86A50","hair":"#281A2D","clothing":"#4A2868","accent":"#D6AC40","style":"jacket"},{"id":"touchdown-tina","name":"Touchdown Tina","group":"women","skin":"#E1AD80","hair":"#A9673D","clothing":"#932D35","accent":"#F0C45B","style":"jersey"},{"id":"victory-vicki","name":"Victory Vicki","group":"women","skin":"#F0C19A","hair":"#D1A169","clothing":"#315C8C","accent":"#D9B141","style":"fan"},{"id":"end-zone-emma","name":"End Zone Emma","group":"women","skin":"#7C4A34","hair":"#191514","clothing":"#285A46","accent":"#E0B443","style":"hoodie"},{"id":"blitz-bella","name":"Blitz Bella","group":"women","skin":"#C78664","hair":"#4A2D22","clothing":"#C06426","accent":"#F0C45B","style":"athletic"},{"id":"captain-kate","name":"Captain Kate","group":"women","skin":"#E8B68D","hair":"#35201B","clothing":"#262B31","accent":"#D4AB3C","style":"coach"},{"id":"gridiron-grace","name":"Gridiron Grace","group":"women","skin":"#5E392B","hair":"#19100E","clothing":"#F0EEE5","accent":"#D7A72C","style":"jersey"},{"id":"saints-sweetie","name":"Saints Sweetie","group":"women","skin":"#D89C76","hair":"#8B593F","clothing":"#182F4D","accent":"#DAB241","style":"supporter"}];
const LEGACY_AVATARS = new Set(["🏈","🦬","🦅","🐻","🦁","🐺","🦈","🐂","⚡","🔥","🚀","⭐","🏆","👑","🛡️","🎯","🤠","😎","🧙","🥷"]);
let selectedSignupAvatar = "clutch-chris";

function getCharacter(value) {
  return CHARACTER_CHOICES.find(character => character.id === value) || CHARACTER_CHOICES[0];
}

function characterMarkup(value, className = "character-portrait") {
  if (LEGACY_AVATARS.has(value)) {
    return `<span class="${className} legacy-character">${esc(value)}</span>`;
  }
  const character = getCharacter(value);
  return `<img class="${className}" src="${character.id}.svg?v=351" alt="${esc(character.name)}">`;
}

function renderAvatarPicker(containerId, selected, onSelect) {
  const container = $(containerId);
  if (!container) return;
  const selectedCharacter = getCharacter(selected);

  container.innerHTML = `
    <div class="character-tabs" role="tablist">
      <button type="button" class="character-tab active" data-group="men">Men</button>
      <button type="button" class="character-tab" data-group="women">Women</button>
    </div>
    <div class="character-grid"></div>
  `;

  const grid = container.querySelector(".character-grid");
  const renderGroup = group => {
    container.querySelectorAll(".character-tab").forEach(tab =>
      tab.classList.toggle("active", tab.dataset.group === group)
    );
    grid.innerHTML = CHARACTER_CHOICES.filter(character => character.group === group).map(character => `
      <button type="button"
        class="character-choice ${character.id === selected ? "selected" : ""}"
        data-avatar="${character.id}"
        data-name="${esc(character.name)}"
        aria-label="Select ${esc(character.name)}">
        <img src="${character.id}.svg?v=351" alt="">
        <strong>${esc(character.name)}</strong>
      </button>
    `).join("");

    grid.querySelectorAll(".character-choice").forEach(button => {
      button.onclick = () => {
        grid.querySelectorAll(".character-choice").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selected = button.dataset.avatar;
        onSelect(button.dataset.avatar, button.dataset.name);
      };
    });
  };

  container.querySelectorAll(".character-tab").forEach(tab => {
    tab.onclick = () => renderGroup(tab.dataset.group);
  });

  renderGroup(selectedCharacter.group);
}

if (!configured) $("setupWarning").classList.remove("hidden");

$("loginTab").onclick = () => switchAuth(true);
$("signupTab").onclick = () => switchAuth(false);

$("welcomeResultsBtn")?.addEventListener("click", openSurvivorResults);
$("appResultsBtn")?.addEventListener("click", openSurvivorResults);
$("commissionerResultsBtn")?.addEventListener("click", openSurvivorResults);
$("closeSurvivorResultsBtn")?.addEventListener("click", closeSurvivorResults);
$("survivorResultsModal")?.addEventListener("click", event => {
  if (event.target === $("survivorResultsModal")) closeSurvivorResults();
});
$("welcomeSmashTalkBtn")?.addEventListener("click", openSmashTalk);
$("commissionerSmashTalkBtn")?.addEventListener("click", openSmashTalk);
$("appSmashTalkBtn")?.addEventListener("click", openSmashTalk);
$("closeSmashTalkBtn")?.addEventListener("click", closeSmashTalk);
$("refreshSmashTalkBtn")?.addEventListener("click", loadSmashTalk);
$("smashTalkForm")?.addEventListener("submit", submitSmashTalk);
$("smashTalkMessage")?.addEventListener("input", event => {
  if ($("smashTalkCount")) {
    $("smashTalkCount").textContent = `${event.target.value.length} / 250`;
  }
});
$("smashTalkModal")?.addEventListener("click", event => {
  if (event.target === $("smashTalkModal")) closeSmashTalk();
});

$("logoutBtn").onclick = async () => {
  if (!sb) return;
  await sb.auth.signOut();
};

function switchAuth(login) {
  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);
  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);
}

function readableError(error) {
  const raw =
    error?.message ||
    error?.error_description ||
    error?.details ||
    (typeof error === "string" ? error : "");

  const text = String(raw || "Something went wrong. Please try again.");

  if (/incorrect pool code/i.test(text)) {
    return "This invitation or pool code is not valid. Please ask the Commissioner to resend the invitation.";
  }
  if (/already registered|user already exists/i.test(text)) {
    return "This email address already has an account. Please use Sign In instead.";
  }
  if (/pool is full/i.test(text)) {
    return "The pool has reached its participant limit. Please contact the Commissioner.";
  }
  if (/registration is closed/i.test(text)) {
    return "Registration is currently closed. Please contact the Commissioner.";
  }
  if (/password/i.test(text) && /characters/i.test(text)) {
    return "Please use a password with at least 6 characters.";
  }
  if (/email/i.test(text) && /invalid/i.test(text)) {
    return "Please enter a valid email address.";
  }
  return text;
}

function msg(id, text, bad = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = bad ? readableError(text) : String(text ?? "");
  el.style.color = bad ? "#b42318" : "#18794e";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizePlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validPlayerName(value) {
  const name = normalizePlayerName(value);
  return name.length >= 2 && name.length <= 20 && /^[A-Za-z0-9][A-Za-z0-9 .&'\-]*$/.test(name);
}

async function checkPlayerNameAvailability() {
  const input = $("playerName");
  const status = $("playerNameStatus");
  if (!input || !status || !sb) return false;

  const name = normalizePlayerName(input.value);
  playerNameAvailable = false;

  if (!validPlayerName(name)) {
    status.textContent = name ? "Use 2-20 characters." : "";
    status.className = "player-name-status unavailable";
    return false;
  }

  status.textContent = "Checking availability...";
  status.className = "player-name-status checking";

  const { data, error } = await sb.rpc("is_player_name_available", { p_name: name });
  if (error) {
    status.textContent = "Unable to check right now.";
    status.className = "player-name-status unavailable";
    return false;
  }

  playerNameAvailable = Boolean(data);
  status.textContent = playerNameAvailable ? "Available" : "Already taken";
  status.className = `player-name-status ${playerNameAvailable ? "available" : "unavailable"}`;
  return playerNameAvailable;
}

$("playerName")?.addEventListener("input", () => {
  playerNameAvailable = false;
  clearTimeout(playerNameCheckTimer);
  playerNameCheckTimer = setTimeout(checkPlayerNameAvailability, 350);
});

renderAvatarPicker("signupAvatarPicker", selectedSignupAvatar, (avatar, suggestedName) => {
  selectedSignupAvatar = avatar;
  $("selectedAvatar").value = avatar;
  const playerNameInput = $("playerName");
  if (playerNameInput && !playerNameInput.value.trim()) playerNameInput.value = suggestedName;
});

$("loginForm").onsubmit = async event => {
  event.preventDefault();
  if (!sb) return;

  msg("authMessage", "Signing in...");

  const { error } = await sb.auth.signInWithPassword({
    email: $("loginEmail").value,
    password: $("loginPassword").value
  });

  if (error) msg("authMessage", error, true);
};

$("signupForm").onsubmit = async event => {
  event.preventDefault();
  if (!sb) return;

  const submitButton = $("signupForm").querySelector('button[type="submit"]');
  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;
  const firstName = $("firstName").value.trim();
  const lastName = $("lastName").value.trim();
  const playerName = normalizePlayerName($("playerName").value);
  const poolCode = $("poolCode").value.trim();
  const avatar = $("selectedAvatar")?.value || selectedSignupAvatar;

  if (!validPlayerName(playerName) || !(await checkPlayerNameAvailability())) {
    msg("authMessage", "Please choose an available Player Name.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Creating Your Entry...";
  msg("authMessage", "Creating your account and preparing the confirmation email...");

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: firstName,
          last_name: lastName,
          player_name: playerName,
          avatar,
          pool_code: poolCode
        }
      }
    });

    if (error) {
      msg("authMessage", error, true);
      return;
    }

    if (data?.user?.identities?.length === 0) {
      msg(
        "authMessage",
        "This email address already has an account. Please use Sign In instead.",
        true
      );
      return;
    }

    msg(
      "authMessage",
      data.session
        ? "Your entry is ready. You may now continue."
        : "Success! Check your email for the confirmation link, then return here and sign in."
    );

    $("signupForm").reset();
    selectedSignupAvatar = "🏈";
    $("selectedAvatar").value = selectedSignupAvatar;
    renderAvatarPicker("signupAvatarPicker", selectedSignupAvatar, (avatar, suggestedName) => {
      selectedSignupAvatar = avatar;
      $("selectedAvatar").value = avatar;
      const playerNameInput = $("playerName");
      if (playerNameInput && !playerNameInput.value.trim()) playerNameInput.value = suggestedName;
    });
    playerNameAvailable = false;
    $("playerNameStatus").textContent = "Choose the name other players will see.";
    $("playerNameStatus").className = "player-name-status";
  } catch (error) {
    msg("authMessage", error, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Create My Entry";
  }
};

function applyInvitationLink() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("join") !== "1") return;

  switchAuth(false);

  if (params.get("first")) $("firstName").value = params.get("first");
  if (params.get("last")) $("lastName").value = params.get("last");
  if (params.get("email")) $("signupEmail").value = params.get("email");
  if (params.get("code")) $("poolCode").value = params.get("code");

  $("poolCode").readOnly = Boolean(params.get("code"));
  msg("authMessage", "Invitation loaded. Create a password, then select Create My Entry.");
}

async function boot() {
  if (!sb) return;

  applyInvitationLink();

  sb.auth.onAuthStateChange((_event, session) => {
    session ? loadApp(session.user) : showAuth();
  });

  const { data: { session } } = await sb.auth.getSession();
  session ? await loadApp(session.user) : showAuth();
}

function setMainView(viewName) {
  const viewIds = ["authView", "welcomeView", "appView"];
  viewIds.forEach(id => {
    const element = $(id);
    if (element) element.classList.toggle("hidden", id !== viewName);
  });
}

function showAuth() {
  me = null;
  settings = null;
  games = [];
  usedTeams = [];
  currentPick = null;
  myPickHistory = [];

  setMainView("authView");
  $("logoutBtn")?.classList.add("hidden");

  const formsShell = document.querySelector(".auth-forms-shell");
  if (formsShell) formsShell.classList.add("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showWelcomePage() {
  if (!me) {
    showAuth();
    return;
  }

  renderWelcomePage(myPickHistory);
  setMainView("welcomeView");
  $("logoutBtn")?.classList.add("hidden");

  // Force the Welcome Back screen to be the first signed-in view,
  // including for the Commissioner account.
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function showPickPage() {
  setMainView("appView");
  $("logoutBtn")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCommissionerPage() {
  setMainView("appView");
  $("logoutBtn")?.classList.remove("hidden");

  // Commissioner Sign In should open the Command Centre, not the player locker.
  requestAnimationFrame(() => {
    $("commissionerPanel")?.scrollIntoView({ behavior: "auto", block: "start" });
  });
}



function openSurvivorResults() {
  const modal = $("survivorResultsModal");
  if (!modal || !me || !settings) return;

  modal.hidden = false;
  modal.style.setProperty("display", "block", "important");
  loadSurvivorResults();
}

function closeSurvivorResults() {
  const modal = $("survivorResultsModal");
  if (!modal) return;

  modal.hidden = true;
  modal.style.setProperty("display", "none", "important");
}

function survivorResultsCell(pick) {
  if (!pick) {
    return `<span style="color:#98a2b3;font-weight:800;">—</span>`;
  }

  const result = String(pick.result || "pending").toLowerCase();
  const kickoff = pick.game_kickoff ? new Date(pick.game_kickoff).getTime() : null;
  const hasStarted = kickoff ? Date.now() >= kickoff : result === "win" || result === "loss";

  // Do not reveal a future pick before its game starts.
  if (result === "pending" && !hasStarted) {
    return `<span style="color:#98a2b3;font-weight:800;">—</span>`;
  }

  const team = esc(pick.team_abbr || pick.team_name || "—");

  if (result === "win") {
    return `<strong style="color:#16803a;font-size:1rem;">${team}</strong>`;
  }

  if (result === "loss") {
    return `<strong style="color:#d71920;font-size:1rem;">${team}</strong>`;
  }

  return `<strong style="color:#667085;font-size:1rem;">${team}</strong>`;
}

async function loadSurvivorResults() {
  const target = $("survivorResultsTable");
  const status = $("survivorResultsStatus");
  if (!target || !status || !sb || !settings) return;

  target.innerHTML = `<div style="padding:26px;text-align:center;color:#667085;">Loading Survivor Results...</div>`;
  status.textContent = "";

  const currentWeek = Math.max(1, Number(settings.current_week || 1));

  const { data: picks, error } = await sb
    .from("picks")
    .select("id,user_id,week,team_abbr,team_name,game_kickoff,result")
    .lte("week", currentWeek)
    .order("week");

  if (error) {
    target.innerHTML = `<div style="padding:26px;text-align:center;color:#b42318;">Survivor Results could not be loaded.</div>`;
    return;
  }

  const weeks = Array.from({ length: currentWeek }, (_, index) => index + 1);
  const picksByPlayer = new Map();

  (picks || []).forEach(pick => {
    if (!picksByPlayer.has(pick.user_id)) picksByPlayer.set(pick.user_id, new Map());
    picksByPlayer.get(pick.user_id).set(Number(pick.week), pick);
  });

  const players = [...allProfiles].sort((a, b) =>
    publicPlayerName(a).localeCompare(publicPlayerName(b))
  );

  const headerCells = weeks.map(week => {
    const current = week === currentWeek;
    return `
      <th style="padding:10px 8px;white-space:nowrap;text-align:center;background:${current ? "#fff4cc" : "#f2f4f7"};border-bottom:2px solid #d0d5dd;border-left:1px solid #e4e7ec;color:#344054;font-size:.86rem;">
        WEEK ${week}
      </th>
    `;
  }).join("");

  const rows = players.map(player => {
    const playerPicks = picksByPlayer.get(player.id) || new Map();
    const resultCells = weeks.map(week => {
      const current = week === currentWeek;
      return `
        <td style="padding:11px 8px;min-width:62px;text-align:center;border-bottom:1px solid #eaecf0;border-left:1px solid #f0f1f3;background:${current ? "#fffaf0" : "white"};">
          ${survivorResultsCell(playerPicks.get(week))}
        </td>
      `;
    }).join("");

    const statusText = player.eliminated
      ? "ON THE BENCH"
      : Number(player.losses || 0) === 2
        ? "FINAL MULLIGAN"
        : "STILL IN";

    const statusColor = player.eliminated ? "#d71920" : "#16803a";

    return `
      <tr>
        <td style="position:sticky;left:0;z-index:2;background:white;padding:10px 8px;min-width:96px;border-bottom:1px solid #eaecf0;box-shadow:2px 0 0 #eef0f3;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:42px;height:42px;flex:0 0 42px;border-radius:10px;overflow:hidden;background:#eef1f5;display:flex;align-items:center;justify-content:center;">
              ${characterMarkup(player.avatar, "mini-character-image")}
            </div>
            <strong style="color:#d71920;font-size:.96rem;line-height:1.1;">${esc(publicPlayerName(player))}</strong>
          </div>
        </td>
        ${resultCells}
        <td style="padding:11px 8px;min-width:100px;text-align:center;border-bottom:1px solid #eaecf0;border-left:1px solid #f0f1f3;background:white;">
          <strong style="color:${statusColor};font-size:.82rem;white-space:nowrap;">${statusText}</strong>
        </td>
      </tr>
    `;
  }).join("");

  target.innerHTML = `
    <table style="width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;">
      <thead>
        <tr>
          <th style="position:sticky;left:0;z-index:4;background:#101d31;color:white;padding:12px 10px;text-align:left;min-width:96px;border-bottom:2px solid #c69a2b;">SURVIVOR</th>
          ${headerCells}
          <th style="padding:10px 8px;white-space:nowrap;text-align:center;background:#101d31;color:white;border-bottom:2px solid #c69a2b;border-left:1px solid #344054;">STATUS</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${weeks.length + 2}" style="padding:24px;text-align:center;">No survivors yet.</td></tr>`}</tbody>
    </table>
  `;

  status.textContent =
    `Through Week ${currentWeek}. Green = win. Red = loss. Picks are not shown before kickoff.`;
}

function formatSmashTalkTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function openSmashTalk() {
  const modal = $("smashTalkModal");
  if (!modal || !me) return;
  modal.hidden = false;
  modal.style.setProperty("display", "block", "important");
  $("smashTalkMessage")?.focus();
  loadSmashTalk();
}

function closeSmashTalk() {
  const modal = $("smashTalkModal");
  if (!modal) return;
  modal.hidden = true;
  modal.style.setProperty("display", "none", "important");
}

async function loadSmashTalk() {
  const feed = $("smashTalkFeed");
  if (!feed || !sb) return;

  feed.innerHTML = `<p style="text-align:center;color:#667085;">Loading Smash Talk...</p>`;

  const { data, error } = await sb
    .from("smash_talk")
    .select("id,user_id,message,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    feed.innerHTML = `<p style="color:#b42318;text-align:center;">Smash Talk is not ready yet. The Commissioner may need to run the Smash Talk database setup.</p>`;
    return;
  }

  smashTalkPosts = data || [];

  if (!smashTalkPosts.length) {
    feed.innerHTML = `<div style="background:white;border:1px solid #dfe4ea;border-radius:14px;padding:22px;text-align:center;"><strong>No Smash Talk yet.</strong><div style="color:#667085;margin-top:5px;">Be the first to make some noise.</div></div>`;
    return;
  }

  feed.innerHTML = smashTalkPosts.map(post => {
    const player = allProfiles.find(p => p.id === post.user_id);
    const playerName = player ? publicPlayerName(player) : "Former Survivor";
    const avatar = player ? characterMarkup(player.avatar, "mini-character-image") : `<span style="font-size:2rem;">🏈</span>`;
    const nickname = player?.nickname && player.nickname !== playerName
      ? `<div style="font-size:.8rem;color:#9a7418;font-weight:800;margin-top:2px;">${esc(player.nickname)}</div>`
      : "";

    const deleteButton = me?.is_admin
      ? `<button type="button" data-smash-delete="${post.id}" style="border:1px solid #d92d20;background:white;color:#b42318;border-radius:7px;padding:6px 9px;font-weight:800;cursor:pointer;">DELETE</button>`
      : "";

    return `
      <article style="background:white;border:1px solid #dfe4ea;border-radius:14px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;flex:0 0 52px;overflow:hidden;border-radius:12px;background:#eef1f5;">${avatar}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
              <div>
                <strong style="color:#c51f1a;font-size:1.05rem;">${esc(playerName)}</strong>
                ${nickname}
                <div style="font-size:.78rem;color:#667085;margin-top:3px;">${esc(formatSmashTalkTime(post.created_at))}</div>
              </div>
              ${deleteButton}
            </div>
            <div style="margin-top:10px;color:#182230;font-size:1rem;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;">${esc(post.message)}</div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  feed.querySelectorAll("[data-smash-delete]").forEach(button => {
    button.onclick = async () => {
      if (!me?.is_admin) return;
      if (!confirm("Delete this Smash Talk post?")) return;

      const { error } = await sb
        .from("smash_talk")
        .delete()
        .eq("id", button.dataset.smashDelete);

      if (error) {
        msg("smashTalkStatus", error, true);
        return;
      }

      msg("smashTalkStatus", "Post deleted.");
      await loadSmashTalk();
    };
  });
}

async function submitSmashTalk(event) {
  event.preventDefault();
  const input = $("smashTalkMessage");
  if (!input || !me || !sb) return;

  const message = input.value.trim();
  if (!message || message.length > 250) {
    msg("smashTalkStatus", "Enter a message up to 250 characters.", true);
    return;
  }

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  const { error } = await sb
    .from("smash_talk")
    .insert({ user_id: me.id, message });

  if (submitButton) submitButton.disabled = false;

  if (error) {
    msg("smashTalkStatus", error, true);
    return;
  }

  input.value = "";
  if ($("smashTalkCount")) $("smashTalkCount").textContent = "0 / 250";
  msg("smashTalkStatus", "Posted.");
  await loadSmashTalk();
}

async function loadApp(user) {
  $("authView")?.classList.add("hidden");
  $("welcomeView")?.classList.add("hidden");
  $("appView")?.classList.add("hidden");
  $("logoutBtn")?.classList.add("hidden");

  const { data: profile, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    msg(
      "pickStatus",
      "Your survivor profile is not ready. Confirm that the database setup SQL was run.",
      true
    );
    return;
  }

  me = profile;

  const { data: poolSettings, error: settingsError } = await sb
    .from("pool_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (settingsError) {
    msg("pickStatus", "Pool settings could not be loaded.", true);
    return;
  }

  settings = poolSettings;
  selectedPickWeek = Number(settings.current_week || 1);
  $("seasonDisplay").textContent = settings.season;
  setupPlayerWeekSelector();

  renderIdentity();
  await loadSharedData();
  await loadSchedule();

  $("commissionerPanel").classList.toggle("hidden", !me.is_admin);

  if (me.is_admin) {
    setupCommissioner();
    showCommissionerPage();
  } else {
    showWelcomePage();
  }
}

function formatWelcomeDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function formatWelcomeTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function getNextAvailableKickoff() {
  const now = Date.now();
  return games
    .map(game => new Date(game.date))
    .filter(date => !Number.isNaN(date.getTime()) && date.getTime() > now)
    .sort((a, b) => a - b)[0] || null;
}

function renderWelcomePage(myPicks = null) {
  if (!me || !settings || !$("welcomeView")) return;

  const losses = Number(me.losses || 0);
  const mulligans = Math.max(0, 2 - losses);
  const pickHistory = Array.isArray(myPicks) ? myPicks : [];
  const wins = pickHistory.filter(pick => pick.result === "win").length;
  const welcomeCurrentPick = pickHistory.find(pick => Number(pick.week) === Number(settings.current_week)) || null;

  $("welcomeAvatar").innerHTML = characterMarkup(me.avatar, "welcome-character-image");
  $("welcomePlayerName").textContent = me.nickname || "Survivor";
  $("welcomeRealName").textContent =
    `${me.first_name || ""} ${me.last_name || ""}`.trim() || "Ready for game day";
  $("welcomeWins").textContent = wins;
  $("welcomeMulligans").textContent = mulligans;
  $("welcomeLosses").textContent = losses;

  const week = Number(settings.current_week || 1);
  const nextKickoff = getNextAvailableKickoff();
  const currentWeekLockTime = welcomeCurrentPick?.game_kickoff ? getPickLockTime(welcomeCurrentPick.game_kickoff) : null;
  const locked = Boolean(currentWeekLockTime && Date.now() >= currentWeekLockTime.getTime()) || settings.picks_open === false;

  if (welcomeCurrentPick && locked) {
    $("welcomeWeekStatus").textContent = `YOUR WEEK ${week} PICK IS LOCKED IN`;
    $("welcomeWeekMessage").textContent = `${welcomeCurrentPick.team_name} selected. Good luck this week!`;
    $("enterPickPageBtn").textContent = "VIEW MY PICK";
  } else if (welcomeCurrentPick) {
    $("welcomeWeekStatus").textContent = `YOUR WEEK ${week} PICK IS READY`;
    $("welcomeWeekMessage").textContent =
      `${welcomeCurrentPick.team_name} selected. You may change it before kickoff.`;
    $("enterPickPageBtn").textContent = "VIEW OR CHANGE PICK";
  } else if (settings.picks_open === false) {
    $("welcomeWeekStatus").textContent = `WEEK ${week} PICKS ARE CLOSED`;
    $("welcomeWeekMessage").textContent = "The Commissioner has temporarily locked all selections.";
    $("enterPickPageBtn").textContent = "VIEW MATCHUPS";
  } else if (nextKickoff) {
    $("welcomeWeekStatus").textContent =
      `WEEK ${week} OPENS ${formatWelcomeDate(nextKickoff).toUpperCase()}`;
    $("welcomeWeekMessage").textContent =
      `${formatWelcomeTime(nextKickoff)} - Your next chance to survive starts here.`;
    $("enterPickPageBtn").textContent = "MAKE OR CHANGE PICK";
  } else {
    $("welcomeWeekStatus").textContent = `WEEK ${week} IS NOW OPEN`;
    $("welcomeWeekMessage").textContent = "Choose one unused team to survive this week.";
    $("enterPickPageBtn").textContent = "MAKE OR CHANGE PICK";
  }

  const deadlineSource =
    welcomeCurrentPick?.game_kickoff ||
    nextKickoff?.toISOString?.() ||
    games.map(game => game.date).filter(Boolean).sort()[0] ||
    null;
  const deadline = deadlineSource ? getPickLockTime(deadlineSource) : null;

  $("welcomeDeadlineDate").textContent =
    deadline ? formatWelcomeDate(deadline) : "Schedule not available yet";
  $("welcomeDeadlineTime").textContent =
    deadline ? formatWelcomeTime(deadline) : "";
}

function formatHistoryStatus(result) {
  if (result === "win") return { label: "WIN", className: "history-win" };
  if (result === "loss") return { label: "LOSS", className: "history-loss" };
  return { label: "PENDING", className: "history-pending" };
}

function renderPickHistory() {
  const target = $("pickHistoryList");
  if (!target) return;

  const picks = Array.isArray(myPickHistory)
    ? [...myPickHistory].sort((a, b) => Number(a.week || 0) - Number(b.week || 0))
    : [];

  if (!picks.length) {
    target.innerHTML = `
      <div class="pick-history-empty">
        <strong>Your survivor run starts here.</strong>
        <span>No picks have been recorded yet.</span>
      </div>
    `;
    return;
  }

  target.innerHTML = picks.map(pick => {
    const status = formatHistoryStatus(pick.result);
    const kickoff = pick.game_kickoff
      ? new Date(pick.game_kickoff).toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })
      : "Game time unavailable";

    return `
      <article class="pick-history-row">
        <div class="pick-history-week">
          <span>WEEK</span>
          <strong>${esc(pick.week)}</strong>
        </div>
        <div class="pick-history-team">
          <strong>${esc(pick.team_name || pick.team_abbr || "Team")}</strong>
          <span>${esc(kickoff)}</span>
          ${pick.spread_at_pick ? `<span>Spread when picked: ${esc(pick.spread_at_pick)}</span>` : ""}
        </div>
        <span class="pick-history-status ${status.className}">${status.label}</span>
      </article>
    `;
  }).join("");
}

function openPickHistory() {
  renderPickHistory();
  $("pickHistoryModal")?.classList.remove("hidden");
  document.body.classList.add("history-open");
}

function closePickHistory() {
  $("pickHistoryModal")?.classList.add("hidden");
  document.body.classList.remove("history-open");
}

function bindWelcomePageControls() {
  $("enterPickPageBtn")?.addEventListener("click", showPickPage);

  $("welcomeHistoryBtn")?.addEventListener("click", openPickHistory);

  $("closePickHistoryBtn")?.addEventListener("click", closePickHistory);
  $("pickHistoryBackdrop")?.addEventListener("click", closePickHistory);

  $("backToLockerBtn")?.addEventListener("click", async () => {
    selectedPickWeek = Number(settings.current_week);
    if ($("playerWeekSelect")) $("playerWeekSelect").value = String(selectedPickWeek);
    currentPick = myPickHistory.find(item => Number(item.week) === selectedPickWeek) || null;
    updateSelectedWeekLabels();
    await loadSchedule(selectedPickWeek);
    renderCurrentPickCard();
    showWelcomePage();
  });

  $("welcomeLeaderboardBtn")?.addEventListener("click", () => {
    showPickPage();
    $("activeSurvivors")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("welcomeLockerBtn")?.addEventListener("click", () => {
    showPickPage();
    $("identity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("welcomeHowToPlayBtn")?.addEventListener("click", () => {
    alert(
      "Pick one team to win each week.\n\n" +
      "You cannot use the same team twice.\n\n" +
      "Two losses use your two mulligans. A third loss moves you to the bench."
    );
  });

  $("welcomeSignOutBtn")?.addEventListener("click", async () => {
    if (!sb) return;
    await sb.auth.signOut();
  });
}

bindWelcomePageControls();

function renderIdentity() {
  const status = me.eliminated ? "On the Bench" : "Still in the Game";
  const canEditPlayerName = Number(settings.current_week) === 1 && settings.picks_open !== false;

  $("identity").innerHTML = `
    <div class="identity">
      <div class="avatar">${characterMarkup(me.avatar, "identity-character-image")}</div>
      <div class="identity-copy">
        <div class="identity-label">PLAYER NAME</div>
        <h2>${esc(me.nickname)}</h2>
        <div class="identity-status">${esc(status)}</div>
        <div class="small">Losses: ${Number(me.losses || 0)} &bull; Mulligans remaining: ${Math.max(0, 2 - Number(me.losses || 0))}</div>
        ${canEditPlayerName ? `<div class="identity-actions"><button id="editPlayerNameBtn" class="secondary compact-btn">Change Player Name</button><button id="editAvatarBtn" class="secondary compact-btn">Change Character</button></div>` : `<div class="small locked-name">Player identity locked for this season.</div>`}
      </div>
    </div>
    <div id="avatarEditor" class="player-name-editor hidden">
      <label>Choose Your Character</label>
      <div id="editAvatarPicker" class="avatar-picker"></div>
      <div class="inline-actions">
        <button id="saveAvatarBtn">Save Character</button>
        <button id="cancelAvatarBtn" class="secondary">Cancel</button>
      </div>
    </div>
    <div id="playerNameEditor" class="player-name-editor hidden">
      <label>New Player Name</label>
      <input id="editPlayerName" maxlength="20" value="${esc(me.nickname)}">
      <div id="editPlayerNameStatus" class="player-name-status">Use 2–20 characters.</div>
      <div class="inline-actions">
        <button id="savePlayerNameBtn">Save Player Name</button>
        <button id="cancelPlayerNameBtn" class="secondary">Cancel</button>
      </div>
    </div>`;

  if (!canEditPlayerName) return;

  let pendingAvatar = me.avatar || "clutch-chris";
  renderAvatarPicker("editAvatarPicker", pendingAvatar, avatar => { pendingAvatar = avatar; });
  $("editAvatarBtn").onclick = () => $("avatarEditor").classList.remove("hidden");
  $("cancelAvatarBtn").onclick = () => $("avatarEditor").classList.add("hidden");
  $("saveAvatarBtn").onclick = async () => {
    const { data, error } = await sb.rpc("change_my_avatar", { p_avatar: pendingAvatar });
    if (error) {
      alert(readableError(error));
      return;
    }
    me.avatar = data;
    await loadSharedData();
    renderIdentity();
  };

  $("editPlayerNameBtn").onclick = () => $("playerNameEditor").classList.remove("hidden");
  $("cancelPlayerNameBtn").onclick = () => $("playerNameEditor").classList.add("hidden");
  $("savePlayerNameBtn").onclick = async () => {
    const name = normalizePlayerName($("editPlayerName").value);
    const statusEl = $("editPlayerNameStatus");
    if (!validPlayerName(name)) {
      statusEl.textContent = "Use 2–20 valid characters.";
      statusEl.className = "player-name-status unavailable";
      return;
    }

    statusEl.textContent = "Saving…";
    statusEl.className = "player-name-status checking";
    const { data, error } = await sb.rpc("change_my_player_name", { p_name: name });
    if (error) {
      statusEl.textContent = readableError(error);
      statusEl.className = "player-name-status unavailable";
      return;
    }

    me.nickname = data;
    await loadSharedData();
    renderIdentity();
  };
}


function setupPlayerWeekSelector() {
  const select = $("playerWeekSelect");
  if (!select || !settings) return;

  const currentWeek = Math.max(1, Number(settings.current_week || 1));
  const previousValue = Number(selectedPickWeek || currentWeek);

  select.innerHTML = Array.from(
    { length: 19 - currentWeek },
    (_, index) => currentWeek + index
  ).map(week => `<option value="${week}">Week ${week}${week === currentWeek ? " — Current" : ""}</option>`).join("");

  selectedPickWeek = Math.min(18, Math.max(currentWeek, previousValue));
  select.value = String(selectedPickWeek);

  updateSelectedWeekLabels();

  select.onchange = async () => {
    selectedPickWeek = Number(select.value);
    currentPick = myPickHistory.find(item => Number(item.week) === selectedPickWeek) || null;
    updateSelectedWeekLabels();
    renderCurrentPickCard();
    await loadSchedule(selectedPickWeek);
  };
}

function updateSelectedWeekLabels() {
  if (!settings) return;
  const currentWeek = Number(settings.current_week || 1);
  const selected = Number(selectedPickWeek || currentWeek);

  if ($("pickPageWeekHeading")) $("pickPageWeekHeading").textContent = selected;

  if ($("selectedWeekNote")) {
    $("selectedWeekNote").textContent =
      selected === currentWeek
        ? `You are making your current Week ${selected} selection.`
        : `You are planning ahead for Week ${selected}. You may change this pick until its selected game locks.`;
  }
}

function selectedWeekPick() {
  return myPickHistory.find(item => Number(item.week) === Number(selectedPickWeek)) || null;
}

function selectedPickIsInvalidBecauseTeamWasUsed() {
  if (!currentPick?.team_abbr) return false;
  return myPickHistory.some(item =>
    Number(item.week) < Number(selectedPickWeek) &&
    item.team_abbr === currentPick.team_abbr &&
    (item.result === "win" || item.result === "loss")
  );
}

async function loadSharedData() {
  const requests = [
    sb.from("profiles")
      .select("id,first_name,last_name,nickname,avatar,losses,eliminated,paid,is_admin,created_at")
      .order("created_at"),
    sb.from("picks")
      .select("id,user_id,week,team_abbr,team_name,game_id,game_kickoff,result,auto_assigned,spread_at_pick,created_at,updated_at")
      .eq("week", settings.current_week)
  ];
  if (me.is_admin) requests.push(sb.from("pool_invites").select("*").order("created_at", { ascending:false }));

  const results = await Promise.all(requests);
  if (results[0].error || results[1].error) {
    msg("pickStatus", "Pool information could not be loaded.", true);
    return;
  }

  allProfiles = results[0].data || [];
  currentWeekPicks = results[1].data || [];
  allInvites = results[2]?.data || [];

  const active = allProfiles.filter(p => !p.eliminated);
  const bench = allProfiles.filter(p => p.eliminated);
  const entryFee = Number(settings.entry_fee || 20);
  const prize = allProfiles.filter(p => p.paid).length * entryFee;

  $("playerCount").textContent = allProfiles.length;
  $("activeCount").textContent = active.length;
  $("benchCount").textContent = bench.length;
  $("prizeTotal").textContent = `$${prize}`;

  renderSurvivorList("activeSurvivors", active, false);
  renderSurvivorList("benchSurvivors", bench, true);

  const { data: myPicks, error: myPicksError } = await sb
    .from("picks")
    .select("id,week,team_abbr,team_name,game_id,game_kickoff,result,auto_assigned,spread_at_pick,created_at,updated_at")
    .eq("user_id", me.id)
    .order("week");

  if (myPicksError) {
    msg("pickStatus", "Your pick history could not be loaded.", true);
    return;
  }

  myPickHistory = myPicks || [];
  usedTeams = myPickHistory
    .filter(item => item.result === "win" || item.result === "loss")
    .map(item => item.team_abbr);
  currentPick = myPickHistory.find(item => Number(item.week) === Number(selectedPickWeek || settings.current_week)) || null;
  renderCurrentPickCard();
  renderWelcomePage(myPicks || []);

  if (me.is_admin) {
    $("commissionerSeason").textContent = settings.season;
    $("commissionerWeek").textContent = settings.current_week;
    $("commissionerPlayers").textContent = allProfiles.length;
    $("commissionerPrize").textContent = `$${prize}`;
    renderCommissionerStatus();
    renderCommissionerPlayerBoard();
    renderLockerRoom();
    renderInvitations();
  }
}

function publicPlayerName(player) {
  const first = (player.first_name || "").trim();
  const last = (player.last_name || "").trim();
  const base = first || player.nickname || "Survivor";

  if (!first) return base;

  const duplicateFirstName = allProfiles.some(other =>
    other.id !== player.id &&
    (other.first_name || "").trim().toLowerCase() === first.toLowerCase()
  );

  return duplicateFirstName && last
    ? `${first} ${last.charAt(0).toUpperCase()}.`
    : first;
}

function renderSurvivorList(elementId, players, onBench) {
  const target = $(elementId);

  if (!players.length) {
    target.innerHTML = `<p class="small">${onBench ? "The bench is empty." : "No active survivors yet."}</p>`;
    return;
  }

  target.innerHTML = players.map(player => {
    const badge = onBench
      ? `<span class="badge out-b">On the Bench</span>`
      : player.losses === 2
        ? `<span class="badge danger-b">Final Mulligan</span>`
        : `<span class="badge active-b">Still in the Game</span>`;

    return `
      <div class="survivor-row">
        <div class="survivor-name" style="display:flex;align-items:center;gap:.65rem;min-width:0;">
          <div class="mini-avatar">${characterMarkup(player.avatar, "mini-character-image")}</div>
          <div style="min-width:0;">
            <strong style="display:block !important;color:#d71920 !important;font-size:1rem !important;line-height:1.15 !important;visibility:visible !important;opacity:1 !important;">
              ${esc(publicPlayerName(player))}
            </strong>
            ${player.nickname && player.nickname !== publicPlayerName(player)
              ? `<div class="small" style="display:block !important;color:#d6b35a !important;margin-top:.12rem;">${esc(player.nickname)}</div>`
              : ""}
          </div>
        </div>
        ${badge}
      </div>
    `;
  }).join("");
}

function getPickLockTime(kickoffValue) {
  if (!kickoffValue) return null;
  return new Date(new Date(kickoffValue).getTime() - 15 * 60 * 1000);
}

function isCurrentPickLocked() {
  if (!currentPick?.game_kickoff) return false;
  const lockTime = getPickLockTime(currentPick.game_kickoff);
  return new Date() >= lockTime;
}

function formatRemaining(milliseconds) {
  if (milliseconds <= 0) return "Locked";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function renderCurrentPickCard() {
  if (!$("currentPickCard")) return;

  $("pickCardWeek").textContent = selectedPickWeek || settings.current_week;

  if (pickCountdownTimer) {
    clearInterval(pickCountdownTimer);
    pickCountdownTimer = null;
  }

  const invalidBecauseUsedEarlier = selectedPickIsInvalidBecauseTeamWasUsed();

  if (!currentPick) {
    $("currentPickCard").classList.remove("locked");
    $("pickCardBadge").textContent = "Not Selected";
    $("pickCardBadge").className = "badge danger-b";
    $("pickCardTeam").textContent = "No pick submitted yet";
    $("pickCardDetails").textContent = "Choose one unused team below.";
    $("pickCardCountdown").textContent = "";
    return;
  }

  const locked = isCurrentPickLocked() || settings.picks_open === false;
  const lockTime = getPickLockTime(currentPick.game_kickoff);
  const lastChanged = currentPick.updated_at || currentPick.created_at;

  $("currentPickCard").classList.toggle("locked", locked || invalidBecauseUsedEarlier);
  $("pickCardBadge").textContent = invalidBecauseUsedEarlier ? "Needs Change" : (locked ? "Locked" : "Confirmed");
  $("pickCardBadge").className = `badge ${invalidBecauseUsedEarlier || locked ? "out-b" : "active-b"}`;
  $("pickCardTeam").textContent = currentPick.team_name;

  const spreadSnapshot = currentPick.spread_at_pick
    ? ` Spread when selected: ${currentPick.spread_at_pick}.`
    : "";

  $("pickCardDetails").textContent = invalidBecauseUsedEarlier
    ? `This team was later used in an earlier completed week. Choose a different Week ${selectedPickWeek} team.${spreadSnapshot}`
    : currentPick.auto_assigned
      ? `Emergency auto-pick assigned because no selection was submitted before the weekly safeguard.${spreadSnapshot}`
      : locked
        ? `Locked for Week ${selectedPickWeek}. Good luck!${spreadSnapshot}`
        : `Last changed ${new Date(lastChanged).toLocaleString()}. You may change it before the automatic lock.${spreadSnapshot}`;

  const updateCountdown = () => {
    if (!lockTime) {
      $("pickCardCountdown").textContent = "";
      return;
    }

    const remaining = lockTime.getTime() - Date.now();
    if (remaining <= 0 || settings.picks_open === false) {
      $("pickCardCountdown").textContent =
        `Locked at ${lockTime.toLocaleString()} — 15 minutes before kickoff`;
      $("currentPickCard").classList.add("locked");
      $("pickCardBadge").textContent = "Locked";
      $("pickCardBadge").className = "badge out-b";
      renderGames();
      if (pickCountdownTimer) clearInterval(pickCountdownTimer);
      pickCountdownTimer = null;
    } else {
      $("pickCardCountdown").textContent =
        `Automatically locks in ${formatRemaining(remaining)} (${lockTime.toLocaleString()})`;
    }
  };

  updateCountdown();
  if (!locked) pickCountdownTimer = setInterval(updateCountdown, 30000);
}

async function syncWeeklyGamesForSafeguard() {
  if (!me?.is_admin || !games.length || Number(selectedPickWeek) !== Number(settings.current_week)) return;

  const scheduleRows = games.map(game => ({
    season: Number(settings.season),
    week: Number(selectedPickWeek),
    game_id: String(game.id),
    kickoff: game.date,
    home_abbr: game.home.abbr,
    home_name: game.home.name,
    away_abbr: game.away.abbr,
    away_name: game.away.name
  }));

  const { error } = await sb.rpc("commissioner_sync_weekly_games", {
    p_games: scheduleRows
  });

  if (error) {
    console.error("No-pick safeguard schedule sync failed:", error);
  }
}

async function loadSchedule(week = selectedPickWeek || settings.current_week) {
  const requestedWeek = Number(week);
  selectedPickWeek = requestedWeek;
  scheduleWeekLoaded = requestedWeek;
  updateSelectedWeekLabels();

  msg("pickStatus", `Loading Week ${requestedWeek} NFL matchups...`);

  try {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
      `?seasontype=2&week=${requestedWeek}&dates=${settings.season}`;

    const response = await fetch(url);
    const json = await response.json();

    games = (json.events || []).map(event => {
      const competition = event.competitions[0];
      const home = competition.competitors.find(team => team.homeAway === "home");
      const away = competition.competitors.find(team => team.homeAway === "away");

      const postedOdds = Array.isArray(competition.odds) ? competition.odds[0] : null;
      const spreadText =
        postedOdds?.details ||
        postedOdds?.displayValue ||
        null;

      return {
        id: event.id,
        date: event.date,
        completed: event.status.type.completed,
        spread: spreadText,
        home: {
          abbr: home.team.abbreviation,
          name: home.team.displayName,
          winner: Boolean(home.winner)
        },
        away: {
          abbr: away.team.abbreviation,
          name: away.team.displayName,
          winner: Boolean(away.winner)
        }
      };
    });

    await syncWeeklyGamesForSafeguard();
    renderGames();
    if (Number(requestedWeek) === Number(settings.current_week)) renderWelcomePage();

    msg(
      "pickStatus",
      games.length
        ? "Select one team to win. A team becomes unavailable only after its picked game is completed."
        : "The schedule is not available yet.",
      !games.length
    );
  } catch {
    msg("pickStatus", "The NFL schedule could not be loaded. Try again shortly.", true);
  }
}

function renderGames() {
  $("games").innerHTML = games.map(game => `
    <div class="game">
      <div class="game-time">${new Date(game.date).toLocaleString()}</div>
      <div class="game-spread" style="text-align:center;font-size:.9rem;font-weight:800;letter-spacing:.06em;margin:.35rem 0 .65rem;">
        SPREAD: ${game.spread ? esc(game.spread) : "Not posted"}
      </div>
      <div class="matchup">
        ${teamCard(game.away, "AWAY TEAM", false, game)}
        <div class="at"><b>AT</b></div>
        ${teamCard(game.home, "HOME TEAM", true, game)}
      </div>
    </div>
  `).join("");
}

function teamCard(team, location, home = false, game) {
  const invalidCurrentFuturePick = selectedPickIsInvalidBecauseTeamWasUsed();
  const selected = currentPick?.team_abbr === team.abbr && !invalidCurrentFuturePick;
  const usedInPriorWeek = usedTeams.includes(team.abbr) && !selected;
  const gameLockTime = getPickLockTime(game.date);
  const gameLocked = Date.now() >= gameLockTime.getTime();
  const currentSelectionLocked = isCurrentPickLocked();
  const emergencyLocked = settings.picks_open === false;
  const disabled =
    usedInPriorWeek ||
    me.eliminated ||
    gameLocked ||
    currentSelectionLocked ||
    emergencyLocked;

  let buttonText = `Pick ${esc(team.abbr)}`;
  if (selected) buttonText = currentSelectionLocked || emergencyLocked ? "Your Locked Pick" : "Your Current Pick";
  else if (usedInPriorWeek) buttonText = "Already Used";
  else if (gameLocked) buttonText = "Game Locked";
  else if (currentSelectionLocked || emergencyLocked) buttonText = "Changes Locked";

  return `
    <div class="team ${home ? "home" : ""} ${usedInPriorWeek ? "used" : ""} ${selected ? "selected" : ""}">
      <b>${esc(team.name)}</b>
      <div class="where">${location}</div>
      <button
        ${disabled || selected ? "disabled" : ""}
        onclick="makePick('${team.abbr}','${esc(team.name).replace(/'/g, "&#39;")}','${game.id}','${game.date}')">
        ${buttonText}
      </button>
      <div class="lock-note">Locks ${gameLockTime.toLocaleString()}</div>
    </div>
  `;
}

window.makePick = async (abbr, name, gameId, gameKickoff) => {
  if (settings.picks_open === false) {
    return msg("pickStatus", "All picks are under an emergency lock.", true);
  }

  if (isCurrentPickLocked()) {
    return msg("pickStatus", "Your current selection is already locked.", true);
  }

  const newLockTime = getPickLockTime(gameKickoff);
  if (Date.now() >= newLockTime.getTime()) {
    return msg("pickStatus", "That game is already inside its 15-minute lock period.", true);
  }

  let confirmation;
  if (currentPick) {
    confirmation =
      `Change your Week ${selectedPickWeek} pick?\n\n` +
      `Current: ${currentPick.team_name}\n` +
      `New: ${name}`;
  } else {
    confirmation = `Select ${name} to win Week ${selectedPickWeek}?`;
  }

  if (!confirm(confirmation)) return;

  msg("pickStatus", currentPick ? "Changing your pick..." : "Saving your pick...");

  const selectedGame = games.find(game => String(game.id) === String(gameId));
  const spreadAtPick = selectedGame?.spread || null;

  const { data, error } = await sb.rpc("save_or_change_pick_with_spread", {
    p_week: Number(selectedPickWeek),
    p_team_abbr: abbr,
    p_team_name: name,
    p_game_id: gameId,
    p_game_kickoff: gameKickoff,
    p_spread: spreadAtPick
  });

  if (error) {
    return msg("pickStatus", error, true);
  }

  currentPick = data;
  msg(
    "pickStatus",
    `${name} is now your confirmed Week ${selectedPickWeek} selection.`
  );

  await loadSharedData();
  renderGames();
  renderWelcomePage();
};


function setupCommissioner() {
  $("adminWeek").innerHTML = Array.from({length:18}, (_,i) => `<option value="${i+1}">Week ${i+1}</option>`).join("");
  $("adminWeek").value = settings.current_week;
  $("adminSeason").value = settings.season;
  $("adminEntryFee").value = Number(settings.entry_fee || 20);
  $("adminMaxSurvivors").value = Number(settings.max_survivors || 20);
  $("adminRegistrationOpen").checked = settings.registration_open !== false;

  $("saveSettingsBtn").onclick = async () => {
    const updates = {
      current_week:Number($("adminWeek").value),
      season:Number($("adminSeason").value),
      entry_fee:Number($("adminEntryFee").value),
      max_survivors:Number($("adminMaxSurvivors").value),
      registration_open:$("adminRegistrationOpen").checked
    };
    const { error } = await sb.from("pool_settings").update(updates).eq("id",1);
    msg("commissionerMessage", error ? error.message : "Pool settings updated.", Boolean(error));
    if (!error) {
      settings = {...settings, ...updates};
      selectedPickWeek = Number(settings.current_week);
      setupPlayerWeekSelector();
      $("seasonDisplay").textContent = settings.season;
      $("currentWeek").textContent = settings.current_week;
      $("commissionerWeek").textContent = settings.current_week;
      $("boardWeek").textContent = settings.current_week;
      await loadSchedule();
      await loadSharedData();
      renderCurrentPickCard();
      renderGames();
    }
  };

  $("scoreBtn").onclick = finalizeWeek;
  $("controlResultsBtn").onclick = finalizeWeek;
  $("emergencyToggleBtn").onclick = () => setPicksOpen(settings.picks_open === false);
  $("advanceWeekBtn").onclick = advanceWeek;
  $("manageSurvivorsBtn").onclick = () => $("lockerRoomSection").scrollIntoView({ behavior:"smooth" });
  $("poolSettingsBtn").onclick = () => $("poolSettingsSection").scrollIntoView({ behavior:"smooth" });
  $("showInviteBtn").onclick = () => $("inviteForm").classList.remove("hidden");
  $("cancelInviteBtn").onclick = () => { $("inviteForm").reset(); $("inviteForm").classList.add("hidden"); };
  $("inviteForm").onsubmit = createInvitation;
  renderCommissionerStatus();
}

function renderCommissionerStatus() {
  if (!me?.is_admin || !settings) return;

  const picksOpen = settings.picks_open !== false;

  $("picksStatusBadge").innerHTML = picksOpen
    ? '<span class="status-dot"></span>Automatic Locking Active'
    : '<span class="status-dot"></span>Emergency Lock Active';
  $("picksStatusBadge").className = `system-status ${picksOpen ? "" : "emergency"}`;

  $("emergencyToggleTitle").textContent = picksOpen
    ? "Emergency Lock"
    : "Resume Automatic Locking";
  $("emergencyToggleDescription").textContent = picksOpen
    ? "Lock every pick only if needed"
    : "End the emergency lock";
  $("emergencyToggleBtn").classList.toggle("action-card-alert", picksOpen);

  $("lastActionText").textContent =
    settings.last_action_text || "No actions recorded this week.";
  $("lastActionTime").textContent = settings.last_action_at
    ? new Date(settings.last_action_at).toLocaleString()
    : "";
}

async function setPicksOpen(open) {
  const question = open
    ? "Resume normal automatic pick locking?"
    : "Emergency-lock every survivor's picks immediately?";
  if (!confirm(question)) return;

  const { data, error } = await sb.rpc("commissioner_set_picks_open", {
    p_open: open
  });

  if (error) return msg("commissionerMessage", error, true);

  settings = { ...settings, ...(data || {}) };
  renderCommissionerStatus();
  renderCurrentPickCard();
  renderGames();
  msg("commissionerMessage", open ? "Normal automatic locking resumed." : "Emergency lock activated.");
}

async function advanceWeek() {
  if (settings.current_week >= 18) {
    return msg("commissionerMessage", "Week 18 is the final regular-season week.", true);
  }

  const nextWeek = settings.current_week + 1;
  if (!confirm(`Advance the pool from Week ${settings.current_week} to Week ${nextWeek}?`)) return;

  const { data, error } = await sb.rpc("commissioner_advance_week");
  if (error) return msg("commissionerMessage", error, true);

  settings = { ...settings, ...(data || {}) };
  $("adminWeek").value = settings.current_week;
  $("currentWeek").textContent = settings.current_week;
  $("commissionerWeek").textContent = settings.current_week;
  renderCommissionerStatus();
  msg("commissionerMessage", `The pool is now on Week ${settings.current_week}.`);
  await loadSchedule();
  await loadSharedData();
}

async function createInvitation(event) {
  event.preventDefault();
  const firstName = $("inviteFirstName").value.trim();
  const lastName = $("inviteLastName").value.trim();
  const email = $("inviteEmail").value.trim().toLowerCase();

  const { error } = await sb.rpc("commissioner_create_invite", {
    p_first_name:firstName, p_last_name:lastName, p_email:email
  });
  if (error) return msg("commissionerMessage", error, true);

  $("inviteForm").reset();
  $("inviteForm").classList.add("hidden");
  msg("commissionerMessage", `Invitation prepared for ${firstName}.`);
  await loadSharedData();
}

function formatBoardUpdated(value) {
  if (!value) return "—";
  const date = new Date(value);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function renderCommissionerPlayerBoard() {
  if (!me?.is_admin || !$("commissionerPlayerBoard")) return;

  const profileNames = new Set(
    allProfiles.map(player => `${player.first_name} ${player.last_name}`.trim().toLowerCase())
  );

  const rows = [
    ...allProfiles.map(player => {
      const pick = currentWeekPicks.find(item => item.user_id === player.id);
      return {
        avatar: player.avatar,
        name: `${player.first_name} ${player.last_name}`.trim(),
        nickname: player.nickname,
        status: player.eliminated ? "On the Bench" : player.is_admin ? "Commissioner" : "Joined",
        pick: pick?.team_name || "",
        updated: pick?.updated_at || pick?.created_at || "",
        mulligans: Math.max(0, 2 - Number(player.losses || 0))
      };
    }),
    ...allInvites
      .filter(invite =>
        invite.status !== "joined" &&
        !profileNames.has(`${invite.first_name} ${invite.last_name}`.trim().toLowerCase())
      )
      .map(invite => ({
        avatar: "INV",
        name: `${invite.first_name} ${invite.last_name}`.trim(),
        nickname: "",
        status: "Invited",
        pick: "",
        updated: "",
        mulligans: 2
      }))
  ];

  const activePlayers = allProfiles.filter(player => !player.eliminated);
  const submitted = activePlayers.filter(player =>
    currentWeekPicks.some(pick => pick.user_id === player.id)
  ).length;
  const waiting = Math.max(0, activePlayers.length - submitted);
  const bench = allProfiles.filter(player => player.eliminated).length;

  $("boardWeek").textContent = settings.current_week;
  $("boardRegistered").textContent = `${allProfiles.length} / ${Number(settings.max_survivors || 20)}`;
  $("boardJoined").textContent = allProfiles.length;
  $("boardPicksSubmitted").textContent = submitted;
  $("boardWaiting").textContent = waiting;
  $("boardBench").textContent = bench;

  $("missingPickAlert").textContent = waiting
    ? `${waiting} active ${waiting === 1 ? "player still needs" : "players still need"} a Week ${settings.current_week} pick.`
    : `All active players have submitted a Week ${settings.current_week} pick.`;
  $("missingPickAlert").className = `missing-pick-alert ${waiting ? "warning" : "clear"}`;

  const search = $("playerSearch")?.value?.trim().toLowerCase() || "";
  const filtered = rows.filter(row =>
    `${row.name} ${row.nickname} ${row.status} ${row.pick}`.toLowerCase().includes(search)
  );

  $("commissionerPlayerBoard").innerHTML = filtered.map(row => {
    const statusClass =
      row.status === "On the Bench" ? "out-b" :
      row.status === "Invited" ? "danger-b" :
      row.status === "Commissioner" ? "status-commissioner" : "active-b";

    return `
      <tr>
        <td>
          <div class="player-board-player">
            <div class="mini-avatar">${row.avatar === "INV" ? "INV" : characterMarkup(row.avatar, "mini-character-image")}</div>
            <div>
              <strong>${esc(row.nickname || row.name)}</strong>
              ${row.nickname ? `<div class="small">${esc(row.name)}</div>` : ""}
            </div>
          </div>
        </td>
        <td><span class="badge ${statusClass}">${esc(row.status)}</span></td>
        <td class="${row.pick ? "pick-present" : "pick-missing"}">${row.pick ? esc(row.pick) : "No pick yet"}</td>
        <td>${row.updated ? esc(formatBoardUpdated(row.updated)) : "—"}</td>
        <td>${row.mulligans}</td>
      </tr>`;
  }).join("");

  if (!$("playerSearch").dataset.bound) {
    $("playerSearch").addEventListener("input", renderCommissionerPlayerBoard);
    $("playerSearch").dataset.bound = "true";
  }
}

function renderLockerRoom() {
  $("lockerRoom").innerHTML = allProfiles.length ? allProfiles.map(player => `
    <div class="locker-card">
      <div class="survivor-name">
        <div class="mini-avatar">${characterMarkup(player.avatar, "mini-character-image")}</div>
        <div><strong>${esc(player.nickname)}</strong><div class="small">${esc(player.first_name)} ${esc(player.last_name)}</div></div>
      </div>
      <div>
        <span class="badge ${player.eliminated ? "out-b":"active-b"}">${player.eliminated ? "On the Bench":"Still in the Game"}</span>
        <div class="small">${player.paid ? "Entry paid":"Payment outstanding"}</div>
      </div>
      <div class="locker-actions">
        <button onclick="togglePaid('${player.id}', ${!player.paid})">${player.paid ? "Mark Unpaid":"Mark Paid"}</button>
        <button class="${player.eliminated ? "":"danger-btn"}" onclick="toggleBench('${player.id}', ${!player.eliminated})">${player.eliminated ? "Return to Game":"Move to Bench"}</button>
        ${player.id !== me.id ? `<button type="button" class="remove-player-btn" data-remove-player-id="${player.id}">Remove Player</button>` : ""}
      </div>
    </div>`).join("") : '<p class="small">No survivors have joined yet.</p>';
}

window.togglePaid = async (profileId, paid) => {
  const { error } = await sb.rpc("commissioner_update_profile",{p_profile_id:profileId,p_paid:paid,p_eliminated:null});
  if (error) return msg("commissionerMessage", error, true);
  await loadSharedData();
};

window.toggleBench = async (profileId, eliminated) => {
  const { error } = await sb.rpc("commissioner_update_profile",{p_profile_id:profileId,p_paid:null,p_eliminated:eliminated});
  if (error) return msg("commissionerMessage", error, true);
  await loadSharedData();
};


let pendingRemovePlayerId = null;

window.openRemovePlayer = profileId => {
  if (!me?.is_admin) return;
  const player = allProfiles.find(item => item.id === profileId);
  if (!player || player.id === me.id) return;

  pendingRemovePlayerId = profileId;
  const displayName = player.nickname || `${player.first_name || ""} ${player.last_name || ""}`.trim() || "this player";
  $("removePlayerMessage").textContent =
    `Remove ${displayName} completely from Season of the Survivors? It will be as if this player never joined the pool.`;
  const modal = $("removePlayerModal");
  if (modal) {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.remove("hidden");
    modal.style.setProperty("display", "grid", "important");
  }
};

// Delegated handler keeps Remove Player working even though the locker list
// is re-rendered dynamically after updates.
document.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-player-id]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  window.openRemovePlayer(button.dataset.removePlayerId);
});

function closeRemovePlayerModal() {
  pendingRemovePlayerId = null;
  const modal = $("removePlayerModal");
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.classList.add("hidden");
    modal.style.setProperty("display", "none", "important");
  }
}

$("cancelRemovePlayerBtn")?.addEventListener("click", closeRemovePlayerModal);
$("removePlayerModal")?.querySelector(".remove-player-backdrop")?.addEventListener("click", closeRemovePlayerModal);

$("confirmRemovePlayerBtn")?.addEventListener("click", async () => {
  const profileId = pendingRemovePlayerId;
  if (!profileId || !me?.is_admin) return;

  const button = $("confirmRemovePlayerBtn");
  button.disabled = true;
  button.textContent = "DELETING...";

  const { error } = await sb.rpc("commissioner_delete_player_permanently", {
    p_profile_id: profileId
  });

  button.disabled = false;
  button.textContent = "DELETE PLAYER PERMANENTLY";

  if (error) {
    msg("commissionerMessage", error.message || String(error), true);
    return;
  }

  closeRemovePlayerModal();
  msg("commissionerMessage", "Player permanently removed. Player count and prize pool recalculated.");
  await loadSharedData();
});

function renderInvitations() {
  $("invitationList").innerHTML = allInvites.length ? allInvites.map(invite => {
    const inviteUrl = new URL(window.location.origin + "/");
    inviteUrl.searchParams.set("join", "1");
    inviteUrl.searchParams.set("first", invite.first_name);
    inviteUrl.searchParams.set("last", invite.last_name);
    inviteUrl.searchParams.set("email", invite.email);
    inviteUrl.searchParams.set("code", settings.pool_code);

    const subject = encodeURIComponent("NFL Summerland Survivor Pool Invitation");
    const body = encodeURIComponent(
      `Hi ${invite.first_name},\n\n` +
      `You are invited to join the NFL Summerland Survivor Pool.\n\n` +
      `Tap this personalized link:\n${inviteUrl.toString()}\n\n` +
      `Create a password and select Create My Entry.\n\n` +
      `One Winning Pick. Every Week. Last Survivor Standing.`
    );
    return `<div class="locker-card">
      <div><strong>${esc(invite.first_name)} ${esc(invite.last_name)}</strong><div class="email-link">${esc(invite.email)}</div></div>
      <div><span class="badge ${invite.status==="joined"?"active-b":"danger-b"}">${esc(invite.status)}</span></div>
      <div class="locker-actions">
        <button onclick="window.location.href='mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}'">Open Email</button>
        <button class="danger-btn" onclick="deleteInvitation('${invite.id}')">Remove</button>
      </div>
    </div>`;
  }).join("") : '<p class="small">No invitations have been prepared.</p>';
}

window.deleteInvitation = async inviteId => {
  if (!confirm("Remove this invitation?")) return;
  const { error } = await sb.rpc("commissioner_delete_invite",{p_invite_id:inviteId});
  if (error) return msg("commissionerMessage", error, true);
  await loadSharedData();
};

async function finalizeWeek() {
  msg("commissionerMessage", "Checking completed games...");

  await loadSchedule();

  const completed = games.filter(game => game.completed);

  const { data: pendingPicks, error } = await sb
    .from("picks")
    .select("*")
    .eq("week", settings.current_week)
    .eq("result", "pending");

  if (error) {
    return msg("commissionerMessage", error, true);
  }

  for (const pick of pendingPicks || []) {
    const game = completed.find(item => item.id === pick.game_id);
    if (!game) continue;

    const selectedTeam =
      game.home.abbr === pick.team_abbr ? game.home : game.away;

    await sb.rpc("apply_pick_result", {
      p_pick_id: pick.id,
      p_result: selectedTeam.winner ? "win" : "loss"
    });
  }

  await sb.rpc("commissioner_record_action", {
    p_action: `Week ${settings.current_week} results updated`
  });

  msg(
    "commissionerMessage",
    "Completed results, mulligans, and bench status updated."
  );

  await loadApp({ id: me.id });
}


const removePlayerModalAtBoot = $("removePlayerModal");
if (removePlayerModalAtBoot) {
  removePlayerModalAtBoot.hidden = true;
  removePlayerModalAtBoot.classList.add("hidden");
  removePlayerModalAtBoot.style.setProperty("display", "none", "important");
}

boot();
