// Background Service Worker for Flow Chat
// Handles extension lifecycle and messaging

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[FlowChat] Extension installed:', details.reason);

  // Set default settings on install
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      flowChatSettings: {
        enabled: true,
        speed: 160,
        fontSize: 28,
        opacity: 1.0,
        maxMessages: 50,
        showAuthor: true,
        showAvatar: false,
        displayArea: 1.0,
        minVerticalGap: 4
      }
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get('flowChatSettings', (result) => {
      sendResponse(result.flowChatSettings || {});
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set({ flowChatSettings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'LOG') {
    console.log('[FlowChat]', message.data);
    sendResponse({ received: true });
  }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('holodex.net/multiview')) {
      console.log('[FlowChat] Holodex multiview detected');
    }
  }
});
