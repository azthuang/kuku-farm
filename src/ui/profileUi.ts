import {
  ICONS, MAX_PROFILES, canDelete, cleanName, freeIcon, type Profile, type Profiles,
} from '../core/profiles';

export interface ProfileUi {
  /** 「誰要玩？」: a card per player, 「➕ 新增」 below the limit, 「↩️ 回去繼續玩」 when canResume. */
  showPicker(p: Profiles, canResume: boolean): void;
  hidePicker(): void;
  pickerOpen(): boolean;
  onPick(cb: (id: string) => void): void;
  onResume(cb: () => void): void;
  /** The editor opened from 「➕ 新增」 was confirmed. */
  onCreate(cb: (name: string, icon: string) => void): void;
  /** The editor opened from ✏️ in the settings was confirmed. */
  onEdit(cb: (id: string, name: string, icon: string) => void): void;
  /** 「確定刪除」 was typed and 🗑️ 刪除 pressed. */
  onDelete(cb: (id: string) => void): void;
  /**
   * After a save file was read: replace `who`'s farm, or (when canAdd) put it in a new player,
   * whose name starts as `name` (from the file name; null leaves it empty).
   */
  showImport(who: Profile, canAdd: boolean, name: string | null): void;
  onImportReplace(cb: () => void): void;
  /** The 匯入成新玩家 editor was confirmed. */
  onImportNew(cb: (name: string, icon: string) => void): void;
  /** Fills the settings slot: 「👥 玩家」 and a row per player (✏️, and 🗑️ with two or more). */
  renderManage(p: Profiles): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (e instanceof HTMLButtonElement) e.type = 'button';
  return e;
}

/** An overlay in the settings look: a dimmed backdrop and a card. */
function overlay(root: HTMLElement, cls: string): { box: HTMLElement; card: HTMLElement } {
  const box = el('div', `settings ${cls}`);
  box.hidden = true;
  const card = el('div', 'settings-card');
  box.append(card);
  root.append(box);
  return { box, card };
}

