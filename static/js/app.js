/**
 * Demand-Based Transport Fleet Optimization and Scheduling System
 * Application Controller (Left Sidebar Navigation, 4 Modules, Non-Scrollable Date Input)
 */

const STATE = {
    selectedDate: '2026-01-01',
    selectedHour: 8,
    selectedServiceClass: 'All',
    selectedRoute: 'All',
    routesList: [],
    currentTab: 'tab-bunching',
    scenarioResults: {} // Persists evaluated reports per scenario tab
};

const MODULE_TITLES = {
    'tab-bunching': {
        title: '1. Bus Bunching Prediction',
        desc: 'Headway Regularity, Delay Telemetry & Early Spacing Warning'
    },
    'tab-demand': {
        title: '2. Passenger Demand Prediction',
        desc: 'Hourly Demand Forecasting, Total Capacity & Deficit Bottleneck Detection'
    },
    'tab-allocation': {
        title: '3. Fleet Allocation & Reallocation',
        desc: 'Fleet Utilization Balancing, Route-to-Route Shifts & Automated Dispatch'
    },
    'tab-what-if': {
        title: '4. What-If & Emergency Scenario Analysis',
        desc: 'Operational Disruption Simulator, Breakdown Replacement & Manual Reallocation'
    }
};

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
    initSidebarNavigation();
    initScenarioTabs();
    await loadFilterOptions();
    initFilterEventListeners();
    await refreshActiveModule();
});

/**
 * Initialize Left Sidebar Navigation
 */
function initSidebarNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const headerTitle = document.getElementById('module-header-title');
    const headerDesc = document.getElementById('module-header-desc');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(t => t.classList.remove('active'));
            item.classList.add('active');

            const targetPaneId = item.getAttribute('data-tab');
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });

            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) {
                targetPane.classList.add('active');
            }

            STATE.currentTab = targetPaneId;

            // Update top bar module title & description
            if (MODULE_TITLES[targetPaneId]) {
                if (headerTitle) headerTitle.textContent = MODULE_TITLES[targetPaneId].title;
                if (headerDesc) headerDesc.textContent = MODULE_TITLES[targetPaneId].desc;
            }

            refreshActiveModule();
        });
    });
}

/**
 * Initialize What-If Scenario Sub-Tabs within What-If Tab
 */
function initScenarioTabs() {
    const scenarioTabs = document.querySelectorAll('.scenario-tab');
    scenarioTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            scenarioTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const scenarioType = tab.getAttribute('data-scenario');
            document.querySelectorAll('.scenario-form').forEach(form => {
                form.classList.remove('active');
            });
            const activeForm = document.getElementById(`scenario-form-${scenarioType}`);
            if (activeForm) {
                activeForm.classList.add('active');
            }

            const resultBox = document.getElementById('scenario-result-box');
            const resultContent = document.getElementById('sim-result-content');
            const manualResult = document.getElementById('manual-allocation-result');

            if (scenarioType === 'manual_allocation') {
                if (resultBox) resultBox.style.display = 'none';
                if (manualResult) {
                    const saved = STATE.scenarioResults['manual_allocation'];
                    if (saved) {
                        manualResult.style.display = 'block';
                        manualResult.style.background = saved.bg;
                        manualResult.style.borderColor = saved.border;
                        const titleEl = document.getElementById('manual-result-title');
                        const textEl = document.getElementById('manual-result-text');
                        const timeEl = document.getElementById('manual-result-time');
                        if (titleEl) {
                            titleEl.textContent = saved.title;
                            titleEl.style.color = saved.color;
                        }
                        if (textEl) textEl.innerHTML = saved.html;
                        if (timeEl) timeEl.textContent = saved.time;
                    } else {
                        manualResult.style.display = 'none';
                    }
                }
                loadWhatIfModule();
            } else {
                if (manualResult) manualResult.style.display = 'none';

                // Restore previously evaluated result for this specific scenario
                if (STATE.scenarioResults[scenarioType]) {
                    renderSimulationResult(STATE.scenarioResults[scenarioType], scenarioType);
                    if (resultBox) resultBox.style.display = 'block';
                } else {
                    if (resultBox) resultBox.style.display = 'none';
                    if (resultContent) resultContent.innerHTML = '';
                }
            }
        });
    });
}

/**
 * Load Dates, Hours, Routes, and Service Classes from /api/filters
 */
