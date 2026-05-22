/* ============================================================
   Dinner Decider – Application Logic
   ============================================================
   Before deploying, replace the two placeholder values below
   with your Supabase project URL and anon key.
   See README.md for full setup instructions.
   ============================================================ */

const SUPABASE_URL      = 'https://krxepzgollfzdqqdkgtu.supabase.co/';
const SUPABASE_ANON_KEY = 'sb_publishable_uuavBMqeKxt9xf-WZPcRoQ_l71gyD4x';

// ============================================================
// Constants
// ============================================================

const IS_CONFIGURED =
  SUPABASE_URL      !== 'YOUR_SUPABASE_URL' &&
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

const MEAL_STYLES = [
  'American', 'Asian', 'British', 'Chinese', 'French', 'Greek',
  'Indian', 'Italian', 'Japanese', 'Mediterranean', 'Mexican',
  'Middle Eastern', 'Spanish', 'Thai', 'Vietnamese', 'Other',
];

// Badge background colours keyed by style name
const STYLE_COLORS = {
  American:       '#3b82f6',
  Asian:          '#ef4444',
  British:        '#7c3aed',
  Chinese:        '#dc2626',
  French:         '#2563eb',
  Greek:          '#0284c7',
  Indian:         '#ea580c',
  Italian:        '#16a34a',
  Japanese:       '#db2777',
  Mediterranean:  '#0891b2',
  Mexican:        '#ca8a04',
  'Middle Eastern': '#d97706',
  Spanish:        '#b91c1c',
  Thai:           '#65a30d',
  Vietnamese:     '#15803d',
  Other:          '#6b7280',
};

// ============================================================
// App state
// ============================================================

let db           = null;   // Supabase client
let currentUser  = null;
let currentFamily = null;
let meals        = [];
let mealPlans    = {};     // keyed by YYYY-MM-DD
let editingMealId = null;

// ============================================================
// Initialisation
// ============================================================

async function init() {
  if (!IS_CONFIGURED) {
    showScreen('config');
    return;
  }

  // Initialise Supabase client
  const { createClient } = supabase;
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Supabase automatically handles the OAuth redirect tokens in the URL hash.
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    currentUser = session.user;
    await checkFamily();
  } else {
    showScreen('login');
  }

  // Keep UI in sync when auth changes (e.g. after OAuth redirect)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      await checkFamily();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentFamily = null;
      showScreen('login');
    }
  });
}

// ============================================================
// Screen / tab navigation
// ============================================================

function showScreen(name) {
  ['loading', 'config', 'login', 'family', 'app'].forEach(s => {
    const el = document.getElementById(`${s}-screen`);
    if (el) el.hidden = (s !== name);
  });
}

function showTab(name) {
  ['meals', 'planner'].forEach(t => {
    document.getElementById(`${t}-tab-btn`).classList.toggle('active', t === name);
    document.getElementById(`${t}-tab`).hidden = (t !== name);
  });
  if (name === 'planner') loadPlanner();
}

// ============================================================
// Inline notifications
// ============================================================

function showMsg(containerId, msg, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, type === 'error' ? 6000 : 3000);
}

const showError   = (id, msg) => showMsg(id, msg, 'error');
const showSuccess = (id, msg) => showMsg(id, msg, 'success');

// ============================================================
// Authentication – Microsoft (Azure) OAuth via Supabase
// ============================================================

async function signInWithMicrosoft() {
  const btn = document.getElementById('microsoft-signin-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting…';

  const { error } = await db.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'openid email profile',
      // Redirect back to exactly this page after Microsoft auth
      redirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) {
    showError('login-msg', error.message);
    btn.disabled = false;
    btn.textContent = 'Sign in with Microsoft';
  }
}

async function signOut() {
  localStorage.removeItem('familyId');
  await db.auth.signOut();
}

// ============================================================
// Family management
// ============================================================

