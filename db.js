// db.js - JSON Database Helper untuk ArtanBot
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  users:        path.join(DATA_DIR, 'users.json'),
  accounts:     path.join(DATA_DIR, 'accounts.json'),
  stocks:       path.join(DATA_DIR, 'stocks.json'),
  categories:   path.join(DATA_DIR, 'categories.json'),
  orders:       path.join(DATA_DIR, 'orders.json'),
  transactions: path.join(DATA_DIR, 'transactions.json'),
};

for (const filePath of Object.values(FILES)) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
  }
}

function read(key) {
  try { 
    const data = fs.readFileSync(FILES[key], 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch { 
    return []; 
  }
}

function write(key, data) {
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf8');
}

export const db = {
  data: {
    accounts: read('accounts'),
    stocks: read('stocks'),
    orders: read('orders')
  },
  
  write() {
    write('accounts', this.data.accounts);
    write('stocks', this.data.stocks);
    write('orders', this.data.orders);
  },

  getUser(userId) {
    return read('users').find(u => u.userId === String(userId)) || null;
  },

  getOrCreateUser(userId, username) {
    const users = read('users');
    let user = users.find(u => u.userId === String(userId));
    if (!user) {
      user = {
        userId:    String(userId),
        username:  username || '',
        balance:   0,
        createdAt: Date.now(),
      };
      users.push(user);
      write('users', users);
    }
    return user;
  },

  updateUser(userId, updates) {
    const users = read('users');
    const idx = users.findIndex(u => u.userId === String(userId));
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    write('users', users);
    return users[idx];
  },

  getAllUsers() { return read('users'); },

  getAccounts()      { return read('accounts'); },
  getAccount(id)     { return read('accounts').find(a => a.id === id) || null; },

  addAccount(account) {
    const accounts = read('accounts');
    accounts.push(account);
    write('accounts', accounts);
    this.data.accounts = accounts;
    return account;
  },

  updateAccount(id, updates) {
    const accounts = read('accounts');
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) return null;
    accounts[idx] = { ...accounts[idx], ...updates };
    write('accounts', accounts);
    this.data.accounts = accounts;
    return accounts[idx];
  },
  
  deleteAccount(id) {
    let accounts = read('accounts');
    accounts = accounts.filter(a => a.id !== id);
    write('accounts', accounts);
    this.data.accounts = accounts;
    return true;
  },

  getAccountsByCategory(categoryId) {
    return read('accounts').filter(a => a.categoryId === categoryId && a.status === 'available');
  },

  getUnassignedAccounts() {
    return read('accounts').filter(a => !a.categoryId && a.status === 'available');
  },

  getStocks()      { return read('stocks'); },
  getStock(id)     { return read('stocks').find(s => s.id === id) || null; },

  addStock(stock) {
    const stocks = read('stocks');
    stocks.push(stock);
    write('stocks', stocks);
    this.data.stocks = stocks;
    return stock;
  },

  updateStock(id, updates) {
    const stocks = read('stocks');
    const idx = stocks.findIndex(s => s.id === id);
    if (idx === -1) return null;
    stocks[idx] = { ...stocks[idx], ...updates };
    write('stocks', stocks);
    this.data.stocks = stocks;
    return stocks[idx];
  },
  
  deleteStock(id) {
    let stocks = read('stocks');
    stocks = stocks.filter(s => s.id !== id);
    write('stocks', stocks);
    this.data.stocks = stocks;
    return true;
  },

  getCategories()   { return read('categories'); },
  getCategory(id)   { return read('categories').find(c => c.id === id) || null; },

  addCategory(category) {
    const categories = read('categories');
    categories.push(category);
    write('categories', categories);
    return category;
  },

  updateCategory(id, updates) {
    const categories = read('categories');
    const idx = categories.findIndex(c => c.id === id);
    if (idx === -1) return null;
    categories[idx] = { ...categories[idx], ...updates };
    write('categories', categories);
    return categories[idx];
  },

  getOrders(userId)  { return read('orders').filter(o => o.userId === String(userId)); },
  getOrder(id)       { return read('orders').find(o => o.id === id) || null; },
  getAllOrders()     { return read('orders'); },

  addOrder(order) {
    const orders = read('orders');
    orders.push(order);
    write('orders', orders);
    this.data.orders = orders;
    return order;
  },

  updateOrder(id, updates) {
    const orders = read('orders');
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...updates };
    write('orders', orders);
    this.data.orders = orders;
    return orders[idx];
  },

  getActiveOrderByAccount(accountId) {
    return read('orders').find(
      o => o.accountId === accountId && o.status !== 'completed' && o.status !== 'cancelled'
    ) || null;
  },

  getTransactions(userId) {
    return read('transactions').filter(t => t.userId === String(userId));
  },
  getTransaction(id) { return read('transactions').find(t => t.id === id) || null; },

  addTransaction(tx) {
    const transactions = read('transactions');
    transactions.push(tx);
    write('transactions', transactions);
    return tx;
  },

  updateTransaction(id, updates) {
    const transactions = read('transactions');
    const idx = transactions.findIndex(t => t.id === id);
    if (idx === -1) return null;
    transactions[idx] = { ...transactions[idx], ...updates };
    write('transactions', transactions);
    return transactions[idx];
  },

  getPendingTransactions() {
    return read('transactions').filter(t => t.status === 'pending' && t.type === 'deposit');
  },
};