async function loadFilterOptions() {
    try {
        const resp = await fetch('/api/filters');
        if (!resp.ok) throw new Error('Failed to load filter metadata');
        const data = await resp.json();

        STATE.routesList = data.routes || [];

        // Setup Date Input (Non-scrollable native date picker)
        const dateInput = document.getElementById('filter-date');
        if (dateInput) {
            if (data.default_date) dateInput.value = data.default_date;
            if (data.dates && data.dates.length > 0) {
                dateInput.min = data.dates[0];
                dateInput.max = data.dates[data.dates.length - 1];
            }
            STATE.selectedDate = dateInput.value || '2026-01-01';
        }

        // Populate Hours Dropdown
        const hourSelect = document.getElementById('filter-hour');
        if (hourSelect && data.hours) {
            hourSelect.innerHTML = '';
            data.hours.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h;
                const isPeak = [8, 9, 10, 17, 18, 19].includes(h);
                const period = h < 12 ? 'AM' : 'PM';
                const dispHour = h % 12 === 0 ? 12 : h % 12;
                opt.textContent = `${String(dispHour).padStart(2, '0')}:00 ${period}${isPeak ? ' (Peak)' : ''}`;
                if (h === data.default_hour) opt.selected = true;
                hourSelect.appendChild(opt);
            });
            STATE.selectedHour = data.default_hour || 8;
        }

        // Populate Routes in Shared Filter Bar
        populateRouteDropdown('filter-route', STATE.routesList, true);

        // Populate Routes in Scenario Simulator dropdowns
        populateRouteDropdown('sim-route-breakdown', STATE.routesList, false);
        populateRouteDropdown('sim-route-booth', STATE.routesList, false);
        populateRouteDropdown('sim-route-vip', STATE.routesList, false);
        populateRouteDropdown('sim-route-constrained', STATE.routesList, false);

        // Pre-populate Manual Allocation controls so dropdowns are never blank
        populateManualAllocationControls([], STATE.routesList);

        updateClockBadge();
    } catch (err) {
        console.error('Error fetching filters:', err);
    }
}

/**
 * Helper to populate a route <select> element
 */
function populateRouteDropdown(selectId, routes, includeAllOption) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = '';

    if (includeAllOption) {
        const allOpt = document.createElement('option');
        allOpt.value = 'All';
        allOpt.textContent = `All Corridors (${routes.length} Routes)`;
        el.appendChild(allOpt);
    }

    routes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.route_id;
        opt.textContent = `${r.route_id} - ${r.route_name} (${r.service_class})`;
        el.appendChild(opt);
    });
}

/**
 * Filter change event listeners
 */
function initFilterEventListeners() {
    const dateInput = document.getElementById('filter-date');
    const hourSel = document.getElementById('filter-hour');
    const serviceSel = document.getElementById('filter-service');
    const routeSel = document.getElementById('filter-route');
    const refreshBtn = document.getElementById('btn-refresh');

    const handleChange = () => {
        if (dateInput) STATE.selectedDate = dateInput.value;
        if (hourSel) STATE.selectedHour = parseInt(hourSel.value, 10);
        if (serviceSel) STATE.selectedServiceClass = serviceSel.value;
        if (routeSel) STATE.selectedRoute = routeSel.value;

        // Reset scenario results on date/hour/filter change
        STATE.scenarioResults = {};
        const resultBox = document.getElementById('scenario-result-box');
        if (resultBox) resultBox.style.display = 'none';
        const resultContent = document.getElementById('sim-result-content');
        if (resultContent) resultContent.innerHTML = '';
        const manualResult = document.getElementById('manual-allocation-result');
        if (manualResult) manualResult.style.display = 'none';

        updateClockBadge();
        refreshActiveModule();
    };

    if (dateInput) dateInput.addEventListener('change', handleChange);
    if (hourSel) hourSel.addEventListener('change', handleChange);
    if (serviceSel) serviceSel.addEventListener('change', () => {
        filterRouteOptionsByService(serviceSel.value);
        handleChange();
    });
    if (routeSel) routeSel.addEventListener('change', handleChange);
    if (refreshBtn) refreshBtn.addEventListener('click', handleChange);
}

function filterRouteOptionsByService(serviceClass) {
    const routeSel = document.getElementById('filter-route');
    if (!routeSel) return;
    const currentVal = routeSel.value;

    let filtered = STATE.routesList;
    if (serviceClass && serviceClass !== 'All') {
        filtered = STATE.routesList.filter(r => r.service_class === serviceClass);
    }

    populateRouteDropdown('filter-route', filtered, true);
    if (filtered.some(r => r.route_id === currentVal)) {
        routeSel.value = currentVal;
    } else {
        routeSel.value = 'All';
        STATE.selectedRoute = 'All';
    }
}

function updateClockBadge() {
    const badge = document.getElementById('system-clock');
    if (!badge) return;
    const h = STATE.selectedHour;
    const period = h < 12 ? 'AM' : 'PM';
    const dispHour = h % 12 === 0 ? 12 : h % 12;
    badge.textContent = `${String(dispHour).padStart(2, '0')}:00 ${period}`;
}

/**
 * Refresh Active Module
 */
async function refreshActiveModule() {
    if (STATE.currentTab === 'tab-bunching') {
        await loadBunchingModule();
    } else if (STATE.currentTab === 'tab-demand') {
        await loadDemandModule();
    } else if (STATE.currentTab === 'tab-allocation') {
        await loadAllocationModule();
    } else if (STATE.currentTab === 'tab-what-if') {
        await loadWhatIfModule();
    }
}

