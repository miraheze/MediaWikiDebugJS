chrome.runtime.onInstalled.addListener(() => {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		if (changeInfo.status === "complete" && tab.url) {
			chrome.scripting.executeScript({
				target: { tabId },
				function: injectScript,
				args: [{ tabId }]
			});
		}
	});
});

const injectScript = ({ tabId }) => {
	chrome.tabs.get(tabId, (tab) => {
		if (tab && tab.url) {
			chrome.scripting.executeScript({
				target: { tabId },
				function: checkHtmlHead,
				args: [{ tabUrl: tab.url }]
			});
		}
	});
};

const checkHtmlHead = ({ tabUrl }) => {
	chrome.scripting.executeScript({
		target: { tabId: tabId },
		function: injectScript,
		args: [{ tabUrl }]
	});
};
