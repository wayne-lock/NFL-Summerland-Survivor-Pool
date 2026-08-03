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
let currentPick = null;
let pickCountdownTimer = null;

if (!configured) $("setupWarning").classList.remove("hidden");

$("loginTab").onclick = () => switchAuth(true);
$("signupTab").onclick = () => switchAuth(false);
$("logoutBtn").onclick = () => sb.auth.signOut();

function switchAuth(login) {
  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);
  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);
}

function msg(id, text, bad = false) {
  const el = $(id);
  el.textContent = text;
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

$("loginForm").onsubmit = async event => {
  event.preventDefault();
  if (!sb) return;

  msg("authMessage", "Signing in...");

  const { error } = await sb.auth.signInWithPassword({
    email: $("loginEmail").value,
    password: $("loginPassword").value
  });

  if (error) msg("authMessage", error.message, true);
};

$("signupForm").onsubmit = async event => {
  event.preventDefault();
  if (!sb) return;

  msg("authMessage", "Creating entry...");

  const { data, error } = await sb.auth.signUp({
    email: $("signupEmail").value,
    password: $("signupPassword").value,
    options: {
      data: {
        first_name: $("firstName").value.trim(),
        last_name: $("lastName").value.trim(),
        pool_code: $("poolCode").value.trim()
      }
    }
  });

  if (error) return msg("authMessage", error.message, true);

  msg(
    "authMessage",
    data.session ? "Entry created." : "Check your email to confirm your account."
  );
};

async function boot() {
  if (!sb) return;

  sb.auth.onAuthStateChange((_event, session) => {
    session ? loadApp(session.user) : showAuth();
  });

  const { data: { session } } = await sb.auth.getSession();
  session ? await loadApp(session.user) : showAuth();
}

function showAuth() {
  me = null;
  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

async function loadApp(user) {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

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

  if (me.is_admin) setupCommissioner();
}

function renderIdentity() {
  const status = me.eliminated ? "On the Bench" : "Still in the Game";

  $("identity").innerHTML = `
    <div class="identity">
      <div class="avatar">${esc(me.avatar)}</div>
      <div>
        <h2 style="margin:0">${esc(me.nickname)}</h2>
        <div>${esc(me.first_name)} ${esc(me.last_name)}</div>
        <div class="small">
          ${status} &bull; Losses: ${me.losses} &bull;
          Mulligans remaining: ${Math.max(0, 2 - me.losses)}
        </div>
      </div>
    </div>
  `;

  $("currentWeek").textContent = settings.current_week;
}

async function loadSharedData() {
  const requests = [
    sb.from("profiles").select("id,first_name,last_name,nickname,avatar,losses,eliminated,paid,is_admin,created_at").order("created_at"),
    sb.from("picks").select("*").eq("week", settings.current_week)
  ];
  if (me.is_admin) requests.push(sb.from("pool_invites").select("*").order("created_at", { ascending:false }));

  const results = await Promise.all(requests);
  if (results[0].error || results[1].error) {
    msg("pickStatus", "Pool information could not be loaded.", true);
    return;
  }

  allProfiles = results[0].data || [];
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
    .select("id,week,team_abbr,team_name,game_id,game_kickoff,result,created_at,updated_at")
    .eq("user_id", me.id)
    .order("week");

  if (myPicksError) {
    msg("pickStatus", "Your pick history could not be loaded.", true);
    return;
  }

  usedTeams = (myPicks || []).map(item => item.team_abbr);
  currentPick = (myPicks || []).find(item => item.week === settings.current_week) || null;
  renderCurrentPickCard();

  if (me.is_admin) {
    $("commissionerSeason").textContent = settings.season;
    $("commissionerWeek").textContent = settings.current_week;
    $("commissionerPlayers").textContent = allProfiles.length;
    $("commissionerPrize").textContent = `$${prize}`;
    renderCommissionerStatus();
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
          <div class="mini-avatar">${esc(player.avatar)}</div>
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
  $("pickCardDetails").textContent = locked
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
        `Locked at ${lockTime.toLocaleString()} â 15 minutes before kickoff`;
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

    renderGames();

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
    return msg("pickStatus", error.message, true);
  }

  currentPick = data;
  msg(
    "pickStatus",
    `${name} is now your confirmed Week ${settings.current_week} selection.`
  );

  await loadSharedData();
  renderGames();
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
      await loadSharedData();
    }
  };

  $("scoreBtn").onclick = finalizeWeek;
  $("controlResultsBtn").onclick = finalizeWeek;
  $("openPicksBtn").onclick = () => setPicksOpen(true);
  $("lockPicksBtn").onclick = () => setPicksOpen(false);
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
  $("picksStatusBadge").textContent = picksOpen ? "Automatic Locking" : "Emergency Lock Active";
  $("picksStatusBadge").className = `badge ${picksOpen ? "active-b" : "out-b"}`;
  $("openPicksBtn").disabled = picksOpen;
  $("lockPicksBtn").disabled = !picksOpen;
  $("lastActionText").textContent = settings.last_action_text || "No commissioner action recorded yet.";
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

  if (error) return msg("commissionerMessage", error.message, true);

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
  if (error) return msg("commissionerMessage", error.message, true);

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
  if (error) return msg("commissionerMessage", error.message, true);

  $("inviteForm").reset();
  $("inviteForm").classList.add("hidden");
  msg("commissionerMessage", `Invitation prepared for ${firstName}.`);
  await loadSharedData();
}

function renderLockerRoom() {
  $("lockerRoom").innerHTML = allProfiles.length ? allProfiles.map(player => `
    <div class="locker-card">
      <div class="survivor-name">
        <div class="mini-avatar">${esc(player.avatar)}</div>
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
  if (error) return msg("commissionerMessage", error.message, true);
  await loadSharedData();
};

window.toggleBench = async (profileId, eliminated) => {
  const { error } = await sb.rpc("commissioner_update_profile",{p_profile_id:profileId,p_paid:null,p_eliminated:eliminated});
  if (error) return msg("commissionerMessage", error.message, true);
  await loadSharedData();
};

function renderInvitations() {
  $("invitationList").innerHTML = allInvites.length ? allInvites.map(invite => {
    const subject = encodeURIComponent("NFL Summerland Survivor Pool Invitation");
    const body = encodeURIComponent(`Hi ${invite.first_name},\n\nYou are invited to join the NFL Summerland Survivor Pool.\n\nOpen ${window.location.origin}/ and choose Join Pool.\nUse pool code: ${settings.pool_code}\n\nOne Winning Pick. Every Week. Last Survivor Standing.`);
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
  if (error) return msg("commissionerMessage", error.message, true);
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
    return msg("commissionerMessage", error.message, true);
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