/**
 * =========================================================
 * MODULE 1: BUS BUNCHING PREDICTION
 * =========================================================
 */
async function loadBunchingModule() {
    const url = `/api/bunching?date=${encodeURIComponent(STATE.selectedDate)}&hour=${STATE.selectedHour}&service_class=${encodeURIComponent(STATE.selectedServiceClass)}&route_id=${encodeURIComponent(STATE.selectedRoute)}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to load bunching telemetry');
        const data = await resp.json();

        // Update KPIs
        const totalEl = document.getElementById('kpi-bunching-total');
        const countEl = document.getElementById('kpi-bunching-count');
        const rateEl = document.getElementById('kpi-bunching-rate');
        const statusEl = document.getElementById('kpi-bunching-status');
        const badgeEl = document.getElementById('bunching-trip-count-badge');

        if (totalEl) totalEl.textContent = data.summary.total_trips;
        if (countEl) countEl.textContent = data.summary.bunching_count;
        if (rateEl) rateEl.textContent = `${data.summary.bunching_rate_pct}%`;
        
        if (statusEl) {
            statusEl.textContent = data.summary.system_status;
            statusEl.className = 'kpi-value ' + (data.summary.system_status === 'CRITICAL' ? 'text-danger' : (data.summary.system_status === 'WARNING' ? 'text-warning' : 'text-success'));
        }
        if (badgeEl) badgeEl.textContent = `${data.summary.total_trips} Trips Monitored`;

        // Render Chart
        if (typeof renderBunchingRiskChart === 'function') {
            renderBunchingRiskChart(data.route_chart);
        }

        // Render Table
        renderBunchingTable(data.trips);
    } catch (err) {
        console.error('Error in loadBunchingModule:', err);
    }
}

function renderBunchingTable(trips) {
    const tbody = document.getElementById('table-bunching-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!trips || trips.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">No trips matching selected filter criteria.</td></tr>';
        return;
    }

    trips.forEach(t => {
        const tr = document.createElement('tr');
        const isBunching = t.prediction === 'Bunching';
        const statusBadgeClass = isBunching ? 'badge-danger' : 'badge-green';
        const delayBadgeClass = t.departure_delay > 8 ? 'badge-orange' : 'badge-gray';

        tr.innerHTML = `
            <td>
                <strong>${t.route_id}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">${t.route_name}</div>
            </td>
            <td><span class="badge badge-gray">${t.service_class}</span></td>
            <td>${t.scheduled_headway}m</td>
            <td><strong>${t.actual_headway}m</strong></td>
            <td><span class="badge ${delayBadgeClass}">+${t.departure_delay}m</span></td>
            <td>
                <span class="badge ${statusBadgeClass}">
                    ${isBunching ? '⚠️ BUNCHING' : '✓ Normal'} (${t.bunching_probability}%)
                </span>
            </td>
            <td style="font-size: 11.5px; color: ${isBunching ? '#b91c1c' : '#334155'}; font-weight: ${isBunching ? '600' : '400'};">
                ${t.advisory}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * =========================================================
 * MODULE 2: PASSENGER DEMAND PREDICTION
 * =========================================================
 */
async function loadDemandModule() {
    const url = `/api/demand?date=${encodeURIComponent(STATE.selectedDate)}&hour=${STATE.selectedHour}&service_class=${encodeURIComponent(STATE.selectedServiceClass)}&route_id=${encodeURIComponent(STATE.selectedRoute)}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to load passenger demand forecast');
        const data = await resp.json();

        // Update KPIs
        const totalEl = document.getElementById('kpi-demand-total');
        const capEl = document.getElementById('kpi-demand-capacity');
        const shortEl = document.getElementById('kpi-demand-shortage');
        const bottleEl = document.getElementById('kpi-demand-bottlenecks');
        const flagEl = document.getElementById('demand-calendar-flag');

        if (totalEl) totalEl.textContent = data.summary.total_predicted_demand.toLocaleString();
        if (capEl) capEl.textContent = data.summary.total_fleet_capacity.toLocaleString();
        
        if (shortEl) {
            shortEl.textContent = data.summary.net_capacity_deficit.toLocaleString();
            shortEl.className = 'kpi-value ' + (data.summary.net_capacity_deficit > 0 ? 'text-danger' : 'text-success');
        }
        if (bottleEl) bottleEl.textContent = data.summary.shortage_routes_count;

        if (flagEl) {
            flagEl.textContent = data.calendar_status;
            flagEl.className = 'badge ' + (data.is_peak_hour ? 'badge-blue' : 'badge-gray');
        }

        // Render Grouped Bar Chart
        if (typeof renderDemandCapacityChart === 'function') {
            renderDemandCapacityChart(data.routes);
        }

        // Render Table
        renderDemandTable(data.routes);
    } catch (err) {
        console.error('Error in loadDemandModule:', err);
    }
}

function renderDemandTable(routes) {
    const tbody = document.getElementById('table-demand-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!routes || routes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">No routes matching selected filter criteria.</td></tr>';
        return;
    }

    routes.forEach(r => {
        const tr = document.createElement('tr');
        let statusBadge = '<span class="badge badge-green">Optimal</span>';
        if (r.status === 'Severe Shortage') {
            statusBadge = '<span class="badge badge-danger">Severe Shortage</span>';
        } else if (r.status === 'Capacity Deficit') {
            statusBadge = '<span class="badge badge-orange">Capacity Deficit</span>';
        } else if (r.status === 'Surplus Capacity') {
            statusBadge = '<span class="badge badge-orange">Surplus</span>';
        }

        tr.innerHTML = `
            <td>
                <strong>${r.route_id}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">${r.route_name}</div>
            </td>
            <td><span class="badge badge-gray">${r.service_class}</span></td>
            <td>${r.total_capacity} seats</td>
            <td><strong>${Math.round(r.predicted_next_hour_demand)} pax</strong></td>
            <td>
                <span class="${r.capacity_shortage >= 1 ? 'text-danger' : 'text-success'}" style="font-weight: 600;">
                    ${r.capacity_shortage >= 1 ? `+${Math.round(r.capacity_shortage)} pax deficit` : '0 (Balanced)'}
                </span>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span>${r.utilization_pct}%</span>
                    <div style="width: 50px; height: 6px; background: #fed7aa; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${Math.min(100, r.utilization_pct)}%; height: 100%; background: ${r.utilization_pct > 100 ? '#dc2626' : (r.utilization_pct > 80 ? '#ea580c' : '#f97316')};"></div>
                    </div>
                </div>
            </td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * =========================================================
 * MODULE 3: FLEET ALLOCATION & REALLOCATION
 * =========================================================
 */
async function loadAllocationModule() {
    try {
        const resp = await fetch('/api/allocation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: STATE.selectedDate,
                hour: STATE.selectedHour,
                service_class: STATE.selectedServiceClass,
                shortage_threshold: 20.0
            })
        });

        if (!resp.ok) throw new Error('Failed to calculate fleet allocation recommendations');
        const data = await resp.json();

        // 1. Deficit Corridors ONLY (Routes requiring extra buses: shortage >= 1 pax)
        const deficitList = (data.all_routes || []).filter(r => r.capacity_shortage >= 1);

        // 2. Surplus Corridors ONLY (Routes with genuine spare buses)
        const surplusList = (data.fleet_surplus_analysis || []).filter(r => r.surplus_buses_available > 0);
        const totalSurplus = surplusList.reduce((acc, r) => acc + r.surplus_buses_available, 0);

        // Update KPIs
        const defEl = document.getElementById('kpi-alloc-deficits');
        const surpEl = document.getElementById('kpi-alloc-surplus');
        const feasEl = document.getElementById('kpi-alloc-feasible');
        const relEl = document.getElementById('kpi-alloc-relieved');

        if (defEl) defEl.textContent = `${deficitList.length} Routes`;
        if (surpEl) surpEl.textContent = `${totalSurplus} Buses`;
        if (feasEl) feasEl.textContent = data.summary.feasible_recommendations;
        if (relEl) relEl.textContent = `${data.summary.total_shortage_addressed} Seats`;

        // Render Deficit Table (No balanced routes!)
        renderDeficitTable(deficitList);

        // Render Surplus Table (No balanced routes!)
        renderSurplusTable(surplusList);

        // Render Automated Directives Table
        renderAllocationTable(data.recommendations);

        // Populate Manual Allocation Selectors (Available in What-If Module)
        populateManualAllocationControls(surplusList, data.all_routes || []);
    } catch (err) {
        console.error('Error in loadAllocationModule:', err);
    }
}

