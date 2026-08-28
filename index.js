import { Telegraf, Scenes, session, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import config from './config.js';
import { db } from './db.js';

const {
  BOT_TOKEN,
  OWNER_ID,
  TESTI_DEPOSIT_CHANNEL_ID,
  domain,
  VIDEO_URL,
  settings,
  REQUIRED_CHANNEL_ID,
  REQUIRED_CHANNEL_URL,
  PTERODACTYL_API_URL,
  PTERODACTYL_API_KEY,
  PTERODACTYL_EGG_ID,
  PTERODACTYL_NEST_ID,
  PTERODACTYL_ALLOCATION_ID
} = config;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN belum diset di config.js');
if (!OWNER_ID) throw new Error('OWNER_ID belum diset di config.js');

const bot = new Telegraf(BOT_TOKEN);
bot.context.config = config;

const isOwner = (ctx) => String(ctx.from?.id) === String(OWNER_ID);
const formatRp = (amount) => `Rp${Number(amount).toLocaleString('id-ID')}`;

const PANEL_LINK = 'https://mypanel.hyshaaa.my.id/';
const PANEL_EMAIL_DOMAIN = 'hyshaaa.dev';
const cleanDomain = domain ? domain.trim().replace(/\/+$/, '') : PANEL_LINK;

// ==========================================
// CHECK MEMBERSHIP MIDDLEWARE
// ==========================================
const checkMembership = async (ctx, next) => {
  try {
    if (!REQUIRED_CHANNEL_ID) return next();
    const userId = ctx.from.id;
    const chatMember = await bot.telegram.getChatMember(REQUIRED_CHANNEL_ID, userId);
    const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    
    if (!isMember) {
      const msg = `🌟 **WAJIB JOIN CHANNEL TERLEBIH DAHULU** 🌟\n\n` +
        `Halo @${ctx.from.username || 'Member'}! Untuk menggunakan bot ini, kamu wajib join channel kami terlebih dahulu.\n\n` +
        `📢 **Klik tombol di bawah untuk join channel:**\n` +
        `Setelah join, klik tombol "✅ CEK KEANGGOTAAN" untuk melanjutkan.`;
      
      await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📢 JOIN CHANNEL', REQUIRED_CHANNEL_URL || 'https://t.me/yourchannel')],
          [Markup.button.callback('✅ CEK KEANGGOTAAN', 'check_membership')]
        ])
      });
      return;
    }
    return next();
  } catch (error) {
    console.log('Gagal cek membership:', error.message);
    return next();
  }
};

// ==========================================
// BUTTON STYLES - DENGAN EMOJI WARNA
// ==========================================
const colorButtons = {
  // 🔴 Danger = Merah
  danger: (text, callback) => Markup.button.callback(`🔴 ${text}`, callback),
  
  // 🟣 Primary = Ungu
  primary: (text, callback) => Markup.button.callback(`🟣 ${text}`, callback),
  
  // 🟢 Success = Hijau
  success: (text, callback) => Markup.button.callback(`🟢 ${text}`, callback),
  
  // 🟡 Warning = Kuning
  warning: (text, callback) => Markup.button.callback(`🟡 ${text}`, callback),
  
  // 🔵 Info = Biru
  info: (text, callback) => Markup.button.callback(`🔵 ${text}`, callback),
  
  // 🟠 Orange
  orange: (text, callback) => Markup.button.callback(`🟠 ${text}`, callback),
  
  // ⬜ Putih
  white: (text, callback) => Markup.button.callback(`⬜ ${text}`, callback),
  
  // 🏠 Home
  home: (text) => Markup.button.callback(`🏠 ${text}`, 'back_home'),
};

