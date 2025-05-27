const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database file paths
const DB_USERS = path.join(__dirname, 'data', 'users.json');
const DB_CART = path.join(__dirname, 'data', 'carts.json');
const DB_ORDERS = path.join(__dirname, 'data', 'orders.json');

// Initialize database files
async function initDatabase() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        
        // Initialize users.json
        try {
            await fs.access(DB_USERS);
        } catch {
            await fs.writeFile(DB_USERS, JSON.stringify([]));
        }
        
        // Initialize carts.json
        try {
            await fs.access(DB_CART);
        } catch {
            await fs.writeFile(DB_CART, JSON.stringify({}));
        }
        
        // Initialize orders.json
        try {
            await fs.access(DB_ORDERS);
        } catch {
            await fs.writeFile(DB_ORDERS, JSON.stringify([]));
        }
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
        return filePath.includes('users') ? [] : filePath.includes('carts') ? {} : [];
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

// Routes

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const users = await readJSON(DB_USERS);
        
        // Check if user already exists
        if (users.find(u => u.email === email || u.username === username)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeJSON(DB_USERS, users);

        // Generate token
        const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email
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
        const user = users.find(u => u.username === username || u.email === username);

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Generate token
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get cart
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

// Add to cart
app.post('/api/cart', authenticateToken, async (req, res) => {
    try {
        const { itemId, name, price, type } = req.body;
        
        const carts = await readJSON(DB_CART);
        if (!carts[req.user.id]) {
            carts[req.user.id] = [];
        }

        // Check if item already exists in cart
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

        // Emit real-time update
        io.to(req.user.id).emit('cartUpdated', carts[req.user.id]);

        res.json({ success: true, cart: carts[req.user.id] });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove from cart
app.delete('/api/cart/:itemId', authenticateToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        
        const carts = await readJSON(DB_CART);
        if (!carts[req.user.id]) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        carts[req.user.id] = carts[req.user.id].filter(item => item.itemId !== itemId);
        await writeJSON(DB_CART, carts);

        // Emit real-time update
        io.to(req.user.id).emit('cartUpdated', carts[req.user.id]);

        res.json({ success: true, cart: carts[req.user.id] });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Checkout - redirect to Facebook
app.post('/api/checkout', authenticateToken, async (req, res) => {
    try {
        const carts = await readJSON(DB_CART);
        const userCart = carts[req.user.id] || [];
        
        if (userCart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Calculate total
        const total = userCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Save order
        const orders = await readJSON(DB_ORDERS);
        const newOrder = {
            id: Date.now().toString(),
            userId: req.user.id,
            username: req.user.username,
            items: userCart,
            total,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        orders.push(newOrder);
        await writeJSON(DB_ORDERS, orders);

        // Clear cart
        carts[req.user.id] = [];
        await writeJSON(DB_CART, carts);

        // Emit real-time update
        io.to(req.user.id).emit('cartUpdated', []);
        io.emit('newOrder', newOrder); // Notify admin/owner

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
                email: user.email,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
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
            console.log(`User ${decoded.username} authenticated and joined room ${decoded.id}`);
        } catch (error) {
            console.error('Socket authentication error:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});

module.exports = app;
