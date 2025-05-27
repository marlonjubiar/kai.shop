// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kai-shop-secret-key-2025';

// Multer configuration for avatar uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database file paths
const DB_USERS = path.join(__dirname, 'data', 'users.json');
const DB_CART = path.join(__dirname, 'data', 'carts.json');
const DB_ORDERS = path.join(__dirname, 'data', 'orders.json');
const DB_NOTIFICATIONS = path.join(__dirname, 'data', 'notifications.json');

// Initialize database files
async function initDatabase() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        await fs.mkdir(path.join(__dirname, 'public', 'uploads', 'avatars'), { recursive: true });
        
        const files = [
            { path: DB_USERS, default: [] },
            { path: DB_CART, default: {} },
            { path: DB_ORDERS, default: [] },
            { path: DB_NOTIFICATIONS, default: {} }
        ];
        
        for (const file of files) {
            try {
                await fs.access(file.path);
            } catch {
                await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
            }
        }
        
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Database helper functions
async function readJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        if (filePath.includes('users')) return [];
        if (filePath.includes('carts') || filePath.includes('notifications')) return {};
        return [];
    }
}

async function writeJSON(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// Admin check middleware
function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Routes

// Register (removed email requirement)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const users = await readJSON(DB_USERS);
        
        // Check if user already exists
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username,
            password: hashedPassword,
            role: users.length === 0 ? 'admin' : 'user', // First user is admin
            avatar: null,
            bio: '',
            joinedAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            stats: {
                totalOrders: 0,
                totalSpent: 0
            }
        };

        users.push(newUser);
        await writeJSON(DB_USERS, users);

        // Generate token
        const token = jwt.sign({ 
            id: newUser.id, 
            username: newUser.username, 
            role: newUser.role 
        }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
                avatar: newUser.avatar,
                bio: newUser.bio,
                joinedAt: newUser.joinedAt,
                stats: newUser.stats
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const users = await readJSON(DB_USERS);
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        // Update last active
        user.lastActive = new Date().toISOString();
        await writeJSON(DB_USERS, users);

        // Generate token
        const token = jwt.sign({ 
            id: user.id, 
            username: user.username, 
            role: user.role 
        }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio,
                joinedAt: user.joinedAt,
                lastActive: user.lastActive,
                stats: user.stats
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const users = await readJSON(DB_USERS);
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio,
                joinedAt: user.joinedAt,
                lastActive: user.lastActive,
                stats: user.stats
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update profile
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { bio, avatar } = req.body;
        const users = await readJSON(DB_USERS);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (bio !== undefined) {
            users[userIndex].bio = bio.slice(0, 200); // Limit bio to 200 chars
        }

        if (avatar !== undefined) {
            users[userIndex].avatar = avatar;
        }

        users[userIndex].lastActive = new Date().toISOString();
        await writeJSON(DB_USERS, users);

        res.json({
            success: true,
            user: {
                id: users[userIndex].id,
                username: users[userIndex].username,
                role: users[userIndex].role,
                avatar: users[userIndex].avatar,
                bio: users[userIndex].bio,
                joinedAt: users[userIndex].joinedAt,
                lastActive: users[userIndex].lastActive,
                stats: users[userIndex].stats
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Upload avatar
app.post('/api/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Save file as base64
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        
        const users = await readJSON(DB_USERS);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        users[userIndex].avatar = base64Image;
        users[userIndex].lastActive = new Date().toISOString();
        await writeJSON(DB_USERS, users);

        res.json({
            success: true,
            avatar: base64Image
        });
    } catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cart routes
app.get('/api/cart', authenticateToken, async (req, res) => {
    try {
        const carts = await readJSON(DB_CART);
        const userCart = carts[req.user.id] || [];
        res.json({ cart: userCart });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/cart', authenticateToken, async (req, res) => {
    try {
        const { itemId, name, price, type } = req.body;
        
        const carts = await readJSON(DB_CART);
        if (!carts[req.user.id]) {
            carts[req.user.id] = [];
        }

        const existingItem = carts[req.user.id].find(item => item.itemId === itemId);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            carts[req.user.id].push({
                itemId,
                name,
                price,
                type,
                quantity: 1,
                addedAt: new Date().toISOString()
            });
        }

        await writeJSON(DB_CART, carts);
        io.to(req.user.id).emit('cartUpdated', carts[req.user.id]);

        res.json({ success: true, cart: carts[req.user.id] });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/cart/:itemId', authenticateToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        
        const carts = await readJSON(DB_CART);
        if (!carts[req.user.id]) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        carts[req.user.id] = carts[req.user.id].filter(item => item.itemId !== itemId);
        await writeJSON(DB_CART, carts);

        io.to(req.user.id).emit('cartUpdated', carts[req.user.id]);
        res.json({ success: true, cart: carts[req.user.id] });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Order routes
app.post('/api/checkout', authenticateToken, async (req, res) => {
    try {
        const carts = await readJSON(DB_CART);
        const userCart = carts[req.user.id] || [];
        
        if (userCart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        const total = userCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Generate random bonus for mega deal
        let bonus = '';
        const megaDeal = userCart.find(item => item.itemId === '100b-mega-deal');
        if (megaDeal) {
            const bonusAmount = Math.floor(Math.random() * 16) + 5; // 5-20B
            bonus = `${bonusAmount}B Bonus Sheckles`;
        }

        const orders = await readJSON(DB_ORDERS);
        const newOrder = {
            id: Date.now().toString(),
            userId: req.user.id,
            username: req.user.username,
            items: userCart,
            total,
            bonus,
            status: 'pending',
            createdAt: new Date().toISOString(),
            adminReplies: [],
            customerMessage: req.body.message || ''
        };

        orders.push(newOrder);
        await writeJSON(DB_ORDERS, orders);

        // Update user stats
        const users = await readJSON(DB_USERS);
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].stats.totalOrders += 1;
            users[userIndex].stats.totalSpent += total;
            await writeJSON(DB_USERS, users);
        }

        // Clear cart
        carts[req.user.id] = [];
        await writeJSON(DB_CART, carts);

        // Create notification for user
        const notifications = await readJSON(DB_NOTIFICATIONS);
        if (!notifications[req.user.id]) {
            notifications[req.user.id] = [];
        }
        
        notifications[req.user.id].unshift({
            id: Date.now().toString(),
            type: 'order_created',
            title: 'Order Placed Successfully',
            message: `Your order #${newOrder.id.slice(-6)} has been placed and is pending approval.`,
            orderId: newOrder.id,
            read: false,
            createdAt: new Date().toISOString()
        });
        await writeJSON(DB_NOTIFICATIONS, notifications);

        // Emit real-time updates
        io.to(req.user.id).emit('cartUpdated', []);
        io.to(req.user.id).emit('orderUpdate', newOrder);
        io.to(req.user.id).emit('notification', notifications[req.user.id][0]);
        
        // Notify admins
        const admins = users.filter(u => u.role === 'admin');
        admins.forEach(admin => {
            io.to(admin.id).emit('newOrder', newOrder);
        });

        res.json({
            success: true,
            order: newOrder,
            redirectUrl: 'https://www.facebook.com/ryoevisu'
        });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user orders
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await readJSON(DB_ORDERS);
        const userOrders = orders.filter(order => order.userId === req.user.id)
                                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ orders: userOrders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get all orders
app.get('/api/admin/orders', authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await readJSON(DB_ORDERS);
        const sortedOrders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ orders: sortedOrders });
    } catch (error) {
        console.error('Get admin orders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Reply to order
app.post('/api/admin/orders/:orderId/reply', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { message, status } = req.body;
        
        const orders = await readJSON(DB_ORDERS);
        const orderIndex = orders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const reply = {
            id: Date.now().toString(),
            adminId: req.user.id,
            adminUsername: req.user.username,
            message,
            createdAt: new Date().toISOString()
        };

        orders[orderIndex].adminReplies.push(reply);
        
        if (status) {
            orders[orderIndex].status = status;
        }

        await writeJSON(DB_ORDERS, orders);

        // Create notification for customer
        const notifications = await readJSON(DB_NOTIFICATIONS);
        const customerId = orders[orderIndex].userId;
        
        if (!notifications[customerId]) {
            notifications[customerId] = [];
        }

        const notificationMessage = status === 'completed' ? 
            'Your order has been completed!' : 
            status === 'cancelled' ? 
            'Your order has been cancelled.' :
            'Admin replied to your order.';

        notifications[customerId].unshift({
            id: Date.now().toString(),
            type: 'admin_reply',
            title: `Order #${orderId.slice(-6)} Update`,
            message: notificationMessage,
            orderId: orderId,
            adminReply: message,
            read: false,
            createdAt: new Date().toISOString()
        });
        await writeJSON(DB_NOTIFICATIONS, notifications);

        // Emit real-time updates
        io.to(customerId).emit('orderUpdate', orders[orderIndex]);
        io.to(customerId).emit('notification', notifications[customerId][0]);

        res.json({ success: true, order: orders[orderIndex] });
    } catch (error) {
        console.error('Admin reply error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await readJSON(DB_NOTIFICATIONS);
        const userNotifications = notifications[req.user.id] || [];
        
        res.json({ notifications: userNotifications });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const notifications = await readJSON(DB_NOTIFICATIONS);
        
        if (!notifications[req.user.id]) {
            return res.status(404).json({ error: 'Notifications not found' });
        }

        const notificationIndex = notifications[req.user.id].findIndex(n => n.id === notificationId);
        if (notificationIndex !== -1) {
            notifications[req.user.id][notificationIndex].read = true;
            await writeJSON(DB_NOTIFICATIONS, notifications);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.join(decoded.id);
            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            console.log(`User ${decoded.username} authenticated and joined room ${decoded.id}`);
            
            // Join admin room if admin
            if (decoded.role === 'admin') {
                socket.join('admins');
            }
        } catch (error) {
            console.error('Socket authentication error:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Serve different pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'loginsignup.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Default route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📱 Main site: http://localhost:${PORT}`);
        console.log(`🔐 Login page: http://localhost:${PORT}/login`);
        console.log(`👑 Admin panel: http://localhost:${PORT}/admin`);
    });
});

module.exports = app;