async function checkFamily() {
  const savedId = localStorage.getItem('familyId');

  if (savedId) {
    const { data } = await db
      .from('user_families')
      .select('family_id, families(*)')
      .eq('user_id', currentUser.id)
      .eq('family_id', savedId)
      .maybeSingle();

    if (data?.families) {
      currentFamily = data.families;
      await enterApp();
      return;
    }
    // Saved id is stale – clear it
    localStorage.removeItem('familyId');
  }

  showScreen('family');
}

async function joinFamily() {
  const codeInput = document.getElementById('join-code');
  const code = codeInput.value.trim().toUpperCase();

  if (!code) {
    showError('family-msg', 'Please enter a family code.');
    return;
  }

  const btn = document.getElementById('join-btn');
  btn.disabled = true;

  const { data: family } = await db
    .from('families')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!family) {
    showError('family-msg', 'Family code not found. Double-check the code and try again.');
    btn.disabled = false;
    return;
  }

  const { error } = await db
    .from('user_families')
    .upsert({ user_id: currentUser.id, family_id: family.id });

  if (error) {
    showError('family-msg', 'Failed to join family: ' + error.message);
    btn.disabled = false;
    return;
  }

  currentFamily = family;
  localStorage.setItem('familyId', family.id);
  await enterApp();
}

async function createFamily() {
  const codeInput = document.getElementById('create-code');
  const nameInput = document.getElementById('create-name');
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!code) {
    showError('family-msg', 'Please enter a family code.');
    return;
  }
  if (!/^[A-Z0-9]{3,12}$/.test(code)) {
    showError('family-msg', 'Code must be 3–12 letters or numbers with no spaces.');
    return;
  }
  if (!name) {
    showError('family-msg', 'Please enter a family name.');
    return;
  }

  const btn = document.getElementById('create-btn');
  btn.disabled = true;

  const { data: family, error } = await db
    .from('families')
    .insert({ code, name })
    .select()
    .single();

  if (error) {
    const msg = error.message.toLowerCase().includes('duplicate') || error.message.includes('23505')
      ? 'That code is already taken — try a different one.'
      : 'Failed to create family: ' + error.message;
    showError('family-msg', msg);
    btn.disabled = false;
    return;
  }

  const { error: joinErr } = await db
    .from('user_families')
    .insert({ user_id: currentUser.id, family_id: family.id });

  if (joinErr) {
    showError('family-msg', 'Failed to join family: ' + joinErr.message);
    btn.disabled = false;
    return;
  }

  currentFamily = family;
  localStorage.setItem('familyId', family.id);
  await enterApp();
}

