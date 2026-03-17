// =============================
// CHARGEMENT DES MOTS
// =============================
function getWords(callback) {
  const defaultWords = [
    { word: "confidentiel", suggestions: ["privé", "restreint"] },
    { word: "secret", suggestions: ["interne", "non public"] }
  ];
  chrome.storage.sync.get({ wordsData: defaultWords }, (data) => {
    callback(data.wordsData);
  });
}

// =============================
// SCAN + COMPTAGE
// =============================
function findMatchingWords(wordsData) {
  const bodyText = document.body.innerText.toLowerCase();
  const results = {};
  wordsData.forEach(({ word }) => {
    const regex = new RegExp(word.toLowerCase(), "g");
    const matches = bodyText.match(regex);
    if (matches) results[word] = matches.length;
  });
  return results;
}

// =============================
// SURLIGNAGE
// =============================
function highlightWords(words) {
  if (!CSS.highlights) return;
  CSS.highlights.delete("wa-highlight");

  const ranges = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest("#wa-host, #wa-sr-host, #wa-history-host, #wa-float-host")) continue;
    words.forEach(word => {
      const regex = new RegExp(word, "gi");
      let match;
      while ((match = regex.exec(node.nodeValue)) !== null) {
        const range = new Range();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
      }
    });
  }
  if (ranges.length > 0) {
    CSS.highlights.set("wa-highlight", new Highlight(...ranges));
  }
}

// =============================
// BADGE
// =============================
function updateBadge(results) {
  const total = Object.values(results).reduce((a, b) => a + b, 0);
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: total });
}

// =============================
// HISTORIQUE
// =============================
const replacementHistory = [];

function addToHistory(word, replacement) {
  replacementHistory.unshift({ word, replacement, time: new Date().toLocaleTimeString() });
  if (replacementHistory.length > 50) replacementHistory.pop();
}

function showHistory() {
  if (document.getElementById("wa-history-host")) return;

  const host = document.createElement("div");
  host.id = "wa-history-host";
  host.style.cssText = "position:fixed;top:50px;left:20px;z-index:2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  function render() {
    shadow.innerHTML = `
      <style>
        #panel {
          background: white; border: 1px solid #ccc;
          border-radius: 8px; padding: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          font-family: sans-serif; font-size: 13px;
          width: 320px; max-height: 400px; overflow-y: auto;
        }
        h3 { margin: 0 0 12px; font-size: 14px; color: #333; display: flex; justify-content: space-between; }
        .entry {
          border-bottom: 1px solid #f0f0f0; padding: 8px 0;
          display: flex; justify-content: space-between; align-items: center;
        }
        .entry:last-child { border-bottom: none; }
        .entry-text { font-size: 12px; color: #444; }
        .entry-text strong { color: #dc3545; }
        .entry-text span { color: #198754; }
        .entry-time { font-size: 11px; color: #aaa; }
        .undo-btn {
          background: #ffc107; border: none; border-radius: 4px;
          padding: 3px 8px; cursor: pointer; font-size: 11px; margin-left: 8px;
        }
        #clear { background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; }
        #close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: #666; }
        .empty { color: #aaa; font-size: 13px; text-align: center; padding: 20px 0; }
      </style>
      <div id="panel">
        <h3>
          🕓 Historique
          <div style="display:flex;gap:8px">
            ${replacementHistory.length > 0 ? '<button id="clear">Effacer</button>' : ""}
            <button id="close-btn">✕</button>
          </div>
        </h3>
        ${replacementHistory.length === 0
          ? '<div class="empty">Aucun remplacement effectué.</div>'
          : replacementHistory.map((h, i) => `
            <div class="entry">
              <div>
                <div class="entry-text"><strong>${h.word}</strong> → <span>${h.replacement}</span></div>
                <div class="entry-time">${h.time}</div>
              </div>
              <button class="undo-btn" data-index="${i}">↩ Annuler</button>
            </div>
          `).join("")
        }
      </div>
    `;

    shadow.getElementById("close-btn").addEventListener("click", () => host.remove());
    const clearBtn = shadow.getElementById("clear");
    if (clearBtn) clearBtn.addEventListener("click", () => { replacementHistory.length = 0; render(); });

    shadow.querySelectorAll(".undo-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.index);
        const h = replacementHistory[i];
        if (!h) return;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.parentElement.closest("#wa-host, #wa-sr-host, #wa-history-host, #wa-float-host")) continue;
          if (node.nodeValue.includes(h.replacement)) {
            node.nodeValue = node.nodeValue.replace(h.replacement, h.word);
            break;
          }
        }
        // Undo dans les inputs aussi
        document.querySelectorAll("input[type='text'], input:not([type]), textarea").forEach(field => {
          if (field.value.includes(h.replacement)) {
            field.value = field.value.replace(h.replacement, h.word);
            field.dispatchEvent(new Event("input"));
          }
        });
        replacementHistory.splice(i, 1);
        render();
      });
    });
  }

  render();
}

