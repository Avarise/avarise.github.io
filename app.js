'use strict';

const STORAGE_KEY = 'sigilrpg-stat-tracker-v1';
const ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'SEN', 'AUR'];
const DICE = [4, 6, 8, 10, 12, 20, 100];

let state = loadState();
const editingStatIds = new Set();

const grid = document.querySelector('#characterGrid');
const emptyState = document.querySelector('#emptyState');
const template = document.querySelector('#characterTemplate');
const form = document.querySelector('#characterForm');
const nameInput = document.querySelector('#characterName');
const creationStats = document.querySelector('#creationStats');
const toggleCreatorButton = document.querySelector('#toggleCreatorButton');
const cancelCreateButton = document.querySelector('#cancelCreateButton');
const endAllButton = document.querySelector('#endAllButton');
const resetAllButton = document.querySelector('#resetAllButton');

initializeCreationStats();
render();

toggleCreatorButton.addEventListener('click', () => setCreatorOpen(form.hidden));
cancelCreateButton.addEventListener('click', () => setCreatorOpen(false));

form.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const maximum = {};
  const current = {};
  const pending = {};

  for (const attribute of ATTRIBUTES) {
    const die = Number(form.elements[attribute].value);
    maximum[attribute] = die;
    current[attribute] = die;
    pending[attribute] = 0;
  }

  state.characters.push({
    id: crypto.randomUUID(),
    name,
    maximum,
    current,
    pending,
    dead: false
  });

  saveAndRender();
  form.reset();
  initializeCreationStats();
  setCreatorOpen(false);
});

endAllButton.addEventListener('click', () => {
  const summaries = state.characters
    .filter(hasPendingDamage)
    .map(character => `${character.name}\n${buildDamageSummary(character)}`);
  if (!summaries.length) return;
  if (!confirm(`Apply pending wounds?\n\n${summaries.join('\n\n')}`)) return;
  state.characters.forEach(applyPendingDamage);
  saveAndRender();
});

resetAllButton.addEventListener('click', () => {
  if (!state.characters.length) return;
  if (!confirm('Restore every character to full HP and clear all pending damage?')) return;
  state.characters.forEach(restoreFullHp);
  saveAndRender();
});

function initializeCreationStats() {
  creationStats.replaceChildren();
  for (const attribute of ATTRIBUTES) {
    const label = document.createElement('label');
    label.className = 'creation-stat';

    const caption = document.createElement('span');
    caption.textContent = attribute;

    const select = document.createElement('select');
    select.name = attribute;
    select.setAttribute('aria-label', `${attribute} maximum die`);
    for (const die of DICE) {
      const option = document.createElement('option');
      option.value = String(die);
      option.textContent = `d${die}`;
      if (die === 4) option.selected = true;
      select.append(option);
    }

    label.append(caption, select);
    creationStats.append(label);
  }
}

function setCreatorOpen(open) {
  form.hidden = !open;
  toggleCreatorButton.setAttribute('aria-expanded', String(open));
  toggleCreatorButton.textContent = open ? 'Close' : 'Add character';
  if (open) nameInput.focus();
}

function render() {
  const previousHorizontalScroll = grid.scrollLeft;
  grid.replaceChildren();
  emptyState.hidden = state.characters.length > 0;
  endAllButton.disabled = !state.characters.some(hasPendingDamage);
  resetAllButton.disabled = state.characters.length === 0;

  for (const character of state.characters) {
    grid.append(renderCharacter(character));
  }

  // Re-rendering after a wound/control action should not jump a mobile DM
  // back to the first character in the horizontal tracker.
  grid.scrollLeft = previousHorizontalScroll;
}

