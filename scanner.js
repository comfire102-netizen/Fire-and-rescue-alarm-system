#!/usr/bin/env node

/**
 * סקריפט סריקת התראות Pikud Haoref
 * משתמש ב-pikud-haoref-api הספרייה הרשמית
 * סורק התראות כל 3 שניות ויוצר קובץ Excel בסיום
 */

const pikudHaoref = require('pikud-haoref-api');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const StationManager = require('./stationManager');
const TelnetClient = require('./telnetClient');

class AlertScanner {
    constructor(options = {}) {
        // סוגי התראות לפי pikud-haoref-api
        this.alertTypes = [
            'missiles',
            'radiologicalEvent',
            'earthQuake',
            'tsunami',
            'hostileAircraftIntrusion',
            'hazardousMaterials',
            'terroristInfiltration',
            'missilesDrill',
            'earthQuakeDrill',
            'radiologicalEventDrill',
            'tsunamiDrill',
            'hostileAircraftIntrusionDrill',
            'hazardousMaterialsDrill',
            'terroristInfiltrationDrill',
            'newsFlash',
            'unknown',
            'none'
        ];

        // מילון לאיסוף התראות לפי סוג
        this.alertsLog = {};
        for (const type of this.alertTypes) {
            this.alertsLog[type] = [];
        }

        this.scanCount = 0;
        this.startTime = new Date();

        // ניהול תחנות כבאות
        this.stationManager = new StationManager(options.excelFilePath);
        this.telnetClient = new TelnetClient();
        
        // מניעת שליחת התראות כפולות (tracking לפי timestamp)
        this.processedAlerts = new Set();
        
        // אפשרות לנטרל שליחת TELNET (לצורך בדיקות)
        this.enableTelnet = options.enableTelnet !== false;
    }

