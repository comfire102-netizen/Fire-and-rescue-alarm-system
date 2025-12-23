/**
 * שירות מבוקר של הסורק - מאפשר שליטה מהשרת
 */

const AlertScanner = require('../../scanner');
const SettingsManager = require('./settingsManager');

class ScannerService {
    constructor(io = null) {
        this.scanner = null;
        this.isRunning = false;
        this.statsInterval = null; // עבור עדכון סטטיסטיקות
        this.scannerStopRequested = false;
        this.settingsManager = new SettingsManager();
        this.io = io; // WebSocket server לשליחת עדכונים
        this.stats = {
            scanCount: 0,
            alertCount: 0,
            telnetSuccess: 0,
            telnetFailed: 0,
            startTime: null
        };
    }

    /**
     * הפעלת הסורק
     */
    async start() {
        if (this.isRunning) {
            return { success: false, message: 'הסורק כבר פועל' };
        }

        try {
            const settings = this.settingsManager.getSettings();
            
            this.scanner = new AlertScanner({
                enableTelnet: settings.scanner.enableTelnet
            });

            // טעינת תחנות
            console.log('📂 טוען תחנות כבאות...');
            await this.scanner.stationManager.load();
            console.log('✅ תחנות נטענו בהצלחה');

            // אתחול סטטיסטיקות
            this.stats.startTime = new Date();
            this.stats.scanCount = 0;
            this.stats.alertCount = 0;
            this.stats.telnetSuccess = 0;
            this.stats.telnetFailed = 0;

            // הוספת listener לעדכון סטטיסטיקות
            this.setupScannerListeners();

            // תחילת סריקה (ללא הגבלת זמן)
            // שמירת reference ל-interval כדי שנוכל לעצור אותו
            this.scanner.scanInterval = null; // נגדיר בסקריפט
            this.scannerStopRequested = false;
            
            // הרצה ברקע - לא נחכה לסיום
            this.scanner.scan().catch(error => {
                console.error('שגיאה בסריקה:', error);
                this.isRunning = false;
                this.emitStatus('error', error.message);
            }).finally(() => {
                // כשהסריקה נגמרת (אם היא נגמרת)
                this.isRunning = false;
                this.emitStatus('stopped');
            });

            this.isRunning = true;
            this.statsInterval = setInterval(() => {
                if (this.scanner) {
                    this.stats.scanCount = this.scanner.scanCount || 0;
                    this.emitStatus('stats', this.stats);
                }
            }, 5000); // עדכון סטטיסטיקות כל 5 שניות

            this.emitStatus('running');
            
            return { success: true, message: 'הסורק הופעל בהצלחה' };
        } catch (error) {
            console.error('שגיאה בהפעלת הסורק:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * הגדרת listeners לעדכון סטטיסטיקות
     */
    setupScannerListeners() {
        // override של processAlert כדי לעדכן סטטיסטיקות
        const originalProcessAlert = this.scanner.processAlert.bind(this.scanner);
        this.scanner.processAlert = async (alert, timestamp) => {
            const result = await originalProcessAlert(alert, timestamp);
            
            if (alert && alert.type !== 'none') {
                this.stats.alertCount++;
                this.emitStatus('alert:new', {
                    type: alert.type,
                    cities: alert.cities,
                    timestamp: timestamp
                });
            }
            
            return result;
        };
    }

    /**
     * עצירת הסורק
     */
    async stop() {
        if (!this.isRunning) {
            return { success: false, message: 'הסורק לא פועל' };
        }

        try {
            // עצירת הסורק
            this.scannerStopRequested = true;
            
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }

            // אם יש scanner, נסמן לו לעצור
            if (this.scanner) {
                // נסיון לעצור את ה-interval של הסורק
                if (this.scanner.scanInterval) {
                    clearInterval(this.scanner.scanInterval);
                    this.scanner.scanInterval = null;
                }
                // סמן לסורק שהוא צריך לעצור
                this.scanner.shouldStop = true;
            }

            this.isRunning = false;
            this.emitStatus('stopped');
            
            return { success: true, message: 'הסורק נעצר' };
        } catch (error) {
            console.error('שגיאה בעצירת הסורק:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * קבלת מצב נוכחי
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            stats: { ...this.stats },
            enabledAlerts: this.settingsManager.getEnabledAlerts()
        };
    }

    /**
     * עדכון סטטיסטיקות
     */
    updateStats(statsUpdate) {
        if (statsUpdate.scanCount !== undefined) this.stats.scanCount = statsUpdate.scanCount;
        if (statsUpdate.alertCount !== undefined) this.stats.alertCount += 1;
        if (statsUpdate.telnetSuccess !== undefined) this.stats.telnetSuccess += statsUpdate.telnetSuccess;
        if (statsUpdate.telnetFailed !== undefined) this.stats.telnetFailed += statsUpdate.telnetFailed;
        
        this.emitStatus('stats', this.stats);
    }

    /**
     * שליחת עדכון דרך WebSocket
     */
    emitStatus(event, data = null) {
        if (this.io) {
            if (event === 'alert:new') {
                // שליחת התראה חדשה
                this.io.emit('alert:new', data);
            } else if (event === 'stats') {
                // שליחת סטטיסטיקות
                this.io.emit('scanner:status', {
                    isRunning: this.isRunning,
                    stats: data || this.stats,
                    timestamp: new Date().toISOString()
                });
            } else {
                // שליחת מצב כללי
                this.io.emit('scanner:status', {
                    isRunning: this.isRunning,
                    status: this.isRunning ? 'running' : 'stopped',
                    stats: this.stats,
                    timestamp: new Date().toISOString(),
                    data: data
                });
            }
        }
    }

    /**
     * בדיקה אם צריך לשלוח התראה לפי ההגדרות
     */
    shouldSendAlert(alertType) {
        return this.settingsManager.isAlertEnabled(alertType);
    }
}

module.exports = ScannerService;