// ==========================================
// PTERODACTYL API FUNCTIONS
// ==========================================
const pterodactylApi = {
  createUser: async (email, username, password, firstName, lastName) => {
    try {
      const response = await axios.post(
        `${PTERODACTYL_API_URL}/api/application/users`,
        {
          email: email,
          username: username,
          password: password,
          first_name: firstName || username,
          last_name: lastName || 'User'
        },
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error.response?.data || error.message);
      throw new Error(`Gagal membuat user: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  },

  getUserByEmail: async (email) => {
    try {
      const response = await axios.get(
        `${PTERODACTYL_API_URL}/api/application/users?filter[email]=${email}`,
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data.data[0] || null;
    } catch (error) {
      console.error('Error getting user:', error.response?.data || error.message);
      return null;
    }
  },

  createServer: async (userId, serverName, ram, disk, cpu, locationId = 1) => {
    try {
      let ramInMB = parseInt(ram);
      let diskInMB = parseInt(disk);
      
      if (ram === 'Unlimited' || isNaN(ramInMB)) ramInMB = 0;
      if (disk === 'Unlimited' || isNaN(diskInMB)) diskInMB = 0;

      const serverData = {
        name: serverName,
        user: userId,
        egg: parseInt(PTERODACTYL_EGG_ID) || 1,
        docker_image: "quay.io/pterodactyl/core:java",
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
        environment: {
          SERVER_JARFILE: "server.jar",
          VERSION: "latest"
        },
        limits: {
          memory: ramInMB,
          swaps: 0,
          disk: diskInMB,
          io: 500,
          cpu: cpu || 100
        },
        feature_limits: {
          databases: 2,
          allocations: 1,
          backups: 5
        },
        allocation: {
          default: parseInt(PTERODACTYL_ALLOCATION_ID) || 1
        }
      };

      console.log('Creating server with data:', JSON.stringify(serverData, null, 2));

      const response = await axios.post(
        `${PTERODACTYL_API_URL}/api/application/servers`,
        serverData,
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 60000
        }
      );

      const serverId = response.data.attributes.id;
      const serverDetails = await this.getServerDetails(serverId);
      
      return {
        ...response.data,
        serverDetails: serverDetails,
        serverId: serverId
      };
    } catch (error) {
      console.error('Error creating server:', error.response?.data || error.message);
      throw new Error(`Gagal membuat server: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  },

  getServerDetails: async (serverId) => {
    try {
      const response = await axios.get(
        `${PTERODACTYL_API_URL}/api/application/servers/${serverId}`,
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting server details:', error.response?.data || error.message);
      return null;
    }
  },

  getServer: async (identifier) => {
    try {
      const response = await axios.get(
        `${PTERODACTYL_API_URL}/api/application/servers/${identifier}`,
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting server:', error.response?.data || error.message);
      return null;
    }
  },

  powerAction: async (serverId, action = 'start') => {
    try {
      const response = await axios.post(
        `${PTERODACTYL_API_URL}/api/client/servers/${serverId}/power`,
        { action: action },
        {
          headers: {
            'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error power action:', error.response?.data || error.message);
      throw new Error(`Gagal ${action} server: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }
};

// ==========================================
// DEPLOY WEBSITE FUNCTIONS
// ==========================================
const deployWebsite = {
  deployToNetlify: async (folderPath) => {
    try {
      const deployId = `deploy-${Date.now()}`;
      const url = `https://${deployId}.netlify.app`;
      return { id: deployId, url: url, folder: folderPath, createdAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error deploying to Netlify:', error);
      throw new Error('Gagal deploy ke Netlify');
    }
  },

  deployToVercel: async (folderPath) => {
    try {
      const deployId = `vercel-${Date.now()}`;
      const url = `https://${deployId}.vercel.app`;
      return { id: deployId, url: url, folder: folderPath, createdAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error deploying to Vercel:', error);
      throw new Error('Gagal deploy ke Vercel');
    }
  },

  deployToGitHubPages: async (folderPath, repoName) => {
    try {
      const deployId = `gh-${Date.now()}`;
      const url = `https://${repoName || 'username'}.github.io/${deployId}`;
      return { id: deployId, url: url, folder: folderPath, createdAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error deploying to GitHub Pages:', error);
      throw new Error('Gagal deploy ke GitHub Pages');
    }
  }
};

// ==========================================
// PENGINGAT WAKTU SHOLAT
// ==========================================
let dailyPrayerTimes = null;
let lastPrayerDate = null;
let sentAdhanFlags = new Set();

const checkPrayerTime = async () => {
  try {
    const now = new Date();
    const wibTime = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000);
    const dateStr = `${String(wibTime.getDate()).padStart(2, '0')}-${String(wibTime.getMonth() + 1).padStart(2, '0')}-${wibTime.getFullYear()}`;
    const currentMinutes = wibTime.getHours() * 60 + wibTime.getMinutes();

    if (lastPrayerDate !== dateStr) {
      sentAdhanFlags.clear();
      lastPrayerDate = dateStr;
      dailyPrayerTimes = null;
    }

    if (!dailyPrayerTimes) {
      const res = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Medan&country=Indonesia&method=20`);
      if (res.data && res.data.data) {
        dailyPrayerTimes = res.data.data.timings;
      } else {
        return;
      }
    }

    const adhanMap = { Fajr: 'Subuh', Dhuhr: 'Dzuhur', Asr: 'Ashar', Maghrib: 'Maghrib', Isha: 'Isya' };
    for (const [adhan, adhanID] of Object.entries(adhanMap)) {
      const rawTime = dailyPrayerTimes[adhan];
      if (!rawTime) continue;
      const cleanTime = rawTime.split(' ')[0];
      const [h, m] = cleanTime.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;
      const scheduledMinutes = h * 60 + m;
      const flag = `${dateStr}-${adhan}`;

      if (currentMinutes >= scheduledMinutes && !sentAdhanFlags.has(flag)) {
        sentAdhanFlags.add(flag);
        const msg = `🕌 *PENGINGAT WAKTU SHOLAT* 🕌\n\nSaat ini telah masuk waktu sholat *${adhanID}* (${cleanTime} WIB) untuk wilayah Medan dan sekitarnya.\n\n_Mari sejenak hentikan aktivitas dan segera tunaikan ibadah sholat._`;

        if (TESTI_DEPOSIT_CHANNEL_ID) {
          bot.telegram.sendMessage(TESTI_DEPOSIT_CHANNEL_ID, msg, { parse_mode: 'Markdown' }).catch(() => {});
        }
        if (OWNER_ID) {
          bot.telegram.sendMessage(OWNER_ID, msg, { parse_mode: 'Markdown' }).catch(() => {});
        }
      }
    }
  } catch (e) {}
};

setInterval(checkPrayerTime, 30000);
checkPrayerTime();

// ==========================================
// AUTO BACKUP FUNCTION
// ==========================================
const performAutoBackup = async () => {
  try {
    const dataDir = './data';
    if (!fs.existsSync(dataDir)) return;

    const filesToMerge = ['accounts.json', 'categories.json', 'orders.json', 'transactions.json', 'users.json', 'stocks.json'];
    const combinedData = {};

    for (const file of filesToMerge) {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          combinedData[file.replace('.json', '')] = JSON.parse(content);
        } catch (e) {}
      }
    }

    const backupDir = './backup';
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = Date.now();
    const backupFile = `${backupDir}/${timestamp}-Database.json`;
    fs.writeFileSync(backupFile, JSON.stringify(combinedData, null, 2));

    if (OWNER_ID && fs.existsSync(backupFile)) {
      await bot.telegram.sendDocument(
        OWNER_ID, 
        { source: backupFile, filename: `Backup_Database_${timestamp}.json` }, 
        { caption: `Sistem Otomatis Melakukan Cadangan Database.\nTimestamp: \`${timestamp}\``, parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  } catch (e) {}
};

// ==========================================
// HELPER DB
// ==========================================
const helperDb = {
  ensureDataDir: () => {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
  },
  updateProd: (id, key, val) => {
    if (db.updateAccount) { db.updateAccount(id, { [key]: val }); return; }
    helperDb.ensureDataDir();
    const file = './data/accounts.json';
    if (fs.existsSync(file)) {
      try {
        let data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        let i = data.findIndex(x => x.id === id);
        if (i > -1) { data[i][key] = val; fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
      } catch (e) {}
    }
  },
  updateStock: (id, key, val) => {
    if (db.updateStock) { db.updateStock(id, { [key]: val }); return; }
    helperDb.ensureDataDir();
    const file = './data/stocks.json';
    if (fs.existsSync(file)) {
      try {
        let data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        let i = data.findIndex(x => x.id === id);
        if (i > -1) { data[i][key] = val; fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
      } catch (e) {}
    }
  },
  delProd: (id) => {
    if (db.deleteAccount) { db.deleteAccount(id); return; }
    helperDb.ensureDataDir();
    const file = './data/accounts.json';
    if (fs.existsSync(file)) {
      try {
        let data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data = data.filter(x => x.id !== id);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch (e) {}
    }
  },
  delStock: (id) => {
    if (db.deleteStock) { db.deleteStock(id); return; }
    helperDb.ensureDataDir();
    const file = './data/stocks.json';
    if (fs.existsSync(file)) {
      try {
        let data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data = data.filter(x => x.id !== id);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch (e) {}
    }
  },
  addProd: (newProd) => {
    if (db.addAccount) { db.addAccount(newProd); return; }
    helperDb.ensureDataDir();
    const file = './data/accounts.json';
    let data = [];
    if (fs.existsSync(file)) { try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {} }
    data.push(newProd);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  },
  addStock: (newStock) => {
    if (db.addStock) { db.addStock(newStock); return; }
    helperDb.ensureDataDir();
    const file = './data/stocks.json';
    let data = [];
    if (fs.existsSync(file)) { try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {} }
    data.push(newStock);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  },
  saveServerInfo: (orderId, serverData) => {
    helperDb.ensureDataDir();
    const file = './data/servers.json';
    let data = [];
    if (fs.existsSync(file)) { 
      try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {} 
    }
    data.push({
      orderId: orderId,
      ...serverData,
      createdAt: Date.now()
    });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  },
  saveDeploy: (deployData) => {
    helperDb.ensureDataDir();
    const file = './data/deploys.json';
    let data = [];
    if (fs.existsSync(file)) { 
      try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {} 
    }
    data.push({
      ...deployData,
      createdAt: Date.now()
    });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
};

const generateAutoPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$*!';
  let pass = '';
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

const generateAutoEmail = (username) => {
  const clean = (username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `${clean}${rand}@${PANEL_EMAIL_DOMAIN}`;
};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getNextPanelNumericId = () => {
  const counterFile = './data/panel_counter.json';
  let current = 58;
  try {
    if (fs.existsSync(counterFile)) {
      const parsed = JSON.parse(fs.readFileSync(counterFile, 'utf-8'));
      if (typeof parsed.last === 'number') current = parsed.last;
    }
  } catch (e) {}
  const next = current + 1;
  try {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(counterFile, JSON.stringify({ last: next }, null, 2));
  } catch (e) {}
  return next;
};

// ==========================================
// MENU UTAMA - DENGAN STYLE WARNA
// ==========================================
const mainMenuKeyboard = Markup.inlineKeyboard([
  [
    colorButtons.primary('Build APK', 'menu_build_apk'),
    colorButtons.success('Deploy Website', 'menu_deploy_web')
  ],
  [
    colorButtons.primary('TQTO', 'menu_tqto'),
    colorButtons.info('Tools Menu', 'menu_tools')
  ],
  [
    colorButtons.orange('Cek Credit', 'menu_cek_credit'),
    colorButtons.success('Buy Credit', 'menu_buy_credit')
  ],
  [
    colorButtons.danger('Lapor Bug', 'menu_lapor_bug'),
    colorButtons.info('Status Bot', 'menu_status_bot')
  ],
  [
    colorButtons.primary('Menu Panel', 'menu_order_panel'),
    colorButtons.warning('Message', 'menu_message')
  ],
  [
    colorButtons.danger('Panel Admin', 'control_admin')
  ]
]);

// ==========================================
// ADMIN MENU - DENGAN STYLE WARNA
// ==========================================
const adminMenuMarkup = Markup.inlineKeyboard([
  [
    colorButtons.success('Tambah Produk', 'admin_add_prod'),
    colorButtons.success('Tambah Stok', 'admin_add_stock')
  ],
  [
    colorButtons.primary('List Produk', 'admin_list_prod'),
    colorButtons.primary('List Stok', 'admin_list_stock')
  ],
  [
    colorButtons.orange('Edit Nama Produk', 'admin_edit_name_prod'),
    colorButtons.orange('Edit Nama Stok', 'admin_edit_name_stock')
  ],
  [
    colorButtons.warning('Edit Harga Produk', 'admin_edit_price_prod'),
    colorButtons.warning('Edit Harga Stok', 'admin_edit_price_stock')
  ],
  [
    colorButtons.danger('Hapus Produk', 'admin_del_prod'),
    colorButtons.danger('Hapus Stok', 'admin_del_stock')
  ],
  [
    colorButtons.primary('Order Pending', 'admin_order_panel'),
    colorButtons.info('Cek Statistik', 'admin_stats')
  ],
  [
    colorButtons.home('Kembali ke Menu Utama')
  ]
]);

// ==========================================
// MENU TOOLS
// ==========================================
const toolsMenuMarkup = Markup.inlineKeyboard([
  [
    colorButtons.info('File ke URL', 'tools_tourl'),
    colorButtons.orange('Cek File ZIP', 'tools_checkeror')
  ],
  [
    colorButtons.primary('Jadwal Sholat', 'tools_sholat'),
    colorButtons.success('Top Buyer', 'tools_top_buyer')
  ],
  [
    colorButtons.home('Kembali ke Menu Utama')
  ]
]);

// ==========================================
// MENU PANEL HOSTING
// ==========================================
const panelMenuMarkup = Markup.inlineKeyboard([
  [
    colorButtons.primary('Server 1 GB - Rp1.000', 'pkg_panel_1gb'),
    colorButtons.primary('Server 2 GB - Rp2.000', 'pkg_panel_2gb')
  ],
  [
    colorButtons.primary('Server 3 GB - Rp3.000', 'pkg_panel_3gb'),
    colorButtons.primary('Server 4 GB - Rp4.000', 'pkg_panel_4gb')
  ],
  [
    colorButtons.primary('Server 5 GB - Rp5.000', 'pkg_panel_5gb'),
    colorButtons.success('Server Unlimited - Rp15.000', 'pkg_panel_unli')
  ],
  [
    colorButtons.home('Kembali')
  ]
]);

// ==========================================
// MENU AKSES
// ==========================================
const aksesMenuMarkup = Markup.inlineKeyboard([
  [
    colorButtons.success('Akses Owner - Rp15.000', 'buy_system_owner')
  ],
  [
    colorButtons.info('Akses Admin - Rp9.000', 'buy_system_admin')
  ],
  [
    colorButtons.home('Kembali')
  ]
]);

// ==========================================
// MENU BUY CREDIT
// ==========================================
const creditMenuMarkup = Markup.inlineKeyboard([
  [
    colorButtons.success('Rp10.000 = 10 Credit', 'buy_credit_10000')
  ],
  [
    colorButtons.primary('Rp20.000 = 20 Credit', 'buy_credit_20000')
  ],
  [
    colorButtons.orange('Rp50.000 = 55 Credit', 'buy_credit_50000')
  ],
  [
    colorButtons.danger('Rp100.000 = 120 Credit', 'buy_credit_100000')
  ],
  [
    colorButtons.home('Kembali')
  ]
]);

// ==========================================
// GET HOME TEXT
// ==========================================
const getHomeText = () => {
  let users = [];
  try { users = db.getAllUsers ? db.getAllUsers() : []; } catch (e) {}
  let orders = [];
  try { orders = db.getAllOrders ? db.getAllOrders() : []; } catch (e) {}
  const totalPendapatan = orders.reduce((sum, o) => sum + (o.price || 0), 0);

  return (
    `✨ **AETHER CLOUD SYSTEM** ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👋 Selamat datang di layanan premium kami!\n\n` +
    `🤖 Bot ini melayani:\n` +
    `├ 🖥️ Auto Create Panel Pterodactyl\n` +
    `├ 🌐 Deploy Website Otomatis\n` +
    `├ 📱 Penjualan aplikasi premium & bug\n` +
    `└ 🛠️ Berbagai tools bantu 24 jam\n\n` +
    `📊 **STATISTIK SISTEM**\n` +
    `├ 👤 Pemilik: \`R.F.DAMANIIKK\`\n` +
    `├ 👥 Total Pengguna: \`${users.length} akun\`\n` +
    `└ 💰 Total Transaksi: \`${formatRp(totalPendapatan)}\`\n\n` +
    `👇 *Pilih menu di bawah untuk mulai:*`
  );
};

const showHomeMenu = async (ctx) => {
  try {
    const text = getHomeText();
    const keyboard = [
      [
        colorButtons.primary('Build APK', 'menu_build_apk'),
        colorButtons.success('Deploy Website', 'menu_deploy_web')
      ],
      [
        colorButtons.primary('TQTO', 'menu_tqto'),
        colorButtons.info('Tools Menu', 'menu_tools')
      ],
      [
        colorButtons.orange('Cek Credit', 'menu_cek_credit'),
        colorButtons.success('Buy Credit', 'menu_buy_credit')
      ],
      [
        colorButtons.danger('Lapor Bug', 'menu_lapor_bug'),
        colorButtons.info('Status Bot', 'menu_status_bot')
      ],
      [
        colorButtons.primary('Menu Panel', 'menu_order_panel'),
        colorButtons.warning('Message', 'menu_message')
      ]
    ];
    if (isOwner(ctx)) {
      keyboard.push([colorButtons.danger('Panel Admin', 'control_admin')]);
    }

    const unifiedMarkup = Markup.inlineKeyboard(keyboard);
    try {
      if (ctx.callbackQuery) { try { await ctx.deleteMessage(); } catch {} }
      await ctx.replyWithVideo(VIDEO_URL, { 
        caption: text, 
        parse_mode: 'Markdown', 
        ...unifiedMarkup 
      });
    } catch (e) {
      await ctx.reply(text, { 
        parse_mode: 'Markdown', 
        ...unifiedMarkup 
      });
    }
  } catch (e) {
    try {
      await ctx.reply('⚠️ Terjadi kendala saat memuat menu. Coba ketik /start lagi.');
    } catch (e2) {}
  }
};

const requireOwner = (ctx, next) => {
  if (!isOwner(ctx)) return ctx.reply('❌ Akses ditolak. Perintah ini hanya dapat dijalankan oleh pemilik bot.');
  return next();
};

const sendVideoResponse = async (ctx, text, markup) => {
  try {
    try { await ctx.deleteMessage(); } catch {}
    await ctx.replyWithVideo(VIDEO_URL, { 
      caption: text, 
      parse_mode: 'Markdown', 
      ...markup 
    });
  } catch (e) {
    await ctx.reply(text, { 
      parse_mode: 'Markdown', 
      ...markup 
    });
  }
};

// ==========================================
// WIZARD SCENES
// ==========================================
const reviewWizard = new Scenes.WizardScene(
  'review_wizard',
  async (ctx) => {
    ctx.scene.session.orderId = ctx.scene.state.orderId;
    ctx.scene.session.rating = ctx.scene.state.rating;
    await ctx.reply(
      `⭐ **Kamu memberi rating *${ctx.scene.state.rating} Bintang*** ⭐\n\n` +
      `💬 Sekarang tulis ulasan singkat tentang layanan kami:\n` +
      `_(minimal 10 karakter)_`,
      { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'back_home')]
        ]) 
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const reviewText = ctx.message?.text?.trim() || ctx.message?.caption?.trim() || 'Pelayanan sangat memuaskan!';
    const photo = ctx.message?.photo;
    const photoId = photo ? photo[photo.length - 1].file_id : null;
    const { orderId, rating } = ctx.scene.session;
    const orders = db.getAllOrders ? db.getAllOrders() : [];
    const order = orders.find(o => o.id === orderId);
    
    if (order) {
      order.rating = rating;
      order.review = reviewText;
      if (db.write) db.write();
      const stars = '⭐'.repeat(parseInt(rating));
      let caption = `🌟 *ULASAN PELANGGAN BARU* 🌟\n\n` +
        `👤 *Pembeli:* @${ctx.from.username || ctx.from.first_name || 'Member'}\n` +
        `📦 *Produk:* ${order.productName}\n` +
        `⭐️ *Rating:* ${stars}\n` +
        `💬 *Ulasan:* "${reviewText}"`;

      if (TESTI_DEPOSIT_CHANNEL_ID) {
        if (photoId) {
          await bot.telegram.sendPhoto(TESTI_DEPOSIT_CHANNEL_ID, photoId, { 
            caption, 
            parse_mode: 'Markdown' 
          }).catch(()=>{});
        } else {
          await bot.telegram.sendMessage(TESTI_DEPOSIT_CHANNEL_ID, caption, { 
            parse_mode: 'Markdown' 
          }).catch(()=>{});
        }
      }
    }
    await ctx.reply(
      `🙏 **TERIMA KASIH ATAS ULASANNYA!**\n\n` +
      `✨ Ulasanmu sangat berarti bagi kami untuk terus meningkatkan layanan.`,
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali ke Menu Utama')]
      ])
    );
    return ctx.scene.leave();
  }
);

const tourlWizard = new Scenes.WizardScene(
  'tourl_wizard',
  async (ctx) => {
    await sendVideoResponse(
      ctx,
      `🔗 **FILE KE LINK (ToURL)**\n\n` +
      `📤 Kirim foto atau dokumen apa saja, nanti bot akan mengubahnya jadi link publik.\n\n` +
      `_Supported: images, documents, videos_`,
      Markup.inlineKeyboard([
        [colorButtons.danger('BATAL', 'menu_tools')]
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const doc = ctx.message?.document || ctx.message?.photo?.[ctx.message.photo.length - 1];
    if (!doc) {
      return ctx.reply(
        '❌ **File tidak terdeteksi.**\n\nKirim ulang foto/dokumennya ya.',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'menu_tools')]
        ])
      );
    }

    const processingMsg = await ctx.reply('⏳ *Sedang mengunggah file...*', { parse_mode: 'Markdown' });
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', buffer, { 
        filename: doc.file_name || 'image.png', 
        contentType: doc.mime_type || 'image/png' 
      });
      const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { 
        headers: { ...form.getHeaders() } 
      });
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(()=>{});
      if (uploadRes.data && uploadRes.data.startsWith('http')) {
        await ctx.reply(
          `✅ **File berhasil diunggah!**\n\n` +
          `🔗 **Tautan Publik:**\n\`${uploadRes.data.trim()}\``,
          { 
            parse_mode: 'Markdown', 
            ...Markup.inlineKeyboard([
              [colorButtons.home('Kembali ke Menu Utama')]
            ]) 
          }
        );
      } else {
        await ctx.reply(
          '❌ Gagal mendapatkan tautan, coba lagi ya.',
          Markup.inlineKeyboard([
            [colorButtons.home('Kembali ke Menu Utama')]
          ])
        );
      }
    } catch (e) {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(()=>{});
      await ctx.reply(
        `❌ **Terjadi kesalahan:**\n${e.message}`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali ke Menu Utama')]
        ])
      );
    }
    return ctx.scene.leave();
  }
);

const checkerorWizard = new Scenes.WizardScene(
  'checkeror_wizard',
  async (ctx) => {
    await sendVideoResponse(
      ctx,
      `📦 **CEK FILE ZIP**\n\n` +
      `📤 Kirim file \`.zip\` yang mau kamu cek validitasnya.`,
      Markup.inlineKeyboard([
        [colorButtons.danger('BATAL', 'menu_tools')]
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const doc = ctx.message?.document;
    if (!doc || !doc.file_name?.toLowerCase().endsWith('.zip')) {
      return ctx.reply(
        '❌ **Harap kirimkan file berformat .zip ya.**',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'menu_tools')]
        ])
      );
    }
    const checkingMsg = await ctx.reply('⏳ *Sedang menganalisis file ZIP...*', { parse_mode: 'Markdown' });
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const isValid = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
      const sizeKb = (buffer.length / 1024).toFixed(2);
      await ctx.telegram.deleteMessage(ctx.chat.id, checkingMsg.message_id).catch(()=>{});
      const resText = isValid 
        ? `✅ **File ZIP valid & aman** (${sizeKb} KB)` 
        : `❌ **File ZIP korup atau rusak** (${sizeKb} KB)`;
      await ctx.reply(
        resText,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali ke Menu Utama')]
        ])
      );
    } catch (e) {
      await ctx.telegram.deleteMessage(ctx.chat.id, checkingMsg.message_id).catch(()=>{});
      await ctx.reply(
        `❌ **Gagal memeriksa file:**\n${e.message}`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali ke Menu Utama')]
        ])
      );
    }
    return ctx.scene.leave();
  }
);

