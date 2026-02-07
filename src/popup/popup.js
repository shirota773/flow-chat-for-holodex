// Popup script for Flow Chat settings

const defaultSettings = {
  enabled: true,
  displayTime: 8,
  fontSize: 28,
  opacity: 1.0,
  maxMessages: 100, // increased from 50
  displayArea: 1.0,
  minVerticalGap: 4,
  showSettingsButton: false,
  settingsButtonPosition: 'bottom-right',
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

// Predefined color palette
const colorPalette = [
  // Row 1: Whites and grays
  { r: 255, g: 255, b: 255 }, // White
  { r: 220, g: 220, b: 220 }, // Light gray
  { r: 180, g: 180, b: 180 }, // Gray
  { r: 128, g: 128, b: 128 }, // Dark gray
  { r: 255, g: 255, b: 224 }, // Light yellow
  { r: 255, g: 250, b: 205 }, // Lemon chiffon
  { r: 255, g: 245, b: 238 }, // Seashell
  { r: 245, g: 245, b: 245 }, // White smoke

  // Row 2: Yellows and oranges
  { r: 255, g: 255, b: 0 },   // Yellow
  { r: 255, g: 215, b: 0 },   // Gold
  { r: 255, g: 193, b: 37 },  // Golden rod
  { r: 255, g: 165, b: 0 },   // Orange
  { r: 255, g: 140, b: 0 },   // Dark orange
  { r: 255, g: 127, b: 80 },  // Coral
  { r: 255, g: 99, b: 71 },   // Tomato
  { r: 255, g: 69, b: 0 },    // Orange red

  // Row 3: Reds and pinks
  { r: 255, g: 0, b: 0 },     // Red
  { r: 220, g: 20, b: 60 },   // Crimson
  { r: 255, g: 105, b: 180 }, // Hot pink
  { r: 255, g: 182, b: 193 }, // Light pink
  { r: 255, g: 192, b: 203 }, // Pink
  { r: 219, g: 112, b: 147 }, // Pale violet red
  { r: 199, g: 21, b: 133 },  // Medium violet red
  { r: 148, g: 0, b: 211 },   // Dark violet

  // Row 4: Purples and blues
  { r: 138, g: 43, b: 226 },  // Blue violet
  { r: 147, g: 112, b: 219 }, // Medium purple
  { r: 186, g: 85, b: 211 },  // Medium orchid
  { r: 153, g: 50, b: 204 },  // Dark orchid
  { r: 75, g: 0, b: 130 },    // Indigo
  { r: 106, g: 90, b: 205 },  // Slate blue
  { r: 94, g: 132, b: 241 },  // Custom blue
  { r: 65, g: 105, b: 225 },  // Royal blue

  // Row 5: Blues
  { r: 0, g: 0, b: 255 },     // Blue
  { r: 30, g: 144, b: 255 },  // Dodger blue
  { r: 0, g: 191, b: 255 },   // Deep sky blue
  { r: 135, g: 206, b: 250 }, // Light sky blue
  { r: 173, g: 216, b: 230 }, // Light blue
  { r: 176, g: 224, b: 230 }, // Powder blue
  { r: 0, g: 255, b: 255 },   // Cyan
  { r: 127, g: 255, b: 212 }, // Aquamarine

  // Row 6: Greens
  { r: 0, g: 255, b: 127 },   // Spring green
  { r: 46, g: 204, b: 113 },  // Custom green
  { r: 0, g: 255, b: 0 },     // Lime
  { r: 50, g: 205, b: 50 },   // Lime green
  { r: 144, g: 238, b: 144 }, // Light green
  { r: 152, g: 251, b: 152 }, // Pale green
  { r: 34, g: 139, b: 34 },   // Forest green
  { r: 0, g: 128, b: 0 }      // Green
];

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
  maxMessages: document.getElementById('maxMessages'),
  maxMessagesValue: document.getElementById('maxMessages-value'),
  displayArea: document.getElementById('displayArea'),
  displayAreaValue: document.getElementById('displayArea-value'),
  showSettingsButton: document.getElementById('showSettingsButton'),
  settingsButtonPosition: document.getElementById('settingsButtonPosition'),
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
  colorPaletteContainer: document.getElementById('colorPalette'),
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
  elements.maxMessages.value = currentSettings.maxMessages;
  elements.maxMessagesValue.textContent = `${currentSettings.maxMessages}`;
  elements.displayArea.value = currentSettings.displayArea;
  elements.displayAreaValue.textContent = `${Math.round(currentSettings.displayArea * 100)}%`;
  elements.showSettingsButton.checked = currentSettings.showSettingsButton;
  elements.settingsButtonPosition.value = currentSettings.settingsButtonPosition;
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
    maxMessages: parseInt(elements.maxMessages.value),
    displayArea: parseFloat(elements.displayArea.value),
    minVerticalGap: currentSettings.minVerticalGap,
    showSettingsButton: elements.showSettingsButton.checked,
    settingsButtonPosition: elements.settingsButtonPosition.value,
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

// Initialize color palette
function initColorPalette() {
  elements.colorPaletteContainer.innerHTML = '';

  colorPalette.forEach((color, index) => {
    const colorBtn = document.createElement('div');
    colorBtn.className = 'palette-color';
    colorBtn.style.backgroundColor = rgbToString(color);
    colorBtn.dataset.index = index;

    colorBtn.addEventListener('click', () => {
      selectPaletteColor(color);
    });

    elements.colorPaletteContainer.appendChild(colorBtn);
  });
}

function selectPaletteColor(color) {
  elements.redSlider.value = color.r;
  elements.greenSlider.value = color.g;
  elements.blueSlider.value = color.b;
  updateColorPreview();
  updatePaletteSelection();
}

function updatePaletteSelection() {
  const r = parseInt(elements.redSlider.value);
  const g = parseInt(elements.greenSlider.value);
  const b = parseInt(elements.blueSlider.value);

  // Remove all selections
  document.querySelectorAll('.palette-color').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Find matching color in palette
  colorPalette.forEach((color, index) => {
    if (color.r === r && color.g === g && color.b === b) {
      const btn = elements.colorPaletteContainer.children[index];
      if (btn) btn.classList.add('selected');
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
  updatePaletteSelection();

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

elements.maxMessages.addEventListener('input', (e) => {
  elements.maxMessagesValue.textContent = `${e.target.value}`;
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

elements.redSlider.addEventListener('input', () => {
  updateColorPreview();
  updatePaletteSelection();
});
elements.greenSlider.addEventListener('input', () => {
  updateColorPreview();
  updatePaletteSelection();
});
elements.blueSlider.addEventListener('input', () => {
  updateColorPreview();
  updatePaletteSelection();
});

// Close modal when clicking outside
elements.colorModal.addEventListener('click', (e) => {
  if (e.target === elements.colorModal) {
    closeColorPicker();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initColorPalette();
  loadSettings();
  checkCurrentTab();
});
