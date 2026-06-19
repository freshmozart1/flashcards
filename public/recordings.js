function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(filename) {
  // Parse "3_20260619_142305.webm" → "19 Jun 2026, 14:23"
  const base = filename.replace(/\.(webm|mp4)$/, '');
  const parts = base.split('_');
  const datePart = parts[parts.length - 2];
  const timePart = parts[parts.length - 1];
  const y  = datePart.slice(0, 4);
  const mo = datePart.slice(4, 6);
  const d  = datePart.slice(6, 8);
  const h  = timePart.slice(0, 2);
  const min = timePart.slice(2, 4);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(mo) - 1]} ${y}, ${h}:${min}`;
}

(async () => {
  const container = document.getElementById('recordings-list');

  let recordings;
  try {
    const res = await fetch('/api/recordings');
    recordings = await res.json();
  } catch {
    container.innerHTML = '<p class="no-recordings">Could not load recordings.</p>';
    return;
  }

  if (recordings.length === 0) {
    container.innerHTML = '<p class="no-recordings">No recordings yet — go study some cards!</p>';
    return;
  }

  // Group by cardId preserving sort order from server (cardId asc, filename desc within)
  const byCard = new Map();
  for (const r of recordings) {
    if (!byCard.has(r.cardId)) byCard.set(r.cardId, { front: r.cardFront, list: [] });
    byCard.get(r.cardId).list.push(r);
  }

  for (const [, group] of byCard) {
    const section = document.createElement('section');
    section.className = 'recording-card';

    const heading = document.createElement('h2');
    heading.className = 'recording-card-front';
    heading.textContent = group.front;
    section.appendChild(heading);

    const ul = document.createElement('ul');
    ul.className = 'recording-list';

    for (const r of group.list) {
      const li = document.createElement('li');
      li.className = 'recording-item';

      const date = document.createElement('span');
      date.className = 'recording-date';
      date.textContent = formatDate(r.filename);

      const video = document.createElement('video');
      video.className = 'recording-video';
      video.src = r.url;
      video.controls = true;
      video.setAttribute('playsinline', '');

      li.appendChild(date);
      li.appendChild(video);
      ul.appendChild(li);
    }

    section.appendChild(ul);
    container.appendChild(section);
  }
})();
