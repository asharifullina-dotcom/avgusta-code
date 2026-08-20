(function () {
  let merchants = [];
  let paymentMethods = [];
  let leads = [];
  let processing = [];
  let activeTab = "merchants";

  async function apiGet(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} on GET ${path}`);
    return res.json();
  }
  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status} on POST ${path}`);
    return data;
  }

  async function loadAll() {
    [merchants, paymentMethods, leads, processing] = await Promise.all([
      apiGet("/api/merchants"),
      apiGet("/api/payment-methods"),
      apiGet("/api/leads"),
      apiGet("/api/processing"),
    ]);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function confClass(c) {
    return "conf-" + (c || "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "");
  }
  // A merchant's list of sites (back-compat: older records only have `url`).
  function merchantUrls(m) {
    if (m && Array.isArray(m.urls) && m.urls.length) return m.urls;
    if (m && m.url) return [m.url];
    return [];
  }
  const bareHost = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  function allCountriesFromMerchants() {
    const set = new Set();
    merchants.forEach((m) => (m.countries || []).forEach((c) => { if (c) set.add(c); }));
    return Array.from(set).sort();
  }

  // ---------- Header stats + ticker ----------
  function renderStats() {
    const el = document.getElementById("statRow");
    const countries = allCountriesFromMerchants();
    const withData = merchants.filter((m) => (m.countries || []).length > 0).length;
    el.innerHTML = `
      <div class="stat"><div class="n">${merchants.length}</div><div class="l">Merchants</div></div>
      <div class="stat"><div class="n">${withData}</div><div class="l">With countries</div></div>
      <div class="stat"><div class="n">${countries.length}</div><div class="l">Markets covered</div></div>
      <div class="stat"><div class="n">${paymentMethods.length}</div><div class="l">Payment methods</div></div>
    `;
  }
  function renderTicker() {
    const counts = {};
    merchants.forEach((m) => (m.countries || []).forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const el = document.getElementById("ticker");
    if (top.length === 0) { el.style.display = "none"; return; }
    el.style.display = "flex";
    const activeCountry = (document.getElementById("countryFilter") || {}).value || "";
    el.innerHTML = top.map(([name, count], i) => `
      <div class="ticker-item${name === activeCountry ? " active" : ""}" data-country="${escapeHtml(name)}" role="button" tabindex="0" title="${name === activeCountry ? "Clear filter" : "Filter merchants by " + escapeHtml(name)}" style="cursor:pointer;">
        <span class="ticker-rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="ticker-name">${escapeHtml(name)}</span>
        <span class="ticker-count">${count}</span>
      </div>
    `).join("");
    el.querySelectorAll(".ticker-item").forEach((item) => {
      const go = () => filterByCountry(item.dataset.country);
      item.addEventListener("click", go);
      item.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }
  // Clicking a ticker country filters the Merchants tab by it; clicking the
  // one that's already active turns the filter back off (toggle).
  function filterByCountry(country) {
    const sel = document.getElementById("countryFilter");
    populateCountryFilter();
    if (sel.value === country) { sel.value = ""; } // toggle off
    else {
      if (![...sel.options].some((o) => o.value === country)) {
        const opt = document.createElement("option");
        opt.value = country; opt.textContent = country; sel.appendChild(opt);
      }
      sel.value = country;
    }
    if (activeTab !== "merchants") switchTab("merchants");
    else renderMerchantsTab();
    document.getElementById("tab-merchants").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Reset every merchant filter (search + country + confidence).
  function clearMerchantFilters() {
    document.getElementById("merchantSearch").value = "";
    document.getElementById("countryFilter").value = "";
    document.getElementById("confFilter").value = "";
    renderMerchantsTab();
  }
  function renderAllChrome() {
    renderStats();
    renderTicker();
    document.getElementById("tabCountMerchants").textContent = merchants.length;
    document.getElementById("tabCountPayments").textContent = paymentMethods.length;
    document.getElementById("tabCountLeads").textContent = leads.length;
    document.getElementById("tabCountProcessing").textContent = new Set(processing.map((r) => r.site)).size;
  }

  // ---------- Tabs ----------
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    ["merchants", "payments", "match", "leads", "processing"].forEach((t) => {
      document.getElementById("tab-" + t).style.display = t === tab ? "block" : "none";
    });
    if (tab === "merchants") renderMerchantsTab();
    if (tab === "payments") renderPaymentsTab();
    if (tab === "match") renderMatchTab();
    if (tab === "leads") renderLeadsTab();
    if (tab === "processing") renderProcessingTab();
  }

  // ---------- Merchants tab ----------
  function populateCountryFilter() {
    const sel = document.getElementById("countryFilter");
    const current = sel.value;
    const countries = allCountriesFromMerchants();
    sel.innerHTML = '<option value="">All countries</option>' + countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = current;
  }

  function renderMerchantsTab() {
    populateCountryFilter();
    const search = document.getElementById("merchantSearch").value.trim().toLowerCase();
    const countryFilter = document.getElementById("countryFilter").value;
    const confFilterVal = document.getElementById("confFilter").value;

    const clearBtn = document.getElementById("clearFiltersBtn");
    if (clearBtn) clearBtn.style.display = (search || countryFilter || confFilterVal) ? "inline-block" : "none";

    let list = merchants.filter((m) => {
      if (search && !(m.company.toLowerCase().includes(search) || merchantUrls(m).some((u) => u.toLowerCase().includes(search)))) return false;
      if (countryFilter && !(m.countries || []).includes(countryFilter)) return false;
      if (confFilterVal && m.confidence !== confFilterVal) return false;
      return true;
    });

    const tbody = document.getElementById("merchantRows");
    document.getElementById("merchantEmpty").style.display = list.length ? "none" : "block";

    tbody.innerHTML = list.map((m) => {
      const countriesHtml = (m.countries && m.countries.length)
        ? m.countries.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")
        : `<span class="chip empty">${escapeHtml(m.countriesNote || "Insufficient data")}</span>`;
      const sourceTag = m.countriesSource === "similarweb"
        ? `<div class="hint">via Similarweb${m.countriesUpdatedAt ? ", " + new Date(m.countriesUpdatedAt).toLocaleDateString() : ""}</div>` : "";
      const paymentsHtml = (m.paymentMethodsOnSite && m.paymentMethodsOnSite.length)
        ? m.paymentMethodsOnSite.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join("")
        : `<span class="chip empty">${m.paymentMethodsUpdatedAt ? "None found" : "Not checked"}</span>`;
      const paymentsTag = m.paymentMethodsUpdatedAt
        ? `<div class="hint">checked ${new Date(m.paymentMethodsUpdatedAt).toLocaleDateString()}</div>` : "";
      const urls = merchantUrls(m);
      const urlsHtml = urls.length
        ? urls.map((u) => `<div class="url-item">
            <a class="site-link" href="https://${escapeHtml(bareHost(u))}" target="_blank" rel="noopener">${escapeHtml(u)}</a>
            <a href="#" class="remove-site" data-url="${escapeHtml(u)}" title="Remove this site">&times;</a>
          </div>`).join("")
        : `<span class="chip empty">No site</span>`;
      return `<tr data-id="${m.id}">
        <td class="company">${escapeHtml(m.company)}</td>
        <td class="url">${urlsHtml}
          <button class="btn secondary small add-site" style="margin-top:4px;">+ site</button>
        </td>
        <td>${countriesHtml}${sourceTag}
          <button class="btn secondary small refresh-countries" style="margin-top:6px;">&#127760; Similarweb</button>
        </td>
        <td>${paymentsHtml}${paymentsTag}
          <button class="btn secondary small refresh-payments" style="margin-top:6px;">&#128179; Check</button>
        </td>
        <td><span class="conf ${confClass(m.confidence)}">${escapeHtml(m.confidence || "-")}</span></td>
        <td class="notes-cell">${escapeHtml(m.notes || "")}</td>
        <td><button class="btn danger delete-merchant">Delete</button></td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll(".delete-merchant").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        if (!confirm("Remove this merchant from the tracker?")) return;
        merchants = await apiPost("/api/merchants", { action: "delete", id });
        renderAllChrome();
        renderMerchantsTab();
      });
    });
    tbody.querySelectorAll(".add-site").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        const raw = prompt("Add site(s) for this company (comma-separated for several):");
        if (raw == null) return;
        const urls = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        if (!urls.length) return;
        try {
          const resp = await apiPost("/api/merchants", { action: "addSites", id, urls });
          merchants = resp.merchants || merchants;
          renderMerchantsTab();
        } catch (err) { alert("Couldn't add site: " + err.message); }
      });
    });
    tbody.querySelectorAll(".remove-site").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = e.target.closest("tr").dataset.id;
        const url = e.target.dataset.url;
        if (!confirm(`Remove site "${url}" from this company?`)) return;
        try {
          const resp = await apiPost("/api/merchants", { action: "removeSite", id, url });
          merchants = resp.merchants || merchants;
          renderMerchantsTab();
        } catch (err) { alert("Couldn't remove site: " + err.message); }
      });
    });
    tbody.querySelectorAll(".refresh-countries").forEach((btn) => {
      btn.addEventListener("click", (e) => refreshMerchantCountries(e.target.closest("tr").dataset.id, e.target));
    });
    tbody.querySelectorAll(".refresh-payments").forEach((btn) => {
      btn.addEventListener("click", (e) => refreshMerchantPayments(e.target.closest("tr").dataset.id, e.target));
    });

    renderAllChrome();
  }

  function addMerchantFormHtml() {
    return `
      <form class="add-form" id="merchantForm">
        <div><label>Company</label><input type="text" name="company" required placeholder="e.g. Acme Trading Ltd"></div>
        <div><label>URL(s)</label><input type="text" name="url" required placeholder="e.g. example.com, example.net">
          <div class="hint">One or more sites, comma-separated.</div>
        </div>
        <div class="full"><label>Target countries (up to 5, comma-separated)</label>
          <input type="text" name="countries" placeholder="e.g. Brazil, Mexico, Colombia">
          <div class="hint">Only list what you can actually verify &mdash; leave blank if unknown.</div>
        </div>
        <div><label>Confidence</label>
          <select name="confidence">
            <option>High</option><option>Medium-High</option><option selected>Medium</option><option>Low-Medium</option><option>Low</option>
          </select>
        </div>
        <div><label>Notes</label><input type="text" name="notes" placeholder="Basis for this assessment"></div>
        <div class="form-actions">
          <button type="button" class="btn secondary small" id="cancelAddMerchant">Cancel</button>
          <button type="submit" class="btn small">Save merchant</button>
        </div>
      </form>`;
  }
  function wireAddMerchantForm() {
    const wrap = document.getElementById("addMerchantFormWrap");
    wrap.innerHTML = addMerchantFormHtml();
    wrap.style.display = "block";
    document.getElementById("cancelAddMerchant").addEventListener("click", () => { wrap.style.display = "none"; wrap.innerHTML = ""; });
    document.getElementById("merchantForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const countries = (fd.get("countries") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
      const urls = (fd.get("url") || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const merchant = {
        company: (fd.get("company") || "").trim(),
        url: urls,
        countries,
        confidence: fd.get("confidence"),
        notes: (fd.get("notes") || "").trim(),
      };
      if (!merchant.company || !urls.length) return;
      merchants = await apiPost("/api/merchants", { action: "add", merchant });
      wrap.style.display = "none"; wrap.innerHTML = "";
      renderMerchantsTab();
    });
  }

  function wireBulkAddForm() {
    const wrap = document.getElementById("bulkAddWrap");
    wrap.innerHTML = `
      <form class="add-form" id="bulkForm" style="grid-template-columns:1fr;">
        <div class="full"><label>Paste rows &mdash; one merchant per line: <b>Company, URL</b> (comma or tab separated)</label>
          <textarea name="rows" style="min-height:120px;" placeholder="Acme Payments Ltd, acme.com&#10;Globex Trading, globex.com&#10;Globex Trading, globex.io"></textarea>
          <div class="hint">A company can appear on several lines with different URLs &mdash; the sites get merged under one company. Case is ignored; existing merchants and exact duplicates are skipped.</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary small" id="cancelBulkAdd">Cancel</button>
          <button type="submit" class="btn small">Add these</button>
        </div>
      </form>`;
    wrap.style.display = "block";
    document.getElementById("cancelBulkAdd").addEventListener("click", () => { wrap.style.display = "none"; wrap.innerHTML = ""; });
    document.getElementById("bulkForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = new FormData(e.target).get("rows") || "";
      const rows = text.split(/\r?\n/).map((line) => {
        const parts = line.split(/[,\t]/);
        return { company: (parts[0] || "").trim(), url: (parts[1] || "").trim() };
      }).filter((r) => r.company || r.url);
      const valid = rows.filter((r) => r.company && r.url);
      const status = document.getElementById("importStatus");
      if (!valid.length) { status.style.color = "var(--bad)"; status.textContent = "No valid \"Company, URL\" lines found."; return; }
      status.style.color = ""; status.textContent = `Adding ${valid.length} row(s)…`;
      try {
        const resp = await apiPost("/api/merchants", { action: "importMany", merchants: valid });
        merchants = resp.merchants || merchants;
        status.style.color = "var(--good)";
        status.textContent = `Added ${resp.added} new compan${resp.added === 1 ? "y" : "ies"}, attached ${resp.attachedSites} extra site(s), skipped ${resp.skippedDuplicates} duplicate(s)` + (resp.skippedInvalid ? `, ${resp.skippedInvalid} invalid` : "") + ".";
        wrap.style.display = "none"; wrap.innerHTML = "";
        renderMerchantsTab();
      } catch (err) { status.style.color = "var(--bad)"; status.textContent = "Bulk add failed: " + err.message; }
    });
  }

  // ---------- Payment methods tab ----------
  function renderPaymentsTab() {
    const tbody = document.getElementById("paymentRows");
    tbody.innerHTML = paymentMethods.map((p) => {
      const typeClass = "badge-type-" + (p.type || "global").toLowerCase();
      return `<tr data-id="${p.id}">
        <td class="company">${escapeHtml(p.name)}</td>
        <td><span class="type-badge ${typeClass}">${escapeHtml(p.type || "Global")}</span></td>
        <td>${(p.countries || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</td>
        <td class="notes-cell">${escapeHtml(p.notes || "")}</td>
        <td><button class="btn danger delete-payment">Delete</button></td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll(".delete-payment").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        if (!confirm("Remove this payment method?")) return;
        paymentMethods = await apiPost("/api/payment-methods", { action: "delete", id });
        renderPaymentsTab();
        renderAllChrome();
      });
    });
    renderAllChrome();
  }

  function addPaymentFormHtml() {
    return `
      <form class="add-form" id="paymentForm">
        <div><label>Method name</label><input type="text" name="name" required placeholder="e.g. Pix"></div>
        <div><label>Type</label><select name="type"><option>Local</option><option>Regional</option><option>Global</option></select></div>
        <div class="full"><label>Countries / markets (comma-separated)</label><input type="text" name="countries" required placeholder="e.g. Brazil"></div>
        <div class="full"><label>Notes</label><textarea name="notes" placeholder="Why merchants would want this"></textarea></div>
        <div class="form-actions">
          <button type="button" class="btn secondary small" id="cancelAddPayment">Cancel</button>
          <button type="submit" class="btn small">Save payment method</button>
        </div>
      </form>`;
  }
  function wireAddPaymentForm() {
    const wrap = document.getElementById("addPaymentFormWrap");
    wrap.innerHTML = addPaymentFormHtml();
    wrap.style.display = "block";
    document.getElementById("cancelAddPayment").addEventListener("click", () => { wrap.style.display = "none"; wrap.innerHTML = ""; });
    document.getElementById("paymentForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const countries = (fd.get("countries") || "").split(",").map((s) => s.trim()).filter(Boolean);
      const method = { name: (fd.get("name") || "").trim(), type: fd.get("type"), countries, notes: (fd.get("notes") || "").trim() };
      if (!method.name || countries.length === 0) return;
      paymentMethods = await apiPost("/api/payment-methods", { action: "add", method });
      wrap.style.display = "none"; wrap.innerHTML = "";
      renderPaymentsTab();
      populateMatchSelect();
    });
  }

  // ---------- Match tab ----------
  let matchMode = "saved";
  let customCountries = [];

  function populateMatchSelect() {
    const sel = document.getElementById("matchSelect");
    const current = sel.value;
    sel.innerHTML = paymentMethods.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${(p.countries || []).join(", ")})</option>`).join("");
    if (current) sel.value = current;
  }
  function renderCustomChips() {
    const wrap = document.getElementById("customPmChips");
    wrap.innerHTML = customCountries.map((c, i) =>
      `<span class="chip">${escapeHtml(c)} <a href="#" data-i="${i}" class="remove-chip" style="color:var(--bad);text-decoration:none;margin-left:4px;">&times;</a></span>`
    ).join("") || `<span class="hint">No countries added yet.</span>`;
    wrap.querySelectorAll(".remove-chip").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); customCountries.splice(Number(e.target.dataset.i), 1); renderCustomChips(); });
    });
  }
  function commitPendingCountryInput() {
    const input = document.getElementById("customPmCountryInput");
    const val = input.value.trim().replace(/,$/, "");
    if (val && !customCountries.some((c) => c.toLowerCase() === val.toLowerCase())) customCountries.push(val);
    input.value = "";
  }
  function setMatchMode(mode) {
    matchMode = mode;
    document.getElementById("modeSavedBtn").className = mode === "saved" ? "btn small" : "btn secondary small";
    document.getElementById("modeCustomBtn").className = mode === "custom" ? "btn small" : "btn secondary small";
    document.getElementById("savedModePanel").style.display = mode === "saved" ? "block" : "none";
    document.getElementById("customModePanel").style.display = mode === "custom" ? "block" : "none";
    renderMatchTab();
  }
  function currentMatchCriteria() {
    if (matchMode === "saved") {
      const sel = document.getElementById("matchSelect");
      const pm = paymentMethods.find((p) => p.id === sel.value) || paymentMethods[0];
      return pm ? { name: pm.name, countries: pm.countries || [] } : null;
    }
    const name = document.getElementById("customPmName").value.trim();
    if (customCountries.length === 0) return null;
    return { name, countries: customCountries.slice() };
  }
  function renderMatchTab() {
    populateMatchSelect();
    renderCustomChips();
    const showAll = document.getElementById("matchShowAll").checked;
    const intro = document.getElementById("matchIntro");
    const tbody = document.getElementById("matchRows");

    const criteria = currentMatchCriteria();
    if (!criteria) {
      intro.textContent = matchMode === "saved" ? "Add a payment method first." : "Add at least one country, then click \"Find merchants\" (the method name is optional).";
      tbody.innerHTML = "";
      document.getElementById("matchEmpty").style.display = "block";
      return;
    }

    const hasName = !!criteria.name;
    const pmCountries = new Set(criteria.countries.map((c) => c.toLowerCase())); // case-insensitive
    let scored = merchants.map((m) => {
      const overlap = (m.countries || []).filter((c) => pmCountries.has(String(c).toLowerCase()));
      const already = hasName && (m.paymentMethodsOnSite || []).some((p) => p.toLowerCase() === criteria.name.toLowerCase());
      return { m, overlap, already };
    });
    scored.sort((a, b) => b.overlap.length - a.overlap.length);
    if (!showAll) scored = scored.filter((s) => s.overlap.length > 0);

    const critList = criteria.countries.map(escapeHtml).join(", ");
    intro.innerHTML = hasName
      ? `<b>${escapeHtml(criteria.name)}</b> is used in <b>${critList}</b>. Showing merchants targeting at least one of those markets, ranked by overlap.`
      : `Showing merchants targeting at least one of <b>${critList}</b>, ranked by how many of those countries they target.`;

    document.getElementById("matchEmpty").style.display = scored.length ? "none" : "block";

    tbody.innerHTML = scored.map(({ m, overlap, already }) => {
      const chips = (m.countries && m.countries.length)
        ? m.countries.map((c) => (pmCountries.has(String(c).toLowerCase()) ? `<span class="chip hit">${escapeHtml(c)}</span>` : `<span class="chip">${escapeHtml(c)}</span>`)).join("")
        : `<span class="chip empty">Insufficient data</span>`;
      const statusChip = hasName
        ? (already ? `<span class="chip" style="color:var(--text-faint);border-style:dashed;">already offered</span>` : `<span class="chip hit">opportunity</span>`)
        : `<span class="hint">&mdash;</span>`;
      return `<tr>
        <td class="overlap-badge">${overlap.length}</td>
        <td class="company">${escapeHtml(m.company)}</td>
        <td class="url">${escapeHtml(merchantUrls(m).join(", "))}</td>
        <td>${chips}</td>
        <td>${statusChip}</td>
        <td class="notes-cell">${escapeHtml(m.notes || "")}</td>
      </tr>`;
    }).join("");
  }
  async function saveCustomAsPaymentMethod() {
    commitPendingCountryInput();
    renderCustomChips();
    const name = document.getElementById("customPmName").value.trim();
    if (!name || customCountries.length === 0) { alert("Enter a payment method name and at least one country first."); return; }
    const method = { name, type: "Local", countries: customCountries.slice(), notes: "Added via quick match." };
    paymentMethods = await apiPost("/api/payment-methods", { action: "add", method });
    const added = paymentMethods.find((p) => p.name === name) || paymentMethods[paymentMethods.length - 1];
    populateMatchSelect();
    document.getElementById("matchSelect").value = added.id;
    setMatchMode("saved");
  }

  // ---------- Live refresh (calls our own /api which holds the secret key) ----------
  async function refreshMerchantCountries(id, btn) {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    try {
      const updated = await apiPost("/api/refresh-countries", { id });
      merchants = merchants.map((m) => (m.id === id ? updated : m));
      renderMerchantsTab();
      if (activeTab === "match") renderMatchTab();
    } catch (e) {
      alert("Couldn't refresh from Similarweb: " + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  }
  async function refreshMerchantPayments(id, btn) {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    try {
      const updated = await apiPost("/api/check-payments", { id });
      merchants = merchants.map((m) => (m.id === id ? updated : m));
      renderMerchantsTab();
      if (activeTab === "match") renderMatchTab();
    } catch (e) {
      alert("Couldn't check payment methods: " + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  }

  let bulkRefreshCancelled = false;
  async function bulkRefreshCountries() {
    bulkRefreshCancelled = false;
    const targets = merchants.filter((m) => !(m.countries || []).length);
    const status = document.getElementById("bulkStatus");
    const bulkBtn = document.getElementById("bulkRefreshBtn");
    const stopBtn = document.getElementById("bulkStopBtn");
    if (targets.length === 0) { status.textContent = "Nothing to refresh — every merchant already has countries."; return; }
    bulkBtn.disabled = true; stopBtn.style.display = "inline-block";
    for (let i = 0; i < targets.length; i++) {
      if (bulkRefreshCancelled) break;
      const m = targets[i];
      status.textContent = `Refreshing ${i + 1}/${targets.length}: ${m.url}…`;
      try {
        const updated = await apiPost("/api/refresh-countries", { id: m.id });
        merchants = merchants.map((x) => (x.id === m.id ? updated : x));
        renderMerchantsTab();
      } catch (e) { console.error("bulk refresh failed for", m.url, e); }
      await new Promise((r) => setTimeout(r, 400));
    }
    status.textContent = bulkRefreshCancelled ? `Stopped after checking some of ${targets.length} merchants.` : `Done — checked ${targets.length} merchants with Similarweb.`;
    bulkBtn.disabled = false; stopBtn.style.display = "none";
  }

  let bulkPaymentsCancelled = false;
  async function bulkRefreshPayments() {
    bulkPaymentsCancelled = false;
    const targets = merchants.filter((m) => !m.paymentMethodsOnSite || m.paymentMethodsOnSite.length === 0);
    const status = document.getElementById("bulkPaymentsStatus");
    const bulkBtn = document.getElementById("bulkPaymentsBtn");
    const stopBtn = document.getElementById("bulkPaymentsStopBtn");
    if (targets.length === 0) { status.textContent = "Nothing to check — every merchant already has a result."; return; }
    bulkBtn.disabled = true; stopBtn.style.display = "inline-block";
    for (let i = 0; i < targets.length; i++) {
      if (bulkPaymentsCancelled) break;
      const m = targets[i];
      status.textContent = `Checking ${i + 1}/${targets.length}: ${m.url}…`;
      try {
        const updated = await apiPost("/api/check-payments", { id: m.id });
        merchants = merchants.map((x) => (x.id === m.id ? updated : x));
        renderMerchantsTab();
      } catch (e) { console.error("bulk payment check failed for", m.url, e); }
      await new Promise((r) => setTimeout(r, 400));
    }
    status.textContent = bulkPaymentsCancelled ? `Stopped after checking some of ${targets.length} merchants.` : `Done — checked ${targets.length} merchants for payment technologies.`;
    bulkBtn.disabled = false; stopBtn.style.display = "none";
  }

  // ---------- CSV export ----------
  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function exportMerchantsCsv() {
    const header = ["Company", "URL", "Country 1", "Country 2", "Country 3", "Country 4", "Country 5", "Confidence", "Notes", "Countries Source", "Countries Updated At", "Payment Methods On Site", "Payment Methods Updated At"];
    const rows = [header];
    merchants.forEach((m) => {
      const c = m.countries || [];
      rows.push([m.company, merchantUrls(m).join(" | "), c[0] || "", c[1] || "", c[2] || "", c[3] || "", c[4] || "", m.confidence || "", m.notes || "", m.countriesSource || "manual", m.countriesUpdatedAt || "", (m.paymentMethodsOnSite || []).join("; "), m.paymentMethodsUpdatedAt || ""]);
    });
    downloadCsv("merchants_export.csv", rows);
  }
  function exportPaymentsCsv() {
    const header = ["Name", "Type", "Countries", "Notes"];
    const rows = [header];
    paymentMethods.forEach((p) => rows.push([p.name, p.type || "", (p.countries || []).join("; "), p.notes || ""]));
    downloadCsv("payment_methods_export.csv", rows);
  }

  // ---------- Import merchants from CSV / Excel ----------
  // Minimal RFC-4180-ish CSV/TSV parser: handles quoted fields, embedded
  // commas/newlines, and doubled "" escapes. Auto-detects comma vs tab.
  function parseDelimited(text) {
    text = text.replace(/^﻿/, ""); // strip BOM
    const delim = (text.split("\t").length > text.split(",").length) ? "\t" : ",";
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = "";
      } else if (ch === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (ch === "\r") {
        // ignore; \n handles the row break
      } else field += ch;
    }
    row.push(field); rows.push(row);
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  // Lazily load the vendored SheetJS build only when an Excel file is picked.
  let xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/xlsx.mini.min.js";
      s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX failed to initialize"));
      s.onerror = () => reject(new Error("Could not load the Excel parser"));
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }
  async function rowsFromFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
    }
    const text = await file.text();
    return parseDelimited(text);
  }

  // Figure out which column is the company and which is the URL. Recognizes
  // common English + Russian headers; falls back to "first col = company,
  // second col = url" when there is no header row.
  function pickColumns(rows) {
    const first = (rows[0] || []).map((c) => String(c == null ? "" : c).trim().toLowerCase());
    const findCol = (re) => first.findIndex((h) => re.test(h));
    let ci = findCol(/company|merchant|name|компан|назван|бренд/);
    let ui = findCol(/url|site|website|domain|link|сайт|домен|ссылк|адрес/);
    const hasHeader = ci !== -1 || ui !== -1;
    if (ci === -1) ci = 0;
    if (ui === -1) ui = (ci === 0 ? 1 : 0);
    return { ci, ui, dataRows: hasHeader ? rows.slice(1) : rows };
  }

  // For lead imports (URL-only): find the URL column, else use the first column.
  function pickUrlColumn(rows) {
    const first = (rows[0] || []).map((c) => String(c == null ? "" : c).trim().toLowerCase());
    let ui = first.findIndex((h) => /url|site|website|domain|link|сайт|домен|ссылк|адрес/.test(h));
    const hasHeader = ui !== -1;
    if (ui === -1) ui = 0;
    return { ui, dataRows: hasHeader ? rows.slice(1) : rows };
  }
  function normDomain(u) {
    return String(u || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "")
      .replace(/\/.*$/, "").replace(/\/+$/, "");
  }
  function normName(n) {
    return String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  async function handleImportFile(file) {
    const status = document.getElementById("importStatus");
    status.style.color = "";
    status.textContent = `Reading ${file.name}…`;
    let rows;
    try {
      rows = await rowsFromFile(file);
    } catch (e) {
      status.style.color = "var(--bad)";
      status.textContent = "Couldn't read the file: " + e.message + (/xls/i.test(file.name) ? " — try saving it as CSV and uploading that." : "");
      return;
    }
    if (!rows || !rows.length) { status.style.color = "var(--bad)"; status.textContent = "That file looks empty."; return; }

    const { ci, ui, dataRows } = pickColumns(rows);
    const parsed = dataRows
      .map((r) => ({ company: String((r[ci] == null ? "" : r[ci])).trim(), url: String((r[ui] == null ? "" : r[ui])).trim() }))
      .filter((m) => m.company || m.url);

    const valid = parsed.filter((m) => m.company && m.url);
    const invalid = parsed.length - valid.length;

    // Preview, mirroring the server: companies are matched by name (case-
    // insensitive); a new site attaches to an existing company, an exact
    // (name + domain) repeat is skipped.
    const byName = new Map();
    merchants.forEach((m) => byName.set(normName(m.company), new Set(merchantUrls(m).map(normDomain))));
    let newPreview = 0, attachPreview = 0, dupPreview = 0;
    valid.forEach(({ company, url }) => {
      const nn = normName(company), nd = normDomain(url);
      if (byName.has(nn)) {
        const s = byName.get(nn);
        if (s.has(nd)) dupPreview++;
        else { s.add(nd); attachPreview++; }
      } else { byName.set(nn, new Set([nd])); newPreview++; }
    });

    if (newPreview === 0 && attachPreview === 0) {
      status.style.color = "var(--bad)";
      status.textContent = `Nothing new in ${file.name} (${valid.length} rows, all already in the list${invalid ? `; ${invalid} row(s) missing company or URL` : ""}).`;
      return;
    }
    const ok = confirm(
      `Import from "${file.name}":\n\n` +
      `• ${newPreview} new compan${newPreview === 1 ? "y" : "ies"} will be added\n` +
      `• ${attachPreview} extra site(s) will be attached to existing companies\n` +
      `• ${dupPreview} duplicate(s) will be skipped\n` +
      (invalid ? `• ${invalid} row(s) skipped (missing company or URL)\n` : "") +
      `\nProceed?`
    );
    if (!ok) { status.textContent = ""; return; }

    status.style.color = "";
    status.textContent = `Importing…`;
    try {
      const resp = await apiPost("/api/merchants", { action: "importMany", merchants: valid });
      merchants = resp.merchants || merchants;
      status.style.color = "var(--good)";
      status.textContent = `Added ${resp.added} new compan${resp.added === 1 ? "y" : "ies"}, attached ${resp.attachedSites} extra site(s), skipped ${resp.skippedDuplicates} duplicate(s)` +
        (resp.skippedInvalid ? `, ${resp.skippedInvalid} invalid row(s)` : "") + `.`;
      renderMerchantsTab();
    } catch (e) {
      status.style.color = "var(--bad)";
      status.textContent = "Import failed: " + e.message;
    }
  }

  // ---------- Leads tab (prospect sites, URL only) ----------
  function populateLeadCountryFilter() {
    const sel = document.getElementById("leadCountryFilter");
    const cur = sel.value;
    const set = new Set();
    leads.forEach((l) => (l.countries || []).forEach((c) => { if (c) set.add(c); }));
    sel.innerHTML = '<option value="">All countries</option>' +
      Array.from(set).sort().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = cur;
  }
  function clearLeadFilters() {
    document.getElementById("leadSearch").value = "";
    document.getElementById("leadCountryFilter").value = "";
    renderLeadsTab();
  }
  function renderLeadsTab() {
    populateLeadCountryFilter();
    const search = document.getElementById("leadSearch").value.trim().toLowerCase();
    const cf = document.getElementById("leadCountryFilter").value;
    const clearBtn = document.getElementById("leadClearFiltersBtn");
    if (clearBtn) clearBtn.style.display = (search || cf) ? "inline-block" : "none";

    const list = leads.filter((l) => {
      if (search && !String(l.url || "").toLowerCase().includes(search)) return false;
      if (cf && !(l.countries || []).includes(cf)) return false;
      return true;
    });

    const tbody = document.getElementById("leadRows");
    document.getElementById("leadEmpty").style.display = list.length ? "none" : "block";
    tbody.innerHTML = list.map((l) => {
      const countriesHtml = (l.countries && l.countries.length)
        ? l.countries.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")
        : `<span class="chip empty">${escapeHtml(l.countriesNote || "Insufficient data")}</span>`;
      const sourceTag = l.countriesSource === "similarweb"
        ? `<div class="hint">via Similarweb${l.countriesUpdatedAt ? ", " + new Date(l.countriesUpdatedAt).toLocaleDateString() : ""}</div>` : "";
      const paymentsHtml = (l.paymentMethodsOnSite && l.paymentMethodsOnSite.length)
        ? l.paymentMethodsOnSite.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join("")
        : `<span class="chip empty">${l.paymentMethodsUpdatedAt ? "None found" : "Not checked"}</span>`;
      const paymentsTag = l.paymentMethodsUpdatedAt
        ? `<div class="hint">checked ${new Date(l.paymentMethodsUpdatedAt).toLocaleDateString()}</div>` : "";
      return `<tr data-id="${l.id}">
        <td class="url"><a class="site-link" href="https://${escapeHtml(bareHost(l.url))}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escapeHtml(l.url)}</a></td>
        <td>${countriesHtml}${sourceTag}
          <button class="btn secondary small lead-refresh-countries" style="margin-top:6px;">&#127760; Similarweb</button></td>
        <td>${paymentsHtml}${paymentsTag}
          <button class="btn secondary small lead-refresh-payments" style="margin-top:6px;">&#128179; Check</button></td>
        <td><button class="btn danger lead-delete">Delete</button></td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll(".lead-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        if (!confirm("Remove this lead?")) return;
        leads = await apiPost("/api/leads", { action: "delete", id });
        renderLeadsTab(); renderAllChrome();
      });
    });
    tbody.querySelectorAll(".lead-refresh-countries").forEach((btn) => {
      btn.addEventListener("click", (e) => refreshLeadCountries(e.target.closest("tr").dataset.id, e.target));
    });
    tbody.querySelectorAll(".lead-refresh-payments").forEach((btn) => {
      btn.addEventListener("click", (e) => refreshLeadPayments(e.target.closest("tr").dataset.id, e.target));
    });
    renderAllChrome();
  }

  async function refreshLeadCountries(id, btn) {
    const o = btn.textContent; btn.disabled = true; btn.textContent = "…";
    try {
      const u = await apiPost("/api/refresh-countries", { id, collection: "leads" });
      leads = leads.map((x) => (x.id === id ? u : x));
      renderLeadsTab();
    } catch (e) { alert("Couldn't refresh from Similarweb: " + e.message); btn.disabled = false; btn.textContent = o; }
  }
  async function refreshLeadPayments(id, btn) {
    const o = btn.textContent; btn.disabled = true; btn.textContent = "…";
    try {
      const u = await apiPost("/api/check-payments", { id, collection: "leads" });
      leads = leads.map((x) => (x.id === id ? u : x));
      renderLeadsTab();
    } catch (e) { alert("Couldn't check payment methods: " + e.message); btn.disabled = false; btn.textContent = o; }
  }

  let bulkLeadCancelled = false;
  async function bulkLeadRefreshCountries() {
    bulkLeadCancelled = false;
    const targets = leads.filter((l) => !(l.countries || []).length);
    const status = document.getElementById("bulkLeadStatus");
    const b = document.getElementById("bulkLeadRefreshBtn"), s = document.getElementById("bulkLeadStopBtn");
    if (!targets.length) { status.textContent = "Nothing to refresh — every lead already has countries."; return; }
    b.disabled = true; s.style.display = "inline-block";
    for (let i = 0; i < targets.length; i++) {
      if (bulkLeadCancelled) break;
      const l = targets[i];
      status.textContent = `Refreshing ${i + 1}/${targets.length}: ${l.url}…`;
      try { const u = await apiPost("/api/refresh-countries", { id: l.id, collection: "leads" }); leads = leads.map((x) => (x.id === l.id ? u : x)); renderLeadsTab(); }
      catch (e) { console.error("bulk lead refresh failed", l.url, e); }
      await new Promise((r) => setTimeout(r, 400));
    }
    status.textContent = bulkLeadCancelled ? `Stopped after some of ${targets.length}.` : `Done — checked ${targets.length} leads with Similarweb.`;
    b.disabled = false; s.style.display = "none";
  }
  let bulkLeadPayCancelled = false;
  async function bulkLeadRefreshPayments() {
    bulkLeadPayCancelled = false;
    const targets = leads.filter((l) => !l.paymentMethodsOnSite || l.paymentMethodsOnSite.length === 0);
    const status = document.getElementById("bulkLeadPaymentsStatus");
    const b = document.getElementById("bulkLeadPaymentsBtn"), s = document.getElementById("bulkLeadPaymentsStopBtn");
    if (!targets.length) { status.textContent = "Nothing to check — every lead already has a result."; return; }
    b.disabled = true; s.style.display = "inline-block";
    for (let i = 0; i < targets.length; i++) {
      if (bulkLeadPayCancelled) break;
      const l = targets[i];
      status.textContent = `Checking ${i + 1}/${targets.length}: ${l.url}…`;
      try { const u = await apiPost("/api/check-payments", { id: l.id, collection: "leads" }); leads = leads.map((x) => (x.id === l.id ? u : x)); renderLeadsTab(); }
      catch (e) { console.error("bulk lead payment check failed", l.url, e); }
      await new Promise((r) => setTimeout(r, 400));
    }
    status.textContent = bulkLeadPayCancelled ? `Stopped after some of ${targets.length}.` : `Done — checked ${targets.length} leads for payment technologies.`;
    b.disabled = false; s.style.display = "none";
  }

  async function addLeadsFromInput() {
    const input = document.getElementById("leadAddInput");
    const urls = input.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const status = document.getElementById("leadImportStatus");
    if (!urls.length) { status.style.color = "var(--bad)"; status.textContent = "Enter at least one site URL."; return; }
    try {
      const resp = await apiPost("/api/leads", { action: "add", url: urls });
      leads = resp.leads || leads; input.value = "";
      status.style.color = "var(--good)";
      status.textContent = `Added ${resp.added}, skipped ${resp.skippedDuplicates} duplicate(s)` + (resp.skippedInvalid ? `, ${resp.skippedInvalid} invalid` : "") + ".";
      renderLeadsTab();
    } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Add failed: " + e.message; }
  }

  async function handleLeadImportFile(file) {
    const status = document.getElementById("leadImportStatus");
    status.style.color = ""; status.textContent = `Reading ${file.name}…`;
    let rows;
    try { rows = await rowsFromFile(file); }
    catch (e) { status.style.color = "var(--bad)"; status.textContent = "Couldn't read the file: " + e.message + (/xls/i.test(file.name) ? " — try saving it as CSV." : ""); return; }
    if (!rows || !rows.length) { status.style.color = "var(--bad)"; status.textContent = "That file looks empty."; return; }
    const { ui, dataRows } = pickUrlColumn(rows);
    const urls = dataRows.map((r) => String(r[ui] == null ? "" : r[ui]).trim()).filter(Boolean);
    if (!urls.length) { status.style.color = "var(--bad)"; status.textContent = "No site URLs found in that file."; return; }

    const existing = new Set(leads.map((l) => normDomain(l.url)));
    const batch = new Set();
    let nw = 0, dup = 0;
    urls.forEach((u) => { const d = normDomain(u); if (existing.has(d) || batch.has(d)) dup++; else { batch.add(d); nw++; } });
    if (!nw) { status.style.color = "var(--bad)"; status.textContent = `Nothing new in ${file.name} (all ${urls.length} already leads).`; return; }
    if (!confirm(`Import from "${file.name}":\n\n• ${nw} new lead(s) will be added\n• ${dup} duplicate(s) skipped\n\nProceed?`)) { status.textContent = ""; return; }

    status.style.color = ""; status.textContent = "Importing…";
    try {
      const resp = await apiPost("/api/leads", { action: "importMany", urls });
      leads = resp.leads || leads;
      status.style.color = "var(--good)";
      status.textContent = `Added ${resp.added}, skipped ${resp.skippedDuplicates} duplicate(s)` + (resp.skippedInvalid ? `, ${resp.skippedInvalid} invalid` : "") + ".";
      renderLeadsTab();
    } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Import failed: " + e.message; }
  }

  function wireBulkLeadsForm() {
    const wrap = document.getElementById("bulkLeadsWrap");
    wrap.innerHTML = `
      <form class="add-form" id="bulkLeadsForm" style="grid-template-columns:1fr;">
        <div class="full"><label>Paste one site per line</label>
          <textarea name="urls" style="min-height:120px;" placeholder="shop.com&#10;store.io&#10;example.net"></textarea>
          <div class="hint">Duplicates (same domain, case-insensitive) are skipped.</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary small" id="cancelBulkLeads">Cancel</button>
          <button type="submit" class="btn small">Add these</button>
        </div>
      </form>`;
    wrap.style.display = "block";
    document.getElementById("cancelBulkLeads").addEventListener("click", () => { wrap.style.display = "none"; wrap.innerHTML = ""; });
    document.getElementById("bulkLeadsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const urls = (new FormData(e.target).get("urls") || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const status = document.getElementById("leadImportStatus");
      if (!urls.length) { status.style.color = "var(--bad)"; status.textContent = "No URLs entered."; return; }
      status.style.color = ""; status.textContent = `Adding ${urls.length}…`;
      try {
        const resp = await apiPost("/api/leads", { action: "importMany", urls });
        leads = resp.leads || leads;
        status.style.color = "var(--good)";
        status.textContent = `Added ${resp.added}, skipped ${resp.skippedDuplicates} duplicate(s)` + (resp.skippedInvalid ? `, ${resp.skippedInvalid} invalid` : "") + ".";
        wrap.style.display = "none"; wrap.innerHTML = ""; renderLeadsTab();
      } catch (err) { status.style.color = "var(--bad)"; status.textContent = "Bulk add failed: " + err.message; }
    });
  }

  function exportLeadsCsv() {
    const header = ["Site", "Country 1", "Country 2", "Country 3", "Country 4", "Country 5", "Countries Source", "Countries Updated At", "Payment Methods On Site", "Payment Methods Updated At"];
    const rows = [header];
    leads.forEach((l) => {
      const c = l.countries || [];
      rows.push([l.url, c[0] || "", c[1] || "", c[2] || "", c[3] || "", c[4] || "", l.countriesSource || "", l.countriesUpdatedAt || "", (l.paymentMethodsOnSite || []).join("; "), l.paymentMethodsUpdatedAt || ""]);
    });
    downloadCsv("leads_export.csv", rows);
  }

  // ---------- Processing coverage tab ----------
  // ISO 3166-1 alpha-2 -> country name (orders files use codes like CO, UA, DE).
  const COUNTRY_NAMES = {
    AD:"Andorra",AE:"United Arab Emirates",AF:"Afghanistan",AG:"Antigua and Barbuda",AI:"Anguilla",AL:"Albania",AM:"Armenia",AO:"Angola",AR:"Argentina",AT:"Austria",AU:"Australia",AW:"Aruba",AZ:"Azerbaijan",
    BA:"Bosnia and Herzegovina",BB:"Barbados",BD:"Bangladesh",BE:"Belgium",BF:"Burkina Faso",BG:"Bulgaria",BH:"Bahrain",BI:"Burundi",BJ:"Benin",BM:"Bermuda",BN:"Brunei",BO:"Bolivia",BR:"Brazil",BS:"Bahamas",BT:"Bhutan",BW:"Botswana",BY:"Belarus",BZ:"Belize",
    CA:"Canada",CD:"DR Congo",CG:"Congo",CH:"Switzerland",CI:"Côte d'Ivoire",CL:"Chile",CM:"Cameroon",CN:"China",CO:"Colombia",CR:"Costa Rica",CU:"Cuba",CV:"Cabo Verde",CW:"Curaçao",CY:"Cyprus",CZ:"Czechia",
    DE:"Germany",DJ:"Djibouti",DK:"Denmark",DM:"Dominica",DO:"Dominican Republic",DZ:"Algeria",
    EC:"Ecuador",EE:"Estonia",EG:"Egypt",ER:"Eritrea",ES:"Spain",ET:"Ethiopia",
    FI:"Finland",FJ:"Fiji",FO:"Faroe Islands",FR:"France",
    GA:"Gabon",GB:"United Kingdom",GD:"Grenada",GE:"Georgia",GF:"French Guiana",GH:"Ghana",GI:"Gibraltar",GL:"Greenland",GM:"Gambia",GN:"Guinea",GP:"Guadeloupe",GQ:"Equatorial Guinea",GR:"Greece",GT:"Guatemala",GU:"Guam",GW:"Guinea-Bissau",GY:"Guyana",
    HK:"Hong Kong",HN:"Honduras",HR:"Croatia",HT:"Haiti",HU:"Hungary",
    ID:"Indonesia",IE:"Ireland",IL:"Israel",IM:"Isle of Man",IN:"India",IQ:"Iraq",IR:"Iran",IS:"Iceland",IT:"Italy",
    JE:"Jersey",JM:"Jamaica",JO:"Jordan",JP:"Japan",
    KE:"Kenya",KG:"Kyrgyzstan",KH:"Cambodia",KM:"Comoros",KN:"Saint Kitts and Nevis",KP:"North Korea",KR:"South Korea",KW:"Kuwait",KY:"Cayman Islands",KZ:"Kazakhstan",
    LA:"Laos",LB:"Lebanon",LC:"Saint Lucia",LI:"Liechtenstein",LK:"Sri Lanka",LR:"Liberia",LS:"Lesotho",LT:"Lithuania",LU:"Luxembourg",LV:"Latvia",LY:"Libya",
    MA:"Morocco",MC:"Monaco",MD:"Moldova",ME:"Montenegro",MG:"Madagascar",MK:"North Macedonia",ML:"Mali",MM:"Myanmar",MN:"Mongolia",MO:"Macao",MQ:"Martinique",MR:"Mauritania",MT:"Malta",MU:"Mauritius",MV:"Maldives",MW:"Malawi",MX:"Mexico",MY:"Malaysia",MZ:"Mozambique",
    NA:"Namibia",NC:"New Caledonia",NE:"Niger",NG:"Nigeria",NI:"Nicaragua",NL:"Netherlands",NO:"Norway",NP:"Nepal",NZ:"New Zealand",
    OM:"Oman",PA:"Panama",PE:"Peru",PF:"French Polynesia",PG:"Papua New Guinea",PH:"Philippines",PK:"Pakistan",PL:"Poland",PR:"Puerto Rico",PS:"Palestine",PT:"Portugal",PY:"Paraguay",QA:"Qatar",
    RE:"Réunion",RO:"Romania",RS:"Serbia",RU:"Russia",RW:"Rwanda",
    SA:"Saudi Arabia",SB:"Solomon Islands",SC:"Seychelles",SD:"Sudan",SE:"Sweden",SG:"Singapore",SI:"Slovenia",SK:"Slovakia",SL:"Sierra Leone",SM:"San Marino",SN:"Senegal",SO:"Somalia",SR:"Suriname",SS:"South Sudan",SV:"El Salvador",SY:"Syria",SZ:"Eswatini",
    TC:"Turks and Caicos",TD:"Chad",TG:"Togo",TH:"Thailand",TJ:"Tajikistan",TL:"Timor-Leste",TM:"Turkmenistan",TN:"Tunisia",TO:"Tonga",TR:"Turkey",TT:"Trinidad and Tobago",TW:"Taiwan",TZ:"Tanzania",
    UA:"Ukraine",UG:"Uganda",US:"United States",UY:"Uruguay",UZ:"Uzbekistan",
    VA:"Vatican City",VC:"Saint Vincent and the Grenadines",VE:"Venezuela",VG:"British Virgin Islands",VI:"U.S. Virgin Islands",VN:"Vietnam",VU:"Vanuatu",
    WS:"Samoa",XK:"Kosovo",YE:"Yemen",YT:"Mayotte",ZA:"South Africa",ZM:"Zambia",ZW:"Zimbabwe",
  };
  function countryLabel(code) {
    const c = String(code || "").toUpperCase();
    return COUNTRY_NAMES[c] ? `${COUNTRY_NAMES[c]} (${c})` : c;
  }

  const cardOf = (r) => r.cardCountry || r.country || ""; // legacy `country` = card country
  const ipOf = (r) => r.ipCountry || "";
  function countryOptions(sel, values, allLabel) {
    const cur = sel.value;
    const list = Array.from(new Set(values.filter(Boolean))).sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
    sel.innerHTML = `<option value="">${allLabel}</option>` + list.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(countryLabel(c))}</option>`).join("");
    sel.value = cur;
  }
  function populateProcFilters() {
    countryOptions(document.getElementById("procCardCountryFilter"), processing.map(cardOf), "All card countries");
    countryOptions(document.getElementById("procIpCountryFilter"), processing.map(ipOf), "All IP countries");
    const mSel = document.getElementById("procMethodFilter");
    const mCur = mSel.value;
    const methods = Array.from(new Set(processing.map((r) => r.method))).sort();
    mSel.innerHTML = '<option value="">All methods</option>' + methods.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    mSel.value = mCur;
  }
  function clearProcFilters() {
    document.getElementById("procSearch").value = "";
    document.getElementById("procCardCountryFilter").value = "";
    document.getElementById("procIpCountryFilter").value = "";
    document.getElementById("procMethodFilter").value = "";
    renderProcessingTab();
  }
  function renderProcessingStats() {
    const el = document.getElementById("processingStats");
    const sites = new Set(processing.map((r) => r.site));
    const cardCountries = new Set(processing.map(cardOf).filter(Boolean));
    const ipCountries = new Set(processing.map(ipOf).filter(Boolean));
    const orders = processing.reduce((s, r) => s + (r.count || 0), 0);
    el.innerHTML = `
      <div class="stat"><div class="n">${sites.size}</div><div class="l">Sites</div></div>
      <div class="stat"><div class="n">${cardCountries.size}</div><div class="l">Card countries</div></div>
      <div class="stat"><div class="n">${ipCountries.size}</div><div class="l">IP countries</div></div>
      <div class="stat"><div class="n">${orders.toLocaleString()}</div><div class="l">Orders</div></div>`;
  }
  function renderProcessingTab() {
    populateProcFilters();
    renderProcessingStats();
    const search = document.getElementById("procSearch").value.trim().toLowerCase();
    const cardCf = document.getElementById("procCardCountryFilter").value;
    const ipCf = document.getElementById("procIpCountryFilter").value;
    const mf = document.getElementById("procMethodFilter").value;
    const clearBtn = document.getElementById("procClearFiltersBtn");
    if (clearBtn) clearBtn.style.display = (search || cardCf || ipCf || mf) ? "inline-block" : "none";

    const combos = processing.filter((r) => {
      if (cardCf && cardOf(r) !== cardCf) return false;
      if (ipCf && ipOf(r) !== ipCf) return false;
      if (mf && r.method !== mf) return false;
      if (search && !String(r.site).toLowerCase().includes(search)) return false;
      return true;
    });

    // Group filtered combos by site.
    const bySite = new Map();
    combos.forEach((r) => {
      let g = bySite.get(r.site);
      if (!g) { g = { site: r.site, card: new Map(), ip: new Map(), methods: new Map(), orders: 0 }; bySite.set(r.site, g); }
      const n = r.count || 0;
      g.orders += n;
      g.card.set(cardOf(r), (g.card.get(cardOf(r)) || 0) + n);
      if (ipOf(r)) g.ip.set(ipOf(r), (g.ip.get(ipOf(r)) || 0) + n);
      g.methods.set(r.method, (g.methods.get(r.method) || 0) + n);
    });
    const list = Array.from(bySite.values()).sort((a, b) => b.orders - a.orders);

    const intro = document.getElementById("procIntro");
    if (processing.length === 0) intro.textContent = "";
    else {
      const parts = [];
      if (cardCf) parts.push(`card <b>${escapeHtml(countryLabel(cardCf))}</b>`);
      if (ipCf) parts.push(`IP <b>${escapeHtml(countryLabel(ipCf))}</b>`);
      if (mf) parts.push(`method <b>${escapeHtml(mf)}</b>`);
      intro.innerHTML = parts.length ? `${list.length} site(s) — ${parts.join(", ")}.` : `${list.length} site(s) across the uploaded orders.`;
    }

    document.getElementById("procEmpty").style.display = (processing.length === 0) ? "block" : "none";

    const chipsFrom = (map, active) => {
      const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return `<span class="chip empty">&mdash;</span>`;
      return entries.map(([c, n]) => `<span class="chip${active && c === active ? " hit" : ""}">${escapeHtml(countryLabel(c))} &middot; ${n}</span>`).join("");
    };
    const tbody = document.getElementById("procRows");
    tbody.innerHTML = list.map((g) => {
      const methodChips = Array.from(g.methods.entries()).sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `<span class="chip${mf && m === mf ? " hit" : ""}">${escapeHtml(m)} &middot; ${n}</span>`).join("");
      return `<tr>
        <td class="url"><a class="site-link" href="https://${escapeHtml(bareHost(g.site))}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escapeHtml(g.site)}</a></td>
        <td>${chipsFrom(g.card, cardCf)}</td>
        <td>${chipsFrom(g.ip, ipCf)}</td>
        <td>${methodChips}</td>
        <td class="overlap-badge">${g.orders.toLocaleString()}</td>
      </tr>`;
    }).join("");
    renderAllChrome();
  }

  async function handleProcessingImportFile(file) {
    const status = document.getElementById("processingImportStatus");
    status.style.color = ""; status.textContent = `Reading ${file.name}…`;
    let rows;
    try { rows = await rowsFromFile(file); }
    catch (e) { status.style.color = "var(--bad)"; status.textContent = "Couldn't read the file: " + e.message + (/xls/i.test(file.name) ? " — try saving it as CSV." : ""); return; }
    if (!rows || rows.length < 2) { status.style.color = "var(--bad)"; status.textContent = "That file has no data rows."; return; }

    const header = (rows[0] || []).map((c) => String(c == null ? "" : c).trim().toLowerCase());
    const find = (re) => header.findIndex((h) => re.test(h));
    const ipI = find(/ip\s*country|страна\s*ip|ip[-_\s]*страна/);
    let cardI = find(/card\s*country/);
    if (cardI === -1) cardI = header.findIndex((h, i) => i !== ipI && /country|страна/.test(h));
    const si = find(/wallet name|wallet|site|merchant|domain|url|сайт/);
    const mi = find(/payment method|method|метод/);
    const cui = find(/^cur$|currency|валют/);
    if (cardI === -1 || si === -1 || mi === -1) {
      status.style.color = "var(--bad)";
      status.textContent = "Need columns for Card Country, Wallet Name and Payment Method (headers not found).";
      return;
    }

    // Aggregate the (possibly huge) order rows client-side into unique combos.
    const combos = new Map();
    let used = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const site = normDomain(r[si]);
      const cardCountry = String(r[cardI] == null ? "" : r[cardI]).trim().toUpperCase();
      const ipCountry = ipI !== -1 ? String(r[ipI] == null ? "" : r[ipI]).trim().toUpperCase() : "";
      const method = String(r[mi] == null ? "" : r[mi]).trim().toLowerCase();
      const cur = cui !== -1 ? String(r[cui] == null ? "" : r[cui]).trim().toUpperCase() : "";
      if (!site || !cardCountry || !method) continue;
      const key = site + "|" + cardCountry + "|" + ipCountry + "|" + method;
      let c = combos.get(key);
      if (!c) { c = { site, cardCountry, ipCountry, method, currencies: new Set(), count: 0 }; combos.set(key, c); }
      c.count++; if (cur) c.currencies.add(cur); used++;
    }
    if (!combos.size) { status.style.color = "var(--bad)"; status.textContent = "No valid rows found (need site + card country + method)."; return; }

    const payload = Array.from(combos.values()).map((c) => ({ site: c.site, cardCountry: c.cardCountry, ipCountry: c.ipCountry, method: c.method, currencies: Array.from(c.currencies), count: c.count }));
    status.style.color = ""; status.textContent = `Uploading ${used.toLocaleString()} orders (${payload.length} combos)…`;
    try {
      const resp = await apiPost("/api/processing", { action: "import", rows: payload });
      processing = resp.records || processing;
      status.style.color = "var(--good)";
      status.textContent = `Imported ${resp.addedOrders.toLocaleString()} orders — ${resp.newCombos} new site/country/method combos, ${resp.updatedCombos} updated.`;
      renderProcessingTab();
    } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Upload failed: " + e.message; }
  }

  async function clearProcessing() {
    if (!confirm("Delete ALL processing data? This cannot be undone.")) return;
    const status = document.getElementById("processingImportStatus");
    try {
      const resp = await apiPost("/api/processing", { action: "clear" });
      processing = resp.records || [];
      status.style.color = ""; status.textContent = "Processing data cleared.";
      renderProcessingTab();
    } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Clear failed: " + e.message; }
  }

  function exportProcessingCsv() {
    const header = ["Site", "Card Country Code", "Card Country", "IP Country Code", "IP Country", "Payment Method", "Currencies", "Orders"];
    const rows = [header];
    processing.slice().sort((a, b) => (b.count || 0) - (a.count || 0)).forEach((r) => {
      const card = cardOf(r), ip = ipOf(r);
      rows.push([r.site, card, COUNTRY_NAMES[card] || "", ip, COUNTRY_NAMES[ip] || "", r.method, (r.currencies || []).join("; "), r.count || 0]);
    });
    downloadCsv("processing_coverage.csv", rows);
  }

  // ---------- Wiring ----------
  function wireStaticEvents() {
    document.querySelectorAll("nav.tabs button").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    document.getElementById("merchantSearch").addEventListener("input", renderMerchantsTab);
    document.getElementById("countryFilter").addEventListener("change", renderMerchantsTab);
    document.getElementById("confFilter").addEventListener("change", renderMerchantsTab);
    document.getElementById("clearFiltersBtn").addEventListener("click", clearMerchantFilters);
    document.getElementById("exportMerchantsBtn").addEventListener("click", exportMerchantsCsv);
    document.getElementById("importMerchantsBtn").addEventListener("click", () => document.getElementById("importMerchantsFile").click());
    document.getElementById("importMerchantsFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ""; // allow re-picking the same file later
      if (file) handleImportFile(file);
    });
    document.getElementById("exportPaymentsBtn").addEventListener("click", exportPaymentsCsv);
    document.getElementById("toggleAddMerchant").addEventListener("click", () => {
      const wrap = document.getElementById("addMerchantFormWrap");
      if (wrap.style.display === "block") { wrap.style.display = "none"; wrap.innerHTML = ""; } else wireAddMerchantForm();
    });
    document.getElementById("toggleBulkAdd").addEventListener("click", () => {
      const wrap = document.getElementById("bulkAddWrap");
      if (wrap.style.display === "block") { wrap.style.display = "none"; wrap.innerHTML = ""; } else wireBulkAddForm();
    });
    document.getElementById("toggleAddPayment").addEventListener("click", () => {
      const wrap = document.getElementById("addPaymentFormWrap");
      if (wrap.style.display === "block") { wrap.style.display = "none"; wrap.innerHTML = ""; } else wireAddPaymentForm();
    });
    document.getElementById("bulkRefreshBtn").addEventListener("click", bulkRefreshCountries);
    document.getElementById("bulkStopBtn").addEventListener("click", () => { bulkRefreshCancelled = true; });
    document.getElementById("bulkPaymentsBtn").addEventListener("click", bulkRefreshPayments);
    document.getElementById("bulkPaymentsStopBtn").addEventListener("click", () => { bulkPaymentsCancelled = true; });
    document.getElementById("matchSelect").addEventListener("change", renderMatchTab);
    document.getElementById("matchShowAll").addEventListener("change", renderMatchTab);
    document.getElementById("modeSavedBtn").addEventListener("click", () => setMatchMode("saved"));
    document.getElementById("modeCustomBtn").addEventListener("click", () => setMatchMode("custom"));
    document.getElementById("customPmCountryInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitPendingCountryInput(); renderCustomChips(); }
    });
    document.getElementById("customPmFindBtn").addEventListener("click", () => { commitPendingCountryInput(); renderMatchTab(); });
    document.getElementById("customPmSaveBtn").addEventListener("click", saveCustomAsPaymentMethod);
    document.getElementById("leadSearch").addEventListener("input", renderLeadsTab);
    document.getElementById("leadCountryFilter").addEventListener("change", renderLeadsTab);
    document.getElementById("leadClearFiltersBtn").addEventListener("click", clearLeadFilters);
    document.getElementById("exportLeadsBtn").addEventListener("click", exportLeadsCsv);
    document.getElementById("importLeadsBtn").addEventListener("click", () => document.getElementById("importLeadsFile").click());
    document.getElementById("importLeadsFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) handleLeadImportFile(f);
    });
    document.getElementById("toggleBulkLeads").addEventListener("click", () => {
      const w = document.getElementById("bulkLeadsWrap");
      if (w.style.display === "block") { w.style.display = "none"; w.innerHTML = ""; } else wireBulkLeadsForm();
    });
    document.getElementById("leadAddBtn").addEventListener("click", addLeadsFromInput);
    document.getElementById("leadAddInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLeadsFromInput(); } });
    document.getElementById("bulkLeadRefreshBtn").addEventListener("click", bulkLeadRefreshCountries);
    document.getElementById("bulkLeadStopBtn").addEventListener("click", () => { bulkLeadCancelled = true; });
    document.getElementById("bulkLeadPaymentsBtn").addEventListener("click", bulkLeadRefreshPayments);
    document.getElementById("bulkLeadPaymentsStopBtn").addEventListener("click", () => { bulkLeadPayCancelled = true; });
    document.getElementById("procSearch").addEventListener("input", renderProcessingTab);
    document.getElementById("procCardCountryFilter").addEventListener("change", renderProcessingTab);
    document.getElementById("procIpCountryFilter").addEventListener("change", renderProcessingTab);
    document.getElementById("procMethodFilter").addEventListener("change", renderProcessingTab);
    document.getElementById("procClearFiltersBtn").addEventListener("click", clearProcFilters);
    document.getElementById("exportProcessingBtn").addEventListener("click", exportProcessingCsv);
    document.getElementById("importProcessingBtn").addEventListener("click", () => document.getElementById("importProcessingFile").click());
    document.getElementById("importProcessingFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) handleProcessingImportFile(f);
    });
    document.getElementById("clearProcessingBtn").addEventListener("click", clearProcessing);
    document.getElementById("resetLink").addEventListener("click", async (e) => {
      e.preventDefault();
      alert("To reset to seed defaults on this deployment, clear the KV store from the Vercel dashboard (Storage tab) and reload — the server will reseed automatically on the next request.");
    });
  }

  async function init() {
    wireStaticEvents();
    document.getElementById("loading").textContent = "Loading data…";
    try {
      await loadAll();
    } catch (e) {
      document.getElementById("loading").textContent = "Failed to load data: " + e.message;
      return;
    }
    document.getElementById("loading").style.display = "none";
    switchTab("merchants");
  }

  init();
})();
