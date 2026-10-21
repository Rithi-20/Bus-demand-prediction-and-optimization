/**
 * Demand Based Public Transport Planning System — Main Application Controller
 * Handles state, API communication, view switching, historical vs forecast mode, and real-time optimization.
 */

const STATE = {
    mode: 'historical_2026',
    selectedDate: '',
    selectedHour: 8,
    selectedCity: 'All Tamil Nadu',
    currentView: 'command-center',
    overviewData: null,
    comparisonData: null,
    auditData: null,
    dates2026: [],
    dates2027: [],
    defaultDate2026: '',
    defaultDate2027: ''
};

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initModeSwitcher();
    initEventListeners();
    initTransitMap();
    await loadMetadata();
    await refreshOverviewData();
});

// Setup Left Navigation Rail View Switching
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const viewContainers = document.querySelectorAll('.view-container');
    const pageTitle = document.getElementById('current-view-title');
    const pageSubtitle = document.getElementById('current-view-subtitle');

    const viewTitles = {
        'command-center': {
            title: 'Live Transit Command Center',
            subtitle: 'Real-Time Tamil Nadu Transit Telemetry, Predictive Deficits & Optimization'
        },
        'bunching-monitor': {
            title: 'Bus Bunching Early-Warning System',
            subtitle: 'Headway Regularity, Decay Detection & Proactive Dispatch Advisories'
        },
        'demand-capacity': {
            title: 'Historical Analysis vs Future Demand Forecast',
            subtitle: 'Random Forest Regressor (MAE: 4.37, R²: 0.8002) • Network Bottleneck Identification'
        },
        'fleet-reallocation': {
            title: 'Fleet Reallocation Engine (OR-Tools MILP)',
            subtitle: 'Integer Mathematical Programming • Exact Fleet Conservation & Bus Movement Directives'
        },
        'what-if-simulator': {
            title: 'What-If Scenario Stress-Test Simulator',
            subtitle: 'Dynamic Demand Shocks, Fleet Re-configurations & Monsoon Disruption Testing'
        },
        'model-audit': {
            title: 'AI Model Performance & Governance Audit',
            subtitle: 'Chronological Zero-Leakage Validation, Test Residual Distribution, ROC-AUC 0.9550'
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.getAttribute('data-view');
            if (!viewId) return;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            viewContainers.forEach(vc => {
                vc.classList.remove('active');
                if (vc.id === `view-${viewId}`) {
                    vc.classList.add('active');
                }
            });

            STATE.currentView = viewId;

            if (viewTitles[viewId]) {
                pageTitle.innerText = viewTitles[viewId].title;
                pageSubtitle.innerText = viewTitles[viewId].subtitle;
            }

            // Trigger specific view initializations
            if (viewId === 'command-center' && map) {
                setTimeout(() => map.invalidateSize(), 150);
            } else if (viewId === 'bunching-monitor' && STATE.overviewData) {
                renderBunchingCharts(STATE.overviewData.corridors);
                renderBunchingAdvisories(STATE.overviewData.corridors);
            } else if (viewId === 'demand-capacity') {
                loadDemandCapacityView();
            } else if (viewId === 'fleet-reallocation') {
                runSolverOptimization();
            } else if (viewId === 'what-if-simulator') {
                runScenarioSimulation();
            } else if (viewId === 'model-audit') {
                loadModelAudit();
            }
        });
    });

    // Region Tabs Filter
    const regionTabs = document.querySelectorAll('.region-tab');
    regionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            regionTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            STATE.selectedCity = tab.getAttribute('data-city') || 'All Tamil Nadu';
            refreshOverviewData();
            if (STATE.currentView === 'demand-capacity') {
                loadDemandCapacityView();
            }
        });
    });
}

