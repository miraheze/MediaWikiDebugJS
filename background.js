chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === "complete" && tab.url) {
            chrome.scripting.executeScript({
                target: { tabId },
                files: ["content_script.js"]
            });
        }
    });
});
