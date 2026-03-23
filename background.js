// Création du bouton dans le menu du clic droit à l'installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "wa-search-replace",
    title: "🔍 Chercher & Remplacer",
    contexts: ["all"]
  });
});

// Écoute du clic sur le menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "wa-search-replace") {
    chrome.tabs.sendMessage(tab.id, { action: "OPEN_SEARCH_REPLACE" });
  }
});

// Écoute pour la mise à jour du badge
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "UPDATE_BADGE") {
    const count = message.count;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : "",
      tabId: sender.tab ? sender.tab.id : undefined
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#ffc107",
      tabId: sender.tab ? sender.tab.id : undefined
    });
  }
});