function renderCharacter(character) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.character-card');
  const name = fragment.querySelector('.character-name');
  const meta = fragment.querySelector('.character-meta');
  const hpValue = fragment.querySelector('.hp-value');
  const pendingSummary = fragment.querySelector('.pending-summary');
  const stats = fragment.querySelector('.stats');
  const editStatsButton = fragment.querySelector('.edit-stats-button');
  const fullHpButton = fragment.querySelector('.full-hp-button');
  const deleteButton = fragment.querySelector('.delete-button');
  const endRoundButton = fragment.querySelector('.end-round-button');
  const clearPendingButton = fragment.querySelector('.undo-pending-button');

  const hp = calculateHp(character.current);
  const maxHp = calculateHp(character.maximum);
  const pendingCount = totalPending(character);

  card.dataset.id = character.id;
  card.classList.toggle('dead', character.dead);
  name.value = character.name;
  meta.textContent = `Level ${maxHp} · max HP ${maxHp}`;
  hpValue.textContent = `${hp} / ${maxHp}`;

  if (character.dead) {
    pendingSummary.textContent = 'DEAD';
    pendingSummary.className = 'pending-summary dead';
  } else if (pendingCount > 0) {
    pendingSummary.textContent = `${pendingCount} pending wound${pendingCount === 1 ? '' : 's'}`;
    pendingSummary.className = 'pending-summary has-pending';
  } else {
    pendingSummary.textContent = 'No pending damage';
  }

  const editingStats = editingStatIds.has(character.id);
  editStatsButton.textContent = editingStats ? 'Done' : 'Edit stats';
  editStatsButton.setAttribute('aria-pressed', String(editingStats));

  for (const attribute of ATTRIBUTES) {
    stats.append(renderStat(character, attribute, editingStats));
  }

  endRoundButton.disabled = pendingCount === 0 || character.dead;
  clearPendingButton.disabled = pendingCount === 0;

  name.addEventListener('change', () => {
    character.name = name.value.trim() || 'Unnamed';
    saveState();
    name.value = character.name;
  });

  editStatsButton.addEventListener('click', () => {
    if (editingStats) editingStatIds.delete(character.id);
    else editingStatIds.add(character.id);
    render();
  });

  fullHpButton.addEventListener('click', () => {
    restoreFullHp(character);
    saveAndRender();
  });

  deleteButton.addEventListener('click', () => {
    if (!confirm(`Delete ${character.name}?`)) return;
    state.characters = state.characters.filter(item => item.id !== character.id);
    saveAndRender();
  });

  endRoundButton.addEventListener('click', () => {
    if (!confirm(`Apply pending wounds to ${character.name}?\n\n${buildDamageSummary(character)}`)) return;
    applyPendingDamage(character);
    saveAndRender();
  });

  clearPendingButton.addEventListener('click', () => {
    for (const attribute of ATTRIBUTES) character.pending[attribute] = 0;
    saveAndRender();
  });

  return fragment;
}

