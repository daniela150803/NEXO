// NexoVoz - Asistente Académico por Voz

let currentScreen = 'home';
let currentCommand = 'resumen';
let isListening = false;
let recognition = null;
let typingInterval = null;
let speechTimeout = null;
let processingTimeout = null;
let recognitionRestartTimer = null;
let finalTranscriptHandled = false;
let recognitionFatalError = false;
let currentUtterance = null;
let isSpeakingResult = false;

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
  if (speechTimeout) clearTimeout(speechTimeout);
  if (processingTimeout) clearTimeout(processingTimeout);
  if (typingInterval) clearInterval(typingInterval);
  if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
  speechTimeout = processingTimeout = typingInterval = recognitionRestartTimer = null;
}

function updateListeningMessage(title, subtitle, transcript) {
  const transcriptEl = document.getElementById('transcript-text');
  const statusHeader = document.querySelector('#listening-screen .status-header h2');
  const statusSub = document.querySelector('#listening-screen .status-header p');

  if (statusHeader && title) statusHeader.textContent = title;
  if (statusSub && subtitle) statusSub.textContent = subtitle;
  if (transcriptEl && transcript) transcriptEl.textContent = transcript;
}

function stopRecognition() {
  isListening = false;
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }

  if (recognition) {
    try {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch (_) {}
    recognition = null;
  }
}

function startListening() {
  clearTimeouts();
  stopRecognition();

  isListening = true;
  finalTranscriptHandled = false;
  recognitionFatalError = false;

  const hasSpeech = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);

  if (!hasSpeech) {
    updateListeningMessage(
      'Voz no disponible',
      'Este navegador no soporta Web Speech API. Puedes escribir tu solicitud abajo.',
      'Escribe tu solicitud en el campo inferior.'
    );
    return;
  }

  startSpeechRecognition();
}

