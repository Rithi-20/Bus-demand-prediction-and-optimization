/**
 * Demand-Based Public Transport Planning System
 * Light-Theme Chart.js Visualizations
 * Palette: White / Soft Slate / Blue Accent (#2563eb) / Subtle Status Indicators
 */

// Global Chart.js Light-Theme Configuration Defaults
if (window.Chart) {
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#64748b'; // Slate 500
    Chart.defaults.borderColor = '#f1f5f9'; // Very light grey grid
}

let bunchingRiskChartInstance = null;
let demandCapacityChartInstance = null;

/**
 * Tab 1: Bus Bunching Risk Profile Chart
 * Visualizes ML-predicted bunching probability per monitored corridor.
 * @param {Array} routeData Array of { route_id, route_name, avg_bunching_prob, is_bunching }
 */
function renderBunchingRiskChart(routeData) {
    const ctx = document.getElementById('chart-bunching-risk');
    if (!ctx) return;

    if (bunchingRiskChartInstance) {
        bunchingRiskChartInstance.destroy();
    }

    if (!routeData || routeData.length === 0) {
        return;
    }

    const labels = routeData.map(r => r.route_id);
    const probs = routeData.map(r => r.avg_bunching_prob);
    const backgroundColors = probs.map(p => p >= 50.0 ? 'rgba(220, 38, 38, 0.85)' : (p >= 35.0 ? 'rgba(234, 88, 12, 0.85)' : 'rgba(249, 115, 22, 0.75)'));
    const borderColors = probs.map(p => p >= 50.0 ? '#dc2626' : (p >= 35.0 ? '#ea580c' : '#f97316'));

    bunchingRiskChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bunching Probability (%)',
                data: probs,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 22
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 8,
                    boxPadding: 4,
                    callbacks: {
                        label: function(context) {
                            const item = routeData[context.dataIndex];
                            return [
                                ` Risk: ${context.parsed.y}%`,
                                ` Route: ${item.route_name || item.route_id}`,
                                ` Status: ${context.parsed.y >= 50.0 ? 'Bunching Alert' : 'Headway Normal'}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { weight: '500' }
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: '#e2e8f0'
                    },
                    ticks: {
                        stepSize: 20,
                        callback: val => val + '%',
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}

/**
 * Tab 2: Passenger Demand vs Fleet Capacity Chart
 * Grouped bar chart comparing predicted next-hour demand with available seat capacity.
 * @param {Array} routes Array of route objects from /api/demand
 */
function renderDemandCapacityChart(routes) {
    const ctx = document.getElementById('chart-demand-capacity');
    if (!ctx) return;

    if (demandCapacityChartInstance) {
        demandCapacityChartInstance.destroy();
    }

    if (!routes || routes.length === 0) {
        return;
    }

    // Limit to top 10 corridors for visual neatness and compactness
    const topRoutes = routes.slice(0, 10);
    const labels = topRoutes.map(r => r.route_id);
    const demandValues = topRoutes.map(r => r.predicted_next_hour_demand);
    const capacityValues = topRoutes.map(r => r.total_capacity);

    demandCapacityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Next-Hour Demand',
                    data: demandValues,
                    backgroundColor: 'rgba(234, 88, 12, 0.85)', // Warm Transit Orange
                    borderColor: '#ea580c',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.8,
                    categoryPercentage: 0.7
                },
                {
                    label: 'Available Seat Capacity',
                    data: capacityValues,
                    backgroundColor: 'rgba(148, 163, 184, 0.45)', // Soft slate grey
                    borderColor: '#94a3b8',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.8,
                    categoryPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        color: '#475569',
                        font: { size: 11, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 8,
                    callbacks: {
                        afterBody: function(contexts) {
                            const idx = contexts[0].dataIndex;
                            const r = topRoutes[idx];
                            if (r.capacity_shortage > 0) {
                                return `Capacity Shortage: ${r.capacity_shortage} passengers (Deficit)`;
                            }
                            return `Capacity Surplus: ${Math.round(r.total_capacity - r.predicted_next_hour_demand)} seats`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { weight: '500' }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#e2e8f0'
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}
