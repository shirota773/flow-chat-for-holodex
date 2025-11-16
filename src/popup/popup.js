// Popup script for Flow Chat settings

const defaultSettings = {
  enabled: true,
  displayTime: 8,
  fontSize: 28,
  opacity: 1.0,
  maxMessages: 50,
  displayArea: 1.0,
  minVerticalGap: 4,
  showOwner: true,
  showModerator: true,
  showMember: true,
  showNormal: true,
  avatarOwner: true,
  avatarModerator: false,
  avatarMember: false,
  avatarNormal: false,
  colorOwner: { r: 255, g: 215, b: 0 },      // Gold
  colorModerator: { r: 94, g: 132, b: 241 },  // Blue
  colorMember: { r: 46, g: 204, b: 113 },     // Green
  colorNormal: { r: 255, g: 255, b: 255 }     // White
};

let currentSettings = { ...defaultSettings };
let currentColorType = null;

// DOM elements
const elements = {
  status: document.getElementById('status'),
  statusText: document.getElementById('status-text'),
  message: document.getElementById('message'),
  enabled: document.getElementById('enabled'),
  displayTime: document.getElementById('displayTime'),
  displayTimeValue: document.getElementById('displayTime-value'),
  fontSize: document.getElementById('fontSize'),
  fontSizeValue: document.getElementById('fontSize-value'),
  opacity: document.getElementById('opacity'),
  opacityValue: document.getElementById('opacity-value'),
  displayArea: document.getElementById('displayArea'),
  displayAreaValue: document.getElementById('displayArea-value'),
  showOwner: document.getElementById('showOwner'),
  showModerator: document.getElementById('showModerator'),
  showMember: document.getElementById('showMember'),
  showNormal: document.getElementById('showNormal'),
  avatarOwner: document.getElementById('avatarOwner'),
  avatarModerator: document.getElementById('avatarModerator'),
  avatarMember: document.getElementById('avatarMember'),
  avatarNormal: document.getElementById('avatarNormal'),
  colorOwner: document.getElementById('colorOwner'),
  colorModerator: document.getElementById('colorModerator'),
  colorMember: document.getElementById('colorMember'),
  colorNormal: document.getElementById('colorNormal'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
  // Color modal elements
  colorModal: document.getElementById('colorModal'),
  colorModalTitle: document.getElementById('colorModalTitle'),
  colorModalClose: document.getElementById('colorModalClose'),
  colorPreview: document.getElementById('colorPreview'),
  redSlider: document.getElementById('redSlider'),
  greenSlider: document.getElementById('greenSlider'),
  blueSlider: document.getElementById('blueSlider'),
  redValue: document.getElementById('redValue'),
  greenValue: document.getElementById('greenValue'),
  blueValue: document.getElementById('blueValue'),
  colorApply: document.getElementById('colorApply'),
  colorCancel: document.getElementById('colorCancel')
};

// Helper to convert RGB object to CSS color string
function rgbToString(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

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
  elements.displayTime.value = currentSettings.displayTime;
  elements.displayTimeValue.textContent = `${currentSettings.displayTime}s`;
  elements.fontSize.value = currentSettings.fontSize;
  elements.fontSizeValue.textContent = `${currentSettings.fontSize}px`;
  elements.opacity.value = currentSettings.opacity;
  elements.opacityValue.textContent = `${Math.round(currentSettings.opacity * 100)}%`;
  elements.displayArea.value = currentSettings.displayArea;
  elements.displayAreaValue.textContent = `${Math.round(currentSettings.displayArea * 100)}%`;
  elements.showOwner.checked = currentSettings.showOwner;
  elements.showModerator.checked = currentSettings.showModerator;
  elements.showMember.checked = currentSettings.showMember;
  elements.showNormal.checked = currentSettings.showNormal;
  elements.avatarOwner.checked = currentSettings.avatarOwner;
  elements.avatarModerator.checked = currentSettings.avatarModerator;
  elements.avatarMember.checked = currentSettings.avatarMember;
  elements.avatarNormal.checked = currentSettings.avatarNormal;

  // Update color swatches
  elements.colorOwner.style.backgroundColor = rgbToString(currentSettings.colorOwner);
  elements.colorModerator.style.backgroundColor = rgbToString(currentSettings.colorModerator);
  elements.colorMember.style.backgroundColor = rgbToString(currentSettings.colorMember);
  elements.colorNormal.style.backgroundColor = rgbToString(currentSettings.colorNormal);
}

// Save settings to storage
function saveSettings() {
  currentSettings = {
    enabled: elements.enabled.checked,
    displayTime: parseInt(elements.displayTime.value),
    fontSize: parseInt(elements.fontSize.value),
    opacity: parseFloat(elements.opacity.value),
    maxMessages: currentSettings.maxMessages,
    displayArea: parseFloat(elements.displayArea.value),
    minVerticalGap: currentSettings.minVerticalGap,
    showOwner: elements.showOwner.checked,
    showModerator: elements.showModerator.checked,
    showMember: elements.showMember.checked,
    showNormal: elements.showNormal.checked,
    avatarOwner: elements.avatarOwner.checked,
    avatarModerator: elements.avatarModerator.checked,
    avatarMember: elements.avatarMember.checked,
    avatarNormal: elements.avatarNormal.checked,
    colorOwner: currentSettings.colorOwner,
    colorModerator: currentSettings.colorModerator,
    colorMember: currentSettings.colorMember,
    colorNormal: currentSettings.colorNormal
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

// Color picker modal functions
function openColorPicker(type) {
  currentColorType = type;
  const colorKey = `color${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const color = currentSettings[colorKey];

  elements.colorModalTitle.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Color`;
  elements.redSlider.value = color.r;
  elements.greenSlider.value = color.g;
  elements.blueSlider.value = color.b;
  updateColorPreview();

  elements.colorModal.classList.add('active');
}

function closeColorPicker() {
  elements.colorModal.classList.remove('active');
  currentColorType = null;
}

function updateColorPreview() {
  const r = parseInt(elements.redSlider.value);
  const g = parseInt(elements.greenSlider.value);
  const b = parseInt(elements.blueSlider.value);

  elements.redValue.textContent = r;
  elements.greenValue.textContent = g;
  elements.blueValue.textContent = b;

  elements.colorPreview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function applyColor() {
  if (!currentColorType) return;

  const colorKey = `color${currentColorType.charAt(0).toUpperCase() + currentColorType.slice(1)}`;
  currentSettings[colorKey] = {
    r: parseInt(elements.redSlider.value),
    g: parseInt(elements.greenSlider.value),
    b: parseInt(elements.blueSlider.value)
  };

  // Update swatch
  const swatchId = `color${currentColorType.charAt(0).toUpperCase() + currentColorType.slice(1)}`;
  elements[swatchId].style.backgroundColor = rgbToString(currentSettings[colorKey]);

  closeColorPicker();
}

// Event listeners
elements.displayTime.addEventListener('input', (e) => {
  elements.displayTimeValue.textContent = `${e.target.value}s`;
});

elements.fontSize.addEventListener('input', (e) => {
  elements.fontSizeValue.textContent = `${e.target.value}px`;
});

elements.opacity.addEventListener('input', (e) => {
  elements.opacityValue.textContent = `${Math.round(e.target.value * 100)}%`;
});

elements.displayArea.addEventListener('input', (e) => {
  elements.displayAreaValue.textContent = `${Math.round(e.target.value * 100)}%`;
});

elements.save.addEventListener('click', saveSettings);
elements.reset.addEventListener('click', resetSettings);

// Color swatch click handlers
elements.colorOwner.addEventListener('click', () => openColorPicker('owner'));
elements.colorModerator.addEventListener('click', () => openColorPicker('moderator'));
elements.colorMember.addEventListener('click', () => openColorPicker('member'));
elements.colorNormal.addEventListener('click', () => openColorPicker('normal'));

// Color modal event handlers
elements.colorModalClose.addEventListener('click', closeColorPicker);
elements.colorCancel.addEventListener('click', closeColorPicker);
elements.colorApply.addEventListener('click', applyColor);

elements.redSlider.addEventListener('input', updateColorPreview);
elements.greenSlider.addEventListener('input', updateColorPreview);
elements.blueSlider.addEventListener('input', updateColorPreview);

// Close modal when clicking outside
elements.colorModal.addEventListener('click', (e) => {
  if (e.target === elements.colorModal) {
    closeColorPicker();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkCurrentTab();
});
