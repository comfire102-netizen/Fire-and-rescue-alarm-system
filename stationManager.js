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
            
            // טעינת גליון D.B (הגליון השני)
            let worksheet = workbook.getWorksheet('D.B');
            if (!worksheet) {
                // נסיון עם שם אחר או גליון שני
                worksheet = workbook.getWorksheet(2);
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
                    districts
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
}

module.exports = StationManager;