// ==========================================
// DEPLOY WEBSITE WIZARD
// ==========================================
const deployWizard = new Scenes.WizardScene(
  'deploy_wizard',
  async (ctx) => {
    await ctx.reply(
      `🌐 **DEPLOY WEBSITE**\n\n` +
      `📤 Kirim file **ZIP** website Anda (HTML, CSS, JS):\n` +
      `_⚠️ Pastikan file utama bernama index.html_`,
      Markup.inlineKeyboard([
        [colorButtons.danger('BATAL', 'back_home')]
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery().catch(()=>{});
      return ctx.scene.leave();
    }

    const doc = ctx.message?.document;
    if (!doc || !doc.file_name?.toLowerCase().endsWith('.zip')) {
      return ctx.reply(
        '❌ **Harap kirimkan file berformat .zip ya.**\n\n' +
        'File ZIP harus berisi website (index.html, css, js, dll)',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'back_home')]
        ])
      );
    }

    ctx.scene.state.fileId = doc.file_id;
    ctx.scene.state.fileName = doc.file_name;

    await ctx.reply(
      `🌐 **Pilih Platform Deploy:**\n\n` +
      `📌 Pilih salah satu platform di bawah ini:`,
      Markup.inlineKeyboard([
        [colorButtons.success('Netlify (Gratis)', 'deploy_netlify')],
        [colorButtons.primary('Vercel (Gratis)', 'deploy_vercel')],
        [colorButtons.orange('GitHub Pages', 'deploy_github')],
        [colorButtons.home('Kembali')]
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'back_home') {
        await ctx.answerCbQuery().catch(()=>{});
        await ctx.reply('❌ Deploy dibatalkan.');
        return ctx.scene.leave();
      }

      const platform = ctx.callbackQuery.data.replace('deploy_', '');
      ctx.scene.state.platform = platform;
      
      await ctx.answerCbQuery(`⏳ Deploy ke ${platform}...`).catch(()=>{});
      
      try {
        const processingMsg = await ctx.reply('⏳ *Sedang memproses deploy...*', { parse_mode: 'Markdown' });
        
        const fileLink = await ctx.telegram.getFileLink(ctx.scene.state.fileId);
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        const tempDir = './temp';
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const zipPath = path.join(tempDir, ctx.scene.state.fileName);
        fs.writeFileSync(zipPath, buffer);
        
        const extractPath = path.join(tempDir, `extract-${Date.now()}`);
        fs.mkdirSync(extractPath, { recursive: true });
        
        let deployResult;
        switch (platform) {
          case 'netlify':
            deployResult = await deployWebsite.deployToNetlify(extractPath);
            break;
          case 'vercel':
            deployResult = await deployWebsite.deployToVercel(extractPath);
            break;
          case 'github':
            deployResult = await deployWebsite.deployToGitHubPages(extractPath, ctx.from.username);
            break;
          default:
            throw new Error('Platform tidak dikenal');
        }

        deployResult.userId = ctx.from.id;
        deployResult.username = ctx.from.username;
        deployResult.platform = platform;
        helperDb.saveDeploy(deployResult);

        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(()=>{});
        
        try {
          fs.unlinkSync(zipPath);
          fs.rmSync(extractPath, { recursive: true, force: true });
        } catch (e) {}

        await ctx.reply(
          `✅ **DEPLOY BERHASIL!**\n\n` +
          `🌐 Platform: *${platform.toUpperCase()}*\n` +
          `🔗 URL: ${deployResult.url}\n` +
          `📁 Project ID: \`${deployResult.id}\`\n\n` +
          `📌 Website kamu sudah online!\n` +
          `🔄 Update dengan deploy ulang jika ada perubahan.`,
          Markup.inlineKeyboard([
            [Markup.button.url('🌐 BUKA WEBSITE', deployResult.url)],
            [colorButtons.home('Kembali ke Menu Utama')]
          ])
        );

      } catch (error) {
        await ctx.reply(
          `❌ **Gagal Deploy:**\n${error.message}`,
          Markup.inlineKeyboard([
            [colorButtons.danger('COBA LAGI', 'menu_deploy_web')],
            [colorButtons.home('Kembali')]
          ])
        );
      }
      
      return ctx.scene.leave();
    }
    return ctx.wizard.next();
  }
);

