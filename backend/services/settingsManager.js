/**
 * מנהל הגדרות - טיפול בשמירה וטעינה של הגדרות
 */

const fs = require('fs');
const path = require('path');

class SettingsManager {
    constructor(settingsPath = null) {
        this.settingsPath = settingsPath || path.join(__dirname, '../data/settings.json');
        this.defaultSettings = this.getDefaultSettings();
        this.ensureSettingsFile();
    }

    /**
     * הגדרות ברירת מחדל
     */
    getDefaultSettings() {
        return {
            alerts: {
                'missiles': { enabled: true, code: '00112', name: 'ירי רקטות וטילים' },
                'earthQuake': { enabled: true, code: '00110', name: 'רעידת אדמה' },
                'hostileAircraftIntrusion': { enabled: true, code: '00111', name: 'חדירת כלי טיס עוין' },
                'newsFlash': { enabled: true, code: '00113', name: 'התרעה מקדימה' },
                'radiologicalEvent': { enabled: false, code: null, name: 'אירוע רדיולוגי' },
                'tsunami': { enabled: false, code: null, name: 'צונמי' },
                'hazardousMaterials': { enabled: false, code: null, name: 'חומרים מסוכנים' },
                'terroristInfiltration': { enabled: false, code: null, name: 'חדירת מחבלים' },
                'missilesDrill': { enabled: true, code: '00112', name: 'תרגיל טילים' },
                'earthQuakeDrill': { enabled: true, code: '00110', name: 'תרגיל רעידת אדמה' },
                'hostileAircraftIntrusionDrill': { enabled: true, code: '00111', name: 'תרגיל כלי טיס' },
                'radiologicalEventDrill': { enabled: false, code: null, name: 'תרגיל רדיולוגי' },
                'tsunamiDrill': { enabled: false, code: null, name: 'תרגיל צונמי' },
                'hazardousMaterialsDrill': { enabled: false, code: null, name: 'תרגיל חומרים מסוכנים' },
                'terroristInfiltrationDrill': { enabled: false, code: null, name: 'תרגיל חדירת מחבלים' }
            },
            scanner: {
                interval: 3000,
                autoStart: false,
                enableTelnet: true
            }
        };
    }

    /**
     * וידוא שקובץ ההגדרות קיים
     */
    ensureSettingsFile() {
        const dir = path.dirname(this.settingsPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        if (!fs.existsSync(this.settingsPath)) {
            this.saveSettings(this.defaultSettings);
        }
    }

    /**
     * טעינת הגדרות
     */
    loadSettings() {
        try {
            const data = fs.readFileSync(this.settingsPath, 'utf8');
            const settings = JSON.parse(data);
            // מיזוג עם הגדרות ברירת מחדל (למקרה שהוספו שדות חדשים)
            return this.mergeWithDefaults(settings);
        } catch (error) {
            console.error('שגיאה בטעינת הגדרות:', error.message);
            return this.defaultSettings;
        }
    }

    /**
     * שמירת הגדרות
     */
    saveSettings(settings) {
        try {
            fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('שגיאה בשמירת הגדרות:', error.message);
            return false;
        }
    }

    /**
     * מיזוג עם הגדרות ברירת מחדל
     */
    mergeWithDefaults(settings) {
        const merged = JSON.parse(JSON.stringify(this.defaultSettings));
        
        // מיזוג alerts
        if (settings.alerts) {
            Object.keys(settings.alerts).forEach(key => {
                if (merged.alerts[key]) {
                    merged.alerts[key] = { ...merged.alerts[key], ...settings.alerts[key] };
                } else {
                    merged.alerts[key] = settings.alerts[key];
                }
            });
        }
        
        // מיזוג scanner
        if (settings.scanner) {
            merged.scanner = { ...merged.scanner, ...settings.scanner };
        }
        
        return merged;
    }

    /**
     * קבלת כל ההגדרות
     */
    getSettings() {
        return this.loadSettings();
    }

    /**
     * עדכון הגדרות התראה
     */
    updateAlertSetting(alertType, enabled) {
        const settings = this.loadSettings();
        if (settings.alerts[alertType]) {
            settings.alerts[alertType].enabled = enabled;
            return this.saveSettings(settings);
        }
        return false;
    }

    /**
     * קבלת רשימת התראות מופעלות
     */
    getEnabledAlerts() {
        const settings = this.loadSettings();
        const enabled = [];
        Object.keys(settings.alerts).forEach(key => {
            if (settings.alerts[key].enabled && settings.alerts[key].code) {
                enabled.push(key);
            }
        });
        return enabled;
    }

    /**
     * בדיקה אם התראה מופעלת
     */
    isAlertEnabled(alertType) {
        const settings = this.loadSettings();
        return settings.alerts[alertType]?.enabled === true && settings.alerts[alertType]?.code !== null;
    }

    /**
     * עדכון הגדרות סורק
     */
    updateScannerSettings(scannerSettings) {
        const settings = this.loadSettings();
        settings.scanner = { ...settings.scanner, ...scannerSettings };
        return this.saveSettings(settings);
    }
}

module.exports = SettingsManager;