// =============================
// MISE À JOUR BANNIÈRE
// =============================
function updateBanner(results, wordsData) {
  const host = document.getElementById("wa-host");
  if (!host) return;
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const span = shadow.querySelector("#banner > div > span");
  if (!span) return;

  if (Object.keys(results).length === 0) {
    host.remove();
    return;
  }

  span.innerHTML = "⚠️ " + Object.entries(results)
    .map(([w, c]) => `<span class="wa-word-btn" data-word="${w}"><strong>${w}</strong> <span class="count">${c}</span></span>`)
    .join(" &nbsp;·&nbsp; ");

  shadow.querySelectorAll(".wa-word-btn").forEach(btn => {
    btn.addEventListener("click", () => showSuggestions(shadow, btn.dataset.word, wordsData));
  });
}

// =============================
// SUGGESTIONS
// =============================
function showSuggestions(shadow, word, wordsData) {
  const entry = wordsData.find(w => w.word.toLowerCase() === word.toLowerCase());
  const suggestionsBox = shadow.getElementById("wa-suggestions");

  if (!entry || entry.suggestions.length === 0) {
    suggestionsBox.style.display = "none";
    return;
  }

  suggestionsBox.style.display = "block";
  suggestionsBox.innerHTML = `💡 Remplacer <strong>${word}</strong> par : ` +
    entry.suggestions.map(s => `<span data-suggestion="${s}">${s}</span>`).join("");

  suggestionsBox.querySelectorAll("span[data-suggestion]").forEach(el => {
    el.addEventListener("click", () => {
      const suggestion = el.dataset.suggestion;
      const active = document.activeElement;

      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
        const start = active.selectionStart;
        const val = active.value;
        const regex = new RegExp(word, "gi");
        const fromCursor = val.slice(start);
        const match = regex.exec(fromCursor);
        if (match) {
          const pos = start + match.index;
          active.value = val.slice(0, pos) + suggestion + val.slice(pos + match[0].length);
          active.setSelectionRange(pos + suggestion.length, pos + suggestion.length);
        } else {
          active.value = val.replace(new RegExp(word, "i"), suggestion);
        }
        active.dispatchEvent(new Event("input"));
      } else if (active && active.isContentEditable) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const container = selection.getRangeAt(0).startContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          const match = new RegExp(word, "gi").exec(container.nodeValue);
          if (match) {
            container.nodeValue = container.nodeValue.slice(0, match.index) + suggestion + container.nodeValue.slice(match.index + match[0].length);
          }
        }
      } else {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.parentElement.closest("#wa-host")) continue;
          if (new RegExp(word, "i").test(node.nodeValue)) {
            node.nodeValue = node.nodeValue.replace(new RegExp(word, "i"), suggestion);
            break;
          }
        }
      }

      addToHistory(word, suggestion);
      suggestionsBox.style.display = "none";
    });
  });
}

