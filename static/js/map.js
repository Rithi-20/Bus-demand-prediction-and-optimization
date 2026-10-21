/**
 * Demand Based Public Transport Planning System — Interactive Leaflet Transit Network Map
 * Uses Dark CartoDB Matter tiles, glowing neon corridor vectors,
 * animated bus markers, and reallocation trajectory overlays.
 */

let map = null;
let routeLayers = [];
let busMarkers = [];
let shiftTrajectoryLayers = [];

function initTransitMap() {
    if (map) return;
    
    const mapContainer = document.getElementById('transit-map');
    if (!mapContainer) return;

    // Centered on Tamil Nadu transit hub (Trichy/Salem central nexus)
    map = L.map('transit-map', {
        center: [11.1271, 78.6569],
        zoom: 7,
        zoomControl: false,
        attributionControl: false
    });

    // Free ESRI Dark Gray Canvas tiles (No API key required)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16
    }).addTo(map);

    // Dark labels & boundaries overlay
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        opacity: 0.7
    }).addTo(map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

let currentCorridors = [];

function renderMapCorridors(corridors) {
    if (!map) initTransitMap();
    if (!map) return;
    currentCorridors = corridors || [];
    routeLayers.forEach(l => map.removeLayer(l));
    busMarkers.forEach(m => map.removeLayer(m));
    routeLayers = [];
    busMarkers = [];

    corridors.forEach(c => {
        const geo = c.geo;
        if (!geo || !geo.waypoints || geo.waypoints.length === 0) return;

        const color = geo.color || '#06b6d4';
        const isHighRisk = c.risk_level === 'High';
        const polylineColor = isHighRisk ? '#ef4444' : color;

        // Glowing outer casing
        const glowLine = L.polyline(geo.waypoints, {
            color: polylineColor,
            weight: isHighRisk ? 8 : 6,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        // Core bright vector line
        const coreLine = L.polyline(geo.waypoints, {
            color: '#ffffff',
            weight: 2.5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        routeLayers.push(glowLine);
        routeLayers.push(coreLine);

        // Click popup
        const popupContent = `
            <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:210px; color:#f8fafc; padding:4px;">
                <div style="font-weight:800; font-size:14px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${c.route_id} (${c.city})</span>
                    <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${isHighRisk ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}; color:${isHighRisk ? '#f87171' : '#10b981'}; font-weight:700;">
                        ${c.risk_level} Risk
                    </span>
                </div>
                <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">${c.origin} → ${c.destination}</div>
                <div style="font-size:11px; line-height:1.6; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px;">
                    <div><strong>Demand:</strong> ${Math.round(c.passenger_demand)} pax/hr</div>
                    <div><strong>Fleet:</strong> ${c.allocated_buses} buses (${c.seat_capacity} seats)</div>
                    <div><strong>Deficit:</strong> <span style="color:${c.capacity_deficit > 0 ? '#ef4444' : '#10b981'}; font-weight:700;">${c.capacity_deficit > 0 ? '-' + Math.round(c.capacity_deficit) + ' pax' : 'Surplus +' + Math.round(Math.abs(c.capacity_deficit))}</span></div>
                    <div><strong>Bunching Prob:</strong> ${(c.bunching_probability * 100).toFixed(0)}%</div>
                </div>
            </div>
        `;

        coreLine.bindPopup(popupContent);
        glowLine.bindPopup(popupContent);

        // On hover update floating inspector
        coreLine.on('mouseover', () => updateFloatingInspector(c));

        // Terminals Pins
        const originPin = L.circleMarker(geo.waypoints[0], {
            radius: 5,
            fillColor: polylineColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).addTo(map);
        routeLayers.push(originPin);

        const destPin = L.circleMarker(geo.waypoints[geo.waypoints.length - 1], {
            radius: 5,
            fillColor: polylineColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).addTo(map);
        routeLayers.push(destPin);

        // Render Active Simulated Buses along route
        if (c.active_bus_markers) {
            c.active_bus_markers.forEach(b => {
                const busIcon = L.divIcon({
                    className: 'custom-bus-marker',
                    html: `
                        <div style="background:${isHighRisk ? '#ef4444' : '#8b5cf6'}; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px ${isHighRisk ? '#ef4444' : '#8b5cf6'}; border:2px solid #ffffff; cursor:pointer;">
                            <span style="font-size:11px; line-height:1;">🚌</span>
                        </div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                const busM = L.marker([b.lat, b.lng], { icon: busIcon }).addTo(map);
                busM.bindPopup(`
                    <div style="font-family:'Plus Jakarta Sans',sans-serif; color:#f8fafc; font-size:12px; padding:3px;">
                        <strong style="color:#c4b5fd;">${b.bus_id}</strong><br>
                        Route: ${c.route_id} (${c.origin} → ${c.destination})<br>
                        Capacity: <strong>${b.capacity} passengers</strong><br>
                        Estimated Load: <strong>${b.load_estimate} / ${b.capacity}</strong>
                    </div>
                `);
                busMarkers.push(busM);
            });
        }
    });
}

function updateFloatingInspector(corridor) {
    const insp = document.getElementById('floating-inspector');
    if (!insp) return;

    document.getElementById('inspector-route-id').innerText = corridor.route_id;
    const riskElem = document.getElementById('inspector-risk');
    riskElem.innerText = `${corridor.risk_level} Risk`;
    riskElem.style.background = corridor.risk_level === 'High' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)';
    riskElem.style.color = corridor.risk_level === 'High' ? '#f87171' : '#10b981';

    document.getElementById('inspector-name').innerText = `${corridor.origin} → ${corridor.destination}`;
    document.getElementById('inspector-demand').innerText = `${Math.round(corridor.passenger_demand)} / ${corridor.seat_capacity} pax`;
    
    const defElem = document.getElementById('inspector-deficit');
    if (corridor.capacity_deficit > 0) {
        defElem.innerText = `-${Math.round(corridor.capacity_deficit)} pax/hr (Deficit)`;
        defElem.style.color = '#f87171';
    } else {
        defElem.innerText = `+${Math.round(Math.abs(corridor.capacity_deficit))} seats (Surplus)`;
        defElem.style.color = '#10b981';
    }
}

function drawReallocationTrajectories(shiftDirectives, corridorsMap) {
    if (!map) return;
    
    // Clear old shift lines
    shiftTrajectoryLayers.forEach(l => map.removeLayer(l));
    shiftTrajectoryLayers = [];

    shiftDirectives.forEach(dir => {
        const srcCorridor = corridorsMap[dir.source_route];
        const dstCorridor = corridorsMap[dir.target_route];

        if (srcCorridor && dstCorridor && srcCorridor.geo && dstCorridor.geo) {
            const p1 = srcCorridor.geo.waypoints[0];
            const p2 = dstCorridor.geo.waypoints[0];

            // Curved quadratic bezier arc
            const midLat = (p1[0] + p2[0]) / 2 + 0.35;
            const midLng = (p1[1] + p2[1]) / 2 + 0.35;

            const arcPoints = [p1, [midLat, midLng], p2];

            const shiftLine = L.polyline(arcPoints, {
                color: '#c4b5fd',
                weight: 3.5,
                dashArray: '6, 8',
                opacity: 0.85
            }).addTo(map);

            shiftLine.bindPopup(`
                <div style="font-family:'Plus Jakarta Sans',sans-serif; color:#f8fafc; font-size:12px; padding:4px;">
                    <strong style="color:#8b5cf6;">Fleet Reallocation Shift</strong><br>
                    <strong>${dir.bus_id}</strong> (${dir.bus_capacity} Cap)<br>
                    ${dir.source_route} ➡️ ${dir.target_route}<br>
                    Relieves: <strong>+${dir.pax_relieved} pax deficit</strong>
                </div>
            `);

            shiftTrajectoryLayers.push(shiftLine);
        }
    });
}

function focusCorridorOnMap(routeId) {
    if (!map || !currentCorridors) return;
    const corridor = currentCorridors.find(c => c.route_id === routeId);
    if (!corridor || !corridor.geo || !corridor.geo.waypoints || corridor.geo.waypoints.length === 0) return;

    const waypoints = corridor.geo.waypoints;
    const midIdx = Math.floor(waypoints.length / 2);
    const center = waypoints[midIdx];
    map.flyTo(center, 11, { duration: 0.8 });
    updateFloatingInspector(corridor);
}

// Window global exports
window.initTransitMap = initTransitMap;
window.renderMapCorridors = renderMapCorridors;
window.updateMapCorridors = renderMapCorridors;
window.drawReallocationTrajectories = drawReallocationTrajectories;
window.focusCorridorOnMap = focusCorridorOnMap;
window.updateFloatingInspector = updateFloatingInspector;
