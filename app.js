const container = document.getElementById('message-container');
const input = document.getElementById('text-input');
const sendBtn = document.getElementById('send-button');
const settingsBtn = document.getElementById('settings-button');
const modal = document.getElementById('settings-modal');
const usernameInput = document.getElementById('username-input');
const colorInput = document.getElementById('color-input');
const saveSettingsBtn = document.getElementById('save-settings-button');
const pendingMessages = {};

const channelEls = document.querySelectorAll('.channel');

const savedName = sessionStorage.getItem('chat_username') || 'Anonymous';
const savedColor = sessionStorage.getItem('chat_color') || '#ffffff';

localStorage.setItem('chat_username', savedName);
localStorage.setItem('chat_color', savedColor);

let lastUsername = null;
let evt = null;
let currentChannel = 'general'; // default channel

function openSettings() {
  const savedName = sessionStorage.getItem('chat_username') || 'Anonymous';
  const savedColor = sessionStorage.getItem('chat_color') || '#ffffff';

  usernameInput.value = savedName;
  usernameInput.disabled = true;
  colorInput.value = savedColor;

  modal.style.display = 'flex';
  usernameInput.focus();
}

closeSettings();

function closeSettings() {
  modal.style.display = 'none';
}

function saveSettings() {
  const name = usernameInput.value.trim();
  const color = colorInput.value;

  if (!name) {
    alert('Come on, enter a username, don’t be shy!');
    usernameInput.focus();
    return;
  }

  localStorage.setItem('chat_username', name);
  localStorage.setItem('chat_color', color);

  sessionStorage.setItem('chat_color', color);
  const profilePicInput = document.getElementById('profile-pic-input');
  const profilePic = profilePicInput.value.trim();
  console.log(profilePic)

  sessionStorage.setItem('chat_profile_pic', profilePic);

  fetch('https://interconnect-backend-roxy.onrender.com/auth/save_settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: sessionStorage.getItem('chat_auth_token'),
      color,
      pfp: profilePic,
    })
  }).then(res => {
    if (!res.ok) alert('Failed to update settings on server.');
  });

  closeSettings();
}

document.getElementById('logout-button').addEventListener('click', async () => {
  localStorage.removeItem('chat_auth_token');
  localStorage.removeItem('chat_username');
  window.location.href = 'index.html?logged_out=1';
});

function createMessageElement(msg, pending = false) {
  const div = document.createElement('div');
  div.classList.add('message');
  if (pending) div.classList.add('pending');
  if (msg.tempId && pending) pendingMessages[msg.tempId] = div;

  if (msg.timestamp) div.dataset.timestamp = msg.timestamp;
  console.log(lastUsername)
  const showUserInfo = msg.username !== lastUsername;
  if (!pending) lastMessageSender = msg.username;

  const userBlock = document.createElement('div');
  userBlock.classList.add('message-user-block');

  if (showUserInfo) {
    lastUsername = msg.username;
    const img = document.createElement('img');
    img.src = msg.pfp || 'default_avatar.jpg';
    img.alt = 'Profile';
    img.classList.add('profile-pic');
    userBlock.appendChild(img);
  } else {
    const spacer = document.createElement('div');
    spacer.style.width = '32px';
    userBlock.appendChild(spacer);
  }

  const contentBlock = document.createElement('div');
  contentBlock.classList.add('message-content');


  if (showUserInfo) {
    const usernameRow = document.createElement('div');
    usernameRow.classList.add('username-row');

    const userLabel = document.createElement('div');
    userLabel.classList.add('message-username');
    userLabel.textContent = msg.username || 'Anonymous';
    userLabel.style.color = msg.color || '#ffffff';

    usernameRow.appendChild(userLabel);
    if (msg.timestamp) {
      let timeString = 'Unknown time';
      const timestampNum = Number(msg.timestamp);
      if (!isNaN(timestampNum)) {
        const date = new Date(timestampNum);
        timeString = date.toLocaleString();
      }
      console.log(timeString)
      const tsDiv = document.createElement('div');
      tsDiv.classList.add('message-timestamp-inline');
      tsDiv.textContent = timeString;

      // Add the timestamp div *to* usernameRow (important)
      usernameRow.appendChild(tsDiv);
    }
    contentBlock.appendChild(usernameRow);
  } else {
    // No username shown, put timestamp to right of message text instead

  }



  const textSpan = document.createElement('div');
  textSpan.classList.add('message-text');
  textSpan.textContent = msg.text || '';
  contentBlock.appendChild(textSpan);

  userBlock.appendChild(contentBlock);
  div.appendChild(userBlock);

  const delBtn = document.createElement('button');
  delBtn.classList.add('delete-btn');
  delBtn.title = 'Delete message';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', () => {
    deleteMessage(div.dataset.timestamp, div);
  });

  // Add wrapper to delBtn for alignment
  const delWrapper = document.createElement('div');
  delWrapper.classList.add('delete-wrapper');
  delWrapper.appendChild(delBtn);

  // Add special class if no user info shown to center the trashcan vertically
  if (!showUserInfo) {
    delWrapper.classList.add('center-trash');
  }

  div.appendChild(delBtn);

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}



