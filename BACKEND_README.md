# 🚀 Backend Server - הוראות הרצה

## התקנה

כבר הותקנו כל התלויות הנדרשות:
- express
- socket.io
- cors
- body-parser

## הרצת השרת

```bash
npm run server
```

או:

```bash
node backend/server.js
```

השרת ירוץ על: `http://localhost:3000`

## API Endpoints

### Scanner
- `GET /api/scanner/status` - מצב הסורק
- `POST /api/scanner/start` - הפעלת סורק
- `POST /api/scanner/stop` - עצירת סורק
- `GET /api/scanner/stats` - סטטיסטיקות

### Alerts
- `GET /api/alerts/types` - כל סוגי ההתראות
- `GET /api/alerts/enabled` - התראות מופעלות
- `POST /api/alerts/enable` - הפעלת התראה
- `POST /api/alerts/disable` - כיבוי התראה

### Health
- `GET /api/health` - בדיקת תקינות

## WebSocket Events

### Client → Server
- `connect` - חיבור ל-WebSocket

### Server → Client
- `scanner:status` - עדכון מצב סורק
- `alert:new` - התראה חדשה
- `stats` - עדכון סטטיסטיקות

## קבצי הגדרות

הגדרות נשמרות ב: `backend/data/settings.json`

**אזהרה**: קובץ זה לא ב-.gitignore כי הוא חלק מהקוד. בסביבת פרודקשן רצוי לשמור אותו בנפרד.

## מבנה קבצים

```
backend/
├── server.js              # שרת Express + WebSocket
├── api/
│   ├── scanner.js         # API לסורק
│   └── alerts.js          # API להתראות
├── services/
│   ├── scannerService.js  # שירות מבוקר של הסורק
│   └── settingsManager.js # ניהול הגדרות
└── data/
    └── settings.json      # קובץ הגדרות
```