// =============================
// BANNIÈRE (Shadow DOM)
// =============================
function showBanner(results, wordsData) {
  if (document.getElementById("wa-host")) return;

  const wordList = Object.entries(results)
    .map(([w, c]) => `<span class="wa-word-btn" data-word="${w}"><strong>${w}</strong> <span class="count">${c}</span></span>`)
    .join(" &nbsp;·&nbsp; ");

  const host = document.createElement("div");
  host.id = "wa-host";
  host.style.cssText = "position:fixed;top:0;left:0;width:100%;z-index:2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      #banner {
        background: #fff3cd; color: #856404;
        border-bottom: 2px solid #ffc107;
        padding: 10px 20px; font-size: 14px;
        display: flex; align-items: flex-start;
        justify-content: space-between;
        font-family: sans-serif; box-sizing: border-box; width: 100%;
      }
      .count { background: #ffc107; color: #333; border-radius: 12px; padding: 2px 8px; font-weight: bold; font-size: 12px; }
      .wa-word-btn { cursor: pointer; text-decoration: underline dotted; }
      .wa-word-btn:hover { opacity: 0.8; }
      .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 12px; }
      #search-replace { background: #0d6efd; color: white; border: none; padding: 4px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; }
      #history-btn { background: #6c757d; color: white; border: none; padding: 4px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; }
      #dismiss { background: #856404; color: white; border: none; padding: 4px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; }
      #close { background: none; border: none; font-size: 18px; cursor: pointer; color: #856404; }
      #wa-suggestions {
        background: white; border: 1px solid #ffc107;
        border-radius: 6px; padding: 8px 12px;
        margin-top: 6px; font-size: 13px; display: none;
      }
      #wa-suggestions span {
        display: inline-block; background: #fff3cd;
        border: 1px solid #ffc107; border-radius: 4px;
        padding: 2px 8px; margin: 2px; cursor: pointer; font-size: 12px;
      }
      #wa-suggestions span:hover { background: #ffc107; }
    </style>
    <div id="banner">
      <div>
        <span>⚠️ ${wordList}</span>
        <div id="wa-suggestions"></div>
      </div>
      <div class="actions">
        <button id="search-replace">🔍 Chercher & Remplacer</button>
        <button id="history-btn">🕓 Historique</button>
        <button id="dismiss">Ne plus afficher</button>
        <button id="close">✕</button>
      </div>
    </div>
  `;

  shadow.querySelectorAll(".wa-word-btn").forEach(btn => {
    btn.addEventListener("click", () => showSuggestions(shadow, btn.dataset.word, wordsData));
  });
  shadow.getElementById("search-replace").addEventListener("click", () => showSearchReplace());
  shadow.getElementById("history-btn").addEventListener("click", () => showHistory());
  shadow.getElementById("close").addEventListener("click", () => host.remove());
  shadow.getElementById("dismiss").addEventListener("click", () => {
    host.remove();
    sessionStorage.setItem("wa-dismissed", "true");
  });
}

// =============================
// CHERCHER & REMPLACER
// =============================
function showSearchReplace() {
  if (document.getElementById("wa-sr-host")) return;

  const host = document.createElement("div");
  host.id = "wa-sr-host";
  host.style.cssText = "position:fixed;top:50px;right:20px;z-index:2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      #panel {
        background: white; border: 1px solid #ccc;
        border-radius: 8px; padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-family: sans-serif; font-size: 13px; width: 300px;
      }
      h3 { margin: 0 0 12px; font-size: 14px; color: #333; }
      label { display: block; margin-bottom: 4px; color: #666; font-size: 12px; }
      input {
        width: 100%; padding: 6px 10px; border: 1px solid #ccc;
        border-radius: 5px; font-size: 13px;
        box-sizing: border-box; margin-bottom: 10px;
      }
      input:focus { outline: none; border-color: #ffc107; }
      .row { display: flex; gap: 8px; margin-bottom: 8px; }
      button { flex: 1; padding: 7px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; }
      #btn-prev, #btn-next { background: #f0f0f0; color: #333; }
      #btn-replace { background: #ffc107; color: #333; font-weight: bold; }
      #btn-replace-all { background: #fd7e14; color: white; font-weight: bold; }
      #btn-close { background: #dc3545; color: white; }
      #status { font-size: 12px; color: #666; min-height: 18px; }
    </style>
    <div id="panel">
      <h3>🔍 Chercher & Remplacer</h3>
      <label>Chercher</label>
      <input id="search-input" type="text" placeholder="Mot à chercher...">
      <label>Remplacer par</label>
      <input id="replace-input" type="text" placeholder="Remplacement...">
      <div class="row">
        <button id="btn-prev">◀ Préc.</button>
        <button id="btn-next">Suiv. ▶</button>
      </div>
      <div class="row">
        <button id="btn-replace">Remplacer</button>
        <button id="btn-replace-all">Tout remplacer</button>
      </div>
      <div id="status"></div>
      <br>
      <button id="btn-close" style="width:100%">Fermer</button>
    </div>
  `;

  let matchNodes = [];
  let currentIndex = -1;

  function collectMatches(searchWord) {
    matchNodes = [];
    CSS.highlights && CSS.highlights.delete("wa-sr-highlight");
    if (!searchWord) return;

    const ranges = [];

    // Scan DOM texte
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest("#wa-host, #wa-sr-host, #wa-history-host, #wa-float-host")) continue;
      const regex = new RegExp(searchWord, "gi");
      let match;
      while ((match = regex.exec(node.nodeValue)) !== null) {
        const range = new Range();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        matchNodes.push({ type: "dom", node, index: match.index, length: match[0].length, range });
        ranges.push(range);
      }
    }

    // Scan inputs et textareas
    document.querySelectorAll("input[type='text'], input:not([type]), textarea").forEach(field => {
      const regex = new RegExp(searchWord, "gi");
      let match;
      while ((match = regex.exec(field.value)) !== null) {
        matchNodes.push({ type: "field", node: field, index: match.index, length: match[0].length });
      }
    });

    if (ranges.length > 0 && CSS.highlights) {
      CSS.highlights.set("wa-sr-highlight", new Highlight(...ranges));
    }
  }

  function updateStatus() {
    const s = shadow.getElementById("status");
    s.textContent = matchNodes.length === 0
      ? "Aucune occurrence trouvée."
      : `${currentIndex + 1} / ${matchNodes.length} occurrence${matchNodes.length > 1 ? "s" : ""}`;
  }

  function scrollToCurrent() {
    const m = matchNodes[currentIndex];
    if (!m) return;
    if (m.type === "dom") {
      m.range.startContainer.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      m.node.scrollIntoView({ behavior: "smooth", block: "center" });
      m.node.focus();
      m.node.setSelectionRange(m.index, m.index + m.length);
    }
  }

  shadow.getElementById("search-input").addEventListener("input", () => {
    const word = shadow.getElementById("search-input").value.trim();
    collectMatches(word);
    currentIndex = matchNodes.length > 0 ? 0 : -1;
    scrollToCurrent();
    updateStatus();
  });

  shadow.getElementById("btn-next").addEventListener("click", () => {
    if (!matchNodes.length) return;
    currentIndex = (currentIndex + 1) % matchNodes.length;
    scrollToCurrent(); updateStatus();
  });

  shadow.getElementById("btn-prev").addEventListener("click", () => {
    if (!matchNodes.length) return;
    currentIndex = (currentIndex - 1 + matchNodes.length) % matchNodes.length;
    scrollToCurrent(); updateStatus();
  });

  shadow.getElementById("btn-replace").addEventListener("click", () => {
    if (currentIndex < 0 || !matchNodes[currentIndex]) return;
    const match = matchNodes[currentIndex];
    const replacement = shadow.getElementById("replace-input").value;
    const word = shadow.getElementById("search-input").value.trim();

    if (match.type === "field") {
      const field = match.node;
      field.value = field.value.slice(0, match.index) + replacement + field.value.slice(match.index + match.length);
      field.dispatchEvent(new Event("input"));
    } else {
      match.node.nodeValue = match.node.nodeValue.slice(0, match.index) + replacement + match.node.nodeValue.slice(match.index + match.length);
    }

    addToHistory(word, replacement);
    collectMatches(word);
    currentIndex = Math.min(currentIndex, matchNodes.length - 1);
    updateStatus();
  });

  shadow.getElementById("btn-replace-all").addEventListener("click", () => {
    const word = shadow.getElementById("search-input").value.trim();
    const replacement = shadow.getElementById("replace-input").value;
    if (!word) return;

    let count = 0;

    // DOM
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement.closest("#wa-host, #wa-sr-host, #wa-history-host, #wa-float-host")) return;
      if (new RegExp(word, "gi").test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(new RegExp(word, "gi"), replacement);
        count++;
      }
    });

    // Inputs et textareas
    document.querySelectorAll("input[type='text'], input:not([type]), textarea").forEach(field => {
      if (new RegExp(word, "gi").test(field.value)) {
        field.value = field.value.replace(new RegExp(word, "gi"), replacement);
        field.dispatchEvent(new Event("input"));
        count++;
      }
    });

    if (count > 0) addToHistory(word, replacement);
    collectMatches(word);
    currentIndex = -1;
    shadow.getElementById("status").textContent = `✅ ${count} remplacement${count > 1 ? "s" : ""} effectué${count > 1 ? "s" : ""}.`;
  });

  shadow.getElementById("btn-close").addEventListener("click", () => {
    CSS.highlights && CSS.highlights.delete("wa-sr-highlight");
    host.remove();
  });
}