function renderStat(character, attribute, editingStats) {
  const row = document.createElement('div');
  row.className = 'stat-row';

  const statName = document.createElement('div');
  statName.className = 'stat-name';
  statName.textContent = attribute;

  const dice = document.createElement('div');
  dice.className = 'stat-dice';

  const current = document.createElement('span');
  current.className = 'current-die';
  current.textContent = `d${character.current[attribute]}`;
  current.classList.toggle('reduced', character.current[attribute] !== character.maximum[attribute]);

  if (editingStats) {
    const max = document.createElement('select');
    max.className = 'max-die-select';
    max.setAttribute('aria-label', `${attribute} base die`);

    for (const die of DICE) {
      const option = document.createElement('option');
      option.value = String(die);
      option.textContent = `base d${die}`;
      option.selected = die === character.maximum[attribute];
      max.append(option);
    }

    max.addEventListener('change', () => {
      setMaximumDie(character, attribute, Number(max.value));
      saveAndRender();
    });
    dice.append(current, max);
  } else {
    const max = document.createElement('span');
    max.className = 'max-die';
    max.textContent = `max d${character.maximum[attribute]}`;
    dice.append(current, max);
  }

  if (character.pending[attribute] > 0) {
    const pending = document.createElement('span');
    pending.className = 'pending-wounds';
    pending.textContent = `−${character.pending[attribute]} pending`;
    dice.append(pending);
  }

  const controls = document.createElement('div');
  controls.className = 'stat-controls';

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'pending-button';
  undo.textContent = '−';
  undo.title = `Remove one pending ${attribute} wound`;
  undo.disabled = character.pending[attribute] === 0;
  undo.addEventListener('click', () => {
    character.pending[attribute] = Math.max(0, character.pending[attribute] - 1);
    saveAndRender();
  });

  const damage = document.createElement('button');
  damage.type = 'button';
  damage.className = 'damage-button';
  damage.textContent = '+ dmg';
  damage.title = `Queue one ${attribute} wound`;
  damage.disabled = character.dead || !canQueueDamage(character, attribute);
  damage.addEventListener('click', () => {
    if (!canQueueDamage(character, attribute)) return;
    character.pending[attribute] += 1;
    saveAndRender();
  });

  const heal = document.createElement('button');
  heal.type = 'button';
  heal.className = 'heal-button';
  heal.textContent = '+ heal';
  heal.title = `Restore one ${attribute} tier`;
  heal.disabled = character.dead || character.current[attribute] === character.maximum[attribute];
  heal.addEventListener('click', () => {
    healAttribute(character, attribute);
    saveAndRender();
  });

  controls.append(undo, damage, heal);
  row.append(statName, dice, controls);
  return row;
}

function setMaximumDie(character, attribute, newMaximum) {
  const oldMaximumIndex = DICE.indexOf(character.maximum[attribute]);
  const currentIndex = DICE.indexOf(character.current[attribute]);
  const newMaximumIndex = DICE.indexOf(newMaximum);
  const lostTiers = Math.max(0, oldMaximumIndex - currentIndex);

  character.maximum[attribute] = newMaximum;
  character.current[attribute] = DICE[Math.max(0, newMaximumIndex - lostTiers)];
  character.pending[attribute] = Math.min(
    character.pending[attribute] || 0,
    DICE.indexOf(character.current[attribute])
  );
}

function healAttribute(character, attribute) {
  const currentIndex = DICE.indexOf(character.current[attribute]);
  const maximumIndex = DICE.indexOf(character.maximum[attribute]);
  if (currentIndex < maximumIndex) character.current[attribute] = DICE[currentIndex + 1];
}

function buildDamageSummary(character) {
  const preview = structuredClone(character);
  const oldHp = calculateHp(character.current);
  applyPendingDamage(preview);

  const changes = ATTRIBUTES
    .filter(attribute => character.current[attribute] !== preview.current[attribute])
    .map(attribute => `${attribute}: d${character.current[attribute]} → d${preview.current[attribute]}`);

  const newHp = calculateHp(preview.current);
  if (oldHp !== newHp) changes.push(`HP: ${oldHp} → ${newHp}`);
  if (!character.dead && preview.dead) changes.push('Status: DEAD');

  return changes.join('\n') || 'No values change.';
}

function applyPendingDamage(character) {
  if (character.dead) return;

  let lethalOverflow = false;

  // Apply all wounds simultaneously at round end. This intentionally means
  // queued wounds do not weaken later defenses during the same round.
  for (const attribute of ATTRIBUTES) {
    let wounds = character.pending[attribute] || 0;
    while (wounds > 0) {
      const hpBefore = calculateHp(character.current);
      if (hpBefore === 0) {
        lethalOverflow = true;
        wounds = 0;
        break;
      }

      const index = DICE.indexOf(character.current[attribute]);
      if (index > 0) {
        character.current[attribute] = DICE[index - 1];
      }
      // A wound aimed at an already-d4 attribute cannot lower that die. Under
      // the current notes, death occurs only when damage is suffered at 0 HP.
      wounds -= 1;
    }

    character.pending[attribute] = 0;
  }

  if (lethalOverflow) character.dead = true;
}

