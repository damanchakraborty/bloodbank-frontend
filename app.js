/*
 * BloodBank frontend
 * Google Sign-In + MIT-WPU email restriction
 * API expects Google ID token in Authorization: Bearer <token>
 */

const API_BASE = "https://bloodbank-api-890543268945.us-east1.run.app";
const GOOGLE_CLIENT_ID = "890543268945-bfmjfbq4mtufgks6s04rok0trll6vid1.apps.googleusercontent.com";
const ALLOWED_DOMAIN = "mitwpu.edu.in";

const $ = (id) => document.getElementById(id);

let idToken = "";
let userEmail = "";
let activePage = "dashboard";

let cache = {
  dashboard: null,
  donors: [],
  units: [],
  inventory: [],
  thresholds: [],
  alerts: []
};

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.style.display = "none";
  }, 3200);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function titleCase(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function setLoginError(message) {
  $("login-error").textContent = message || "";
}

function handleCredentialResponse(response) {
  try {
    const payload = JSON.parse(
      atob(
        response.credential
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      )
    );

    const email = String(payload.email || "").toLowerCase();

    if (
      !payload.email_verified ||
      !email.endsWith("@" + ALLOWED_DOMAIN)
    ) {
      setLoginError(
        "Use a verified MIT-WPU account ending in @" +
        ALLOWED_DOMAIN + "."
      );
      return;
    }

    idToken = response.credential;
    userEmail = email;

    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    $("user-email").textContent = email;

    setLoginError("");
    loadPage("dashboard");

  } catch (e) {
    setLoginError(
      "Could not read the Google sign-in response. Please try again."
    );
  }
}

window.addEventListener("load", () => {
  if (!window.google?.accounts?.id) {
    let tries = 0;

    const wait = setInterval(() => {
      tries++;

      if (window.google?.accounts?.id) {
        clearInterval(wait);
        initializeGoogle();
      } else if (tries >= 40) {
        clearInterval(wait);
        setLoginError(
          "Google sign-in could not load. Check your connection and reload."
        );
      }
    }, 150);

  } else {
    initializeGoogle();
  }
});

function initializeGoogle() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false
  });

  google.accounts.id.renderButton(
    $("google-button"),
    {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      width: 280
    }
  );
}