function switchFamily() {
  localStorage.removeItem('familyId');
  currentFamily = null;
  meals = [];
  mealPlans = {};
  showScreen('family');
  // Reset the family form inputs
  ['join-code', 'create-code', 'create-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function enterApp() {
  updateHeader();
  await loadMeals();
  showScreen('app');
  showTab('meals');
}

// ============================================================
// Header
// ============================================================

function updateHeader() {
  const meta = currentUser?.user_metadata || {};
  const userName = meta.name || meta.full_name || currentUser?.email || 'User';
  document.getElementById('user-name').textContent = userName;
  document.getElementById('family-name').textContent =
    currentFamily?.name ? `${currentFamily.name} (${currentFamily.code})` : currentFamily?.code || '';
}

// ============================================================
// Meals – load & render
// ============================================================

async function loadMeals() {
  const { data, error } = await db
    .from('meals')
    .select('*')
    .eq('family_id', currentFamily.id)
    .order('name');

  if (error) {
    showError('meal-msg', 'Failed to load meals: ' + error.message);
    return;
  }

  meals = data || [];
  renderMeals();
  updateMealCount();
}

function renderMeals() {
  const list   = document.getElementById('meals-list');
  const filter = document.getElementById('style-filter')?.value || '';

  const filtered = filter ? meals.filter(m => m.style === filter) : meals;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🍽️</span>
        <p>${meals.length === 0
          ? 'No meals yet. Add your first meal using the form above!'
          : 'No meals match the selected style.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(meal => `
    <div class="meal-card" data-id="${meal.id}">
      <div class="meal-info">
        <div class="meal-name">${escapeHtml(meal.name)}</div>
        <div class="meal-meta">
          ${meal.style
            ? `<span class="style-badge" style="background:${STYLE_COLORS[meal.style] || '#6b7280'}">${escapeHtml(meal.style)}</span>`
            : ''}
          ${meal.reference
            ? `<span class="meal-reference">📖 ${escapeHtml(meal.reference)}</span>`
            : ''}
        </div>
      </div>
      <div class="meal-actions">
        <button class="btn-icon" onclick="editMeal('${meal.id}')" title="Edit meal" aria-label="Edit ${escapeHtml(meal.name)}">✏️</button>
        <button class="btn-icon" onclick="deleteMeal('${meal.id}')" title="Delete meal" aria-label="Delete ${escapeHtml(meal.name)}">🗑️</button>
      </div>
    </div>`).join('');
}

function updateMealCount() {
  const el = document.getElementById('meals-count');
  if (el) el.textContent = meals.length === 1 ? '1 meal' : `${meals.length} meals`;
}

// ============================================================
// Meals – add / edit / delete
// ============================================================

async function saveMeal() {
  const nameInput  = document.getElementById('meal-name');
  const refInput   = document.getElementById('meal-reference');
  const styleInput = document.getElementById('meal-style');

  const name      = nameInput.value.trim();
  const reference = refInput.value.trim();
  const style     = styleInput.value;

  if (!name) {
    showError('meal-msg', 'Please enter a meal name.');
    nameInput.focus();
    return;
  }

  const btn = document.getElementById('save-meal-btn');
  btn.disabled = true;

  if (editingMealId) {
    const { error } = await db
      .from('meals')
      .update({ name, reference, style })
      .eq('id', editingMealId);

    if (error) {
      showError('meal-msg', 'Failed to update meal: ' + error.message);
    } else {
      cancelEdit();
      await loadMeals();
      showSuccess('meal-msg', 'Meal updated!');
    }
  } else {
    const { error } = await db
      .from('meals')
      .insert({
        family_id:  currentFamily.id,
        name,
        reference,
        style,
        created_by: currentUser.id,
      });

    if (error) {
      showError('meal-msg', 'Failed to add meal: ' + error.message);
    } else {
      nameInput.value  = '';
      refInput.value   = '';
      styleInput.value = '';
      nameInput.focus();
      await loadMeals();
      showSuccess('meal-msg', 'Meal added!');
    }
  }

  btn.disabled = false;
}

function editMeal(id) {
  const meal = meals.find(m => m.id === id);
  if (!meal) return;

  editingMealId = id;
  document.getElementById('meal-name').value      = meal.name;
  document.getElementById('meal-reference').value = meal.reference || '';
  document.getElementById('meal-style').value     = meal.style     || '';
  document.getElementById('save-meal-btn').textContent   = 'Update Meal';
  document.getElementById('cancel-edit-btn').hidden = false;
  document.getElementById('form-title').textContent = 'Edit Meal';
  document.getElementById('meal-name').focus();
  document.getElementById('meal-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelEdit() {
  editingMealId = null;
  document.getElementById('meal-name').value      = '';
  document.getElementById('meal-reference').value = '';
  document.getElementById('meal-style').value     = '';
  document.getElementById('save-meal-btn').textContent   = 'Add Meal';
  document.getElementById('cancel-edit-btn').hidden = true;
  document.getElementById('form-title').textContent = 'Add a Meal';
}

async function deleteMeal(id) {
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  if (!confirm(`Delete "${meal.name}"?\nIt will also be removed from any meal plans.`)) return;

  const { error } = await db
    .from('meals')
    .delete()
    .eq('id', id);

  if (error) {
    showError('meal-msg', 'Failed to delete meal: ' + error.message);
  } else {
    if (editingMealId === id) cancelEdit();
    await loadMeals();
    showSuccess('meal-msg', 'Meal deleted.');
  }
}

// ============================================================
// Planner
// ============================================================

function getNext7Days() {
  const days  = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function toISODate(date) {
  // Returns YYYY-MM-DD in local time (not UTC)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
  });
}

async function loadPlanner() {
  const days      = getNext7Days();
  const startDate = toISODate(days[0]);
  const endDate   = toISODate(days[6]);

  const { data, error } = await db
    .from('meal_plans')
    .select('*, meals(*)')
    .eq('family_id', currentFamily.id)
    .gte('plan_date', startDate)
    .lte('plan_date', endDate);

  if (error) {
    showError('planner-msg', 'Failed to load meal plans: ' + error.message);
    return;
  }

  mealPlans = {};
  (data || []).forEach(plan => { mealPlans[plan.plan_date] = plan; });

  renderPlanner(days);
}

function renderPlanner(days) {
  const container = document.getElementById('planner-days');
  const todayStr  = toISODate(new Date());

  const mealOptions = meals.map(m =>
    `<option value="${m.id}">${escapeHtml(m.name)}${m.style ? ` (${escapeHtml(m.style)})` : ''}</option>`
  ).join('');

  container.innerHTML = days.map(date => {
    const dateStr = toISODate(date);
    const plan    = mealPlans[dateStr];
    const isToday = dateStr === todayStr;

    return `
      <div class="day-card${isToday ? ' today' : ''}">
        <div class="day-header">
          <span class="day-name">${formatDisplayDate(date)}</span>
          ${isToday ? '<span class="today-badge">Today</span>' : ''}
        </div>
        <div class="day-content">
          <select class="day-meal-select" id="sel-${dateStr}" aria-label="Meal for ${formatDisplayDate(date)}">
            <option value="">— No meal planned —</option>
            ${mealOptions}
          </select>
          <input type="text" class="day-notes" id="notes-${dateStr}"
                 placeholder="Notes (optional)"
                 value="${plan?.notes ? escapeHtml(plan.notes) : ''}"
                 aria-label="Notes for ${formatDisplayDate(date)}">
          <div class="day-actions">
            <button class="btn btn-primary btn-small" onclick="saveDayPlan('${dateStr}')">Save</button>
            ${plan ? `<button class="btn btn-ghost btn-small" onclick="clearDayPlan('${dateStr}')">Clear</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  // Restore selected meals (must happen after innerHTML is set)
  days.forEach(date => {
    const dateStr = toISODate(date);
    const plan    = mealPlans[dateStr];
    if (plan?.meal_id) {
      const sel = document.getElementById(`sel-${dateStr}`);
      if (sel) sel.value = plan.meal_id;
    }
  });
}

async function saveDayPlan(dateStr) {
  const mealId = document.getElementById(`sel-${dateStr}`).value || null;
  const notes  = document.getElementById(`notes-${dateStr}`).value.trim();

  const { error } = await db
    .from('meal_plans')
    .upsert(
      {
        family_id:  currentFamily.id,
        plan_date:  dateStr,
        meal_id:    mealId,
        notes,
        created_by: currentUser.id,
      },
      { onConflict: 'family_id,plan_date' }
    );

  if (error) {
    showError('planner-msg', 'Failed to save plan: ' + error.message);
  } else {
    showSuccess('planner-msg', 'Plan saved!');
    await loadPlanner();
  }
}

async function clearDayPlan(dateStr) {
  if (!confirm("Clear this day's meal plan?")) return;

  const { error } = await db
    .from('meal_plans')
    .delete()
    .eq('family_id', currentFamily.id)
    .eq('plan_date', dateStr);

  if (error) {
    showError('planner-msg', 'Failed to clear plan: ' + error.message);
  } else {
    await loadPlanner();
  }
}

// ============================================================
// Utilities
// ============================================================

function escapeHtml(text) {
  const node = document.createTextNode(String(text));
  const div  = document.createElement('div');
  div.appendChild(node);
  return div.innerHTML;
}

function populateStyleDropdown() {
  const sel = document.getElementById('meal-style');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">Select style…</option>' +
    MEAL_STYLES.map(s => `<option value="${s}">${s}</option>`).join('');
}

function populateStyleFilter() {
  const sel = document.getElementById('style-filter');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">All styles</option>' +
    MEAL_STYLES.map(s => `<option value="${s}">${s}</option>`).join('');
}

// ============================================================
// Boot
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  populateStyleDropdown();
  populateStyleFilter();
  init();
});
