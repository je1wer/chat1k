import moment from 'moment-timezone';
import './prism';
import CryptoJS from 'crypto-js';
import AES from 'crypto-js/aes';

export default class App {
  constructor() {
    this.username = null;
    this.messageCount = 0;
  }

  init() {
    this.initListeners();
  }

  initListeners() {
    this.continueBtnOnclick();
    App.modalListeners();
    this.chatScrollListener();
    this.refreshChatListener();
  }

  continueBtnOnclick() {
    const continueBtn = document.getElementById('continue-btn');
    const input = document.getElementById('main-form-input');
    const mainContainer = document.querySelector('.main_container');
    continueBtn.addEventListener('click', async () => {
      this.username = input.value;
      if (await this.checkUsernameValidity()) {
        mainContainer.classList.remove('hidden');
        input.closest('.main_form').classList.add('hidden');
        this.connectWS();
        this.startRenderInterval();
      } else {
        App.showLoginError();
      }
    });
  }

  connectWS() {
    const ws = new WebSocket('wss://chatos1k.herokuapp.com/chat');
    this.ws = ws;
    this.onMessageType(ws);
    this.imageUploadListener(ws);
    this.dragEventListener(ws);
    ws.addEventListener('message', (evt) => {
      this.renderMessage(evt.data);
      App.scrollChat();
    });
    ws.addEventListener('open', async () => {
      const msg = { username: this.username };
      ws.send(JSON.stringify(msg));
      await this.renderSomeMessages();
      App.scrollChat();
    });
  }

  renderUserList(users) {
    const list = document.querySelector('.user_list');
    list.innerHTML = '';
    users.forEach((e) => {
      if (e.username === this.username) {
        list.innerHTML += `
        <div class="user_self">
          <div class="avatar"></div>
          <span class="user_name">${e.username}</span>
        </div>
      `;
      } else {
        list.innerHTML += `
        <div class="user">
          <div class="avatar"></div>
          <span class="user_name">${e.username}</span>
        </div>
      `;
      }
    });
  }

  renderMessage(data) {
    const parsed = JSON.parse(data);
    if (!parsed.message || !parsed.date) return;
    const chat = document.querySelector('.chat');
    const message = document.createElement('div');
    const nameAndDate = document.createElement('span');
    if (this.username === parsed.username) {
      message.className = 'message_self';
    } else {
      message.className = 'message';
    }
    nameAndDate.className = 'name_and_date';
    nameAndDate.innerText = `${parsed.username}, ${parsed.date}`;
    message.append(nameAndDate);
    App.getMultimediaElement(message, parsed);
    chat.append(message);
    this.messageCount += 1;
  }

  static getMultimediaElement(message, parsed) {
    const secret = document.getElementById('secret');
    if (parsed.type === 'image') {
      const messageImage = document.createElement('img');
      messageImage.className = 'message_image';
      messageImage.src = parsed.message;
      message.append(messageImage);
    }
    if (parsed.type === 'text' && parsed.message.startsWith('http')) {
      const messageText = document.createElement('a');
      messageText.innerText = parsed.message;
      messageText.href = parsed.message;
      message.append(messageText);
    } else if (parsed.type === 'text') {
      if (parsed.message.startsWith('```') && parsed.message.endsWith('```')) {
        const text = parsed.message.slice(3, parsed.message.length - 3);
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-js';
        code.innerText = text;
        pre.append(code);
        message.append(pre);
        Prism.highlightElement(code);
      } else {
        const messageText = document.createElement('span');
        messageText.className = 'message_text';
        messageText.innerText = parsed.message;
        message.append(messageText);
      }
    } else if (parsed.type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = parsed.message;
      audio.controls = true;
      message.append(audio);
    } else if (parsed.type === 'video') {
      const video = document.createElement('video');
      video.src = parsed.message;
      video.controls = true;
      message.append(video);
    } else if (parsed.type === 'encrypted') {
      const messageText = document.createElement('span');
      messageText.className = 'message_text';
      const decrypted = AES.decrypt(parsed.message, secret.value);
      try {
        const local = decrypted.toString(CryptoJS.enc.Utf8);
        if (local !== '') messageText.innerText = local;
        else messageText.innerText = '<ENCRYPTED>';
        message.append(messageText);
      } catch (e) {
        console.log(e);
      }
    }
  }

  async renderSomeMessages() {
    const count = this.messageCount + 10;
    const rawData = await fetch(`https://chatos1k.herokuapp.com/lazy/${count}`);
    const data = await rawData.json();
    if (this.messageCount >= data.length) return;
    this.clearChat();
    data.forEach((x) => {
      this.renderMessage(x);
    });
    App.scrollChat(1);
  }

  refreshChatListener() {
    const refreshBtn = document.getElementById('refresh');
    refreshBtn.addEventListener('click', async () => {
      this.clearChat();
      await this.renderSomeMessages();
      App.scrollChat();
    });
  }

  startRenderInterval() {
    setTimeout(async () => {
      const rawResponse = await fetch('https://chatos1k.herokuapp.com/connections');
      const response = await rawResponse.json();
      if (response.length) this.renderUserList(response);
    }, 500);
    this.interval = setInterval(async () => {
      const rawResponse = await fetch('https://chatos1k.herokuapp.com/connections');
      const response = await rawResponse.json();
      this.renderUserList(response);
    }, 2000);
  }

  async checkUsernameValidity() {
    const rawResponse = await fetch('https://chatos1k.herokuapp.com/connections');
    this.clients = await rawResponse.json();
    if (this.clients.find((x) => x.username === this.username)) {
      return false;
    }
    return true;
  }