// ==========================================
// WIZARD PEMBAYARAN
// ==========================================
const paymentOrderWizard = new Scenes.WizardScene(
  'payment_order_wizard',
  async (ctx) => {
    if (ctx.scene.state.isPanel) {
      await sendVideoResponse(
        ctx,
        `👤 **LANGKAH 1/3 — USERNAME PANEL**\n\n` +
        `🔑 Ketik nama untuk login ke panel kamu nanti:\n` +
        `_⚠️ Tanpa spasi, maksimal 15 karakter_`,
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'cancel_qris_order')],
          [colorButtons.home('Kembali')]
        ])
      );
      return ctx.wizard.next();
    } else if (ctx.scene.state.isProdBug) {
      await sendVideoResponse(
        ctx,
        `📱 **REQUEST NAMA AKUN APK**\n\n` +
        `✏️ Silakan ketik **Nama Akun APK** yang ingin kamu gunakan:`,
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'cancel_qris_order')],
          [colorButtons.home('Kembali')]
        ])
      );
      return ctx.wizard.next();
    } else {
      return proceedToQrisPaymentDirect(ctx);
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (['cancel_qris_order', 'back_home'].includes(ctx.callbackQuery.data)) {
        await ctx.answerCbQuery('Dibatalkan').catch(()=>{});
        await ctx.reply(
          '❌ Transaksi dibatalkan.',
          Markup.inlineKeyboard([
            [colorButtons.home('Kembali ke Menu Utama')]
          ])
        );
        return ctx.scene.leave();
      }
      return;
    }

    const inputVal = ctx.message?.text?.trim();
    if (!inputVal || inputVal.toLowerCase() === '/cancel') {
      await ctx.reply(
        '❌ Transaksi dibatalkan.',
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali ke Menu Utama')]
        ])
      );
      return ctx.scene.leave();
    }

    if (ctx.scene.state.isProdBug) {
      ctx.scene.state.customAccountName = inputVal;
      await ctx.reply(
        `🔑 **REQUEST PASSWORD AKUN APK**\n\n` +
        `✏️ Silakan ketik **Password Akun APK** yang kamu inginkan:\n` +
        `_⚠️ Minimal 6 karakter_`,
        { 
          parse_mode: 'Markdown', 
          ...Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'cancel_qris_order')]
          ]) 
        }
      );
      return ctx.wizard.next();
    }

    if (ctx.scene.state.isPanel) {
      if (/\s/.test(inputVal)) {
        return ctx.reply(
          '❌ **Nama tidak boleh mengandung spasi.**\n\nKetik ulang username kamu:',
          Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'cancel_qris_order')]
          ])
        );
      }
      ctx.scene.state.targetUsername = inputVal;
      await ctx.reply(
        `🏷️ **LANGKAH 2/3 — NAMA SERVER**\n\n` +
        `✏️ Ketik nama untuk server panel kamu:`,
        { 
          parse_mode: 'Markdown', 
          ...Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'cancel_qris_order')]
          ]) 
        }
      );
      return ctx.wizard.next();
    }

    return proceedToQrisPaymentDirect(ctx);
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (['cancel_qris_order', 'back_home'].includes(ctx.callbackQuery.data)) {
        await ctx.answerCbQuery('Dibatalkan').catch(()=>{});
        await ctx.reply(
          '❌ Transaksi dibatalkan.',
          Markup.inlineKeyboard([
            [colorButtons.home('Kembali ke Menu Utama')]
          ])
        );
        return ctx.scene.leave();
      }
      return;
    }

    const inputVal = ctx.message?.text?.trim();
    if (!inputVal) {
      return ctx.reply(
        '❌ Input tidak boleh kosong. Silakan ketik ulang:',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'cancel_qris_order')]
        ])
      );
    }

    if (ctx.scene.state.isProdBug) {
      if (inputVal.length < 6) {
        return ctx.reply(
          '❌ **Password minimal 6 karakter.**\n\nSilakan ketik ulang password:',
          Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'cancel_qris_order')]
          ])
        );
      }
      ctx.scene.state.customAccountPassword = inputVal;
      return proceedToQrisPaymentDirect(ctx);
    }

    if (ctx.scene.state.isPanel) {
      ctx.scene.state.customServerName = inputVal;
      return proceedToQrisPaymentDirect(ctx);
    }

    return proceedToQrisPaymentDirect(ctx);
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (['cancel_qris_order', 'back_home'].includes(ctx.callbackQuery.data)) {
        await ctx.answerCbQuery('Dibatalkan').catch(()=>{});
        await ctx.reply(
          '❌ Transaksi dibatalkan.',
          Markup.inlineKeyboard([
            [colorButtons.home('Kembali ke Menu Utama')]
          ])
        );
        return ctx.scene.leave();
      }
      return;
    }
    const photo = ctx.message?.photo;
    if (!photo || !photo.length) {
      return ctx.reply(
        '❌ **Wajib mengirimkan foto bukti transfer ya.**\n\n' +
        '📸 Kirim foto bukti pembayaran QRIS:',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'cancel_qris_order')]
        ])
      );
    }
    ctx.scene.state.paymentPhotoId = photo[photo.length - 1].file_id;
    return finalizeOrderAndNotify(ctx);
  }
);

async function proceedToQrisPaymentDirect(ctx) {
  const { finalPrice } = ctx.scene.state;
  const qrisImageUrl = 'https://files.catbox.moe/fxyrhz.png';
  const captionText = 
    `💳 **LANGKAH TERAKHIR — PEMBAYARAN QRIS**\n\n` +
    `📱 Scan QRIS di atas dan transfer sebesar:\n` +
    `💰 *${formatRp(finalPrice)}*\n\n` +
    `📤 Setelah transfer, kirim **foto bukti pembayaran** ke chat ini.\n\n` +
    `_⚠️ Jangan lupa screenshot bukti transfer sebagai arsip._`;
  try {
    const qrisMsg = await ctx.replyWithPhoto(
      { url: qrisImageUrl },
      {
        caption: captionText,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'cancel_qris_order')]
        ])
      }
    );
    ctx.scene.state.qrisMsgId = qrisMsg.message_id;
  } catch (e) {
    await ctx.reply(
      `❌ **Gagal memuat QRIS:**\n${e.message}`,
      Markup.inlineKeyboard([
        [colorButtons.danger('BATAL', 'cancel_qris_order')]
      ])
    );
    return ctx.scene.leave();
  }
  return ctx.wizard.selectStep(3);
}

// ==========================================
// WIZARD TAMBAH PRODUK & STOK
// ==========================================
const adminAddProdWizard = new Scenes.WizardScene(
  'admin_add_prod_wizard',
  async (ctx) => {
    try {
      await ctx.reply(
        `➕ **TAMBAH PRODUK (Aplikasi Bug)**\n\n` +
        `✏️ Silakan kirimkan **TEXT PRODUK** (Deskripsi/Keterangan):`,
        { 
          parse_mode: 'Markdown', 
          ...Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'control_admin')]
          ]) 
        }
      );
      return ctx.wizard.next();
    } catch (e) {
      await ctx.reply(
        `❌ Gagal memulai wizard: ${e.message}`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ])
      );
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const content = ctx.message?.text?.trim();
    if (!content) {
      return ctx.reply(
        '❌ Text produk tidak boleh kosong. Kirimkan ulang:',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'control_admin')]
        ])
      );
    }
    
    ctx.scene.state.content = content;
    await ctx.reply(
      `✅ **SUCCESS** (Text disimpan)\n\n` +
      `📤 Silakan kirimkan **APK (File)** produk Anda sekarang, atau ketik \`lewati\`:\n` +
      `_⚠️ Support: APK, ZIP, atau file lainnya_`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    
    let fileId = '';
    if (ctx.message?.document) fileId = ctx.message.document.file_id;
    else if (ctx.message?.photo) fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    else if (ctx.message?.text?.trim().toLowerCase() !== 'lewati') {
      return ctx.reply(
        '❌ Kirim APK/File yang valid, atau ketik `lewati` untuk melanjutkan tanpa file:',
        { parse_mode: 'Markdown' }
      );
    }
    
    ctx.scene.state.fileId = fileId;
    await ctx.reply(
      `✅ **SUCCESS** (File disimpan)\n\n` +
      `✏️ Terakhir, kirimkan **NAMA** dan **HARGA** (Gunakan spasi)\n` +
      `📌 Contoh: \`HOXTEN 15000\``,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const input = ctx.message?.text?.trim();
    if (!input) {
      return ctx.reply(
        '❌ Input tidak valid. Kirimkan NAMA dan HARGA\n' +
        `📌 Contoh: \`HOXTEN 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const parts = input.split(' ');
    if (parts.length < 2) {
      return ctx.reply(
        '❌ Format salah. Harus ada nama dan harga\n' +
        `📌 Contoh: \`HOXTEN 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const price = parseInt(parts.pop(), 10);
    const name = parts.join(' ');
    
    if (isNaN(price) || price < 0) {
      return ctx.reply(
        '❌ Harga di bagian akhir harus berupa angka.\n' +
        `📌 Contoh: \`HOXTEN 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const newProd = { 
      id: `P-${Date.now()}`, 
      name: name, 
      price: price, 
      content: ctx.scene.state.content, 
      fileId: ctx.scene.state.fileId || '', 
      status: 'available' 
    };
    
    helperDb.addProd(newProd);
    await ctx.reply(
      `✅ **Produk berhasil ditambahkan!**\n\n` +
      `📦 Nama: *${newProd.name}*\n` +
      `💰 Harga: *${formatRp(newProd.price)}*`,
      { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ]) 
      }
    );
    return ctx.scene.leave();
  }
);

const adminAddStockWizard = new Scenes.WizardScene(
  'admin_add_stock_wizard',
  async (ctx) => {
    try {
      await ctx.reply(
        `➕ **TAMBAH STOK (App Premium)**\n\n` +
        `✏️ Kirimkan **DETAIL AKUN LOGIN**\n` +
        `📌 Contoh: \`Email: admin@web.com | Pass: 12345\``,
        { 
          parse_mode: 'Markdown', 
          ...Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'control_admin')]
          ]) 
        }
      );
      return ctx.wizard.next();
    } catch (e) {
      await ctx.reply(
        `❌ Gagal memulai wizard: ${e.message}`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ])
      );
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const content = ctx.message?.text?.trim();
    if (!content) {
      return ctx.reply(
        '❌ Detail akun tidak boleh kosong. Kirimkan ulang:',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'control_admin')]
        ])
      );
    }
    
    ctx.scene.state.content = content;
    await ctx.reply(
      `✅ **SUCCESS** (Akun Login disimpan)\n\n` +
      `📤 Kirimkan Gambar/File pelengkap (Opsional), atau ketik \`lewati\`:\n` +
      `_⚠️ Support: Foto, dokumen, atau file lainnya_`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    
    let fileId = '';
    if (ctx.message?.document) fileId = ctx.message.document.file_id;
    else if (ctx.message?.photo) fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    else if (ctx.message?.text?.trim().toLowerCase() !== 'lewati') {
      return ctx.reply(
        '❌ Kirim file yang valid, atau ketik `lewati`:',
        { parse_mode: 'Markdown' }
      );
    }
    
    ctx.scene.state.fileId = fileId;
    await ctx.reply(
      `✅ **SUCCESS** (File disimpan)\n\n` +
      `✏️ Terakhir, kirimkan **NAMA APP** dan **HARGA** (Gunakan spasi)\n` +
      `📌 Contoh: \`CANVA PREM 15000\``,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const input = ctx.message?.text?.trim();
    if (!input) {
      return ctx.reply(
        '❌ Input tidak valid. Kirimkan NAMA dan HARGA\n' +
        `📌 Contoh: \`CANVA PREM 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const parts = input.split(' ');
    if (parts.length < 2) {
      return ctx.reply(
        '❌ Format salah. Harus ada nama dan harga\n' +
        `📌 Contoh: \`CANVA PREM 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const price = parseInt(parts.pop(), 10);
    const name = parts.join(' ');
    
    if (isNaN(price) || price < 0) {
      return ctx.reply(
        '❌ Harga di bagian akhir harus berupa angka.\n' +
        `📌 Contoh: \`CANVA PREM 15000\``,
        { parse_mode: 'Markdown' }
      );
    }
    
    const newStock = { 
      id: `S-${Date.now()}`, 
      name: name, 
      price: price, 
      content: ctx.scene.state.content, 
      fileId: ctx.scene.state.fileId || '', 
      status: 'available' 
    };
    
    helperDb.addStock(newStock);
    await ctx.reply(
      `✅ **Stok berhasil ditambahkan!**\n\n` +
      `📦 Nama: *${newStock.name}*\n` +
      `💰 Harga: *${formatRp(newStock.price)}*`,
      { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ]) 
      }
    );
    return ctx.scene.leave();
  }
);

