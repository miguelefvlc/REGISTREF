/**
 * REGISTRE DIARI EF — Aplicació Web & PWA Offline-First amb Compte Supabase
 * Reprodueix el sistema d'inici de sessió i persistència al núvol d'ARMYMAKER (Supabase Auth + PostgreSQL RLS + Offline LocalStorage).
 */

const STORAGE_KEY = 'REGISTRE_DIARI_EF_STATE_V2';
const SYNC_META_KEY = 'REGISTRE_DIARI_EF_SYNC_META_V2';
const RUNTIME_SB_KEY = 'REGISTRE_DIARI_EF_SUPABASE_CFG_V1';

const DEFAULT_SUPABASE_URL = 'https://cqxvukljturlyqtpowpv.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_AYe5oYzaEd__pyALmWe7DQ_w985V7Je';

const CATEGORIES = [
  // BENESTAR PERSONAL (5)
  { id: 'necesser', label: 'NECESSER', group: 'benestar', groupLabel: 'Benestar Personal' },
  { id: 'endrec', label: 'ENDREÇ', group: 'benestar', groupLabel: 'Benestar Personal' },
  { id: 'roba', label: 'ROBA', group: 'benestar', groupLabel: 'Benestar Personal' },
  { id: 'hidratacio', label: 'HIDRATACIÓ', group: 'benestar', groupLabel: 'Benestar Personal' },
  { id: 'escalfament', label: 'ESCALFAMENT', group: 'benestar', groupLabel: 'Benestar Personal', isLastInGroup: true },
  // ACTITUD I PARTICIPACIÓ (5)
  { id: 'normes', label: 'NORMES', group: 'actitud', groupLabel: 'Actitud i Participació' },
  { id: 'implicacio', label: 'IMPLICACIÓ', group: 'actitud', groupLabel: 'Actitud i Participació' },
  { id: 'joc_net', label: 'JOC NET', group: 'actitud', groupLabel: 'Actitud i Participació' },
  { id: 'germanor', label: 'GERMANOR', group: 'actitud', groupLabel: 'Actitud i Participació' },
  { id: 'material', label: 'MATERIAL', group: 'actitud', groupLabel: 'Actitud i Participació' }
];

// Normalize "Cognoms, Nom" -> "Nom Cognoms" (Nombre y Apellidos)
function formatToNameAndSurnames(rawName) {
  const str = String(rawName || '').trim();
  if (!str) return '';
  if (str.includes(',')) {
    const parts = str.split(',');
    const surnames = parts[0].trim();
    const givenName = parts.slice(1).join(' ').trim();
    if (givenName && surnames) {
      return `${givenName} ${surnames}`;
    }
  }
  return str;
}

// Automatic detection of today's date in YYYY-MM-DD
function getTodayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format YYYY-MM-DD to DD/MM/YYYY
function formatDateCA(isoDate) {
  if (!isoDate) return 'Sense data';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Generate unique ID
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

// Default Initial State (Completely Empty — no invented groups or students)
function createDefaultState() {
  return {
    updatedAt: 0,
    activeGroupId: '',
    activeTrimestre: '1r',
    activeView: 'daily', // 'daily' | 'accum'
    activeSessionNum: 1,
    groups: []
  };
}

// Strip legacy demo groups (grup_5a / grup_6b with demo IDs) if they were previously stored
function stripLegacyDemoGroups(stObj) {
  if (!stObj || !Array.isArray(stObj.groups)) return stObj;
  stObj.groups = stObj.groups.filter(g => {
    if (!g) return false;
    const isDemo5A = g.id === 'grup_5a' && Array.isArray(g.students) && g.students.some(s => s.id === 'al_1' && s.name.includes('Alberich'));
    const isDemo6B = g.id === 'grup_6b' && Array.isArray(g.students) && g.students.some(s => s.id === 'al_601' && s.name.includes('Arnal'));
    return !isDemo5A && !isDemo6B;
  });
  if (stObj.groups.length > 0) {
    if (!stObj.groups.some(g => g.id === stObj.activeGroupId)) {
      stObj.activeGroupId = stObj.groups[0].id;
    }
  } else {
    stObj.activeGroupId = '';
  }
  return stObj;
}

// =========================================================================
// SUPABASE CLIENT & AUTH / CLOUD SYNC STATE (Dedicated Project: registre_ef_state)
// =========================================================================
let supabaseClient = null;
let currentUser = null;
let authMode = 'signin'; // 'signin' | 'signup' | 'reset'
let syncMeta = loadSyncMeta();
let pushDebounceTimer = null;

function getEffectiveSupabaseConfig() {
  const winCfg = window.APP_CONFIG || {};
  let saved = null;
  try {
    const raw = localStorage.getItem(RUNTIME_SB_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {}
  return {
    supabaseUrl: (winCfg.supabaseUrl || (saved && saved.supabaseUrl) || DEFAULT_SUPABASE_URL).trim(),
    supabaseAnonKey: (winCfg.supabaseAnonKey || (saved && saved.supabaseAnonKey) || DEFAULT_SUPABASE_KEY).trim(),
  };
}

try {
  const sbCfg = getEffectiveSupabaseConfig();
  if (sbCfg.supabaseUrl && sbCfg.supabaseAnonKey && window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(sbCfg.supabaseUrl, sbCfg.supabaseAnonKey);
  }
} catch (err) {
  console.error('Error inicialitzant Supabase:', err);
}

function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { pendingSync: false, lastSyncedAt: 0 };
    return JSON.parse(raw);
  } catch {
    return { pendingSync: false, lastSyncedAt: 0 };
  }
}

function saveSyncMeta() {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
  } catch {}
}

// Application Runtime State
let state = loadStateFromLocal();
let activeCellNoteContext = null; // { studentId, catId }

function normalizeStateNames(stObj) {
  if (!stObj || !Array.isArray(stObj.groups)) return stObj;
  stripLegacyDemoGroups(stObj);
  stObj.groups.forEach(g => {
    if (Array.isArray(g.students)) {
      g.students.forEach(st => {
        st.name = formatToNameAndSurnames(st.name);
      });
    }
  });
  return stObj;
}

function loadStateFromLocal() {
  try {
    const rawV2 = localStorage.getItem('REGISTRE_DIARI_EF_STATE_V2');
    const rawV1 = localStorage.getItem('REGISTRE_DIARI_EF_STATE_V1');
    const parsedV2 = rawV2 ? stripLegacyDemoGroups(JSON.parse(rawV2)) : null;
    const parsedV1 = rawV1 ? stripLegacyDemoGroups(JSON.parse(rawV1)) : null;

    const hasV2 = parsedV2 && Array.isArray(parsedV2.groups) && parsedV2.groups.length > 0;
    const hasV1 = parsedV1 && Array.isArray(parsedV1.groups) && parsedV1.groups.length > 0;

    let chosen = null;
    if (hasV2 && hasV1) {
      chosen = (Number(parsedV1.updatedAt || 0) > Number(parsedV2.updatedAt || 0)) ? parsedV1 : parsedV2;
    } else if (hasV2) {
      chosen = parsedV2;
    } else if (hasV1) {
      chosen = parsedV1;
    }

    if (!chosen) return createDefaultState();
    return normalizeStateNames(chosen);
  } catch (e) {
    console.error('Error carregant dades locals:', e);
    return createDefaultState();
  }
}

function saveStateToLocal(skipCloudPush = false) {
  if (!skipCloudPush) {
    state.updatedAt = Date.now();
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error guardant a localStorage:', e);
  }

  if (!skipCloudPush && currentUser && supabaseClient) {
    syncMeta.pendingSync = true;
    saveSyncMeta();
    if (navigator.onLine === false) {
      updateAccountStatusUI('pending');
    } else {
      scheduleCloudPush();
    }
  }
}