async function api(path, options = {}) {
  if (!idToken) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const headers = new Headers(options.headers || {});

  headers.set("Authorization", "Bearer " + idToken);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;

  try {
    response = await fetch(API_BASE + path, {
      ...options,
      headers
    });
  } catch (e) {
    throw new Error(
      "Could not reach the API. Check network/CORS configuration and Cloud Run access."
    );
  }

  if (response.status === 401 || response.status === 403) {
    let detail = "";

    try {
      detail = (await response.text()).slice(0, 250);
    } catch {}

    throw new Error(
      `API returned ${response.status}. The service may be private, or the token was rejected. ${detail}`
    );
  }

  const raw = await response.text();

  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

function normalizeList(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function getAny(obj, names, fallback = "—") {
  for (const name of names) {
    if (obj?.[name] !== undefined && obj[name] !== null) {
      return obj[name];
    }
  }

  return fallback;
}

function metricCard(label, value, note, symbol) {
  return `
    <article class="stat-card">
      <div class="stat-top">
        <span>${esc(label)}</span>
        <span class="stat-icon">${symbol}</span>
      </div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-note">${esc(note)}</div>
    </article>
  `;
}

function pageHeading(title, subtitle, action = "") {
  return `
    <div class="page-heading">
      <div>
        <h3>${title}</h3>
        <p>${subtitle}</p>
      </div>
      ${action}
    </div>
  `;
}

function statusTag(status) {
  const s = String(status ?? "unknown")
    .toLowerCase()
    .replaceAll(" ", "_");

  return `<span class="tag ${esc(s)}">${esc(titleCase(s))}</span>`;
}

function table(headers, rows, emptyText = "No records found.") {
  return `
    <div class="table-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows.join("")
                : `<tr><td colspan="${headers.length}">
                    <div class="empty">${esc(emptyText)}</div>
                  </td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDashboard() {
  const d = cache.dashboard || {};
  const donors = cache.donors.length;
  const units = cache.units.length;

  const alerts = cache.alerts.filter(a =>
    !String(getAny(a, ["status", "state"], ""))
      .toLowerCase()
      .includes("acknowledged")
  ).length;

  const inventory = cache.inventory || [];

const bloodGroups = [
  "A-", "A+", "AB-", "AB+",
  "B-", "B+", "O-", "O+"
];

const bloodCounts = Object.fromEntries(
  bloodGroups.map(group => [group, 0])
);

inventory.forEach(item => {
  const type = getAny(
    item,
    ["blood_group", "blood_type", "type"],
    null
  );

  const count = Number(
    getAny(item, ["available_units", "units", "quantity", "total_units", "count"], 0)
  ) || 0;

  if (type && Object.prototype.hasOwnProperty.call(bloodCounts, type)) {
    bloodCounts[type] += count;
  }
});

// The /inventory endpoint doesn't always return usable per-group
// stock (it may be empty or use field names we don't recognize),
// which left this panel stuck at zero even though blood units exist.
// When the inventory response yields nothing, fall back to counting
// blood units directly so the panel reflects real data.
const inventoryTotalFromApi = bloodGroups.reduce(
  (sum, group) => sum + bloodCounts[group],
  0
);

if (inventoryTotalFromApi === 0 && cache.units.length) {
  cache.units.forEach(unit => {
    const status = String(getAny(unit, ["status"], "")).toLowerCase();

    if (status && status !== "available") return;

    const type = getAny(unit, ["blood_group", "blood_type"], null);

    if (type && Object.prototype.hasOwnProperty.call(bloodCounts, type)) {
      bloodCounts[type] += 1;
    }
  });
}

const groups = bloodGroups.map(group => [
  group,
  bloodCounts[group]
]);

const total = groups.reduce((sum, [, count]) => sum + count, 0);

  const cards = `
    <div class="stats-grid">
      ${metricCard(
        "Registered donors",
        getAny(d, ["total_donors", "donor_count"], donors),
        "Donor records",
        "♙"
      )}
      ${metricCard(
        "Blood units",
        getAny(d, ["total_units", "blood_units", "unit_count"], units),
        "Tracked units",
        "▤"
      )}
      ${metricCard(
        "Available inventory",
        getAny(d, ["available_units", "available"], total),
        "Across blood groups",
        "▥"
      )}
      ${metricCard(
        "Open alerts",
        getAny(d, ["active_alerts", "open_alerts"], alerts),
        "Require attention",
        "⚑"
      )}
    </div>
  `;

  const groupPanel = `
    <section class="panel">
      <h3>Inventory by blood group</h3>
      ${
        groups.length
          ? `<div class="blood-grid">
              ${groups.map(([type, n]) => `
                <div class="blood-type">
                  <strong>${esc(type)}</strong>
                  <span>${esc(n)} units</span>
                  <div class="progress">
                    <span style="width:${
                      Math.min(100, (n / 100) * 100)
                    }%;background:#dc2626"></span>
                  </div>
                </div>
              `).join("")}
            </div>`
          : `<div class="empty">Inventory summary will appear when data is available.</div>`
      }
    </section>
  `;

  const recent = cache.alerts.slice(0, 5).map(a => `
    <div class="alert-row">
      <div class="alert-symbol">!</div>
      <div class="alert-body">
        <strong>${esc(getAny(a, ["title", "alert_type", "type"], "Inventory alert"))}</strong>
        <p>${esc(getAny(a, ["message", "description", "details"], "Review inventory status."))}</p>
        <span class="alert-meta">${esc(getAny(a, ["created_at", "date"], ""))}</span>
      </div>
    </div>
  `).join("");

  return `
    ${cards}
    <div class="two-col">
      ${groupPanel}
      <section class="panel">
        <h3>Recent alerts</h3>
        ${recent || `<div class="empty">No alerts to show.</div>`}
        <button class="btn secondary" data-goto="alerts">
          View all alerts →
        </button>
      </section>
    </div>
  `;
}

function renderDonors() {
  const rows = cache.donors.map(d => `
    <tr>
      <td>${esc(getAny(d, ["donor_id", "id"]))}</td>
      <td><b>${esc(getAny(d, ["name", "full_name"]))}</b></td>
      <td>${esc(getAny(d, ["blood_group", "blood_type"]))}</td>
      <td>${esc(getAny(d, ["contact", "phone", "contact_number", "mobile"]))}</td>
      <td>${esc(getAny(d, ["email"]))}</td>
      <td>${esc(getAny(d, ["last_donation_date", "last_donation"], "—"))}</td>
    </tr>
  `);

  return `
    ${pageHeading(
      "Donor directory",
      "Registered donors and their contact details.",
      '<button class="btn" data-action="add-donor">＋ Add donor</button>'
    )}
    <div class="table-tools">
      <input class="field search" id="table-search"
        placeholder="Search donors by name, blood group, phone…">
    </div>
    ${table(
      ["ID", "Donor", "Blood group", "Phone", "Email", "Last donation"],
      rows,
      "No donors have been registered yet."
    )}
  `;
}

function renderUnits() {
  const rows = cache.units.map(u => `
    <tr>
      <td>${esc(getAny(u, ["unit_id", "id"]))}</td>
      <td>${esc(getAny(u, ["blood_group", "blood_type"]))}</td>
      <td>${esc(getAny(u, ["donor_id"]))}</td>
      <td>${esc(getAny(u, ["collection_date", "collected_at"]))}</td>
      <td>${esc(getAny(u, ["expiry_date", "expires_at"]))}</td>
      <td>${statusTag(getAny(u, ["status"], "unknown"))}</td>
      <td>
        <select class="field unit-status" data-id="${esc(getAny(u, ["unit_id", "id"], ""))}">
          <option value="">Change status…</option>
          <option value="Available">Available</option>
          <option value="Used">Used</option>
          <option value="Discarded">Discarded</option>
        </select>
      </td>
    </tr>
  `);

  return `
    ${pageHeading(
      "Blood units",
      "Track collected units, expiry dates, and status.",
      '<button class="btn" data-action="add-unit">＋ Add blood unit</button>'
    )}
    ${table(
      ["Unit ID", "Blood group", "Donor ID", "Collected", "Expires", "Status", "Update"],
      rows,
      "No blood units have been recorded."
    )}
  `;
}

function renderInventory() {
  const rows = cache.inventory.map(i => `
    <tr>
      <td><b>${esc(getAny(i, ["blood_group", "blood_type", "type"]))}</b></td>
      <td>${esc(getAny(i, ["available_units", "units", "quantity", "total_units", "count"], 0))}</td>
      <td>${esc(getAny(i, ["minimum_stock", "threshold", "minimum_threshold", "min_units"], "—"))}</td>
      <td>${statusTag(getAny(i, ["status", "level"], "available"))}</td>
    </tr>
  `);

  return `
    ${pageHeading("Inventory", "Current stock grouped by blood type.")}
    ${table(
      ["Blood group", "Units available", "Minimum threshold", "Status"],
      rows,
      "Inventory data is empty."
    )}
  `;
}

function renderThresholds() {
  const rows = cache.thresholds.map(t => `
    <tr>
      <td><b>${esc(getAny(t, ["blood_group", "blood_type", "type"]))}</b></td>
      <td>${esc(getAny(t, ["minimum_stock", "threshold", "minimum_threshold", "min_units"]))}</td>
      <td>
        <button class="mini-btn"
          data-action="edit-threshold"
          data-type="${esc(getAny(t, ["blood_group", "blood_type", "type"], ""))}"
          data-value="${esc(getAny(t, ["minimum_stock", "threshold", "minimum_threshold", "min_units"], ""))}">
          Edit
        </button>
      </td>
    </tr>
  `);

  return `
    ${pageHeading(
      "Stock thresholds",
      "Set the minimum stock level that triggers an alert."
    )}
    ${table(
      ["Blood group", "Minimum units", ""],
      rows,
      "No threshold settings returned."
    )}
  `;
}

function renderAlerts() {
  const rows = cache.alerts.map(a => `
    <tr>
      <td>
        <b>${esc(getAny(a, ["title", "alert_type", "type"], "Inventory alert"))}</b>
        <div class="alert-meta">
          ${esc(getAny(a, ["message", "description", "details"], ""))}
        </div>
      </td>
      <td>${esc(getAny(a, ["blood_group", "blood_type"], "—"))}</td>
      <td>${esc(getAny(a, ["created_at", "date"], "—"))}</td>
      <td>${statusTag(getAny(a, ["status", "state"], "open"))}</td>
      <td>
        ${
          String(getAny(a, ["status", "state"], ""))
            .toLowerCase()
            .includes("acknowledged")
            ? "—"
            : `<button class="mini-btn"
                data-action="ack-alert"
                data-id="${esc(getAny(a, ["alert_id", "id"], ""))}">
                Acknowledge
              </button>`
        }
      </td>
    </tr>
  `);

  return `
    ${pageHeading("Alerts", "Low-stock and inventory notifications.")}
    ${table(
      ["Alert", "Blood group", "Created", "Status", ""],
      rows,
      "No alerts currently."
    )}
  `;
}

async function fetchAll() {
  const routes = [
    ["dashboard", "/dashboard", d => d],
    ["donors", "/donors", d => normalizeList(d, ["donors", "data", "results"])],
    ["units", "/blood-units", d => normalizeList(d, ["blood_units", "units", "data", "results"])],
    ["inventory", "/inventory", d => normalizeList(d, ["inventory", "data", "results"])],
    ["thresholds", "/thresholds", d => normalizeList(d, ["thresholds", "data", "results"])],
    ["alerts", "/alerts", d => normalizeList(d, ["alerts", "data", "results"])]
  ];

  const outcomes = await Promise.allSettled(
    routes.map(async ([key, path, parse]) => {
      const data = await api(path);
      cache[key] = parse(data);
    })
  );

  const failures = outcomes.filter(x => x.status === "rejected");

  if (failures.length) {
    showNotice(failures.map(x => x.reason.message).join(" · "));
  } else {
    hideNotice();
  }
}

function showNotice(message) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden");
}

function hideNotice() {
  $("notice").classList.add("hidden");
}

async function loadPage(page) {
  activePage = page;

  document.querySelectorAll(".nav-link").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  const titles = {
    dashboard: "Dashboard",
    donors: "Donors",
    "blood-units": "Blood units",
    inventory: "Inventory",
    thresholds: "Thresholds",
    alerts: "Alerts"
  };

  $("page-title").textContent = titles[page] || "Dashboard";
  $("page-content").innerHTML =
    '<div class="panel empty">Loading data…</div>';

  try {
    await fetchAll();
  } catch (e) {
    showNotice(e.message);
  }

  const renderers = {
    dashboard: renderDashboard,
    donors: renderDonors,
    "blood-units": renderUnits,
    inventory: renderInventory,
    thresholds: renderThresholds,
    alerts: renderAlerts
  };

  $("page-content").innerHTML =
    (renderers[page] || renderDashboard)();
}

function field(label, name, placeholder = "", type = "text", required = true) {
  return `
    <div class="form-field">
      <label for="${name}">
        ${label}${required ? " *" : ""}
      </label>
      <input
        class="field"
        id="${name}"
        name="${name}"
        type="${type}"
        placeholder="${placeholder}"
        ${required ? "required" : ""}
      >
    </div>
  `;
}

function selectField(label, name, options) {
  return `
    <div class="form-field">
      <label for="${name}">${label} *</label>
      <select class="field" id="${name}" name="${name}" required>
        <option value="">Choose…</option>
        ${options.map(o =>
          `<option value="${esc(o)}">${esc(o)}</option>`
        ).join("")}
      </select>
    </div>
  `;
}

/*
 * Calculate completed age from YYYY-MM-DD.
 * Returns null for missing or invalid dates.
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const dob = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();

  if (Number.isNaN(dob.getTime()) || dob > today) {
    return null;
  }

  let age = today.getFullYear() - dob.getFullYear();

  const birthdayNotReached =
    today.getMonth() < dob.getMonth() ||
    (
      today.getMonth() === dob.getMonth() &&
      today.getDate() < dob.getDate()
    );

  if (birthdayNotReached) {
    age--;
  }

  return age;
}

function showForm(kind) {
  const donor = kind === "donor";
  const title = donor ? "Register donor" : "Add blood unit";

  const body = donor
    ? field("Full name", "name", "Donor full name") +
      selectField(
        "Blood group",
        "blood_group",
        ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
      ) +
      field("Phone", "contact", "Contact number", "tel") +
      field("Date of birth", "date_of_birth", "", "date") +
      field("Last donation date", "last_donation_date", "", "date", false)
    : field("Donor ID", "donor_id", "Existing donor ID") +
      selectField(
        "Blood group",
        "blood_group",
        ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
      ) +
      field("Collection date", "collection_date", "", "date") +
      field("Expiry date", "expiry_date", "", "date");

  $("page-content").innerHTML = `
    ${pageHeading(title, "Enter the record details below.")}
    <section class="panel form-panel">
      <form id="record-form">
        <div class="form-grid">${body}</div>
        <p class="form-error" id="form-error"></p>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="cancel-form">
            Cancel
          </button>
          <button class="btn" type="submit">Save record</button>
        </div>
      </form>
    </section>
  `;

  $("record-form").addEventListener("submit", async e => {
    e.preventDefault();

    const form = e.currentTarget;
    const payload = Object.fromEntries(
      new FormData(form).entries()
    );

    Object.keys(payload).forEach(key => {
      if (payload[key] === "") delete payload[key];
    });

    if (donor) {
      const age = calculateAge(payload.date_of_birth);

      if (age === null) {
        $("form-error").textContent =
          "Please enter a valid date of birth that is not in the future.";
        return;
      }

      if (age < 18 || age > 100) {
        $("form-error").textContent =
          "Donor age must be between 18 and 100.";
        return;
      }

      payload.age = age;

      // The current backend stores name, age, blood_group and contact.
      // Remove fields that its donor endpoint does not currently accept.
      delete payload.date_of_birth;
      delete payload.last_donation_date;
    }

    try {
      await api(
        donor ? "/donors" : "/blood-units",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      showToast(donor ? "Donor registered" : "Blood unit added");

      await loadPage(donor ? "donors" : "blood-units");

    } catch (err) {
      $("form-error").textContent = err.message;
    }
  });
}

async function updateUnit(select) {
  const id = select.dataset.id;
  const status = select.value;

  if (!id || !status) return;

  try {
    await api(
      `/blood-units/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status })
      }
    );

    showToast("Blood unit status updated");
    await loadPage("blood-units");

  } catch (e) {
    showToast(e.message);
    select.value = "";
  }
}

async function acknowledgeAlert(id) {
  if (!id) return;

  try {
    await api(
      `/alerts/${encodeURIComponent(id)}/acknowledge`,
      {
        method: "PATCH",
        body: JSON.stringify({})
      }
    );

    showToast("Alert acknowledged");
    await loadPage("alerts");

  } catch (e) {
    showToast(e.message);
  }
}

async function editThreshold(bloodGroup, current) {
  const value = prompt(
    `Minimum units for ${bloodGroup}:`,
    current
  );

  if (value === null) return;

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    showToast("Enter a whole number zero or greater.");
    return;
  }

  try {
    await api("/thresholds", {
      method: "PUT",
      body: JSON.stringify({
        blood_group: bloodGroup,
        minimum_stock: number
      })
    });

    showToast("Threshold saved");
    await loadPage("thresholds");

  } catch (e) {
    showToast(e.message);
  }
}

$("navigation").addEventListener("click", e => {
  const button = e.target.closest("[data-page]");

  if (button) {
    loadPage(button.dataset.page);
  }
});

$("page-content").addEventListener("click", e => {
  const button = e.target.closest("[data-action],[data-goto]");

  if (!button) return;

  if (button.dataset.goto) {
    loadPage(button.dataset.goto);
  }

  if (button.dataset.action === "add-donor") {
    showForm("donor");
  }

  if (button.dataset.action === "add-unit") {
    showForm("unit");
  }

  if (button.dataset.action === "cancel-form") {
    loadPage(activePage);
  }

  if (button.dataset.action === "ack-alert") {
    acknowledgeAlert(button.dataset.id);
  }

  if (button.dataset.action === "edit-threshold") {
    editThreshold(
      button.dataset.type,
      button.dataset.value
    );
  }
});

$("page-content").addEventListener("change", e => {
  if (e.target.matches(".unit-status")) {
    updateUnit(e.target);
  }
});

$("page-content").addEventListener("input", e => {
  if (e.target.id !== "table-search") return;

  const q = e.target.value.toLowerCase();

  document.querySelectorAll(".table-panel tbody tr").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

$("refresh-button").addEventListener("click", () => {
  loadPage(activePage);
});

$("logout-button").addEventListener("click", () => {
  idToken = "";
  userEmail = "";

  cache = {
    dashboard: null,
    donors: [],
    units: [],
    inventory: [],
    thresholds: [],
    alerts: []
  };

  $("app-shell").classList.add("hidden");
  $("login-screen").classList.remove("hidden");

  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
});