const adminEditWizard = new Scenes.WizardScene(
  'admin_edit_wizard',
  async (ctx) => {
    const { mode } = ctx.scene.state;
    const label = mode === 'price' ? 'harga baru (angka saja)' : 'nama baru';
    await ctx.reply(
      `✏️ **Ketik ${label}:**`,
      Markup.inlineKeyboard([
        [colorButtons.danger('BATAL', 'control_admin')]
      ])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) { 
      await ctx.answerCbQuery().catch(()=>{}); 
      return ctx.scene.leave(); 
    }
    const { mode, target, id } = ctx.scene.state;
    const inputVal = ctx.message?.text?.trim();
    if (!inputVal) {
      return ctx.reply(
        '❌ Input tidak boleh kosong. Ketik ulang:',
        Markup.inlineKeyboard([
          [colorButtons.danger('BATAL', 'control_admin')]
        ])
      );
    }

    if (mode === 'price') {
      const price = parseInt(inputVal, 10);
      if (isNaN(price) || price < 0) {
        return ctx.reply(
          '❌ Harga harus berupa angka. Ketik ulang harga:',
          Markup.inlineKeyboard([
            [colorButtons.danger('BATAL', 'control_admin')]
          ])
        );
      }
      if (target === 'prod') helperDb.updateProd(id, 'price', price);
      else helperDb.updateStock(id, 'price', price);
      await ctx.reply(
        `✅ **Harga berhasil diubah menjadi ${formatRp(price)}.**`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ])
      );
    } else {
      if (target === 'prod') helperDb.updateProd(id, 'name', inputVal);
      else helperDb.updateStock(id, 'name', inputVal);
      await ctx.reply(
        `✅ **Nama berhasil diubah menjadi "${inputVal}".**`,
        Markup.inlineKeyboard([
          [colorButtons.home('Kembali')]
        ])
      );
    }
    return ctx.scene.leave();
  }
);

const buildItemPickerButtons = (items, prefix) => {
  const btns = items.map(it => [
    Markup.button.callback(
      `${it.name} (${formatRp(it.price || 0)})`, 
      `${prefix}_${it.id}`
    )
  ]);
  btns.push([colorButtons.home('Kembali')]);
  return Markup.inlineKeyboard(btns);
};

// ==========================================
// SESSION & STAGE SETUP
// ==========================================
bot.use(session());
const stage = new Scenes.Stage([
  reviewWizard, tourlWizard, checkerorWizard, paymentOrderWizard,
  adminAddProdWizard, adminAddStockWizard, adminEditWizard,
  deployWizard
]);
bot.use(stage.middleware());

// ==========================================
// AUTO CREATE PANEL FUNCTION
// ==========================================
async function autoCreatePanel(order) {
  try {
    const { targetUsername, autoPassword, panelEmail, panelPackageId, customServerName } = order;
    
    console.log('🚀 Memulai Auto Create Panel...');
    console.log(`📦 Package: ${panelPackageId}`);
    console.log(`👤 Username: ${targetUsername}`);
    console.log(`📧 Email: ${panelEmail}`);

    const pkg = getPanelSpec(panelPackageId);
    if (!pkg) {
      throw new Error('Paket panel tidak ditemukan');
    }

    console.log('📝 Creating Pterodactyl user...');
    let userId = null;
    try {
      const existingUser = await pterodactylApi.getUserByEmail(panelEmail);
      if (existingUser) {
        userId = existingUser.attributes.id;
        console.log(`👤 User already exists with ID: ${userId}`);
      } else {
        const userResult = await pterodactylApi.createUser(
          panelEmail,
          targetUsername,
          autoPassword,
          targetUsername,
          'User'
        );
        userId = userResult.attributes.id;
        console.log(`✅ User created with ID: ${userId}`);
      }
    } catch (error) {
      console.error('❌ Failed to create user:', error);
      throw new Error(`Gagal membuat user di panel: ${error.message}`);
    }

    console.log('🖥️ Creating server...');
    const serverName = customServerName || `Server-${targetUsername}`;
    
    const ramMap = {
      '1 GB': 1024, '2 GB': 2048, '3 GB': 3072,
      '4 GB': 4096, '5 GB': 5120, 'Unlimited': 0
    };
    const diskMap = {
      '5 GB': 5120, '10 GB': 10240, '15 GB': 15360,
      '20 GB': 20480, '25 GB': 25600, 'Unlimited': 0
    };
    const cpuMap = {
      '50%': 50, '75%': 75, '100%': 100,
      '125%': 125, '150%': 150, 'Unlimited': 0
    };

    const ram = ramMap[pkg.ram] || 1024;
    const disk = diskMap[pkg.disk] || 5120;
    const cpu = cpuMap[pkg.cpu] || 100;

    const serverResult = await pterodactylApi.createServer(
      userId,
      serverName,
      ram,
      disk,
      cpu
    );

    console.log('✅ Server created successfully!');
    console.log(`🆔 Server ID: ${serverResult.serverId}`);

    const serverInfo = {
      serverId: serverResult.serverId,
      userId: userId,
      username: targetUsername,
      email: panelEmail,
      password: autoPassword,
      serverName: serverName,
      package: panelPackageId,
      ram: pkg.ram,
      disk: pkg.disk,
      cpu: pkg.cpu,
      createdAt: new Date().toISOString()
    };

    helperDb.saveServerInfo(order.id, serverInfo);

    if (db.updateOrder) {
      db.updateOrder(order.id, {
        pterodactylUserId: userId,
        pterodactylServerId: serverResult.serverId,
        serverCreated: true,
        serverCreatedAt: new Date().toISOString()
      });
    }

    return {
      success: true,
      userId: userId,
      serverId: serverResult.serverId,
      serverDetails: serverResult.serverDetails,
      username: targetUsername,
      password: autoPassword,
      email: panelEmail
    };

  } catch (error) {
    console.error('❌ Auto create panel failed:', error);
    return {
      success: false,
      error: error.message || 'Gagal membuat panel'
    };
  }
}

// ==========================================
// FINALIZE ORDER & NOTIFY
// ==========================================
async function finalizeOrderAndNotify(ctx) {
  const state = ctx.scene.state || {};
  const { 
    prodName, finalPrice, stockId, prodFileId, isPanel, isSystemAccess, 
    isProdBug, targetUsername, customServerName, customAccountName, 
    customAccountPassword, paymentPhotoId, panelPackageId 
  } = state;
  const orderId = state.orderId || `ORD-${Date.now()}`;
  let assignedContent = 'Data akun/produk';
  let assignedFileId = prodFileId || null;
  let autoPassword = '';
  let panelEmail = '';
  let panelUuid = '';
  let panelShortId = '';
  let panelServerId = '';
  let panelUserId = '';
  let serverInfo = null;

  if (isPanel || orderId.startsWith('PNL')) {
    autoPassword = generateAutoPassword();
    panelEmail = generateAutoEmail(targetUsername);
    panelUuid = generateUUID();
    panelShortId = panelUuid.split('-')[0];
    const numericId = getNextPanelNumericId();
    panelServerId = String(numericId);
    panelUserId = String(numericId);
    assignedContent = `Username: ${targetUsername}\nPassword: ${autoPassword}`;
  } else if (isProdBug || orderId.startsWith('PRD')) {
    assignedContent = `NAMA AKUN APK: ${customAccountName}\nPW AKUN APK: ${customAccountPassword}`;
  } else if (isSystemAccess) {
    assignedContent = `https://t.me/+5Hs2gAbLwutjMWE1`;
  } else if (stockId) {
    const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
    const stockIndex = stocks.findIndex(s => s.id === stockId && s.status === 'available');
    if (stockIndex !== -1) {
      assignedContent = stocks[stockIndex].content;
      assignedFileId = stocks[stockIndex].fileId || null;
      helperDb.updateStock(stockId, 'status', 'sold');
    }
  } else if (state.prodContent) {
    assignedContent = state.prodContent;
  }

  const orderData = {
    id: orderId, 
    userId: String(ctx.from.id), 
    username: ctx.from.username || ctx.from.first_name,
    productName: prodName, 
    price: finalPrice, 
    credentials: assignedContent,
    productDescription: assignedContent || '', 
    serverLabel: customServerName || state.serverLabel || '', 
    fileId: assignedFileId || '',
    targetUsername: targetUsername || '', 
    autoPassword: autoPassword || '', 
    panelPackageId: panelPackageId || '',
    customAccountName: customAccountName || '', 
    customAccountPassword: customAccountPassword || '',
    panelEmail, panelUuid, panelShortId, panelServerId, panelUserId,
    paymentPhotoId: paymentPhotoId || '', 
    isPanel: isPanel || orderId.startsWith('PNL') || false,
    isProdBug: isProdBug || orderId.startsWith('PRD') || false,
    isSystemAccess: isSystemAccess || false, 
    createdAt: Date.now(), 
    status: 'pending_admin',
    serverCreated: false,
    pterodactylUserId: null,
    pterodactylServerId: null
  };

  if (db.addOrder) db.addOrder(orderData);
  else if (db.data) { 
    db.data.orders = db.data.orders || []; 
    db.data.orders.push(orderData); 
    if (db.write) db.write(); 
  }

  // Auto create panel untuk order panel
  if (isPanel || orderId.startsWith('PNL')) {
    try {
      const createResult = await autoCreatePanel(orderData);
      if (createResult.success) {
        serverInfo = createResult;
        orderData.serverCreated = true;
        orderData.pterodactylUserId = createResult.userId;
        orderData.pterodactylServerId = createResult.serverId;
        if (db.updateOrder) {
          db.updateOrder(orderId, {
            serverCreated: true,
            pterodactylUserId: createResult.userId,
            pterodactylServerId: createResult.serverId
          });
        }
        console.log('✅ Panel auto-created successfully!');
      } else {
        console.log('❌ Panel auto-creation failed:', createResult.error);
      }
    } catch (error) {
      console.error('❌ Error during auto create panel:', error);
    }
  }

  const waitingMsg = 
    `🌟 **BUKTI PEMBAYARAN BERHASIL TERKIRIM!** 🌟\n\n` +
    `📦 **Detail Pesanan:** \`${prodName}\`\n` +
    `💰 **Total Nominal:** \`${formatRp(finalPrice)}\`\n` +
    `🆔 **ID Transaksi:** \`${orderId}\`\n\n` +
    (isPanel ? `🖥️ **Status Panel:** \`Sedang dibuat otomatis\`\n\n` : '') +
    `⏳ _Status saat ini: Menunggu verifikasi dari admin (Biasanya memakan waktu 1-5 menit). Harap tenang dan jangan hapus bukti chat._`;

  await ctx.reply(
    waitingMsg,
    { 
      parse_mode: 'Markdown', 
      ...Markup.inlineKeyboard([
        [colorButtons.home('Kembali ke Menu Utama')]
      ]) 
    }
  );

  // Kirim notifikasi ke owner
  if (OWNER_ID && paymentPhotoId) {
    const btnText = (isPanel || orderId.startsWith('PNL') || isProdBug || orderId.startsWith('PRD')) 
      ? 'SELESAI (KIRIM KE USER)' 
      : 'KONFIRMASI';
    const serverInfoText = customServerName ? `\n🏷️ Nama Server: ${customServerName}` : '';
    const accountInfoText = (isPanel || orderId.startsWith('PNL')) 
      ? `\n👤 Username diminta: \`${targetUsername}\`\n🔑 Password otomatis: \`${autoPassword}\`\n📧 Email: \`${panelEmail}\`` 
      : '';
    const prodBugInfoText = (isProdBug || orderId.startsWith('PRD')) 
      ? `\n👤 Request Nama Akun: \`${customAccountName}\`\n🔑 Request Password: \`${customAccountPassword}\`` 
      : '';
    
    let caption = `🔔 **LAPORAN PEMBAYARAN MASUK**\n\n` +
      `ID Pesanan: \`${orderId}\`\n` +
      `User: @${ctx.from.username || '-'}\n` +
      `Produk: ${prodName} (${formatRp(finalPrice)})${serverInfoText}${accountInfoText}${prodBugInfoText}`;

    if (serverInfo && serverInfo.success) {
      caption += `\n\n✅ **Panel Auto-Created!**\n` +
        `🆔 Server ID: \`${serverInfo.serverId}\``;
    }

    await bot.telegram.sendPhoto(
      OWNER_ID, 
      paymentPhotoId,
      {
        caption: caption,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [colorButtons.success(btnText, `finish_order_${orderId}_${ctx.from.id}`), 
           colorButtons.danger('TOLAK', `reject_order_${orderId}_${ctx.from.id}`)]
        ])
      }
    ).catch(()=>{});
  }
  return ctx.scene.leave();
}

