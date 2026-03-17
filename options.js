const defaultWords = [
  { word: "confidentiel", suggestions: ["privé", "restreint"] },
  { word: "secret", suggestions: ["interne", "non public"] }
];

function renderRows(data) {
  const container = document.getElementById("rows");
  container.innerHTML = "";
  data.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML = `
      <input type="text" class="wa-word" value="${item.word}" placeholder="Mot...">
      <input type="text" class="wa-suggestions" value="${item.suggestions.join(", ")}" placeholder="suggestion1, suggestion2...">
      <button data-index="${i}">✕</button>
    `;
    container.appendChild(row);
    row.querySelector("button").addEventListener("click", () => {
      data.splice(i, 1);
      renderRows(data);
    });
  });
}

chrome.storage.sync.get({ wordsData: defaultWords }, (data) => {
  renderRows(data.wordsData);
});

document.getElementById("add-row").addEventListener("click", () => {
  const rows = document.querySelectorAll(".word-row");
  const current = Array.from(rows).map(r => ({
    word: r.querySelector(".wa-word").value.trim(),
    suggestions: r.querySelector(".wa-suggestions").value.split(",").map(s => s.trim()).filter(Boolean)
  }));
  current.push({ word: "", suggestions: [] });
  renderRows(current);
});

document.getElementById("save").addEventListener("click", () => {
  const rows = document.querySelectorAll(".word-row");
  const wordsData = Array.from(rows).map(r => ({
    word: r.querySelector(".wa-word").value.trim(),
    suggestions: r.querySelector(".wa-suggestions").value.split(",").map(s => s.trim()).filter(Boolean)
  })).filter(item => item.word.length > 0);

  chrome.storage.sync.set({ wordsData }, () => {
    document.getElementById("status").textContent = "✅ Enregistré !";
    setTimeout(() => document.getElementById("status").textContent = "", 2000);
  });
});
