const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const ping = require('ping');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configure multer for APK uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Data stores
let tablets = {};
let apkLibrary = [];

// File paths
const dataFile = path.join(__dirname, 'tablets.json');
const apkFile = path.join(__dirname, 'apks.json');

// Load saved data
if (fs.existsSync(dataFile)) {
    tablets = JSON.parse(fs.readFileSync(dataFile));
}
if (fs.existsSync(apkFile)) {
    apkLibrary = JSON.parse(fs.readFileSync(apkFile));
}

function saveTablets() {
    fs.writeFileSync(dataFile, JSON.stringify(tablets, null, 2));
}

function saveApkLibrary() {
    fs.writeFileSync(apkFile, JSON.stringify(apkLibrary, null, 2));
}

// Get local IP address
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// ADB path - UPDATE THIS TO YOUR ACTUAL ADB LOCATION
const ADB_PATH = 'E:\\tablet-manager\\adb\\platform-tools-latest-windows\\platform-tools\\adb.exe';
const adbExists = fs.existsSync(ADB_PATH);

// ============ AUTO DISCOVERY & ENROLLMENT ============

// Auto-scan network for tablets (runs every 30 seconds)
async function autoScanNetwork() {
    try {
        const localIP = getLocalIP();
        const baseIP = localIP.substring(0, localIP.lastIndexOf('.')) + '.';
        
        console.log(`[Auto-Scan] Scanning: ${baseIP}0/24`);
        
        const foundDevices = [];
        const promises = [];
        
        for (let i = 1; i <= 254; i++) {
            const ip = baseIP + i;
            promises.push(
                ping.promise.probe(ip, { timeout: 1 }).then(res => {
                    if (res.alive) {
                        foundDevices.push({ ip, online: true, lastSeen: new Date() });
                    }
                }).catch(() => {})
            );
        }
        
        await Promise.all(promises);
        
        // Auto-enroll new devices
        let newDevicesCount = 0;
        for (let device of foundDevices) {
            let found = false;
            for (let id in tablets) {
                if (tablets[id].ip === device.ip) {
                    tablets[id].online = true;
                    tablets[id].lastSeen = new Date();
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                tablets[newId] = {
                    id: newId,
                    name: `Device-${device.ip.split('.').pop()}`,
                    ip: device.ip,
                    online: true,
                    installedApps: {},
                    lastSeen: new Date(),
                    addedVia: 'auto-discovery',
                    manufacturer: 'Unknown',
                    model: 'Unknown',
                    androidVersion: 'Unknown'
                };
                newDevicesCount++;
                console.log(`[Auto-Enroll] New device: ${device.ip}`);
                
                // Try to test ADB connection
                testADBConnection(device.ip);
            }
        }
        
        if (newDevicesCount > 0) {
            saveTablets();
            console.log(`[Auto-Enroll] Added ${newDevicesCount} new device(s)`);
        }
        
        return foundDevices.length;
    } catch (error) {
        console.error('[Auto-Scan] Error:', error.message);
        return 0;
    }
}

// Test ADB connection on port 5555
function testADBConnection(ip) {
    exec(`"${ADB_PATH}" connect ${ip}:5555`, (err, stdout) => {
        if (!err && stdout.includes('connected')) {
            console.log(`[ADB] Successfully connected to ${ip}:5555`);
            exec(`"${ADB_PATH}" disconnect ${ip}:5555`);
        } else {
            console.log(`[ADB] Could not connect to ${ip}:5555 - tablet may need USB setup once`);
        }
    });
}

// Start auto-scan every 30 seconds
setInterval(async () => {
    await autoScanNetwork();
}, 30000);

// Run initial scan
setTimeout(() => autoScanNetwork(), 2000);

// ============ APK MANAGEMENT API ============

app.get('/api/apks', (req, res) => {
    res.json(apkLibrary);
});

app.post('/api/upload-apk', upload.single('apk'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const apkInfo = {
        id: Date.now().toString(),
        name: req.file.originalname,
        filename: req.file.originalname,
        size: req.file.size,
        sizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
        uploadedAt: new Date(),
        packageName: req.file.originalname.replace('.apk', '').toLowerCase(),
        version: '1.0'
    };
    
    apkLibrary.push(apkInfo);
    saveApkLibrary();
    
    res.json({ success: true, apk: apkInfo, message: 'APK uploaded successfully' });
});

app.delete('/api/apk/:apkId', (req, res) => {
    const apkId = req.params.apkId;
    const apk = apkLibrary.find(a => a.id === apkId);
    
    if (!apk) {
        return res.status(404).json({ error: 'APK not found' });
    }
    
    const apkPath = path.join(__dirname, 'uploads', apk.filename);
    if (fs.existsSync(apkPath)) {
        fs.unlinkSync(apkPath);
    }
    
    apkLibrary = apkLibrary.filter(a => a.id !== apkId);
    saveApkLibrary();
    
    res.json({ success: true, message: 'APK deleted successfully' });
});

// ============ DEVICE MANAGEMENT API ============

app.get('/api/devices', (req, res) => {
    res.json(Object.values(tablets));
});

app.get('/api/stats', (req, res) => {
    const total = Object.keys(tablets).length;
    const online = Object.values(tablets).filter(d => d.online).length;
    const offline = total - online;
    
    res.json({ 
        total, 
        online, 
        offline, 
        apkCount: apkLibrary.length,
        serverIP: getLocalIP(),
        adbExists: adbExists
    });
});

app.get('/api/scan', async (req, res) => {
    const count = await autoScanNetwork();
    res.json({ success: true, devicesFound: count, devices: Object.values(tablets) });
});

// Get device info via ADB (using port 5555)
app.post('/api/get-device-info/:deviceId', async (req, res) => {
    const device = tablets[req.params.deviceId];
    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }
    
    if (!adbExists) {
        return res.status(500).json({ error: 'ADB not available' });
    }
    
    try {
        const info = await getDeviceInfoAsync(device.ip);
        device.manufacturer = info.manufacturer;
        device.model = info.model;
        device.androidVersion = info.androidVersion;
        device.battery = info.battery;
        if (device.name === `Device-${device.ip.split('.').pop()}`) {
            device.name = info.displayName;
        }
        saveTablets();
        res.json({ success: true, deviceInfo: info });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/get-all-device-info', async (req, res) => {
    const results = [];
    for (let id in tablets) {
        if (tablets[id].online && adbExists) {
            try {
                const info = await getDeviceInfoAsync(tablets[id].ip);
                tablets[id].manufacturer = info.manufacturer;
                tablets[id].model = info.model;
                tablets[id].androidVersion = info.androidVersion;
                tablets[id].battery = info.battery;
                results.push({ id, ...info });
            } catch(e) {
                results.push({ id, error: e.message });
            }
        }
    }
    saveTablets();
    res.json({ success: true, devices: results });
});

// Helper to get device info using port 5555
function getDeviceInfoAsync(ip) {
    return new Promise((resolve, reject) => {
        const info = { manufacturer: 'Unknown', model: 'Unknown', deviceName: '', androidVersion: 'Unknown', battery: -1, displayName: 'Unknown' };
        
        // Try to connect on port 5555
        exec(`"${ADB_PATH}" connect ${ip}:5555`, (connectErr) => {
            if (connectErr) { 
                reject(new Error('Connection failed. Make sure tablet has ADB over WiFi enabled (run "adb tcpip 5555" via USB once).')); 
                return; 
            }
            
            exec(`"${ADB_PATH}" -s ${ip}:5555 shell getprop ro.product.manufacturer`, (err1, manufacturer) => {
                if (!err1) info.manufacturer = manufacturer.trim() || 'Unknown';
                
                exec(`"${ADB_PATH}" -s ${ip}:5555 shell getprop ro.product.model`, (err2, model) => {
                    if (!err2) info.model = model.trim() || 'Unknown';
                    
                    exec(`"${ADB_PATH}" -s ${ip}:5555 shell settings get global device_name`, (err3, deviceName) => {
                        if (!err3) info.deviceName = deviceName.trim() || '';
                        
                        exec(`"${ADB_PATH}" -s ${ip}:5555 shell getprop ro.build.version.release`, (err4, androidVersion) => {
                            if (!err4) info.androidVersion = androidVersion.trim() || 'Unknown';
                            
                            exec(`"${ADB_PATH}" -s ${ip}:5555 shell dumpsys battery | findstr level`, (err5, battery) => {
                                const match = battery.match(/level:\s*(\d+)/);
                                if (match) info.battery = parseInt(match[1]);
                                
                                info.displayName = info.deviceName || `${info.manufacturer} ${info.model}`;
                                if (info.displayName.trim() === 'Unknown Unknown') info.displayName = `Device at ${ip}`;
                                
                                exec(`"${ADB_PATH}" disconnect ${ip}:5555`);
                                resolve(info);
                            });
                        });
                    });
                });
            });
        });
    });
}

// ============ APP INSTALLATION API (using port 5555) ============

app.post('/api/install/:deviceId/:apkId', (req, res) => {
    const device = tablets[req.params.deviceId];
    const apk = apkLibrary.find(a => a.id === req.params.apkId);
    
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!apk) return res.status(404).json({ error: 'APK not found' });
    if (!device.online) return res.status(500).json({ error: 'Device offline' });
    
    const apkPath = path.join(__dirname, 'uploads', apk.filename);
    if (!fs.existsSync(apkPath)) {
        return res.status(500).json({ error: 'APK file not found' });
    }
    
    exec(`"${ADB_PATH}" connect ${device.ip}:5555`, (connectErr) => {
        if (connectErr) {
            return res.status(500).json({ error: 'Failed to connect to device. Make sure ADB over WiFi is enabled.' });
        }
        
        exec(`"${ADB_PATH}" -s ${device.ip}:5555 install -r "${apkPath}"`, (installErr, stdout, stderr) => {
            exec(`"${ADB_PATH}" disconnect ${device.ip}:5555`);
            
            if (installErr) {
                return res.status(500).json({ error: 'Installation failed: ' + (stderr || installErr.message) });
            }
            
            if (!device.installedApps) device.installedApps = {};
            device.installedApps[apk.id] = {
                name: apk.name,
                installedAt: new Date(),
                version: apk.version || '1.0'
            };
            saveTablets();
            
            res.json({ success: true, message: `${apk.name} installed successfully on ${device.name}` });
        });
    });
});

