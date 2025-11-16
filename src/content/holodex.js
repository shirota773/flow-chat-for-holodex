// Flow Chat for Holodex - Main Content Script
// Manages flow display on Holodex multiview page

(function() {
  'use strict';

  // Default settings
  const defaultSettings = {
    enabled: true,
    displayTime: 8,  // seconds to display on screen
    fontSize: 28,    // pixels
    opacity: 1.0,
    maxMessages: 50, // max simultaneous messages
    displayArea: 1.0, // percentage of screen height to use (0.0-1.0)
    minVerticalGap: 4, // minimum pixels between messages vertically
    // Show/hide comments per user type
    showOwner: true,
    showModerator: true,
    showMember: true,
    showNormal: true,
    // Avatar settings per user type
    avatarOwner: true,
    avatarModerator: false,
    avatarMember: false,
    avatarNormal: false
  };

  let settings = { ...defaultSettings };
  let flowContainers = new Map(); // videoId -> container element
  let activeMessages = new Map(); // videoId -> array of active message info
  let messageCount = 0;
  let controlsVisible = false;

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get('flowChatSettings', (result) => {
      if (result.flowChatSettings) {
        settings = { ...defaultSettings, ...result.flowChatSettings };
        updateStyles();
        updateControlPanelUI();
      }
    });
  }

  // Listen for storage changes (for immediate settings application)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.flowChatSettings) {
      settings = { ...defaultSettings, ...changes.flowChatSettings.newValue };
      updateControlPanelUI();
      console.log('[FlowChat] Settings updated:', settings);
    }
  });

  // Save settings to storage
  function saveSettings() {
    chrome.storage.sync.set({ flowChatSettings: settings });
  }

  // Find all video cells in Holodex multiview
  function findVideoCells() {
    // Holodex uses a grid of video cells
    const cells = document.querySelectorAll('.video-cell, [class*="cell"], .v-responsive');
    return Array.from(cells).filter(cell => {
      // Filter to cells that contain video iframes
      return cell.querySelector('iframe[src*="youtube.com/embed"]') ||
             cell.querySelector('video') ||
             cell.querySelector('[class*="player"]');
    });
  }

  // Create flow container for a video cell
  function createFlowContainer(videoCell, videoId) {
    if (flowContainers.has(videoId)) {
      return flowContainers.get(videoId);
    }

    const container = document.createElement('div');
    container.className = 'flow-chat-container';
    container.dataset.videoId = videoId;

    // Ensure video cell has relative positioning
    const computedStyle = window.getComputedStyle(videoCell);
    if (computedStyle.position === 'static') {
      videoCell.style.position = 'relative';
    }

    videoCell.appendChild(container);
    flowContainers.set(videoId, container);
    activeMessages.set(videoId, []);

    return container;
  }

  // Check if two messages would collide
  function wouldCollide(msg1, msg2, containerWidth) {
    // Vertical overlap check
    if (msg1.top + msg1.height + settings.minVerticalGap <= msg2.top ||
        msg2.top + msg2.height + settings.minVerticalGap <= msg1.top) {
      return false; // No vertical overlap
    }

    // Horizontal collision check
    // Each message has its own speed based on its width and displayTime
    const now = Date.now();

    // Calculate speed for each message (pixels per second)
    const msg1Speed = (containerWidth + msg1.width) / settings.displayTime;
    const msg2Speed = (containerWidth + msg2.width) / settings.displayTime;

    // Calculate current positions
    const msg1Left = containerWidth - msg1Speed * (now - msg1.startTime) / 1000;
    const msg1Right = msg1Left + msg1.width;

    const msg2Left = containerWidth - msg2Speed * (now - msg2.startTime) / 1000;
    const msg2Right = msg2Left + msg2.width;

    // If they overlap now, they collide
    if (msg1Right > msg2Left && msg1Left < msg2Right) {
      return true;
    }

    // Check if they will collide in the future (faster message catches up)
    // If msg2 is faster and behind msg1, check if it will catch up
    if (msg2Speed > msg1Speed && msg2Left > msg1Left) {
      // Time for msg2's head to reach msg1's tail
      const relativeSpeed = msg2Speed - msg1Speed;
      const distance = msg2Left - msg1Right;
      const timeToCollide = (distance / relativeSpeed) * 1000; // ms

      // Check if collision happens before msg1 exits screen
      const msg1ExitTime = (msg1Right / msg1Speed) * 1000;
      if (timeToCollide < msg1ExitTime) {
        return true;
      }
    }

    return false;
  }

  // Find available Y position for new message
  function findAvailablePosition(videoId, messageWidth, messageHeight, containerWidth, containerHeight) {
    const messages = activeMessages.get(videoId) || [];
    const maxY = containerHeight * settings.displayArea - messageHeight;

    // Try to place message at each possible Y position
    // Start from top, find first non-colliding position
    const step = messageHeight + settings.minVerticalGap;

    for (let y = 0; y <= maxY; y += step) {
      const newMsg = {
        top: y,
        height: messageHeight,
        width: messageWidth,
        startTime: Date.now()
      };

      let hasCollision = false;

      for (const existingMsg of messages) {
        if (wouldCollide(existingMsg, newMsg, containerWidth)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        return y;
      }
    }

    // No available position found
    return -1;
  }

  // Create flow message element
  function createFlowMessage(chatData) {
    const container = flowContainers.get(chatData.videoId);
    if (!container || !settings.enabled) return;

    // Check if this user type should be shown
    let shouldShow = true;
    switch (chatData.type) {
      case 'owner':
        shouldShow = settings.showOwner;
        break;
      case 'moderator':
        shouldShow = settings.showModerator;
        break;
      case 'member':
        shouldShow = settings.showMember;
        break;
      default:
        shouldShow = settings.showNormal;
    }

    if (!shouldShow) return;

    // Limit simultaneous messages
    if (container.children.length >= settings.maxMessages) {
      // Skip this message if at capacity
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `flow-chat-message ${chatData.type}`;
    messageEl.style.fontSize = `${settings.fontSize}px`;
    messageEl.style.opacity = settings.opacity;

    // Add avatar based on user type settings
    let showAvatar = false;
    if (chatData.avatar) {
      switch (chatData.type) {
        case 'owner':
          showAvatar = settings.avatarOwner;
          break;
        case 'moderator':
          showAvatar = settings.avatarModerator;
          break;
        case 'member':
          showAvatar = settings.avatarMember;
          break;
        default:
          showAvatar = settings.avatarNormal;
      }
    }

    if (showAvatar) {
      const avatar = document.createElement('img');
      avatar.className = 'flow-chat-avatar';
      avatar.src = chatData.avatar;
      avatar.alt = '';
      messageEl.appendChild(avatar);
    }

    // Add message content (text and emoji/sticker images)
    const messageContent = document.createElement('span');
    messageContent.className = 'flow-chat-content';

    if (chatData.fragments && Array.isArray(chatData.fragments)) {
      chatData.fragments.forEach(fragment => {
        if (fragment.type === 'text') {
          const textNode = document.createTextNode(fragment.content);
          messageContent.appendChild(textNode);
        } else if (fragment.type === 'emoji') {
          const emojiImg = document.createElement('img');
          emojiImg.className = 'flow-chat-emoji';
          emojiImg.src = fragment.src;
          emojiImg.alt = fragment.alt || '';
          emojiImg.style.height = `${settings.fontSize}px`;
          emojiImg.style.width = 'auto';
          emojiImg.style.verticalAlign = 'middle';
          emojiImg.style.display = 'inline';
          messageContent.appendChild(emojiImg);
        }
      });
    } else if (chatData.message) {
      // Fallback for old format
      messageContent.textContent = chatData.message;
    }

    messageEl.appendChild(messageContent);

    // Temporarily add to DOM to measure width (hidden)
    messageEl.style.visibility = 'hidden';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '-9999px';
    container.appendChild(messageEl);

    // Get actual message dimensions
    const messageWidth = messageEl.offsetWidth;
    const messageHeight = messageEl.offsetHeight;
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    // Find available Y position (collision detection)
    const topPosition = findAvailablePosition(
      chatData.videoId,
      messageWidth,
      messageHeight,
      containerWidth,
      containerHeight
    );

    if (topPosition === -1) {
      // No available position, remove message and skip
      messageEl.remove();
      return;
    }

    // Animation duration is fixed to displayTime (seconds)
    const totalDistance = containerWidth + messageWidth;
    const animationDuration = settings.displayTime; // seconds

    // Track this message for collision detection
    const messageInfo = {
      top: topPosition,
      height: messageHeight,
      width: messageWidth,
      startTime: Date.now(),
      element: messageEl
    };

    const messages = activeMessages.get(chatData.videoId);
    messages.push(messageInfo);

    // Reset positioning for animation
    messageEl.style.visibility = 'visible';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '100%'; // Start from right edge
    messageEl.style.top = `${topPosition}px`;

    // Set custom animation with proper distance and fixed speed
    messageEl.style.setProperty('--flow-distance', `-${totalDistance}px`);
    messageEl.style.animationDuration = `${animationDuration}s`;

    // Remove after animation
    messageEl.addEventListener('animationend', () => {
      messageEl.remove();
      // Remove from active messages
      const idx = messages.indexOf(messageInfo);
      if (idx > -1) {
        messages.splice(idx, 1);
      }
      messageCount--;
    });

    messageCount++;
  }

  // Handle incoming chat messages
  function handleChatMessage(event) {
    if (event.origin !== 'https://www.youtube.com') return;

    const { type, data } = event.data;

    if (type === 'FLOW_CHAT_MESSAGE' && data) {
      createFlowMessage(data);
    } else if (type === 'FLOW_CHAT_READY') {
      console.log('[FlowChat] Chat observer ready for video:', data.videoId);
      setupVideoCell(data.videoId);
    }
  }

  // Setup video cell based on video ID
  function setupVideoCell(videoId) {
    // Find the iframe or cell containing this video
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');

    iframes.forEach(iframe => {
      const src = iframe.src || '';
      if (src.includes(videoId) || src.includes('embed')) {
        const cell = iframe.closest('.video-cell, [class*="cell"]') ||
                     iframe.parentElement?.parentElement;
        if (cell) {
          createFlowContainer(cell, videoId);
        }
      }
    });
  }

  // Initialize flow containers for all visible videos
  function initializeContainers() {
    const cells = findVideoCells();

    cells.forEach((cell, index) => {
      const iframe = cell.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        // Extract video ID from iframe src
        const match = iframe.src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/);
        const videoId = match ? match[1] : `cell-${index}`;
        createFlowContainer(cell, videoId);
      }
    });
  }

  // Create toggle button
  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.className = 'flow-chat-toggle';
    toggle.innerHTML = '💬';
    toggle.title = 'Flow Chat Settings';

    toggle.addEventListener('click', () => {
      if (controlsVisible) {
        hideControls();
      } else {
        showControls();
      }
    });

    document.body.appendChild(toggle);
  }

  // Create control panel
  function createControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'flow-chat-controls';
    panel.id = 'flow-chat-controls';
    panel.style.display = 'none';

    panel.innerHTML = `
      <h3>Flow Chat Settings</h3>

      <label>
        <span>Enable</span>
        <input type="checkbox" id="flow-enabled" ${settings.enabled ? 'checked' : ''}>
      </label>

      <label>
        <span>Display Time (${settings.displayTime}s)</span>
        <input type="range" id="flow-display-time" min="4" max="15" step="1" value="${settings.displayTime}">
      </label>

      <label>
        <span>Size (${settings.fontSize}px)</span>
        <input type="range" id="flow-font-size" min="16" max="48" value="${settings.fontSize}">
      </label>

      <label>
        <span>Opacity</span>
        <input type="range" id="flow-opacity" min="0.3" max="1" step="0.1" value="${settings.opacity}">
      </label>

      <label>
        <span>Display Area (${Math.round(settings.displayArea * 100)}%)</span>
        <input type="range" id="flow-display-area" min="0.3" max="1" step="0.1" value="${settings.displayArea}">
      </label>

      <div style="margin: 8px 0; font-size: 12px; opacity: 0.8;">Show Comments:</div>

      <label>
        <span>Owner</span>
        <input type="checkbox" id="flow-show-owner" ${settings.showOwner ? 'checked' : ''}>
      </label>

      <label>
        <span>Moderator</span>
        <input type="checkbox" id="flow-show-moderator" ${settings.showModerator ? 'checked' : ''}>
      </label>

      <label>
        <span>Member</span>
        <input type="checkbox" id="flow-show-member" ${settings.showMember ? 'checked' : ''}>
      </label>

      <label>
        <span>Normal</span>
        <input type="checkbox" id="flow-show-normal" ${settings.showNormal ? 'checked' : ''}>
      </label>

      <div style="margin: 8px 0; font-size: 12px; opacity: 0.8;">Show Avatar:</div>

      <label>
        <span>Owner</span>
        <input type="checkbox" id="flow-avatar-owner" ${settings.avatarOwner ? 'checked' : ''}>
      </label>

      <label>
        <span>Moderator</span>
        <input type="checkbox" id="flow-avatar-moderator" ${settings.avatarModerator ? 'checked' : ''}>
      </label>

      <label>
        <span>Member</span>
        <input type="checkbox" id="flow-avatar-member" ${settings.avatarMember ? 'checked' : ''}>
      </label>

      <label>
        <span>Normal</span>
        <input type="checkbox" id="flow-avatar-normal" ${settings.avatarNormal ? 'checked' : ''}>
      </label>

      <button id="flow-clear" class="danger">Clear All Messages</button>
      <button id="flow-save">Save Settings</button>
    `;

    document.body.appendChild(panel);

    // Event listeners
    panel.querySelector('#flow-enabled').addEventListener('change', (e) => {
      settings.enabled = e.target.checked;
      saveSettings();
    });

    panel.querySelector('#flow-display-time').addEventListener('input', (e) => {
      settings.displayTime = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Display Time (${settings.displayTime}s)`;
    });

    panel.querySelector('#flow-font-size').addEventListener('input', (e) => {
      settings.fontSize = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Size (${settings.fontSize}px)`;
    });

    panel.querySelector('#flow-opacity').addEventListener('input', (e) => {
      settings.opacity = parseFloat(e.target.value);
    });

    panel.querySelector('#flow-display-area').addEventListener('input', (e) => {
      settings.displayArea = parseFloat(e.target.value);
      e.target.previousElementSibling.textContent = `Display Area (${Math.round(settings.displayArea * 100)}%)`;
    });

    panel.querySelector('#flow-show-owner').addEventListener('change', (e) => {
      settings.showOwner = e.target.checked;
    });

    panel.querySelector('#flow-show-moderator').addEventListener('change', (e) => {
      settings.showModerator = e.target.checked;
    });

    panel.querySelector('#flow-show-member').addEventListener('change', (e) => {
      settings.showMember = e.target.checked;
    });

    panel.querySelector('#flow-show-normal').addEventListener('change', (e) => {
      settings.showNormal = e.target.checked;
    });

    panel.querySelector('#flow-avatar-owner').addEventListener('change', (e) => {
      settings.avatarOwner = e.target.checked;
    });

    panel.querySelector('#flow-avatar-moderator').addEventListener('change', (e) => {
      settings.avatarModerator = e.target.checked;
    });

    panel.querySelector('#flow-avatar-member').addEventListener('change', (e) => {
      settings.avatarMember = e.target.checked;
    });

    panel.querySelector('#flow-avatar-normal').addEventListener('change', (e) => {
      settings.avatarNormal = e.target.checked;
    });

    panel.querySelector('#flow-clear').addEventListener('click', () => {
      flowContainers.forEach(container => {
        container.innerHTML = '';
      });
      messageCount = 0;
    });

    panel.querySelector('#flow-save').addEventListener('click', () => {
      saveSettings();
      alert('Settings saved!');
    });
  }

  // Update control panel UI with current settings (for immediate sync)
  function updateControlPanelUI() {
    const panel = document.getElementById('flow-chat-controls');
    if (!panel) return;

    const enabledEl = panel.querySelector('#flow-enabled');
    const displayTimeEl = panel.querySelector('#flow-display-time');
    const fontSizeEl = panel.querySelector('#flow-font-size');
    const opacityEl = panel.querySelector('#flow-opacity');
    const displayAreaEl = panel.querySelector('#flow-display-area');
    const showOwnerEl = panel.querySelector('#flow-show-owner');
    const showModeratorEl = panel.querySelector('#flow-show-moderator');
    const showMemberEl = panel.querySelector('#flow-show-member');
    const showNormalEl = panel.querySelector('#flow-show-normal');
    const avatarOwnerEl = panel.querySelector('#flow-avatar-owner');
    const avatarModeratorEl = panel.querySelector('#flow-avatar-moderator');
    const avatarMemberEl = panel.querySelector('#flow-avatar-member');
    const avatarNormalEl = panel.querySelector('#flow-avatar-normal');

    if (enabledEl) enabledEl.checked = settings.enabled;
    if (displayTimeEl) {
      displayTimeEl.value = settings.displayTime;
      displayTimeEl.previousElementSibling.textContent = `Display Time (${settings.displayTime}s)`;
    }
    if (fontSizeEl) {
      fontSizeEl.value = settings.fontSize;
      fontSizeEl.previousElementSibling.textContent = `Size (${settings.fontSize}px)`;
    }
    if (opacityEl) opacityEl.value = settings.opacity;
    if (displayAreaEl) {
      displayAreaEl.value = settings.displayArea;
      displayAreaEl.previousElementSibling.textContent = `Display Area (${Math.round(settings.displayArea * 100)}%)`;
    }
    if (showOwnerEl) showOwnerEl.checked = settings.showOwner;
    if (showModeratorEl) showModeratorEl.checked = settings.showModerator;
    if (showMemberEl) showMemberEl.checked = settings.showMember;
    if (showNormalEl) showNormalEl.checked = settings.showNormal;
    if (avatarOwnerEl) avatarOwnerEl.checked = settings.avatarOwner;
    if (avatarModeratorEl) avatarModeratorEl.checked = settings.avatarModerator;
    if (avatarMemberEl) avatarMemberEl.checked = settings.avatarMember;
    if (avatarNormalEl) avatarNormalEl.checked = settings.avatarNormal;
  }

  function showControls() {
    const panel = document.getElementById('flow-chat-controls');
    if (panel) {
      panel.style.display = 'block';
      controlsVisible = true;
    }
  }

  function hideControls() {
    const panel = document.getElementById('flow-chat-controls');
    if (panel) {
      panel.style.display = 'none';
      controlsVisible = false;
    }
  }

  function updateStyles() {
    // Update any global styles based on settings
  }

  // Watch for DOM changes to detect new video cells
  function watchForNewCells() {
    const observer = new MutationObserver((mutations) => {
      let shouldReinitialize = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector('iframe[src*="youtube.com"]') ||
                  node.tagName === 'IFRAME') {
                shouldReinitialize = true;
              }
            }
          });
        }
      });

      if (shouldReinitialize) {
        setTimeout(initializeContainers, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize extension
  function init() {
    console.log('[FlowChat] Initializing Flow Chat for Holodex');

    loadSettings();
    createToggleButton();
    createControlPanel();

    // Listen for messages from chat iframes
    window.addEventListener('message', handleChatMessage);

    // Initial setup
    setTimeout(() => {
      initializeContainers();
      watchForNewCells();
    }, 2000);

    console.log('[FlowChat] Flow Chat initialized');
  }

  // Start when page is ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
