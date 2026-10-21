/**
 * Demand Based Public Transport Planning System — Interactive Chart.js Initializers and Updaters
 */

Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';

let chartRouteOpt = null;
let chartHeadways = null;
let chartBunchingHeadways = null;
let chartBunchingProbs = null;
let chartDemandCapacity = null;
let chartAllocCompare = null;
let chartAuditBunching = null;
let chartAuditDemand = null;

function initMiniRouteOptimizationChart(corridors) {
    const ctx = document.getElementById('chart-route-optimization');
    if (!ctx) return;
    
    // Sort or pick top 8 corridors for curve
    const labels = corridors.slice(0, 8).map(c => c.route_id);
    const demandData = corridors.slice(0, 8).map(c => c.passenger_demand);
    const capacityData = corridors.slice(0, 8).map(c => c.seat_capacity);

    if (chartRouteOpt) chartRouteOpt.destroy();

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 120);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    chartRouteOpt = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Demand',
                    data: demandData,
                    borderColor: '#06b6d4',
                    borderWidth: 2.2,
                    tension: 0.45,
                    fill: true,
                    backgroundColor: gradient,
                    pointRadius: 2,
                    pointHoverRadius: 5
                },
                {
                    label: 'Allocated Capacity',
                    data: capacityData,
                    borderColor: '#8b5cf6',
                    borderWidth: 1.8,
                    borderDash: [4, 4],
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { font: { size: 9 } } }
            }
        }
    });
}

function initHeadwayVarianceChart(corridors) {
    const ctx = document.getElementById('chart-headway-distribution');
    if (!ctx) return;

    const labels = corridors.slice(0, 8).map(c => c.route_id);
    const probabilities = corridors.slice(0, 8).map(c => Math.round(c.bunching_probability * 100));

    if (chartHeadways) chartHeadways.destroy();

    chartHeadways = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bunching Risk %',
                data: probabilities,
                backgroundColor: probabilities.map(p => p > 65 ? '#ef4444' : (p > 35 ? '#f59e0b' : '#14b8a6')),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)'
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { max: 100, ticks: { font: { size: 9 }, callback: v => v + '%' } }
            }
        }
    });
}

function renderBunchingCharts(corridors) {
    // 1. Scheduled vs Actual Headways (Clean, consistent 2-color comparative visualization)
    const ctxH = document.getElementById('chart-bunching-headways');
    if (ctxH) {
        if (chartBunchingHeadways) chartBunchingHeadways.destroy();
        const labels = corridors.map(c => `${c.route_id} (${c.city})`);
        const scheduled = corridors.map(c => c.scheduled_headway || 15);
        const actual = corridors.map(c => c.observed_headway || 15);

        chartBunchingHeadways = new Chart(ctxH, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Scheduled Headway (min)',
                        data: scheduled,
                        backgroundColor: 'rgba(99, 102, 241, 0.55)',
                        borderColor: '#6366f1',
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: 'Observed Gap (min)',
                        data: actual,
                        backgroundColor: 'rgba(56, 189, 248, 0.75)',
                        borderColor: '#38bdf8',
                        borderWidth: 1.5,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#ffffff', font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" } } },
                    tooltip: {
                        callbacks: {
                            afterBody: function(context) {
                                const idx = context[0].dataIndex;
                                const diff = actual[idx] - scheduled[idx];
                                if (diff < -5) return `⚠️ Bunched: Running ${Math.abs(diff).toFixed(1)} mins too close`;
                                if (diff > 5) return `⏱️ Delayed: ${diff.toFixed(1)} min extra wait gap`;
                                return `✅ Normal: On schedule`;
                            }
                        }
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Minutes Between Buses' } }
                }
            }
        });
    }

    // 2. Bunching Probabilities
    const ctxP = document.getElementById('chart-bunching-probabilities');
    if (ctxP) {
        if (chartBunchingProbs) chartBunchingProbs.destroy();
        const sorted = [...corridors].sort((a, b) => b.bunching_probability - a.bunching_probability);
        chartBunchingProbs = new Chart(ctxP, {
            type: 'bar',
            data: {
                labels: sorted.map(c => `${c.route_id} (${c.city})`),
                datasets: [{
                    label: 'Probability of Bus Bunching',
                    data: sorted.map(c => Math.round(c.bunching_probability * 100)),
                    backgroundColor: sorted.map(c => c.risk_level === 'High' ? '#f43f5e' : (c.risk_level === 'Medium' ? '#f59e0b' : '#10b981')),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { max: 100, ticks: { callback: v => v + '%' } }
                }
            }
        });
    }
}