// ==========================================
// CHECK MEMBERSHIP ACTION
// ==========================================
bot.action('check_membership', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  try {
    const userId = ctx.from.id;
    const chatMember = await bot.telegram.getChatMember(REQUIRED_CHANNEL_ID, userId);
    const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    
    if (isMember) {
      await ctx.reply('✅ **Selamat! Kamu sudah join channel.**\n\nSilakan gunakan tombol di bawah untuk mulai berbelanja.');
      await showHomeMenu(ctx);
    } else {
      await ctx.reply(
        '❌ **Kamu belum join channel.**\n\n' +
        'Silakan join channel terlebih dahulu dengan klik tombol di bawah:',
        Markup.inlineKeyboard([
          [Markup.button.url('📢 JOIN CHANNEL', REQUIRED_CHANNEL_URL)],
          [colorButtons.primary('CEK KEANGGOTAAN', 'check_membership')]
        ])
      );
    }
  } catch (error) {
    await ctx.reply(
      '⚠️ **Gagal memverifikasi keanggotaan.**\n\n' +
      'Pastikan kamu sudah join channel dan coba lagi.\n' +
      'Jika masih error, hubungi admin.',
      Markup.inlineKeyboard([
        [Markup.button.url('📢 JOIN CHANNEL', REQUIRED_CHANNEL_URL)],
        [colorButtons.primary('CEK LAGI', 'check_membership')]
      ])
    );
  }
});

// ==========================================
// HANDLER TOMBOL ADMIN
// ==========================================
bot.action('admin_add_prod', requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  if (ctx.scene && typeof ctx.scene.enter === 'function') {
    return ctx.scene.enter('admin_add_prod_wizard');
  } else {
    return ctx.reply(
      '❌ Sesi wizard belum siap. Restart bot.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
});

bot.action('admin_add_stock', requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  if (ctx.scene && typeof ctx.scene.enter === 'function') {
    return ctx.scene.enter('admin_add_stock_wizard');
  } else {
    return ctx.reply(
      '❌ Sesi wizard belum siap. Restart bot.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
});

bot.action('admin_list_prod', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prods = db.getAccounts ? db.getAccounts() : [];
  if (!prods.length) {
    return sendVideoResponse(
      ctx,
      '📋 **Belum ada produk aplikasi bug.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  let txt = `📋 **LIST PRODUK (Aplikasi Bug)** — ${prods.length} item\n\n`;
  prods.forEach(p => { 
    txt += `• **${p.name}** — ${formatRp(p.price)} [${p.status || 'available'}]\n  ID: \`${p.id}\`\n\n`; 
  });
  await sendVideoResponse(
    ctx,
    txt,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('admin_list_stock', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  if (!stocks.length) {
    return sendVideoResponse(
      ctx,
      '📋 **Belum ada stok aplikasi premium.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  let txt = `📋 **LIST STOK (Aplikasi Premium)** — ${stocks.length} item\n\n`;
  stocks.forEach(s => { 
    txt += `• **${s.name}** — ${formatRp(s.price || 10000)} [${s.status || 'available'}]\n  ID: \`${s.id}\`\n\n`; 
  });
  await sendVideoResponse(
    ctx,
    txt,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('admin_edit_name_prod', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prods = db.getAccounts ? db.getAccounts() : [];
  if (!prods.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada produk.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '✏️ **Pilih produk yang mau diubah namanya:**',
    buildItemPickerButtons(prods, 'pick_editname_prod')
  );
});
bot.action(/^pick_editname_prod_(.+)$/, requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('admin_edit_wizard', { 
    mode: 'name', 
    target: 'prod', 
    id: ctx.match[1] 
  }); 
});

bot.action('admin_edit_name_stock', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  if (!stocks.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada stok.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '✏️ **Pilih stok yang mau diubah namanya:**',
    buildItemPickerButtons(stocks, 'pick_editname_stock')
  );
});
bot.action(/^pick_editname_stock_(.+)$/, requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('admin_edit_wizard', { 
    mode: 'name', 
    target: 'stock', 
    id: ctx.match[1] 
  }); 
});

bot.action('admin_edit_price_prod', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prods = db.getAccounts ? db.getAccounts() : [];
  if (!prods.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada produk.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '💰 **Pilih produk yang mau diubah harganya:**',
    buildItemPickerButtons(prods, 'pick_editprice_prod')
  );
});
bot.action(/^pick_editprice_prod_(.+)$/, requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('admin_edit_wizard', { 
    mode: 'price', 
    target: 'prod', 
    id: ctx.match[1] 
  }); 
});

bot.action('admin_edit_price_stock', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  if (!stocks.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada stok.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '💰 **Pilih stok yang mau diubah harganya:**',
    buildItemPickerButtons(stocks, 'pick_editprice_stock')
  );
});
bot.action(/^pick_editprice_stock_(.+)$/, requireOwner, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('admin_edit_wizard', { 
    mode: 'price', 
    target: 'stock', 
    id: ctx.match[1] 
  }); 
});

bot.action('admin_del_prod', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prods = db.getAccounts ? db.getAccounts() : [];
  if (!prods.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada produk.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '🗑️ **Pilih produk yang mau dihapus:**',
    buildItemPickerButtons(prods, 'pick_del_prod')
  );
});
bot.action(/^pick_del_prod_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    '⚠️ **Yakin mau menghapus produk ini?**',
    Markup.inlineKeyboard([
      [colorButtons.danger('YA, HAPUS', `confirm_del_prod_${ctx.match[1]}`), 
       colorButtons.home('BATAL')]
    ])
  );
});
bot.action(/^confirm_del_prod_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  helperDb.delProd(ctx.match[1]);
  await sendVideoResponse(
    ctx,
    '✅ **Produk berhasil dihapus.**',
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('admin_del_stock', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  if (!stocks.length) {
    return sendVideoResponse(
      ctx,
      '📋 Belum ada stok.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    '🗑️ **Pilih stok yang mau dihapus:**',
    buildItemPickerButtons(stocks, 'pick_del_stock')
  );
});
bot.action(/^pick_del_stock_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    '⚠️ **Yakin mau menghapus stok ini?**',
    Markup.inlineKeyboard([
      [colorButtons.danger('YA, HAPUS', `confirm_del_stock_${ctx.match[1]}`), 
       colorButtons.home('BATAL')]
    ])
  );
});
bot.action(/^confirm_del_stock_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  helperDb.delStock(ctx.match[1]);
  await sendVideoResponse(
    ctx,
    '✅ **Stok berhasil dihapus.**',
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

// ==========================================
// START & MENU HANDLERS
// ==========================================
bot.start(checkMembership, async (ctx) => {
  try {
    if (isOwner(ctx)) performAutoBackup();
    if (db.getOrCreateUser) {
      try { db.getOrCreateUser(ctx.from.id, ctx.from.username); }
      catch (e) {}
    }
    await showHomeMenu(ctx);
  } catch (e) {
    try { await ctx.reply('⚠️ Bot mengalami kendala saat memulai.'); } catch (e2) {}
  }
});

// Apply membership check to all actions
bot.use((ctx, next) => {
  if (isOwner(ctx) || ctx.callbackQuery?.data === 'check_membership') {
    return next();
  }
  if (ctx.callbackQuery?.data?.startsWith('admin_') || 
      ctx.callbackQuery?.data?.startsWith('pick_') ||
      ctx.callbackQuery?.data?.startsWith('confirm_') ||
      ctx.callbackQuery?.data?.startsWith('finish_') ||
      ctx.callbackQuery?.data?.startsWith('reject_') ||
      ctx.callbackQuery?.data?.startsWith('deploy_') ||
      ctx.callbackQuery?.data?.startsWith('buy_') ||
      ctx.callbackQuery?.data?.startsWith('pkg_')) {
    return next();
  }
  return checkMembership(ctx, next);
});

bot.command('testadzan', requireOwner, async (ctx) => {
  const msg = `🕌 *TES PENGINGAT WAKTU SHOLAT* 🕌\n\nIni pesan uji coba.`;
  try {
    await ctx.reply('⏳ Mengirim tes notif...');
    if (TESTI_DEPOSIT_CHANNEL_ID) {
      await bot.telegram.sendMessage(TESTI_DEPOSIT_CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    }
    if (OWNER_ID) {
      await bot.telegram.sendMessage(OWNER_ID, msg, { parse_mode: 'Markdown' });
    }
    await ctx.reply('✅ Tes selesai tanpa error.');
  } catch (e) {
    await ctx.reply(`❌ Gagal kirim: ${e.message}`);
  }
});

// ==========================================
// MENU HANDLERS
// ==========================================
bot.action('menu_build_apk', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `🛠️ **BUILD APK**\n\n` +
    `Fitur ini akan segera hadir!\n` +
    `Kami sedang mengembangkan layanan build APK otomatis.\n\n` +
    `_Pantau terus update terbaru dari kami._`,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_deploy_web', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  return ctx.scene.enter('deploy_wizard');
});

bot.action('menu_tqto', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `💜 **TQTO (Thank You To)**\n\n` +
    `Terima kasih kepada semua yang telah mendukung:\n\n` +
    `👑 R.F.DAMANIIKK - Owner\n` +
    `👥 Semua Member Setia\n` +
    `🤝 Tim Support\n\n` +
    `_Tanpa kalian semua, bot ini tidak akan ada._`,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_tools', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `🛠️ **MENU TOOLS**\n\nPilih tool yang ingin kamu gunakan:`,
    toolsMenuMarkup
  );
});

