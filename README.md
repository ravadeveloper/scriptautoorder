# 🤖 ArtanBot

Bot Telegram untuk jual beli akun Telegram otomatis dengan deteksi OTP via MTProto.

---

## 🚀 Fitur

- **Multi-session MTProto** — banyak akun aktif sekaligus
- **Deteksi OTP Otomatis** — OTP dikirim ke pembeli tanpa manual
- **2FA Support** — akun dengan Two-Factor Authentication
- **Payment QRIS** — deposit via Tokoshop (scan QR Code)
- **Auto-konfirmasi Deposit** — polling otomatis setiap 30 detik
- **Database JSON** — tanpa setup MongoDB/PostgreSQL

---

## 📦 Instalasi

### 1. Clone & Install Dependencies

```bash
# Masuk ke folder bot
cd artanbot

# Install packages
npm install
```

### 2. Setup Environment

```bash
# Salin template config
cp .env.example .env

# Edit file .env
nano .env
```

Isi variabel berikut di `.env`:

| Variabel | Keterangan |
|----------|-----------|
| `BOT_TOKEN` | Token dari [@BotFather](https://t.me/BotFather) |
| `OWNER_ID` | Telegram User ID kamu (cek via [@userinfobot](https://t.me/userinfobot)) |
| `TOKOSHOP_API_KEY` | API Key dari dashboard ArtanShop |

### 3. Dapatkan API ID & API Hash

Untuk menambahkan akun Telegram, kamu butuh:
1. Buka https://my.telegram.org
2. Login dengan nomor kamu
3. Pilih **"API development tools"**
4. Buat app baru → catat **App api_id** dan **App api_hash**

> ⚠️ Setiap penjual/akun yang ditambahkan butuh API ID & Hash tersendiri.
> Bisa pakai API ID yang sama untuk semua akun (dari account kamu sendiri), tapi berisiko ban jika terlalu banyak.

### 4. Jalankan Bot

```bash
# Development
npm run dev

# Production (dengan PM2)
npm install -g pm2
pm2 start index.js --name artanbot
pm2 save
pm2 startup
```

---

## 🎮 Cara Pakai

### 👑 Sebagai Owner

Semua perintah owner bisa lewat **Owner Panel** atau command tersembunyi:

| Perintah | Fungsi |
|----------|--------|
| `/addaccount` | Tambah akun Telegram baru |
| `/addcategory` | Buat kategori produk |
| `/addtocategory` | Assign akun ke kategori |
| `/listaccounts` | Lihat semua akun |
| `/stats` | Statistik penjualan |

**Flow tambah akun:**
1. `/addaccount` → masukkan **API ID**
2. Masukkan **API Hash**
3. Masukkan **nomor HP** (+628xxx)
4. Bot kirim OTP → masukkan **kode OTP**
5. Jika ada 2FA → masukkan **password 2FA**
6. Masukkan **harga jual** (contoh: 50000)
7. Masukkan **ID unik** akun

### 👤 Sebagai User/Pembeli

1. `/start` → muncul menu utama
2. **📦 Kategori** → pilih kategori → pilih akun → klik **Beli**
3. Saldo dipotong, order dibuat
4. Bot otomatis kirim OTP saat diterima
5. Pantau di **📋 Orderanku** → **Check OTP**

---

## 🗂 Struktur File

```
artanbot/
├── index.js          # Bot utama + semua handler
├── db.js             # Database helper (JSON)
├── mtproto.js        # Session manager MTProto (gramjs)
├── payment.js        # ArtanShop payment gateway
├── package.json
├── .env              # Config (jangan di-commit!)
├── .env.example      # Template config
├── data/             # Database JSON (auto-dibuat)
│   ├── users.json
│   ├── accounts.json
│   ├── categories.json
│   ├── orders.json
│   └── transactions.json
└── temp_qr/          # QR Code sementara (auto-hapus 1 jam)
```

---

## 🔧 Troubleshooting

### Error import gramjs
Jika ada error pada import `telegram/sessions/index.js`:
```bash
# Coba downgrade gramjs
npm install telegram@2.22.2
```

### Error "SESSION_PASSWORD_NEEDED"
Normal! Artinya akun punya 2FA. Bot akan otomatis minta password.

### OTP tidak terdeteksi
- Pastikan sesi MTProto masih aktif (restart bot)
- Pastikan akun belum di-logout dari mana-mana
- Cek log: `pm2 logs artanbot`

### QR Code tidak muncul
- Cek `TOKOSHOP_API_KEY` di `.env`
- Pastikan folder `temp_qr/` bisa ditulis

---

## ⚠️ Penting

- Simpan file `data/*.json` dengan aman — berisi session string akun
- Jangan share `.env` ke siapapun
- Session string = akses penuh ke akun Telegram
- Backup folder `data/` secara berkala

---

## 📞 Tech Stack

- **Runtime**: Node.js 18+ (ES Modules)
- **Bot Framework**: [Telegraf](https://telegraf.js.org) v4
- **MTProto**: [GramJS](https://gram.js.org) (telegram npm)
- **Payment**: ArtanShop API
- **Database**: JSON files
- **QR Code**: qrcode npm
