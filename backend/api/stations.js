/**
 * API endpoints לשאילת תחנות ומחוזות
 */

const express = require('express');
const StationManager = require('../../stationManager');
const router = express.Router();

// יצירת אינסטנס וטעינה רק פעם אחת
const manager = new StationManager();
let loadingPromise = null;
async function ensureLoaded() {
    if (manager.loaded) return;
    if (!loadingPromise) {
        loadingPromise = manager.load().catch(err => { loadingPromise = null; throw err; });
    }
    await loadingPromise;
}

/**
 * GET /api/stations
 * מחזיר רשימת מחוזות וכל התחנות שלהם
 */
router.get('/', async (req, res) => {
    try {
        await ensureLoaded();
        // סדר רצוי של מחוזות כפי שביקשת (עדיפות תצוגה)
        const preferredOrder = ['דרום','דן','מרכז','יו"ש','ירושלים','חוף','צפון'];

        // use precomputed `districtNormalized` from StationManager when available
        const stations = manager.getAllStations().map(s => {
            const dn = (s.districtNormalized || s.districts || s.serverDistrict || '').toString().trim();
            // if dn is a composite string, try to extract preferred order
            let chosen = dn;
            for (const p of preferredOrder) {
                if (dn.includes(p)) { chosen = p; break; }
            }
            if (!chosen) chosen = 'לא ידוע';
            // map single-letter server codes to readable names when encountered
            const codeMap = { A: 'מרכז (A)', B: 'ירושלים (B)', C: 'אזור דרום/חוף (C)' };
            if (/^[ABC]$/.test(chosen)) {
                chosen = codeMap[chosen] || chosen;
            }
            return { ...s, districtNormalized: chosen };
        });

        // קבוצת תחנות לפי districtNormalized
        const grouped = {};
        stations.forEach(s => {
            const key = s.districtNormalized || 'לא ידוע';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
        });

        // הכנת מיון לפי preferredOrder ולאחר מכן שאר השמות מסודרים אלפביתית
        const data = [];
        preferredOrder.forEach(name => {
            if (grouped[name]) {
                data.push({ name, stations: grouped[name] });
                delete grouped[name];
            }
        });
        // שאר הקבוצות
        Object.keys(grouped).sort().forEach(name => data.push({ name, stations: grouped[name] }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/stations/search?city=...
 * מחפש תחנות לפי שם עיר/פוליגון
 */
router.get('/search', async (req, res) => {
    try {
        const q = req.query.city || req.query.q || '';
        if (!q) return res.status(400).json({ success: false, error: 'נדרש פרמטר city' });
        await ensureLoaded();
        // stronger matching strategy:
        // 1) try exact polygon key (case-insensitive)
        // 2) try token / exact matching via findStationsByCityExact
        let stations = [];
        const qNorm = q.toString().trim();

        // 1) exact polygon lookup (case-insensitive)
        const polyIndex = manager.polygonIndex || {};
        for (const polyKey of Object.keys(polyIndex)) {
            if (polyKey && polyKey.toString().toLowerCase().trim() === qNorm.toLowerCase()) {
                stations = polyIndex[polyKey] || [];
                break;
            }
        }

        // 1b) try normalized token match on polygon keys (match whole token)
        if (!stations.length) {
            const tokens = qNorm.toLowerCase().split(/[\W_]+/).filter(Boolean);
            for (const polyKey of Object.keys(polyIndex)) {
                const pk = (polyKey || '').toString().toLowerCase();
                const pkTokens = pk.split(/[^\p{L}0-9]+/u).filter(Boolean);
                if (tokens.some(t => pkTokens.includes(t))) {
                    stations.push(...polyIndex[polyKey]);
                }
            }
        }

        // 2) fallback to precise search method on StationManager
        if (!stations.length) {
            if (typeof manager.findStationsByCityExact === 'function') {
                stations = manager.findStationsByCityExact(qNorm);
            } else {
                stations = manager.findStationsByCity(qNorm);
            }
        }
        res.json({ success: true, data: stations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = function createStationsRouter() { return router; };