function renderDeficitTable(deficitList) {
    const tbody = document.getElementById('table-deficit-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!deficitList || deficitList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">✓ All monitored corridors have sufficient seating capacity. No deficits detected.</td></tr>';
        return;
    }

    deficitList.forEach(r => {
        const tr = document.createElement('tr');
        const capPerBus = r.capacity_per_bus || (r.available_buses > 0 ? Math.round(r.total_capacity / r.available_buses) : 55);
        const busesNeeded = Math.ceil(r.capacity_shortage / Math.max(1, capPerBus));

        tr.innerHTML = `
            <td><strong>${r.route_id}</strong></td>
            <td>
                <div>${r.route_name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${r.bus_type}</div>
            </td>
            <td><span class="badge badge-gray">${r.service_class}</span></td>
            <td><strong>${r.available_buses}</strong> buses</td>
            <td><strong>${Math.round(r.predicted_next_hour_demand)}</strong> pax</td>
            <td><strong class="text-danger">+${Math.round(r.capacity_shortage)} pax</strong></td>
            <td><span class="badge badge-danger">+${busesNeeded} bus${busesNeeded > 1 ? 'es' : ''} needed</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSurplusTable(surplusList) {
    const tbody = document.getElementById('table-surplus-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!surplusList || surplusList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">All active routes are currently at capacity or minimum service floor. Central Depot standby reserves active.</td></tr>';
        return;
    }

    surplusList.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${r.route_id}</strong></td>
            <td>
                <div>${r.route_name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${r.bus_type}</div>
            </td>
            <td><span class="badge badge-gray">${r.service_class}</span></td>
            <td><strong>${r.current_buses}</strong> buses</td>
            <td><strong>${Math.round(r.predicted_demand)}</strong> pax</td>
            <td>${r.minimum_service_buses} buses</td>
            <td><span class="badge badge-green">✓ +${r.surplus_buses_available} to Spare</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAllocationTable(recommendations) {
    const tbody = document.getElementById('table-allocation-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!recommendations || recommendations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 1.5rem;">All routes have adequate seating capacity. Fleet distribution is balanced.</td></tr>';
        return;
    }

    recommendations.forEach(rec => {
        const tr = document.createElement('tr');
        const isFeasible = rec.feasibility === 'FEASIBLE';
        const feasBadge = isFeasible ? '<span class="badge badge-green">✓ FEASIBLE</span>' : '<span class="badge badge-danger">✗ REJECTED</span>';

        tr.innerHTML = `
            <td><code>${rec.recommendation_id}</code></td>
            <td>
                <strong>${rec.target_route_id}</strong>
                <span class="badge badge-gray" style="font-size: 10px;">${rec.target_service_class}</span>
                <div style="font-size: 11px; color: var(--text-muted);">${rec.target_route_name}</div>
            </td>
            <td><strong class="text-danger">+${rec.predicted_shortage} pax</strong></td>
            <td>
                ${rec.source_route_id !== 'None' ? `
                    <strong>${rec.source_route_id}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${rec.source_route_name}</div>
                ` : '<span class="text-muted">None (Depot Empty)</span>'}
            </td>
            <td><span class="badge badge-orange">${rec.recommended_bus_type}</span></td>
            <td>${feasBadge}</td>
            <td style="max-width: 300px; font-size: 11.5px; color: var(--text-main);">
                <div>${rec.reason}</div>
                <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 3px;"><strong>Constraints:</strong> ${rec.constraints_checked}</div>
            </td>
            <td>
                ${isFeasible ? `
                    <button class="btn btn-primary btn-sm" id="btn-approve-${rec.recommendation_id}" onclick="approveDirective('${rec.recommendation_id}')">
                        Approve Dispatch
                    </button>
                ` : '<span class="badge badge-gray">No Action</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * MODULE 4: WHAT-IF & EMERGENCY SCENARIO SIMULATOR
 */
async function loadWhatIfModule() {
    try {
        const resp = await fetch('/api/allocation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: STATE.selectedDate,
                hour: STATE.selectedHour,
                service_class: 'All',
                shortage_threshold: 20.0
            })
        });
        if (resp.ok) {
            const data = await resp.json();
            populateManualAllocationControls(data.fleet_surplus_analysis || [], data.all_routes || STATE.routesList || []);
        } else {
            populateManualAllocationControls([], STATE.routesList || []);
        }
    } catch (err) {
        console.error('Error in loadWhatIfModule:', err);
        populateManualAllocationControls([], STATE.routesList || []);
    }
}

function populateManualAllocationControls(surplusList, allRoutes) {
    const srcSelect = document.getElementById('manual-source-select');
    const dstSelect = document.getElementById('manual-target-select');
    if (!srcSelect || !dstSelect) return;

    // Preserve selections if possible
    const prevSrc = srcSelect.value;
    const prevDst = dstSelect.value;

    srcSelect.innerHTML = '';
    dstSelect.innerHTML = '';

    // 1. Standby Depot Reserves
    const depotOptGroup = document.createElement('optgroup');
    depotOptGroup.label = '— Central Depot Standby Reserves —';

    const depotReserves = [
        { id: 'DEPOT-RES-01', text: 'Depot Reserve 01 (City Normal Bus - Standby)' },
        { id: 'DEPOT-RES-02', text: 'Depot Reserve 02 (City Normal Bus - Standby)' },
        { id: 'DEPOT-RES-REG', text: 'Depot Reserve Regional (Regional Normal Bus - Standby)' },
        { id: 'DEPOT-RES-AC', text: 'Depot Reserve AC Coach (Intercity AC Coach - Standby)' }
    ];
    depotReserves.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.text;
        depotOptGroup.appendChild(opt);
    });
    srcSelect.appendChild(depotOptGroup);

    // 2. Surplus Routes (Priority Donors)
    const routesOptGroup = document.createElement('optgroup');
    routesOptGroup.label = '— Active Routes With Surplus Buses —';

    const donorsWithSurplus = (surplusList || []).filter(r => (r.surplus_buses_available || 0) > 0);
    if (donorsWithSurplus.length > 0) {
        donorsWithSurplus.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.route_id;
            opt.textContent = `${r.route_id} - ${r.route_name} (+${r.surplus_buses_available} surplus ${r.bus_type} bus)`;
            routesOptGroup.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'No route currently has surplus buses (use Depot)';
        routesOptGroup.appendChild(opt);
    }
    srcSelect.appendChild(routesOptGroup);

    // Also include any other route for manual flexibility
    const otherRoutesGroup = document.createElement('optgroup');
    otherRoutesGroup.label = '— Other Active Corridors (Subject to Min Service) —';
    const fallbackRoutes = (allRoutes && allRoutes.length > 0) ? allRoutes : STATE.routesList;
    const otherList = (surplusList && surplusList.length > 0)
        ? surplusList.filter(r => (r.surplus_buses_available || 0) <= 0)
        : fallbackRoutes;

    otherList.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.route_id;
        opt.textContent = `${r.route_id} - ${r.route_name} (Active Corridor)`;
        otherRoutesGroup.appendChild(opt);
    });
    if (otherList.length > 0) {
        srcSelect.appendChild(otherRoutesGroup);
    }

    // Populate Destination Routes
    const dstDeficitGroup = document.createElement('optgroup');
    dstDeficitGroup.label = '— Capacity Deficit Routes (High Priority) —';

    const deficitRoutes = (allRoutes || []).filter(r => (r.capacity_shortage || 0) >= 1);
    if (deficitRoutes.length > 0) {
        deficitRoutes.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.route_id;
            opt.textContent = `⚠️ ${r.route_id} - ${r.route_name} (+${Math.round(r.capacity_shortage)} pax deficit)`;
            dstDeficitGroup.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'No deficit routes detected (Capacity Meets Demand)';
        dstDeficitGroup.appendChild(opt);
    }
    dstSelect.appendChild(dstDeficitGroup);

    const dstAllGroup = document.createElement('optgroup');
    dstAllGroup.label = '— All Corridors —';
    const fullRouteList = (allRoutes && allRoutes.length > 0) ? allRoutes : STATE.routesList;
    (fullRouteList || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.route_id;
        opt.textContent = `${r.route_id} - ${r.route_name} (${r.service_class || ''} - ${r.bus_type || ''})`;
        dstAllGroup.appendChild(opt);
    });
    dstSelect.appendChild(dstAllGroup);

    // Default select
    if (prevSrc && srcSelect.querySelector(`option[value="${prevSrc}"]`)) {
        srcSelect.value = prevSrc;
    } else {
        srcSelect.selectedIndex = 0; // Selects first Depot Reserve
    }

    if (prevDst && dstSelect.querySelector(`option[value="${prevDst}"]`)) {
        dstSelect.value = prevDst;
    } else if (deficitRoutes.length > 0) {
        dstSelect.value = deficitRoutes[0].route_id;
    } else {
        for (let i = 0; i < dstSelect.options.length; i++) {
            if (!dstSelect.options[i].disabled) {
                dstSelect.selectedIndex = i;
                break;
            }
        }
    }
}