function renderDemandVsCapacityChart(corridors) {
    const ctx = document.getElementById('chart-demand-vs-capacity');
    if (!ctx) return;
    if (chartDemandCapacity) chartDemandCapacity.destroy();

    const labels = corridors.map(c => `${c.route_id} (${c.city})`);
    const demand = corridors.map(c => c.passenger_demand);
    const capacity = corridors.map(c => c.seat_capacity);

    chartDemandCapacity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Forecast Passenger Demand (Pax/hr)',
                    data: demand,
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Current Seat Capacity (Pax/hr)',
                    data: capacity,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#ffffff' } },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const idx = context[0].dataIndex;
                            const diff = demand[idx] - capacity[idx];
                            return diff > 0 ? `Deficit: -${Math.round(diff)} pax/hr (Overcrowded)` : `Surplus: +${Math.round(Math.abs(diff))} seats`;
                        }
                    }
                }
            },
            scales: {
                y: { title: { display: true, text: 'Passengers / Hour' } }
            }
        }
    });
}

function renderAllocationComparisonChart(allocations) {
    const ctx = document.getElementById('chart-allocation-comparison');
    if (!ctx) return;
    if (chartAllocCompare) chartAllocCompare.destroy();

    const labels = allocations.map(a => `${a.route_id} (${a.city})`);
    const current = allocations.map(a => a.current_buses);
    const optimized = allocations.map(a => a.optimized_buses);

    chartAllocCompare = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Current Fleet (Buses)',
                    data: current,
                    backgroundColor: 'rgba(148, 163, 184, 0.6)',
                    borderRadius: 4
                },
                {
                    label: 'Optimized Allocation (MILP)',
                    data: optimized,
                    backgroundColor: 'rgba(139, 92, 246, 0.85)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#ffffff' } }
            },
            scales: {
                y: { title: { display: true, text: 'Active Buses Allocated' }, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderAuditFeatureCharts(auditData) {
    // 1. Classifier Features
    const ctxB = document.getElementById('chart-audit-bunching-features');
    if (ctxB && auditData.bunching_classifier) {
        if (chartAuditBunching) chartAuditBunching.destroy();
        const feat = auditData.bunching_classifier.feature_importance;
        chartAuditBunching = new Chart(ctxB, {
            type: 'bar',
            data: {
                labels: feat.map(f => f.feature.replace(/_/g, ' ')),
                datasets: [{
                    label: 'Feature Importance',
                    data: feat.map(f => f.importance),
                    backgroundColor: '#10b981',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    y: { ticks: { font: { size: 9 } } }
                }
            }
        });
    }

    // 2. Regressor Features
    const ctxD = document.getElementById('chart-audit-demand-features');
    if (ctxD && auditData.demand_regressor) {
        if (chartAuditDemand) chartAuditDemand.destroy();
        const feat = auditData.demand_regressor.feature_importance;
        chartAuditDemand = new Chart(ctxD, {
            type: 'bar',
            data: {
                labels: feat.map(f => f.feature.replace(/_/g, ' ')),
                datasets: [{
                    label: 'Feature Importance',
                    data: feat.map(f => f.importance),
                    backgroundColor: '#06b6d4',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    y: { ticks: { font: { size: 9 } } }
                }
            }
        });
    }
}

let chartMonthlyComparison = null;
let chartAuditResiduals = null;
let chartAuditScatter = null;

// Monthly Trend Comparison Line Chart (Jan - Dec)
function initMonthlyComparisonChart(labels, historical2026, forecast2027) {
    const ctx = document.getElementById('chart-monthly-comparison');
    if (!ctx) return;

    if (chartMonthlyComparison) chartMonthlyComparison.destroy();

    const grad2026 = ctx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    grad2026.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    grad2026.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    const grad2027 = ctx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    grad2027.addColorStop(0, 'rgba(168, 85, 247, 0.35)');
    grad2027.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

    chartMonthlyComparison = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical 2026 (Observed Synthetic)',
                    data: historical2026,
                    borderColor: '#38bdf8',
                    backgroundColor: grad2026,
                    borderWidth: 2.2,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#38bdf8',
                    pointRadius: 3,
                    pointHoverRadius: 6
                },
                {
                    label: 'Forecast 2027 (Trained RF Model)',
                    data: forecast2027,
                    borderColor: '#a855f7',
                    backgroundColor: grad2027,
                    borderWidth: 2.5,
                    borderDash: [5, 4],
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#a855f7',
                    pointRadius: 4,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e2e8f0', boxWidth: 14, font: { size: 11, weight: 600 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(ctx) {
                            return `${ctx.dataset.label}: ${ctx.parsed.y} pax/hr (avg)`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { font: { size: 11 } } },
                y: {
                    title: { display: true, text: 'Passenger Demand (pax/hr)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

// Route-by-Hour Heatmap Matrix Renderer
function renderRouteHourHeatmap(containerId, heatmapData) {
    const container = document.getElementById(containerId);
    if (!container || !heatmapData || !heatmapData.routes) return;

    const hours = heatmapData.operating_hours || [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const routes = heatmapData.routes;

    // Find min and max for color scaling
    let minVal = Infinity;
    let maxVal = -Infinity;
    routes.forEach(r => {
        r.hourly_values.forEach(h => {
            if (h.demand < minVal) minVal = h.demand;
            if (h.demand > maxVal) maxVal = h.demand;
        });
    });
    if (minVal === maxVal) maxVal = minVal + 1;

    function getCellColor(val) {
        const ratio = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
        if (ratio < 0.25) {
            return `rgba(30, 41, 59, 0.85)`; // Deep dark slate
        } else if (ratio < 0.50) {
            return `rgba(6, 182, 212, ${0.35 + ratio * 0.4})`; // Cyan glow
        } else if (ratio < 0.75) {
            return `rgba(139, 92, 246, ${0.45 + ratio * 0.4})`; // Purple glow
        } else {
            return `rgba(244, 63, 94, ${0.55 + ratio * 0.45})`; // High peak coral/rose
        }
    }

    let html = `<table class="heatmap-table">
        <thead>
            <tr>
                <th style="text-align: left; padding-left: 8px;">Route</th>`;
    hours.forEach(h => {
        html += `<th>${h}:00</th>`;
    });
    html += `</tr></thead><tbody>`;

    routes.forEach(r => {
        html += `<tr><td class="heatmap-route-name">${r.route_id}</td>`;
        r.hourly_values.forEach(hv => {
            const color = getCellColor(hv.demand);
            html += `<td class="heatmap-cell" style="background-color: ${color};" title="${r.route_id} at ${hv.hour}:00 — Demand: ${hv.demand} pax/hr">${Math.round(hv.demand)}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Prediction Error / Residual Distribution Histogram
function renderAuditResidualDistribution(residualData) {
    const ctx = document.getElementById('chart-audit-residual-dist');
    if (!ctx || !residualData) return;

    if (chartAuditResiduals) chartAuditResiduals.destroy();

    const bins = residualData.bins || [];
    const counts = residualData.counts || [];

    chartAuditResiduals = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins,
            datasets: [{
                label: 'Residual Error Frequency (Test Set)',
                data: counts,
                backgroundColor: bins.map(b => (b.includes('-6 to 1') || b.includes('1 to 9')) ? 'rgba(16, 185, 129, 0.85)' : 'rgba(56, 189, 248, 0.65)'),
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    callbacks: {
                        label: ctx => `Samples: ${ctx.parsed.y} rows (Error Range: ${ctx.label} pax)`
                    }
                }
            },
            scales: {
                x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
                y: {
                    title: { display: true, text: 'Test Samples', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

// Predicted vs Actual Values Scatter Chart
function renderAuditScatterChart(scatterPoints) {
    const ctx = document.getElementById('chart-audit-scatter');
    if (!ctx || !scatterPoints) return;

    if (chartAuditScatter) chartAuditScatter.destroy();

    const data = scatterPoints.map(p => ({ x: p.actual, y: p.predicted }));
    const maxVal = Math.max(...data.map(d => Math.max(d.x, d.y)), 100);

    chartAuditScatter = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Held-out Test Samples',
                    data: data,
                    backgroundColor: 'rgba(168, 85, 247, 0.8)',
                    borderColor: '#a855f7',
                    borderWidth: 1,
                    pointRadius: 4.5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Ideal 45° Fit Line (Predicted = Actual)',
                    data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }],
                    type: 'line',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    borderDash: [6, 6],
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e2e8f0', boxWidth: 12, font: { size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    callbacks: {
                        label: ctx => `Actual: ${ctx.parsed.x} pax/hr | Predicted: ${ctx.parsed.y} pax/hr`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Actual Ground-Truth Demand (pax/hr)', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    title: { display: true, text: 'ML Predicted Demand (pax/hr)', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

