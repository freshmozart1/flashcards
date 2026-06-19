let deck = [];
let flippedCardId = null;

const VISIBLE = 5;

// ── Recorder state ──────────────────────────────────────────
let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let isRecording = false;
let latestRecordingUrl = null;
let uploadPending = null; // Promise that resolves when upload completes

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  const container  = document.getElementById('stack-container');
  const counter    = document.getElementById('deck-counter');
  const emptyState = document.getElementById('empty-state');
  const btnRecord  = document.getElementById('btn-record');

  container.innerHTML = '';

  if (deck.length === 0) {
    emptyState.classList.remove('hidden');
    counter.textContent = '';
    btnRecord.disabled = true;
    return;
  }

  emptyState.classList.add('hidden');
  btnRecord.disabled = false;
  counter.textContent = `${deck.length} card${deck.length !== 1 ? 's' : ''} remaining`;

  const visible = deck.slice(0, VISIBLE);

  // Render back-to-front so the top card (index 0) is the last DOM child
  // and therefore sits on top in natural paint order (z-index handles it too).
  for (let i = visible.length - 1; i >= 0; i--) {
    container.appendChild(createCard(visible[i], i));
  }
}

function createCard(card, stackIndex) {
  const wrapper = document.createElement('div');
  wrapper.className = `card-wrapper stack-pos-${Math.min(stackIndex, 4)}`;
  wrapper.dataset.id = card.id;

  const inner = document.createElement('div');
  inner.className = 'card-inner';
  if (card.id === flippedCardId) inner.classList.add('flipped');

  // Front
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  front.innerHTML = `<p class="question-text">${escapeHtml(card.front)}</p>`;

  // Back
  const back = document.createElement('div');
  back.className = 'card-face card-back';
  back.innerHTML = `
    <div class="answer-scroll">
      <ul class="answer-list">${card.back.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="action-buttons">
      <button class="btn-wrong"   data-action="wrong"   data-id="${card.id}" aria-label="Wrong">✘</button>
      <button class="btn-correct" data-action="correct" data-id="${card.id}" aria-label="Correct">✔</button>
    </div>
  `;

  inner.appendChild(front);
  inner.appendChild(back);
  wrapper.appendChild(inner);

  if (stackIndex === 0) {
    wrapper.addEventListener('click', handleCardClick);
  }

  return wrapper;
}

function handleCardClick(e) {
  if (e.target.closest('[data-action]')) return;

  const cardId = Number(e.currentTarget.dataset.id);
  flippedCardId = (flippedCardId === cardId) ? null : cardId;
  render();
}

document.getElementById('stack-container').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  // Stop an active recording before advancing the card
  if (isRecording) {
    await stopRecording();
    if (uploadPending) await uploadPending;
  }

  if (btn.dataset.action === 'wrong')   await handleWrong();
  if (btn.dataset.action === 'correct') await handleCorrect();
});

async function handleWrong() {
  const [card] = deck.splice(0, 1);
  const at = Math.min(4, deck.length);
  deck.splice(at, 0, card);
  flippedCardId = null;
  render();
  await loadLatestRecording(deck[0]?.id);
}

async function handleCorrect() {
  const [card] = deck.splice(0, 1);
  deck.push(card);
  flippedCardId = null;
  render();
  await loadLatestRecording(deck[0]?.id);
}

document.getElementById('restart-btn').addEventListener('click', async () => {
  document.getElementById('empty-state').classList.add('hidden');
  await loadDeck();
  render();
  await loadLatestRecording(deck[0]?.id);
});

async function loadDeck() {
  const res = await fetch('/cards.json');
  deck = await res.json();
}

// ── Recorder ────────────────────────────────────────────────

function initRecorder() {
  const btnRecord = document.getElementById('btn-record');

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    btnRecord.disabled = true;
    btnRecord.title = 'Camera requires HTTPS';
    showRecordError('Camera unavailable — use the https:// URL.');
    return;
  }

  btnRecord.addEventListener('click', async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  });

  document.getElementById('btn-play-latest').addEventListener('click', () => {
    if (!latestRecordingUrl) return;
    const video = document.getElementById('playback-video');
    video.src = latestRecordingUrl;
    document.getElementById('video-overlay').classList.remove('hidden');
    video.play();
  });

  const overlay = document.getElementById('video-overlay');
  document.getElementById('btn-close-video').addEventListener('click', closePlayback);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePlayback();
  });
}

function closePlayback() {
  const video = document.getElementById('playback-video');
  video.pause();
  video.src = '';
  document.getElementById('video-overlay').classList.add('hidden');
}

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showRecordError('Camera blocked — allow it in browser/system settings.');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      showRecordError('No camera found on this device.');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      showRecordError('Camera is in use by another app.');
    } else {
      showRecordError(`Camera error: ${err.message}`);
    }
    return;
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
  recordedChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    uploadPending = uploadRecording().finally(() => { uploadPending = null; });
  };

  mediaRecorder.start();
  isRecording = true;

  const preview = document.getElementById('live-preview');
  preview.srcObject = mediaStream;
  preview.classList.add('visible');

  const btnRecord = document.getElementById('btn-record');
  btnRecord.classList.add('is-recording');
  btnRecord.setAttribute('aria-label', 'Stop recording');
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve();
      return;
    }

    mediaRecorder.addEventListener('stop', resolve, { once: true });
    mediaRecorder.stop();
    isRecording = false;

    const preview = document.getElementById('live-preview');
    preview.classList.remove('visible');
    preview.srcObject = null;

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    const btnRecord = document.getElementById('btn-record');
    btnRecord.classList.remove('is-recording');
    btnRecord.setAttribute('aria-label', 'Start recording');
  });
}

async function uploadRecording() {
  const mimeType = mediaRecorder.mimeType;
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];

  const cardId = deck[0]?.id;
  if (cardId == null) return;

  try {
    const res = await fetch(`/api/recordings?cardId=${cardId}&ext=${ext}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });

    if (res.ok) {
      const { url } = await res.json();
      latestRecordingUrl = url;
      document.getElementById('btn-play-latest').classList.remove('hidden');
    }
  } catch {
    // Upload failed silently — the recording is lost but the app remains usable
  }
}

async function loadLatestRecording(cardId) {
  const btnPlay = document.getElementById('btn-play-latest');

  if (cardId == null) {
    latestRecordingUrl = null;
    btnPlay.classList.add('hidden');
    return;
  }

  try {
    const res = await fetch('/api/recordings');
    const recordings = await res.json();
    const forCard = recordings
      .filter(r => r.cardId === cardId)
      .sort((a, b) => b.filename.localeCompare(a.filename));

    if (forCard.length > 0) {
      latestRecordingUrl = forCard[0].url;
      btnPlay.classList.remove('hidden');
    } else {
      latestRecordingUrl = null;
      btnPlay.classList.add('hidden');
    }
  } catch {
    latestRecordingUrl = null;
    btnPlay.classList.add('hidden');
  }
}

function showRecordError(msg) {
  const widget = document.getElementById('recorder-widget');
  let err = widget.querySelector('.record-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'record-error';
    widget.prepend(err);
  }
  err.textContent = msg;
  setTimeout(() => err.remove(), 4000);
}

// ── Init ─────────────────────────────────────────────────────

(async () => {
  await loadDeck();
  render();
  initRecorder();
  await loadLatestRecording(deck[0]?.id);
})();