    /**
     * קבלת התראה נוכחית מה-API
     */
    getAlert() {
        return new Promise((resolve, reject) => {
            pikudHaoref.getActiveAlert((err, alert) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(alert);
                }
            });
        });
    }

    /**
     * סריקת התראות כל 3 שניות
     */
    async scan(duration = null) {
        console.log('\n🚨 Starting alert scanner (interval: 3 seconds)...');
        console.log('Press Ctrl+C to stop scanning and generate Excel file\n');

        const startTime = Date.now();
        this.shouldStop = false;

        return new Promise((resolve) => {
            const scanInterval = setInterval(async () => {
                try {
                    // בדיקה אם נדרש לעצור
                    if (this.shouldStop) {
                        clearInterval(scanInterval);
                        this.scanInterval = null;
                        console.log('\n🛑 Scan stopped by service');
                        resolve();
                        return;
                    }

                    // בדיקה אם חרגנו מזמן המקסימום
                    if (duration && (Date.now() - startTime) > duration * 1000) {
                        clearInterval(scanInterval);
                        this.scanInterval = null;
                        console.log('\n⏱️  Duration limit reached');
                        this.printSummary();
                        await this.generateExcel();
                        resolve();
                        return;
                    }

                    const alert = await this.getAlert();
                    this.scanCount++;
                    const timestamp = new Date().toLocaleString('he-IL');

                    await this.processAlert(alert, timestamp);

                } catch (error) {
                    console.log(`[${new Date().toLocaleString('he-IL')}] ⚠️  Error scanning: ${error.message}`);
                }
            }, 3000);
            
            // שמירת reference ל-interval כדי שנוכל לעצור אותו מבחוץ
            this.scanInterval = scanInterval;

            // טיפול ב-Ctrl+C
            process.on('SIGINT', () => {
                clearInterval(scanInterval);
                this.scanInterval = null;
                console.log('\n\n🛑 Scan stopped by user (Ctrl+C)');
                console.log(`\n📊 Total scans performed: ${this.scanCount}`);
                this.printSummary();
                this.generateExcel().then(() => resolve());
            });
        });
    }

    /**
     * עיבוד התראה יחידה
     */
    async processAlert(alert, timestamp) {
        if (!alert) {
            console.log(`[${timestamp}] Scan #${this.scanCount}: No active alerts`);
            return;
        }

        const alertType = alert.type || 'none';
        
        // דילוג על התראות "none"
        if (alertType === 'none') {
            return;
        }

        // יצירת מפתח ייחודי להתראה (למניעת שליחה כפולה)
        const alertKey = `${alertType}_${JSON.stringify(alert.cities)}_${Math.floor(Date.now() / 10000)}`;
        
        // בדיקה אם כבר טיפלנו בהתראה הזו (במשך 10 שניות אחרונות)
        if (this.processedAlerts.has(alertKey)) {
            console.log(`[${timestamp}] 🔄 Alert already processed, skipping...`);
            return;
        }

        const cities = Array.isArray(alert.cities) ? alert.cities : [];
        const alertData = {
            timestamp,
            type: alertType,
            cities: cities.join(', '),
            instructions: alert.instructions || '',
            rawData: JSON.stringify(alert, null, 2),
            telnetSent: false,
            affectedStations: []
        };

        if (!this.alertsLog[alertType]) {
            this.alertsLog[alertType] = [];
        }

        this.alertsLog[alertType].push(alertData);
        console.log(`\n[${timestamp}] 🔔 Alert detected → Type: ${alertType}`);
        if (alertData.cities) {
            console.log(`    🏙️  Cities: ${alertData.cities}`);
        }

        // שליחת התראות TELNET לתחנות כבאות
        if (this.enableTelnet && this.stationManager.loaded && cities.length > 0) {
            try {
                await this.sendAlertToStations(alert, alertType, cities, alertData);
                this.processedAlerts.add(alertKey);
                
                // ניקוי מפתחות ישנים (אחרי 60 שניות)
                setTimeout(() => {
                    this.processedAlerts.delete(alertKey);
                }, 60000);
            } catch (error) {
                console.error(`    ❌ שגיאה בשליחת התראות TELNET: ${error.message}`);
            }
        }
    }

    /**
     * שליחת התראה לתחנות כבאות
     */
    async sendAlertToStations(alert, alertType, cities, alertData) {
        console.log(`\n🔍 מחפש תחנות מושפעות...`);
        
        // איסוף כל התחנות המושפעות
        const affectedStations = [];
        const foundStations = new Set(); // למניעת כפילויות

        for (const city of cities) {
            const stations = this.stationManager.findStationsByCity(city);
            for (const station of stations) {
                const stationKey = `${station.serverDistrict}_${station.apiCode}`;
                if (!foundStations.has(stationKey)) {
                    foundStations.add(stationKey);
                    affectedStations.push(station);
                }
            }
        }

        if (affectedStations.length === 0) {
            console.log(`    ⚠️  לא נמצאו תחנות עבור הערים: ${cities.join(', ')}`);
            alertData.telnetSent = false;
            return;
        }

        console.log(`    ✅ נמצאו ${affectedStations.length} תחנות מושפעות:`);
        affectedStations.forEach(station => {
            console.log(`       - ${station.stationName} (שרת: ${station.serverDistrict}) - קוד: ${station.apiCode}`);
        });

        // שליחת התראות TELNET
        alertData.telnetSent = true;
        alertData.affectedStations = affectedStations.map(s => ({
            name: s.stationName,
            code: s.apiCode,
            server: s.serverDistrict
        }));

        const results = await this.telnetClient.sendToStations(affectedStations, alertType);
        
        // ספירת הצלחות וכשלונות
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        console.log(`\n📊 סיכום שליחה: ${successCount} הצלחות, ${failCount} כשלונות`);
        alertData.telnetResults = {
            total: results.length,
            success: successCount,
            failed: failCount,
            details: results
        };
    }

    /**
     * הדפסת סיכום ההתראות
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 ALERTS SUMMARY');
        console.log('='.repeat(60));

        let totalAlerts = 0;
        for (const alertType of this.alertTypes) {
            const count = this.alertsLog[alertType].length;
            totalAlerts += count;
            const status = count > 0 ? '✅' : '⚪';
            console.log(`${status} ${alertType.padEnd(30, ' ')}: ${count} alerts`);
        }

        console.log('='.repeat(60));
        console.log(`📊 Total unique alerts: ${totalAlerts}`);
        console.log('='.repeat(60));
    }

    /**
     * יצירת קובץ Excel
     */
    async generateExcel() {
        const now = new Date();
        const filename = `pikud_alerts_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.xlsx`;

        // תיקייה ייעודית לקובצי Excel בתוך תיקיית הפרויקט
        const excelDir = path.join(process.cwd(), 'excel_reports');

        // יצירת התיקייה אם לא קיימת
        if (!fs.existsSync(excelDir)) {
            fs.mkdirSync(excelDir, { recursive: true });
            console.log(`\n📁 Created Excel output directory: ${excelDir}`);
        }

        const fullPath = path.join(excelDir, filename);

        console.log(`\n📝 Generating Excel file: ${fullPath}...`);

        const workbook = new ExcelJS.Workbook();

        // עיצוב כותרות
        const headerFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        const headerFont = {
            bold: true,
            color: { argb: 'FFFFFFFF' },
            size: 12
        };

        // יצירת גליון לכל סוג התראה (ללא 'none')
        for (const alertType of this.alertTypes) {
            // דילוג על 'none' - לא רוצים גליון ריק
            if (alertType === 'none') continue;
            
            const entries = this.alertsLog[alertType];
            const sheet = workbook.addWorksheet(alertType.substring(0, 31)); // Excel מגביל לשם עד 31 תווים

            // הוספת כותרות
            const headers = ['זמן', 'סוג התראה', 'ערים', 'הוראות', 'TELNET נשלח', 'תחנות מושפעות', 'נתונים גולמיים (JSON)'];
            const headerRow = sheet.addRow(headers);

            // עיצוב כותרות
            headerRow.eachCell((cell) => {
                cell.fill = headerFill;
                cell.font = headerFont;
                cell.alignment = { horizontal: 'right', vertical: 'center', wrapText: true };
            });

            // הוספת הנתונים
            for (const entry of entries) {
                const telnetInfo = entry.telnetSent 
                    ? `כן (${entry.affectedStations?.length || 0} תחנות, ${entry.telnetResults?.success || 0} הצלחות)`
                    : 'לא';
                
                sheet.addRow([
                    entry.timestamp,
                    entry.type,
                    entry.cities,
                    entry.instructions.substring(0, 100),
                    telnetInfo,
                    entry.affectedStations?.map(s => `${s.name} (${s.code})`).join('; ') || '',
                    entry.rawData
                ]);
            }

            // הגדרת רוחב עמודות
            sheet.columns = [
                { width: 20 },
                { width: 22 },
                { width: 40 },
                { width: 50 },
                { width: 25 },
                { width: 50 },
                { width: 60 }
            ];

            // עיצוב שורות נתונים
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.eachCell((cell) => {
                        cell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
                    });
                }
            });
        }

        // שמירת הקובץ
        await workbook.xlsx.writeFile(fullPath);
        console.log(`✅ Excel file created: ${fullPath}`);
        console.log(`📊 Sheets: ${this.alertTypes.slice(0, 5).join(', ')} ... (${this.alertTypes.length} total)`);

        return filename;
    }
}

