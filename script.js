/* Словесная Алхимия — игра-собиралка слов */
(() => {
  'use strict';

  // ───────── Константы ─────────
  // Стоимость букв (по аналогии со скрэбблом, адаптировано для русского)
  const VALUES = {
    'о':1,'а':1,'е':1,'и':1,'н':1,'т':1,'с':1,'р':1,'в':1,'л':1,
    'к':2,'м':2,'д':2,'п':2,'у':2,
    'я':3,'ы':3,'ь':3,'б':3,'г':3,
    'й':4,'ч':4,
    'х':5,'з':5,'ж':5,'ш':5,'ю':5,'э':5,
    'ц':8,'щ':8,'ф':8,'ъ':10
  };

  // Частоты букв (взвешенный пул генерации)
  const POOL_WEIGHTS = {
    'о':11,'а':8,'е':8,'и':7,'н':7,'т':6,'с':5,'р':5,'в':5,'л':4,
    'к':4,'м':3,'д':3,'п':3,'у':3,
    'я':2,'ы':2,'ь':1.7,'б':1.6,'г':1.7,
    'з':1.4,'ч':1.5,'й':1.2,
    'х':1,'ж':1,'ш':0.7,'ю':0.6,
    'ц':0.5,'щ':0.4,'э':0.3,'ф':0.3,'ъ':0.05
  };

  const LENGTH_BONUS = {3:1, 4:1.2, 5:1.5, 6:2.0, 7:2.5, 8:3.0, 9:4.0};
  const TIME_BONUS   = {3:1, 4:2,   5:3,   6:4,   7:5,   8:7,   9:9};

  const RACK_SIZE        = 8;
  const START_TIME       = 90;
  const COMBO_STEP       = 0.2;
  const COMBO_MAX        = 5.0;
  const SHUFFLE_USES     = 3;
  const GOLD_PROB        = 0.10;
  const CRYSTAL_PROB     = 0.07;
  const CRYSTAL_TIME     = 5;     // дополнительные секунды за кристалл в слове
  const GOLD_MULT        = 2;     // золотая буква = ×2 значение

  // ───────── DOM ─────────
  const $ = sel => document.querySelector(sel);
  const elMenu     = $('#menu');
  const elGame     = $('#game');
  const elEnd      = $('#end');
  const elScore    = $('#score');
  const elTimer    = $('#timer');
  const elTimerFill= $('#timer-fill');
  const elTimerCell= elTimer.parentElement;
  const elCombo    = $('#combo');
  const elWordText = $('#word-text');
  const elWordMeta = $('#word-meta');
  const elWordDisp = $('#word-display');
  const elRack     = $('#rack');
  const elFoundList= $('#found-list');
  const elFoundCnt = $('#found-count');
  const elShufCnt  = $('#shuffle-count');
  const elFloaters = $('#floaters');
  const elToast    = $('#toast');

  // ───────── Состояние ─────────
  let DICT = null;       // Set русских слов
  let dictLoading = null;
  let state = null;      // объект игры

  // ───────── Утилиты ─────────
  const rand = (a,b) => Math.random()*(b-a)+a;
  const randInt = (a,b) => Math.floor(rand(a,b+1));

  function weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s,[,w]) => s+w, 0);
    let r = Math.random()*total;
    for (const [k,w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[entries.length-1][0];
  }

  function randomLetter() { return weightedPick(POOL_WEIGHTS); }

  function makeTile() {
    const letter = randomLetter();
    let special = null;
    const r = Math.random();
    if (r < CRYSTAL_PROB) special = 'crystal';
    else if (r < CRYSTAL_PROB + GOLD_PROB) special = 'gold';
    return {
      letter,
      value: VALUES[letter] || 1,
      special,            // null | 'gold' | 'crystal'
      id: ++TILE_ID,
    };
  }
  let TILE_ID = 0;

  // ───────── Загрузка словаря ─────────
  function loadDict() {
    if (DICT) return Promise.resolve(DICT);
    if (dictLoading) return dictLoading;
    dictLoading = fetch('words.json')
      .then(r => r.json())
      .then(arr => { DICT = new Set(arr); return DICT; });
    return dictLoading;
  }

  function normalize(w) { return (w||'').toLowerCase().replace(/ё/g, 'е'); }

  // ───────── Toast ─────────
  let toastTimer = null;
  function toast(msg, kind='') {
    elToast.textContent = msg;
    elToast.className = '';
    elToast.classList.add('show');
    if (kind) elToast.classList.add(kind);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove('show'), 1800);
  }

  // ───────── Render ─────────
  function renderRack() {
    elRack.innerHTML = '';
    state.rack.forEach((tile, idx) => {
      const el = document.createElement('div');
      el.className = 'tile';
      if (tile.special) el.classList.add(tile.special);
      if (tile.removing) el.classList.add('disappear');
      else if (state.selected.includes(idx)) el.classList.add('used');
      el.dataset.idx = idx;
      el.innerHTML =
        `<span class="ch">${tile.letter}</span>` +
        `<span class="pts">${tile.special === 'gold' ? tile.value*GOLD_MULT : tile.value}</span>`;
      el.addEventListener('click', () => onTileClick(idx));
      elRack.appendChild(el);
    });
  }

  function renderWord() {
    if (state.selected.length === 0) {
      elWordText.innerHTML = '<span class="placeholder">Выберите буквы…</span>';
      elWordMeta.textContent = '';
      return;
    }
    const letters = state.selected.map(i => state.rack[i].letter).join('');
    elWordText.textContent = letters;
    const preview = previewScore(state.selected);
    elWordMeta.textContent = `${letters.length} букв · ${preview} очков`;
  }

  function renderHud() {
    elScore.textContent = state.score;
    elCombo.textContent = '×' + state.combo.toFixed(1);
    elCombo.className = '';
    if (state.combo >= 3) elCombo.classList.add('fire');
    else if (state.combo >= 2) elCombo.classList.add('hot');
    elShufCnt.textContent = state.shufflesLeft;
  }

  function renderTimer() {
    const t = Math.max(0, state.timeLeft);
    elTimer.textContent = Math.ceil(t);
    const pct = Math.max(0, Math.min(100, (t/START_TIME)*100));
    elTimerFill.style.width = pct + '%';
    if (t <= 10) elTimerCell.classList.add('warn');
    else elTimerCell.classList.remove('warn');
  }

  function pushFoundWord(word, score) {
    const li = document.createElement('li');
    li.innerHTML = `${word} <small>+${score}</small>`;
    elFoundList.prepend(li);
    elFoundCnt.textContent = state.foundCount;
  }

  // ───────── Подсчёт очков ─────────
  function tileValue(tile) {
    return tile.special === 'gold' ? tile.value * GOLD_MULT : tile.value;
  }
  function previewScore(indices) {
    if (indices.length < 3) return 0;
    const base = indices.reduce((s,i) => s + tileValue(state.rack[i]), 0);
    const len = indices.length;
    const lb = LENGTH_BONUS[len] || LENGTH_BONUS[9];
    return Math.round(base * lb * state.combo);
  }

  // ───────── Игровые действия ─────────
  function onTileClick(idx) {
    if (state.over) return;
    const i = state.selected.indexOf(idx);
    if (i >= 0) {
      // повторный клик — снять с конца до этого
      state.selected = state.selected.slice(0, i);
    } else {
      state.selected.push(idx);
    }
    renderRack();
    renderWord();
  }

  function clearSelection() {
    state.selected = [];
    renderRack();
    renderWord();
  }

  function shuffle() {
    if (state.shufflesLeft <= 0) {
      toast('Перемешивания закончились', 'bad');
      return;
    }
    state.shufflesLeft--;
    state.selected = [];
    state.rack = Array.from({length: RACK_SIZE}, makeTile);
    renderHud();
    renderRack();
    renderWord();
  }

  function submit() {
    if (state.over) return;
    const indices = state.selected.slice();
    if (indices.length < 3) {
      shakeWord('Слово должно быть от 3 букв');
      return;
    }
    const word = indices.map(i => state.rack[i].letter).join('');
    const norm = normalize(word);

    if (state.foundSet.has(norm)) {
      shakeWord('Это слово уже было', false);
      return;
    }
    if (!DICT.has(norm)) {
      shakeWord(`«${word}» — нет в словаре`, true);
      return;
    }

    // Успех
    const gained = previewScore(indices);
    state.score += gained;

    // Бонус-время
    let time = TIME_BONUS[indices.length] || TIME_BONUS[9];
    let crystals = 0;
    indices.forEach(i => { if (state.rack[i].special === 'crystal') crystals++; });
    time += crystals * CRYSTAL_TIME;
    state.timeLeft = Math.min(START_TIME * 1.6, state.timeLeft + time);

    // Комбо
    state.combo = Math.min(COMBO_MAX, state.combo + COMBO_STEP);

    // Учёт
    state.foundSet.add(norm);
    state.foundCount++;
    if (gained > state.bestScore) { state.bestScore = gained; state.bestWord = word; }

    // Анимация и обновление: пометить тайлы removing → перерисовать
    indices.forEach(i => state.rack[i].removing = true);
    flashWord(true);
    floatPoints(gained, '+');
    if (time) floatPoints(`+${time}с`, 'time');
    pushFoundWord(word, gained);
    renderRack();
    elScore.classList.remove('score-flash'); void elScore.offsetWidth; elScore.classList.add('score-flash');

    // Через 350мс заменить removed тайлы на новые
    setTimeout(() => {
      state.rack = state.rack.map(t => t.removing ? makeTile() : t);
      state.selected = [];
      renderRack();
      renderWord();
    }, 360);

    renderHud();
  }

  function shakeWord(msg, breakCombo=false) {
    elWordDisp.classList.remove('shake'); void elWordDisp.offsetWidth;
    elWordDisp.classList.add('shake');
    if (msg) toast(msg, 'bad');
    if (breakCombo && state.combo > 1) {
      state.combo = 1.0;
      renderHud();
      floatPoints('Комбо сброшено', 'bad');
    }
  }
  function flashWord(ok) {
    if (ok) {
      elWordDisp.classList.remove('hooray'); void elWordDisp.offsetWidth;
      elWordDisp.classList.add('hooray');
    }
  }

  // ───────── Плавающий текст ─────────
  function floatPoints(text, kind='') {
    const rect = elWordDisp.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-pts';
    if (kind === 'time') el.classList.add('time');
    if (kind === 'bad')  el.classList.add('bad');
    el.style.left = (rect.left + rect.width/2) + 'px';
    el.style.top  = (rect.top + rect.height/2 - 10) + 'px';
    el.textContent = (typeof text === 'number') ? '+' + text : text;
    elFloaters.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // ───────── Таймер ─────────
  function startTicker() {
    state.lastTick = performance.now();
    state.ticker = setInterval(() => {
      const now = performance.now();
      const dt  = (now - state.lastTick) / 1000;
      state.lastTick = now;
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        renderTimer();
        endGame();
      } else {
        renderTimer();
      }
    }, 100);
  }
  function stopTicker() { if (state.ticker) clearInterval(state.ticker); state.ticker = null; }

  // ───────── Жизненный цикл ─────────
  function startGame() {
    state = {
      rack: Array.from({length: RACK_SIZE}, makeTile),
      selected: [],
      score: 0,
      combo: 1.0,
      timeLeft: START_TIME,
      shufflesLeft: SHUFFLE_USES,
      foundSet: new Set(),
      foundCount: 0,
      bestScore: 0,
      bestWord: '—',
      over: false,
      ticker: null,
      lastTick: 0,
    };
    elFoundList.innerHTML = '';
    elFoundCnt.textContent = 0;
    elMenu.classList.add('hidden');
    elEnd.classList.add('hidden');
    elGame.classList.remove('hidden');
    renderHud();
    renderTimer();
    renderRack();
    renderWord();
    startTicker();
  }

  function endGame() {
    state.over = true;
    stopTicker();
    // обновить рекорд
    const best = +(localStorage.getItem('alchemy_best') || 0);
    if (state.score > best) localStorage.setItem('alchemy_best', String(state.score));
    $('#end-score').textContent = state.score;
    $('#end-count').textContent = state.foundCount;
    $('#end-best').textContent  = state.bestWord;
    $('#end-best-score').textContent = Math.max(state.score, +localStorage.getItem('alchemy_best')||0);
    elGame.classList.add('hidden');
    elEnd.classList.remove('hidden');
  }

  function toMenu() {
    elGame.classList.add('hidden');
    elEnd.classList.add('hidden');
    elMenu.classList.remove('hidden');
  }

  // Раскладка ЙЦУКЕН для пользователей без русской раскладки
  const JCUKEN = {
    'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','[':'х',']':'ъ',
    'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',';':'ж',"'":'э',
    'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',',':'б','.':'ю','/':'.'
  };

  // ───────── Клавиатура ─────────
  function onKey(e) {
    if (elGame.classList.contains('hidden')) return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault();
      if (state.selected.length > 0) { state.selected.pop(); renderRack(); renderWord(); }
      return;
    }
    if (e.key === 'Escape') { clearSelection(); return; }
    if (e.key === ' ') { e.preventDefault(); shuffle(); return; }
    let ch = e.key.toLowerCase();
    if (!/^[а-яё]$/.test(ch) && JCUKEN[ch]) ch = JCUKEN[ch];
    if (/^[а-яё]$/.test(ch)) {
      const norm = ch === 'ё' ? 'е' : ch;
      const idx = state.rack.findIndex((t, i) => !state.selected.includes(i) && t.letter === norm);
      if (idx >= 0) { state.selected.push(idx); renderRack(); renderWord(); }
      else { shakeWord(`Буквы «${ch}» нет на стойке`, false); }
    }
  }

  // ───────── Инициализация ─────────
  function init() {
    document.getElementById('btn-start').addEventListener('click', async () => {
      try {
        await loadDict();
      } catch (e) {
        toast('Не удалось загрузить словарь', 'bad');
        return;
      }
      startGame();
    });
    document.getElementById('btn-clear').addEventListener('click', clearSelection);
    document.getElementById('btn-submit').addEventListener('click', submit);
    document.getElementById('btn-shuffle').addEventListener('click', shuffle);
    document.getElementById('btn-again').addEventListener('click', startGame);
    document.getElementById('btn-menu').addEventListener('click', toMenu);
    window.addEventListener('keydown', onKey);

    // предзагрузим словарь, чтобы старт был мгновенным
    loadDict().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
