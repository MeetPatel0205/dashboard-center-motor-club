/* ==========================================================================
   CENTRAL MOTOR MONITORING - JAVASCRIPT APP ENGINE (HARDENED SECURITY & ROUTE GUARDS)
   Backend Connection: Local PostgreSQL Database (centermotorclub via Express API)
   ========================================================================== */

const API_BASE_URL = '/api';

let allData = null;
let htFilteredMotors = [];
let ltFilteredMotors = [];

let htCurrentPage = 1;
let ltCurrentPage = 1;
const rowsPerPage = 20;

let htSortColumn = 'motor_sr_no';
let htSortDirection = 'asc';

let ltSortColumn = 'motor_sr_no';
let ltSortDirection = 'asc';

let selectedMotor = null;
let currentTab = 'tab-overview';

// User Authentication & RBAC State
let isLoggedIn = false;
let currentUser = null;
let userRole = 'viewer'; // 'admin' or 'viewer'
let userDirectory = [];

// Chart Instances
let deptChartInstance = null;
let statusChartInstance = null;
let makesChartInstance = null;
let powerChartInstance = null;
let historyChartInstance = null;

let currentHistoryMotorId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Enforce session lock on initial load
  enforceSessionGuard();
  loadDashboardData();
});

// Enforce Session Lock (Prevents Login Bypass via URL or DOM)
function enforceSessionGuard() {
  if (!isLoggedIn) {
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    return false;
  }
  return true;
}

// 1. Authentication Handlers (PostgreSQL Backed)
function selectLoginPreset(role) {
  const adminBtn = document.getElementById('presetAdminBtn');
  const viewerBtn = document.getElementById('presetViewerBtn');
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');

  if (role === 'admin') {
    adminBtn.classList.add('active');
    viewerBtn.classList.remove('active');
    emailInput.value = 'admin@centermotor.com';
    passInput.value = 'admin123';
  } else {
    viewerBtn.classList.add('active');
    adminBtn.classList.remove('active');
    emailInput.value = 'viewer@centermotor.com';
    passInput.value = 'viewer123';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentUser = data.user;
    isLoggedIn = true;

    // Transition to main app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    // Set User Profile UI
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

    setUserRole(currentUser.role);
    loadUserManagementDirectory();

  } catch (err) {
    alert(err.message || 'Invalid Login Credentials!');
  }
}

function handleLogout() {
  isLoggedIn = false;
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// 2. Authentication Logic (PostgreSQL Backed)
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('clerkEmailInput').value.trim();
  const password = document.getElementById('clerkPasswordInput').value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentUser = data.user;
    isLoggedIn = true;

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

    setUserRole(currentUser.role);
    loadUserManagementDirectory();

  } catch (err) {
    alert(err.message || 'Invalid Email or Password!');
  }
}

function setUserRole(role) {
  userRole = role;
  const roleText = document.getElementById('userRoleText');

  if (role === 'admin') {
    if (roleText) roleText.textContent = 'Admin (Read & Write)';
    document.querySelectorAll('.admin-only-item').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.admin-only-btn').forEach(el => el.style.display = 'inline-flex');
  } else {
    if (roleText) roleText.textContent = 'Viewer (Read-Only)';
    document.querySelectorAll('.admin-only-item').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-only-btn').forEach(el => el.style.display = 'none');
  }
}

// 3. User Management Directory Engine (PostgreSQL Backed)
async function loadUserManagementDirectory() {
  try {
    const res = await fetch(`${API_BASE_URL}/users`);
    const data = await res.json();
    userDirectory = data.users || [];
    renderUserManagementTable();
  } catch (err) {
    console.error('Error loading users from PostgreSQL:', err);
  }
}