app.post('/api/install-multiple/:deviceId', async (req, res) => {
    const device = tablets[req.params.deviceId];
    const { apkIds } = req.body;
    
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.online) return res.status(500).json({ error: 'Device offline' });
    if (!apkIds || apkIds.length === 0) return res.status(400).json({ error: 'No APKs selected' });
    
    const results = { success: [], failed: [] };
    
    exec(`"${ADB_PATH}" connect ${device.ip}:5555`, async (connectErr) => {
        if (connectErr) {
            return res.status(500).json({ error: 'Failed to connect to device' });
        }
        
        for (const apkId of apkIds) {
            const apk = apkLibrary.find(a => a.id === apkId);
            if (!apk) {
                results.failed.push({ apkId, error: 'APK not found' });
                continue;
            }
            
            const apkPath = path.join(__dirname, 'uploads', apk.filename);
            if (!fs.existsSync(apkPath)) {
                results.failed.push({ apkId, error: 'File not found' });
                continue;
            }
            
            await new Promise((resolve) => {
                exec(`"${ADB_PATH}" -s ${device.ip}:5555 install -r "${apkPath}"`, (installErr) => {
                    if (installErr) {
                        results.failed.push({ apkId, name: apk.name, error: installErr.message });
                    } else {
                        results.success.push({ apkId, name: apk.name });
                        if (!device.installedApps) device.installedApps = {};
                        device.installedApps[apk.id] = {
                            name: apk.name,
                            installedAt: new Date(),
                            version: apk.version || '1.0'
                        };
                    }
                    resolve();
                });
            });
        }
        
        exec(`"${ADB_PATH}" disconnect ${device.ip}:5555`);
        saveTablets();
        res.json({ success: true, results });
    });
});

