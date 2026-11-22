/**
 * Covers the game in a tab that another tab has taken over (see core/tabLock): this tab no
 * longer saves, and 「在這裡繼續玩」 reloads it so it takes the game back.
 */
export function showTabCover(root: HTMLElement, onResume: () => void): void {
  if (root.querySelector('.tab-cover')) return;
  const box = document.createElement('div');
  box.className = 'settings tab-cover';
  const card = document.createElement('div');
  card.className = 'settings-card';
  const icon = document.createElement('div');
  icon.className = 'tab-cover-icon';
  icon.textContent = '🐔';
  const msg = document.createElement('h2');
  msg.textContent = '遊戲在另一個分頁打開了';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'set-btn tab-cover-btn';
  btn.textContent = '在這裡繼續玩';
  btn.addEventListener('click', () => onResume());
  card.append(icon, msg, btn);
  box.append(card);
  root.append(box);
}