async function executeManualAllocation() {
    const src = document.getElementById('manual-source-select').value;
    const dst = document.getElementById('manual-target-select').value;
    const count = parseInt(document.getElementById('manual-bus-count').value, 10) || 1;
    const notes = document.getElementById('manual-operator-notes').value || 'Manual operator transfer directive';
    const resultBox = document.getElementById('manual-allocation-result');
    const resultTitle = document.getElementById('manual-result-title');
    const resultText = document.getElementById('manual-result-text');
    const resultTime = document.getElementById('manual-result-time');
    const btn = document.getElementById('btn-manual-allocate');

    if (!src || !dst) {
        alert('Please select both a source fleet and a destination route.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Validating...';
    }

    const simResultBox = document.getElementById('scenario-result-box');
    if (simResultBox) simResultBox.style.display = 'none';

    try {
        const resp = await fetch('/api/allocation/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_id: src,
                target_route_id: dst,
                buses_to_shift: count,
                date: STATE.selectedDate,
                hour: STATE.selectedHour,
                operator_notes: notes
            })
        });

        const res = await resp.json();
        resultBox.style.display = 'block';
        resultTime.textContent = new Date().toLocaleTimeString();

        if (res.success) {
            resultBox.style.background = '#f0fdf4';
            resultBox.style.borderColor = '#bbf7d0';
            resultTitle.textContent = '✓ Bus Reallocation Executed Successfully';
            resultTitle.style.color = '#15803d';
            resultText.innerHTML = `
                <div><strong>Directive ID:</strong> ${res.directive.directive_id}</div>
                <div><strong>Source:</strong> ${res.directive.source}</div>
                <div><strong>Destination:</strong> ${res.directive.target}</div>
                <div><strong>Buses Shifted:</strong> ${res.directive.buses_shifted} (${res.directive.bus_type})</div>
                <div style="margin-top: 6px; color: #166534;">${res.message}</div>
            `;
            // Refresh allocations after successful shift
            setTimeout(() => {
                loadAllocationModule();
            }, 1000);
        } else {
            resultBox.style.background = '#fef2f2';
            resultBox.style.borderColor = '#fecaca';
            resultTitle.textContent = '✗ Manual Reallocation Blocked: Policy Violation';
            resultTitle.style.color = '#b91c1c';
            resultText.innerHTML = `
                <div><strong>Operational Violation:</strong> ${res.message}</div>
                <div style="font-size: 11px; margin-top: 4px; color: #7f1d1d;">
                    Transit policies prohibit transferring incompatible vehicle classes (e.g. City bus to Sleeper service) or dropping routes below their statutory minimum service floor.
                </div>
            `;
        }

        // Cache manual allocation result in state
        STATE.scenarioResults['manual_allocation'] = {
            success: res.success,
            title: resultTitle.textContent,
            color: resultTitle.style.color,
            bg: resultBox.style.background,
            border: resultBox.style.borderColor,
            html: resultText.innerHTML,
            time: resultTime.textContent
        };
    } catch (err) {
        console.error('Manual allocation error:', err);
        resultBox.style.display = 'block';
        resultBox.style.background = '#fef2f2';
        resultBox.style.borderColor = '#fecaca';
        resultTitle.textContent = '✗ Network Error';
        resultTitle.style.color = '#b91c1c';
        resultText.textContent = err.message || 'Failed to submit manual allocation directive.';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Validate & Execute Shift';
        }
    }
}

