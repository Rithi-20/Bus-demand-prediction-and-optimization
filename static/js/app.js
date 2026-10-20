/**
 * Demand Based Public Transport Planning System — Main Application Controller
 * Handles state, API communication, view switching, and real-time optimization.
 */

const STATE = {
    selectedDate: '',
    selectedHour: 8,
    selectedCity: 'All Tamil Nadu',
    currentView: 'command-center',
    overviewData: null,
    auditData: null
};

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initTransitMap();
    await loadMetadata();
    await refreshOverviewData();
    initEventListeners();
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
            title: 'Passenger Demand & Capacity Forecaster',
            subtitle: 'Random Forest Regressor (R²: 0.8002) • Network Bottleneck Identification'
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
            subtitle: 'Chronological Zero-Leakage Validation, ROC-AUC 0.9550, Feature Importances'
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
            } else if (viewId === 'demand-capacity' && STATE.overviewData) {
                renderDemandVsCapacityChart(STATE.overviewData.corridors);
                renderDemandBottlenecksTable(STATE.overviewData.corridors);
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
        });
    });
}

// Load Metadata from Backend (Dates, Hours)
async function loadMetadata() {
    try {
        const res = await fetch('/api/meta');
        const data = await res.json();

        const dateSelect = document.getElementById('date-select');
        const hourSelect = document.getElementById('hour-select');

        dateSelect.innerHTML = '';
        data.dates.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.innerText = d;
            if (d === data.default_date) opt.selected = true;
            dateSelect.appendChild(opt);
        });
        STATE.selectedDate = data.default_date;

        hourSelect.innerHTML = '';
        data.hours.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.innerText = `${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00`;
            if (h === data.default_hour) opt.selected = true;
            hourSelect.appendChild(opt);
        });
        STATE.selectedHour = data.default_hour;

    } catch (err) {
        console.error('Failed to load metadata:', err);
    }
}

// Refresh Live Overview Telemetry
async function refreshOverviewData() {
    if (!STATE.selectedDate) return;

    try {
        const url = `/api/overview?date=${STATE.selectedDate}&hour=${STATE.selectedHour}&city=${encodeURIComponent(STATE.selectedCity)}`;
        const res = await fetch(url);
        const data = await res.json();
        STATE.overviewData = data;

        // Update 5 KPI Cards
        document.getElementById('val-total-buses').innerText = data.kpis.total_active_buses;
        document.getElementById('val-total-demand').innerText = data.kpis.total_passenger_demand.toLocaleString();
        document.getElementById('val-total-capacity').innerText = data.kpis.total_seat_capacity.toLocaleString();
        document.getElementById('val-on-time-perf').innerText = `${data.kpis.on_time_performance_pct}%`;
        document.getElementById('val-bunching-alerts').innerText = data.kpis.high_bunching_alerts;
        document.getElementById('bunching-badge-count').innerText = data.kpis.high_bunching_alerts;

        const alertCardBadge = document.getElementById('kpi-alerts-badge');
        if (data.kpis.high_bunching_alerts > 0) {
            alertCardBadge.className = 'kpi-badge badge-rose';
            alertCardBadge.innerText = 'CRITICAL';
        } else {
            alertCardBadge.className = 'kpi-badge badge-emerald';
            alertCardBadge.innerText = 'STABLE';
        }

        // Render Leaflet Transit Map
        renderMapCorridors(data.corridors);

        // Update Right Stack Charts
        initMiniRouteOptimizationChart(data.corridors);
        initHeadwayVarianceChart(data.corridors);

        // Populate Alerts Feed
        renderAlertsFeed(data.corridors);

        // Populate Bottom Table
        renderWatchlistTable(data.corridors);

        // If currently on other tabs, refresh them too
        if (STATE.currentView === 'bunching-monitor') {
            renderBunchingCharts(data.corridors);
            renderBunchingAdvisories(data.corridors);
        } else if (STATE.currentView === 'demand-capacity') {
            renderDemandVsCapacityChart(data.corridors);
            renderDemandBottlenecksTable(data.corridors);
        }

    } catch (err) {
        console.error('Failed to refresh overview data:', err);
    }
}