// Rename device
app.post('/api/rename/:deviceId', (req, res) => {
    const device = tablets[req.params.deviceId];
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    device.name = req.body.name;
    saveTablets();
    res.json({ success: true });
});

// Delete device
app.delete('/api/device/:deviceId', (req, res) => {
    delete tablets[req.params.deviceId];
    saveTablets();
    res.json({ success: true });
});

// Add tablet manually
app.post('/api/add-tablet', (req, res) => {
    const { ip, name } = req.body;
    
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }
    
    for (let id in tablets) {
        if (tablets[id].ip === ip) {
            return res.json({ success: true, device: tablets[id], message: 'Tablet already exists' });
        }
    }
    
    const newId = Date.now().toString();
    const newTablet = {
        id: newId,
        name: name || `Tablet-${Object.keys(tablets).length + 1}`,
        ip: ip,
        online: true,
        version: '1.0.0',
        manufacturer: 'Unknown',
        model: 'Unknown',
        androidVersion: 'Unknown',
        battery: -1,
        installedApps: {},
        lastSeen: new Date(),
        addedVia: 'manual'
    };
    
    tablets[newId] = newTablet;
    saveTablets();
    
    res.json({ success: true, device: newTablet, message: 'Tablet added successfully' });
});

// Get server info
app.get('/api/info', (req, res) => {
    res.json({
        localIP: getLocalIP(),
        port: 3000,
        tabletCount: Object.keys(tablets).length,
        apkCount: apkLibrary.length,
        adbExists: adbExists,
        serverTime: new Date()
    });
});

