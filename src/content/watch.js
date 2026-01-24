// Flow Chat for Holodex Watch - Watch page content script
// Manages flow display on Holodex watch page (single video view)

(function() {
  'use strict';

  // Default settings
  const defaultSettings = {
    enabled: true,
    displayTime: 8,
    fontSize: 28,
    opacity: 1.0,
    maxMessages: 100,
    displayArea: 1.0,
    minVerticalGap: 4,
    // Settings button
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
    colorOwner: { r: 255, g: 215, b: 0 },
    colorModerator: { r: 94, g: 132, b: 241 },
    colorMember: { r: 46, g: 204, b: 113 },
    colorNormal: { r: 255, g: 255, b: 255 }
  };

  let settings = { ...defaultSettings };
  let flowContainer = null;
  let activeMessages = [];
  let messageCount = 0;
  let controlsVisible = false;
  let videoId = null;
  let pageChatIframe = null; // Reference to page's existing chat iframe
  let flowEnabled = true;
  let videoContainer = null;

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

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.flowChatSettings) {
      settings = { ...defaultSettings, ...changes.flowChatSettings.newValue };
      updateControlPanelUI();
      createGlobalToggleButton(); // Recreate button with new settings
    }
  });

  // Save settings to storage
  function saveSettings() {
    chrome.storage.sync.set({ flowChatSettings: settings });
  }

  // Extract video ID from URL or iframe
  function extractVideoId(url) {
    if (!url) return null;

    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];

    match = url.match(/\/embed\/([^?&]+)/);
    if (match) return match[1];

    match = url.match(/\/watch\/([^?&#]+)/);
    if (match) return match[1];

    return null;
  }

  // Get video ID from current page URL
  function getVideoIdFromPage() {
    const url = window.location.href;
    const id = extractVideoId(url);
    console.log('[Flow Chat Watch] Video ID from page:', id);
    return id;
  }

  // Find the video container (where we'll overlay the flow chat)
  function findVideoContainer() {
    console.log('[Flow Chat Watch] Finding video container...');
    // Look for the main video player area in Holodex watch page
    const selectors = [
      '.v-responsive', // Vuetify responsive container
      '[class*="video-container"]',
      '[class*="player-container"]',
      'iframe[src*="youtube.com/embed"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[Flow Chat Watch] Found video container with selector:', selector);
        // If it's an iframe, get its parent container
        if (element.tagName === 'IFRAME') {
          const container = element.closest('.v-responsive') || element.parentElement;
          console.log('[Flow Chat Watch] Video container (from iframe parent):', container);
          return container;
        }
        console.log('[Flow Chat Watch] Video container:', element);
        return element;
      }
    }

    console.log('[Flow Chat Watch] No video container found');
    return null;
  }

  // Find existing chat iframe on the page
  function findPageChatIframe() {
    console.log('[Flow Chat Watch] Looking for existing chat iframe on page...');

    // Look for YouTube chat iframes (live_chat or live_chat_replay)
    const chatIframes = document.querySelectorAll('iframe[src*="youtube.com/live_chat"], iframe[src*="youtube.com/live_chat_replay"]');

    for (const iframe of chatIframes) {
      const iframeSrc = iframe.src || '';

      // Check if this iframe is for the current video
      if (iframeSrc.includes(`v=${videoId}`)) {
        console.log('[Flow Chat Watch] Found chat iframe for video:', videoId);
        return iframe;
      }
    }

    console.log('[Flow Chat Watch] No chat iframe found for video:', videoId);
    return null;
  }

  // Enable message sending for page chat iframe
  function enablePageChatIframe(iframe) {
    if (!iframe) {
      console.log('[Flow Chat Watch] No iframe to enable');
      return;
    }

    console.log('[Flow Chat Watch] Enabling message sending for page chat iframe');
    pageChatIframe = iframe;

    // Send allow_send message to the iframe's chat-observer
    // This allows the chat-observer in the iframe to send messages
    try {
      iframe.contentWindow.postMessage({
        type: 'FLOW_CHAT_CONTROL',
        action: 'allow_send'
      }, 'https://www.youtube.com');

      console.log('[Flow Chat Watch] Sent allow_send message to chat iframe');
    } catch (e) {
      console.error('[Flow Chat Watch] Failed to send allow_send message:', e);
    }
  }

  // Create flow container overlay on video
  function createFlowContainer(container) {
    if (flowContainer) {
      return flowContainer;
    }

    const flowDiv = document.createElement('div');
    flowDiv.className = 'flow-chat-container';
    flowDiv.dataset.videoId = videoId;

    // Ensure container has relative positioning
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(flowDiv);
    flowContainer = flowDiv;
    activeMessages = [];

    return flowDiv;
  }


  // Create per-video toggle button
  function createToggleButton() {
    if (!videoContainer) return;

    const toggle = document.createElement('button');
    toggle.className = 'flow-chat-video-toggle';
    toggle.dataset.videoId = videoId;
    toggle.title = 'Toggle Flow Chat';

    toggle.innerHTML = flowEnabled ? '💬' : '🚫';
    toggle.classList.toggle('disabled', !flowEnabled);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      flowEnabled = !flowEnabled;

      toggle.innerHTML = flowEnabled ? '💬' : '🚫';
      toggle.classList.toggle('disabled', !flowEnabled);

      if (flowContainer) {
        flowContainer.style.display = flowEnabled ? 'block' : 'none';
      }
    });

    // Add hover listeners to video container for showing/hiding toggle button
    videoContainer.addEventListener('mouseenter', () => {
      toggle.classList.add('visible');
    });

    videoContainer.addEventListener('mouseleave', () => {
      toggle.classList.remove('visible');
    });

    videoContainer.appendChild(toggle);
  }

  // Check if two messages would collide
  function wouldCollide(msg1, msg2, containerWidth) {
    if (msg1.top + msg1.height + settings.minVerticalGap <= msg2.top ||
        msg2.top + msg2.height + settings.minVerticalGap <= msg1.top) {
      return false;
    }

    const now = Date.now();
    const msg1Speed = (containerWidth + msg1.width) / settings.displayTime;
    const msg2Speed = (containerWidth + msg2.width) / settings.displayTime;

    const msg1Left = containerWidth - msg1Speed * (now - msg1.startTime) / 1000;
    const msg1Right = msg1Left + msg1.width;

    const msg2Left = containerWidth - msg2Speed * (now - msg2.startTime) / 1000;
    const msg2Right = msg2Left + msg2.width;

    if (msg1Right > msg2Left && msg1Left < msg2Right) {
      return true;
    }

    if (msg2Speed > msg1Speed && msg2Left > msg1Left) {
      const relativeSpeed = msg2Speed - msg1Speed;
      const distance = msg2Left - msg1Right;
      const timeToCollide = (distance / relativeSpeed) * 1000;
      const msg1ExitTime = (msg1Right / msg1Speed) * 1000;

      if (timeToCollide < msg1ExitTime) {
        return true;
      }
    }

    return false;
  }

  // Find available Y position for new message
  function findAvailablePosition(messageWidth, messageHeight, containerWidth, containerHeight) {
    const maxY = containerHeight * settings.displayArea - messageHeight;
    const step = messageHeight + settings.minVerticalGap;

    for (let y = 0; y <= maxY; y += step) {
      const newMsg = {
        top: y,
        height: messageHeight,
        width: messageWidth,
        startTime: Date.now()
      };

      let hasCollision = false;

      for (const existingMsg of activeMessages) {
        if (wouldCollide(existingMsg, newMsg, containerWidth)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        return y;
      }
    }

    return -1;
  }

  // Create flow message element
  function createFlowMessage(chatData) {
    if (!flowContainer || !settings.enabled || !flowEnabled) return;

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
    if (flowContainer.children.length >= settings.maxMessages) {
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `flow-chat-message ${chatData.type}`;
    messageEl.style.fontSize = `${settings.fontSize}px`;
    messageEl.style.opacity = settings.opacity;

    // Get color for this user type
    let messageColor = settings.colorNormal;
    switch (chatData.type) {
      case 'owner':
        messageColor = settings.colorOwner;
        break;
      case 'moderator':
        messageColor = settings.colorModerator;
        break;
      case 'member':
        messageColor = settings.colorMember;
        break;
      default:
        messageColor = settings.colorNormal;
    }
    messageEl.style.color = `rgb(${messageColor.r}, ${messageColor.g}, ${messageColor.b})`;

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
      messageContent.textContent = chatData.message;
    }

    messageEl.appendChild(messageContent);

    // Temporarily add to DOM to measure width
    messageEl.style.visibility = 'hidden';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '-9999px';
    flowContainer.appendChild(messageEl);

    // Get actual message dimensions
    const messageWidth = messageEl.offsetWidth;
    const messageHeight = messageEl.offsetHeight;
    const containerWidth = flowContainer.offsetWidth;
    const containerHeight = flowContainer.offsetHeight;

    // Find available Y position
    const topPosition = findAvailablePosition(
      messageWidth,
      messageHeight,
      containerWidth,
      containerHeight
    );

    if (topPosition === -1) {
      messageEl.remove();
      return;
    }

    const totalDistance = containerWidth + messageWidth;
    const animationDuration = settings.displayTime;

    // Track this message
    const messageInfo = {
      top: topPosition,
      height: messageHeight,
      width: messageWidth,
      startTime: Date.now(),
      element: messageEl
    };

    activeMessages.push(messageInfo);

    // Reset positioning for animation
    messageEl.style.visibility = 'visible';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '100%';
    messageEl.style.top = `${topPosition}px`;

    // Set animation
    messageEl.style.setProperty('--flow-distance', `-${totalDistance}px`);
    messageEl.style.animationDuration = `${animationDuration}s`;

    // Remove after animation
    messageEl.addEventListener('animationend', () => {
      messageEl.remove();
      const idx = activeMessages.indexOf(messageInfo);
      if (idx > -1) {
        activeMessages.splice(idx, 1);
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
      console.log('[Flow Chat Watch] Received chat message:', data);
      // Only process if video IDs match or if no video ID in data
      if (!data.videoId || data.videoId === videoId) {
        console.log('[Flow Chat Watch] Creating flow message');
        createFlowMessage(data);
      } else {
        console.log('[Flow Chat Watch] Video ID mismatch. Expected:', videoId, 'Got:', data.videoId);
      }
    } else if (type === 'FLOW_CHAT_READY') {
      console.log('[Flow Chat Watch] Received FLOW_CHAT_READY');
    }
  }

  // Create global toggle button
  function createGlobalToggleButton() {
    // Remove existing button if any
    const existingToggle = document.querySelector('.flow-chat-toggle');
    if (existingToggle) {
      existingToggle.remove();
    }

    // Only create button if showSettingsButton is enabled
    if (!settings.showSettingsButton) {
      return;
    }

    const toggle = document.createElement('button');
    toggle.className = `flow-chat-toggle flow-chat-toggle-${settings.settingsButtonPosition}`;
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

  // Create control panel (same as multiview)
  function createControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'flow-chat-controls';
    panel.id = 'flow-chat-controls';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0;">Flow Chat Settings</h3>
        <button id="flow-close-btn" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">&times;</button>
      </div>

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
        <span>Max Messages (${settings.maxMessages})</span>
        <input type="range" id="flow-max-messages" min="20" max="200" step="10" value="${settings.maxMessages}">
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

      <div style="margin: 8px 0; font-size: 12px; opacity: 0.8;">Settings Button:</div>

      <label>
        <span>Show on Page</span>
        <input type="checkbox" id="flow-show-settings-button" ${settings.showSettingsButton ? 'checked' : ''}>
      </label>

      <label>
        <span>Position</span>
        <select id="flow-settings-button-position">
          <option value="top-left" ${settings.settingsButtonPosition === 'top-left' ? 'selected' : ''}>Top Left</option>
          <option value="top-right" ${settings.settingsButtonPosition === 'top-right' ? 'selected' : ''}>Top Right</option>
          <option value="bottom-left" ${settings.settingsButtonPosition === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
          <option value="bottom-right" ${settings.settingsButtonPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
        </select>
      </label>

      <button id="flow-clear" class="danger">Clear All Messages</button>
      <button id="flow-save">Save Settings</button>
    `;

    document.body.appendChild(panel);

    // Event listeners
    panel.querySelector('#flow-close-btn').addEventListener('click', () => {
      hideControls();
    });

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

    panel.querySelector('#flow-max-messages').addEventListener('input', (e) => {
      settings.maxMessages = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Max Messages (${settings.maxMessages})`;
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

    panel.querySelector('#flow-show-settings-button').addEventListener('change', (e) => {
      settings.showSettingsButton = e.target.checked;
      createGlobalToggleButton(); // Recreate button with new settings
    });

    panel.querySelector('#flow-settings-button-position').addEventListener('change', (e) => {
      settings.settingsButtonPosition = e.target.value;
      createGlobalToggleButton(); // Recreate button with new position
    });

    panel.querySelector('#flow-clear').addEventListener('click', () => {
      if (flowContainer) {
        flowContainer.innerHTML = '';
      }
      activeMessages = [];
      messageCount = 0;
    });

    panel.querySelector('#flow-save').addEventListener('click', () => {
      saveSettings();
      hideControls();
    });
  }

  function updateControlPanelUI() {
    const panel = document.getElementById('flow-chat-controls');
    if (!panel) return;

    const enabledEl = panel.querySelector('#flow-enabled');
    const displayTimeEl = panel.querySelector('#flow-display-time');
    const fontSizeEl = panel.querySelector('#flow-font-size');
    const opacityEl = panel.querySelector('#flow-opacity');
    const maxMessagesEl = panel.querySelector('#flow-max-messages');
    const displayAreaEl = panel.querySelector('#flow-display-area');
    const showOwnerEl = panel.querySelector('#flow-show-owner');
    const showModeratorEl = panel.querySelector('#flow-show-moderator');
    const showMemberEl = panel.querySelector('#flow-show-member');
    const showNormalEl = panel.querySelector('#flow-show-normal');
    const avatarOwnerEl = panel.querySelector('#flow-avatar-owner');
    const avatarModeratorEl = panel.querySelector('#flow-avatar-moderator');
    const avatarMemberEl = panel.querySelector('#flow-avatar-member');
    const avatarNormalEl = panel.querySelector('#flow-avatar-normal');
    const showSettingsButtonEl = panel.querySelector('#flow-show-settings-button');
    const settingsButtonPositionEl = panel.querySelector('#flow-settings-button-position');

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
    if (maxMessagesEl) {
      maxMessagesEl.value = settings.maxMessages;
      maxMessagesEl.previousElementSibling.textContent = `Max Messages (${settings.maxMessages})`;
    }
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
    if (showSettingsButtonEl) showSettingsButtonEl.checked = settings.showSettingsButton;
    if (settingsButtonPositionEl) settingsButtonPositionEl.value = settings.settingsButtonPosition;
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

  function handleOutsideClick(event) {
    const panel = document.getElementById('flow-chat-controls');
    const toggle = document.querySelector('.flow-chat-toggle');

    if (controlsVisible && panel && toggle) {
      if (!panel.contains(event.target) && !toggle.contains(event.target)) {
        hideControls();
      }
    }
  }

  function updateStyles() {
    // Update any global styles based on settings
  }



  // Initialize extension
  function init() {
    console.log('[Flow Chat Watch] Initializing...');
    console.log('[Flow Chat Watch] Current URL:', window.location.href);

    loadSettings();
    createGlobalToggleButton();
    createControlPanel();

    // Listen for messages from chat iframes
    window.addEventListener('message', handleChatMessage);
    console.log('[Flow Chat Watch] Message listener added');

    // Listen for clicks outside control panel
    document.addEventListener('click', handleOutsideClick);

    // Get video ID from page
    videoId = getVideoIdFromPage();

    if (!videoId) {
      console.log('[Flow Chat Watch] No video ID found, retrying in 2s');
      setTimeout(init, 2000);
      return;
    }

    // Find video container
    videoContainer = findVideoContainer();

    if (videoContainer) {
      console.log('[Flow Chat Watch] Video container found, setting up...');

      // Create flow container
      createFlowContainer(videoContainer);
      console.log('[Flow Chat Watch] Flow container created');

      // Create toggle button
      createToggleButton();
      console.log('[Flow Chat Watch] Toggle button created');

      // Find and enable page's existing chat iframe
      setTimeout(() => {
        console.log('[Flow Chat Watch] Looking for page chat iframe after 2s delay...');
        const chatIframe = findPageChatIframe();

        if (chatIframe) {
          enablePageChatIframe(chatIframe);
        } else {
          console.log('[Flow Chat Watch] No chat iframe found on page, will retry...');
          // Retry after another 2 seconds
          setTimeout(() => {
            const retryIframe = findPageChatIframe();
            if (retryIframe) {
              enablePageChatIframe(retryIframe);
            } else {
              console.log('[Flow Chat Watch] Still no chat iframe found');
            }
          }, 2000);
        }
      }, 2000);
    } else {
      console.log('[Flow Chat Watch] Video container not found, retrying in 2s');
      // Retry finding video container
      setTimeout(init, 2000);
    }
  }

  // Start when page is ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