// Render Priority Alerts Feed (Matching Navionyx)
function renderAlertsFeed(corridors) {
    const feed = document.getElementById('alerts-feed-list');
    feed.innerHTML = '';

    const highAlerts = corridors.filter(c => c.risk_level === 'High');
    const medAlerts = corridors.filter(c => c.risk_level === 'Medium');
    const alertItems = [...highAlerts, ...medAlerts].slice(0, 4);

    if (alertItems.length === 0) {
        feed.innerHTML = `
            <div style="font-size:0.8rem; color:#64748b; padding:0.5rem; text-align:center;">
                ✅ All monitored corridors operating within normal headway thresholds.
            </div>
        `;
        return;
    }

    alertItems.forEach(c => {
        const isHigh = c.risk_level === 'High';
        const item = document.createElement('div');
        item.className = `alert-item ${isHigh ? '' : 'alert-amber'}`;
        item.innerHTML = `
            <span class="alert-icon">${isHigh ? '🚨' : '⚠️'}</span>
            <div class="alert-content">
                <div class="alert-title">${c.route_id} • ${c.origin} → ${c.destination}</div>
                <div class="alert-desc">
                    Headway decay detected (${(c.bunching_probability * 100).toFixed(0)}% risk). 
                    ${c.capacity_deficit > 0 ? `Severe passenger deficit (-${Math.round(c.capacity_deficit)} pax).` : 'Regular service frequency affected.'}
                </div>
            </div>
        `;
        feed.appendChild(item);
    });
}

// Render Bottom Watchlist Table
function renderWatchlistTable(corridors) {
    const tbody = document.getElementById('watchlist-tbody');
    tbody.innerHTML = '';

    corridors.forEach(c => {
        const tr = document.createElement('tr');
        const deficitHtml = c.capacity_deficit > 0
            ? `<span class="deficit-tag tag-red">-${Math.round(c.capacity_deficit)} pax</span>`
            : `<span class="deficit-tag tag-emerald">+${Math.round(Math.abs(c.capacity_deficit))} seats</span>`;

        const riskBadge = c.risk_level === 'High'
            ? `<span class="nav-badge alert-badge">HIGH</span>`
            : (c.risk_level === 'Medium' ? `<span class="nav-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">MEDIUM</span>` : `<span class="nav-badge" style="background:rgba(16,185,129,0.2); color:#10b981;">LOW</span>`);

        tr.innerHTML = `
            <td><span class="route-pill">${c.route_id}</span></td>
            <td><strong>${c.origin}</strong> → ${c.destination}</td>
            <td>${c.city}</td>
            <td><strong>${Math.round(c.passenger_demand)}</strong> pax/hr</td>
            <td>${c.allocated_buses} buses</td>
            <td>${c.seat_capacity} seats</td>
            <td>${deficitHtml}</td>
            <td><strong>${c.utilization_pct}%</strong></td>
            <td>${(c.bunching_probability * 100).toFixed(0)}%</td>
            <td>${riskBadge}</td>
        `;

        tr.addEventListener('click', () => {
            if (c.geo && c.geo.waypoints && map) {
                map.flyTo(c.geo.waypoints[0], 11, { duration: 1 });
                updateFloatingInspector(c);
            }
        });

        tbody.appendChild(tr);
    });
}

// Bunching Advisories Grid
function renderBunchingAdvisories(corridors) {
    const grid = document.getElementById('bunching-advisories-grid');
    if (!grid) return;
    grid.innerHTML = '';

    corridors.slice(0, 4).forEach(c => {
        const isHigh = c.risk_level === 'High';
        const card = document.createElement('div');
        card.className = 'directive-card';
        card.innerHTML = `
            <div class="dir-header">
                <span class="dir-bus-id">${c.route_id} (${c.city})</span>
                <span class="nav-badge ${isHigh ? 'alert-badge' : 'pulse-badge'}">${c.risk_level} Priority</span>
            </div>
            <div style="font-size:0.85rem; font-weight:700; color:#ffffff; margin-bottom:0.4rem;">
                ${c.origin} → ${c.destination}
            </div>
            <div class="dir-impact">
                <strong>Operational Advisory:</strong> ${isHigh ? 'Hold preceding vehicle at departure terminal by 3-5 minutes to restore headway gap.' : 'Monitor terminal departures; dispatch gap within permissible tolerance.'}
            </div>
        `;
        grid.appendChild(card);
    });
}