  onMessageType(ws) {
    const input = document.getElementById('send-message');
    const secret = document.getElementById('secret');
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const date = moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY');
        let type;
        let message;
        if (secret.value !== '') {
          message = AES.encrypt(input.value, secret.value).toString();
          type = 'encrypted';
        } else {
          message = input.value;
          type = 'text';
        }
        const obj = {
          type,
          username: this.username,
          message,
          date,
        };
        ws.send(JSON.stringify(obj));
        this.checkCommand(input.value);
        input.value = '';
      }
    });
  }

  checkCommand(message) {
    const msg = message.trim();
    if (msg.startsWith('!weather')) {
      this.showWeather();
    } else if (msg.startsWith('!coinflip')) {
      this.flipCoin();
    } else if (msg.startsWith('!roll')) {
      this.rollTheDice();
    } else if (msg.startsWith('!color')) {
      this.generateColor();
    }
  }

  async showWeather() {
    const a = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezone = a.split('/')[1] || a.split('/')[0];
    const rawResponse = await fetch(`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${timezone}/today?unitGroup=metric&include=current&key=PF6BJ4ZL76WG7TYU4XSTSLD23&contentType=json`);
    const response = await rawResponse.json();
    const { address } = response;
    const forecast = response.days[0].description;
    const { temp } = response.days[0];
    const data = {
      type: 'text',
      username: 'ChaosBot',
      message: `${address}, ${forecast} Temperature: ${temp}°C`,
      date: moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY'),
    };
    this.ws.send(JSON.stringify(data));
  }

  flipCoin() {
    const res = ['HEADS', 'TAILS'];
    const idx = Math.floor(Math.random() * res.length);
    const data = {
      type: 'text',
      username: 'ChaosBot',
      message: res[idx],
      date: moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY'),
    };
    this.ws.send(JSON.stringify(data));
  }

  rollTheDice() {
    const min = 0;
    const max = 100;
    const generated = Math.floor(Math.random() * (max - min + 1) + min);
    const data = {
      type: 'text',
      username: 'ChaosBot',
      message: generated.toString(),
      date: moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY'),
    };
    this.ws.send(JSON.stringify(data));
  }

  generateColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i += 1) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    const data = {
      type: 'text',
      username: 'ChaosBot',
      message: color,
      date: moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY'),
    };
    this.ws.send(JSON.stringify(data));
  }

  static showLoginError() {
    const errorMsg = document.querySelector('.error_message');
    if (errorMsg.classList.contains('shake')) {
      errorMsg.classList.remove('fade');
      errorMsg.style.animation = 'none';
      setTimeout(() => {
        errorMsg.style.animation = '';
      }, 10);
      this.errorTimeout = setTimeout(() => {
        errorMsg.classList.add('fade');
      }, 2000);
    } else {
      errorMsg.classList.remove('invisible');
      errorMsg.classList.add('shake');
      this.errorTimeout = setTimeout(() => {
        errorMsg.classList.add('fade');
      }, 2000);
    }
  }

  static modalListeners() {
    const fileManager = document.getElementById('file-manager');
    const blackout = document.getElementById('blackout');
    const clip = document.getElementById('clip');
    const modals = document.querySelectorAll('.modal');
    const lock = document.getElementById('lock');
    clip.addEventListener('click', () => {
      fileManager.classList.remove('hidden');
      blackout.classList.remove('hidden');
    });
    blackout.addEventListener('click', () => {
      blackout.classList.add('hidden');
      modals.forEach((x) => x.classList.add('hidden'));
    });
    lock.addEventListener('click', () => {
      document.getElementById('secret-modal').classList.remove('hidden');
      blackout.classList.remove('hidden');
    });
  }

  readFile(ws, file) {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const fileType = App.getFileType(file.name);
      if (fileType === null) return;
      const date = moment.tz('Europe/Moscow').format('kk:mm DD.MM.YYYY');
      const msg = {
        type: fileType,
        message: reader.result,
        username: this.username,
        date,
      };
      ws.send(JSON.stringify(msg));
    });
    reader.readAsDataURL(file);
  }

  imageUploadListener(ws) {
    const input = document.getElementById('chat-file');
    const fileManager = document.getElementById('file-manager');
    const blackout = document.getElementById('blackout');
    input.addEventListener('input', () => {
      this.readFile(ws, input.files[0]);
      input.value = '';
      fileManager.classList.add('hidden');
      blackout.classList.add('hidden');
    });
  }

  dragEventListener(ws) {
    const droparea = document.getElementById('droparea');
    const fileManager = document.getElementById('file-manager');
    const blackout = document.getElementById('blackout');
    droparea.addEventListener('dragover', (evt) => {
      evt.preventDefault();
      droparea.style.borderColor = '#0f0';
    });
    droparea.addEventListener('dragleave', () => {
      droparea.style.borderColor = '#616161';
    });
    droparea.addEventListener('drop', (evt) => {
      evt.preventDefault();
      droparea.style.borderColor = '#616161';
      this.readFile(ws, evt.dataTransfer.files[0]);
      fileManager.classList.add('hidden');
      blackout.classList.add('hidden');
    });
  }

  chatScrollListener() {
    const chat = document.querySelector('.chat');
    chat.addEventListener('scroll', () => {
      const top = chat.scrollTop;
      const pos = chat.scrollHeight - chat.clientHeight;
      const curr = top / pos;
      if (curr === 0) {
        this.renderSomeMessages();
      }
    });
  }

  static scrollChat(num) {
    const chat = document.querySelector('.chat');
    chat.scrollBy(0, num || chat.scrollHeight);
  }

  clearChat() {
    const chat = document.querySelector('.chat');
    chat.innerHTML = '';
    this.messageCount = 0;
  }

  static getFileType(fileName) {
    if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image';
    if (fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.webm')) return 'audio';
    if (fileName.endsWith('.mp4')) return 'video';
    return null;
  }
}
