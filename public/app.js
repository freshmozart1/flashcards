let deck = [];
let flippedCardId = null;

const VISIBLE = 5;

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  const container = document.getElementById('stack-container');
  const counter   = document.getElementById('deck-counter');
  const emptyState = document.getElementById('empty-state');

  container.innerHTML = '';

  if (deck.length === 0) {
    emptyState.classList.remove('hidden');
    counter.textContent = '';
    return;
  }

  emptyState.classList.add('hidden');
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
      <p class="answer-text">${escapeHtml(card.back)}</p>
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

document.getElementById('stack-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  if (btn.dataset.action === 'wrong')   handleWrong();
  if (btn.dataset.action === 'correct') handleCorrect();
});

function handleWrong() {
  const [card] = deck.splice(0, 1);
  const at = Math.min(4, deck.length);
  deck.splice(at, 0, card);
  flippedCardId = null;
  render();
}

function handleCorrect() {
  const [card] = deck.splice(0, 1);
  deck.push(card);
  flippedCardId = null;
  render();
}

document.getElementById('restart-btn').addEventListener('click', async () => {
  document.getElementById('empty-state').classList.add('hidden');
  await loadDeck();
  render();
});

async function loadDeck() {
  const res = await fetch('/cards.json');
  deck = await res.json();
}

(async () => {
  await loadDeck();
  render();
})();
