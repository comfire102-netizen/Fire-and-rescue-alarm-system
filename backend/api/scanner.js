/**
 * API endpoints לשליטה בסורק
 */

const express = require('express');
const router = express.Router();

function createScannerRouter(scannerService) {
    /**
     * GET /api/scanner/status
     * קבלת מצב נוכחי של הסורק
     */
    router.get('/status', (req, res) => {
        try {
            const status = scannerService.getStatus();
            res.json({ success: true, data: status });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/scanner/start
     * הפעלת הסורק
     */
    router.post('/start', async (req, res) => {
        try {
            const result = await scannerService.start();
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/scanner/stop
     * עצירת הסורק
     */
    router.post('/stop', async (req, res) => {
        try {
            const result = await scannerService.stop();
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/scanner/stats
     * קבלת סטטיסטיקות
     */
    router.get('/stats', (req, res) => {
        try {
            const status = scannerService.getStatus();
            res.json({ success: true, data: status.stats });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/scanner/simulate
     * סימולציית התראה פקטיבית לצורכי בדיקה
     * Body: { type: 'missiles', cities: ['בני ברק','רמת גן'], instructions: 'טקסט' }
     */
    router.post('/simulate', async (req, res) => {
        try {
            const { type, cities, instructions, dryRun } = req.body || {};
            if (!type) return res.status(400).json({ success: false, error: 'נדרש type' });

            const alert = {
                type,
                cities: Array.isArray(cities) ? cities : (typeof cities === 'string' ? cities.split(',').map(s => s.trim()).filter(Boolean) : []),
                instructions: instructions || 'סימולציה'
            };

            const timestamp = new Date().toISOString();

            // Always emit websocket event for UI; include simulated flag when dryRun requested
            if (scannerService && typeof scannerService.emitStatus === 'function') {
                scannerService.emitStatus('alert:new', { type: alert.type, cities: alert.cities.join(', '), timestamp, simulated: !!dryRun });
            }

            // If not dryRun and scanner available, process via scanner (may send TELNET)
            if (!dryRun && scannerService && scannerService.scanner && typeof scannerService.scanner.processAlert === 'function') {
                await scannerService.scanner.processAlert(alert, timestamp);
                return res.json({ success: true, message: 'Simulated via scanner.processAlert' });
            }

            // If we emitted websocket above, return success
            return res.json({ success: true, message: dryRun ? 'Simulated (dryRun) via websocket' : 'Simulated via websocket' });

            return res.status(500).json({ success: false, error: 'ScannerService לא זמין' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createScannerRouter;
