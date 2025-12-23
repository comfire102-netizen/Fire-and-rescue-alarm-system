#!/usr/bin/env node

/**
 * שרת Express + WebSocket למערכת התראות
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const SettingsManager = require('./services/settingsManager');
const ScannerService = require('./services/scannerService');
const createScannerRouter = require('./api/scanner');
const createAlertsRouter = require('./api/alerts');

class NotiSystemServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.port = process.env.PORT || 3000;
        this.settingsManager = new SettingsManager();
        this.scannerService = new ScannerService(this.io);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    /**
     * הגדרת middleware
     */
    setupMiddleware() {
        // CORS
        this.app.use(cors());
        
        // Body parser
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        
        // Static files (frontend)
        this.app.use(express.static(path.join(__dirname, '../frontend')));
        
        // Logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * הגדרת routes
     */
    setupRoutes() {
        // API routes
        this.app.use('/api/scanner', createScannerRouter(this.scannerService));
        this.app.use('/api/alerts', createAlertsRouter(this.settingsManager));
        // תחנות / מחוזות
        const createStationsRouter = require('./api/stations');
        this.app.use('/api/stations', createStationsRouter());
        
        // Root - serve index.html
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        });
        
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ 
                success: true, 
                status: 'ok',
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * הגדרת WebSocket
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            // שליחת מצב נוכחי ללקוח חדש
            socket.emit('scanner:status', {
                status: this.scannerService.isRunning ? 'running' : 'stopped',
                timestamp: new Date().toISOString(),
                data: this.scannerService.getStatus()
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }

    /**
     * הפעלת השרת
     */
    start() {
        this.server.listen(this.port, () => {
            console.log('='.repeat(60));
            console.log('🚀 NotiSystem Server');
            console.log('='.repeat(60));
            console.log(`📡 Server running on http://localhost:${this.port}`);
            console.log(`📊 WebSocket ready for connections`);
            console.log('='.repeat(60));
        });
    }
}

// הרצה
if (require.main === module) {
    const server = new NotiSystemServer();
    server.start();
}

module.exports = NotiSystemServer;