// Merge two states safely so offline sessions/groups/students are never lost when syncing
function mergeStates(primaryState, secondaryState) {
  if (!secondaryState || !Array.isArray(secondaryState.groups)) return primaryState;
  const merged = JSON.parse(JSON.stringify(primaryState));

  secondaryState.groups.forEach(secGroup => {
    const primGroup = merged.groups.find(g => g.id === secGroup.id);
    if (!primGroup) {
      merged.groups.push(JSON.parse(JSON.stringify(secGroup)));
      return;
    }

    if (Array.isArray(secGroup.students)) {
      secGroup.students.forEach(secSt => {
        if (!primGroup.students.some(s => s.id === secSt.id)) {
          primGroup.students.push(JSON.parse(JSON.stringify(secSt)));
        }
      });
    }

    if (secGroup.trimestres) {
      if (!primGroup.trimestres) primGroup.trimestres = {};
      Object.keys(secGroup.trimestres).forEach(tKey => {
        if (!primGroup.trimestres[tKey]) {
          primGroup.trimestres[tKey] = JSON.parse(JSON.stringify(secGroup.trimestres[tKey]));
          return;
        }
        const primT = primGroup.trimestres[tKey];
        const secT = secGroup.trimestres[tKey];

        if (secT.sessions) {
          if (!primT.sessions) primT.sessions = {};
          Object.keys(secT.sessions).forEach(sNum => {
            const primSess = primT.sessions[sNum];
            const secSess = secT.sessions[sNum];
            if (!primSess || (Number(secSess.finalizedAt || 0) > Number(primSess.finalizedAt || 0))) {
              primT.sessions[sNum] = JSON.parse(JSON.stringify(secSess));
            }
          });
        }
      });
    }
  });

  merged.updatedAt = Math.max(Number(primaryState.updatedAt || 0), Number(secondaryState.updatedAt || 0));
  return normalizeStateNames(merged);
}

function scheduleCloudPush() {
  if (!currentUser || !supabaseClient) return;
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushStateToSupabase(true);
  }, 850);
}

async function fetchRemoteStateFromSupabase() {
  if (!supabaseClient || !currentUser) return null;

  const { data, error } = await supabaseClient
    .from('registre_ef_state')
    .select('data, updated_at')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) throw error;
  return data ? data.data : null;
}

