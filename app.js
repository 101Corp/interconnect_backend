const container = document.getElementById('message-container');
const input = document.getElementById('text-input');
const sendBtn = document.getElementById('send-button');
const settingsBtn = document.getElementById('settings-button');
const modal = document.getElementById('settings-modal');
const usernameInput = document.getElementById('username-input');
const colorInput = document.getElementById('color-input');
const saveSettingsBtn = document.getElementById('save-settings-button');
const pendingMessages = {};

const savedName = sessionStorage.getItem('chat_username') || 'Anonymous';
const savedColor = sessionStorage.getItem('chat_color') || '#ffffff';

localStorage.setItem('chat_username', savedName);
localStorage.setItem('chat_color', savedColor);

let lastUsername = null; // Track last message's username

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

  //const token = localStorage.getItem('chat_auth_token');
  //if (token) {
    fetch('https://interconnect-backend-roxy.onrender.com/auth/set-color', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token:sessionStorage.getItem('chat_auth_token'), color })
    }).then(res => {
      if (!res.ok) alert('Failed to update color on server.');
    });
  //}

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

  // Only show username if it's different from last message
  if (msg.username !== lastUsername) {
    const userLabel = document.createElement('div');
    userLabel.classList.add('message-username');
    userLabel.textContent = msg.username || 'Anonymous';
    userLabel.style.color = msg.color || '#ffffff';
    div.appendChild(userLabel);
    lastUsername = msg.username;
  } else {
    div.classList.add('same-user');
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = msg.text;

  const delBtn = document.createElement('button');
  delBtn.classList.add('delete-btn');
  delBtn.title = 'Delete message';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', () => {
    deleteMessage(div.dataset.timestamp, div);
  });

  div.appendChild(textSpan);
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
  const userMessage = { text, username, color, tempId };

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


const evt = new EventSource('https://interconnect-backend-roxy.onrender.com/events');
evt.onmessage = event => {
  const msg = JSON.parse(event.data);

if (msg.delete) {
  const allMessages = [...document.querySelectorAll('.message')];
  const index = allMessages.findIndex(el => el.dataset.timestamp == msg.timestamp);

  if (index !== -1) {
    const deletedEl = allMessages[index];
    const deletedUserLabel = deletedEl.querySelector('.message-username');

    // Only proceed if deleted message had a username label
    if (deletedUserLabel) {
      const deletedUsername = deletedUserLabel.textContent;
      const deletedColor = deletedUserLabel.style.color;

      // Remove the deleted message visually
      deletedEl.style.opacity = '0';
      setTimeout(() => deletedEl.remove(), 300);

      // Find the closest message from the same user
      let closest = null;
      let minDistance = Infinity;

      allMessages.forEach((el, i) => {
        if (i === index) return;

        // Try to get username label or infer username if it's a same-user message
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

      // Add a username label above closest message if it doesn't have one
      if (closest) {
        const hasLabel = closest.querySelector('.message-username');
        if (!hasLabel) {
          // Clone the deleted message's username label
          const clonedLabel = deletedUserLabel.cloneNode(true);
          closest.insertBefore(clonedLabel, closest.firstChild);
          closest.classList.remove('same-user');
        }
      }
    } else {
      // If deleted message had no username label, just remove it
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
  } else {
    createMessageElement(msg);
  }
};