function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const username = localStorage.getItem('chat_username') || 'Anonymous';
  const color = sessionStorage.getItem('chat_color') || '#ffffff';

  const tempId = Date.now().toString() + Math.random();
  const profilePic = sessionStorage.getItem('chat_profile_pic') || '';
  console.log(currentChannel)
  const userMessage = { text, username, color, tempId, pfp: profilePic, channel: currentChannel, server: "gaming" };


  createMessageElement(userMessage, true);

  fetch('https://interconnect-backend-roxy.onrender.com/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userMessage)
  }).catch(() => alert('Failed to send message'));

  input.value = '';
}

function deleteMessage(timestamp, element) {
  if (!timestamp) {
    alert('Cannot delete unsaved message.');
    return;
  }
  element.style.opacity = '0';
  setTimeout(() => element.remove(), 300);

  fetch(`https://interconnect-backend-roxy.onrender.com/delete/${timestamp}`, {
    method: 'DELETE'
  }).catch(() => {
    alert('Failed to delete message on server.');
  });
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

settingsBtn.addEventListener('click', openSettings);
saveSettingsBtn.addEventListener('click', saveSettings);

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.style.display === 'flex') {
    closeSettings();
  }
});

modal.addEventListener('click', e => {
  if (e.target === modal) closeSettings();
});

function getPreviousUsername(messages, index) {
  for (let i = index - 1; i >= 0; i--) {
    const label = messages[i].querySelector('.message-username');
    if (label) return label.textContent;
  }
  return null;
}

function subToChannel(channel) {
  container.innerHTML = '';
  lastUsername = null;
  if (evt) evt.close();
  evt = new EventSource(`https://interconnect-backend-roxy.onrender.com/events?channel=${encodeURIComponent(channel)}`);
  evt.onmessage = event => {
    const msg = JSON.parse(event.data);

    if (msg.delete) {
      const allMessages = [...document.querySelectorAll('.message')];
      const index = allMessages.findIndex(el => el.dataset.timestamp == msg.timestamp);

      if (index !== -1) {
        const deletedEl = allMessages[index];
        const deletedUserLabel = deletedEl.querySelector('.message-username');

        if (deletedUserLabel) {
          const deletedUsername = deletedUserLabel.textContent;
          const deletedColor = deletedUserLabel.style.color;

          deletedEl.style.opacity = '0';
          setTimeout(() => deletedEl.remove(), 300);

          let closest = null;
          let minDistance = Infinity;

          allMessages.forEach((el, i) => {
            if (i === index) return;

            let usernameLabel = el.querySelector('.message-username');
            let username = usernameLabel
              ? usernameLabel.textContent
              : (el.classList.contains('same-user') ? getPreviousUsername(allMessages, i) : null);

            if (username === deletedUsername) {
              const dist = Math.abs(i - index);
              if (dist < minDistance) {
                closest = el;
                minDistance = dist;
              }
            }
          });

          if (closest) {
            const hasLabel = closest.querySelector('.message-username');
            if (!hasLabel) {
              const clonedLabel = deletedUserLabel.cloneNode(true);
              closest.insertBefore(clonedLabel, closest.firstChild);
              closest.classList.remove('same-user');
            }
          } else {
            const next = allMessages[index - 1];
            if (!next || !next.classList.contains('same-user')) {
              lastUsername = null;
            }
          }
        } else {
          deletedEl.style.opacity = '0';
          setTimeout(() => deletedEl.remove(), 300);
        }
      }
      return;
    }

    if (msg.tempId && pendingMessages[msg.tempId]) {
      const el = pendingMessages[msg.tempId];
      el.classList.remove('pending');
      el.dataset.timestamp = msg.timestamp;
      delete pendingMessages[msg.tempId];
    } else if (msg.channel === currentChannel)  {
      createMessageElement(msg);
    }
  };

}

// UI: Highlight the selected channel
function highlightActiveChannel(channel) {
  const cleanChannel = channel.replace(/^#?\s*/, '').trim();

  channelEls.forEach(el => {
    const elChannel = el.textContent.replace(/^#?\s*/, '').trim();
    if (elChannel === cleanChannel) {
      el.classList.add('active-channel');
    } else {
      el.classList.remove('active-channel');
    }
  });
}


// Bind events
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

channelEls.forEach(el => {
  el.addEventListener('click', () => {
    currentChannel = el.textContent.replace(/^#?\s*/, '').trim();
    highlightActiveChannel(currentChannel)
    subToChannel(currentChannel);
  });
});

subToChannel(currentChannel)
highlightActiveChannel(currentChannel)
