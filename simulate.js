#!/usr/bin/env node

/**
 * סקריפט סימולציה - מדגים איך המערכת תטפל בהתראה
 * ללא שליחת TELNET אמיתי
 */

const StationManager = require('./stationManager');
const TelnetClient = require('./telnetClient');

async function simulate() {
    console.log('='.repeat(60));
    console.log('🎭 סימולציה - הדגמת מערכת התראות');
    console.log('='.repeat(60));
    console.log();

    // טעינת תחנות
    console.log('📂 טוען תחנות כבאות...');
    const stationManager = new StationManager();
    try {
        await stationManager.load();
        console.log('✅ תחנות נטענו בהצלחה\n');
    } catch (error) {
        console.error('❌ שגיאה בטעינת תחנות:', error.message);
        return;
    }

    // יצירת לקוח TELNET (רק לבניית פקודות, לא לשליחה אמיתית)
    const telnetClient = new TelnetClient();

    // סימולציה 1: התראת טילים בתל אביב
    console.log('='.repeat(60));
    console.log('📢 סימולציה 1: התראת טילים');
    console.log('='.repeat(60));
    console.log('🏙️  ערים מושפעות: תל אביב - מזרח, בני ברק');
    console.log('🔔 סוג התראה: missiles');
    console.log();

    const cities1 = ['תל אביב - מזרח', 'בני ברק'];
    const alertType1 = 'missiles';
    
    console.log('🔍 מחפש תחנות מושפעות...');
    const affectedStations1 = [];
    const foundStations1 = new Set();

    for (const city of cities1) {
        const stations = stationManager.findStationsByCity(city);
        for (const station of stations) {
            const stationKey = `${station.serverDistrict}_${station.apiCode}`;
            if (!foundStations1.has(stationKey)) {
                foundStations1.add(stationKey);
                affectedStations1.push(station);
            }
        }
    }

    if (affectedStations1.length === 0) {
        console.log('    ⚠️  לא נמצאו תחנות עבור הערים האלה');
    } else {
        console.log(`    ✅ נמצאו ${affectedStations1.length} תחנות מושפעות:\n`);
        affectedStations1.forEach(station => {
            const command = telnetClient.buildCommand(station.apiCode, alertType1);
            console.log(`       📍 ${station.stationName}`);
            console.log(`          פוליגון: ${station.polygon}`);
            console.log(`          שרת TELNET: ${station.serverDistrict} (${getServerName(station.serverDistrict)})`);
            console.log(`          קוד API: ${station.apiCode}`);
            if (station.districts) {
                console.log(`          מחוזות: ${station.districts}`);
            }
            console.log(`          פקודה: ${command}`);
            console.log();
        });

        console.log('📡 מה היה קורה - שליחת TELNET:');
        affectedStations1.forEach(station => {
            const command = telnetClient.buildCommand(station.apiCode, alertType1);
            const server = telnetClient.servers[station.serverDistrict];
            console.log(`   🔌 התחברות ל-${server.host}:${server.ports[0]}`);
            console.log(`   📤 שליחת: ${command}`);
            console.log(`   ✅ התראה נשלחה לתחנה ${station.stationName}`);
            console.log();
        });
    }

    // סימולציה 2: רעידת אדמה בטבריה
    console.log('='.repeat(60));
    console.log('📢 סימולציה 2: רעידת אדמה');
    console.log('='.repeat(60));
    console.log('🏙️  ערים מושפעות: טבריה');
    console.log('🔔 סוג התראה: earthQuake');
    console.log();

    const cities2 = ['טבריה'];
    const alertType2 = 'earthQuake';
    
    console.log('🔍 מחפש תחנות מושפעות...');
    const affectedStations2 = [];
    const foundStations2 = new Set();

    for (const city of cities2) {
        const stations = stationManager.findStationsByCity(city);
        for (const station of stations) {
            const stationKey = `${station.serverDistrict}_${station.apiCode}`;
            if (!foundStations2.has(stationKey)) {
                foundStations2.add(stationKey);
                affectedStations2.push(station);
            }
        }
    }

    if (affectedStations2.length === 0) {
        console.log('    ⚠️  לא נמצאו תחנות עבור הערים האלה');
        console.log('    💡 זה אומר שאין תחנות עם פוליגון "טבריה" בקובץ האקסל');
    } else {
        console.log(`    ✅ נמצאו ${affectedStations2.length} תחנות מושפעות:\n`);
        affectedStations2.forEach(station => {
            const command = telnetClient.buildCommand(station.apiCode, alertType2);
            console.log(`       📍 ${station.stationName}`);
            console.log(`          פוליגון: ${station.polygon}`);
            console.log(`          שרת TELNET: ${station.serverDistrict} (${getServerName(station.serverDistrict)})`);
            console.log(`          קוד API: ${station.apiCode}`);
            console.log(`          פקודה: ${command}`);
            console.log();
        });
    }

    // סימולציה 3: התראה עם כמה ערים
    console.log('='.repeat(60));
    console.log('📢 סימולציה 3: התראה רב-עירונית');
    console.log('='.repeat(60));
    console.log('🏙️  ערים מושפעות: גבעתיים, הרצליה, קריית אונו');
    console.log('🔔 סוג התראה: missiles');
    console.log();

    const cities3 = ['גבעתיים', 'הרצליה', 'קריית אונו'];
    const alertType3 = 'missiles';
    
    console.log('🔍 מחפש תחנות מושפעות...');
    const affectedStations3 = [];
    const foundStations3 = new Set();

    for (const city of cities3) {
        const stations = stationManager.findStationsByCity(city);
        console.log(`   🔎 חיפוש עבור "${city}": נמצאו ${stations.length} תחנות`);
        for (const station of stations) {
            const stationKey = `${station.serverDistrict}_${station.apiCode}`;
            if (!foundStations3.has(stationKey)) {
                foundStations3.add(stationKey);
                affectedStations3.push(station);
            }
        }
    }

    if (affectedStations3.length === 0) {
        console.log('    ⚠️  לא נמצאו תחנות');
    } else {
        console.log(`\n    ✅ סך הכל נמצאו ${affectedStations3.length} תחנות ייחודיות מושפעות:\n`);
        
        // קיבוץ לפי שרת
        const byServer = {
            'A': [],
            'B': [],
            'C': []
        };
        
        affectedStations3.forEach(station => {
            byServer[station.serverDistrict].push(station);
        });

        for (const [server, stations] of Object.entries(byServer)) {
            if (stations.length > 0) {
                console.log(`   📡 שרת ${server} (${getServerName(server)}) - ${stations.length} תחנות:`);
                stations.forEach(station => {
                    const command = telnetClient.buildCommand(station.apiCode, alertType3);
                    console.log(`      • ${station.stationName} (${station.apiCode}) → ${command}`);
                });
                console.log();
            }
        }
    }

    // סיכום
    console.log('='.repeat(60));
    console.log('📊 סיכום הסימולציה');
    console.log('='.repeat(60));
    console.log(`✅ סה"כ תחנות במערכת: ${stationManager.getAllStations().length}`);
    console.log(`✅ פוליגונים ייחודיים: ${Object.keys(stationManager.polygonIndex).length}`);
    console.log();
    console.log('💡 זה מה שיקרה בפועל כשמגיעה התראה אמיתית!');
    console.log('🔴 הבדל: בפועל תהיה שליחה אמיתית דרך TELNET לשרתים');
    console.log('='.repeat(60));
}

function getServerName(server) {
    const names = {
        'A': 'דן מרכז ונציבות (100.71.0.249)',
        'B': 'יו"ש צפון וירושלים (100.71.0.246)',
        'C': 'חוף ודרום (100.71.0.243)'
    };
    return names[server] || server;
}

// הרצה
simulate().catch(error => {
    console.error('❌ שגיאה בסימולציה:', error);
    process.exit(1);
});