export function createProfileUi(root: HTMLElement, manageSlot: HTMLElement): ProfileUi {
  let pickCb: (id: string) => void = () => {};
  let resumeCb: () => void = () => {};
  let createCb: (name: string, icon: string) => void = () => {};
  let editCb: (id: string, name: string, icon: string) => void = () => {};
  let deleteCb: (id: string) => void = () => {};
  let importReplaceCb: () => void = () => {};
  let importNewCb: (name: string, icon: string) => void = () => {};
  let profiles: Profiles | null = null;

  // ---------------------------------------------------------------- picker
  const picker = overlay(root, 'pf-picker');

  function showPicker(p: Profiles, canResume: boolean): void {
    profiles = p;
    const cards = el('div', 'pf-cards');
    for (const pr of p.list) {
      const b = el('button', 'pf-card');
      b.append(el('span', 'pf-card-icon', pr.icon), el('span', 'pf-card-name', pr.name));
      b.addEventListener('click', () => pickCb(pr.id));
      cards.append(b);
    }
    if (p.list.length < MAX_PROFILES) {
      const add = el('button', 'pf-card pf-add', '➕ 新增');
      add.addEventListener('click', () => openEditor(null));
      cards.append(add);
    }
    picker.card.replaceChildren(el('h2', '', '誰要玩？'), cards);
    if (canResume) {
      const back = el('button', 'set-btn set-close pf-resume', '↩️ 回去繼續玩');
      back.addEventListener('click', () => { hidePicker(); resumeCb(); });
      picker.card.append(back);
    }
    picker.box.hidden = false;
  }

  function hidePicker(): void {
    picker.box.hidden = true;
  }

  // ---------------------------------------------------------------- editor
  const editor = overlay(root, 'pf-editor');
  const edTitle = el('h2', '');
  const nameRow = el('label', 'set-row pf-name-row');
  const nameInput = el('input', 'pf-name');
  nameInput.type = 'text';
  nameInput.autocomplete = 'off';
  nameRow.append(el('span', '', '名字'), nameInput);
  const icons = el('div', 'pf-icons');
  const iconBtns = ICONS.map(i => {
    const b = el('button', 'pf-icon', i);
    b.addEventListener('click', () => { chosen = i; syncEditor(); });
    icons.append(b);
    return b;
  });
  const ok = el('button', 'set-btn pf-ok', '✔ 好了');
  const cancel = el('button', 'set-btn set-close pf-cancel', '取消');
  editor.card.append(edTitle, nameRow, icons, ok, cancel);
  let editing: Profile | null = null;
  /** The editor was opened from the import dialog: confirming imports into a new player. */
  let importing = false;
  let chosen = ICONS[0];

  function syncEditor(): void {
    iconBtns.forEach((b, i) => b.classList.toggle('chosen', ICONS[i] === chosen));
    ok.disabled = cleanName(nameInput.value) === null;
  }

  /** `importName` (a string or null) opens it for 匯入成新玩家, with that name filled in. */
  function openEditor(p: Profile | null, importName?: string | null): void {
    editing = p;
    importing = importName !== undefined;
    edTitle.textContent = p ? '編輯玩家' : importing ? '匯入成新玩家' : '新增玩家';
    nameInput.value = p ? p.name : (importName ?? '');
    chosen = p ? p.icon : profiles ? freeIcon(profiles) : ICONS[0];
    syncEditor();
    editor.box.hidden = false;
  }

  nameInput.addEventListener('input', syncEditor);
  cancel.addEventListener('click', () => { editor.box.hidden = true; });
  ok.addEventListener('click', () => {
    const name = cleanName(nameInput.value);
    if (name === null) return;
    editor.box.hidden = true;
    if (editing) editCb(editing.id, name, chosen);
    else if (importing) importNewCb(name, chosen);
    else createCb(name, chosen);
  });

  // ---------------------------------------------------------------- delete
  const del = overlay(root, 'pf-delete');
  const delMsg = el('p', 'pf-del-msg');
  const delHint = el('p', 'pf-del-hint', '建議先 💾 匯出存檔');
  const delInput = el('input', 'pf-del-input');
  delInput.type = 'text';
  delInput.autocomplete = 'off';
  delInput.placeholder = '請輸入「確定刪除」';
  const delOk = el('button', 'set-btn pf-del-ok', '🗑️ 刪除');
  const delCancel = el('button', 'set-btn set-close pf-del-cancel', '取消');
  del.card.append(delMsg, delHint, delInput, delOk, delCancel);
  let deleting: Profile | null = null;

  function openDelete(p: Profile): void {
    deleting = p;
    delMsg.textContent = `刪除${p.name}的農場？刪了就找不回來`;
    delInput.value = '';
    delOk.disabled = true;
    del.box.hidden = false;
  }

  delInput.addEventListener('input', () => { delOk.disabled = !canDelete(delInput.value); });
  delCancel.addEventListener('click', () => { del.box.hidden = true; delInput.value = ''; });
  delOk.addEventListener('click', () => {
    if (!deleting || !canDelete(delInput.value)) return;
    del.box.hidden = true;
    delInput.value = '';
    deleteCb(deleting.id);
  });

  // ---------------------------------------------------------------- import
  const imp = overlay(root, 'pf-import');

  function choice(cls: string, label: string, note: string): HTMLButtonElement {
    const b = el('button', `set-btn pf-imp-btn ${cls}`);
    b.append(el('span', 'pf-imp-label', label), el('span', 'pf-imp-note', note));
    return b;
  }

  function showImport(who: Profile, canAdd: boolean, name: string | null): void {
    const replace = choice('pf-imp-replace', `${who.icon} 換掉「${who.name}」的農場`,
      `${who.name}現在的進度會被取代（可以在 ⚙️ 復原）`);
    replace.addEventListener('click', () => { imp.box.hidden = true; importReplaceCb(); });
    imp.card.replaceChildren(el('h2', '', '📂 這個存檔要放在哪裡？'), replace);
    if (canAdd) {
      const add = choice('pf-imp-new', '➕ 新增成新玩家', '不會動到任何人');
      add.addEventListener('click', () => { imp.box.hidden = true; openEditor(null, name); });
      imp.card.append(add);
    }
    const cancel = el('button', 'set-btn set-close pf-imp-cancel', '取消');
    cancel.addEventListener('click', () => { imp.box.hidden = true; });
    imp.card.append(cancel);
    imp.box.hidden = false;
  }

  // ---------------------------------------------------------------- settings list
  function renderManage(p: Profiles): void {
    profiles = p;
    const rows = p.list.map(pr => {
      const row = el('div', 'set-row pf-row');
      const who = el('span', 'pf-who', `${pr.icon} ${pr.name}`);
      const edit = el('button', 'pf-edit', '✏️');
      edit.setAttribute('aria-label', `編輯${pr.name}`);
      edit.addEventListener('click', () => openEditor(pr));
      const btns = el('span', 'pf-row-btns');
      btns.append(edit);
      if (p.list.length >= 2) {
        const trash = el('button', 'pf-del', '🗑️');
        trash.setAttribute('aria-label', `刪除${pr.name}`);
        trash.addEventListener('click', () => openDelete(pr));
        btns.append(trash);
      }
      row.append(who, btns);
      return row;
    });
    manageSlot.replaceChildren(el('h3', 'pf-manage-title', '👥 玩家'), ...rows);
  }

  return {
    showPicker,
    hidePicker,
    pickerOpen: () => !picker.box.hidden,
    onPick: cb => { pickCb = cb; },
    onResume: cb => { resumeCb = cb; },
    onCreate: cb => { createCb = cb; },
    onEdit: cb => { editCb = cb; },
    onDelete: cb => { deleteCb = cb; },
    showImport,
    onImportReplace: cb => { importReplaceCb = cb; },
    onImportNew: cb => { importNewCb = cb; },
    renderManage,
  };
}