function startSpeechRecognition() {
  if (!isListening || currentScreen !== 'listening') return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'es-CO';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognitionFatalError = false;
    updateListeningMessage('Escuchando...', 'Habla con claridad y naturalidad', 'Escuchando...');
  };

  recognition.onresult = (event) => {
    if (finalTranscriptHandled) return;

    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript || '';
      if (event.results[i].isFinal) final += text;
      else interim += text;
    }

    const display = (final || interim).trim();
    const transcriptEl = document.getElementById('transcript-text');

    if (transcriptEl && display) {
      if (typingInterval) clearInterval(typingInterval);
      transcriptEl.textContent = display;
    }

    if (final.trim()) {
      finalTranscriptHandled = true;
      isListening = false;
      updateListeningMessage('Procesando...', 'Analizando tu solicitud con IA', final.trim());

      const cmd = detectCommand(final);
      addToHistory(cmd, final.trim());
      processingTimeout = setTimeout(() => navigateToResult(cmd), 1200);
    }
  };

  recognition.onerror = (event) => {
    const errorType = event && event.error ? event.error : 'unknown';

    if (errorType === 'no-speech') {
      updateListeningMessage('No detecté audio', 'Vuelve a hablar o escribe tu solicitud abajo.', 'Esperando una nueva frase...');
      recognitionFatalError = false;
      return;
    }

    if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
      recognitionFatalError = true;
      isListening = false;
      updateListeningMessage('Permiso requerido', 'Activa el micrófono en el navegador o escribe tu solicitud abajo.', 'Micrófono bloqueado por el navegador.');
      return;
    }

    if (errorType === 'audio-capture') {
      recognitionFatalError = true;
      isListening = false;
      updateListeningMessage('Micrófono no detectado', 'Revisa el dispositivo de entrada o escribe tu solicitud abajo.', 'No se encontró un micrófono activo.');
      return;
    }

    if (errorType === 'network') {
      recognitionFatalError = true;
      isListening = false;
      updateListeningMessage('Servicio de voz no disponible', 'La Web Speech API depende del navegador y puede requerir conexión. Escribe tu solicitud abajo.', 'El reconocimiento de voz no respondió.');
      return;
    }

    updateListeningMessage('No pude escuchar bien', 'Inténtalo de nuevo o escribe tu solicitud abajo.', 'Error de reconocimiento.');
  };

  recognition.onend = () => {
    recognition = null;

    if (!isListening || currentScreen !== 'listening' || finalTranscriptHandled || recognitionFatalError || processingTimeout) {
      return;
    }

    recognitionRestartTimer = setTimeout(() => {
      if (isListening && currentScreen === 'listening' && !finalTranscriptHandled) {
        startSpeechRecognition();
      }
    }, 450);
  };

  try {
    recognition.start();
  } catch (error) {
    recognitionFatalError = true;
    updateListeningMessage(
      'No pude iniciar el micrófono',
      'Abre el archivo desde localhost o revisa los permisos del navegador. También puedes escribir abajo.',
      'Reconocimiento de voz detenido.'
    );
    console.error('Speech recognition start error:', error);
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


// ─── Result action buttons ─────────────────────────────────────────────────

function getActiveResultScreen() {
  const active = document.querySelector('.screen.active');
  if (!active || !active.id || !active.id.startsWith('results-')) return null;
  return active;
}

function getResultType(screen) {
  if (!screen || !screen.id) return '';
  if (screen.id.includes('resumen')) return 'resumen';
  if (screen.id.includes('tareas')) return 'tareas';
  if (screen.id.includes('mapa')) return 'mapa';
  return 'resultado';
}

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function sanitizeFilename(text) {
  return normalizeText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'resultado';
}

function getResultText(screen = getActiveResultScreen()) {
  if (!screen) return '';

  const title = normalizeText(screen.querySelector('.results-title')?.textContent);
  const subtitle = normalizeText(screen.querySelector('.results-subtitle')?.textContent);
  const type = getResultType(screen);
  const lines = [];

  if (title) lines.push(title);
  if (subtitle) lines.push(subtitle);
  if (title || subtitle) lines.push('');

  if (type === 'tareas') {
    screen.querySelectorAll('.priority-section').forEach(section => {
      const priority = normalizeText(section.querySelector('.priority-badge')?.textContent);
      if (priority) lines.push(`${priority}:`);

      section.querySelectorAll('.task-item').forEach(item => {
        const checked = item.querySelector('.task-checkbox')?.classList.contains('checked') ? '[x]' : '[ ]';
        const task = normalizeText(item.querySelector('.task-text')?.textContent);
        if (task) lines.push(`${checked} ${task}`);
      });
      lines.push('');
    });
  } else {
    screen.querySelectorAll('.result-card').forEach(card => {
      const cardTitle = normalizeText(card.querySelector('.result-card-title')?.textContent);
      if (cardTitle) lines.push(`${cardTitle}:`);

      const paragraph = normalizeText(card.querySelector('.result-card-text')?.textContent);
      if (paragraph) lines.push(paragraph);

      card.querySelectorAll('.result-list li').forEach(li => {
        const item = normalizeText(li.textContent);
        if (item) lines.push(`• ${item}`);
      });
      lines.push('');
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function showToast(message, type = 'success') {
  let toast = document.getElementById('nexovoz-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nexovoz-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  const icon = type === 'error' ? 'fa-circle-exclamation' : type === 'info' ? 'fa-circle-info' : 'fa-circle-check';
  toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
  toast.classList.remove('show', 'toast-error', 'toast-info');
  if (type === 'error') toast.classList.add('toast-error');
  if (type === 'info') toast.classList.add('toast-info');

  window.setTimeout(() => toast.classList.add('show'), 20);
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function saveCurrentResult() {
  const screen = getActiveResultScreen();
  const text = getResultText(screen);

  if (!screen || !text) {
    showToast('No hay un resultado para guardar.', 'error');
    return;
  }

  const title = normalizeText(screen.querySelector('.results-title')?.textContent) || 'Resultado NexoVoz';
  const type = getResultType(screen);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const fileContent = [
    'NexoVoz - Resultado académico',
    `Tipo: ${type}`,
    `Fecha: ${now.toLocaleString('es-CO')}`,
    '',
    text
  ].join('\n');

  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexovoz-${type}-${sanitizeFilename(title)}-${date}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast('Resultado guardado como archivo TXT.');
}

function setListenButtonsState(isActive) {
  document.querySelectorAll('[data-action="listen"]').forEach(btn => {
    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');

    btn.classList.toggle('active-action', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    if (icon) icon.className = isActive ? 'fas fa-volume-xmark' : 'fas fa-volume-high';
    if (label) label.textContent = isActive ? 'Detener' : 'Escuchar';
  });
}

function getSpanishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find(v => /es[-_]CO/i.test(v.lang)) ||
         voices.find(v => /^es[-_]/i.test(v.lang)) ||
         voices.find(v => /spanish|español/i.test(v.name)) ||
         null;
}

function stopResultSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  isSpeakingResult = false;
  setListenButtonsState(false);
}

function speakResultText(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    showToast('Este navegador no permite lectura por voz.', 'error');
    return;
  }

  stopResultSpeech();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-CO';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voice = getSpanishVoice();
  if (voice) utterance.voice = voice;

  utterance.onend = stopResultSpeech;
  utterance.onerror = () => {
    stopResultSpeech();
    showToast('No se pudo reproducir la lectura por voz.', 'error');
  };

  currentUtterance = utterance;
  isSpeakingResult = true;
  setListenButtonsState(true);
  window.speechSynthesis.speak(utterance);
  showToast('Leyendo el resultado en voz alta.', 'info');
}

function toggleReadCurrentResult() {
  const text = getResultText();

  if (!text) {
    showToast('No hay contenido para escuchar.', 'error');
    return;
  }

  if (isSpeakingResult || window.speechSynthesis?.speaking) {
    stopResultSpeech();
    showToast('Lectura detenida.', 'info');
    return;
  }

  speakResultText(text);
}

function markResultAsImproved(screen) {
  screen.dataset.improved = 'true';

  const badge = screen.querySelector('.success-badge span');
  const subtitle = screen.querySelector('.results-subtitle');

  if (badge) {
    badge.textContent = getResultType(screen) === 'tareas'
      ? 'Lista mejorada exitosamente'
      : 'Resultado mejorado exitosamente';
  }

  if (subtitle) {
    subtitle.textContent = getResultType(screen) === 'tareas'
      ? 'Tu lista fue organizada con mayor claridad, prioridad y criterio de ejecución'
      : 'Versión refinada con mejor redacción, jerarquía y precisión académica';
  }

  screen.querySelectorAll('[data-action="improve"]').forEach(btn => {
    btn.classList.add('active-action');
    const label = btn.querySelector('span');
    if (label) label.textContent = 'Mejorado';
  });
}

function improveResumen(screen) {
  const cards = screen.querySelectorAll('.result-card');
  const idea = cards[0]?.querySelector('.result-card-text');
  const list = cards[1]?.querySelector('.result-list');
  const conclusion = cards[2]?.querySelector('.result-card-text');

  if (idea) {
    idea.textContent = 'Las energías renovables son fuentes limpias obtenidas de recursos naturales como el sol, el viento y el agua. Su importancia radica en que reducen la dependencia de combustibles fósiles, disminuyen emisiones contaminantes y fortalecen modelos energéticos más sostenibles.';
  }

  if (list) {
    list.innerHTML = `
      <li>Energía solar: transforma la radiación del sol en electricidad o calor útil</li>
      <li>Energía eólica: aprovecha la fuerza del viento mediante aerogeneradores</li>
      <li>Energía hidráulica: utiliza el movimiento del agua para generar electricidad</li>
      <li>Impacto ambiental: contribuye a reducir emisiones de CO₂</li>
      <li>Valor estratégico: favorece ahorro, resiliencia energética e innovación tecnológica</li>
    `;
  }

  if (conclusion) {
    conclusion.textContent = 'La transición hacia energías renovables no solo responde a una necesidad ambiental, sino también a una oportunidad económica y tecnológica. Su adopción permite avanzar hacia sistemas energéticos más eficientes, responsables y preparados para los retos climáticos actuales.';
  }
}

function improveTareas(screen) {
  const taskTexts = Array.from(screen.querySelectorAll('.task-text'));
  const improved = [
    'Completar la investigación bibliográfica y registrar mínimo cinco fuentes confiables',
    'Redactar la introducción y el marco teórico con estructura argumentativa clara',
    'Enviar el primer borrador al profesor y solicitar retroalimentación puntual',
    'Diseñar la presentación en PowerPoint con máximo diez diapositivas y jerarquía visual',
    'Preparar el guion de exposición oral con tiempos asignados por sección',
    'Revisar formato APA, citación y consistencia de la bibliografía',
    'Crear índice y tabla de contenidos después de cerrar la versión final del documento'
  ];

  taskTexts.forEach((node, index) => {
    if (improved[index]) node.textContent = improved[index];
  });
}

function improveCurrentResult() {
  const screen = getActiveResultScreen();

  if (!screen) {
    showToast('No hay un resultado para mejorar.', 'error');
    return;
  }

  if (screen.dataset.improved === 'true') {
    showToast('Este resultado ya está mejorado.', 'info');
    return;
  }

  stopResultSpeech();

  const type = getResultType(screen);
  if (type === 'resumen') improveResumen(screen);
  else if (type === 'tareas') improveTareas(screen);
  else {
    showToast('Este tipo de resultado todavía no tiene mejora automática.', 'error');
    return;
  }

  markResultAsImproved(screen);
  showToast('Contenido mejorado correctamente.');
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
    btn.addEventListener('click', saveCurrentResult);
  });

  document.querySelectorAll('[data-action="listen"]').forEach(btn => {
    btn.addEventListener('click', () => toggleReadCurrentResult(btn));
  });

  document.querySelectorAll('[data-action="improve"]').forEach(btn => {
    btn.addEventListener('click', () => improveCurrentResult(btn));
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
