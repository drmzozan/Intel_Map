/* worker.js */
importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');

self.onmessage = function (e) {
    const {
        cities,
        strategicFeatures,
        globalSyriaGeoJSON,
        colorMapping,
        LOCAL_FACTIONS,
        expeditionaryFactions
    } = e.data;

    if (!globalSyriaGeoJSON) {
        self.postMessage({ error: "No Global GeoJSON" });
        return;
    }

    try {
        // 0. Calculate counts first (needed to filter strategic assets)
        const counts = {};
        cities.forEach(c => { if (c.owner) counts[c.owner] = (counts[c.owner] || 0) + 1; });

        // 1. Collect points (Settlements)
        let allPoints = cities
            .filter(c => c.type !== 'Port' && c.owner !== 'Unknown')
            .filter(c => !expeditionaryFactions.includes(c.owner))
            .map(c => turf.point([c.lng, c.lat], { owner: c.owner }));

        // 2. Strategic Assets (Now Included by User Request)
        // Condition: Owner must be local (not expeditionary) AND (have settlements OR be in LOCAL_FACTIONS whitelist)
        // This fixes Israel bases not showing borders because they have 0 settlements.
        if (strategicFeatures) {
            strategicFeatures.forEach(f => {
                const owner = f.properties.owner;
                if (f.geometry && owner && owner !== "Unknown") {
                    if (!expeditionaryFactions.includes(owner) &&
                        (counts[owner] > 0 || LOCAL_FACTIONS.includes(owner))) {
                        allPoints.push(turf.point(f.geometry.coordinates, { owner: owner }));
                    }
                }
            });
        }

        const points = turf.featureCollection(allPoints);
        const bbox = [35.0, 32.0, 43.0, 38.0];
        const voronoiPolygons = turf.voronoi(points, { bbox: bbox });

        const groups = {};


        voronoiPolygons.features.forEach(poly => {
            const centerPoint = points.features.find(pt => turf.booleanPointInPolygon(pt, poly));
            if (centerPoint) {
                const owner = centerPoint.properties.owner;
                if (!groups[owner]) groups[owner] = [];
                groups[owner].push(poly);
            }
        });

        // Determine largest faction
        let largestOwner = null;
        let maxCount = -1;
        LOCAL_FACTIONS.forEach(f => {
            if ((counts[f] || 0) > maxCount) {
                maxCount = counts[f];
                largestOwner = f;
            }
        });

        let finalFeatures = [];
        const syriaPolygon = globalSyriaGeoJSON.features ? globalSyriaGeoJSON.features[0] : globalSyriaGeoJSON;
        let remainingArea = JSON.parse(JSON.stringify(syriaPolygon));

        // Process others
        const otherLocals = LOCAL_FACTIONS.filter(f => f !== largestOwner && groups[f]);
        otherLocals.sort((a, b) => (counts[a] || 0) - (counts[b] || 0));

        otherLocals.forEach(owner => {
            const polys = groups[owner];
            if (!polys || polys.length === 0) return;

            let merged = polys[0];
            for (let i = 1; i < polys.length; i++) {
                try { const u = turf.union(merged, polys[i]); if (u) merged = u; } catch (e) { }
            }
            try {
                merged = turf.cleanCoords(merged);
                // Optimized settings: steps reduced to 8 for performance, tolerance increased slightly
                merged = turf.simplify(merged, { tolerance: 0.002, highQuality: false });

                // Buffer Optimization: Reduced steps to 8 (was 32)
                const smoothed = turf.buffer(turf.buffer(merged, 0.2, { units: 'kilometers', steps: 8 }), -0.5, { units: 'kilometers', steps: 8 });

                let intersect = turf.intersect(smoothed || merged, remainingArea);
                if (intersect) {
                    intersect.properties = { owner: owner, color: colorMapping[owner] };
                    finalFeatures.push(intersect);
                    try {
                        const diff = turf.difference(remainingArea, intersect);
                        if (diff) remainingArea = diff;
                    } catch (e) { }
                }
            } catch (e) { }
        });

        if (remainingArea && largestOwner) {
            remainingArea.properties = { owner: largestOwner, color: colorMapping[largestOwner] };
            finalFeatures.push(remainingArea);
        }

        self.postMessage({
            type: 'FeatureCollection',
            features: finalFeatures
        });

    } catch (e) {
        self.postMessage({ error: e.message });
    }
};
