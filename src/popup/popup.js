// Popup script for Flow Chat settings

const defaultSettings = {
  enabled: true,
  speed: 8,
  fontSize: 28,
  opacity: 1.0,
  maxMessages: 50,
  showAuthor: true,
  showAvatar: false,
  lanes: 12,
  minLaneGap: 100
};

let currentSettings = { ...defaultSettings };

// DOM elements
const elements = {
  status: document.getElementById('status'),
  statusText: document.getElementById('status-text'),
  message: document.getElementById('message'),
  enabled: document.getElementById('enabled'),
  speed: document.getElementById('speed'),
  speedValue: document.getElementById('speed-value'),
  fontSize: document.getElementById('fontSize'),
  fontSizeValue: document.getElementById('fontSize-value'),
  opacity: document.getElementById('opacity'),
  opacityValue: document.getElementById('opacity-value'),
  lanes: document.getElementById('lanes'),
  lanesValue: document.getElementById('lanes-value'),
  showAuthor: document.getElementById('showAuthor'),
  showAvatar: document.getElementById('showAvatar'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset')
};

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get('flowChatSettings', (result) => {
    if (result.flowChatSettings) {
      currentSettings = { ...defaultSettings, ...result.flowChatSettings };
    }
    updateUI();
  });
}

// Update UI with current settings
function updateUI() {
  elements.enabled.checked = currentSettings.enabled;
  elements.speed.value = currentSettings.speed;
  elements.speedValue.textContent = `${currentSettings.speed}s`;
  elements.fontSize.value = currentSettings.fontSize;
  elements.fontSizeValue.textContent = `${currentSettings.fontSize}px`;
  elements.opacity.value = currentSettings.opacity;
  elements.opacityValue.textContent = `${Math.round(currentSettings.opacity * 100)}%`;
  elements.lanes.value = currentSettings.lanes;
  elements.lanesValue.textContent = currentSettings.lanes;
  elements.showAuthor.checked = currentSettings.showAuthor;
  elements.showAvatar.checked = currentSettings.showAvatar;
}

// Save settings to storage
function saveSettings() {
  currentSettings = {
    enabled: elements.enabled.checked,
    speed: parseInt(elements.speed.value),
    fontSize: parseInt(elements.fontSize.value),
    opacity: parseFloat(elements.opacity.value),
    maxMessages: currentSettings.maxMessages,
    showAuthor: elements.showAuthor.checked,
    showAvatar: elements.showAvatar.checked,
    lanes: parseInt(elements.lanes.value),
    minLaneGap: currentSettings.minLaneGap
  };

  chrome.storage.sync.set({ flowChatSettings: currentSettings }, () => {
    showMessage('Settings saved!', 'success');

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_UPDATED',
          settings: currentSettings
        }).catch(() => {
          // Tab might not have content script
        });
      }
    });
  });
}

// Reset to default settings
function resetSettings() {
  currentSettings = { ...defaultSettings };
  updateUI();
  saveSettings();
  showMessage('Settings reset to defaults', 'success');
}

// Show message
function showMessage(text, type) {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;

  setTimeout(() => {
    elements.message.className = 'message';
  }, 3000);
}

// Check if current tab is Holodex multiview
function checkCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      if (tabs[0].url.includes('holodex.net/multiview')) {
        elements.status.className = 'status active';
        elements.statusText.textContent = 'Active on Holodex Multiview';
      } else if (tabs[0].url.includes('holodex.net')) {
        elements.status.className = 'status inactive';
        elements.statusText.textContent = 'Go to Multiview to use';
      } else {
        elements.status.className = 'status inactive';
        elements.statusText.textContent = 'Not on Holodex';
      }
    }
  });
}

// Event listeners
elements.speed.addEventListener('input', (e) => {
  elements.speedValue.textContent = `${e.target.value}s`;
});

elements.fontSize.addEventListener('input', (e) => {
  elements.fontSizeValue.textContent = `${e.target.value}px`;
});

elements.opacity.addEventListener('input', (e) => {
  elements.opacityValue.textContent = `${Math.round(e.target.value * 100)}%`;
});

elements.lanes.addEventListener('input', (e) => {
  elements.lanesValue.textContent = e.target.value;
});

elements.save.addEventListener('click', saveSettings);
elements.reset.addEventListener('click', resetSettings);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkCurrentTab();
});
