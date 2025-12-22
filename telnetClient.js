/**
 * מודול שליחת פקודות TELNET לתחנות כבאות
 * לפי המדריך: שלושה שרתים (A/B/C) עם פורטים שונים
 */

const net = require('net');

class TelnetClient {
    constructor() {
        // הגדרות שרתים לפי המדריך
        this.servers = {
            'A': {
                name: 'דן מרכז ונציבות',
                host: '100.71.0.249',
                ports: [10000, 10001, 10002, 61113]
            },
            'B': {
                name: 'יו"ש צפון וירושלים',
                host: '100.71.0.246',
                ports: [10000, 10001, 10002, 61113]
            },
            'C': {
                name: 'חוף ודרום',
                host: '100.71.0.243',
                ports: [10000, 10001, 10002, 61113]
            }
        };

        // מיפוי סוגי התראות לקודי TELNET
        // פורמט: $GMNG[מספר_תחנה] L[קוד_התראה]
        // רק 4 קודים פעילים:
        // 00110 - רעידת אדמה
        // 00111 - חדירת כלי טייס עוין
        // 00112 - ירי רקטות וטילים
        // 00113 - התרעה מקדימה
        this.alertCodes = {
            'missiles': '00112',              // ירי רקטות וטילים
            'earthQuake': '00110',            // רעידת אדמה
            'hostileAircraftIntrusion': '00111', // חדירת כלי טייס עוין
            'newsFlash': '00113',             // התרעה מקדימה
            'missilesDrill': '00112',         // תרגיל טילים
            'earthQuakeDrill': '00110',       // תרגיל רעידת אדמה
            'hostileAircraftIntrusionDrill': '00111', // תרגיל כלי טיס
            'unknown': '00112',               // ברירת מחדל - ירי רקטות וטילים
            // שאר סוגי ההתראות לא נשלחים
            'radiologicalEvent': null,
            'tsunami': null,
            'hazardousMaterials': null,
            'terroristInfiltration': null,
            'radiologicalEventDrill': null,
            'tsunamiDrill': null,
            'hazardousMaterialsDrill': null,
            'terroristInfiltrationDrill': null,
            'none': null                      // ללא התראה
        };
    }

    /**
     * יצירת מחרוזת פקודת TELNET
     * פורמט: $GMNG[מספר_תחנה] L[קוד_התראה]
     * מחזיר null אם אין קוד עבור סוג ההתראה (לא צריך לשלוח)
     */
    buildCommand(stationCode, alertType) {
        const alertCode = this.alertCodes[alertType];
        if (!alertCode) {
            // אין קוד עבור סוג התראה זה - לא נשלח
            return null;
        }

        // פורמט: $GMNG122 L00112
        // מספר התחנה כבר מגיע בפורמט נכון (121, 129 וכו')
        return `$GMNG${stationCode} L${alertCode}`;
    }

    /**
     * שליחת פקודה ל-TELNET
     */
    async sendCommand(serverDistrict, stationCode, alertType, timeout = 5000) {
        const server = this.servers[serverDistrict.toUpperCase()];
        if (!server) {
            throw new Error(`שרת לא קיים: ${serverDistrict}. צריך להיות A, B או C`);
        }

        const command = this.buildCommand(stationCode, alertType);

        // נסיון לשלוח לכל הפורטים עד שאחד מצליח
        for (const port of server.ports) {
            try {
                const result = await this.sendToPort(server.host, port, command, timeout);
                return {
                    success: true,
                    server: serverDistrict,
                    host: server.host,
                    port: port,
                    stationCode,
                    command,
                    response: result
                };
            } catch (error) {
                // ממשיך לנסות בפורט הבא
                console.log(`  ⚠️  נכשל בפורט ${port}: ${error.message}`);
                continue;
            }
        }

        // אם כל הפורטים נכשלו
        throw new Error(`כל הניסיונות נכשלו לשרת ${serverDistrict} (${server.host})`);
    }

    /**
     * שליחת פקודה לפורט ספציפי
     */
    sendToPort(host, port, command, timeout) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            let resolved = false;

            // timeout
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    client.destroy();
                    reject(new Error(`Timeout after ${timeout}ms`));
                }
            }, timeout);

            // חיבור לשרת
            client.connect(port, host, () => {
                console.log(`  🔌 מחובר ל-${host}:${port}`);
                
                // שליחת הפקודה
                client.write(command + '\r\n');
                console.log(`  📤 נשלח: ${command}`);
            });

            // קבלת תגובה
            let responseData = '';
            client.on('data', (data) => {
                responseData += data.toString();
                // אם קיבלנו תגובה, נסגור את החיבור
                if (responseData.length > 0) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        client.destroy();
                        resolve(responseData.trim());
                    }
                }
            });

            // שגיאות
            client.on('error', (error) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });

            client.on('close', () => {
                // אם נסגר בלי שגיאה, זה בסדר
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    // אם יש תגובה, נשתמש בה, אחרת נדחה
                    if (responseData) {
                        resolve(responseData.trim());
                    } else {
                        reject(new Error('Connection closed without response'));
                    }
                }
            });
        });
    }

    /**
     * שליחת התראה למספר תחנות
     */
    async sendToStations(stations, alertType) {
        const results = [];
        
        console.log(`\n📡 שולח התראה מסוג "${alertType}" ל-${stations.length} תחנות...`);

        for (const station of stations) {
            try {
                console.log(`\n🎯 תחנה: ${station.stationName}`);
                console.log(`   קוד API: ${station.apiCode}, שרת: ${station.serverDistrict}`);
                
                // בדיקה אם יש קוד עבור סוג ההתראה הזו
                const command = this.buildCommand(station.apiCode, alertType);
                if (!command) {
                    console.log(`   ⏭️  דילוג - אין קוד TELNET עבור סוג התראה: ${alertType}`);
                    results.push({
                        station: station.stationName,
                        success: false,
                        error: `אין קוד TELNET עבור ${alertType}`,
                        server: station.serverDistrict,
                        stationCode: station.apiCode,
                        skipped: true
                    });
                    continue;
                }
                
                const result = await this.sendCommand(
                    station.serverDistrict,
                    station.apiCode,
                    alertType
                );

                results.push({
                    station: station.stationName,
                    success: true,
                    ...result
                });

                console.log(`   ✅ נשלח בהצלחה`);
                
                // המתנה קצרה בין שליחות
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.log(`   ❌ שגיאה: ${error.message}`);
                results.push({
                    station: station.stationName,
                    success: false,
                    error: error.message,
                    server: station.serverDistrict,
                    stationCode: station.apiCode
                });
            }
        }

        return results;
    }

    /**
     * קבלת קוד התראה לפי סוג
     */
    getAlertCode(alertType) {
        return this.alertCodes[alertType] || null;
    }
}

module.exports = TelnetClient;
