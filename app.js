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
let pickCountdownTimer = null;
let playerNameCheckTimer = null;
let playerNameAvailable = false;

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

  renderWelcomePage();
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
  $("seasonDisplay").textContent = settings.season;

  renderIdentity();
  await loadSharedData();
  await loadSchedule();

  $("commissionerPanel").classList.toggle("hidden", !me.is_admin);

  if (me.is_admin) {
    setupCommissioner();
  }

  // Every signed-in account sees the premium Welcome Back page first.
  showWelcomePage();
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

  $("welcomeAvatar").innerHTML = characterMarkup(me.avatar, "welcome-character-image");
  $("welcomePlayerName").textContent = me.nickname || "Survivor";
  $("welcomeRealName").textContent =
    `${me.first_name || ""} ${me.last_name || ""}`.trim() || "Ready for game day";
  $("welcomeWins").textContent = wins;
  $("welcomeMulligans").textContent = mulligans;
  $("welcomeLosses").textContent = losses;

  const week = Number(settings.current_week || 1);
  const nextKickoff = getNextAvailableKickoff();
  const locked = isCurrentPickLocked() || settings.picks_open === false;

  if (currentPick && locked) {
    $("welcomeWeekStatus").textContent = `YOUR WEEK ${week} PICK IS LOCKED IN`;
    $("welcomeWeekMessage").textContent = `${currentPick.team_name} selected. Good luck this week!`;
    $("enterPickPageBtn").textContent = "VIEW MY PICK";
  } else if (currentPick) {
    $("welcomeWeekStatus").textContent = `YOUR WEEK ${week} PICK IS READY`;
    $("welcomeWeekMessage").textContent =
      `${currentPick.team_name} selected. You may change it before kickoff.`;
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
    currentPick?.game_kickoff ||
    nextKickoff?.toISOString?.() ||
    games.map(game => game.date).filter(Boolean).sort()[0] ||
    null;
  const deadline = deadlineSource ? getPickLockTime(deadlineSource) : null;

  $("welcomeDeadlineDate").textContent =
    deadline ? formatWelcomeDate(deadline) : "Schedule not available yet";
  $("welcomeDeadlineTime").textContent =
    deadline ? formatWelcomeTime(deadline) : "";
}

function bindWelcomePageControls() {
  $("enterPickPageBtn")?.addEventListener("click", showPickPage);

  $("welcomeHistoryBtn")?.addEventListener("click", () => {
    showPickPage();
    $("currentPickCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

async function loadSharedData() {
  const requests = [
    sb.from("profiles")
      .select("id,first_name,last_name,nickname,avatar,losses,eliminated,paid,is_admin,created_at")
      .order("created_at"),
    sb.from("picks")
      .select("id,user_id,week,team_abbr,team_name,game_id,game_kickoff,result,auto_assigned,created_at,updated_at")
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
    .select("id,week,team_abbr,team_name,game_id,game_kickoff,result,auto_assigned,created_at,updated_at")
    .eq("user_id", me.id)
    .order("week");

  if (myPicksError) {
    msg("pickStatus", "Your pick history could not be loaded.", true);
    return;
  }

  usedTeams = (myPicks || []).map(item => item.team_abbr);
  currentPick = (myPicks || []).find(item => item.week === settings.current_week) || null;
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
        <div class="survivor-name">
          <div class="mini-avatar">${characterMarkup(player.avatar, "mini-character-image")}</div>
          <strong>${esc(player.nickname)}</strong>
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

  $("pickCardWeek").textContent = settings.current_week;

  if (pickCountdownTimer) {
    clearInterval(pickCountdownTimer);
    pickCountdownTimer = null;
  }

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

  $("currentPickCard").classList.toggle("locked", locked);
  $("pickCardBadge").textContent = locked ? "Locked" : "Confirmed";
  $("pickCardBadge").className = `badge ${locked ? "out-b" : "active-b"}`;
  $("pickCardTeam").textContent = currentPick.team_name;
  $("pickCardDetails").textContent = currentPick.auto_assigned
    ? `Emergency auto-pick assigned because no selection was submitted before the weekly safeguard.`
    : locked
      ? `Locked for Week ${settings.current_week}. Good luck!`
      : `Last changed ${new Date(lastChanged).toLocaleString()}. You may change it before the automatic lock.`;

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
  if (!me?.is_admin || !games.length) return;

  const scheduleRows = games.map(game => ({
    season: Number(settings.season),
    week: Number(settings.current_week),
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

async function loadSchedule() {
  msg("pickStatus", `Loading Week ${settings.current_week} NFL matchups...`);

  try {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
      `?seasontype=2&week=${settings.current_week}&dates=${settings.season}`;

    const response = await fetch(url);
    const json = await response.json();

    games = (json.events || []).map(event => {
      const competition = event.competitions[0];
      const home = competition.competitors.find(team => team.homeAway === "home");
      const away = competition.competitors.find(team => team.homeAway === "away");

      return {
        id: event.id,
        date: event.date,
        completed: event.status.type.completed,
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
    renderWelcomePage();

    msg(
      "pickStatus",
      games.length
        ? "Select one unused team to win."
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
      <div class="matchup">
        ${teamCard(game.away, "AWAY TEAM", false, game)}
        <div class="at"><b>AT</b></div>
        ${teamCard(game.home, "HOME TEAM", true, game)}
      </div>
    </div>
  `).join("");
}

function teamCard(team, location, home = false, game) {
  const selected = currentPick?.team_abbr === team.abbr;
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
      `Change your Week ${settings.current_week} pick?\n\n` +
      `Current: ${currentPick.team_name}\n` +
      `New: ${name}`;
  } else {
    confirmation = `Select ${name} to win Week ${settings.current_week}?`;
  }

  if (!confirm(confirmation)) return;

  msg("pickStatus", currentPick ? "Changing your pick..." : "Saving your pick...");

  const { data, error } = await sb.rpc("save_or_change_pick", {
    p_week: settings.current_week,
    p_team_abbr: abbr,
    p_team_name: name,
    p_game_id: gameId,
    p_game_kickoff: gameKickoff
  });

  if (error) {
    return msg("pickStatus", error, true);
  }

  currentPick = data;
  msg(
    "pickStatus",
    `${name} is now your confirmed Week ${settings.current_week} selection.`
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

boot();
