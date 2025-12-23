/**
 * מודול ניהול תחנות כבאות
 * קורא את קובץ האקסל ומנהל את בסיס הנתונים של התחנות
 */

const ExcelJS = require('exceljs');
const path = require('path');

class StationManager {
    constructor(excelFilePath) {
        this.excelFilePath = excelFilePath || path.join(__dirname, 'עותק של רשימת תחנות - אזורי פקע\'\'ר - מעודכן.xlsx');
        this.stations = []; // רשימת כל התחנות
        this.polygonIndex = {}; // אינדקס מהיר לפי פוליגון
        this.loaded = false;
    }

    /**
     * טעינת נתוני התחנות מקובץ האקסל
     */
    async load() {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(this.excelFilePath);
            
            // נסיון ראשון: קריאת גליון בשם 'D.B' או הגליון השני כפי שהיה עד כה
            let worksheet = workbook.getWorksheet('D.B') || workbook.getWorksheet(2);

            // בנוסף: נסיון לקרוא את גליון 'רשימת תחנות' (כדי לקבל חלוקה לפי מחוזות כפי שביקשת)
            const listSheet = workbook.getWorksheet('רשימת תחנות') || workbook.getWorksheet('רשימת תחנות ');
            const mappingByApiCode = {};
            const mappingByPolygon = {};

            // helper to normalize polygon keys for robust matching
            const normalizeKey = (s) => {
                if (!s) return '';
                return s.toString().toLowerCase().replace(/[\u0590-\u05FF\uFB1D-\uFB4F]/g, ch => ch).replace(/[^\p{L}0-9]+/gu, ' ').trim();
            };
            if (listSheet) {
                // נניח שיש כותרות בשורה הראשונה - ננתח כדי למצוא עמודות רלוונטיות
                const headerRow = listSheet.getRow(1);
                const headers = {};
                for (let c = 1; c <= headerRow.cellCount; c++) {
                    const txt = (headerRow.getCell(c).value || '').toString().trim();
                    if (!txt) continue;
                    // keep first occurrence of a header name (avoid duplicate 'מחוז' overwriting)
                    if (!headers[txt]) headers[txt] = c;
                }

                // נסה למצוא עמודות עם שמות מוכרים
                const apiCol = headers['קוד'] || headers['קוד API'] || headers['API'] || headers['מס\'ד'] || headers['מס"ד'] || 2;
                const districtCol = headers['מחוז'] || headers['מחוזות'] || headers['אזור'] || headers['district'] || 3;

                for (let r = 2; r <= listSheet.rowCount; r++) {
                    const row = listSheet.getRow(r);
                    const apiVal = (row.getCell(apiCol).value || '').toString().trim();
                    const districtVal = (row.getCell(districtCol).value || '').toString().trim();
                    const polygonVal = (row.getCell(headers['פוליגון פיקוד העורף'] || 7).value || '').toString().trim();
                    if (apiVal) {
                        mappingByApiCode[apiVal.replace(/^0+/, '')] = districtVal;
                    }
                    if (polygonVal) {
                        mappingByPolygon[normalizeKey(polygonVal)] = districtVal;
                    }
                }
            }
            
            if (!worksheet) {
                throw new Error('לא נמצא גליון D.B בקובץ האקסל');
            }

            this.stations = [];
            this.polygonIndex = {};

            // קריאת כל השורות (מדלג על שורת הכותרות)
            for (let i = 2; i <= worksheet.rowCount; i++) {
                const row = worksheet.getRow(i);
                
                // קריאת העמודות לפי גליון D.B:
                // A - מס"ד
                // B - פוליגון פיקוד העורף (זה מה שחשוב לחיפוש!)
                // C - שם תחנה
                // D - מחוז שרת (A/B/C) לשרת TELNET
                // E - קוד API (מספר התחנה)
                // G - רכזת (A/B/C)
                // H - כתובת IP
                // I - מחוזות
                
                const serial = String(row.getCell(1).value || '').trim(); // A - מס"ד
                const polygon = String(row.getCell(2).value || '').trim(); // B - פוליגון פיקוד העורף
                const stationName = String(row.getCell(3).value || '').trim(); // C - שם תחנה
                const serverDistrict = String(row.getCell(4).value || '').trim(); // D - מחוז שרת (A/B/C)
                const apiCode = String(row.getCell(5).value || '').trim(); // E - קוד API
                const address = String(row.getCell(8).value || '').trim(); // H - כתובת IP (אופציונלי)
                const districts = String(row.getCell(9).value || '').trim(); // I - מחוזות

                // אם קיים מיפוי מהגליון הראשי, השתמש בו (מעדיף ערכי מחוז כפי בגליון 'רשימת תחנות')
                const apiKey = apiCode.replace(/^0+/, '');
                const mappedByApi = mappingByApiCode[apiKey] || mappingByApiCode[apiCode];
                const mappedByPolygon = mappingByPolygon[normalizeKey(polygon)];
                const finalDistricts = mappedByPolygon || mappedByApi || districts;

                // דילוג על שורות ריקות
                if (!serial || !stationName || !polygon || !apiCode || !serverDistrict) {
                    continue;
                }

                const station = {
                    serial,
                    polygon,
                    stationName,
                    serverDistrict: serverDistrict.toUpperCase(), // A/B/C
                    apiCode: apiCode.padStart(3, '0'), // וידוא שהקוד הוא 3 ספרות (121, 129 וכו')
                    address,
                    districts: finalDistricts,
                    // normalized human-readable district name (prefer mapping from רשימת תחנות)
                    districtNormalized: (() => {
                        const raw = (finalDistricts || '').toString().trim();
                        if (raw && raw.length > 0 && raw !== 'A' && raw !== 'B' && raw !== 'C') return raw;
                        // try server district codes fallback
                        const code = (serverDistrict || '').toString().trim().toUpperCase();
                        const fallback = { A: 'מרכז', B: 'ירושלים', C: 'דרום' };
                        return fallback[code] || raw || 'לא ידוע';
                    })()
                };

                this.stations.push(station);

                // בניית אינדקס לפי פוליגון (מאפשר כמה תחנות לאותו פוליגון)
                if (!this.polygonIndex[polygon]) {
                    this.polygonIndex[polygon] = [];
                }
                this.polygonIndex[polygon].push(station);
            }

            this.loaded = true;
            console.log(`✅ נטענו ${this.stations.length} תחנות מהקובץ`);
            console.log(`📊 נמצאו ${Object.keys(this.polygonIndex).length} פוליגונים ייחודיים`);

            return this.stations.length;
        } catch (error) {
            console.error('❌ שגיאה בטעינת קובץ התחנות:', error.message);
            throw error;
        }
    }

    /**
     * חיפוש תחנות לפי שם עיר/פוליגון
     * מחפש התאמה חלקית בשם הפוליגון
     */
    findStationsByCity(cityName) {
        if (!this.loaded) {
            throw new Error('התחנות לא נטענו עדיין. קרא ל-load() תחילה.');
        }

        const matchingStations = [];
        const searchTerm = cityName.toLowerCase().trim();

        // חיפוש בכל הפוליגונים - התאמה חלקית
        for (const [polygonName, stations] of Object.entries(this.polygonIndex)) {
            const normalizedPolygon = polygonName.toLowerCase();
            
            // בדיקה אם שם העיר מופיע בפוליגון או להיפך
            if (normalizedPolygon.includes(searchTerm) || searchTerm.includes(normalizedPolygon)) {
                matchingStations.push(...stations);
            }
        }

        // גם חיפוש ישיר בערים אם מופיעות בשם העיר מההתראה
        // לדוגמה: "תל אביב - מזרח" יחפש "תל אביב"
        const cityParts = searchTerm.split(/[\s-–—,]+/);
        for (const part of cityParts) {
            if (part.length > 2) { // רק חלקים בעלי משמעות
                for (const [polygonName, stations] of Object.entries(this.polygonIndex)) {
                    const normalizedPolygon = polygonName.toLowerCase();
                    if (normalizedPolygon.includes(part) || part.includes(normalizedPolygon)) {
                        // הוספה רק אם עוד לא קיימת
                        for (const station of stations) {
                            if (!matchingStations.find(s => s.serial === station.serial)) {
                                matchingStations.push(station);
                            }
                        }
                    }
                }
            }
        }

        return matchingStations;
    }

    /**
     * קבלת כל התחנות
     */
    getAllStations() {
        return this.stations;
    }

    /**
     * קבלת תחנות לפי פוליגון
     */
    getStationsByPolygon(polygonName) {
        return this.polygonIndex[polygonName] || [];
    }

    /**
     * קבלת תחנות לפי מחוז שרת (A/B/C)
     */
    getStationsByServerDistrict(serverDistrict) {
        return this.stations.filter(s => s.serverDistrict === serverDistrict.toUpperCase());
    }

    /**
     * חיפוש מדויק לפי שם עיר/פוליגון - מנסה התאמה מלאה או התאמת מילים שלמות
     */
    findStationsByCityExact(cityName) {
        if (!this.loaded) {
            throw new Error('התחנות לא נטענו עדיין. קרא ל-load() תחילה.');
        }

        const search = (cityName || '').toString().toLowerCase().trim();
        if (!search) return [];

        const tokens = search.split(/[^\p{L}0-9]+/u).filter(Boolean);

        const results = [];
        for (const station of this.stations) {
            const polygon = (station.polygon || '').toString().toLowerCase();
            const name = (station.stationName || '').toString().toLowerCase();
            // exact full match
            if (polygon === search || name === search) {
                results.push(station);
                continue;
            }
            // match any token as full word in polygon or name
            const polygonTokens = polygon.split(/[^\p{L}0-9]+/u).filter(Boolean);
            const nameTokens = name.split(/[^\p{L}0-9]+/u).filter(Boolean);
            let matched = false;
            for (const t of tokens) {
                if (polygonTokens.includes(t) || nameTokens.includes(t)) { matched = true; break; }
            }
            if (matched) results.push(station);
        }

        // de-duplicate by serial
        const uniq = [];
        const seen = new Set();
        for (const s of results) {
            if (!seen.has(s.serial)) { uniq.push(s); seen.add(s.serial); }
        }
        return uniq;
    }
}

module.exports = StationManager;
