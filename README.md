# 📱 Tablet Management System

<div align="center">

![Version](https://img.shields.io/badge/version-2.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-green)
![Node](https://img.shields.io/badge/node-18%2B-brightgreen)
![License](https://img.shields.io/badge/license-MIT-orange)

**Complete Android Tablet Management Solution for Enterprises and Classrooms**

[📥 Download ZIP](https://github.com/scoroo/tablet-manager/archive/refs/heads/main.zip) •
[🌐 View on GitHub](https://github.com/scoroo/tablet-manager) •
[🐛 Report Issue](https://github.com/scoroo/tablet-manager/issues)

</div>

---

## ✨ Features

* 🔍 **Auto-Discovery** – Tablets appear automatically on your network
* 📦 **Multiple APK Management** – Upload and manage apps easily
* 🚀 **Bulk Installation** – Install apps on multiple tablets at once
* 📊 **Device Detection** – Model, Android version, battery status
* 📡 **Wireless ADB** – No USB after initial setup
* 🌐 **Offline Support** – Works without internet

---

## 📋 System Requirements

| Component  | Requirement           |
| ---------- | --------------------- |
| 💻 OS      | Windows 10 / 11       |
| 📦 Node.js | 18+                   |
| 🧠 RAM     | 4GB (8GB recommended) |
| 🌐 Network | WiFi / Ethernet       |
| 📱 Tablets | Android 11+           |

---

## 🚀 Quick Setup (5 Minutes)

### 1️⃣ Download & Install

```bash
git clone https://github.com/scoroo/tablet-manager.git
cd tablet-manager
npm install
```

---

### 2️⃣ Enable Tablet Debugging

* Go to **Settings → About Tablet**
* Tap **Build Number 7 times**
* Enable **Developer Options**
* Turn ON **USB Debugging**

---

### 3️⃣ Enable Wireless ADB

```bash
enable-wifi-adb.bat
```

---

### 4️⃣ Start Server

```bash
node server.js
```

Or double-click:

```
start.bat
```

Open browser:

```
http://localhost:3000
```

---

## 🎯 Usage

### 📤 Upload APK

* Open **APK Library**
* Drag & drop APK
* Click Upload

---

### 📱 Install on One Tablet

* Go to **Devices**
* Click Install
* Select APK

---

### 🚀 Bulk Install

* Open **Bulk Install**
* Select devices
* Select APKs
* Click Install

---

## 🔧 Batch Files

| File                | Purpose                       |
| ------------------- | ----------------------------- |
| start.bat           | Start server                  |
| enable-wifi-adb.bat | Enable WiFi ADB (single)      |
| enable-all-wifi.bat | Enable WiFi ADB (all devices) |
| connect-tablet.bat  | Connect via IP                |
| quick-setup.bat     | Full setup                    |

---

## 🛠 Troubleshooting

| Problem            | Solution                |
| ------------------ | ----------------------- |
| Tablet not showing | Wait or click Scan      |
| Detect failed      | Run setup again via USB |
| Device offline     | Check WiFi              |
| Connection refused | Run adb tcpip 5555      |
| Install failed     | Check APK compatibility |

---

### 🔄 Quick Fixes

* Restart Wireless Debugging
* Restart server
* Ensure same network
* Use proper USB cable

---

## 📁 Project Structure

```
tablet-manager/
├── server.js
├── package.json
├── start.bat
├── enable-wifi-adb.bat
├── enable-all-wifi.bat
├── connect-tablet.bat
├── quick-setup.bat
├── public/
│   └── index.html
├── uploads/
└── adb/
```

---

## 📄 License

MIT License – free for personal and commercial use.

---

## 🙏 Credits

Developed by **scoroo**

---

<div align="center">

⭐ Star this repo if it helped you!

Made with ❤️ for easy tablet management

</div>