// Mode Switcher: Historical 2026 vs Future Forecast 2027
function initModeSwitcher() {
    const btn2026 = document.getElementById('btn-mode-2026');
    const btn2027 = document.getElementById('btn-mode-2027');

    if (btn2026) {
        btn2026.addEventListener('click', () => {
            if (STATE.mode === 'historical_2026') return;
            STATE.mode = 'historical_2026';
            btn2026.classList.add('active');
            btn2027.classList.remove('active');
            updateProvenanceBanner();
            repopulateDateSelect();
            refreshOverviewData();
            if (STATE.currentView === 'demand-capacity') loadDemandCapacityView();
            if (STATE.currentView === 'fleet-reallocation') runSolverOptimization();
        });
    }

    if (btn2027) {
        btn2027.addEventListener('click', () => {
            if (STATE.mode === 'forecast_2027') return;
            STATE.mode = 'forecast_2027';
            btn2027.classList.add('active');
            btn2026.classList.remove('active');
            updateProvenanceBanner();
            repopulateDateSelect();
            refreshOverviewData();
            if (STATE.currentView === 'demand-capacity') loadDemandCapacityView();
            if (STATE.currentView === 'fleet-reallocation') runSolverOptimization();
        });
    }
}

function updateProvenanceBanner() {
    const banner = document.getElementById('provenance-banner');
    const badge = document.getElementById('prov-badge');
    const pulse = document.getElementById('prov-pulse');
    const title = document.getElementById('prov-status-title');
    const desc = document.getElementById('prov-status-desc');
    const tagBasis = document.getElementById('prov-tag-basis');
    const lblDate = document.getElementById('lbl-date-select');

    if (STATE.mode === 'forecast_2027') {
        if (banner) banner.classList.add('forecast-mode');
        if (badge) {
            badge.innerText = 'AI FORECAST 2027';
            badge.className = 'provenance-badge badge-purple';
        }
        if (pulse) pulse.className = 'pulse-indicator pulse-purple';
        if (title) title.innerText = 'Forecast Year: 2027 | Forecast Basis: Trained Model Using Synthetic 2026 Data';
        if (desc) desc.innerText = 'Simulated Forecast Based on Synthetic 2026 Data • Evaluated via saved RandomForest regressor conditioned on historical baselines.';
        if (tagBasis) tagBasis.innerText = 'Base: 2027 ML Forecast';
        if (lblDate) lblDate.innerText = 'Forecast Date (2027)';
    } else {
        if (banner) banner.classList.remove('forecast-mode');
        if (badge) {
            badge.innerText = 'HISTORICAL ANALYSIS';
            badge.className = 'provenance-badge badge-cyan';
        }
        if (pulse) pulse.className = 'pulse-indicator pulse-cyan';
        if (title) title.innerText = 'Data Source: Synthetic Transport Dataset | Historical Year: 2026';
        if (desc) desc.innerText = 'All observations, scheduled trips, and headways calibrated against synthetic transit records.';
        if (tagBasis) tagBasis.innerText = 'Base: 2026 Synthetic';
        if (lblDate) lblDate.innerText = 'Planning Date (2026)';
    }
}

function repopulateDateSelect() {
    const dateSelect = document.getElementById('date-select');
    if (!dateSelect) return;

    dateSelect.innerHTML = '';
    const dateList = STATE.mode === 'forecast_2027' ? STATE.dates2027 : STATE.dates2026;
    const defaultD = STATE.mode === 'forecast_2027' ? STATE.defaultDate2027 : STATE.defaultDate2026;

    dateList.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.innerText = d;
        if (d === defaultD) opt.selected = true;
        dateSelect.appendChild(opt);
    });

    STATE.selectedDate = defaultD || (dateList.length > 0 ? dateList[0] : '');
}

// Load Metadata from Backend (Dates, Hours)
async function loadMetadata() {
    try {
        const res = await fetch('/api/meta');
        const data = await res.json();

        STATE.dates2026 = data.dates_2026 || data.dates || [];
        STATE.dates2027 = data.dates_2027 || [];
        STATE.defaultDate2026 = data.default_date || (STATE.dates2026[0] || '2026-05-15');
        STATE.defaultDate2027 = data.default_date_2027 || '2027-05-15';

        repopulateDateSelect();

        const hourSelect = document.getElementById('hour-select');
        hourSelect.innerHTML = '';
        data.hours.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.innerText = `${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00`;
            if (h === data.default_hour) opt.selected = true;
            hourSelect.appendChild(opt);
        });
        STATE.selectedHour = data.default_hour || 8;

    } catch (err) {
        console.error('Failed to load metadata:', err);
    }
}