function restoreFullHp(character) {
  for (const attribute of ATTRIBUTES) {
    character.current[attribute] = character.maximum[attribute];
    character.pending[attribute] = 0;
  }
  character.dead = false;
}

function calculateHp(diceMap) {
  return ATTRIBUTES.reduce((total, attribute) => total + DICE.indexOf(diceMap[attribute]), 0);
}

function canQueueDamage(character, attribute) {
  const currentIndex = DICE.indexOf(character.current[attribute]);
  const pending = character.pending[attribute] || 0;
  return currentIndex - pending > 0;
}

function totalPending(character) {
  return ATTRIBUTES.reduce((total, attribute) => total + (character.pending[attribute] || 0), 0);
}

function hasPendingDamage(character) {
  return totalPending(character) > 0;
}

function saveAndRender() {
  saveState();
  render();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.characters)) return parsed;
  } catch (error) {
    console.warn('Could not load SigilRPG tracker state:', error);
  }
  return { characters: [] };
}

// --- Single-page action composer and guide -----------------------------------

const trackerView = document.querySelector('#trackerView');
const guideView = document.querySelector('#guideView');
const wordsView = document.querySelector('#wordsView');
const trackerViewButton = document.querySelector('#trackerViewButton');
const guideViewButton = document.querySelector('#guideViewButton');
const wordsViewButton = document.querySelector('#wordsViewButton');
const topbarActions = document.querySelector('#topbarActions');
const pageTitle = document.querySelector('#pageTitle');
const clearPrefixesButton = document.querySelector('#clearPrefixesButton');
const prefixButtons = [...document.querySelectorAll('.prefix-button')];
const includeAttackButton = document.querySelector('#includeAttackButton');

const PREFIXES = {
  power: {
    label: 'Power',
    potential: 1,
    effects: ['Accuracy die increases by one tier.']
  },
  precision: {
    label: 'Precision',
    potential: 1,
    effects: ['Gain advantage on the accuracy roll.', 'One attribute may be wounded twice by this attack.']
  },
  dashing: {
    label: 'Dashing',
    potential: 1,
    effects: []
  },
  sweep: {
    label: 'Sweep',
    potential: 0,
    effects: ['Apply the attack against multiple targets.', 'Sweep does not increase damage potential.', 'A miss can force chip damage even when the target would normally be immune.']
  }
};

const selectedPrefixes = new Set();
let includesBaseAttack = true;

trackerViewButton.addEventListener('click', () => setAppView('tracker'));
guideViewButton.addEventListener('click', () => setAppView('action'));
wordsViewButton.addEventListener('click', () => setAppView('guide'));
window.addEventListener('hashchange', syncViewFromHash);

prefixButtons.forEach(button => {
  button.addEventListener('click', () => {
    const prefix = button.dataset.prefix;
    if (selectedPrefixes.has(prefix)) selectedPrefixes.delete(prefix);
    else selectedPrefixes.add(prefix);
    renderAttackComposer();
  });
});

includeAttackButton.addEventListener('click', () => {
  includesBaseAttack = !includesBaseAttack;
  renderActionComposer();
});

clearPrefixesButton.addEventListener('click', () => {
  selectedPrefixes.clear();
  renderActionComposer();
});