// Generate QR code for easy access to the web interface
app.get('/api/generate-qr', async (req, res) => {
    const serverIP = getLocalIP();
    const url = `http://${serverIP}:3000`;
    try {
        const qrCode = await QRCode.toDataURL(url);
        res.json({ success: true, qrCode, url });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ============ QR CODE GENERATION FOR ENROLL TAB ============

// Generate QR code for wireless ADB pairing
app.get('/api/generate-adb-qr', async (req, res) => {
    const serverIP = getLocalIP();
    const adbPairUrl = `http://${serverIP}:3000/wireless-pair`;
    
    try {
        const qrCode = await QRCode.toDataURL(adbPairUrl);
        res.json({ success: true, qrCode, url: adbPairUrl, serverIP });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Simple wireless pairing page (shown when tablet scans QR)
app.get('/wireless-pair', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Wireless ADB Pairing</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #0b1a2e 0%, #1a2a3a 100%); color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
                .container { background: #2a2e38; padding: 30px; border-radius: 16px; text-align: center; border: 2px solid #1cbea8; max-width: 500px; width: 100%; }
                h2 { color: #1cbea8; margin-bottom: 20px; }
                .step { background: #1c1f26; padding: 15px; margin: 15px 0; border-radius: 12px; text-align: left; border-left: 4px solid #1cbea8; }
                .step-number { color: #1cbea8; font-weight: bold; font-size: 1.2rem; margin-bottom: 8px; }
                .code-input { width: 100%; padding: 15px; margin: 15px 0; border-radius: 12px; border: 2px solid #1cbea8; background: #1c1f26; color: white; font-size: 1.5rem; text-align: center; letter-spacing: 8px; font-weight: bold; }
                button { background: #1cbea8; color: white; border: none; padding: 14px 28px; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: bold; width: 100%; margin-top: 15px; }
                button:hover { background: #159e8c; }
                .status { margin-top: 15px; padding: 10px; border-radius: 8px; }
                .success { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
                .error { background: rgba(244, 67, 54, 0.2); color: #f44336; }
                .info { background: rgba(33, 150, 243, 0.2); color: #2196f3; }
                .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #1cbea8; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px; vertical-align: middle; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .ip-display { background: #1c1f26; padding: 10px; border-radius: 8px; margin: 10px 0; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🔧 Wireless ADB Pairing</h2>
                <p>Connect this tablet to the management system</p>
                
                <div class="step">
                    <div class="step-number">Step 1</div>
                    <div>Go to <strong>Settings → Developer Options</strong></div>
                    <div style="font-size: 0.8rem; color: #888;">If hidden, tap Build Number 7 times in About Tablet</div>
                </div>
                
                <div class="step">
                    <div class="step-number">Step 2</div>
                    <div>Enable <strong>Wireless Debugging</strong></div>
                    <div style="font-size: 0.8rem; color: #888;">Toggle it ON</div>
                </div>
                
                <div class="step">
                    <div class="step-number">Step 3</div>
                    <div>Tap <strong>"Pair device with pairing code"</strong></div>
                    <div style="font-size: 0.8rem; color: #888;">A 6-digit code and IP address will appear</div>
                </div>
                
                <div class="step">
                    <div class="step-number">Step 4</div>
                    <div>Enter the 6-digit code below</div>
                    <input type="text" id="pairingCode" class="code-input" placeholder="000000" maxlength="6" inputmode="numeric">
                    <div id="ipStatus" class="ip-display">Detecting tablet IP...</div>
                    <button onclick="pairDevice()">🔗 Pair & Connect</button>
                </div>
                
                <div id="pairingStatus"></div>
                <div id="finalStatus"></div>
                
                <div class="step" style="background: rgba(28, 190, 168, 0.1); margin-top: 15px;">
                    <div class="step-number">💡 Need help?</div>
                    <div style="font-size: 0.8rem;">
                        • Make sure tablet and PC are on the SAME WiFi network<br>
                        • Wireless Debugging must be turned ON<br>
                        • If pairing fails, restart Wireless Debugging on tablet
                    </div>
                </div>
            </div>
            
            <script>
                let tabletIP = null;
                
                async function getTabletIP() {
                    try {
                        const pc = new RTCPeerConnection({ iceServers: [] });
                        pc.createDataChannel('');
                        pc.createOffer().then(offer => pc.setLocalDescription(offer));
                        return new Promise((resolve) => {
                            pc.onicecandidate = (event) => {
                                if (event && event.candidate && event.candidate.candidate) {
                                    const match = event.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                                    if (match) {
                                        const ip = match[0];
                                        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
                                            pc.close();
                                            resolve(ip);
                                        }
                                    }
                                }
                            };
                            setTimeout(() => { pc.close(); resolve(null); }, 3000);
                        });
                    } catch(e) { return null; }
                }
                
                async function detectIP() {
                    const ipStatus = document.getElementById('ipStatus');
                    tabletIP = await getTabletIP();
                    if (tabletIP) {
                        ipStatus.innerHTML = \`🌐 Detected Tablet IP: <strong>\${tabletIP}</strong>\`;
                        ipStatus.style.background = 'rgba(76, 175, 80, 0.2)';
                        ipStatus.style.color = '#4caf50';
                    } else {
                        ipStatus.innerHTML = '⚠️ Could not detect IP automatically.<br>Please enter manually: <input type="text" id="manualIP" placeholder="192.168.0.xxx" style="width:100%; margin-top:8px; padding:8px; border-radius:6px; background:#1c1f26; color:white; border:1px solid #1cbea8;">';
                    }
                }
                
                async function pairDevice() {
                    const pairingCode = document.getElementById('pairingCode').value.trim();
                    const statusDiv = document.getElementById('pairingStatus');
                    const pairBtn = event.target;
                    
                    let ip = tabletIP;
                    if (!ip) {
                        const manualIP = document.getElementById('manualIP');
                        if (manualIP) ip = manualIP.value.trim();
                    }
                    
                    if (!pairingCode || pairingCode.length !== 6) {
                        statusDiv.innerHTML = '<div class="status error">❌ Please enter a valid 6-digit pairing code from your tablet</div>';
                        return;
                    }
                    if (!ip) {
                        statusDiv.innerHTML = '<div class="status error">❌ Could not detect tablet IP. Please enter it manually.</div>';
                        return;
                    }
                    
                    pairBtn.disabled = true;
                    pairBtn.innerHTML = '<span class="spinner"></span> Pairing...';
                    statusDiv.innerHTML = '<div class="status info">⏳ Connecting to management server...</div>';
                    
                    try {
                        const response = await fetch('/api/wireless-pair-simple', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ip: ip, pairingCode: pairingCode })
                        });
                        const result = await response.json();
                        if (result.success) {
                            statusDiv.innerHTML = '<div class="status success">✅ Connected successfully!</div>';
                            document.getElementById('finalStatus').innerHTML = \`<div class="status success"><strong>✅ Tablet Enrolled Successfully!</strong><br>Your tablet is now connected to the management system.<br>You can close this page.</div>\`;
                            pairBtn.innerHTML = '✅ Connected!';
                            setTimeout(() => window.close(), 3000);
                        } else {
                            statusDiv.innerHTML = '<div class="status error">❌ ' + result.error + '</div>';
                            pairBtn.disabled = false;
                            pairBtn.innerHTML = '🔗 Try Again';
                        }
                    } catch (error) {
                        statusDiv.innerHTML = '<div class="status error">❌ Error: ' + error.message + '</div>';
                        pairBtn.disabled = false;
                        pairBtn.innerHTML = '🔗 Try Again';
                    }
                }
                
                document.getElementById('pairingCode').focus();
                detectIP();
            </script>
        </body>
        </html>
    `);
});

// Simple wireless pairing endpoint
app.post('/api/wireless-pair-simple', async (req, res) => {
    const { ip, pairingCode } = req.body;
    if (!ip || !pairingCode) return res.status(400).json({ error: 'IP and pairing code required' });
    
    let paired = false;
    const pairPorts = [33519, 33521, 33523, 33525];
    for (const port of pairPorts) {
        try {
            await new Promise((resolve, reject) => {
                exec(`"${ADB_PATH}" pair ${ip}:${port} ${pairingCode}`, (err, stdout) => {
                    if (!err && (stdout.includes('success') || stdout.includes('paired'))) { paired = true; resolve(); }
                    else reject();
                });
            });
            if (paired) break;
        } catch(e) {}
    }
    
    if (!paired) return res.status(500).json({ error: 'Pairing failed. Make sure Wireless Debugging is enabled.' });
    
    let connected = false;
    const connectPorts = [5555, 36713, 36715, 36717];
    for (const port of connectPorts) {
        try {
            await new Promise((resolve, reject) => {
                exec(`"${ADB_PATH}" connect ${ip}:${port}`, (err, stdout) => {
                    if (!err && stdout.includes('connected')) { connected = true; resolve(); }
                    else reject();
                });
            });
            if (connected) break;
        } catch(e) {}
    }
    
    if (connected) {
        let tabletExists = false;
        for (let id in tablets) {
            if (tablets[id].ip === ip) { tabletExists = true; tablets[id].online = true; tablets[id].lastSeen = new Date(); saveTablets(); break; }
        }
        if (!tabletExists) {
            const newId = Date.now().toString();
            tablets[newId] = { id: newId, name: `Tablet-${ip.split('.').pop()}`, ip: ip, online: true, version: '1.0.0', installedApps: {}, lastSeen: new Date(), addedVia: 'wireless' };
            saveTablets();
        }
        res.json({ success: true, message: 'Tablet connected and enrolled!' });
    } else {
        res.status(500).json({ error: 'Connection failed after pairing. Try again.' });
    }
});
// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('✅ Tablet Manager Server Running!');
    console.log('='.repeat(60));
    console.log(`📱 Open: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://${getLocalIP()}:${PORT}`);
    console.log('='.repeat(60));
    console.log('📋 Features:');
    console.log('   • Auto-discovery of tablets on network');
    console.log('   • Auto-enrollment');
    console.log('   • Multiple APK management');
    console.log('   • Install any app on any tablet');
    console.log('='.repeat(60));
    console.log('📍 ADB Path: ' + ADB_PATH);
    console.log('📍 ADB Available: ' + (adbExists ? 'YES' : 'NO'));
    console.log('='.repeat(60));
    console.log('');
    console.log('⚠️ IMPORTANT: For each tablet, do this ONCE via USB:');
    console.log(`   ${ADB_PATH} tcpip 5555`);
    console.log('');
    console.log('After that, tablets will connect automatically over WiFi!');
    console.log('='.repeat(60));
});