bot.action('menu_cek_credit', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const userId = ctx.from.id;
  let userCredit = 0;
  try {
    const user = db.getUser ? db.getUser(userId) : null;
    if (user) userCredit = user.credit || 0;
  } catch (e) {}
  
  await sendVideoResponse(
    ctx,
    `💳 **CEK CREDIT**\n\n` +
    `👤 User: @${ctx.from.username || ctx.from.first_name}\n` +
    `💰 Sisa Credit: *${formatRp(userCredit)}*\n\n` +
    `📌 Credit bisa digunakan untuk:\n` +
    `├ 🖥️ Membeli Panel Hosting\n` +
    `├ 📱 Membeli Aplikasi Premium\n` +
    `└ 🛠️ Menggunakan Tools Premium\n\n` +
    `💡 _Beli credit di menu Buy Credit._`,
    Markup.inlineKeyboard([
      [colorButtons.success('Buy Credit', 'menu_buy_credit')],
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_buy_credit', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `💳 **BUY CREDIT**\n\n` +
    `Pilih paket credit di bawah ini:\n\n` +
    `📌 *Bonus Credit untuk pembelian di atas Rp50.000!*\n\n` +
    `💰 Credit digunakan untuk semua transaksi di bot ini.`,
    creditMenuMarkup
  );
});

bot.action(/^buy_credit_(\d+)$/, checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const amount = parseInt(ctx.match[1]);
  let credit = amount / 1000;
  if (amount >= 50000) credit = credit + 5;
  
  await sendVideoResponse(
    ctx,
    `💳 **KONFIRMASI PEMBELIAN CREDIT**\n\n` +
    `💰 Harga: *${formatRp(amount)}*\n` +
    `⭐ Credit Didapat: *${credit} Credit*\n\n` +
    `📌 _Fitur pembayaran akan segera hadir._\n` +
    `Saat ini silakan hubungi admin untuk pembelian.`,
    Markup.inlineKeyboard([
      [colorButtons.danger('BATAL', 'back_home')]
    ])
  );
});