// =============================
// ÉCOUTE INPUTS EN TEMPS RÉEL
// =============================
function watchInputs(wordsData) {
  const words = wordsData.map(w => w.word);
  document.querySelectorAll("textarea, input[type='text'], input:not([type])").forEach(field => {
    if (field.dataset.waWatched) return;
    field.dataset.waWatched = "true";
    field.addEventListener("input", () => {
      const r = findMatchingWords(wordsData);
      if (Object.keys(r).length > 0) {
        if (!document.getElementById("wa-host") && sessionStorage.getItem("wa-dismissed") !== "true") {
          showBanner(r, wordsData);
        } else {
          updateBanner(r, wordsData);
        }
        highlightWords(words);
        updateBadge(r);
      } else {
        updateBanner({}, wordsData);
        updateBadge({});
        CSS.highlights && CSS.highlights.delete("wa-highlight");
      }
    });
  });
}

// =============================
// BOUTON FLOTTANT
// =============================
function showFloatingButton() {
  if (document.getElementById("wa-float-host")) return;

  const host = document.createElement("div");
  host.id = "wa-float-host";
  host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      #btn {
        background: #0d6efd; color: white;
        border: none; border-radius: 50px;
        padding: 10px 16px; cursor: pointer;
        font-size: 13px; font-family: sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        display: flex; align-items: center; gap: 6px;
      }
      #btn:hover { background: #0b5ed7; }
    </style>
    <button id="btn">🔍 Chercher & Remplacer</button>
  `;

  shadow.getElementById("btn").addEventListener("click", () => showSearchReplace());
}

// =============================
// SYNC MULTI-ONGLETS
// =============================
function watchStorageChanges() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.wordsData) {
      const newWordsData = changes.wordsData.newValue;
      const newWords = newWordsData.map(w => w.word);
      const host = document.getElementById("wa-host");
      if (host) host.remove();
      CSS.highlights && CSS.highlights.delete("wa-highlight");
      const results = findMatchingWords(newWordsData);
      if (Object.keys(results).length > 0 && sessionStorage.getItem("wa-dismissed") !== "true") {
        showBanner(results, newWordsData);
        highlightWords(newWords);
        updateBadge(results);
      }
    }
  });
}

// =============================
// INIT
// =============================
let debounceTimer;

window.addEventListener("load", () => {
  getWords(wordsData => {
    const words = wordsData.map(w => w.word);

    const results = findMatchingWords(wordsData);
    if (Object.keys(results).length > 0 && sessionStorage.getItem("wa-dismissed") !== "true") {
      showBanner(results, wordsData);
      highlightWords(words);
      updateBadge(results);
    }

    showFloatingButton();
    watchInputs(wordsData);
    watchStorageChanges();

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const r = findMatchingWords(wordsData);
        if (Object.keys(r).length > 0) {
          if (!document.getElementById("wa-host") && sessionStorage.getItem("wa-dismissed") !== "true") {
            showBanner(r, wordsData);
          } else {
            updateBanner(r, wordsData);
          }
          highlightWords(words);
          updateBadge(r);
        } else {
          updateBanner({}, wordsData);
          updateBadge({});
        }
        watchInputs(wordsData);
      }, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
});