async function pushStateToSupabase(silent = true) {
  if (!supabaseClient || !currentUser) return;

  if (navigator.onLine === false) {
    syncMeta.pendingSync = true;
    saveSyncMeta();
    updateAccountStatusUI('pending');
    return;
  }

  updateAccountStatusUI('syncing');

  try {
    const { error } = await supabaseClient
      .from('registre_ef_state')
      .upsert({
        user_id: currentUser.id,
        data: state,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;

    syncMeta.pendingSync = false;
    syncMeta.lastSyncedAt = Date.now();
    saveSyncMeta();
    updateAccountStatusUI('connected');
    if (!silent) showToast('✓ Dades guardades i sincronitzades al teu compte!', 'success');
  } catch (err) {
    console.error('Error guardant a Supabase:', err);
    syncMeta.pendingSync = true;
    saveSyncMeta();
    updateAccountStatusUI('pending');
    if (!silent) showToast(`Error Supabase: ${err.message || 'Revisa permisos SQL'}`, 'info');
  }
}

async function syncWithSupabaseAccount(silent = true) {
  if (!supabaseClient || !currentUser) {
    updateAccountStatusUI();
    return;
  }

  if (navigator.onLine === false) {
    updateAccountStatusUI('pending');
    if (!silent) showToast('Sense internet: treballant amb les dades guardades al dispositiu.');
    return;
  }

  updateAccountStatusUI('syncing');

  try {
    const rawRemoteState = await fetchRemoteStateFromSupabase();
    const remoteGroupCountBefore = (rawRemoteState && Array.isArray(rawRemoteState.groups)) ? rawRemoteState.groups.length : 0;
    const remoteState = rawRemoteState ? normalizeStateNames(JSON.parse(JSON.stringify(rawRemoteState))) : null;
    const remoteHadDemoGroups = remoteState && Array.isArray(remoteState.groups) && (remoteState.groups.length < remoteGroupCountBefore);

    if (remoteState && Array.isArray(remoteState.groups) && remoteState.groups.length > 0) {
      const localHasGroups = Array.isArray(state.groups) && state.groups.length > 0;
      const localTime = Number(state.updatedAt || 0);
      const remoteTime = Number(remoteState.updatedAt || 0);

      if (syncMeta.pendingSync && localHasGroups) {
        state = mergeStates(state, remoteState);
        saveStateToLocal(true);
        renderApp();
        await pushStateToSupabase(silent);
      } else if (!localHasGroups || remoteTime >= localTime) {
        state = remoteState;
        saveStateToLocal(true);
        renderApp();
        if (remoteHadDemoGroups) {
          await pushStateToSupabase(true);
        } else {
          updateAccountStatusUI('connected');
        }
        if (!silent) showToast('✓ Grups i registres carregats del teu compte!', 'success');
      } else {
        state = mergeStates(state, remoteState);
        saveStateToLocal(true);
        renderApp();
        await pushStateToSupabase(silent);
      }
    } else if (Array.isArray(state.groups) && state.groups.length > 0) {
      // Cloud account has no real groups yet, upload local real groups
      await pushStateToSupabase(silent);
    } else {
      state = createDefaultState();
      saveStateToLocal(true);
      renderApp();
      if (remoteHadDemoGroups) {
        await pushStateToSupabase(true);
      } else {
        updateAccountStatusUI('connected');
      }
    }
  } catch (err) {
    console.error('Error sincronitzant amb el compte:', err);
    updateAccountStatusUI('pending');
    if (!silent) showToast(`Error Supabase: ${err.message || 'Revisa permisos SQL'}`, 'info');
  }
}

function updateAccountStatusUI(forcedStatus = null) {
  const cornerDot = document.getElementById('cloudStatusDot');
  const modalDot = document.getElementById('accountModalDot');
  const titleEl = document.getElementById('accountSyncTitle');
  const subEl = document.getElementById('accountSyncSubtitle');
  const actionsEl = document.getElementById('accountSyncActions');

  if (!currentUser) {
    if (cornerDot) cornerDot.className = 'corner-cloud-dot';
    if (modalDot) modalDot.className = 'account-status-dot';
    if (titleEl) titleEl.textContent = 'Sense sessió iniciada (Mode local)';
    if (subEl) subEl.textContent = 'Inicia sessió per guardar els teus grups i registres al teu compte i usar-los a qualsevol dispositiu';
    if (actionsEl) {
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" onclick="openAuthModal('signin')">Iniciar sessió</button>
      `;
    }
    return;
  }

  let status = forcedStatus;
  if (!status) {
    status = (navigator.onLine === false || syncMeta.pendingSync) ? 'pending' : 'connected';
  }

  if (cornerDot) cornerDot.className = `corner-cloud-dot ${status}`;
  if (modalDot) modalDot.className = `account-status-dot ${status}`;

  if (titleEl) {
    titleEl.textContent = `Compte actiu: ${currentUser.email}`;
  }
  if (subEl) {
    if (status === 'syncing') {
      subEl.textContent = 'Sincronitzant grups i sessions amb el núvol...';
    } else if (status === 'pending') {
      subEl.textContent = 'Guardat al dispositiu · Pendent de sincronitzar quan torni internet';
    } else {
      subEl.textContent = 'Sincronització automàtica activa al núvol i en aquest dispositiu';
    }
  }
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" onclick="syncWithSupabaseAccount(false)">↻ Sincronitzar</button>
      <button type="button" class="btn btn-danger-ghost btn-sm" onclick="handleSignOut()">Tancar sessió</button>
    `;
  }
}

function resolveRedirectUrl() {
  const currentOrigin =
    window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')
      ? window.location.origin
      : 'https://miguelefvlc.github.io';
  let currentPath =
    window.location.pathname && window.location.pathname.startsWith('/') && !window.location.origin.startsWith('file:')
      ? window.location.pathname
      : '/REGISTREF/';
  if (currentPath.endsWith('index.html')) {
    currentPath = currentPath.slice(0, -'index.html'.length);
  }
  if (!currentPath.endsWith('/')) {
    currentPath += '/';
  }
  return currentOrigin + currentPath;
}

window.openAuthModal = function(mode = 'signin') {
  authMode = mode;
  renderAuthModalState();
  openModal('modalAuth');
  setTimeout(() => {
    const emailEl = document.getElementById('authEmailInput');
    if (emailEl) emailEl.focus();
  }, 60);
};

window.syncWithSupabaseAccount = syncWithSupabaseAccount;

window.handleSignOut = async function() {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch {}
  }
  currentUser = null;
  syncMeta.pendingSync = false;
  saveSyncMeta();
  try {
    localStorage.removeItem('REGISTRE_DIARI_EF_STATE_V2');
    localStorage.removeItem('REGISTRE_DIARI_EF_STATE_V1');
  } catch {}
  state = createDefaultState();
  updateAccountStatusUI();
  renderGroupsManagementModal();
  renderApp();
  showToast('Sessió tancada.');
};

function renderAuthModalState(msg = null) {
  const titleEl = document.getElementById('authModalTitle');
  const passGroup = document.getElementById('authPasswordGroup');
  const passInput = document.getElementById('authPasswordInput');
  const submitBtn = document.getElementById('btnAuthSubmit');
  const switchBtn = document.getElementById('btnSwitchAuthMode');
  const resetBtn = document.getElementById('btnSwitchResetMode');
  const msgBox = document.getElementById('authMessageBox');

  const titles = {
    signin: 'Iniciar sessió',
    signup: 'Crear compte nou',
    reset: 'Recuperar contrasenya'
  };

  if (titleEl) titleEl.textContent = titles[authMode] || 'Iniciar sessió';
  if (submitBtn) submitBtn.textContent = titles[authMode] || 'Iniciar sessió';

  if (authMode === 'reset') {
    passGroup.style.display = 'none';
    passInput.removeAttribute('required');
  } else {
    passGroup.style.display = 'block';
    passInput.setAttribute('required', 'required');
  }

  if (authMode === 'signin') {
    switchBtn.textContent = 'Crear un compte nou';
    resetBtn.style.display = 'inline-block';
  } else {
    switchBtn.textContent = '← Tornar a iniciar sessió';
    resetBtn.style.display = 'none';
  }

  if (msg) {
    msgBox.style.display = 'block';
    msgBox.className = `auth-message-box ${msg.type}`;
    msgBox.textContent = msg.text;
  } else {
    msgBox.style.display = 'none';
    msgBox.textContent = '';
  }
}

// Helper: Get active group object
function getActiveGroup() {
  let grp = state.groups.find(g => g.id === state.activeGroupId);
  if (!grp && state.groups.length > 0) {
    grp = state.groups[0];
    state.activeGroupId = grp.id;
  }
  return grp;
}

// Helper: Get session storage container for the active group
function getActiveSessionsContainer(group = getActiveGroup()) {
  if (!group) return { sessions: {}, drafts: {} };
  const key = state.activeTrimestre || '1r';
  if (!group.trimestres) {
    group.trimestres = { [key]: { sessions: {}, drafts: {} } };
  }
  if (!group.trimestres[key]) {
    group.trimestres[key] = { sessions: {}, drafts: {} };
  }
  const tData = group.trimestres[key];
  if (!tData.sessions) tData.sessions = {};
  if (!tData.drafts) tData.drafts = {};
  return tData;
}

// Find the next available uncompleted session number (1..35)
function getNextAvailableSessionNum(tData = getActiveSessionsContainer()) {
  for (let i = 1; i <= 35; i++) {
    if (!tData.sessions[String(i)]) {
      return i;
    }
  }
  return 35;
}

// Get or create the current working session object for Daily View.
function getCurrentDailySessionObj() {
  const tData = getActiveSessionsContainer();
  const sKey = String(state.activeSessionNum);

  if (tData.sessions[sKey]) {
    return {
      isFinalized: true,
      data: tData.sessions[sKey]
    };
  }

  const today = getTodayISO();
  if (!tData.drafts[sKey]) {
    tData.drafts[sKey] = {
      sessionNum: state.activeSessionNum,
      date: today,
      absences: [],
      marks: {}
    };
  } else {
    tData.drafts[sKey].date = today;
  }

  return {
    isFinalized: false,
    data: tData.drafts[sKey]
  };
}

/* ==========================================================================
   ACCUMULATED DATA CALCULATOR
   Each painted red cell in a finalized session counts as "1" in Acumulat
   ========================================================================== */
function computeAccumulatedData(group = getActiveGroup(), tData = getActiveSessionsContainer(group)) {
  const result = {
    totalSessionsCount: 0,
    students: {}
  };
  if (!group) return result;

  const sessionKeys = Object.keys(tData.sessions).sort((a, b) => Number(a) - Number(b));
  result.totalSessionsCount = sessionKeys.length;

  group.students.forEach(st => {
    const catMap = {};
    CATEGORIES.forEach(c => {
      catMap[c.id] = []; // Array of { id, date, sessionNum, note }
    });
    result.students[st.id] = {
      absences: [], // Array of { sessionNum, date }
      categories: catMap,
      totalMarks: 0,
      benestarMarks: 0,
      actitudMarks: 0
    };
  });

  sessionKeys.forEach(sKey => {
    const sess = tData.sessions[sKey];
    if (!sess) return;

    // Absences
    if (Array.isArray(sess.absences)) {
      sess.absences.forEach(stId => {
        if (result.students[stId]) {
          result.students[stId].absences.push({
            sessionNum: sess.sessionNum,
            date: sess.date
          });
        }
      });
    }

    // Conduct Marks (1 mark per painted cell per session)
    if (sess.marks && typeof sess.marks === 'object') {
      Object.keys(sess.marks).forEach(stId => {
        const stRec = result.students[stId];
        if (!stRec) return;
        const stMarksByCat = sess.marks[stId];
        if (!stMarksByCat) return;

        CATEGORIES.forEach(cat => {
          const arr = stMarksByCat[cat.id];
          if (Array.isArray(arr) && arr.length > 0) {
            const firstMark = arr[0];
            stRec.categories[cat.id].push({
              id: firstMark.id || uid('m'),
              date: firstMark.date || sess.date,
              sessionNum: sess.sessionNum,
              note: firstMark.note || ''
            });
            stRec.totalMarks += 1;
            if (cat.group === 'benestar') stRec.benestarMarks += 1;
            else stRec.actitudMarks += 1;
          }
        });
      });
    }
  });

  return result;
}

/* ==========================================================================
   UI RENDERING
   ========================================================================== */
function renderApp() {
  const group = getActiveGroup();
  const tData = getActiveSessionsContainer(group);
  const accumData = computeAccumulatedData(group, tData);

  // 1. Render Course Cell Group Selector
  const groupSelect = document.getElementById('groupSelect');
  if (state.groups.length === 0) {
    groupSelect.innerHTML = `<option value="">—</option>`;
  } else {
    groupSelect.innerHTML = state.groups.map(g =>
      `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
    ).join('');
  }

  // 2. Render Sheet Header & Top-Right View Toggle Button
  const isDaily = state.activeView === 'daily';
  document.getElementById('sheetMainTitle').textContent = isDaily ? 'REGISTRE DIARI' : 'REGISTRE ACUMULAT';

  const toggleViewBtn = document.getElementById('btnToggleViewMode');
  toggleViewBtn.classList.toggle('active-view-mode', !isDaily);
  toggleViewBtn.setAttribute(
    'title',
    isDaily ? 'Obrir Registre Acumulat' : 'Tornar al Registre Diari'
  );

  // 3. Render 1..35 Sessions Strip
  renderSessionsStrip(tData);

  // 4. Toggle Bottom Action Buttons (Finalitzar sessió in Daily / Exportar PDF in Acumulat)
  const dailyFooterActions = document.getElementById('dailyFooterActions');
  const accumFooterActions = document.getElementById('accumFooterActions');

  if (isDaily) {
    dailyFooterActions.style.display = 'flex';
    accumFooterActions.style.display = 'none';

    const { isFinalized, data: sessionObj } = getCurrentDailySessionObj();
    document.getElementById('finalizeBtnEndText').textContent = isFinalized
      ? 'Actualitzar sessió'
      : 'Finalitzar sessió';

    renderDailyTableBody(group, sessionObj);
  } else {
    dailyFooterActions.style.display = 'none';
    accumFooterActions.style.display = 'flex';

    renderAccumulatedTableBody(group, accumData);
  }

  updateAccountStatusUI();
}

// Render the 1..35 strip at the top of the sheet
function renderSessionsStrip(tData) {
  const container = document.getElementById('sessionsStripContainer');
  let html = '';
  for (let i = 1; i <= 35; i++) {
    const sKey = String(i);
    const finalizedSess = tData.sessions[sKey];
    const isCurrent = (i === Number(state.activeSessionNum));
    let cls = 'session-num-cell';
    if (finalizedSess) cls += ' completed';
    if (isCurrent) cls += ' active-session';

    const titleText = finalizedSess
      ? `Sessió ${i} (${formatDateCA(finalizedSess.date)})`
      : `Sessió ${i}`;

    html += `<div class="${cls}" data-session-num="${i}" title="${escapeHtml(titleText)}">${i}</div>`;
  }
  container.innerHTML = html;
}

// Render Daily Sheet Table Body (Cells painted clean red on 1st tap; 2nd tap opens note modal)
function renderDailyTableBody(group, sessionObj) {
  const tbody = document.getElementById('registreTableBody');
  if (!group || group.students.length === 0) {
    const emptyMsg = !currentUser
      ? `Inicia sessió des de la roda dentada (<strong>⚙</strong> dalt a l'esquerra) per carregar els teus grups i alumnes.`
      : `Encara no hi ha alumnes en aquest grup. Obre la roda dentada (<strong>⚙</strong> dalt a l'esquerra) per afegir-ne.`;
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:1.5rem 0.75rem; color:var(--text-secondary); font-size:0.8rem;">
          ${emptyMsg}
        </td>
      </tr>
    `;
    return;
  }

  const absencesSet = new Set(sessionObj.absences || []);

  tbody.innerHTML = group.students.map((student, idx) => {
    const isAbsent = absencesSet.has(student.id);
    const studentMarks = (sessionObj.marks && sessionObj.marks[student.id]) || {};

    const cellsHtml = CATEGORIES.map(cat => {
      const marksArr = studentMarks[cat.id] || [];
      const isMarked = marksArr.length > 0;
      const markObj = isMarked ? marksArr[0] : null;
      const noteText = (markObj && markObj.note) ? markObj.note.trim() : '';
      const hasNote = noteText.length > 0;

      const colClass = [
        'conduct-cell',
        cat.isLastInGroup ? 'benestar-last' : '',
        isMarked ? 'is-marked' : ''
      ].filter(Boolean).join(' ');

      const tooltipAttr = isMarked && hasNote
        ? `data-tooltip="${escapeHtml(noteText)}"`
        : '';

      return `<td class="${colClass}" data-student-id="${student.id}" data-cat-id="${cat.id}" ${tooltipAttr}></td>`;
    }).join('');

    return `
      <tr class="${isAbsent ? 'row-absent' : ''}" data-row-student="${student.id}">
        <td class="student-name-cell" data-toggle-absence="${student.id}">
          <div class="student-cell-inner">
            <div class="student-name-left">
              <span class="student-index">${idx + 1}.</span>
              <span class="student-fullname">${escapeHtml(student.name)}</span>
            </div>
          </div>
        </td>
        ${cellsHtml}
      </tr>
    `;
  }).join('');
}

// Render Accumulated Sheet Table Body (No extra columns; Faltes in a small square flush right inside the student name cell)
function renderAccumulatedTableBody(group, accumData) {
  const tbody = document.getElementById('registreTableBody');
  if (!group || group.students.length === 0) {
    const emptyMsg = !currentUser
      ? `Inicia sessió des de la roda dentada (<strong>⚙</strong> dalt a l'esquerra) per carregar els teus grups i alumnes.`
      : `Encara no hi ha alumnes en aquest grup. Obre la roda dentada (<strong>⚙</strong> dalt a l'esquerra) per afegir-ne.`;
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:1.5rem 0.75rem; color:var(--text-secondary); font-size:0.8rem;">
          ${emptyMsg}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = group.students.map((student, idx) => {
    const stAccum = accumData.students[student.id] || {
      absences: [],
      categories: {},
      totalMarks: 0
    };

    const catCellsHtml = CATEGORIES.map(cat => {
      const marksList = stAccum.categories[cat.id] || [];
      const count = marksList.length;
      const classes = [
        'conduct-cell',
        cat.isLastInGroup ? 'benestar-last' : '',
        count > 0 ? 'has-accum' : ''
      ].filter(Boolean).join(' ');

      let badgeHtml = `<span class="accum-zero">&middot;</span>`;
      let tooltipAttr = '';

      if (count > 0) {
        const badgeClass = cat.group === 'benestar'
          ? (count >= 3 ? 'accum-benestar-high' : 'accum-benestar-1')
          : (count >= 3 ? 'accum-actitud-high' : 'accum-actitud-1');
        badgeHtml = `<span class="accum-num-badge ${badgeClass}">${count}</span>`;

        const datesLines = marksList.map(m =>
          `• ${formatDateCA(m.date)} (S${m.sessionNum})${m.note ? ': ' + m.note : ''}`
        ).join('\n');
        const tooltipText = `${cat.label}: ${count}\n${datesLines}`;
        tooltipAttr = `data-tooltip="${escapeHtml(tooltipText)}"`;
      }

      return `
        <td class="${classes}" data-accum-student="${student.id}" data-accum-cat="${cat.id}" ${tooltipAttr}>
          ${badgeHtml}
        </td>
      `;
    }).join('');

    // Faltes square badge flush right inside the student name cell
    const absencesCount = stAccum.absences.length;
    let faltesTooltip = '';
    if (absencesCount > 0) {
      const fDates = stAccum.absences.map(a => `• ${formatDateCA(a.date)} (S${a.sessionNum})`).join('\n');
      faltesTooltip = `data-tooltip="${escapeHtml(`Faltes: ${absencesCount}\n${fDates}`)}"`;
    }

    return `
      <tr>
        <td class="student-name-cell" data-profile-student="${student.id}" title="Prem el nom per obrir la fitxa completa de l'alumne">
          <div class="student-cell-inner">
            <div class="student-name-left">
              <span class="student-index">${idx + 1}.</span>
              <span class="student-fullname">${escapeHtml(student.name)}</span>
            </div>
            <span class="student-faltes-square ${absencesCount > 0 ? 'has-faltes' : 'zero-faltes'}" data-accum-faltes="${student.id}" ${faltesTooltip}>
              ${absencesCount}
            </span>
          </div>
        </td>
        ${catCellsHtml}
      </tr>
    `;
  }).join('');
}

/* ==========================================================================
   DAILY SHEET INTERACTIONS (Absences, Red Cell Toggle, Notes, Finalize)
   ========================================================================== */

function toggleStudentAbsence(studentId) {
  const { data: sessionObj } = getCurrentDailySessionObj();
  if (!Array.isArray(sessionObj.absences)) sessionObj.absences = [];

  const idx = sessionObj.absences.indexOf(studentId);
  if (idx === -1) {
    sessionObj.absences.push(studentId);
  } else {
    sessionObj.absences.splice(idx, 1);
  }

  saveStateToLocal();
  renderApp();
}

function handleDailyCellTap(studentId, catId) {
  const { data: sessionObj } = getCurrentDailySessionObj();

  if (Array.isArray(sessionObj.absences) && sessionObj.absences.includes(studentId)) {
    return;
  }

  if (!sessionObj.marks) sessionObj.marks = {};
  if (!sessionObj.marks[studentId]) sessionObj.marks[studentId] = {};

  const currentArr = sessionObj.marks[studentId][catId];
  const isCurrentlyMarked = Array.isArray(currentArr) && currentArr.length > 0;

  if (isCurrentlyMarked) {
    // 2nd tap on an already painted red cell opens the annotation modal (where you can add a note or unmark)
    openCellNoteModal(studentId, catId);
    return;
  }

  // 1st tap on an empty cell paints it red immediately
  const detectedDate = sessionObj.date || getTodayISO();
  sessionObj.marks[studentId][catId] = [{
    id: uid('m'),
    date: detectedDate,
    sessionNum: state.activeSessionNum,
    note: '',
    createdAt: Date.now()
  }];

  saveStateToLocal();
  renderApp();
}

function openCellNoteModal(studentId, catId) {
  const group = getActiveGroup();
  if (!group) return;
  const student = group.students.find(s => s.id === studentId);
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!student || !cat) return;

  const { data: sessionObj } = getCurrentDailySessionObj();
  const marksArr = (sessionObj.marks && sessionObj.marks[studentId] && sessionObj.marks[studentId][catId]) || [];
  if (marksArr.length === 0) return;

  activeCellNoteContext = { studentId, catId };

  document.getElementById('cellNoteModalTitle').textContent = `Anotació · ${cat.label}`;
  document.getElementById('cellNoteModalSubtitle').textContent =
    `${student.name} · Sessió ${state.activeSessionNum} (${formatDateCA(sessionObj.date || getTodayISO())})`;

  const textarea = document.getElementById('cellNoteTextarea');
  textarea.value = marksArr[0].note || '';

  openModal('modalCellNote');
  setTimeout(() => textarea.focus(), 60);
}

function saveActiveCellNote() {
  if (!activeCellNoteContext) return;
  const { studentId, catId } = activeCellNoteContext;
  const { data: sessionObj } = getCurrentDailySessionObj();
  const marksArr = (sessionObj.marks && sessionObj.marks[studentId] && sessionObj.marks[studentId][catId]) || [];
  if (marksArr.length > 0) {
    marksArr[0].note = document.getElementById('cellNoteTextarea').value.trim();
    saveStateToLocal();
    renderApp();
  }
  activeCellNoteContext = null;
  closeModal('modalCellNote');
}

function removeMarkFromActiveNoteModal() {
  if (!activeCellNoteContext) return;
  const { studentId, catId } = activeCellNoteContext;
  const { data: sessionObj } = getCurrentDailySessionObj();
  if (sessionObj.marks && sessionObj.marks[studentId]) {
    delete sessionObj.marks[studentId][catId];
    saveStateToLocal();
    renderApp();
  }
  activeCellNoteContext = null;
  closeModal('modalCellNote');
}

function openFinalizeSessionModal() {
  const group = getActiveGroup();
  if (!group) return;
  const { isFinalized, data: sessionObj } = getCurrentDailySessionObj();

  if (!sessionObj.date) {
    sessionObj.date = getTodayISO();
  }

  const absCount = Array.isArray(sessionObj.absences) ? sessionObj.absences.length : 0;
  let marksCount = 0;
  const studentIncidents = [];

  if (sessionObj.marks) {
    group.students.forEach(st => {
      const stMarks = sessionObj.marks[st.id];
      if (!stMarks) return;
      const items = [];
      CATEGORIES.forEach(cat => {
        const arr = stMarks[cat.id] || [];
        if (arr.length > 0) {
          marksCount += 1;
          const noteStr = arr[0].note ? ` <em>(${escapeHtml(arr[0].note)})</em>` : '';
          items.push(`${cat.label}${noteStr}`);
        }
      });
      if (items.length > 0) {
        studentIncidents.push(`<li><strong>${escapeHtml(st.name)}:</strong> ${items.join(', ')}</li>`);
      }
    });
  }

  const absentNames = group.students
    .filter(st => (sessionObj.absences || []).includes(st.id))
    .map(st => escapeHtml(st.name));

  document.getElementById('finalizeModalTitle').textContent = isFinalized
    ? `Actualitzar Sessió #${state.activeSessionNum}`
    : `Finalitzar Sessió #${state.activeSessionNum}`;

  document.getElementById('finalizeModalBody').innerHTML = `
    <div style="background:var(--bg-subtle); border:1px solid var(--border-medium); border-radius:var(--radius-md); padding:0.75rem; margin-bottom:0.85rem; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; font-size:0.84rem;">
      <span><strong>Grup:</strong> ${escapeHtml(group.name)}</span>
      <span><strong>Data detectada:</strong> ${formatDateCA(sessionObj.date)}</span>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.65rem; margin-bottom:0.85rem;">
      <div style="background:#f1f5f9; color:#334155; padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:1.3rem; font-weight:800;">${absCount}</div>
        <div style="font-size:0.75rem; font-weight:700;">Alumnes absents</div>
      </div>
      <div style="background:#ffe4e6; color:#be123c; padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:1.3rem; font-weight:800;">${marksCount}</div>
        <div style="font-size:0.75rem; font-weight:700;">Caselles marcades</div>
      </div>
    </div>

    ${absentNames.length > 0 ? `
      <div style="margin-bottom:0.75rem; font-size:0.82rem;">
        <strong>Absents (${absentNames.length}):</strong>
        <p style="color:var(--text-secondary); margin-top:0.15rem;">${absentNames.join(', ')}</p>
      </div>
    ` : ''}

    ${studentIncidents.length > 0 ? `
      <div style="font-size:0.82rem;">
        <strong>Conductes registrades:</strong>
        <ul style="margin-top:0.25rem; padding-left:1.15rem; color:var(--text-secondary); line-height:1.45;">
          ${studentIncidents.join('')}
        </ul>
      </div>
    ` : `<p style="font-size:0.82rem; color:var(--text-secondary);">Cap conducta negativa marcada en aquesta sessió.</p>`}
  `;

  openModal('modalFinalizeConfirm');
}

function confirmFinalizeCurrentSession() {
  const tData = getActiveSessionsContainer();
  const sKey = String(state.activeSessionNum);
  const { isFinalized, data: sessionObj } = getCurrentDailySessionObj();

  const sessionDate = sessionObj.date || getTodayISO();
  const normalizedMarks = {};

  if (sessionObj.marks) {
    Object.keys(sessionObj.marks).forEach(stId => {
      const catMap = sessionObj.marks[stId];
      if (!catMap) return;
      Object.keys(catMap).forEach(catId => {
        const arr = catMap[catId];
        if (Array.isArray(arr) && arr.length > 0) {
          if (!normalizedMarks[stId]) normalizedMarks[stId] = {};
          normalizedMarks[stId][catId] = [{
            id: arr[0].id || uid('m'),
            date: sessionDate,
            sessionNum: Number(state.activeSessionNum),
            note: arr[0].note || ''
          }];
        }
      });
    });
  }

  tData.sessions[sKey] = {
    sessionNum: Number(state.activeSessionNum),
    date: sessionDate,
    finalizedAt: Date.now(),
    absences: Array.isArray(sessionObj.absences) ? [...sessionObj.absences] : [],
    marks: normalizedMarks
  };

  delete tData.drafts[sKey];

  const savedNum = state.activeSessionNum;

  if (!isFinalized) {
    state.activeSessionNum = getNextAvailableSessionNum(tData);
  }

  state.activeView = 'accum';

  saveStateToLocal();
  closeModal('modalFinalizeConfirm');
  renderApp();
  showToast(`✓ Sessió #${savedNum} guardada a l'Acumulat!`, 'success');
}

/* ==========================================================================
   ACCUMULATED VIEW MODALS: Cell Dates + Notes & Student Profile
   ========================================================================== */

function openAccumCellDetailModal(studentId, catId) {
  const group = getActiveGroup();
  if (!group) return;
  const student = group.students.find(s => s.id === studentId);
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!student || !cat) return;

  const tData = getActiveSessionsContainer(group);
  const accumData = computeAccumulatedData(group, tData);
  const stAccum = accumData.students[studentId];
  const marksList = (stAccum && stAccum.categories[catId]) ? stAccum.categories[catId] : [];

  document.getElementById('cellDetailTitle').textContent = `${student.name} · ${cat.label}`;

  const bodyEl = document.getElementById('cellDetailBody');

  const listHtml = marksList.length > 0
    ? marksList.map((m, i) => `
        <div class="rayita-date-item">
          <div class="rayita-item-left">
            <div class="red-mark-dot"></div>
            <div>
              <div style="font-weight:800; font-size:0.86rem; color:var(--text-primary);">
                #${i + 1} &mdash; ${formatDateCA(m.date)} <span style="font-weight:600; color:var(--text-secondary);">(Sessió ${m.sessionNum})</span>
              </div>
              ${m.note ? `<div style="font-size:0.78rem; color:#92400e; background:#fef3c7; padding:0.2rem 0.45rem; border-radius:4px; margin-top:0.2rem; display:inline-block;">✏️ ${escapeHtml(m.note)}</div>` : ''}
            </div>
          </div>
          <button type="button" class="btn btn-danger-ghost btn-sm"
            onclick="deleteMarkFromFinalizedSession('${studentId}', '${catId}', ${m.sessionNum}, '${m.id}')"
            title="Eliminar aquesta marca">
            Eliminar
          </button>
        </div>
      `).join('')
    : `<p style="font-size:0.84rem; color:var(--text-secondary); text-align:center; padding:0.85rem 0;">
        Cap marca registrada a <strong>${cat.label}</strong> en les sessions finalitzades.
      </p>`;

  bodyEl.innerHTML = `
    <div class="detail-Visual-Tally-Box">
      <div>
        <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">
          ${cat.groupLabel} &rarr; ${cat.label}
        </div>
        <div style="font-size:1.2rem; font-weight:800; color:var(--text-primary); margin-top:0.1rem;">
          Total acumulat: ${marksList.length}
        </div>
      </div>
    </div>

    <div class="detail-rayitas-list">
      ${listHtml}
    </div>
  `;

  openModal('modalCellDetail');
}

window.deleteMarkFromFinalizedSession = function(studentId, catId, sessionNum) {
  const tData = getActiveSessionsContainer();
  const sess = tData.sessions[String(sessionNum)];
  if (!sess || !sess.marks || !sess.marks[studentId] || !Array.isArray(sess.marks[studentId][catId])) return;

  delete sess.marks[studentId][catId];

  saveStateToLocal();
  renderApp();
  openAccumCellDetailModal(studentId, catId);
  showToast('Marca eliminada de l’acumulat');
};

function openAccumFaltesDetailModal(studentId) {
  const group = getActiveGroup();
  if (!group) return;
  const student = group.students.find(s => s.id === studentId);
  if (!student) return;

  const tData = getActiveSessionsContainer(group);
  const accumData = computeAccumulatedData(group, tData);
  const stAccum = accumData.students[studentId];
  const absencesList = (stAccum && stAccum.absences) ? stAccum.absences : [];

  document.getElementById('cellDetailTitle').textContent = `${student.name} · FALTES D'ASSISTÈNCIA`;

  const listHtml = absencesList.length > 0
    ? absencesList.map((a, i) => `
        <div class="rayita-date-item">
          <div class="rayita-item-left">
            <span class="accum-num-badge accum-faltes-badge">#${i + 1}</span>
            <div>
              <div style="font-weight:800; font-size:0.86rem; color:var(--text-primary);">
                Data: ${formatDateCA(a.date)}
              </div>
              <div style="font-size:0.76rem; color:var(--text-secondary);">
                Sessió #${a.sessionNum}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-sm"
            onclick="jumpToSessionFromModal(${a.sessionNum})">
            Obrir Sessió #${a.sessionNum}
          </button>
        </div>
      `).join('')
    : `<p style="font-size:0.84rem; color:var(--text-secondary); text-align:center; padding:0.85rem 0;">
        Cap falta d'assistència registrada.
      </p>`;

  document.getElementById('cellDetailBody').innerHTML = `
    <div class="detail-Visual-Tally-Box">
      <div>
        <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">
          Control d'Assistència
        </div>
        <div style="font-size:1.2rem; font-weight:800; color:#be123c; margin-top:0.1rem;">
          Total Faltes: ${absencesList.length}
        </div>
      </div>
    </div>
    <div class="detail-rayitas-list">
      ${listHtml}
    </div>
  `;

  openModal('modalCellDetail');
}

window.jumpToSessionFromModal = function(sessionNum) {
  closeModal('modalCellDetail');
  closeModal('modalStudentProfile');
  state.activeSessionNum = Number(sessionNum);
  state.activeView = 'daily';
  saveStateToLocal(true);
  renderApp();
};

function openStudentProfileModal(studentId) {
  const group = getActiveGroup();
  if (!group) return;
  const student = group.students.find(s => s.id === studentId);
  if (!student) return;

  const tData = getActiveSessionsContainer(group);
  const accumData = computeAccumulatedData(group, tData);
  const stAccum = accumData.students[studentId];
  if (!stAccum) return;

  document.getElementById('studentProfileTitle').textContent =
    `Fitxa de l'Alumne: ${student.name} (${group.name})`;

  const catRows = CATEGORIES.map(cat => {
    const marks = stAccum.categories[cat.id] || [];
    if (marks.length === 0) return '';
    const datesBadges = marks.map(m =>
      `<div style="display:inline-block; background:var(--bg-subtle); border:1px solid var(--border-medium); padding:0.2rem 0.5rem; border-radius:6px; font-size:0.75rem; font-weight:600; margin:0.15rem;">
        ${formatDateCA(m.date)} (S${m.sessionNum})${m.note ? ` · <span style="color:#b45309;">✏️ ${escapeHtml(m.note)}</span>` : ''}
      </div>`
    ).join('');

    return `
      <tr>
        <td style="padding:0.45rem; font-weight:700; font-size:0.8rem;">${cat.label}</td>
        <td style="padding:0.45rem; text-align:center; font-weight:800;">${marks.length}</td>
        <td style="padding:0.45rem;">${datesBadges}</td>
      </tr>
    `;
  }).filter(Boolean).join('');

  const absencesHtml = stAccum.absences.length > 0
    ? stAccum.absences.map(a =>
        `<span style="display:inline-block; background:#ffe4e6; color:#be123c; padding:0.2rem 0.55rem; border-radius:6px; font-size:0.76rem; font-weight:700; margin:0.15rem;">
          ${formatDateCA(a.date)} (Sessió ${a.sessionNum})
        </span>`
      ).join('')
    : '<span style="color:var(--text-secondary); font-size:0.82rem;">Cap falta d’assistència</span>';

  document.getElementById('studentProfileBody').innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.65rem; margin-bottom:1rem;">
      <div style="background:#ffe4e6; color:#be123c; padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:1.35rem; font-weight:800;">${stAccum.absences.length}</div>
        <div style="font-size:0.74rem; font-weight:700;">Faltes d'Assistència</div>
      </div>
      <div style="background:#e0f2fe; color:#075985; padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:1.35rem; font-weight:800;">${stAccum.benestarMarks}</div>
        <div style="font-size:0.74rem; font-weight:700;">Benestar Personal</div>
      </div>
      <div style="background:#fef3c7; color:#92400e; padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:1.35rem; font-weight:800;">${stAccum.actitudMarks}</div>
        <div style="font-size:0.74rem; font-weight:700;">Actitud i Participació</div>
      </div>
    </div>

    <div style="margin-bottom:0.95rem;">
      <h4 style="font-size:0.78rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.35rem;">
        Dates de Faltes d'Assistència:
      </h4>
      <div>${absencesHtml}</div>
    </div>

    <div>
      <h4 style="font-size:0.78rem; font-weight:800; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.35rem;">
        Desglossament per Conducta:
      </h4>
      ${catRows ? `
        <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-medium); font-size:0.82rem;">
          <thead>
            <tr style="background:var(--bg-subtle); text-align:left;">
              <th style="padding:0.45rem; border:1px solid var(--border-medium);">Conducta</th>
              <th style="padding:0.45rem; border:1px solid var(--border-medium); text-align:center;">Total</th>
              <th style="padding:0.45rem; border:1px solid var(--border-medium);">Dates i Anotacions</th>
            </tr>
          </thead>
          <tbody>${catRows}</tbody>
        </table>
      ` : `<p style="color:var(--text-secondary); font-size:0.82rem; padding:0.65rem; background:var(--bg-subtle); border-radius:var(--radius-md);">
        Aquest alumne no té cap marca negativa registrada.
      </p>`}
    </div>
  `;

  openModal('modalStudentProfile');
}

/* ==========================================================================
   GROUPS & STUDENTS MANAGEMENT MODAL
   ========================================================================== */
function renderGroupsManagementModal() {
  updateAccountStatusUI();

  const select = document.getElementById('manageGroupSelect');
  select.innerHTML = state.groups.map(g =>
    `<option value="${g.id}" ${g.id === state.activeGroupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
  ).join('');

  const group = getActiveGroup();
  const countEl = document.getElementById('manageStudentCount');
  const listEl = document.getElementById('manageStudentsList');

  if (!group) {
    countEl.textContent = '0';
    listEl.innerHTML = '';
    return;
  }

  countEl.textContent = String(group.students.length);

  if (group.students.length === 0) {
    listEl.innerHTML = `<div style="padding:0.85rem; text-align:center; color:var(--text-secondary); font-size:0.8rem;">Cap alumne al grup. Afegeix-ne a l'esquerra.</div>`;
    return;
  }

  listEl.innerHTML = group.students.map((st, idx) => `
    <div class="student-manage-item">
      <span><strong>${idx + 1}.</strong> ${escapeHtml(st.name)}</span>
      <div style="display:flex; gap:0.25rem;">
        <button type="button" class="btn btn-outline btn-sm" onclick="renameStudentInActiveGroup('${st.id}')" title="Editar nom">✎</button>
        <button type="button" class="btn btn-danger-ghost btn-sm" onclick="removeStudentFromActiveGroup('${st.id}')" title="Eliminar alumne">&times;</button>
      </div>
    </div>
  `).join('');
}

window.renameStudentInActiveGroup = function(studentId) {
  const group = getActiveGroup();
  if (!group) return;
  const st = group.students.find(s => s.id === studentId);
  if (!st) return;
  const newName = prompt('Editar nom i cognoms de l’alumne/a:', st.name);
  if (newName && newName.trim()) {
    st.name = formatToNameAndSurnames(newName.trim());
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
  }
};

window.removeStudentFromActiveGroup = function(studentId) {
  const group = getActiveGroup();
  if (!group) return;
  const st = group.students.find(s => s.id === studentId);
  if (!st) return;
  if (!confirm(`Segur que vols eliminar l'alumne/a "${st.name}" del grup ${group.name}?`)) return;
  group.students = group.students.filter(s => s.id !== studentId);
  saveStateToLocal();
  renderGroupsManagementModal();
  renderApp();
};

/* ==========================================================================
   MODAL & TOAST HELPERS
   ========================================================================== */
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==========================================================================
   EVENT LISTENERS INITIALIZATION
   ========================================================================== */
function initEventListeners() {
  // Course Cell Group Selector (Inside the top-left table header cell)
  document.getElementById('groupSelect').addEventListener('change', (e) => {
    state.activeGroupId = e.target.value;
    const tData = getActiveSessionsContainer();
    state.activeSessionNum = getNextAvailableSessionNum(tData);
    saveStateToLocal(true);
    renderApp();
  });

  // Top-Left Gear Button -> Directly opens Grups i Alumnes + Compte
  document.getElementById('btnOpenGroupsModal').addEventListener('click', () => {
    renderGroupsManagementModal();
    openModal('modalGroups');
  });

  // Top-Right Logo Button -> Toggle between Daily and Accumulated View
  document.getElementById('btnToggleViewMode').addEventListener('click', () => {
    state.activeView = state.activeView === 'daily' ? 'accum' : 'daily';
    saveStateToLocal(true);
    renderApp();
  });

  // 1..35 Session Strip Click
  document.getElementById('sessionsStripContainer').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-session-num]');
    if (!cell) return;
    const num = Number(cell.getAttribute('data-session-num'));
    state.activeSessionNum = num;
    state.activeView = 'daily';
    saveStateToLocal(true);
    renderApp();
  });

  // Finalize Session Button at the bottom corner of Daily View
  document.getElementById('btnFinalizeSessionEnd').addEventListener('click', openFinalizeSessionModal);
  document.getElementById('btnConfirmFinalizeSession').addEventListener('click', confirmFinalizeCurrentSession);

  // Exportar PDF Button at the bottom corner of Accumulated View
  document.getElementById('btnExportPDFEnd').addEventListener('click', () => {
    window.print();
  });

  // Note Modal actions
  document.getElementById('btnSaveCellNote').addEventListener('click', saveActiveCellNote);
  document.getElementById('btnRemoveMarkFromNoteModal').addEventListener('click', removeMarkFromActiveNoteModal);
  document.getElementById('cellNoteTextarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveActiveCellNote();
    }
  });

  // Auth Modal Form & Mode Switchers (Supabase Auth, same as ARMYMAKER)
  document.getElementById('btnSwitchAuthMode').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    renderAuthModalState();
  });

  document.getElementById('btnSwitchResetMode').addEventListener('click', () => {
    authMode = 'reset';
    renderAuthModalState();
  });

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabaseClient) {
      renderAuthModalState({ type: 'error', text: 'El client de Supabase no està disponible. Revisa la connexió.' });
      return;
    }

    const email = document.getElementById('authEmailInput').value.trim();
    const password = document.getElementById('authPasswordInput').value;
    const submitBtn = document.getElementById('btnAuthSubmit');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processant...';
    renderAuthModalState(null);

    try {
      if (authMode === 'signin') {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user || (data.session && data.session.user) || null;
        closeModal('modalAuth');
        updateAccountStatusUI();
        showToast(`✓ Sessió iniciada (${email})`, 'success');
        await syncWithSupabaseAccount(false);
      } else if (authMode === 'signup') {
        const redirectTo = resolveRedirectUrl();
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo }
        });
        if (error) throw error;
        if (data.session) {
          currentUser = data.user || data.session.user;
          closeModal('modalAuth');
          updateAccountStatusUI();
          showToast('✓ Compte creat i sessió iniciada!', 'success');
          await syncWithSupabaseAccount(false);
        } else {
          authMode = 'signin';
          renderAuthModalState({
            type: 'success',
            text: 'Compte creat! Revisa el teu correu per confirmar-lo i després inicia sessió.'
          });
        }
      } else if (authMode === 'reset') {
        const redirectTo = resolveRedirectUrl();
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        renderAuthModalState({
          type: 'success',
          text: 'S’ha enviat un correu per restablir la contrasenya.'
        });
      }
    } catch (err) {
      renderAuthModalState({
        type: 'error',
        text: err.message || String(err)
      });
    } finally {
      submitBtn.disabled = false;
      const titles = { signin: 'Iniciar sessió', signup: 'Crear compte nou', reset: 'Recuperar contrasenya' };
      submitBtn.textContent = titles[authMode] || 'Iniciar sessió';
    }
  });

  // Table Body Delegated Clicks (Daily & Accumulated)
  document.getElementById('registreTableBody').addEventListener('click', (e) => {
    // 1. Daily View: Toggle student absence by clicking student name
    const absenceCell = e.target.closest('[data-toggle-absence]');
    if (absenceCell && state.activeView === 'daily') {
      const stId = absenceCell.getAttribute('data-toggle-absence');
      toggleStudentAbsence(stId);
      return;
    }

    // 2. Daily View: Tap a conduct cell (1st tap = red, 2nd tap = open note window)
    const dailyConductCell = e.target.closest('[data-student-id][data-cat-id]');
    if (dailyConductCell && state.activeView === 'daily') {
      const stId = dailyConductCell.getAttribute('data-student-id');
      const catId = dailyConductCell.getAttribute('data-cat-id');
      handleDailyCellTap(stId, catId);
      return;
    }

    // 3. Accumulated View: Tap the small Faltes square on the right of the student name cell
    const accumFaltesSquare = e.target.closest('[data-accum-faltes]');
    if (accumFaltesSquare && state.activeView === 'accum') {
      e.stopPropagation();
      const stId = accumFaltesSquare.getAttribute('data-accum-faltes');
      openAccumFaltesDetailModal(stId);
      return;
    }

    // 4. Accumulated View: Tap a conduct cell to see dates & notes
    const accumConductCell = e.target.closest('[data-accum-student][data-accum-cat]');
    if (accumConductCell && state.activeView === 'accum') {
      const stId = accumConductCell.getAttribute('data-accum-student');
      const catId = accumConductCell.getAttribute('data-accum-cat');
      openAccumCellDetailModal(stId, catId);
      return;
    }

    // 5. Accumulated View: Tap Student Name to open complete Student Profile
    const profileCell = e.target.closest('[data-profile-student]');
    if (profileCell && state.activeView === 'accum') {
      const stId = profileCell.getAttribute('data-profile-student');
      openStudentProfileModal(stId);
      return;
    }
  });

  // Close Modals
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.getAttribute('data-close-modal'));
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('open');
      }
    });
  });

  document.getElementById('manageGroupSelect').addEventListener('change', (e) => {
    state.activeGroupId = e.target.value;
    saveStateToLocal(true);
    renderGroupsManagementModal();
    renderApp();
  });

  // Create New Group
  document.getElementById('btnCreateGroup').addEventListener('click', () => {
    const input = document.getElementById('newGroupNameInput');
    const name = input.value.trim();
    if (!name) {
      alert('Escriu un nom per al nou grup (ex: 5è B).');
      return;
    }
    const newGrp = {
      id: uid('grup'),
      name,
      students: [],
      trimestres: {
        '1r': { sessions: {}, drafts: {} }
      }
    };
    state.groups.push(newGrp);
    state.activeGroupId = newGrp.id;
    state.activeSessionNum = 1;
    input.value = '';
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
    showToast(`✓ Grup "${name}" creat!`, 'success');
  });

  // Rename Group
  document.getElementById('btnRenameGroup').addEventListener('click', () => {
    const grp = getActiveGroup();
    if (!grp) return;
    const newName = prompt('Nou nom del grup / curs:', grp.name);
    if (newName && newName.trim()) {
      grp.name = newName.trim();
      saveStateToLocal();
      renderGroupsManagementModal();
      renderApp();
    }
  });

  // Delete Group
  document.getElementById('btnDeleteGroup').addEventListener('click', () => {
    const grp = getActiveGroup();
    if (!grp) return;
    if (!confirm(`Segur que vols eliminar el grup "${grp.name}" i tots els seus registres?`)) return;
    state.groups = state.groups.filter(g => g.id !== grp.id);
    state.activeGroupId = state.groups.length > 0 ? state.groups[0].id : '';
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
  });

  // Add Single Student (Formatted as Nombre y Apellidos)
  document.getElementById('btnAddSingleStudent').addEventListener('click', () => {
    const input = document.getElementById('singleStudentInput');
    const name = formatToNameAndSurnames(input.value);
    if (!name) return;
    const grp = getActiveGroup();
    if (!grp) return;
    grp.students.push({ id: uid('al'), name });
    input.value = '';
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
  });

  document.getElementById('singleStudentInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnAddSingleStudent').click();
    }
  });

  // Add Bulk Students (Formatted as Nombre y Apellidos)
  document.getElementById('btnAddBulkStudents').addEventListener('click', () => {
    const textarea = document.getElementById('bulkStudentsTextarea');
    const lines = textarea.value.split(/\r?\n/).map(l => formatToNameAndSurnames(l)).filter(Boolean);
    if (lines.length === 0) return;
    const grp = getActiveGroup();
    if (!grp) return;
    lines.forEach(name => {
      grp.students.push({ id: uid('al'), name });
    });
    textarea.value = '';
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
    showToast(`✓ ${lines.length} alumnes afegits al grup ${grp.name}!`, 'success');
  });

  // Sort Students Alphabetically
  document.getElementById('btnSortStudentsAlpha').addEventListener('click', () => {
    const grp = getActiveGroup();
    if (!grp) return;
    grp.students.sort((a, b) => a.name.localeCompare(b.name, 'ca'));
    saveStateToLocal();
    renderGroupsManagementModal();
    renderApp();
    showToast('Alumnes ordenats alfabèticament (A-Z)');
  });
}

// Initialize Supabase Session & Listeners
function initSupabaseAuth() {
  if (!supabaseClient) return;

  supabaseClient.auth.getSession().then(({ data }) => {
    currentUser = (data && data.session && data.session.user) ? data.session.user : null;
    updateAccountStatusUI();
    if (currentUser && navigator.onLine !== false) {
      syncWithSupabaseAccount(true);
    }
  }).catch(() => {});

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const prevUserId = currentUser ? currentUser.id : null;
    currentUser = (session && session.user) ? session.user : null;
    updateAccountStatusUI();
    if (currentUser && currentUser.id !== prevUserId && navigator.onLine !== false) {
      syncWithSupabaseAccount(true);
    }
  });

  window.addEventListener('online', () => {
    updateAccountStatusUI();
    if (currentUser) {
      syncWithSupabaseAccount(false);
    }
  });

  window.addEventListener('offline', () => {
    updateAccountStatusUI('pending');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser && navigator.onLine !== false) {
      syncWithSupabaseAccount(true);
    }
  });
}

// Boot Application
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderApp();
  initSupabaseAuth();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});