(function(){
  "use strict";
  const STORAGE_KEY = "linex_query_log_entries_v1";
  const SP_KEY = "linex_query_log_salesperson";

  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $("dropZone"), fileInput: $("fileInput"), thumb: $("thumb"), ocrStatus: $("ocrStatus"),
    rawText: $("rawText"), extractBtn: $("extractBtn"),
    salesperson: $("salesperson"), customer: $("customer"), commodity: $("commodity"),
    pol: $("pol"), pod: $("pod"), numContainers: $("numContainers"), containerType: $("containerType"),
    remarks: $("remarks"), qnoPreview: $("qnoPreview"), refreshQno: $("refreshQno"),
    saveBtn: $("saveBtn"), clearBtn: $("clearBtn"), saveStatus: $("saveStatus"),
    logBody: $("logBody"), entryCount: $("entryCount"), searchBox: $("searchBox"),
    exportBtn: $("exportBtn"), emptyState: $("emptyState"), todayLabel: $("todayLabel")
  };

  // ---------- date / quotation number ----------
  function pad2(n){ return String(n).padStart(2,"0"); }

  function timestampParts(d){
    return { dd: pad2(d.getDate()), mm: pad2(d.getMonth()+1), HH: pad2(d.getHours()), MI: pad2(d.getMinutes()) };
  }

  function initialsFromName(name){
    const words = (name||"").trim().split(/\s+/).filter(Boolean);
    if(words.length === 0) return "XX";
    if(words.length === 1) return (words[0].slice(0,2)).toUpperCase().padEnd(2,"X");
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  let previewStamp = new Date();
  function buildQuotationNumber(name, d){
    const sp = initialsFromName(name);
    const t = timestampParts(d);
    return "ENQ" + sp + t.dd + t.mm + t.HH + t.MI;
  }

  function updatePreview(){
    els.qnoPreview.textContent = buildQuotationNumber(els.salesperson.value, previewStamp);
  }
  els.refreshQno.addEventListener("click", () => { previewStamp = new Date(); updatePreview(); });
  els.salesperson.addEventListener("input", () => {
    localStorage.setItem(SP_KEY, els.salesperson.value);
    updatePreview();
  });
  setInterval(() => { previewStamp = new Date(); updatePreview(); }, 15000);

  // ---------- header date ----------
  function renderTodayLabel(){
    const d = new Date();
    els.todayLabel.textContent = d.toLocaleDateString(undefined,{weekday:"long", year:"numeric", month:"long", day:"numeric"});
  }
  renderTodayLabel();

  // ---------- restore salesperson ----------
  const savedSp = localStorage.getItem(SP_KEY);
  if(savedSp) els.salesperson.value = savedSp;
  updatePreview();

  // ---------- text extraction (heuristic) ----------
  const FIELD_PATTERNS = [
    { key: "customer", regexes: [/customer\s*(name)?\s*[:\-]\s*(.+)/i] },
    { key: "commodity", regexes: [/commodity\s*[:\-]\s*(.+)/i, /cargo\s*[:\-]\s*(.+)/i, /goods\s*[:\-]\s*(.+)/i] },
    { key: "pol", regexes: [/(?:origin|pol|port of loading|loading port|from)\s*[:\-]\s*(.+)/i] },
    { key: "pod", regexes: [/(?:destination|pod|port of discharge|discharge port|to)\s*[:\-]\s*(.+)/i] },
    { key: "containerType", regexes: [/container\s*type\s*[:\-]\s*(.+)/i] },
  ];

  function extractFields(text){
    const result = {};
    const lines = text.split(/\r?\n/);
    for(const line of lines){
      for(const fp of FIELD_PATTERNS){
        if(result[fp.key]) continue;
        for(const re of fp.regexes){
          const m = line.match(re);
          if(m){ result[fp.key] = (m[2] || m[1]).trim(); break; }
        }
      }
    }
    // containers, e.g. "2 x 40HC", "2x40'HC", "Containers: 3"
    const contMatch = text.match(/(\d+)\s*[x×]\s*([0-9]{2,3}\s?'?\s?(?:HC|GP|RF|OT|FR|ST)?)/i);
    if(contMatch){
      if(!result.numContainers) result.numContainers = contMatch[1];
      if(!result.containerType) result.containerType = contMatch[2].replace(/\s+/g,"").toUpperCase();
    }
    if(!result.numContainers){
      const nc = text.match(/(?:no\.?\s*of\s*containers|containers?)\s*[:\-]\s*(\d+)/i);
      if(nc) result.numContainers = nc[1];
    }
    return result;
  }

  function applyExtracted(fields){
    if(fields.customer) els.customer.value = fields.customer;
    if(fields.commodity) els.commodity.value = fields.commodity;
    if(fields.pol) els.pol.value = fields.pol;
    if(fields.pod) els.pod.value = fields.pod;
    if(fields.numContainers) els.numContainers.value = fields.numContainers;
    if(fields.containerType) els.containerType.value = fields.containerType;
  }

  els.extractBtn.addEventListener("click", () => {
    const text = els.rawText.value.trim();
    if(!text){ setStatus(els.ocrStatus, "Paste some text first.", "err"); return; }
    const fields = extractFields(text);
    applyExtracted(fields);
    setStatus(els.ocrStatus, "Fields auto-filled — please review before saving.", "ok");
  });

  // ---------- image OCR ----------
  function setStatus(el, msg, cls){
    el.textContent = msg;
    el.className = "status" + (cls ? " " + cls : "");
  }

  function handleImageFile(file){
    if(!file) return;
    const url = URL.createObjectURL(file);
    els.thumb.src = url;
    els.thumb.style.display = "block";
    setStatus(els.ocrStatus, "Reading text from image…", "busy");
    Tesseract.recognize(file, "eng")
      .then(({ data: { text } }) => {
        els.rawText.value = text.trim();
        const fields = extractFields(text);
        applyExtracted(fields);
        setStatus(els.ocrStatus, "Text extracted — please review fields before saving.", "ok");
      })
      .catch((err) => {
        console.error(err);
        setStatus(els.ocrStatus, "Could not read the image. Try pasting the text manually.", "err");
      });
  }

  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => handleImageFile(e.target.files[0]));
  els.dropZone.addEventListener("dragover", (e) => { e.preventDefault(); els.dropZone.classList.add("drag"); });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("drag"));
  els.dropZone.addEventListener("drop", (e) => {
    e.preventDefault(); els.dropZone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if(file && file.type.startsWith("image/")) handleImageFile(file);
  });
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const item of items){
      if(item.type.startsWith("image/")){
        handleImageFile(item.getAsFile());
        break;
      }
    }
  });

  // ---------- storage ----------
  function loadEntries(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveEntries(entries){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  let entries = loadEntries();

  function renderTable(filter){
    const f = (filter || "").trim().toLowerCase();
    const rows = entries.filter(e => {
      if(!f) return true;
      return [e.qno, e.customer, e.salesperson, e.commodity, e.pol, e.pod].join(" ").toLowerCase().includes(f);
    });
    els.logBody.innerHTML = "";
    els.entryCount.textContent = entries.length + " entr" + (entries.length===1?"y":"ies");
    els.emptyState.style.display = rows.length ? "none" : "block";
    els.emptyState.textContent = entries.length ? "No entries match your search." : "No entries yet. Fill the form on the left and click \"Save to Log\".";

    for(const e of rows.slice().reverse()){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="qno-cell">${escapeHtml(e.qno)}</td>
        <td>${escapeHtml(e.dateLabel)}</td>
        <td>${escapeHtml(e.salesperson)}</td>
        <td>${escapeHtml(e.customer)}</td>
        <td>${escapeHtml(e.commodity)}</td>
        <td>${escapeHtml(e.pol)}</td>
        <td>${escapeHtml(e.pod)}</td>
        <td>${escapeHtml(e.numContainers)}</td>
        <td>${escapeHtml(e.containerType)}</td>
        <td>${escapeHtml(e.remarks)}</td>
        <td><button class="del-btn" data-id="${e.id}">Delete</button></td>
      `;
      els.logBody.appendChild(tr);
    }
    els.logBody.querySelectorAll(".del-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if(!confirm("Delete this log entry?")) return;
        entries = entries.filter(e => e.id !== btn.dataset.id);
        saveEntries(entries);
        renderTable(els.searchBox.value);
      });
    });
  }

  function escapeHtml(str){
    return String(str || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  els.searchBox.addEventListener("input", () => renderTable(els.searchBox.value));

  // ---------- save ----------
  els.saveBtn.addEventListener("click", () => {
    if(!els.salesperson.value.trim()){
      setStatus(els.saveStatus, "Please enter the salesperson name.", "err");
      els.salesperson.focus();
      return;
    }
    if(!els.customer.value.trim()){
      setStatus(els.saveStatus, "Please enter a customer name.", "err");
      els.customer.focus();
      return;
    }
    const now = new Date();
    const qno = buildQuotationNumber(els.salesperson.value, now);
    const entry = {
      id: qno + "-" + now.getTime(),
      qno,
      dateLabel: now.toLocaleDateString() + " " + now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}),
      isoDate: now.toISOString(),
      salesperson: els.salesperson.value.trim(),
      customer: els.customer.value.trim(),
      commodity: els.commodity.value.trim(),
      pol: els.pol.value.trim(),
      pod: els.pod.value.trim(),
      numContainers: els.numContainers.value.trim(),
      containerType: els.containerType.value.trim(),
      remarks: els.remarks.value.trim()
    };
    entries.push(entry);
    saveEntries(entries);
    renderTable(els.searchBox.value);
    setStatus(els.saveStatus, "Saved as " + qno, "ok");

    // reset per-entry fields, keep salesperson
    els.customer.value = ""; els.commodity.value = ""; els.pol.value = ""; els.pod.value = "";
    els.numContainers.value = ""; els.containerType.value = ""; els.remarks.value = "";
    els.rawText.value = ""; els.thumb.style.display = "none"; setStatus(els.ocrStatus, "", "");
    previewStamp = new Date();
    updatePreview();
  });

  els.clearBtn.addEventListener("click", () => {
    els.customer.value = ""; els.commodity.value = ""; els.pol.value = ""; els.pod.value = "";
    els.numContainers.value = ""; els.containerType.value = ""; els.remarks.value = "";
    els.rawText.value = ""; els.thumb.style.display = "none";
    setStatus(els.ocrStatus, ""); setStatus(els.saveStatus, "");
  });

  // ---------- export ----------
  els.exportBtn.addEventListener("click", () => {
    if(!entries.length){ setStatus(els.saveStatus, "No entries to export yet.", "err"); return; }
    const rows = entries.map(e => ({
      "Quotation No.": e.qno,
      "Date/Time": e.dateLabel,
      "Salesperson": e.salesperson,
      "Customer Name": e.customer,
      "Commodity": e.commodity,
      "Origin/POL": e.pol,
      "Destination/POD": e.pod,
      "No. of Containers": e.numContainers,
      "Container Type": e.containerType,
      "Remarks": e.remarks
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:16},{wch:16},{wch:16},{wch:20},{wch:20},{wch:14},{wch:14},{wch:10},{wch:12},{wch:26}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Query Log");
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Query_Log_${stamp}.xlsx`);
  });

  renderTable("");
})();