// Export עבור שימוש כמודול
module.exports = AlertScanner;

/**
 * פונקציית ראשית
 */
async function main() {
    console.log('='.repeat(60));
    console.log('🚨 PIKUD HAOREF ALERT SCANNER 🚨');
    console.log('='.repeat(60));
    console.log(`Start time: ${new Date().toLocaleString('he-IL')}\n`);

    // אתחול הסורק
    const scanner = new AlertScanner({
        enableTelnet: true // אפשר לנטרל עם false לצורך בדיקות
    });
    console.log('✅ Scanner initialized');
    console.log(`Alert types being tracked: ${scanner.alertTypes.length} types`);

    // טעינת תחנות כבאות
    console.log('\n📂 טוען תחנות כבאות מקובץ האקסל...');
    try {
        await scanner.stationManager.load();
        console.log(`✅ תחנות נטענו בהצלחה`);
    } catch (error) {
        console.error(`❌ שגיאה בטעינת תחנות: ${error.message}`);
        console.log('⚠️  המשך ללא שליחת TELNET...');
        scanner.enableTelnet = false;
    }

    // בדיקה אם סופקה משך זמן כטיעון
    let duration = null;
    if (process.argv.length > 2) {
        try {
            duration = parseInt(process.argv[2]);
            console.log(`⏱️  Scan duration: ${duration} seconds\n`);
        } catch (error) {
            console.log('⚠️  Invalid duration argument. Using continuous mode.\n');
        }
    }

    // הרצת הסריקה
    await scanner.scan(duration);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Process completed at ${new Date().toLocaleString('he-IL')}`);
    console.log('='.repeat(60));

    process.exit(0);
}

// הרצה רק אם זה הקובץ הראשי (לא כמודול)
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