function setAppView(view, updateHash = true) {
  const showTracker = view === 'tracker';
  const showAction = view === 'action';
  const showGuide = view === 'guide';
  trackerView.hidden = !showTracker;
  guideView.hidden = !showAction;
  wordsView.hidden = !showGuide;
  topbarActions.hidden = !showTracker;
  trackerViewButton.classList.toggle('active', showTracker);
  guideViewButton.classList.toggle('active', showAction);
  wordsViewButton.classList.toggle('active', showGuide);
  trackerViewButton.toggleAttribute('aria-current', showTracker);
  guideViewButton.toggleAttribute('aria-current', showAction);
  wordsViewButton.toggleAttribute('aria-current', showGuide);
  pageTitle.textContent = showGuide ? 'Guide' : showAction ? 'Action Composer' : 'Stat Tracker';

  if (updateHash) {
    const hash = showGuide ? '#guide' : showAction ? '#action' : '#tracker';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function syncViewFromHash() {
  const view = location.hash === '#guide' ? 'guide' : location.hash === '#action' ? 'action' : 'tracker';
  setAppView(view, false);
}

function renderAttackComposer() {
  renderActionComposer();
}

function renderPips(container, count) {
  container.replaceChildren(...Array.from({ length: count }, () => document.createElement('i')));
}

// --- Words of Power ----------------------------------------------------------

const WORDS = {
  source: [
    { id: 'thunder', name: 'Thunder & Lightning', word: 'Baguaga', mana: 1, effect: 'Conjures thunder, lightning, and electrical force.' },
    { id: 'vital', name: 'Vital Energy', word: 'Habaga', mana: 1, effect: 'Restores life or, when inverted, drains and harms it.' },
    { id: 'force', name: 'Force', word: 'Tyś', mana: 1, effect: 'Conjures physical impact, momentum, and pressure.' },
    { id: 'fire', name: 'Fire', word: 'Firanka', mana: 1, effect: 'Conjures flame and heat.' },
    { id: 'frost', name: 'Frost', word: 'Zhorna', mana: 1, effect: 'Conjures cold, ice, and the removal of heat.' },
    { id: 'echoes', name: 'Echoes', word: 'Berevri', mana: 1, effect: 'Calls on lingering energy from an earlier spell.' },
    { id: 'shadow', name: 'Shadow & Darkness', word: 'Ferpshna', mana: 1, effect: 'Conjures darkness and obscuring shadow.' },
    { id: 'light', name: 'Light & Radiance', word: 'Gripshna', mana: 1, effect: 'Conjures illumination and radiant energy.' },
    { id: 'poison', name: 'Poison', word: 'Vyrnaka', mana: 1, effect: 'Conjures venomous or contaminating energy.' },
    { id: 'fear', name: 'Fear', word: 'Ghazur', mana: 1, effect: 'Conjures supernatural dread.' },
    { id: 'water', name: 'Water', word: 'Tugatuga', mana: 1, effect: 'Conjures or controls water.' },
    { id: 'speed', name: 'Speed', word: 'Dobenga', mana: 1, effect: 'Conjures acceleration and rapid motion.' },
    { id: 'levitate', name: 'Levitation', word: 'Harnharn', mana: 1, effect: 'Conjures upward force and weightlessness.' },
    { id: 'stone', name: 'Stone', word: 'Kafelka', mana: 1, effect: 'Conjures or controls earth and stone.' }
  ],
  shape: [
    { id: 'pillar', name: 'Pillar', word: 'Ghyblor', mana: 1, effect: 'Suggested: a 1 m-wide, 5 m-tall column within 20 m; lasts one round.' },
    { id: 'bolt', name: 'Bolt', word: 'Dziahaka', mana: 1, attackLike: true, effect: 'Attack-like: launch the spell at one target within 30 m.' },
    { id: 'vortex', name: 'Vortex', word: 'Kashanka', mana: 1, effect: 'Suggested: a 5 m-radius rotating field within 20 m; lasts one round.' },
    { id: 'hammer', name: 'Hammer', word: 'Baluuga', mana: 1, attackLike: true, effect: 'Attack-like: a heavy blow within 10 m that can push or stagger.' },
    { id: 'strike', name: 'Strike', word: 'Hypsh', mana: 1, attackLike: true, effect: 'Attack-like: deliver the spell through a melee or touch attack.' },
    { id: 'slash', name: 'Slash', word: 'Yyś', mana: 1, attackLike: true, effect: 'Attack-like: cut through a 10 m line up to 1 m wide.' },
    { id: 'snake', name: 'Snake', word: 'Sneila', mana: 1, attackLike: true, effect: 'Attack-like: a winding effect that can bend around simple cover within 30 m.' },
    { id: 'knockdown', name: 'Knockdown / Pindown', word: 'Kuva', mana: 1, effect: 'Force a target within 20 m down; continued pressure may pin it.' },
    { id: 'chains', name: 'Chains / Restrain', word: 'Thryka', mana: 1, effect: 'Bind a target within 20 m until it breaks free or the effect ends.' },
    { id: 'barrier', name: 'Barrier / Shield', word: 'Oshvar', mana: 1, effect: 'Suggested: a 3 m by 3 m defensive plane within 20 m; lasts one round.' },
    { id: 'siphon', name: 'Siphon / Drain', word: 'Drynok', mana: 1, attackLike: true, effect: 'Attack-like: draw the Source energy from a target within 10 m toward the caster.' },
    { id: 'construct', name: 'Construct / Frame', word: 'Peyoz', mana: 1, effect: 'Suggested: form a simple object fitting within a 2 m cube for one minute.' },
    { id: 'heart', name: 'Heart / Center', word: 'Hordum', mana: 1, effect: 'Give the spell a stable center that other Shapes can orbit or emanate from.' },
    { id: 'illusion', name: 'Illusion / Veil', word: 'Lorynka', mana: 1, effect: 'Suggested: alter sight and sound in a 5 m cube within 20 m for one minute.' },
    { id: 'wings', name: 'Wings / Flight', word: 'Chyvra', mana: 1, effect: 'Suggested: grant flight at base movement speed for one round.' },
    { id: 'shatter', name: 'Shatter', word: 'Talgru', mana: 1, attackLike: true, effect: 'Attack-like: tear apart a target within 20 m; especially effective against objects and constructs.' },
    { id: 'howling', name: 'Howling', word: 'Galish', mana: 1, effect: 'Suggested: release the spell through a 10 m cone of sound or pressure.' },
    { id: 'open', name: 'Open', word: 'Alhora', mana: 1, effect: 'Open, unfold, or create an aperture in a valid target within 10 m.' },
    { id: 'spiral', name: 'Spiral', word: 'Panteka', mana: 1, effect: 'Twist another Shape into a spiral, orbit, or higher-dimensional path.' },
    { id: 'cave', name: 'Cave / Burrow', word: 'Bûnkra', mana: 1, effect: 'Suggested: excavate or shape a passage 2 m long and 2 m wide.' },
    { id: 'flat', name: 'Flat', word: 'Regal', mana: 1, effect: 'Flatten another Shape into a plane, surface, wall, or floor.' }
  ],
  mastery: [
    { id: 'negation', name: 'Negation', word: 'Nushik', mana: 1, effect: 'Invert, suppress, or cancel the selected Source or Shape where fiction permits.' },
    { id: 'power', name: 'Power Word', word: 'Dovinus', dust: 1, effect: 'Make the spell verbal-only, deliver it through hearing, and raise its power die one tier.' },
    { id: 'focus', name: 'Focus Word', word: 'Balrurg', dust: 1, effect: 'Gain advantage on the Spell Casting Check.' },
    { id: 'enhancement', name: 'Enhancement', word: 'Mabufa', mana: 1, effect: 'Transfer 1 Mana or raise one target attribute by one die tier.' },
    { id: 'ascended', name: 'Ascended Energy', word: 'Divinarius', dust: 1, effect: 'Raise the spell’s guaranteed degree of success by one tier.' },
    { id: 'hold', name: 'Hold Still', word: 'Kurwa', effect: 'Stabilize a charged spell; reduce its Casting Difficulty by one tier.' },
    { id: 'show', name: 'Show Me', word: 'Gabbergûbber', dust: 1, effect: 'Reveal a simple vision; three uses can reveal a Vision of the World.' },
    { id: 'multiplier', name: 'Multiplier', word: 'Tigiba', dust: 1, effect: 'Repeat or multiply one compatible part of the spell; exact scaling is a table ruling.' }
  ]
};

const CASTING_DIFFICULTIES = [
  { name: 'Easy', dc: 4 },
  { name: 'Advanced', dc: 6 },
  { name: 'Hard', dc: 8 },
  { name: 'Very Hard', dc: 10 },
  { name: 'Improbable', dc: 12 },
  { name: 'Inconceivable', dc: 20 },
  { name: 'Impossible', dc: 100 }
];

const selectedWords = new Set();
const clearWordsButton = document.querySelector('#clearWordsButton');
const spellPhrase = document.querySelector('#spellPhrase');
const spellAp = document.querySelector('#spellAp');
const spellResources = document.querySelector('#spellResources');
const spellPotential = document.querySelector('#spellPotential');
const spellDifficulty = document.querySelector('#spellDifficulty');
const spellCharge = document.querySelector('#spellCharge');
const spellEffects = document.querySelector('#spellEffects');

function initializeWordLists() {
  const actionWordsMount = document.querySelector('#actionWordsMount');
  actionWordsMount.append(
    document.querySelector('.spell-composer'),
    ...document.querySelectorAll('.word-category')
  );

  document.querySelector('#guideReferenceMount').append(
    ...document.querySelectorAll('.guide-reference')
  );

  renderWordCategory('source', document.querySelector('#sourceWords'));
  renderWordCategory('shape', document.querySelector('#shapeWords'));
  renderWordCategory('mastery', document.querySelector('#masteryWords'));
}

function renderWordCategory(category, container) {
  for (const word of WORDS[category]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-button';
    button.dataset.wordId = `${category}:${word.id}`;
    button.setAttribute('aria-pressed', 'false');

    const heading = document.createElement('span');
    heading.className = 'word-heading';
    const name = document.createElement('strong');
    name.textContent = word.name;
    const invocation = document.createElement('b');
    invocation.textContent = word.word;
    heading.append(name, invocation);

    const cost = document.createElement('small');
    const resources = [word.mana ? `${word.mana} Mana` : '', word.dust ? `${word.dust} Dust` : ''].filter(Boolean);
    cost.textContent = `1 AP${resources.length ? ` · ${resources.join(' · ')}` : ''}${word.attackLike ? ' · Attack-like' : ''}`;

    const effect = document.createElement('span');
    effect.className = 'word-effect';
    effect.textContent = word.effect;
    button.append(heading, cost, effect);
    button.addEventListener('click', () => {
      const key = button.dataset.wordId;
      if (selectedWords.has(key)) selectedWords.delete(key);
      else selectedWords.add(key);
      renderSpellComposer();
    });
    container.append(button);
  }
}

function getSelectedWords() {
  const selected = [];
  for (const category of ['source', 'shape', 'mastery']) {
    for (const word of WORDS[category]) {
      if (selectedWords.has(`${category}:${word.id}`)) selected.push({ ...word, category });
    }
  }
  return selected;
}

function renderActionComposer() {
  const selected = getSelectedWords();
  const selectedPrefixKeys = [...selectedPrefixes];
  const attackLike = selected.some(word => word.attackLike);
  const isSmite = includesBaseAttack && selected.length === 1 && selected[0].category === 'source';
  const wordAp = selected.length - (isSmite ? 1 : 0);
  const ap = (includesBaseAttack ? 1 : 0) + selectedPrefixKeys.length + wordAp;
  const mana = selected.reduce((total, word) => total + (word.mana || 0), 0);
  const dust = selected.reduce((total, word) => total + (word.dust || 0), 0);
  const wordPotential = selected.filter(word => word.category === 'source' || word.category === 'shape').length;
  const prefixPotential = selectedPrefixKeys.reduce((total, key) => total + PREFIXES[key].potential, 0);
  const potential = (includesBaseAttack ? 2 : 0) + wordPotential + prefixPotential;

  includeAttackButton.setAttribute('aria-pressed', String(includesBaseAttack));
  prefixButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(selectedPrefixes.has(button.dataset.prefix)));
  });
  document.querySelectorAll('.word-button').forEach(button => {
    button.setAttribute('aria-pressed', String(selectedWords.has(button.dataset.wordId)));
  });

  const actionParts = [];
  if (includesBaseAttack) {
    const prefixNames = selectedPrefixKeys.map(key => PREFIXES[key].label);
    actionParts.push(`${prefixNames.join(' ')}${prefixNames.length ? ' ' : ''}Attack`);
  } else if (selectedPrefixKeys.length) {
    actionParts.push(`${selectedPrefixKeys.map(key => PREFIXES[key].label).join(' ')} Spell`);
  }
  if (selected.length) actionParts.push(selected.map(word => word.word).join(' '));
  spellPhrase.textContent = actionParts.join(' · ') || 'Choose an attack or Words of Power';
  spellAp.textContent = `${ap} AP${isSmite ? ' · Source Smite costs 0 AP' : ''}`;
  spellResources.textContent = mana || dust
    ? [mana ? `${mana} Mana` : '', dust ? `${dust} Dust` : ''].filter(Boolean).join(' · ')
    : 'None';
  spellPotential.textContent = `${potential} wound${potential === 1 ? '' : 's'} max`;

  const hasHoldStill = selected.some(word => word.id === 'hold' && word.category === 'mastery');
  if (selected.length < 2) {
    spellDifficulty.textContent = 'No spellcasting check';
  } else {
    let difficultyIndex = Math.min(selected.length - 2, CASTING_DIFFICULTIES.length - 1);
    if (hasHoldStill) difficultyIndex = Math.max(0, difficultyIndex - 1);
    const difficulty = CASTING_DIFFICULTIES[difficultyIndex];
    spellDifficulty.textContent = `${difficulty.name} ${difficulty.dc}${hasHoldStill ? ' after Hold Still' : ''}`;
  }

  if (ap <= 3) {
    spellCharge.textContent = ap ? 'Resolve within one normal turn.' : '';
  } else {
    const turns = Math.ceil(ap / 3);
    const releaseAp = ap - ((turns - 1) * 3);
    spellCharge.textContent = `${turns}-turn action: charge for ${turns - 1} turn${turns === 2 ? '' : 's'}, then release with ${releaseAp} AP.`;
  }

  const effects = [];
  if (includesBaseAttack) effects.push('Includes a base Attack: 1 AP and 2 damage potential.');
  if (isSmite) effects.push(`${selected[0].name} is used as a Smite: it costs Mana but no additional AP.`);
  for (const key of selectedPrefixKeys) effects.push(...PREFIXES[key].effects);
  if (prefixPotential > 0) effects.push(`Attack prefixes increase damage potential by ${prefixPotential}.`);
  effects.push(...selected.map(word => `${word.name}: ${word.effect}`));
  if (wordPotential > 0) effects.push(`Sources and Shapes add ${wordPotential} damage potential.`);
  if (selectedPrefixes.has('dashing')) effects.push(`Dashing movement: up to ${potential * 5} m (${potential} potential × 5 m).`);
  if (selectedPrefixKeys.length && !includesBaseAttack && !attackLike) {
    effects.push('Attack prefixes need a base Attack or an attack-like Shape.');
  }
  if (selected.length >= 2) effects.push('Failure loses the Mana committed to the spell.');

  spellEffects.replaceChildren(...effects.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

function renderSpellComposer() {
  renderActionComposer();
}

clearWordsButton.addEventListener('click', () => {
  selectedWords.clear();
  renderSpellComposer();
});

initializeWordLists();
syncViewFromHash();
renderAttackComposer();
renderSpellComposer();
