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
    maxMessages: 100, // max simultaneous messages (increased from 50)
    displayArea: 1.0, // percentage of screen height to use (0.0-1.0)
    minVerticalGap: 4, // minimum pixels between messages vertically
    // Settings button
    showSettingsButton: false, // Show settings button on page
    settingsButtonPosition: 'bottom-right', // Position: top-left, top-right, bottom-left, bottom-right
    // Show/hide comments per user type
    showOwner: true,
    showModerator: true,
    showMember: true,
    showNormal: true,
    // Avatar settings per user type
    avatarOwner: true,
    avatarModerator: false,
    avatarMember: false,
    avatarNormal: false,
    // Color settings per user type (RGB)
    colorOwner: { r: 255, g: 215, b: 0 },      // Gold
    colorModerator: { r: 94, g: 132, b: 241 },  // Blue
    colorMember: { r: 46, g: 204, b: 113 },     // Green
    colorNormal: { r: 255, g: 255, b: 255 }     // White
  };

  let settings = { ...defaultSettings };
  let flowContainers = new Map(); // videoId -> container element
  let activeMessages = new Map(); // videoId -> array of active message info
  let messageCount = 0;
  let controlsVisible = false;
  let backgroundChatIframes = new Map(); // videoId -> iframe element
  let detectedVideos = new Set(); // Track detected video IDs to avoid duplicates
  let chatOverlays = new Map(); // videoId -> chat overlay element
  let videoCells = new Map(); // videoId -> video cell element
  let flowEnabledPerVideo = new Map(); // videoId -> boolean (per-video flow chat enabled state)

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
      createToggleButton(); // Recreate button with new settings
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
    videoCells.set(videoId, videoCell);

    return container;
  }

  // Create background chat iframe for fetching messages (hidden, no hover display)
  function createBackgroundChatIframe(videoId, videoCell) {
    if (backgroundChatIframes.has(videoId)) {
      return backgroundChatIframes.get(videoId);
    }

    // Initialize per-video flow enabled state (default: enabled)
    if (!flowEnabledPerVideo.has(videoId)) {
      flowEnabledPerVideo.set(videoId, true);
    }

    // Create hidden container for background chat iframe
    const container = document.createElement('div');
    container.className = 'flow-chat-bg-container';
    container.dataset.videoId = videoId;
    container.style.display = 'none'; // Always hidden

    // Create iframe for chat (background only, for reading messages)
    const baseUrl = window.location.hostname;
    const isLive = checkIfVideoIsLive(videoId);
    // Add flow_chat_bg=true parameter so chat-observer.js can detect and monitor this iframe
    const replayUrl = `https://www.youtube.com/live_chat_replay?v=${videoId}&embed_domain=${baseUrl}&flow_chat_bg=true`;
    const liveUrl = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${baseUrl}&flow_chat_bg=true`;

    const iframe = document.createElement('iframe');
    iframe.src = isLive ? liveUrl : replayUrl;
    iframe.className = 'flow-chat-bg-iframe';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.setAttribute('data-video-id', videoId);

    // Store iframe reference for message handling
    backgroundChatIframes.set(videoId, iframe);

    container.appendChild(iframe);
    videoCell.appendChild(container);

    // If not live, try switching to live URL after 5 seconds
    if (!isLive) {
      setTimeout(() => {
        if (checkIfVideoIsLive(videoId)) {
          iframe.src = liveUrl;
        }
      }, 5000);
    }

    // Create per-video toggle button
    createPerVideoToggle(videoId, videoCell);

    return iframe;
  }

  // Create per-video flow chat toggle button
  function createPerVideoToggle(videoId, videoCell) {
    const toggle = document.createElement('button');
    toggle.className = 'flow-chat-video-toggle';
    toggle.dataset.videoId = videoId;
    toggle.title = 'Toggle Flow Chat';

    // Set initial state
    const isEnabled = flowEnabledPerVideo.get(videoId) !== false;
    toggle.innerHTML = isEnabled ? '💬' : '🚫';
    toggle.classList.toggle('disabled', !isEnabled);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentState = flowEnabledPerVideo.get(videoId) !== false;
      const newState = !currentState;
      flowEnabledPerVideo.set(videoId, newState);

      toggle.innerHTML = newState ? '💬' : '🚫';
      toggle.classList.toggle('disabled', !newState);

      // Show/hide flow container based on state
      const container = flowContainers.get(videoId);
      if (container) {
        container.style.display = newState ? 'block' : 'none';
      }
    });

    // Add hover listeners to video cell for showing/hiding toggle button
    videoCell.addEventListener('mouseenter', () => {
      toggle.classList.add('visible');
    });

    videoCell.addEventListener('mouseleave', () => {
      toggle.classList.remove('visible');
    });

    videoCell.appendChild(toggle);
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

    // Check per-video flow enabled state
    if (flowEnabledPerVideo.get(chatData.videoId) === false) return;

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
      if (data && data.videoId) {
        setupVideoCell(data.videoId);
      }
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

  // Extract video ID from URL
  function extractVideoId(url) {
    if (!url) return null;

    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];

    match = url.match(/\/embed\/([^?&]+)/);
    if (match) return match[1];

    match = url.match(/\/watch\/([^?&]+)/);
    if (match) return match[1];

    return null;
  }

  // Check if video is live or archived (improved detection using chat iframe)
  function checkIfVideoIsLive(videoId) {
    // First, check if there's a chat iframe for this video
    const chatIframes = document.querySelectorAll('iframe[src*="youtube.com/live_chat"], iframe[src*="youtube.com/live_chat_replay"]');

    for (const iframe of chatIframes) {
      const iframeVideoId = extractVideoId(iframe.src);
      if (iframeVideoId === videoId) {
        // Found chat iframe for this video - check if it's replay
        const isReplay = iframe.src.includes('live_chat_replay');
        return !isReplay; // If replay, it's archive (not live)
      }
    }

    // Fallback: Check iframe URLs for live indicators
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');
    for (const iframe of iframes) {
      const src = iframe.src;
      if (src.includes(videoId) && src.includes('/live/')) {
        return true;
      }
    }

    // Check data attributes
    const videoElements = document.querySelectorAll(`[data-video-id="${videoId}"]`);
    for (const element of videoElements) {
      const dataStatus = element.getAttribute('data-status');
      if (dataStatus === 'live' || element.classList.contains('live')) {
        return true;
      }
    }

    // Check for live badges
    const liveBadges = document.querySelectorAll('.badge-live, .live-badge, [class*="LiveBadge"]');
    if (liveBadges.length > 0) {
      return true;
    }

    return false;
  }

  // Find chat iframe for a video (for archive support)
  function findChatIframeForVideo(videoId) {
    // Look for YouTube live chat iframes in cells (both live and replay)
    const chatIframes = document.querySelectorAll('iframe[src*="youtube.com/live_chat"], iframe[src*="youtube.com/live_chat_replay"]');

    for (const iframe of chatIframes) {
      const iframeVideoId = extractVideoId(iframe.src);

      if (iframeVideoId === videoId) {
        return iframe;
      }
    }

    return null;
  }

  // Enable chat observation on existing chat iframe (for archive videos)
  // Does NOT modify iframe src - chat-observer runs automatically in all YouTube chat iframes
  function enableChatObservationOnIframe(iframe, videoId) {
    if (!iframe || backgroundChatIframes.has(videoId)) {
      return;
    }

    // Store this iframe (no src modification needed)
    backgroundChatIframes.set(videoId, iframe);

    // Send allow_send message to enable message sending from this iframe
    // This is necessary for archive videos to send chat messages
    try {
      iframe.contentWindow.postMessage({
        type: 'FLOW_CHAT_CONTROL',
        action: 'allow_send'
      }, 'https://www.youtube.com');
      console.log('[Flow Chat] Sent allow_send to archive chat iframe for video:', videoId);
    } catch (e) {
      console.error('[Flow Chat] Failed to send allow_send message:', e);
    }

    // Find or create the cell for this iframe
    const cell = iframe.closest('.video-cell, [class*="cell"]') || iframe.parentElement;
    if (cell) {
      videoCells.set(videoId, cell);

      // Create flow container if it doesn't exist
      if (!flowContainers.has(videoId)) {
        createFlowContainer(cell, videoId);
      }

      // Initialize per-video flow enabled state
      if (!flowEnabledPerVideo.has(videoId)) {
        flowEnabledPerVideo.set(videoId, true);
      }

      // Create per-video toggle button
      createPerVideoToggle(videoId, cell);
    }
  }

  // Detect and register videos on the page
  function detectAndRegisterVideos() {
    // Pattern 1: YouTube embed iframes
    const iframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');

    iframes.forEach((iframe) => {
      const videoId = extractVideoId(iframe.src);

      if (videoId && !detectedVideos.has(videoId)) {
        detectedVideos.add(videoId);

        // Create flow container
        const cell = iframe.closest('.video-cell, [class*="cell"]') || iframe.parentElement;

        if (cell) {
          createFlowContainer(cell, videoId);

          // Check if video is live or archive
          const isLive = checkIfVideoIsLive(videoId);

          if (isLive) {
            // Live stream: create background chat iframe
            // Background iframe will have flow_chat_bg=true parameter
            // Only background iframes can send messages by default
            createBackgroundChatIframe(videoId, cell);
          } else {
            // Archive: find existing chat iframe on the page
            const existingChatIframe = findChatIframeForVideo(videoId);

            if (existingChatIframe) {
              // Enable observation on existing iframe and send allow_send message
              enableChatObservationOnIframe(existingChatIframe, videoId);
            }
          }
        }
      }
    });

    // Pattern 2: Elements with data-video-id attribute
    const videoElements = document.querySelectorAll('[data-video-id]');

    videoElements.forEach((element) => {
      const videoId = element.getAttribute('data-video-id');

      if (videoId && !detectedVideos.has(videoId)) {
        detectedVideos.add(videoId);

        // Create flow container
        const cell = element.closest('.video-cell, [class*="cell"]') || element;

        if (cell) {
          createFlowContainer(cell, videoId);

          // Check if video is live or archive
          const isLive = checkIfVideoIsLive(videoId);

          if (isLive) {
            // Live stream: create background chat iframe
            // Background iframe will have flow_chat_bg=true parameter
            // Only background iframes can send messages by default
            createBackgroundChatIframe(videoId, cell);
          } else {
            // Archive: find existing chat iframe on the page
            const existingChatIframe = findChatIframeForVideo(videoId);

            if (existingChatIframe) {
              // Enable observation on existing iframe and send allow_send message
              enableChatObservationOnIframe(existingChatIframe, videoId);
            }
          }
        }
      }
    });

    // Pattern 3: Standalone chat iframes (for archive chat cells without video)
    const chatIframes = document.querySelectorAll('iframe[src*="youtube.com/live_chat"], iframe[src*="youtube.com/live_chat_replay"]');

    chatIframes.forEach((iframe) => {
      const videoId = extractVideoId(iframe.src);
      if (!videoId) return;

      // IMPORTANT: Skip if we already registered this video with a background iframe
      // This prevents duplicate messages on livestreams
      // Livestreams use background iframes (created in createBackgroundChatIframe)
      // Archives use page chat iframes (this pattern)
      if (backgroundChatIframes.has(videoId)) {
        console.log('[Flow Chat] Skipping page chat iframe for video:', videoId, '(background iframe already exists)');
        return;
      }

      // This is an archive chat cell without a video - create flow for it
      const cell = iframe.closest('.video-cell, [class*="cell"]') || iframe.parentElement;

      if (cell) {
        // Create flow container if it doesn't exist
        if (!flowContainers.has(videoId)) {
          detectedVideos.add(videoId);
          createFlowContainer(cell, videoId);
        }

        // Enable observation on this existing chat iframe (sends allow_send message)
        enableChatObservationOnIframe(iframe, videoId);
      }
    });
  }

  // Initialize flow containers for all visible videos
  function initializeContainers() {
    detectAndRegisterVideos();
  }

  // Create toggle button
  function createToggleButton() {
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

  // Create control panel
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
    // Close button
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
      createToggleButton(); // Recreate button with new settings
    });

    panel.querySelector('#flow-settings-button-position').addEventListener('change', (e) => {
      settings.settingsButtonPosition = e.target.value;
      createToggleButton(); // Recreate button with new position
    });

    panel.querySelector('#flow-clear').addEventListener('click', () => {
      flowContainers.forEach(container => {
        container.innerHTML = '';
      });
      messageCount = 0;
    });

    panel.querySelector('#flow-save').addEventListener('click', () => {
      saveSettings();
      hideControls();
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

  // Close panel when clicking outside
  function handleOutsideClick(event) {
    const panel = document.getElementById('flow-chat-controls');
    const toggle = document.querySelector('.flow-chat-toggle');

    if (controlsVisible && panel && toggle) {
      // Check if click is outside both panel and toggle button
      if (!panel.contains(event.target) && !toggle.contains(event.target)) {
        hideControls();
      }
    }
  }

  function updateStyles() {
    // Update any global styles based on settings
  }

  // Watch for DOM changes to detect new video cells and chat iframe changes
  function watchForNewCells() {
    const observer = new MutationObserver((mutations) => {
      let shouldReinitialize = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for YouTube iframes
              if (node.querySelector('iframe[src*="youtube.com"]') ||
                  node.tagName === 'IFRAME' && node.src?.includes('youtube.com')) {
                shouldReinitialize = true;
              }
              // Check for video ID attributes
              if (node.hasAttribute && node.hasAttribute('data-video-id')) {
                shouldReinitialize = true;
              }
              if (node.querySelector && node.querySelector('[data-video-id]')) {
                shouldReinitialize = true;
              }
            }
          });
        }

        // Check for attribute changes on iframes (for chat iframe switching)
        if (mutation.type === 'attributes' && mutation.target.tagName === 'IFRAME') {
          const iframe = mutation.target;
          if (iframe.src && (iframe.src.includes('live_chat') || iframe.src.includes('live_chat_replay'))) {
            const newVideoId = extractVideoId(iframe.src);

            if (newVideoId) {
              // Remove ALL old references to this iframe
              const toDelete = [];
              backgroundChatIframes.forEach((storedIframe, storedVideoId) => {
                if (storedIframe === iframe) {
                  toDelete.push(storedVideoId);
                }
              });
              toDelete.forEach(id => backgroundChatIframes.delete(id));

              // Trigger redetection immediately for this specific iframe
              shouldReinitialize = true;
            }
          }
        }
      });

      if (shouldReinitialize) {
        setTimeout(detectAndRegisterVideos, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true, // Watch for attribute changes
      attributeFilter: ['src'] // Only watch src attribute changes
    });

    // Also periodically check for new videos and chat iframes
    setInterval(() => {
      detectAndRegisterVideos();
    }, 10000); // Check every 10 seconds
  }

  // Initialize extension
  function init() {
    loadSettings();
    createToggleButton();
    createControlPanel();

    // Listen for messages from chat iframes
    window.addEventListener('message', handleChatMessage);

    // Listen for clicks outside the control panel to close it
    document.addEventListener('click', handleOutsideClick);

    // Initial setup
    setTimeout(() => {
      initializeContainers();
      watchForNewCells();
    }, 2000);
  }

  // Start when page is ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