// Demand Bottlenecks Table
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
            <td>${c.seat_capacity} seats (${c.allocated_buses} buses)</td>
            <td><span class="deficit-tag ${isShortage ? 'tag-red' : 'tag-emerald'}">${isShortage ? '-' + Math.round(c.capacity_deficit) + ' pax' : '+' + Math.round(Math.abs(c.capacity_deficit)) + ' seats'}</span></td>
            <td><span style="font-weight:700; color:${isShortage ? '#ef4444' : '#10b981'};">${isShortage ? 'Critical Deficit' : 'Balanced'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// SOLVER OPTIMIZATION & CONCRETE BUS SHIFT DIRECTIVES
// (Directly addressing user requirement)
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
                min_service_buses: minService
            })
        });

        const data = await res.json();

        // Update Ribbon
        document.getElementById('sol-fleet-avail').innerText = `${data.summary.total_fleet_available} Buses`;
        document.getElementById('sol-conserved').innerText = data.summary.fleet_conserved ? 'Strictly Enforced' : 'Relaxed';
        document.getElementById('sol-buses-shifted').innerText = `${data.summary.total_buses_shifted} Buses`;
        document.getElementById('sol-deficit-before').innerText = `${data.summary.total_shortage_before} pax`;
        document.getElementById('sol-deficit-after').innerText = `${data.summary.total_shortage_after} pax`;
        document.getElementById('sol-deficit-pct').innerText = `-${data.summary.shortage_reduction_pct}% Shortage`;

        // Render Directives Board
        renderDirectivesBoard(data.shift_directives);

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

function renderDirectivesBoard(directives) {
    const board = document.getElementById('directives-board');
    board.innerHTML = '';

    const countTag = document.getElementById('badge-total-directives');
    countTag.innerText = `${directives.length} Shifts Proposed`;

    if (directives.length === 0) {
        board.innerHTML = `
            <div style="grid-column: 1 / -1; padding:2rem; text-align:center; background:rgba(15,23,42,0.6); border-radius:10px; color:#94a3b8;">
                ✨ Current fleet allocation perfectly matches demand! No inter-route reallocations required.
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

            <div class="dir-impact">
                <strong>Reallocation Rationale:</strong> ${d.reason}
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
                <td><span class="deficit-tag ${c.shortage > 0 ? 'tag-red' : 'tag-emerald'}">${c.shortage > 0 ? '-' + c.shortage + ' pax' : '0 deficit'}</span></td>
                <td><strong style="color:${c.stress_index > 1.2 ? '#ef4444' : (c.stress_index > 1.0 ? '#f59e0b' : '#10b981')};">${c.stress_index}x</strong></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error('Failed to run simulation:', err);
    }
}

// ==========================================================================
// MODEL AUDIT
// ==========================================================================
async function loadModelAudit() {
    try {
        const res = await fetch('/api/model_audit');
        const data = await res.json();
        STATE.auditData = data;
        renderAuditFeatureCharts(data);
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

    // Quick optimize button in header
    document.getElementById('btn-quick-optimize').addEventListener('click', () => {
        document.getElementById('nav-reallocation').click();
    });

    // Reset map view button
    document.getElementById('btn-reset-map').addEventListener('click', () => {
        if (map) map.flyTo([11.1271, 78.6569], 7, { duration: 0.8 });
    });

    // Search filter in watchlist table
    document.getElementById('corridor-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#watchlist-tbody tr');
        rows.forEach(r => {
            const text = r.innerText.toLowerCase();
            r.style.display = text.includes(query) ? '' : 'none';
        });
    });

    // Solver controls
    const sliderFleetAdj = document.getElementById('slider-fleet-adj');
    sliderFleetAdj.addEventListener('input', () => {
        const val = parseInt(sliderFleetAdj.value);
        document.getElementById('lbl-fleet-adj').innerText = `${val >= 0 ? '+' : ''}${val} Buses`;
    });

    document.getElementById('btn-solve-milp').addEventListener('click', runSolverOptimization);

    // Simulator controls
    const simDemand = document.getElementById('slider-sim-demand');
    simDemand.addEventListener('input', () => {
        document.getElementById('lbl-sim-demand').innerText = `${simDemand.value}x (${simDemand.value > 1.0 ? 'Surge' : 'Normal'})`;
    });

    const simFleet = document.getElementById('slider-sim-fleet');
    simFleet.addEventListener('input', () => {
        const val = parseInt(simFleet.value);
        document.getElementById('lbl-sim-fleet').innerText = `${val >= 0 ? '+' : ''}${val} Buses`;
    });

    document.getElementById('btn-run-simulation').addEventListener('click', runScenarioSimulation);
}
