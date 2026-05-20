// NexoVoz - Asistente Académico por Voz

let currentScreen = 'home';
let currentCommand = 'resumen';
let isListening = false;
let recognition = null;
let typingInterval = null;
let speechTimeout = null;
let processingTimeout = null;

// ─── History ───────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('nexovoz_history') || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem('nexovoz_history', JSON.stringify(history));
}

function addToHistory(command, transcript) {
  const history = loadHistory();
  const labels = { resumen: 'Resumen', tareas: 'Lista de tareas', mapa: 'Mapa conceptual' };
  const icons  = { resumen: 'fa-book', tareas: 'fa-list-check', mapa: 'fa-diagram-project' };
  const entry = {
    id: Date.now(),
    command,
    label: labels[command] || command,
    icon: icons[command] || 'fa-microphone',
    transcript,
    date: new Date().toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  };
  history.unshift(entry);
  if (history.length > 50) history.pop();
  saveHistory(history);
}

function renderHistory() {
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if (!list || !empty) return;

  const history = loadHistory();

  if (history.length === 0) {
    list.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  list.style.display  = 'flex';
  empty.style.display = 'none';

  const colorMap = {
    resumen: 'gradient-orange-rose',
    tareas:  'gradient-cyan-teal',
    mapa:    'gradient-lime-emerald'
  };

  list.innerHTML = history.map(entry => `
    <div class="history-item" data-command="${entry.command}" data-transcript="${entry.transcript}">
      <div class="history-item-border ${colorMap[entry.command] || 'gradient-orange-rose'}"></div>
      <div class="history-item-content">
        <div class="history-item-icon ${colorMap[entry.command] || 'gradient-orange-rose'}">
          <i class="fas ${entry.icon}"></i>
        </div>
        <div class="history-item-info">
          <span class="history-item-label">${entry.label}</span>
          <span class="history-item-transcript">${entry.transcript}</span>
          <span class="history-item-date"><i class="fas fa-clock"></i> ${entry.date}</span>
        </div>
        <div class="history-item-arrow">→</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const cmd = item.getAttribute('data-command');
      currentCommand = cmd;
      navigateToResult(cmd);
    });
  });
}

// ─── Navigation ────────────────────────────────────────────────────────────

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`${screenName}-screen`);
  if (screen) {
    screen.classList.add('active');
    currentScreen = screenName;
    if (screenName === 'history') renderHistory();
  }
}

function navigateToResult(command) {
  clearTimeouts();
  stopRecognition();

  if (command === 'resumen') showScreen('results-resumen');
  else if (command === 'tareas') showScreen('results-tareas');
  else showScreen('error');
}

// ─── Keyword detection ─────────────────────────────────────────────────────

function detectCommand(text) {
  const t = text.toLowerCase();
  if (/resumen|resume|resumir|síntesis|sintesis|sintetiza|ideas clave|puntos clave|nota|apuntes/.test(t))
    return 'resumen';
  if (/tarea|tareas|lista|organiz|actividad|pendiente|checklist|to-do|agenda|plan/.test(t))
    return 'tareas';
  if (/mapa|conceptual|diagrama|esquema|conecta|visualiz/.test(t))
    return 'mapa';
  return currentCommand !== 'listening' ? currentCommand : 'resumen';
}

// ─── Listening flow ────────────────────────────────────────────────────────

function handleCommand(command) {
  currentCommand = command;
  showScreen('listening');
  resetListeningUI();
  startListening();
}

function resetListeningUI() {
  const transcriptEl = document.getElementById('transcript-text');
  const statusHeader = document.querySelector('#listening-screen .status-header h2');
  const statusSub    = document.querySelector('#listening-screen .status-header p');
  const inputEl      = document.getElementById('text-command-input');

  if (transcriptEl)  transcriptEl.textContent = 'Esperando...';
  if (statusHeader)  statusHeader.textContent  = 'Escuchando...';
  if (statusSub)     statusSub.textContent     = 'Habla con claridad o escribe tu solicitud';
  if (inputEl)       inputEl.value             = '';
}

function clearTimeouts() {
  if (speechTimeout)    clearTimeout(speechTimeout);
  if (processingTimeout) clearTimeout(processingTimeout);
  if (typingInterval)   clearInterval(typingInterval);
  speechTimeout = processingTimeout = typingInterval = null;
}

function stopRecognition() {
  isListening = false;
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
}

function startListening() {
  clearTimeouts();
  stopRecognition();
  isListening = true;

  const hasSpeech = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
  if (hasSpeech) {
    startSpeechRecognition();
  }
  // No auto-navigate — user must speak or type
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const transcriptEl = document.getElementById('transcript-text');
  const statusHeader = document.querySelector('#listening-screen .status-header h2');
  const statusSub    = document.querySelector('#listening-screen .status-header p');

  recognition.onstart = () => {
    if (statusHeader) statusHeader.textContent = 'Escuchando...';
    if (statusSub)    statusSub.textContent    = 'Habla con claridad y naturalidad';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final   = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }

    const display = final || interim;
    if (transcriptEl && display) {
      if (typingInterval) clearInterval(typingInterval);
      transcriptEl.textContent = display;
    }

    if (final) {
      if (statusHeader) statusHeader.textContent = 'Procesando...';
      if (statusSub)    statusSub.textContent    = 'Analizando tu solicitud con IA';
      const cmd = detectCommand(final);
      addToHistory(cmd, final);
      processingTimeout = setTimeout(() => navigateToResult(cmd), 1200);
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      if (statusHeader) statusHeader.textContent = 'Micrófono no disponible';
      if (statusSub)    statusSub.textContent    = 'Escribe tu solicitud abajo';
    }
  };

  recognition.onend = () => {
    if (isListening && currentScreen === 'listening') {
      // If nothing was processed yet, restart recognition
      if (!processingTimeout) {
        try { recognition.start(); } catch (_) {}
      }
    }
  };

  try {
    recognition.start();
  } catch (error) {
    console.log('Speech recognition start error:', error);
  }
}

// ─── Text input handling ────────────────────────────────────────────────────

function handleTextSubmit() {
  const inputEl = document.getElementById('text-command-input');
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  clearTimeouts();
  stopRecognition();

  const transcriptEl = document.getElementById('transcript-text');
  const statusHeader = document.querySelector('#listening-screen .status-header h2');
  const statusSub    = document.querySelector('#listening-screen .status-header p');

  if (transcriptEl) typeText(transcriptEl, text);
  if (statusHeader) statusHeader.textContent = 'Procesando...';
  if (statusSub)    statusSub.textContent    = 'Analizando tu solicitud con IA';

  const cmd = detectCommand(text);
  addToHistory(cmd, text);
  processingTimeout = setTimeout(() => navigateToResult(cmd), 1400);
}

// ─── Type animation ─────────────────────────────────────────────────────────

function typeText(element, text) {
  if (typingInterval) clearInterval(typingInterval);
  element.textContent = '';
  let i = 0;
  typingInterval = setInterval(() => {
    if (i < text.length) {
      element.textContent = text.substring(0, i + 1);
      i++;
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
    }
  }, 40);
}

// ─── Particles & waves ──────────────────────────────────────────────────────

function createParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * window.innerWidth + 'px';
    p.style.top  = Math.random() * window.innerHeight + 'px';
    p.style.animationDuration = (Math.random() * 10 + 10) + 's';
    p.style.animationDelay   = (Math.random() * 5) + 's';
    container.appendChild(p);
    animateParticle(p);
  }
}

function animateParticle(p) {
  const startY = parseFloat(p.style.top);
  const endY   = Math.random() * window.innerHeight;
  const dur    = parseFloat(p.style.animationDuration) * 1000;
  let t0 = null;

  (function step(ts) {
    if (!t0) t0 = ts;
    const prog = (ts - t0) / dur;
    if (prog < 1) {
      p.style.top = (startY + (endY - startY) * prog) + 'px';
      requestAnimationFrame(step);
    } else {
      p.style.top = Math.random() * window.innerHeight + 'px';
      t0 = null;
      requestAnimationFrame(step);
    }
  })(performance.now());
}

function initializeWaveBars() {
  const container = document.querySelector('.wave-bars');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    bar.style.height = '20%';
    container.appendChild(bar);
  }
  animateWaveBars();
}

function animateWaveBars() {
  document.querySelectorAll('.wave-bar').forEach((bar, idx) => {
    setTimeout(() => {
      (function animate() {
        const min = 10, max = 90;
        const dur = 400 + Math.random() * 600;
        const from = parseFloat(bar.style.height) || min;
        const to   = Math.random() * (max - min) + min;
        let t0 = null;

        (function step(ts) {
          if (!t0) t0 = ts;
          const p = Math.min((ts - t0) / dur, 1);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          bar.style.height = (from + (to - from) * e) + '%';
          if (p < 1) requestAnimationFrame(step);
          else setTimeout(animate, 0);
        })(performance.now());
      })();
    }, idx * 30);
  });
}

// ─── Event listeners ─────────────────────────────────────────────────────────

function setupEventListeners() {
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('click', e => {
      const cmd = e.currentTarget.getAttribute('data-command');
      handleCommand(cmd);
    });
  });

  document.querySelectorAll('[data-action="mic"]').forEach(btn => {
    btn.addEventListener('click', () => handleCommand('listening'));
  });

  document.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => {
      clearTimeouts();
      stopRecognition();
      showScreen('home');
    });
  });

  document.querySelectorAll('[data-action="home"]').forEach(btn => {
    btn.addEventListener('click', () => {
      clearTimeouts();
      stopRecognition();
      showScreen('home');
    });
  });

  document.querySelectorAll('[data-action="retry"]').forEach(btn => {
    btn.addEventListener('click', () => handleCommand(currentCommand));
  });

  document.querySelectorAll('[data-action="new-command"]').forEach(btn => {
    btn.addEventListener('click', () => {
      clearTimeouts();
      stopRecognition();
      showScreen('home');
    });
  });

  document.querySelectorAll('[data-action="history"]').forEach(btn => {
    btn.addEventListener('click', () => showScreen('history'));
  });

  const sendBtn   = document.getElementById('text-send-btn');
  const inputEl   = document.getElementById('text-command-input');
  const clearBtn  = document.getElementById('clear-history-btn');

  if (sendBtn)  sendBtn.addEventListener('click', handleTextSubmit);
  if (inputEl)  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleTextSubmit();
  });

  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('¿Eliminar todo el historial?')) {
      localStorage.removeItem('nexovoz_history');
      renderHistory();
    }
  });

  document.querySelectorAll('[data-action="save"]').forEach(btn => {
    btn.addEventListener('click', () => alert('Guardado en tu dispositivo ✓'));
  });
  document.querySelectorAll('[data-action="listen"]').forEach(btn => {
    btn.addEventListener('click', () => alert('Reproducción de audio próximamente'));
  });
  document.querySelectorAll('[data-action="improve"]').forEach(btn => {
    btn.addEventListener('click', () => alert('Mejora con IA próximamente'));
  });

  document.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', function() {
      const cb = this.querySelector('.task-checkbox');
      if (cb) {
        const active = cb.classList.toggle('checked');
        cb.style.backgroundColor = active ? 'rgba(249,115,22,0.4)' : '';
        cb.style.borderColor     = active ? 'var(--orange-400)' : '';
      }
    });
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

function initApp() {
  showScreen('home');
  createParticles();
  initializeWaveBars();
  setupEventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

window.addEventListener('resize', () => {
  const c = document.getElementById('particles-container');
  if (c) { c.innerHTML = ''; createParticles(); }
});