bot.action('menu_lapor_bug', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `🐛 **LAPOR BUG**\n\n` +
    `Temukan bug? Laporkan ke kami!\n\n` +
    `📝 *Format Laporan:*\n` +
    `1. Deskripsi bug\n` +
    `2. Langkah-langkah terjadi bug\n` +
    `3. Screenshot (jika ada)\n\n` +
    `📤 Kirim laporan ke: @RFDAMANIIKK`,
    Markup.inlineKeyboard([
      [Markup.button.url('📤 LAPOR KE OWNER', 'https://t.me/RFDAMANIIKK')],
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_status_bot', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const status = 
    `📊 **STATUS BOT**\n\n` +
    `🟢 Status: *Online*\n` +
    `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
    `📦 Database: *Connected*\n` +
    `👑 Owner: @RFDAMANIIKK\n\n` +
    `_Bot berjalan dengan normal._`;
  
  await sendVideoResponse(
    ctx,
    status,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_message', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `💬 **MESSAGE / KONTAK**\n\n` +
    `📱 Hubungi kami melalui:\n\n` +
    `👑 Owner: @RFDAMANIIKK\n` +
    `📢 Channel: ${REQUIRED_CHANNEL_URL || 'https://t.me/yourchannel'}\n` +
    `🛠️ Support: @RFDAMANIIKK\n\n` +
    `_Kami siap membantu 24 jam!_`,
    Markup.inlineKeyboard([
      [Markup.button.url('📤 HUBUNGI OWNER', 'https://t.me/RFDAMANIIKK')],
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action('menu_order_akses', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `🔐 **ORDER AKSES SISTEM**\n\nPilih salah satu di bawah ini:`,
    aksesMenuMarkup
  );
});

const PANEL_PACKAGES = [
  { id: 'panel_1gb', name: 'Server 1 GB', price: 1000, ram: '1 GB', disk: '5 GB', cpu: '50%' },
  { id: 'panel_2gb', name: 'Server 2 GB', price: 2000, ram: '2 GB', disk: '10 GB', cpu: '75%' },
  { id: 'panel_3gb', name: 'Server 3 GB', price: 3000, ram: '3 GB', disk: '15 GB', cpu: '100%' },
  { id: 'panel_4gb', name: 'Server 4 GB', price: 4000, ram: '4 GB', disk: '20 GB', cpu: '125%' },
  { id: 'panel_5gb', name: 'Server 5 GB', price: 5000, ram: '5 GB', disk: '25 GB', cpu: '150%' },
  { id: 'panel_unli', name: 'Server Unlimited', price: 15000, ram: 'Unlimited', disk: 'Unlimited', cpu: 'Unlimited' }
];

const getPanelSpec = (packageId) => PANEL_PACKAGES.find(p => p.id === packageId) || null;

bot.action('menu_order_panel', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(
    ctx,
    `🖥️ **ORDER PANEL HOSTING (Pterodactyl)**\n\nPilih kapasitas RAM server:`,
    panelMenuMarkup
  );
});

bot.action(/^pkg_(.+)$/, checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const pkg = PANEL_PACKAGES.find(p => p.id === ctx.match[1]);
  if (!pkg) return;
  const text = `📦 **Detail Paket: ${pkg.name}**\n\n` +
    `├ 💾 RAM: ${pkg.ram}\n` +
    `├ 💿 Disk: ${pkg.disk}\n` +
    `├ ⚡ CPU: ${pkg.cpu}\n` +
    `└ 💰 Harga: ${formatRp(pkg.price)}\n\n` +
    `🔄 _Panel akan otomatis dibuat setelah pembayaran diverifikasi!_`;
  await sendVideoResponse(ctx, text, Markup.inlineKeyboard([
    [colorButtons.success('LANJUTKAN PEMBAYARAN', `buy_panel_${pkg.id}`)],
    [colorButtons.home('Kembali')]
  ]));
});

bot.action(/^buy_panel_(.+)$/, checkMembership, async (ctx) => {
  const pkg = PANEL_PACKAGES.find(p => p.id === ctx.match[1]);
  if (!pkg) return;
  return ctx.scene.enter('payment_order_wizard', { 
    prodName: pkg.name, 
    finalPrice: pkg.price, 
    isPanel: true, 
    panelPackageId: pkg.id, 
    orderId: `PNL-${Date.now()}` 
  });
});

bot.action('buy_system_owner', checkMembership, async (ctx) => { 
  return ctx.scene.enter('payment_order_wizard', { 
    prodName: 'Akses Owner', 
    finalPrice: 15000, 
    isSystemAccess: true, 
    orderId: `SYS-OWN-${Date.now()}` 
  }); 
});

bot.action('buy_system_admin', checkMembership, async (ctx) => { 
  return ctx.scene.enter('payment_order_wizard', { 
    prodName: 'Akses Admin', 
    finalPrice: 9000, 
    isSystemAccess: true, 
    orderId: `SYS-ADM-${Date.now()}` 
  }); 
});

bot.action('menu_katalog_app', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  const available = stocks.filter(s => s.status === 'available');
  if (!available.length) {
    return sendVideoResponse(
      ctx,
      '📱 **Stok aplikasi premium kosong.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  const btns = available.map(s => [
    colorButtons.primary(`${s.name} | ${formatRp(s.price || 10000)}`, `view_stock_${s.id}`)
  ]);
  btns.push([colorButtons.home('Kembali')]);
  await sendVideoResponse(ctx, `📱 **KATALOG APLIKASI PREMIUM**`, Markup.inlineKeyboard(btns));
});

bot.action('menu_katalog_bug', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prods = db.getAccounts ? db.getAccounts() : [];
  const available = prods.filter(p => p.status === 'available');
  if (!available.length) {
    return sendVideoResponse(
      ctx,
      '🐞 **Katalog aplikasi bug kosong.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  const btns = available.map(p => [
    colorButtons.orange(`${p.name} | ${formatRp(p.price)}`, `view_prod_${p.id}`)
  ]);
  btns.push([colorButtons.home('Kembali')]);
  await sendVideoResponse(ctx, `🐞 **KATALOG APLIKASI BUG**`, Markup.inlineKeyboard(btns));
});

bot.action('tools_tourl', checkMembership, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('tourl_wizard'); 
});

bot.action('tools_checkeror', checkMembership, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  return ctx.scene.enter('checkeror_wizard'); 
});

bot.action('tools_top_buyer', checkMembership, async (ctx) => { 
  await ctx.answerCbQuery().catch(()=>{}); 
  await sendVideoResponse(
    ctx, 
    '🏆 **Belum ada data Top Buyer saat ini.**', 
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  ); 
});

bot.action('tools_sholat', checkMembership, async (ctx) => {
  await ctx.answerCbQuery('Memuat Jadwal...').catch(()=>{});
  try {
    const res = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=Medan&country=Indonesia&method=20`);
    if (res.data && res.data.data) {
       const t = res.data.data.timings;
       const d = res.data.data.date.readable;
       let text = `🕌 **JADWAL SHOLAT HARI INI**\n📍 Lokasi: Medan\n🗓 Tanggal: ${d}\n\n` +
         `🌅 Subuh: ${t.Fajr} WIB\n☀️ Dzuhur: ${t.Dhuhr} WIB\n🌤 Ashar: ${t.Asr} WIB\n` +
         `🌇 Maghrib: ${t.Maghrib} WIB\n🌙 Isya: ${t.Isha} WIB`;
       await sendVideoResponse(
         ctx, 
         text, 
         Markup.inlineKeyboard([
           [colorButtons.home('Kembali')]
         ])
       );
    }
  } catch (e) {
    await sendVideoResponse(
      ctx,
      '❌ Gagal mengambil jadwal sholat.',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
});

bot.action('menu_riwayat', checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const orders = db.getOrders ? db.getOrders(ctx.from.id) : [];
  if (!orders.length) {
    return sendVideoResponse(
      ctx,
      '🧾 **Kamu belum punya riwayat transaksi.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  let txt = '🧾 **RIWAYAT TRANSAKSI (5 Terakhir)**\n\n';
  orders.slice(-5).reverse().forEach(o => { 
    txt += `• ${o.productName} — ${formatRp(o.price)}\n`; 
  });
  await sendVideoResponse(
    ctx,
    txt,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action(/^view_prod_(.+)$/, checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const prod = (db.getAccounts ? db.getAccounts() : []).find(p => p.id === ctx.match[1]);
  if (!prod) return;
  await sendVideoResponse(
    ctx,
    `*${prod.name}*\nHarga: ${formatRp(prod.price)}\n\n${prod.content}`,
    Markup.inlineKeyboard([
      [colorButtons.success(`BELI SEKARANG (${formatRp(prod.price)})`, `buy_prod_${prod.id}`)],
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action(/^buy_prod_(.+)$/, checkMembership, async (ctx) => {
  const prod = (db.getAccounts ? db.getAccounts() : []).find(p => p.id === ctx.match[1]);
  if (!prod) return;
  return ctx.scene.enter('payment_order_wizard', { 
    prodName: prod.name, 
    finalPrice: prod.price, 
    prodContent: prod.content, 
    prodFileId: prod.fileId, 
    isProdBug: true, 
    orderId: `PRD-${Date.now()}` 
  });
});

bot.action(/^view_stock_(.+)$/, checkMembership, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  const stock = stocks.find(s => s.id === ctx.match[1] && s.status === 'available');
  if (!stock) {
    return ctx.reply(
      '❌ **Stok habis.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  await sendVideoResponse(
    ctx,
    `*${stock.name}*\nHarga: ${formatRp(stock.price || 10000)}`,
    Markup.inlineKeyboard([
      [colorButtons.success(`BELI SEKARANG (${formatRp(stock.price || 10000)})`, `buy_stock_${stock.id}`)],
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action(/^buy_stock_(.+)$/, checkMembership, async (ctx) => {
  const stocks = db.getStocks ? db.getStocks() : (db.data?.stocks || []);
  const stock = stocks.find(s => s.id === ctx.match[1] && s.status === 'available');
  if (!stock) {
    return ctx.reply(
      '❌ **Stok baru saja habis.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  return ctx.scene.enter('payment_order_wizard', { 
    prodName: stock.name, 
    finalPrice: stock.price || 10000, 
    stockId: stock.id, 
    isPanel: false, 
    orderId: `STK-${Date.now()}` 
  });
});

bot.action('control_admin', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await sendVideoResponse(ctx, '⚙️ **PANEL KONTROL ADMIN**', adminMenuMarkup);
});

bot.action('admin_order_panel', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const pending = (db.getAllOrders ? db.getAllOrders() : []).filter(o => o.status === 'pending_admin');
  if (!pending.length) {
    return sendVideoResponse(
      ctx,
      '✅ **Tidak ada pesanan pending.**',
      Markup.inlineKeyboard([
        [colorButtons.home('Kembali')]
      ])
    );
  }
  const btns = pending.map(o => [
    colorButtons.warning(`Verifikasi: ${o.id}`, `finish_order_${o.id}_${o.userId}`)
  ]);
  btns.push([colorButtons.home('Kembali')]);
  await sendVideoResponse(ctx, `⏳ **PESANAN MENUNGGU VERIFIKASI**`, Markup.inlineKeyboard(btns));
});

bot.action('admin_stats', requireOwner, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const users = db.getAllUsers ? db.getAllUsers() : [];
  const orders = db.getAllOrders ? db.getAllOrders() : [];
  const totalPendapatan = orders.reduce((sum, o) => sum + (o.price || 0), 0);
  await sendVideoResponse(
    ctx,
    `📊 **STATISTIK SISTEM**\n\n` +
    `├ 👥 Total User: ${users.length}\n` +
    `├ 📦 Total Pesanan: ${orders.length}\n` +
    `└ 💰 Total Pendapatan: ${formatRp(totalPendapatan)}`,
    Markup.inlineKeyboard([
      [colorButtons.home('Kembali')]
    ])
  );
});

bot.action(/^finish_order_(.+)_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery('Memproses...').catch(()=>{});
  const orderId = ctx.match[1];
  const buyerId = ctx.match[2];
  let order = (db.getAllOrders ? db.getAllOrders() : []).find(o => o.id === orderId);
  if (!order) return ctx.reply('Pesanan tidak ditemukan.');

  const ratingMarkup = Markup.inlineKeyboard([
    [
      colorButtons.primary('1 ⭐', `rate_${orderId}_1`), 
      colorButtons.primary('2 ⭐', `rate_${orderId}_2`), 
      colorButtons.primary('3 ⭐', `rate_${orderId}_3`)
    ],
    [
      colorButtons.success('4 ⭐', `rate_${orderId}_4`), 
      colorButtons.success('5 ⭐', `rate_${orderId}_5`)
    ]
  ]);

  order.status = 'success';
  if (db.write) db.write();

  // Jika order panel dan belum dibuatkan server, buat sekarang
  if ((order.isPanel || orderId.startsWith('PNL')) && !order.serverCreated) {
    try {
      const createResult = await autoCreatePanel(order);
      if (createResult.success) {
        order.serverCreated = true;
        order.pterodactylUserId = createResult.userId;
        order.pterodactylServerId = createResult.serverId;
        if (db.updateOrder) {
          db.updateOrder(orderId, {
            serverCreated: true,
            pterodactylUserId: createResult.userId,
            pterodactylServerId: createResult.serverId
          });
        }
        await ctx.reply(`✅ **Panel Auto-Created!**\n🆔 Server ID: \`${createResult.serverId}\``, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`⚠️ **Gagal membuat panel otomatis:**\n${createResult.error}`, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('Error creating panel:', error);
      await ctx.reply(`⚠️ **Gagal membuat panel otomatis:**\n${error.message}`, { parse_mode: 'Markdown' });
    }
  }

  try { await ctx.deleteMessage(); } catch {}

  if (order.isPanel || orderId.startsWith('PNL')) {
    const customServerName = order.serverLabel || `Server ${order.targetUsername}`;
    const pkg = getPanelSpec(order.panelPackageId);
    const ramLimit = pkg ? pkg.ram : 'Unlimited';
    const diskLimit = pkg ? pkg.disk : 'Unlimited';
    const cpuLimit = pkg ? pkg.cpu : 'Unlimited';

    let successMessage =
      `🎉 **SUCCESS PEMBAYARAN & PEMBUATAN PANEL!** 🎉\n\n` +
      `🌐 **INFORMASI AKSES LOGIN:**\n` +
      `├ 🔗 **Link Panel:** ${cleanDomain}\n` +
      `├ 👤 **Username:** \`${order.targetUsername}\`\n` +
      `├ 🔑 **Password:** \`${order.autoPassword}\`\n` +
      `├ 📧 **Email:** \`${order.panelEmail}\`\n` +
      `└ 📖 **Level Akses:** 👑 MEMBER (CLIENT)\n\n` +
      `🖥️ **DETAIL SERVER & IDENTITAS:**\n` +
      `├ 🌐 **Node Tujuan:** Server 1\n` +
      `├ 🏷️ **Nama Server:** ${customServerName}\n` +
      `├ 🆔 **Server ID:** ${order.pterodactylServerId || order.panelServerId}\n` +
      `├ 👤 **User ID:** ${order.pterodactylUserId || order.panelUserId}\n` +
      `├ 🏷️ **Short ID:** ${order.panelShortId}\n` +
      `└ 🔑 **UUID Server:** \`${order.panelUuid}\`\n\n` +
      `📊 **ALOKASI SUMBER DAYA:**\n` +
      `├ 💾 **RAM Limit:** ${ramLimit}\n` +
      `├ 💿 **Disk Limit:** ${diskLimit}\n` +
      `└ ⚡ **CPU Limit:** ${cpuLimit}\n\n` +
      `⚠️ _Simpan baik-baik data login di atas dan jangan bagikan ke siapa pun._\n\n` +
      `⭐️ *Terakhir, yuk kasih rating buat layanan kami di bawah ini!*`;

    const combinedMarkup = Markup.inlineKeyboard([
      [Markup.button.url('🚀 Login Ke Panel Pterodactyl', cleanDomain)],
      ...ratingMarkup.reply_markup.inline_keyboard 
    ]);

    await bot.telegram.sendMessage(buyerId, successMessage, { 
      parse_mode: 'Markdown', 
      ...combinedMarkup 
    }).catch(()=>{});
    if (order.fileId) {
      await bot.telegram.sendDocument(buyerId, order.fileId, { 
        caption: `📥 File untuk ${order.productName}` 
      }).catch(()=>{});
    }
    await ctx.reply(`✅ Berhasil! Data akun panel dengan username "${order.targetUsername}" telah dikirim ke pembeli.`);
  } else if (order.isProdBug || orderId.startsWith('PRD')) {
    let productSuccessMessage = 
      `✨ **SUCCESS PEMBAYARAN & PENGIRIMAN PRODUK!** ✨\n\n` +
      `🎉 _Terima kasih! Pembayaran kamu telah berhasil diverifikasi oleh admin._\n\n` +
      `📦 **PRODUK:** \`${order.productName}\`\n` +
      `👤 **NAMA AKUN APK:** \`${order.customAccountName}\`\n` +
      `🔑 **PW AKUN APK:** \`${order.customAccountPassword}\`\n\n` +
      `📝 **KETERANGAN PRODUK:**\n${order.productDescription}\n\n` +
      `⚠️ **SYARAT & KETENTUAN GARANSI:**\n` +
      `GARANSI WAJIB KIRIM BUKTI CHATAN BESERTA BUKTI TRANSFER.\n\n` +
      `⭐️ *Yuk berikan ulasan/rating bintang terbaikmu di bawah ini:*`;

    await bot.telegram.sendMessage(buyerId, productSuccessMessage, { 
      parse_mode: 'Markdown', 
      ...ratingMarkup 
    }).catch(()=>{});
    
    if (order.fileId) {
      await bot.telegram.sendDocument(buyerId, order.fileId, { 
        caption: `📥 File APK untuk produk: ${order.productName}` 
      }).catch(()=>{});
    }
    
    await ctx.reply(`✅ Pesanan produk aplikasi bug disetujui dan detail akun serta file APK-nya berhasil dikirim ke pembeli.`);
  } else {
    if (order.isSystemAccess) {
      await bot.telegram.sendMessage(
        buyerId,
        `✨ **SUCCESS PEMBAYARAN AKSES SISTEM!** ✨\n\n` +
        `🔗 **Link Akses:** ${order.credentials}`,
        { parse_mode: 'Markdown', ...ratingMarkup }
      ).catch(()=>{});
      await ctx.reply(`✅ Berhasil.`);
    } else {
      await bot.telegram.sendMessage(
        buyerId,
        `✨ **SUCCESS PEMBAYARAN!** ✨\n\n\`${order.credentials}\``,
        { parse_mode: 'Markdown', ...ratingMarkup }
      ).catch(()=>{});
      if (order.fileId) {
        await bot.telegram.sendDocument(buyerId, order.fileId, { 
          caption: `📥 File: ${order.productName}` 
        }).catch(()=>{});
      }
      await ctx.reply(`✅ Berhasil.`);
    }
  }
});

bot.action(/^reject_order_(.+)_(.+)$/, requireOwner, async (ctx) => {
  await ctx.answerCbQuery('Menolak...').catch(()=>{});
  const orderId = ctx.match[1];
  const buyerId = ctx.match[2];
  const order = (db.getAllOrders ? db.getAllOrders() : []).find(o => o.id === orderId);
  if (!order) return ctx.reply('Pesanan tidak ditemukan.');
  order.status = 'rejected';
  if (db.write) db.write();
  try { await ctx.deleteMessage(); } catch {}
  await bot.telegram.sendMessage(
    buyerId,
    `❌ **Pesanan Ditolak**\n\n` +
    `Maaf, pesanan dengan ID \`${orderId}\` ditolak oleh admin.\n` +
    `Silakan hubungi admin untuk informasi lebih lanjut.`,
    { parse_mode: 'Markdown' }
  ).catch(()=>{});
});

bot.action(/^rate_(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  return ctx.scene.enter('review_wizard', { 
    orderId: ctx.match[1], 
    rating: ctx.match[2] 
  });
});

bot.action('back_home', async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(()=>{});
    if (ctx.scene) await ctx.scene.leave();
    await showHomeMenu(ctx);
  } catch (e) { await showHomeMenu(ctx); }
});

// ==========================================
// ERROR HANDLER
// ==========================================
bot.catch((err, ctx) => {
  console.error('=== DETAIL ERROR BOT ===', err);
  try { 
    ctx.reply(`⚠️ Terjadi kendala saat memproses aksi ini: ${err.message || err}`); 
  } catch (e) {}
});

bot.launch();
console.log('🚀 Bot berhasil dijalankan secara penuh!');
console.log('🎨 Style Button: 🔴 Danger | 🟣 Primary | 🟢 Success');
console.log('🖥️ Auto Create Panel: Aktif');
console.log('🌐 Deploy Website: Aktif');
console.log('📢 Validasi Join Channel: Aktif');