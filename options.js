const defaultText = "confidentiel; privé, restreint\nsecret; interne, non public\nurgent; à traiter";

// Charger le texte au démarrage
chrome.storage.sync.get({ rawWords: defaultText }, (data) => {
  document.getElementById("raw-words").value = data.rawWords;
});

// Sauvegarder le texte
document.getElementById("save").addEventListener("click", () => {
  const text = document.getElementById("raw-words").value;
  chrome.storage.sync.set({ rawWords: text }, () => {
    const status = document.getElementById("status");
    status.textContent = "✅ Liste mise à jour sur tous vos onglets !";
    setTimeout(() => status.textContent = "", 3000);
  });
});
