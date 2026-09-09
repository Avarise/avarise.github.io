'use strict';

const STORAGE_KEY = 'sigilrpg-stat-tracker-v1';
const ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'SEN', 'AUR'];
const DICE = [4, 6, 8, 10, 12, 20, 100];

let state = loadState();

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

  for (const attribute of ATTRIBUTES) {
    stats.append(renderStat(character, attribute));
  }

  endRoundButton.disabled = pendingCount === 0 || character.dead;
  clearPendingButton.disabled = pendingCount === 0;

  name.addEventListener('change', () => {
    character.name = name.value.trim() || 'Unnamed';
    saveState();
    name.value = character.name;
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

function renderStat(character, attribute) {
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

  const max = document.createElement('span');
  max.className = 'max-die';
  max.textContent = `max d${character.maximum[attribute]}`;

  dice.append(current, max);

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

  controls.append(undo, damage);
  row.append(statName, dice, controls);
  return row;
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

// --- Single-page combat guide ------------------------------------------------

const trackerView = document.querySelector('#trackerView');
const guideView = document.querySelector('#guideView');
const trackerViewButton = document.querySelector('#trackerViewButton');
const guideViewButton = document.querySelector('#guideViewButton');
const topbarActions = document.querySelector('#topbarActions');
const pageTitle = document.querySelector('#pageTitle');
const clearPrefixesButton = document.querySelector('#clearPrefixesButton');
const prefixButtons = [...document.querySelectorAll('.prefix-button')];
const attackName = document.querySelector('#attackName');
const attackCost = document.querySelector('#attackCost');
const attackPotential = document.querySelector('#attackPotential');
const apPips = document.querySelector('#apPips');
const potentialPips = document.querySelector('#potentialPips');
const attackEffects = document.querySelector('#attackEffects');
const attackWarning = document.querySelector('#attackWarning');

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

trackerViewButton.addEventListener('click', () => setAppView('tracker'));
guideViewButton.addEventListener('click', () => setAppView('guide'));
window.addEventListener('hashchange', syncViewFromHash);

prefixButtons.forEach(button => {
  button.addEventListener('click', () => {
    const prefix = button.dataset.prefix;
    if (selectedPrefixes.has(prefix)) selectedPrefixes.delete(prefix);
    else selectedPrefixes.add(prefix);
    renderAttackComposer();
  });
});

clearPrefixesButton.addEventListener('click', () => {
  selectedPrefixes.clear();
  renderAttackComposer();
});

function setAppView(view, updateHash = true) {
  const showGuide = view === 'guide';
  trackerView.hidden = showGuide;
  guideView.hidden = !showGuide;
  topbarActions.hidden = showGuide;
  trackerViewButton.classList.toggle('active', !showGuide);
  guideViewButton.classList.toggle('active', showGuide);
  trackerViewButton.toggleAttribute('aria-current', !showGuide);
  guideViewButton.toggleAttribute('aria-current', showGuide);
  pageTitle.textContent = showGuide ? 'Combat Guide' : 'Stat Tracker';

  if (updateHash) {
    const hash = showGuide ? '#guide' : '#tracker';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function syncViewFromHash() {
  setAppView(location.hash === '#guide' ? 'guide' : 'tracker', false);
}

function renderAttackComposer() {
  let potential = 2;
  const labels = [];
  const effects = [];

  for (const button of prefixButtons) {
    const key = button.dataset.prefix;
    const selected = selectedPrefixes.has(key);
    button.setAttribute('aria-pressed', String(selected));
    if (!selected) continue;

    const prefix = PREFIXES[key];
    labels.push(prefix.label);
    potential += prefix.potential;
    effects.push(...prefix.effects);
  }

  const potentialIncrease = potential - 2;
  if (potentialIncrease > 0) {
    effects.push(`Damage potential increases by ${potentialIncrease}.`);
  }

  const cost = 1 + labels.length;
  attackName.textContent = labels.length ? `${labels.join(' ')} Attack` : 'Basic Attack';
  attackCost.textContent = `${cost} AP`;
  attackPotential.textContent = `${potential} wound${potential === 1 ? '' : 's'} max`;

  renderPips(apPips, cost);
  renderPips(potentialPips, potential);

  if (selectedPrefixes.has('dashing')) {
    effects.push(`Dashing movement: up to ${potential * 5} m (${potential} potential × 5 m).`);
  }

  attackEffects.replaceChildren(...effects.map(effect => {
    const item = document.createElement('li');
    item.textContent = effect;
    return item;
  }));

  attackWarning.hidden = cost <= 3;
  attackWarning.textContent = cost > 3
    ? `${cost} AP exceeds the normal 3 AP available in a turn.`
    : '';
}

function renderPips(container, count) {
  container.replaceChildren(...Array.from({ length: count }, () => document.createElement('i')));
}

syncViewFromHash();
renderAttackComposer();