/**
 * Navigate to What-If Module and activate Manual Reallocation scenario
 */
function switchToManualWhatIf() {
    const whatIfNavBtn = document.querySelector('.sidebar-nav-item[data-tab="tab-what-if"]');
    if (whatIfNavBtn) whatIfNavBtn.click();
    setTimeout(() => {
        const manualScenarioTab = document.querySelector('.scenario-tab[data-scenario="manual_allocation"]');
        if (manualScenarioTab) manualScenarioTab.click();
    }, 150);
}

/**
 * Approve Reallocation Directive
 */
async function approveDirective(recId) {
    const btn = document.getElementById(`btn-approve-${recId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Approving...';
    }

    try {
        const resp = await fetch('/api/allocation/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recommendation_id: recId,
                operator_notes: 'Approved via Transport Operations Center Dashboard'
            })
        });

        if (!resp.ok) throw new Error('Approval request failed');
        const res = await resp.json();

        if (btn) {
            btn.className = 'badge badge-green';
            btn.textContent = '✓ Approved';
        }
        alert(`Success: Directive ${recId} has been recorded as APPROVED by the Operations Controller.`);
    } catch (err) {
        console.error('Approval failed:', err);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Approve Dispatch';
        }
        alert('Failed to approve recommendation. Please retry.');
    }
}

/**
 * =========================================================
 * MODULE 4: WHAT-IF & EMERGENCY SCENARIO SIMULATOR
 * =========================================================
 */
async function simulateScenario(scenarioType) {
    const resultBox = document.getElementById('scenario-result-box');
    const resultContent = document.getElementById('sim-result-content');

    let payload = {
        scenario_type: scenarioType,
        date: STATE.selectedDate,
        hour: STATE.selectedHour
    };

    if (scenarioType === 'breakdown') {
        payload.route_id = document.getElementById('sim-route-breakdown').value;
        payload.bus_type = document.getElementById('sim-bustype-breakdown').value;
        payload.count = parseInt(document.getElementById('sim-count-breakdown').value, 10) || 1;
    } else if (scenarioType === 'booth_request') {
        payload.route_id = document.getElementById('sim-route-booth').value;
        payload.stranded_pax = parseInt(document.getElementById('sim-pax-booth').value, 10) || 40;
        payload.bus_type = document.getElementById('sim-bustype-booth').value;
    } else if (scenarioType === 'vip_traffic') {
        payload.route_id = document.getElementById('sim-route-vip').value;
        payload.delay_multiplier = parseFloat(document.getElementById('sim-delay-vip').value) || 1.5;
    } else if (scenarioType === 'constrained_routes') {
        payload.route_id = document.getElementById('sim-route-constrained').value;
    }

    const manualResult = document.getElementById('manual-allocation-result');
    if (manualResult) manualResult.style.display = 'none';

    if (resultBox) resultBox.style.display = 'block';
    if (resultContent) resultContent.innerHTML = '<span class="text-muted">Simulating operational constraint solver...</span>';

    try {
        const resp = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error('Simulation calculation failed');
        const data = await resp.json();

        // Cache evaluated result for this specific scenario
        STATE.scenarioResults[scenarioType] = data;

        renderSimulationResult(data, scenarioType);
    } catch (err) {
        console.error('Simulation error:', err);
        if (resultContent) {
            resultContent.innerHTML = `<span class="text-danger">Simulation calculation failed: ${err.message}</span>`;
        }
    }
}

function renderSimulationResult(data, scenarioType) {
    const resultContent = document.getElementById('sim-result-content');
    const badge = document.getElementById('sim-result-badge');
    if (!resultContent) return;

    if (badge) {
        if (scenarioType === 'breakdown') {
            badge.textContent = 'Scenario A: Sudden Bus Breakdown Assessment';
        } else if (scenarioType === 'booth_request') {
            badge.textContent = 'Scenario B: Control Booth Emergency Dispatch';
        } else if (scenarioType === 'vip_traffic') {
            badge.textContent = 'Scenario D: VIP & Traffic Delay Assessment';
        } else if (scenarioType === 'constrained_routes') {
            badge.textContent = 'Scenario E: Operational Constraint Audit';
        } else {
            badge.textContent = 'Simulation Result';
        }
    }

    if (scenarioType === 'breakdown') {
        let optionsHtml = '';
        if (data.options && data.options.length > 0) {
            optionsHtml = `
                <div style="margin-top: 8px;">
                    <strong>Compatible Replacement Options Evaluated:</strong>
                    <ul style="padding-left: 1.25rem; margin-top: 4px;">
                        ${data.options.map(opt => `
                            <li>Corridor <strong>${opt.donor_route_id}</strong> (${opt.donor_name}): Compatible <strong>${opt.available_bus_type}</strong> bus available (~${opt.estimated_arrival_minutes} min repositioning ETA).</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        } else {
            optionsHtml = '<div style="margin-top: 6px; color: var(--danger-red);">No compatible vehicle found on adjacent corridors. Central reserve depot must be activated.</div>';
        }

        resultContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 8px;">
                <div><span class="text-muted">Corridor:</span> <strong>${data.affected_route}</strong></div>
                <div><span class="text-muted">Disabled Fleet:</span> <strong>${data.unavailable_buses} × ${data.bus_type}</strong></div>
                <div><span class="text-muted">Seat Capacity Deficit:</span> <strong class="text-danger">-${data.lost_seat_capacity} seats</strong></div>
            </div>
            ${optionsHtml}
            <div style="margin-top: 10px; padding: 8px 12px; background: var(--bg-page); border-radius: 4px; border: 1px solid var(--border-color);">
                <strong>Dispatch Action:</strong> ${data.action_advice}
            </div>
        `;
    } else if (scenarioType === 'booth_request') {
        resultContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 8px;">
                <div><span class="text-muted">Terminal / Corridor:</span> <strong>${data.route}</strong></div>
                <div><span class="text-muted">Stranded Passengers:</span> <strong class="text-danger">${data.stranded_passengers} pax</strong></div>
                <div><span class="text-muted">Urgency Level:</span> <span class="badge badge-orange">${data.urgency}</span></div>
            </div>
            <div style="margin-top: 8px; padding: 8px 12px; background: var(--bg-page); border-radius: 4px; border: 1px solid var(--border-color);">
                <strong>Simulated Response:</strong> ${data.feasible_response}
            </div>
        `;
    } else if (scenarioType === 'vip_traffic') {
        resultContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 8px;">
                <div><span class="text-muted">Corridor:</span> <strong>${data.affected_corridor}</strong></div>
                <div><span class="text-muted">Delay Surge:</span> <strong class="text-orange">${data.traffic_delay_multiplier}</strong></div>
                <div><span class="text-muted">Projected Trip Headway Delay:</span> <strong>${data.projected_headway_delay}</strong></div>
            </div>
            <div style="margin-top: 6px;"><span class="text-muted">Bunching Risk Impact:</span> <span class="badge badge-danger">${data.bunching_risk_elevation}</span></div>
            <div style="margin-top: 8px; padding: 8px 12px; background: var(--bg-page); border-radius: 4px; border: 1px solid var(--border-color);">
                <strong>Operational Advisory:</strong> ${data.recommended_dispatch_mitigation}
            </div>
        `;
    } else if (scenarioType === 'constrained_routes') {
        resultContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 8px;">
                <div><span class="text-muted">Corridor:</span> <strong>${data.route}</strong></div>
                <div><span class="text-muted">Base Fleet:</span> <strong>${data.base_fleet} buses</strong></div>
                <div><span class="text-muted">Statutory Minimum Service:</span> <strong>${data.minimum_service_limit} buses</strong></div>
            </div>
            <div style="margin-top: 6px; font-size: 12px;"><strong>Constraint Audit:</strong> ${data.constraint_assessment}</div>
            <div style="margin-top: 8px; padding: 8px 12px; background: var(--bg-page); border-radius: 4px; border: 1px solid var(--border-color);">
                <strong>Feasible Policy Alternative:</strong> ${data.feasible_alternative}
            </div>
        `;
    }
}