// Refresh Live Overview Telemetry
async function refreshOverviewData() {
    if (!STATE.selectedDate) return;

    try {
        const url = `/api/overview?date=${STATE.selectedDate}&hour=${STATE.selectedHour}&city=${encodeURIComponent(STATE.selectedCity)}&mode=${STATE.mode}`;
        const res = await fetch(url);
        const data = await res.json();
        STATE.overviewData = data;

        // Update Executive KPI Strip
        document.getElementById('val-total-buses').innerText = data.kpis.total_active_buses;
        document.getElementById('sub-total-buses').innerText = `${data.kpis.monitored_corridors} Corridors Active`;

        const demandElem = document.getElementById('val-total-demand');
        demandElem.innerText = data.kpis.total_passenger_demand.toLocaleString();

        document.getElementById('val-total-capacity').innerText = data.kpis.total_seat_capacity.toLocaleString();
        document.getElementById('val-on-time-perf').innerText = `${data.kpis.on_time_performance_pct}%`;

        const alertsElem = document.getElementById('val-bunching-alerts');
        const alertsBadge = document.getElementById('kpi-alerts-badge');
        alertsElem.innerText = data.kpis.high_bunching_alerts;
        if (data.kpis.high_bunching_alerts > 0) {
            alertsBadge.innerText = 'HIGH RISK';
            alertsBadge.className = 'kpi-badge badge-rose';
        } else {
            alertsBadge.innerText = 'STABLE';
            alertsBadge.className = 'kpi-badge badge-emerald';
        }

        // Update nav badge count
        const badgeCount = document.getElementById('bunching-badge-count');
        if (badgeCount) badgeCount.innerText = data.kpis.high_bunching_alerts;

        // Update Map Layers safely
        try {
            if (typeof renderMapCorridors === 'function') {
                renderMapCorridors(data.corridors);
            } else if (typeof updateMapCorridors === 'function') {
                updateMapCorridors(data.corridors);
            }
        } catch (mapErr) {
            console.warn('Map render warning:', mapErr);
        }

        // Update Command Center Stack Charts safely
        try { initMiniRouteOptimizationChart(data.corridors); } catch (e) { console.warn('Mini route opt chart warning:', e); }
        try { initHeadwayVarianceChart(data.corridors); } catch (e) { console.warn('Headway variance chart warning:', e); }
        try { renderAlertsFeed(data.corridors); } catch (e) { console.warn('Alerts feed warning:', e); }
        try { renderWatchlistTable(data.corridors); } catch (e) { console.warn('Watchlist table warning:', e); }

        // Update other views if active
        if (STATE.currentView === 'bunching-monitor') {
            try { renderBunchingCharts(data.corridors); } catch (e) {}
            try { renderBunchingAdvisories(data.corridors); } catch (e) {}
        } else if (STATE.currentView === 'demand-capacity') {
            try { renderDemandVsCapacityChart(data.corridors); } catch (e) {}
            try { renderDemandBottlenecksTable(data.corridors); } catch (e) {}
        }

    } catch (err) {
        console.error('Failed to refresh overview telemetry:', err);
    }
}

