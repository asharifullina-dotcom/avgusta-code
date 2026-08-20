(function () {
  let merchants = [];
  let paymentMethods = [];
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
    [merchants, paymentMethods] = await Promise.all([
      apiGet("/api/merchants"),
      apiGet("/api/payment-methods"),
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
  }

  // ---------- Tabs ----------
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    ["merchants", "payments", "match"].forEach((t) => {
      document.getElementById("tab-" + t).style.display = t === tab ? "block" : "none";
    });
    if (tab === "merchants") renderMerchantsTab();
    if (tab === "payments") renderPaymentsTab();
    if (tab === "match") renderMatchTab();
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