function renderUserManagementTable() {
  const tbody = document.getElementById('userManagementTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  userDirectory.forEach(u => {
    const tr = document.createElement('tr');
    const isAdmin = u.role === 'admin';
    const isActive = u.status === 'Active';

    tr.innerHTML = `
      <td class="font-mono" style="color: var(--primary); font-weight: 700;">${u.id}</td>
      <td style="font-weight: 700; color: var(--text-main);">${u.name}</td>
      <td>${u.email}</td>
      <td>
        ${isAdmin ? '<span class="rbac-badge admin"><i class="ri-shield-flash-line"></i> Admin (Read & Write)</span>' : '<span class="rbac-badge viewer"><i class="ri-eye-line"></i> Viewer (Read-Only)</span>'}
      </td>
      <td>${u.dept || 'All Departments'}</td>
      <td>
        ${isActive ? '<span class="status-badge done">Active</span>' : '<span class="status-badge critical">Suspended</span>'}
      </td>
      <td style="text-align: center;">
        <div style="display:flex; justify-content:center; gap: 6px;">
          <button class="btn btn-secondary btn-sm admin-only-btn" title="Toggle Role Permission" onclick="toggleUserRolePermission('${u.id}', '${u.role}')">
            <i class="ri-shield-user-line"></i> ${isAdmin ? 'Set Read-Only' : 'Set Admin'}
          </button>
          <button class="btn btn-danger btn-sm admin-only-btn" title="Delete User" onclick="deleteUserAccount('${u.id}')">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  setUserRole(userRole);
}

function openAddUserModal() {
  if (userRole !== 'admin') return alert('Permission Denied: Admin access required to manage users.');
  document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
  document.getElementById('addUserModal').classList.remove('active');
  document.getElementById('addUserForm').reset();
}

async function handleCreateUserSubmit(e) {
  e.preventDefault();
  if (userRole !== 'admin') return alert('Permission Denied: Admin privileges required.');

  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;
  const dept = document.getElementById('newUserDept').value.trim() || 'All Departments';

  try {
    const res = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole
      },
      body: JSON.stringify({ name, email, password, role, dept })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user in PostgreSQL');

    await loadUserManagementDirectory();
    closeAddUserModal();
    alert(`New user '${name}' created successfully in PostgreSQL database!`);

  } catch (err) {
    alert(err.message);
  }
}

async function toggleUserRolePermission(userId, currentRole) {
  if (userRole !== 'admin') return alert('Permission Denied: Admin privileges required.');
  const newRole = currentRole === 'admin' ? 'viewer' : 'admin';

  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole
      },
      body: JSON.stringify({ role: newRole })
    });

    if (!res.ok) throw new Error('Permission Denied by API');
    await loadUserManagementDirectory();
  } catch (err) {
    alert('Failed to update role in PostgreSQL');
  }
}

async function deleteUserAccount(userId) {
  if (userRole !== 'admin') return alert('Permission Denied: Admin privileges required.');
  if (confirm('Are you sure you want to delete this user account from PostgreSQL?')) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'x-user-role': userRole }
      });
      if (!res.ok) throw new Error('Permission Denied by API');
      await loadUserManagementDirectory();
    } catch (err) {
      alert('Failed to delete user');
    }
  }
}

// 4. Fetch & Initialize Dataset EXCLUSIVELY from Local PostgreSQL API Backend
async function loadDashboardData() {
  try {
    const summaryRes = await fetch(`${API_BASE_URL}/summary`);
    if (!summaryRes.ok) throw new Error('Failed to fetch summary from local PostgreSQL API');
    const summaryData = await summaryRes.json();

    const motorsRes = await fetch(`${API_BASE_URL}/motors`);
    if (!motorsRes.ok) throw new Error('Failed to fetch motor records from local PostgreSQL API');
    const motorsData = await motorsRes.json();

    allData = {
      summary: summaryData.summary,
      department_summary: summaryData.department_summary,
      motors: motorsData.motors || []
    };

    initKpis();
    initFilters();
    initCharts();
    renderMasterTable();
    initQrStation();

    onHtFilterChange();
    onLtFilterChange();
    handleUrlQueryParams();

  } catch (err) {
    console.error('PostgreSQL API Error:', err);
    alert('CRITICAL DATABASE ERROR: Unable to connect to local PostgreSQL database (centermotorclub on port 5432). Please ensure Node.js Express server is running on http://localhost:5000.');
  }
}

// 5. Tab Switcher (Guarded against Session Bypass)
function switchTab(tabId) {
  // Security Guard: Prevent Tab Switching if Not Logged In
  if (!enforceSessionGuard()) return;

  currentTab = tabId;

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navKey = tabId.replace('tab-', '');
  const activeNav = document.getElementById(`nav-${navKey}`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  const activePanel = document.getElementById(tabId);
  if (activePanel) activePanel.classList.add('active');

  const titles = {
    'tab-overview': { title: 'CENTRAL MOTOR MONITORING', sub: 'High Tension & Low Tension Industrial Equipment Diagnostic Portal (PostgreSQL DB)' },
    'tab-departments': { title: 'Master Departments Overview', sub: 'Unit-wise Testing Done & Due Breakdown' },
    'tab-inventory-ht': { title: 'High Tension (HT) Motors Inventory', sub: '6.6kV / 11kV High Voltage Equipment Diagnostics' },
    'tab-inventory-lt': { title: 'Low Tension (LT) Motors Inventory', sub: '415V Low Voltage Motor Inventory & Diagnostic Log' },
    'tab-motor-form': { title: 'Motor Asset Registration & Specs Form', sub: 'Add or Edit Equipment Specifications in PostgreSQL Database' },
    'tab-qr': { title: 'Industrial QR Asset Tag Station', sub: 'Scannable Field Sticker Generator' },
    'tab-admin': { title: 'Admin User Management Directory', sub: 'PostgreSQL User Accounts & Permissions Control' },
    'tab-reports': { title: 'Diagnostic Reports & Data Exports', sub: 'Generate PDF Certificates & Export CSV Files' }
  };

  const info = titles[tabId] || titles['tab-overview'];
  document.getElementById('panelTitle').textContent = info.title;
  document.getElementById('panelSub').textContent = info.sub;
}

// 6. Interactive KPI Card Routing Handlers
function onKpiCardClick(type) {
  if (!enforceSessionGuard()) return;
  if (type === 'all' || type === 'ht') {
    switchTab('tab-inventory-ht');
  } else if (type === 'lt') {
    switchTab('tab-inventory-lt');
  } else if (type === 'critical') {
    switchTab('tab-inventory-ht');
    document.getElementById('filterHtStatus').value = 'Critical';
    onHtFilterChange();
  } else if (type === 'done') {
    switchTab('tab-inventory-ht');
    document.getElementById('filterHtStatus').value = 'Done';
    onHtFilterChange();
  } else if (type === 'due') {
    switchTab('tab-inventory-ht');
    document.getElementById('filterHtStatus').value = 'Due';
    onHtFilterChange();
  } else if (type === 'rpm') {
    switchTab('tab-inventory-ht');
    sortHtTable('rpm');
  }
}

// 7. Initialize Top KPI Cards
function initKpis() {
  const { summary } = allData;
  const total = summary.total_motors;
  const done = summary.status_counts.Done || 0;
  const due = summary.status_counts.Due || 0;
  const critical = summary.critical_count || 0;

  const donePct = total ? Math.round((done / total) * 100) : 0;
  const duePct = total ? Math.round((due / total) * 100) : 0;
  const critPct = total ? Math.round((critical / total) * 100) : 0;

  document.getElementById('kpiTotalMotors').textContent = total.toLocaleString();
  document.getElementById('sidebarTotalCount').textContent = `${total.toLocaleString()} PostgreSQL Motors`;
  document.getElementById('kpiHtMotors').textContent = (summary.ht_motors_count ?? 0).toLocaleString();
  document.getElementById('kpiLtMotors').textContent = (summary.lt_motors_count ?? 0).toLocaleString();
  
  document.getElementById('kpiCriticalMotors').textContent = critical.toLocaleString();
  document.getElementById('kpiCriticalPercent').textContent = `${critPct}% Critical`;

  document.getElementById('kpiTestingDone').textContent = done.toLocaleString();
  document.getElementById('kpiDonePercent').textContent = `${donePct}% Tested`;

  document.getElementById('kpiTestingDue').textContent = due.toLocaleString();
  document.getElementById('kpiDuePercent').textContent = `${duePct}% Action Due`;

  const highSpeedCount = allData.motors.filter(m => (parseFloat(m.rpm) || 0) >= 1500).length;
  const highSpeedRatio = total ? Math.round((highSpeedCount / total) * 100) : 0;
  document.getElementById('kpiRpmRatio').textContent = `${highSpeedRatio}% High Speed`;
}

// 8. Populate Filter Select Dropdowns
function initFilters() {
  const htPlant = document.getElementById('filterHtPlant');
  const htMake = document.getElementById('filterHtMake');

  const ltPlant = document.getElementById('filterLtPlant');
  const ltMake = document.getElementById('filterLtMake');

  htPlant.innerHTML = '<option value="">All Departments / Plants</option>';
  ltPlant.innerHTML = '<option value="">All Departments / Plants</option>';
  htMake.innerHTML = '<option value="">All Manufacturers (Makes)</option>';
  ltMake.innerHTML = '<option value="">All Manufacturers (Makes)</option>';

  allData.summary.plants.forEach(p => {
    htPlant.appendChild(new Option(p, p));
    ltPlant.appendChild(new Option(p, p));
  });

  allData.summary.makes.forEach(m => {
    htMake.appendChild(new Option(m, m));
    ltMake.appendChild(new Option(m, m));
  });
}

// 9. Initialize Analytics Charts
function initCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  if (deptChartInstance) deptChartInstance.destroy();
  if (statusChartInstance) statusChartInstance.destroy();
  if (makesChartInstance) makesChartInstance.destroy();
  if (powerChartInstance) powerChartInstance.destroy();

  // Chart 1: Department Status
  const deptLabels = allData.department_summary.map(d => d.department);
  const deptDone = allData.department_summary.map(d => d.testing_done);
  const deptDue = allData.department_summary.map(d => d.testing_due);

  const ctxDept = document.getElementById('deptChart').getContext('2d');
  deptChartInstance = new Chart(ctxDept, {
    type: 'bar',
    data: {
      labels: deptLabels,
      datasets: [
        { label: 'Testing Done', data: deptDone, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Testing Due', data: deptDue, backgroundColor: '#f59e0b', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } }
      },
      plugins: { legend: { labels: { color: textColor } } }
    }
  });

  // Chart 2: Status & Critical Ratio Donut
  const ctxStatus = document.getElementById('statusChart').getContext('2d');
  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['Testing Done', 'Testing Due', 'Critical Condition'],
      datasets: [{
        data: [allData.summary.status_counts.Done, allData.summary.status_counts.Due, allData.summary.critical_count],
        backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
    }
  });

  // Chart 3: Top Makes
  const makeCounts = {};
  allData.motors.forEach(m => {
    if (m.make && m.make !== 'Unknown') makeCounts[m.make] = (makeCounts[m.make] || 0) + 1;
  });

  const sortedMakes = Object.entries(makeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const ctxMakes = document.getElementById('makesChart').getContext('2d');
  makesChartInstance = new Chart(ctxMakes, {
    type: 'bar',
    data: {
      labels: sortedMakes.map(x => x[0]),
      datasets: [{ label: 'Motors Count', data: sortedMakes.map(x => x[1]), backgroundColor: '#0284c7', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // Chart 4: Power Rating Bins
  const powerBins = { '< 50 kW': 0, '50-250 kW': 0, '251-500 kW': 0, '501-1000 kW': 0, '> 1000 kW': 0 };
  allData.motors.forEach(m => {
    const kw = parseFloat(m.kw) || 0;
    if (kw > 0) {
      if (kw < 50) powerBins['< 50 kW']++;
      else if (kw <= 250) powerBins['50-250 kW']++;
      else if (kw <= 500) powerBins['251-500 kW']++;
      else if (kw <= 1000) powerBins['501-1000 kW']++;
      else powerBins['> 1000 kW']++;
    }
  });

  const ctxPower = document.getElementById('powerChart').getContext('2d');
  powerChartInstance = new Chart(ctxPower, {
    type: 'bar',
    data: {
      labels: Object.keys(powerBins),
      datasets: [{ label: 'Motors Count', data: Object.values(powerBins), backgroundColor: ['#8b5cf6', '#0284c7', '#3b82f6', '#06b6d4', '#10b981'], borderRadius: 4 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: gridColor } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// 10. Master Department Summary Table
function renderMasterTable() {
  const tbody = document.getElementById('masterTableBody');
  tbody.innerHTML = '';

  allData.department_summary.forEach((dept, index) => {
    const total = dept.total_motors;
    const done = dept.testing_done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color: var(--text-dim); font-weight:600;">${index + 1}</td>
      <td style="font-weight: 700; color: var(--text-main);">${dept.department}</td>
      <td class="font-mono">${dept.total_motors}</td>
      <td class="font-mono" style="color: var(--status-done); font-weight: 700;">${dept.testing_done}</td>
      <td class="font-mono" style="color: var(--status-due); font-weight: 700;">${dept.testing_due}</td>
      <td style="width: 180px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="flex:1; height:6px; background: rgba(148, 163, 184, 0.2); border-radius: 4px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background: var(--status-done); border-radius:4px;"></div>
          </div>
          <span style="font-size:11px; font-weight:700; color: var(--text-muted);">${pct}%</span>
        </div>
      </td>
      <td>
        ${pct === 100 ? '<span class="status-badge done">100% Done</span>' : '<span class="status-badge due">In Progress</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 11. HT Motors Inventory Table & Filters
function onHtFilterChange() {
  const searchText = document.getElementById('searchHtInput').value.toLowerCase().trim();
  const statusVal = document.getElementById('filterHtStatus').value;
  const plantVal = document.getElementById('filterHtPlant').value;
  const makeVal = document.getElementById('filterHtMake').value;

  htFilteredMotors = allData.motors.filter(m => {
    if (m.motor_type !== 'HT') return false;

    if (searchText) {
      const matchSearch = 
        m.motor_sr_no.toLowerCase().includes(searchText) ||
        (m.motor_name || '').toLowerCase().includes(searchText) ||
        (m.application || '').toLowerCase().includes(searchText) ||
        m.plant.toLowerCase().includes(searchText) ||
        m.make.toLowerCase().includes(searchText);
      if (!matchSearch) return false;
    }

    if (statusVal) {
      if (statusVal === 'Critical' && !m.is_critical) return false;
      if (statusVal !== 'Critical' && m.status !== statusVal) return false;
    }

    if (plantVal && m.plant !== plantVal) return false;
    if (makeVal && m.make !== makeVal) return false;

    return true;
  });

  sortHtArray();
  htCurrentPage = 1;
  renderHtTable();
}

function resetHtFilters() {
  document.getElementById('searchHtInput').value = '';
  document.getElementById('filterHtStatus').value = '';
  document.getElementById('filterHtPlant').value = '';
  document.getElementById('filterHtMake').value = '';
  onHtFilterChange();
}

function sortHtTable(col) {
  if (htSortColumn === col) htSortDirection = htSortDirection === 'asc' ? 'desc' : 'asc';
  else { htSortColumn = col; htSortDirection = 'asc'; }
  sortHtArray();
  renderHtTable();
}

function sortHtArray() {
  htFilteredMotors.sort((a, b) => {
    let valA = a[htSortColumn] || '';
    let valB = b[htSortColumn] || '';

    if (htSortColumn === 'kw' || htSortColumn === 'rpm') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    } else {
      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();
    }

    if (valA < valB) return htSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return htSortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderHtTable() {
  const tbody = document.getElementById('htTableBody');
  tbody.innerHTML = '';

  const total = htFilteredMotors.length;
  document.getElementById('htCountBadge').textContent = `${total} HT Motors`;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color: var(--text-muted);">No HT Motors match your search parameters.</td></tr>`;
    document.getElementById('htPaginationInfo').textContent = 'Showing 0 entries';
    document.getElementById('htPaginationControls').innerHTML = '';
    return;
  }

  const startIdx = (htCurrentPage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, total);
  const batch = htFilteredMotors.slice(startIdx, endIdx);

  batch.forEach(m => {
    const tr = document.createElement('tr');
    const isDone = m.status === 'Done';

    tr.innerHTML = `
      <td class="font-mono" style="color: var(--primary); font-weight:700;">${m.motor_sr_no}</td>
      <td style="font-weight:700; color: var(--text-main);">${m.application || m.motor_name}</td>
      <td>${m.plant}</td>
      <td class="font-mono">${m.kw ? m.kw + ' kW' : '-'}</td>
      <td class="font-mono">${m.voltage || '6.6 kV'}</td>
      <td class="font-mono">${m.current || m.flc || '-'} A</td>
      <td class="font-mono">${m.rpm || '-'}</td>
      <td class="font-mono">${m.frame_size || '-'}</td>
      <td style="font-weight:600;">${m.make}</td>
      <td>
        ${m.is_critical ? '<span class="status-badge critical">Critical</span>' : (isDone ? '<span class="status-badge done">Done</span>' : '<span class="status-badge due">Due</span>')}
      </td>
      <td style="text-align:center;">
        <div style="display:flex; justify-content:center; gap:4px;">
          <button class="btn btn-secondary btn-sm" title="Spec Sheet" onclick="openMotorModal('${m.id}')"><i class="ri-eye-line"></i></button>
          <button class="btn btn-secondary btn-sm admin-only-btn" title="Edit Motor" onclick="editMotor('${m.id}')"><i class="ri-edit-line"></i></button>
          <button class="btn btn-secondary btn-sm" title="QR Badge" onclick="openStationQrModal('${m.id}')"><i class="ri-qr-code-line"></i></button>
          <button class="btn btn-danger btn-sm admin-only-btn" title="Delete Motor" onclick="deleteMotorRecord('${m.id}')"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('htPaginationInfo').textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} entries`;
  renderPaginationControls('htPaginationControls', Math.ceil(total / rowsPerPage), htCurrentPage, (page) => {
    htCurrentPage = page; renderHtTable();
  });
}

// 12. LT Motors Inventory Table & Filters
function onLtFilterChange() {
  const searchText = document.getElementById('searchLtInput').value.toLowerCase().trim();
  const statusVal = document.getElementById('filterLtStatus').value;
  const plantVal = document.getElementById('filterLtPlant').value;
  const makeVal = document.getElementById('filterLtMake').value;

  ltFilteredMotors = allData.motors.filter(m => {
    if (m.motor_type !== 'LT') return false;

    if (searchText) {
      const matchSearch = 
        m.motor_sr_no.toLowerCase().includes(searchText) ||
        (m.motor_name || '').toLowerCase().includes(searchText) ||
        (m.application || '').toLowerCase().includes(searchText) ||
        m.plant.toLowerCase().includes(searchText) ||
        m.make.toLowerCase().includes(searchText);
      if (!matchSearch) return false;
    }

    if (statusVal) {
      if (statusVal === 'Critical' && !m.is_critical) return false;
      if (statusVal !== 'Critical' && m.status !== statusVal) return false;
    }

    if (plantVal && m.plant !== plantVal) return false;
    if (makeVal && m.make !== makeVal) return false;

    return true;
  });

  sortLtArray();
  ltCurrentPage = 1;
  renderLtTable();
}

function resetLtFilters() {
  document.getElementById('searchLtInput').value = '';
  document.getElementById('filterLtStatus').value = '';
  document.getElementById('filterLtPlant').value = '';
  document.getElementById('filterLtMake').value = '';
  onLtFilterChange();
}

function sortLtTable(col) {
  if (ltSortColumn === col) ltSortDirection = ltSortDirection === 'asc' ? 'desc' : 'asc';
  else { ltSortColumn = col; ltSortDirection = 'asc'; }
  sortLtArray();
  renderLtTable();
}

function sortLtArray() {
  ltFilteredMotors.sort((a, b) => {
    let valA = a[ltSortColumn] || '';
    let valB = b[ltSortColumn] || '';

    if (ltSortColumn === 'kw' || ltSortColumn === 'rpm') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    } else {
      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();
    }

    if (valA < valB) return ltSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return ltSortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderLtTable() {
  const tbody = document.getElementById('ltTableBody');
  tbody.innerHTML = '';

  const total = ltFilteredMotors.length;
  document.getElementById('ltCountBadge').textContent = `${total} LT Motors`;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color: var(--text-muted);">No LT Motors match your search parameters.</td></tr>`;
    document.getElementById('ltPaginationInfo').textContent = 'Showing 0 entries';
    document.getElementById('ltPaginationControls').innerHTML = '';
    return;
  }

  const startIdx = (ltCurrentPage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, total);
  const batch = ltFilteredMotors.slice(startIdx, endIdx);

  batch.forEach(m => {
    const tr = document.createElement('tr');
    const isDone = m.status === 'Done';

    tr.innerHTML = `
      <td class="font-mono" style="color: #8b5cf6; font-weight:700;">${m.motor_sr_no}</td>
      <td style="font-weight:700; color: var(--text-main);">${m.application || m.motor_name}</td>
      <td>${m.plant}</td>
      <td class="font-mono">${m.kw ? m.kw + ' kW' : '-'}</td>
      <td class="font-mono">${m.voltage || '415 V'}</td>
      <td class="font-mono">${m.current || m.flc || '-'} A</td>
      <td class="font-mono">${m.rpm || '-'}</td>
      <td class="font-mono">${m.frame_size || '-'}</td>
      <td style="font-weight:600;">${m.make}</td>
      <td>
        ${m.is_critical ? '<span class="status-badge critical">Critical</span>' : (isDone ? '<span class="status-badge done">Done</span>' : '<span class="status-badge due">Due</span>')}
      </td>
      <td style="text-align:center;">
        <div style="display:flex; justify-content:center; gap:4px;">
          <button class="btn btn-secondary btn-sm" title="Spec Sheet" onclick="openMotorModal('${m.id}')"><i class="ri-eye-line"></i></button>
          <button class="btn btn-secondary btn-sm admin-only-btn" title="Edit Motor" onclick="editMotor('${m.id}')"><i class="ri-edit-line"></i></button>
          <button class="btn btn-secondary btn-sm" title="QR Badge" onclick="openStationQrModal('${m.id}')"><i class="ri-qr-code-line"></i></button>
          <button class="btn btn-danger btn-sm admin-only-btn" title="Delete Motor" onclick="deleteMotorRecord('${m.id}')"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('ltPaginationInfo').textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} entries`;
  renderPaginationControls('ltPaginationControls', Math.ceil(total / rowsPerPage), ltCurrentPage, (page) => {
    ltCurrentPage = page; renderLtTable();
  });
}

function renderPaginationControls(containerId, totalPages, currPage, onPageClick) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-secondary btn-sm';
  prevBtn.innerHTML = '<i class="ri-arrow-left-s-line"></i>';
  prevBtn.disabled = currPage === 1;
  prevBtn.onclick = () => { if (currPage > 1) onPageClick(currPage - 1); };
  container.appendChild(prevBtn);

  let startPage = Math.max(1, currPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `btn btn-sm ${i === currPage ? 'btn-primary' : 'btn-secondary'}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => onPageClick(i);
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary btn-sm';
  nextBtn.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
  nextBtn.disabled = currPage === totalPages;
  nextBtn.onclick = () => { if (currPage < totalPages) onPageClick(currPage + 1); };
  container.appendChild(nextBtn);
}

// 13. Motor Spec Modal
function openMotorModal(motorId) {
  if (!enforceSessionGuard()) return;
  const motor = allData.motors.find(m => m.id === motorId);
  if (!motor) return;
  selectedMotor = motor;

  document.getElementById('modalMotorTitle').textContent = `${motor.application || motor.motor_name} (${motor.motor_sr_no})`;
  document.getElementById('modalMotorSub').textContent = `${motor.plant} | ${motor.make} (${motor.kw} kW)`;

  const body = document.getElementById('modalMotorBody');
  const isDone = motor.status === 'Done';

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Motor Type & Serial No</div>
        <div style="font-size:14px; font-weight:700; color: var(--primary);" class="font-mono">[${motor.motor_type}] ${motor.motor_sr_no}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Application / Usage</div>
        <div style="font-size:14px; font-weight:700; color: var(--text-main);">${motor.application || motor.motor_name}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Plant / Unit</div>
        <div style="font-size:14px; font-weight:700;">${motor.plant}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Power Rating</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.kw ? motor.kw + ' kW' : 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Voltage (1)</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.voltage || 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Current (2)</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.current || motor.flc ? (motor.current || motor.flc) + ' A' : 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">RPM / Speed (3)</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.rpm || 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Frame Size (4)</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.frame_size || 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Make</div>
        <div style="font-size:14px; font-weight:700;">${motor.make}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Testing Status</div>
        <div style="margin-top:2px;">
          ${motor.is_critical ? '<span class="status-badge critical">Critical Condition</span>' : (isDone ? '<span class="status-badge done">Testing Done</span>' : '<span class="status-badge due">Testing Due</span>')}
        </div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Last Test Date</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.last_test_date || 'N/A'}</div>
      </div>
      <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-size:10px; font-weight:700; color: var(--text-muted); text-transform:uppercase;">Next Due Date</div>
        <div style="font-size:14px; font-weight:700;" class="font-mono">${motor.due_date || 'N/A'}</div>
      </div>
    </div>
  `;

  document.getElementById('motorDetailModal').classList.add('active');
}

function closeMotorModal() {
  document.getElementById('motorDetailModal').classList.remove('active');
}

// 14. Motor Registration & Edit Form Handlers (PostgreSQL Backed & Guarded)
async function handleMotorFormSubmit(e) {
  e.preventDefault();
  if (userRole !== 'admin') {
    alert('Permission Denied: Admin access required to add or edit motor records.');
    return;
  }

  const existingId = document.getElementById('formMotorId').value;
  const motorType = document.getElementById('formMotorType').value;
  const srNo = document.getElementById('formMotorSrNo').value.trim();
  const name = document.getElementById('formMotorName').value.trim();
  const plant = document.getElementById('formPlant').value.trim();
  const kw = document.getElementById('formKw').value.trim();
  const voltage = document.getElementById('formVoltage').value.trim();
  const current = document.getElementById('formCurrent').value.trim();
  const rpm = document.getElementById('formRpm').value.trim();
  const frameSize = document.getElementById('formFrameSize').value.trim();
  const make = document.getElementById('formMake').value.trim();
  const status = document.getElementById('formStatus').value;
  const lastTest = document.getElementById('formLastTest').value;
  const dueDate = document.getElementById('formDueDate').value;
  const reportNo = document.getElementById('formReportNo').value.trim();
  const remark = document.getElementById('formTestingRemark').value.trim();
  const isCritical = document.getElementById('formIsCritical').checked;
  const tan02 = document.getElementById('formTan02').value.trim();
  const tanGround = document.getElementById('formTanGround').value.trim();
  const tanTipUp = document.getElementById('formTanTipUp').value.trim();

  const payload = {
    motor_type: motorType,
    motor_sr_no: srNo,
    motor_name: name,
    application: name,
    plant: plant,
    location: plant,
    kw: kw,
    voltage: voltage,
    current: current,
    flc: current,
    rpm: rpm,
    frame_size: frameSize,
    make: make,
    status: status,
    last_test_date: lastTest || null,
    due_date: dueDate || null,
    report_no: reportNo || `CEID/${motorType}/2026/VAL`,
    testing_remark: remark || 'Normal',
    is_critical: isCritical,
    tan_delta_0_2vl: tan02 || '0.500',
    tan_delta_phase_ground: tanGround || '0.520',
    tan_delta_tip_up: tanTipUp || '0.020'
  };

  try {
    let res;
    if (existingId) {
      res = await fetch(`${API_BASE_URL}/motors/${existingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole
        },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE_URL}/motors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole
        },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save motor record in PostgreSQL');

    await loadDashboardData();
    resetMotorForm();

    alert(`Motor record saved successfully in PostgreSQL database!`);

    if (motorType === 'HT') switchTab('tab-inventory-ht');
    else switchTab('tab-inventory-lt');

  } catch (err) {
    alert(err.message);
  }
}

async function deleteMotorRecord(id) {
  if (userRole !== 'admin') return alert('Permission Denied: Admin access required to delete motors.');
  if (confirm('Are you sure you want to delete this motor record from PostgreSQL database?')) {
    try {
      const res = await fetch(`${API_BASE_URL}/motors/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': userRole }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete motor');
      await loadDashboardData();
    } catch (err) {
      alert(err.message);
    }
  }
}

function editMotor(id) {
  if (userRole !== 'admin') {
    alert('Permission Denied: Admin access required to edit motor records.');
    return;
  }
  const motor = allData.motors.find(m => m.id === id);
  if (!motor) return;

  switchTab('tab-motor-form');
  document.getElementById('formPanelHeading').innerHTML = `<i class="ri-edit-line"></i> Edit Motor Specs: ${motor.motor_sr_no}`;

  document.getElementById('formMotorId').value = motor.id;
  document.getElementById('formMotorType').value = motor.motor_type || 'HT';
  document.getElementById('formMotorSrNo').value = motor.motor_sr_no || '';
  document.getElementById('formMotorName').value = motor.application || motor.motor_name || '';
  document.getElementById('formPlant').value = motor.plant || '';
  document.getElementById('formKw').value = motor.kw || '';
  document.getElementById('formVoltage').value = motor.voltage || '';
  document.getElementById('formCurrent').value = motor.current || motor.flc || '';
  document.getElementById('formRpm').value = motor.rpm || '';
  document.getElementById('formFrameSize').value = motor.frame_size || '';
  document.getElementById('formMake').value = motor.make || '';
  document.getElementById('formStatus').value = motor.status || 'Done';
  document.getElementById('formLastTest').value = motor.last_test_date || '';
  document.getElementById('formDueDate').value = motor.due_date || '';
  document.getElementById('formReportNo').value = motor.report_no || '';
  document.getElementById('formTestingRemark').value = motor.testing_remark || '';
  document.getElementById('formIsCritical').checked = motor.is_critical || false;
  document.getElementById('formTan02').value = motor.tan_delta_0_2vl || '';
  document.getElementById('formTanGround').value = motor.tan_delta_phase_ground || '';
  document.getElementById('formTanTipUp').value = motor.tan_delta_tip_up || '';

  closeMotorModal();
}

function openEditMotorFromModal() {
  if (selectedMotor) editMotor(selectedMotor.id);
}

function resetMotorForm() {
  document.getElementById('formMotorId').value = '';
  document.getElementById('motorForm').reset();
  document.getElementById('formPanelHeading').innerHTML = `<i class="ri-add-circle-line"></i> Register New Motor Asset`;
}

// 15. QR Code Station Engine
function initQrStation() {
  const select = document.getElementById('qrSelectMotor');
  if (!select || !allData.motors) return;
  select.innerHTML = '';

  allData.motors.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `[${m.motor_type}] ${m.motor_sr_no} - ${m.application || m.motor_name} (${m.plant})`;
    select.appendChild(opt);
  });

  if (allData.motors.length) renderStationQr(allData.motors[0]);
}

function onQrMotorSelected() {
  const id = document.getElementById('qrSelectMotor').value;
  const motor = allData.motors.find(m => m.id === id);
  if (motor) renderStationQr(motor);
}

function openStationQrModal(id) {
  switchTab('tab-qr');
  document.getElementById('qrSelectMotor').value = id;
  onQrMotorSelected();
}

function renderStationQr(motor) {
  document.getElementById('stationPlantName').textContent = `${motor.plant} - ${motor.location}`;
  document.getElementById('stationMotorSr').textContent = motor.motor_sr_no;
  document.getElementById('stationMotorDesc').textContent = `${motor.application || motor.motor_name} | ${motor.make} (${motor.kw} kW | ${motor.voltage || ''})`;

  const container = document.getElementById('stationQrCanvas');
  container.innerHTML = '';

  const qrPayload = `CENTRAL MOTOR MONITORING | [${motor.motor_type}] SR: ${motor.motor_sr_no} | App: ${motor.application || motor.motor_name} | Plant: ${motor.plant} | Rating: ${motor.kw}kW (${motor.voltage || ''}, ${motor.rpm || ''}RPM) | Make: ${motor.make} | Status: ${motor.status}`;

  new QRCode(container, {
    text: qrPayload,
    width: 180,
    height: 180,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

function printQrSticker() { window.print(); }

// 16. Direct URL Parameter Handler (Guarded)
function handleUrlQueryParams() {
  if (!isLoggedIn) return;
  const params = new URLSearchParams(window.location.search);
  const motorParam = params.get('motor');
  if (motorParam && allData && allData.motors) {
    const target = allData.motors.find(m => 
      m.motor_sr_no.toLowerCase() === motorParam.toLowerCase() ||
      m.id.toLowerCase() === motorParam.toLowerCase()
    );
    if (target) {
      setTimeout(() => openMotorModal(target.id), 400);
    }
  }
}

// 17. PDF Certificate Generation Engine
function generatePdfForMotor(id) {
  const motor = allData.motors.find(m => m.id === id);
  if (motor) downloadSingleMotorPdfObj(motor);
}

function downloadSingleMotorPdf() {
  if (selectedMotor) downloadSingleMotorPdfObj(selectedMotor);
}

function downloadSingleMotorPdfObj(motor) {
  const container = document.getElementById('pdfExportContainer');
  container.style.display = 'block';

  container.innerHTML = `
    <div class="pdf-certificate-template">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; color: #0284c7; font-weight: 800;">CENTRAL MOTOR MONITORING</h2>
          <p style="font-size: 11px; color: #64748b;">EQUIPMENT MAINTENANCE & DIAGNOSTIC CERTIFICATE</p>
        </div>
        <div style="text-align: right; font-size: 11px; color: #475569;">
          <div><strong>Report No:</strong> ${motor.report_no || 'CEID/VAL/2026'}</div>
          <div><strong>Category:</strong> ${motor.motor_type} Motor</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom: 20px;">
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; width:30%; background:#f8fafc;">Motor Serial No.</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; color:#0284c7;">${motor.motor_sr_no}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Application / Usage (5)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.application || motor.motor_name}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Plant Unit</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.plant} (${motor.location})</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Power Rating (kW)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.kw} kW</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Voltage (1)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.voltage || 'N/A'}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Current / FLC (2)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.current || motor.flc ? (motor.current || motor.flc) + ' A' : 'N/A'}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">RPM / Speed (3)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.rpm || 'N/A'}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Frame Size (4)</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.frame_size || 'N/A'}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Make</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.make}</td></tr>
        <tr><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:700; background:#f8fafc;">Status</td><td style="border:1px solid #cbd5e1; padding:8px; font-size:12px; font-weight:800; color:${motor.status==='Done'?'#059669':'#d97706'};">${motor.status.toUpperCase()}</td></tr>
      </table>

      <h4 style="font-size: 13px; color: #0284c7; margin-bottom: 8px;">TAN DELTA INSULATION VALUES</h4>
      <table style="width:100%; border-collapse:collapse; margin-bottom: 24px; text-align:center;">
        <tr style="background:#f1f5f9;">
          <th style="border:1px solid #cbd5e1; padding:8px; font-size:11px;">Tan Delta @ 0.2 VL</th>
          <th style="border:1px solid #cbd5e1; padding:8px; font-size:11px;">Tan Delta Phase-Ground</th>
          <th style="border:1px solid #cbd5e1; padding:8px; font-size:11px;">Tan Delta Tip Up (%)</th>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.tan_delta_0_2vl || 'N/A'}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.tan_delta_phase_ground || 'N/A'}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; font-size:12px;">${motor.tan_delta_tip_up || 'N/A'}</td>
        </tr>
      </table>

      <div style="display:flex; justify-content:space-between; margin-top: 40px; padding-top:16px; border-top:1px solid #e2e8f0;">
        <div style="text-align:center; width:180px;">
          <div style="border-bottom:1px solid #64748b; height:30px;"></div>
          <div style="font-size:11px; color:#475569; margin-top:4px;">Testing Engineer Signature</div>
        </div>
        <div style="text-align:center; width:180px;">
          <div style="border-bottom:1px solid #64748b; height:30px;"></div>
          <div style="font-size:11px; color:#475569; margin-top:4px;">Maintenance HOD Stamp & Date</div>
        </div>
      </div>
    </div>
  `;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `CenterMotorClub_${motor.motor_type}_${motor.motor_sr_no.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(container).save().then(() => {
    container.style.display = 'none';
  });
}

function exportFilteredPdfSummary() {
  const currentList = currentTab === 'tab-inventory-lt' ? ltFilteredMotors : htFilteredMotors;
  if (!currentList.length) return alert('No data to export.');

  const container = document.getElementById('pdfExportContainer');
  container.style.display = 'block';

  const rows = currentList.slice(0, 100).map((m, i) => `
    <tr>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${i+1}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px; font-weight:700;">${m.motor_sr_no}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.application || m.motor_name}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.plant}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.kw} kW</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.voltage || ''}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.current || m.flc || ''}A</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.rpm || ''}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">${m.make}</td>
      <td style="border:1px solid #cbd5e1; padding:6px; font-size:10px; font-weight:700; color:${m.status==='Done'?'#059669':'#d97706'};">${m.status}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="padding:20px; font-family:sans-serif; background:#fff; color:#0f172a;">
      <h2 style="color:#0284c7; margin-bottom:4px;">CENTRAL MOTOR MONITORING MAINTENANCE SUMMARY REPORT</h2>
      <p style="font-size:11px; color:#64748b; margin-bottom:16px;">Total PostgreSQL Motors Listed: ${currentList.length} | Date: ${new Date().toLocaleDateString()}</p>
      <table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">#</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Serial No</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Application</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Plant</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Power</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Voltage</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Current</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">RPM</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Make</th>
            <th style="border:1px solid #cbd5e1; padding:6px; font-size:10px;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `CenterMotorClub_Summary_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(container).save().then(() => {
    container.style.display = 'none';
  });
}

// 18. CSV Exporter Engine
function exportDataToCsv() {
  const currentList = allData.motors;
  if (!currentList.length) return alert('No data to export.');

  const headers = ['ID', 'Type', 'Motor Serial No', 'Application', 'Plant', 'Location', 'Power (kW)', 'Voltage', 'Current (A)', 'RPM', 'Frame Size', 'Make', 'Status', 'Is Critical', 'Testing Remark', 'Report No', 'Tan Delta 0.2 VL', 'Tan Delta Phase-Ground', 'Tan Delta Tip Up %'];
  const csvRows = [headers.join(',')];

  currentList.forEach(m => {
    const row = [
      `"${m.id}"`, `"${m.motor_type}"`, `"${m.motor_sr_no}"`, `"${m.application || m.motor_name}"`, `"${m.plant}"`, `"${m.location}"`,
      `"${m.kw}"`, `"${m.voltage}"`, `"${m.current || m.flc}"`, `"${m.rpm}"`, `"${m.frame_size}"`, `"${m.make}"`, `"${m.status}"`, `"${m.is_critical}"`,
      `"${m.testing_remark}"`, `"${m.report_no}"`, `"${m.tan_delta_0_2vl}"`, `"${m.tan_delta_phase_ground}"`, `"${m.tan_delta_tip_up}"`
    ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `CenterMotorClub_Motors_Data_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// 19. Theme Switcher
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);

  const icon = document.getElementById('themeIcon');
  icon.className = newTheme === 'dark' ? 'ri-sun-line' : 'ri-moon-line';

  if (deptChartInstance) initCharts();
}

// 20. Historical Test Logs & Trends Engine
function openMotorHistoryModal() {
  if (!selectedMotor) return;
  currentHistoryMotorId = selectedMotor.id;
  
  // Update UI
  document.getElementById('historyModalTitle').textContent = `Test History: ${selectedMotor.motor_sr_no}`;
  document.getElementById('historyModalSub').textContent = `${selectedMotor.plant} | ${selectedMotor.application || selectedMotor.motor_name}`;
  
  document.getElementById('historyModal').classList.add('active');
  fetchAndRenderHistory();
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('active');
  currentHistoryMotorId = null;
}

async function fetchAndRenderHistory() {
  try {
    const res = await fetch(`${API_BASE_URL}/motors/${currentHistoryMotorId}/history`);
    const data = await res.json();
    const history = data.history || [];
    
    // Render Table
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No historical test logs found.</td></tr>';
    } else {
      history.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 600;">${new Date(log.test_date).toLocaleDateString()}</td>
          <td>${log.tan_delta_0_2vl || '-'}</td>
          <td>${log.tan_delta_phase_ground || '-'}</td>
          <td>${log.tan_delta_tip_up || '-'}</td>
          <td>${log.tested_by || '-'}</td>
          <td style="color: var(--text-muted); font-size: 11px;">${log.testing_remark || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Render Chart
    renderHistoryChart(history);

  } catch (err) {
    console.error('Failed to fetch history:', err);
    alert('Error loading motor history.');
  }
}

function renderHistoryChart(history) {
  const ctx = document.getElementById('historyChart').getContext('2d');
  
  if (historyChartInstance) {
    historyChartInstance.destroy();
  }

  // Filter logs that actually have Tan Delta 0.2VL values
  const chartData = history
    .filter(log => log.tan_delta_0_2vl && !isNaN(parseFloat(log.tan_delta_0_2vl)))
    .map(log => ({
      date: new Date(log.test_date).toLocaleDateString(),
      val02: parseFloat(log.tan_delta_0_2vl),
      valGround: log.tan_delta_phase_ground ? parseFloat(log.tan_delta_phase_ground) : null
    }));

  if (chartData.length === 0) {
    // Show empty chart
    historyChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: ['No Data'], datasets: [] },
      options: { maintainAspectRatio: false }
    });
    return;
  }

  historyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.map(d => d.date),
      datasets: [
        {
          label: 'Tan Delta (0.2 VL)',
          data: chartData.map(d => d.val02),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#2563eb',
          pointRadius: 4,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Tan Delta (Phase-Ground)',
          data: chartData.map(d => d.valGround),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.0)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#059669',
          pointRadius: 4,
          tension: 0.3,
          fill: false,
          hidden: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-main') } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color') },
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted') }
        },
        x: {
          grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color') },
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted') }
        }
      }
    }
  });
}

function openAddTestLogModal() {
  document.getElementById('addTestLogForm').reset();
  document.getElementById('logTestDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('addTestLogModal').classList.add('active');
}

function closeAddTestLogModal() {
  document.getElementById('addTestLogModal').classList.remove('active');
}

async function handleAddTestLogSubmit(e) {
  e.preventDefault();
  
  if (!currentHistoryMotorId) return;

  const payload = {
    test_date: document.getElementById('logTestDate').value,
    tan_delta_0_2vl: document.getElementById('logTan02').value || null,
    tan_delta_phase_ground: document.getElementById('logTanGround').value || null,
    tan_delta_tip_up: document.getElementById('logTanTipUp').value || null,
    testing_remark: document.getElementById('logRemarks').value,
    tested_by: currentUser ? currentUser.name : 'Unknown'
  };

  try {
    const res = await fetch(`${API_BASE_URL}/motors/${currentHistoryMotorId}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to save test log');
    
    closeAddTestLogModal();
    // Refresh history view
    fetchAndRenderHistory();
    
    // Also quietly refresh the main motors list so the background UI is up to date (optional)
    fetchMotors();
    
  } catch (err) {
    console.error(err);
    alert('Error saving test log.');
  }
}