// Render Command Center Alerts Feed
function renderAlertsFeed(corridors) {
    const feed = document.getElementById('alerts-feed-list');
    if (!feed) return;
    feed.innerHTML = '';

    const highAlerts = corridors.filter(c => c.risk_level === 'High');
    const mediumAlerts = corridors.filter(c => c.risk_level === 'Medium');

    const totalCountTag = document.getElementById('alerts-count-tag');
    if (totalCountTag) totalCountTag.innerText = `${highAlerts.length} Critical`;

    if (highAlerts.length === 0 && mediumAlerts.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">✅</span>
                <p>All 14 corridors operating within normal headway tolerances. Zero bunching risk detected.</p>
            </div>
        `;
        return;
    }

    highAlerts.forEach(c => {
        const item = document.createElement('div');
        item.className = 'alert-item alert-critical';
        item.innerHTML = `
            <div class="alert-top">
                <span class="alert-route">${c.route_id} (${c.city})</span>
                <span class="alert-time">Immediate</span>
            </div>
            <div class="alert-body">
                <strong>Severe Bunching Risk (${Math.round((c.bunching_probability || 0) * 100)}%):</strong> Headway decayed to ${c.observed_headway}m vs scheduled ${c.scheduled_headway}m. Deficit: ${c.capacity_deficit > 0 ? c.capacity_deficit + ' pax' : '0'}.
            </div>
        `;
        feed.appendChild(item);
    });

    mediumAlerts.slice(0, 3).forEach(c => {
        const item = document.createElement('div');
        item.className = 'alert-item alert-warning';
        item.innerHTML = `
            <div class="alert-top">
                <span class="alert-route">${c.route_id} (${c.city})</span>
                <span class="alert-time">Watchlist</span>
            </div>
            <div class="alert-body">
                <strong>Moderate Variance (${Math.round((c.bunching_probability || 0) * 100)}%):</strong> Observed gap ${c.observed_headway}m vs scheduled ${c.scheduled_headway}m.
            </div>
        `;
        feed.appendChild(item);
    });
}

// Render Command Center Watchlist Table (10 Columns exact match to <th>)
function renderWatchlistTable(corridors) {
    const tbody = document.getElementById('watchlist-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    corridors.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Click to focus corridor on live map';
        tr.addEventListener('click', () => {
            if (window.focusCorridorOnMap) window.focusCorridorOnMap(c.route_id);
        });

        const deficitClass = c.capacity_deficit > 0 ? 'text-rose' : 'text-emerald';
        const riskBadge = c.risk_level === 'High' ? 'badge-rose' : (c.risk_level === 'Medium' ? 'badge-amber' : 'badge-emerald');
        const utilPct = Math.max(0, c.utilization_pct || 0);
        const standeeCap = c.standee_capacity != null ? c.standee_capacity : (15 * (c.allocated_buses || 1));

        tr.innerHTML = `
            <td><span class="route-pill">${c.route_id}</span></td>
            <td><strong>${c.origin}</strong> → ${c.destination}</td>
            <td><span class="badge badge-subtle">${c.city}</span></td>
            <td><strong>${Math.round(c.passenger_demand)}</strong> pax/hr</td>
            <td><strong>${c.allocated_buses}</strong> buses</td>
            <td>${c.total_capacity} <small style="color:#94a3b8;">(${c.seat_capacity}s + ${standeeCap}std)</small></td>
            <td class="${deficitClass}"><strong>${c.capacity_deficit > 0 ? '-' + Math.round(c.capacity_deficit) + ' pax' : '+' + Math.round(Math.abs(c.capacity_deficit)) + ' surplus'}</strong></td>
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem; min-width:85px;">
                    <span>${utilPct.toFixed(1)}%</span>
                    <div style="flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                        <div style="width:${Math.min(100, utilPct)}%; height:100%; background:${utilPct > 90 ? '#ef4444' : (utilPct > 65 ? '#f59e0b' : '#06b6d4')};"></div>
                    </div>
                </div>
            </td>
            <td>${Math.round((c.bunching_probability || 0) * 100)}%</td>
            <td><span class="badge ${riskBadge}">${c.risk_level}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Plain-Language Dispatch Advisories
function renderBunchingAdvisories(corridors) {
    const grid = document.getElementById('bunching-advisories-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const priorityCorridors = corridors.filter(c => c.risk_level === 'High' || c.capacity_deficit > 20);

    if (priorityCorridors.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: #94a3b8;">
                🌟 Network flow is optimal. No headway holding or priority depot injection required at this hour.
            </div>
        `;
        return;
    }

    priorityCorridors.forEach(c => {
        const card = document.createElement('div');
        card.className = 'advisory-card';
        card.innerHTML = `
            <div class="adv-header">
                <span class="adv-route">${c.route_id}: ${c.origin} → ${c.destination}</span>
                <span class="badge ${c.risk_level === 'High' ? 'badge-rose' : 'badge-amber'}">${c.risk_level} Priority</span>
            </div>
            <div class="adv-instruction">
                <strong>Dispatch Action:</strong> ${c.observed_headway < c.scheduled_headway * 0.5 ? 
                    `Instruct trailing vehicle on ${c.route_id} to hold at origin terminal for 4-6 minutes to restore scheduled headway interval.` :
                    `Inject 1 supplementary reserve bus from ${c.city} depot to clear accumulated pax backlog (${Math.round(c.passenger_demand)} pax demand).`}
            </div>
            <div class="adv-metrics">
                <span>Observed Gap: <strong>${c.observed_headway} min</strong> (Target: ${c.scheduled_headway} min)</span>
                <span>Capacity Stress: <strong>${Math.round(c.utilization_pct)}%</strong></span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ==========================================================================
// DEMAND & CAPACITY VIEW (Same unified chart layout for 2026 and 2027)
// ==========================================================================
function loadDemandCapacityView() {
    if (!STATE.overviewData || !STATE.overviewData.corridors) return;
    renderDemandVsCapacityChart(STATE.overviewData.corridors);
    renderDemandBottlenecksTable(STATE.overviewData.corridors);
}

function renderDemandBottlenecksTable(corridors) {
    const tbody = document.getElementById('demand-bottlenecks-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = [...corridors].sort((a, b) => b.capacity_deficit - a.capacity_deficit);
    sorted.forEach(c => {
        const tr = document.createElement('tr');
        const isShortage = c.capacity_deficit > 0;
        tr.innerHTML = `
            <td><span class="route-pill">${c.route_id}</span></td>
            <td><strong>${c.origin}</strong> → ${c.destination} (${c.city})</td>
            <td>${c.corridor_type}</td>
            <td><strong>${Math.round(c.passenger_demand)}</strong> pax/hr</td>
            <td>${c.total_capacity} cap (${c.allocated_buses} buses)</td>
            <td><span class="deficit-tag ${isShortage ? 'tag-red' : 'tag-emerald'}">${isShortage ? '-' + Math.round(c.capacity_deficit) + ' pax deficit' : '+' + Math.round(Math.abs(c.capacity_deficit)) + ' surplus'}</span></td>
            <td><span style="font-weight:700; color:${isShortage ? '#ef4444' : '#10b981'};">${isShortage ? 'Critical Deficit' : 'Balanced'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// SOLVER OPTIMIZATION & CONCRETE BUS SHIFT DIRECTIVES
// ==========================================================================
async function runSolverOptimization() {
    const conserveFleet = document.getElementById('chk-conserve-fleet').checked;
    const fleetAdj = parseInt(document.getElementById('slider-fleet-adj').value) || 0;
    const minService = parseInt(document.getElementById('select-min-service').value) || 2;

    try {
        const res = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: STATE.selectedDate,
                hour: STATE.selectedHour,
                conserve_exact_fleet: conserveFleet,
                fleet_adjustment: fleetAdj,
                min_service_buses: minService,
                mode: STATE.mode,
                year: STATE.mode === 'forecast_2027' ? 2027 : 2026
            })
        });

        const data = await res.json();

        // Update Ribbon
        document.getElementById('sol-fleet-avail').innerText = `${data.summary.total_fleet_available} Buses`;
        document.getElementById('sol-conserved').innerText = data.summary.fleet_conserved ? 'Strictly Enforced' : 'Relaxed';
        document.getElementById('sol-buses-shifted').innerText = `${data.summary.total_buses_shifted} Buses`;
        document.getElementById('sol-deficit-before').innerText = `${data.summary.total_shortage_before} pax`;
        document.getElementById('sol-deficit-after').innerText = `${data.summary.total_shortage_after} pax`;
        document.getElementById('sol-deficit-pct').innerText = `${data.summary.shortage_reduction_pct}% Reduced`;

        // Render Directives Board
        renderDirectivesBoard(data.shift_directives, data.status_message);

        // Render Comparison Bar Chart
        renderAllocationComparisonChart(data.allocations);

        // Draw trajectory arcs on map if corridors are available
        if (STATE.overviewData) {
            const corridorMap = {};
            STATE.overviewData.corridors.forEach(c => corridorMap[c.route_id] = c);
            drawReallocationTrajectories(data.shift_directives, corridorMap);
        }

    } catch (err) {
        console.error('Failed to run optimization:', err);
    }
}

function renderDirectivesBoard(directives, statusMessage) {
    const board = document.getElementById('directives-board');
    if (!board) return;
    board.innerHTML = '';

    const countTag = document.getElementById('badge-total-directives');
    if (countTag) countTag.innerText = `${directives.length} Shifts Proposed`;

    if (directives.length === 0) {
        board.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; background: rgba(15, 23, 42, 0.6); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚖️</div>
                <strong style="color: #e2e8f0;">No Feasible Bus Reallocation Required or Found</strong>
                <p style="font-size: 0.85rem; margin-top: 0.4rem; color: #94a3b8;">
                    ${statusMessage || 'All corridor passenger demands are already within assigned carrying capacity, or transfers between depots are prohibited by intra-cluster distance constraints.'}
                </p>
            </div>
        `;
        return;
    }

    directives.forEach(d => {
        const card = document.createElement('div');
        card.className = 'directive-card';
        card.innerHTML = `
            <div class="dir-header">
                <span class="dir-bus-id">
                    <span>🚌</span> ${d.bus_id}
                </span>
                <span class="dir-cap-badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);margin-right:0.4rem;">📍 ${d.cluster || 'Intra-Depot'}</span>
                <span class="dir-cap-badge">${d.bus_capacity} Pax Capacity</span>
            </div>

            <div class="dir-route-flow">
                <div class="flow-node">
                    <span class="node-label">Reassign From</span>
                    <span class="node-route">${d.source_route}</span>
                    <span class="node-city">${d.source_name}</span>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-node" style="text-align:right;">
                    <span class="node-label">Reassign To</span>
                    <span class="node-route" style="color:#c4b5fd;">${d.target_route}</span>
                    <span class="node-city">${d.target_name}</span>
                </div>
            </div>

            <div class="dir-impact" style="margin-top:0.65rem; font-size:0.78rem; line-height:1.45; color:#cbd5e1;">
                <div><strong>Relocation Distance:</strong> <span style="color:#38bdf8;">${d.relocation_distance || '< 25 km'}</span> • <strong>Relieved:</strong> <span style="color:#34d399;">${d.pax_relieved} pax</span></div>
                <div style="margin-top:0.25rem;"><strong>Shortage Before / After:</strong> ${d.shortage_before} pax ➔ <span style="color:#22d3ee;">${d.shortage_after} pax</span></div>
                <div style="margin-top:0.25rem;"><strong>Constraint Validation:</strong> <span class="badge badge-emerald" style="font-size:0.68rem; padding:1px 6px;">${d.constraint_validation || 'Validated'}</span></div>
                <div style="margin-top:0.35rem; color:#94a3b8;">${d.reason}</div>
            </div>
        `;
        board.appendChild(card);
    });
}

// ==========================================================================
// SCENARIO SIMULATOR
// ==========================================================================
async function runScenarioSimulation() {
    const demandMult = parseFloat(document.getElementById('slider-sim-demand').value) || 1.0;
    const fleetAdj = parseInt(document.getElementById('slider-sim-fleet').value) || 0;
    const disruption = document.getElementById('select-sim-disruption').value;

    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: STATE.selectedDate,
                hour: STATE.selectedHour,
                demand_multiplier: demandMult,
                fleet_adjustment: fleetAdj,
                disruption_level: disruption
            })
        });

        const data = await res.json();

        // Update Metric Cards
        document.getElementById('sim-val-demand').innerText = data.summary.total_simulated_demand.toLocaleString();
        document.getElementById('sim-sub-demand').innerText = `Surge: ${data.parameters.effective_multiplier}x Multiplier`;
        document.getElementById('sim-val-deficit').innerText = `${data.summary.simulated_deficit.toLocaleString()} Pax`;
        document.getElementById('sim-val-stress').innerText = `${data.summary.average_network_stress}x Capacity`;

        // Render Table
        const tbody = document.getElementById('sim-corridors-tbody');
        tbody.innerHTML = '';
        data.corridors.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="route-pill">${c.route_id}</span></td>
                <td><strong>${c.origin}</strong> → ${c.destination} (${c.city})</td>
                <td>${c.base_demand} pax</td>
                <td><strong style="color:#c4b5fd;">${c.simulated_demand}</strong> pax</td>
                <td>${c.capacity} seats</td>
                <td><span class="deficit-tag ${c.shortage > 0 ? 'tag-red' : 'tag-emerald'}">${c.shortage > 0 ? c.shortage + ' pax shortage' : '0 deficit'}</span></td>
                <td><strong style="color:${c.stress_index > 1.2 ? '#ef4444' : (c.stress_index > 1.0 ? '#f59e0b' : '#10b981')};">${c.stress_index}x</strong></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error('Failed to run simulation:', err);
    }
}

// ==========================================================================
// MODEL AUDIT & GOVERNANCE
// ==========================================================================
async function loadModelAudit() {
    try {
        const res = await fetch('/api/model_audit');
        const data = await res.json();
        STATE.auditData = data;

        // Render Feature Importances
        renderAuditFeatureCharts(data);

        // Render Residual Distribution
        if (data.demand_regressor && data.demand_regressor.residual_distribution) {
            renderAuditResidualDistribution(data.demand_regressor.residual_distribution);
        }

        // Render Predicted vs Actual Scatter
        if (data.demand_regressor && data.demand_regressor.test_sample_scatter) {
            renderAuditScatterChart(data.demand_regressor.test_sample_scatter);
        }

    } catch (err) {
        console.error('Failed to load audit data:', err);
    }
}

// Event Listeners for Filters & Sliders
function initEventListeners() {
    const dateSelect = document.getElementById('date-select');
    const hourSelect = document.getElementById('hour-select');

    dateSelect.addEventListener('change', () => {
        STATE.selectedDate = dateSelect.value;
        refreshOverviewData();
    });

    hourSelect.addEventListener('change', () => {
        STATE.selectedHour = parseInt(hourSelect.value);
        refreshOverviewData();
    });

    // Reset map view button
    const btnResetMap = document.getElementById('btn-reset-map');
    if (btnResetMap) {
        btnResetMap.addEventListener('click', () => {
            if (map) map.flyTo([11.1271, 78.6569], 7, { duration: 0.8 });
        });
    }

    // Search filter in watchlist table
    const corridorSearch = document.getElementById('corridor-search');
    if (corridorSearch) {
        corridorSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#watchlist-tbody tr');
            rows.forEach(r => {
                const text = r.innerText.toLowerCase();
                r.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // Solver controls (Live interactive updates)
    const sliderFleetAdj = document.getElementById('slider-fleet-adj');
    if (sliderFleetAdj) {
        sliderFleetAdj.addEventListener('input', () => {
            const val = parseInt(sliderFleetAdj.value);
            document.getElementById('lbl-fleet-adj').innerText = `${val >= 0 ? '+' : ''}${val} Buses`;
            runSolverOptimization();
        });
    }

    const chkConserve = document.getElementById('chk-conserve-fleet');
    if (chkConserve) {
        chkConserve.addEventListener('change', runSolverOptimization);
    }

    const selMinService = document.getElementById('select-min-service');
    if (selMinService) {
        selMinService.addEventListener('change', runSolverOptimization);
    }

    const btnSolve = document.getElementById('btn-solve-milp');
    if (btnSolve) {
        btnSolve.addEventListener('click', runSolverOptimization);
    }

    // Simulator controls
    const simDemand = document.getElementById('slider-sim-demand');
    if (simDemand) {
        simDemand.addEventListener('input', () => {
            document.getElementById('lbl-sim-demand').innerText = `${simDemand.value}x (${simDemand.value > 1.0 ? 'Surge' : 'Normal'})`;
            runScenarioSimulation();
        });
    }

    const simFleet = document.getElementById('slider-sim-fleet');
    if (simFleet) {
        simFleet.addEventListener('input', () => {
            const val = parseInt(simFleet.value);
            document.getElementById('lbl-sim-fleet').innerText = `${val >= 0 ? '+' : ''}${val} Buses`;
            runScenarioSimulation();
        });
    }

    const simDisruption = document.getElementById('select-sim-disruption');
    if (simDisruption) {
        simDisruption.addEventListener('change', runScenarioSimulation);
    }

    const btnRunSim = document.getElementById('btn-run-simulation');
    if (btnRunSim) {
        btnRunSim.addEventListener('click', runScenarioSimulation);
    }
}
