/**
 * API endpoints לניהול התראות
 */

const express = require('express');
const router = express.Router();

function createAlertsRouter(settingsManager) {
    /**
     * GET /api/alerts/types
     * קבלת כל סוגי ההתראות
     */
    router.get('/types', (req, res) => {
        try {
            const settings = settingsManager.getSettings();
            const alerts = Object.keys(settings.alerts).map(key => ({
                type: key,
                ...settings.alerts[key]
            }));
            res.json({ success: true, data: alerts });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/alerts/enabled
     * קבלת רשימת התראות מופעלות
     */
    router.get('/enabled', (req, res) => {
        try {
            const enabled = settingsManager.getEnabledAlerts();
            res.json({ success: true, data: enabled });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/alerts/enable
     * הפעלת התראה מסוימת
     * Body: { alertType: 'missiles' }
     */
    router.post('/enable', (req, res) => {
        try {
            const { alertType } = req.body;
            if (!alertType) {
                return res.status(400).json({ success: false, error: 'נדרש alertType' });
            }

            const success = settingsManager.updateAlertSetting(alertType, true);
            if (success) {
                res.json({ success: true, message: `התראה ${alertType} הופעלה` });
            } else {
                res.status(400).json({ success: false, error: 'סוג התראה לא קיים' });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/alerts/disable
     * כיבוי התראה מסוימת
     * Body: { alertType: 'missiles' }
     */
    router.post('/disable', (req, res) => {
        try {
            const { alertType } = req.body;
            if (!alertType) {
                return res.status(400).json({ success: false, error: 'נדרש alertType' });
            }

            const success = settingsManager.updateAlertSetting(alertType, false);
            if (success) {
                res.json({ success: true, message: `התראה ${alertType} כובתה` });
            } else {
                res.status(400).json({ success: false, error: 'סוג התראה לא קיים' });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createAlertsRouter;
