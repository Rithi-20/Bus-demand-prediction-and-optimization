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
