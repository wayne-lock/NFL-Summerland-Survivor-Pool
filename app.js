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
  const [{ data: profiles, error: profilesError }, { data: picks, error: picksError }] =
    await Promise.all([
      sb.from("profiles")
        .select("id,nickname,avatar,losses,eliminated,paid,created_at")
        .order("created_at"),
      sb.from("picks")
        .select("*")
        .eq("week", settings.current_week)
    ]);

  if (profilesError || picksError) {
    msg("pickStatus", "Pool information could not be loaded.", true);
    return;
  }

  const all = profiles || [];
  const active = all.filter(player => !player.eliminated);
  const bench = all.filter(player => player.eliminated);
  const entryFee = Number(settings.entry_fee || 20);
  const prize = all.filter(player => player.paid).length * entryFee;

  $("playerCount").textContent = all.length;
  $("activeCount").textContent = active.length;
  $("benchCount").textContent = bench.length;
  $("prizeTotal").textContent = `$${prize}`;

  renderSurvivorList("activeSurvivors", active, false);
  renderSurvivorList("benchSurvivors", bench, true);

  const { data: myPicks } = await sb
    .from("picks")
    .select("team_abbr")
    .eq("user_id", me.id);

  usedTeams = (myPicks || []).map(item => item.team_abbr);

  if (me.is_admin) {
    $("commissionerSeason").textContent = settings.season;
    $("commissionerWeek").textContent = settings.current_week;
    $("commissionerPlayers").textContent = all.length;
    $("commissionerPrize").textContent = `$${prize}`;
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
        ${teamCard(game.away, "AWAY TEAM")}
        <div class="at"><b>AT</b></div>
        ${teamCard(game.home, "HOME TEAM", true)}
      </div>
    </div>
  `).join("");
}

function teamCard(team, location, home = false) {
  const used = usedTeams.includes(team.abbr);
  const disabled = used || me.eliminated;

  return `
    <div class="team ${home ? "home" : ""} ${used ? "used" : ""}">
      <b>${esc(team.name)}</b>
      <div class="where">${location}</div>
      <button
        ${disabled ? "disabled" : ""}
        onclick="makePick('${team.abbr}','${esc(team.name).replace(/'/g, "&#39;")}')">
        ${used ? "Already Used" : `Pick ${esc(team.abbr)}`}
      </button>
    </div>
  `;
}

window.makePick = async (abbr, name) => {
  if (!confirm(`Select ${name} to win Week ${settings.current_week}?`)) return;

  const game = games.find(item =>
    item.home.abbr === abbr || item.away.abbr === abbr
  );

  const { error } = await sb.from("picks").insert({
    user_id: me.id,
    week: settings.current_week,
    team_abbr: abbr,
    team_name: name,
    game_id: game.id,
    result: "pending"
  });

  if (error) {
    return msg(
      "pickStatus",
      error.message.includes("duplicate")
        ? "You already made a pick this week or already used that team."
        : error.message,
      true
    );
  }

  msg("pickStatus", `${name} is your Week ${settings.current_week} selection.`);
  await loadSharedData();
  renderGames();
};

function setupCommissioner() {
  $("adminWeek").innerHTML = Array.from(
    { length: 18 },
    (_, index) => `<option value="${index + 1}">Week ${index + 1}</option>`
  ).join("");

  $("adminWeek").value = settings.current_week;
  $("adminSeason").value = settings.season;

  $("saveSettingsBtn").onclick = async () => {
    const newWeek = Number($("adminWeek").value);
    const newSeason = Number($("adminSeason").value);

    const { error } = await sb
      .from("pool_settings")
      .update({
        current_week: newWeek,
        season: newSeason
      })
      .eq("id", 1);

    msg(
      "commissionerMessage",
      error ? error.message : "Season and current week updated.",
      Boolean(error)
    );

    if (!error) {
      settings.current_week = newWeek;
      settings.season = newSeason;
      await loadApp({ id: me.id });
    }
  };

  $("scoreBtn").onclick = finalizeWeek;
}

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

  msg(
    "commissionerMessage",
    "Completed results, mulligans, and bench status updated."
  );

  await loadApp({ id: me.id });
}

boot();

