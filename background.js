chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "UPDATE_BADGE") {
    const count = message.count;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : "",
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#ffc107",
      tabId: sender.tab.id
    });
  }
});
