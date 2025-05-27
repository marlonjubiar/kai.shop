// public/js/app.js
// Initialize Lucide icons
lucide.createIcons();

// Initialize socket connection
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        if (authToken) {
            socket.emit('authenticate', authToken);
        }
    });
    
    socket.on('cartUpdated', (cart) => {
        userCart = cart;
        updateCartUI();
    });
    
    socket.on('orderUpdate', (order) => {
        showToast(`Order #${order.id.slice(-6)} updated: ${order.status}`, 'info');
        if (document.getElementById('orders-modal').classList.contains('hidden') === false) {
            loadOrders(); // Refresh orders if modal is open
        }
    });
    
    socket.on('notification', (notification) => {
        notifications.unshift(notification);
        updateNotificationsUI();
        showToast(notification.title, 'info');
        
        // Ring notification bell
        const bell = document.getElementById('notifications-btn').querySelector('i');
        bell.classList.add('notification-ring');
        setTimeout(() => {
            bell.classList.remove('notification-ring');
        }, 2000);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// Toast notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white',
        warning: 'bg-yellow-500 text-yellow-900'
    };
    
    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        info: 'info',
        warning: 'alert-triangle'
    };
    
    toast.className = `${colors[type]} px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transform translate-x-full transition-transform duration-300`;
    toast.innerHTML = `
        <i data-lucide="${icons[type]}" class="w-5 h-5"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Show toast
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 100);
    
    // Hide toast
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 5000);
}

// Authentication functions
function updateAuthUI() {
    const authButtons = document.getElementById('auth-buttons');
    const userActions = document.getElementById('user-actions');
    const headerUsername = document.getElementById('header-username');
    const headerAvatar = document.getElementById('header-avatar');
    
    if (currentUser) {
        authButtons.classList.add('hidden');
        userActions.classList.remove('hidden');
        userActions.classList.add('flex');
        headerUsername.textContent = currentUser.username;
        
        // Update header avatar
        if (currentUser.avatar) {
            headerAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        } else {
            headerAvatar.innerHTML = currentUser.username.charAt(0).toUpperCase();
        }
        
        document.getElementById('online-users').textContent = `Welcome, ${currentUser.username}!`;
    } else {
        authButtons.classList.remove('hidden');
        userActions.classList.add('hidden');
        userActions.classList.remove('flex');
        document.getElementById('online-users').textContent = 'Welcome!';
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    userCart = [];
    notifications = [];
    localStorage.removeItem('authToken');
    
    updateAuthUI();
    updateCartUI();
    updateNotificationsUI();
    
    // Close any open modals
    closeProfile();
    closeOrders();
    closeNotifications();
    
    showToast('Logged out successfully', 'info');
    
    // Redirect to login page after 1 second
    setTimeout(() => {
        window.location.href = '/login';
    }, 1000);
}

// Profile functions
function openProfile() {
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    
    document.getElementById('profile-modal').classList.remove('hidden');
    loadProfile();
}

function closeProfile() {
    document.getElementById('profile-modal').classList.add('hidden');
}

async function loadProfile() {
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.user) {
            const user = data.user;
            
            // Update profile modal
            document.getElementById('profile-username').textContent = user.username;
            document.getElementById('profile-role').textContent = user.role === 'admin' ? 'Administrator' : 'Member';
            document.getElementById('profile-bio').value = user.bio || '';
            document.getElementById('total-orders').textContent = user.stats.totalOrders;
            document.getElementById('total-spent').textContent = `₱${user.stats.totalSpent}`;
            document.getElementById('joined-date').textContent = new Date(user.joinedAt).toLocaleDateString();
            document.getElementById('last-active').textContent = new Date(user.lastActive).toLocaleString();
            
            // Update avatar
            const profileAvatar = document.getElementById('profile-avatar');
            if (user.avatar) {
                profileAvatar.innerHTML = `<img src="${user.avatar}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
            } else {
                profileAvatar.innerHTML = `<i data-lucide="user" class="w-8 h-8"></i>`;
            }
            
            // Update bio character count
            updateBioCount();
        }
    } catch (error) {
        console.error('Load profile error:', error);
        showToast('Failed to load profile', 'error');
    }
}

function updateBioCount() {
    const bio = document.getElementById('profile-bio').value;
    document.getElementById('bio-count').textContent = bio.length;
}

async function saveProfile() {
    const bio = document.getElementById('profile-bio').value;
    
    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ bio })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast(data.error || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Save profile error:', error);
        showToast('Network error', 'error');
    }
}

// Avatar cropper functions
function openAvatarCropper() {
    document.getElementById('avatar-cropper-modal').classList.remove('hidden');
}

function closeAvatarCropper() {
    document.getElementById('avatar-cropper-modal').classList.add('hidden');
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    document.getElementById('cropper-container').classList.add('hidden');
    document.getElementById('crop-save-btn').disabled = true;
}

async function cropAndSave() {
    if (!cropper) return;
    
    const canvas = cropper.getCroppedCanvas({
        width: 200,
        height: 200,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });
    
    const croppedImageData = canvas.toDataURL('image/jpeg', 0.8);
    
    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ avatar: croppedImageData })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser.avatar = croppedImageData;
            updateAuthUI();
            
            // Update profile modal avatar
            const profileAvatar = document.getElementById('profile-avatar');
            profileAvatar.innerHTML = `<img src="${croppedImageData}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
            
            closeAvatarCropper();
            showToast('Avatar updated successfully!', 'success');
        } else {
            showToast(data.error || 'Failed to update avatar', 'error');
        }
    } catch (error) {
        console.error('Save avatar error:', error);
        showToast('Network error', 'error');
    }
}

// Cart functions
async function addToCart(itemId, name, price, type) {
    if (!currentUser) {
        showToast('Please sign in to add items to cart', 'error');
        window.location.href = '/login';
        return;
    }
    
    try {
        const response = await fetch('/api/cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ itemId, name, price, type })
        });
        
        const data = await response.json();
        
        if (data.success) {
            userCart = data.cart;
            updateCartUI();
            showToast('Added to cart!', 'success');
            
            // Add visual feedback to button
            const buttons = document.querySelectorAll(`[onclick*="${itemId}"]`);
            buttons.forEach(btn => {
                btn.classList.add('animate-bounce-gentle');
                setTimeout(() => {
                    btn.classList.remove('animate-bounce-gentle');
                }, 600);
            });
        } else {
            showToast(data.error || 'Failed to add to cart', 'error');
        }
    } catch (error) {
        console.error('Add to cart error:', error);
        showToast('Network error', 'error');
    }
}

async function removeFromCart(itemId) {
    try {
        const response = await fetch(`/api/cart/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            userCart = data.cart;
            updateCartUI();
            showToast('Removed from cart', 'info');
        } else {
            showToast(data.error || 'Failed to remove from cart', 'error');
        }
    } catch (error) {
        console.error('Remove from cart error:', error);
        showToast('Network error', 'error');
    }
}

async function loadCart() {
    if (!authToken) return;
    
    try {
        const response = await fetch('/api/cart', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.cart) {
            userCart = data.cart;
            updateCartUI();
        }
    } catch (error) {
        console.error('Load cart error:', error);
    }
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const checkoutBtn = cartItems.parentElement.nextElementSibling.querySelector('button');
    
    const totalItems = userCart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = userCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Update cart count
    if (totalItems > 0) {
        cartCount.textContent = totalItems;
        cartCount.classList.remove('scale-0');
        cartCount.classList.add('scale-100');
    } else {
        cartCount.classList.add('scale-0');
        cartCount.classList.remove('scale-100');
    }
    
    // Update cart items
    if (userCart.length === 0) {
        cartItems.innerHTML = `
            <div class="text-center text-muted-foreground">
                <i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-4 opacity-50"></i>
                <p>Your cart is empty</p>
                <p class="text-sm mt-2">Add some items to get started!</p>
            </div>
        `;
        checkoutBtn.disabled = true;
    } else {
        cartItems.innerHTML = userCart.map(item => `
            <div class="flex items-center justify-between p-4 border border-border rounded-lg mb-3 bg-secondary/20">
                <div class="flex-1">
                    <h4 class="font-medium text-sm">${item.name}</h4>
                    <p class="text-xs text-muted-foreground">Qty: ${item.quantity} • Type: ${item.type}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-sm">₱${(item.price * item.quantity).toFixed(2)}</p>
                    <button onclick="removeFromCart('${item.itemId}')" class="text-xs text-destructive hover:underline transition-colors">
                        Remove
                    </button>
                </div>
            </div>
        `).join('');
        checkoutBtn.disabled = false;
    }
    
    // Update total
    cartTotal.textContent = `₱${totalPrice.toFixed(2)}`;
    
    // Re-initialize icons
    lucide.createIcons();
}

async function checkout() {
    if (userCart.length === 0) {
        showToast('Your cart is empty', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                message: 'Thank you for choosing kai.shop!'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeCart();
            showToast('Order placed successfully!', 'success');
            
            // Clear cart UI immediately
            userCart = [];
            updateCartUI();
            
            // Show order details
            showOrderConfirmation(data.order);
            
            // Redirect to Facebook after 3 seconds
            setTimeout(() => {
                window.open(data.redirectUrl, '_blank');
            }, 3000);
        } else {
            showToast(data.error || 'Checkout failed', 'error');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Network error', 'error');
    }
}

function showOrderConfirmation(order) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-2xl p-6 shadow-2xl z-50 animate-scale-in max-w-md w-full mx-4';
    
    toast.innerHTML = `
        <div class="text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-4">
                <i data-lucide="check-circle" class="w-8 h-8"></i>
            </div>
            <h3 class="text-xl font-bold mb-2">Order Confirmed!</h3>
            <p class="text-muted-foreground mb-4">Order #${order.id.slice(-6)} has been placed</p>
            <div class="bg-secondary/30 p-4 rounded-lg mb-4">
                <div class="flex justify-between items-center">
                    <span class="font-medium">Total:</span>
                    <span class="font-bold text-lg">₱${order.total}</span>
                </div>
                ${order.bonus ? `<div class="text-sm text-green-600 font-medium mt-2">🎉 Bonus: ${order.bonus}</div>` : ''}
            </div>
            <p class="text-sm text-muted-foreground mb-4">Status: <span class="text-yellow-600 font-medium">Pending</span></p>
            <p class="text-xs text-muted-foreground">Redirecting to contact support...</p>
        </div>
    `;
    
    document.body.appendChild(toast);
    lucide.createIcons();
    
    // Remove after 8 seconds
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 8000);
}

function openCart() {
    if (!currentUser) {
        showToast('Please sign in to view cart', 'error');
        window.location.href = '/login';
        return;
    }
    
    document.getElementById('cart-sidebar').classList.remove('translate-x-full');
}

function closeCart() {
    document.getElementById('cart-sidebar').classList.add('translate-x-full');
}

// Orders functions
function viewOrders() {
    closeProfile();
    openOrders();
}

function openOrders() {
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    
    document.getElementById('orders-modal').classList.remove('hidden');
    loadOrders();
}

function closeOrders() {
    document.getElementById('orders-modal').classList.add('hidden');
}

async function loadOrders() {
    const ordersContent = document.getElementById('orders-content');
    ordersContent.innerHTML = `
        <div class="text-center text-muted-foreground">
            <i data-lucide="loader-2" class="w-8 h-8 mx-auto mb-4 animate-spin"></i>
            <p>Loading orders...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/orders', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.orders && data.orders.length > 0) {
            ordersContent.innerHTML = data.orders.map(order => `
                <div class="border border-border rounded-xl p-6 mb-4 bg-card">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h4 class="font-semibold text-lg">Order #${order.id.slice(-6)}</h4>
                            <p class="text-sm text-muted-foreground">${new Date(order.createdAt).toLocaleString()}</p>
                        </div>
                        <div class="text-right">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}">
                                ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                            <p class="font-bold text-lg mt-1">₱${order.total}</p>
                        </div>
                    </div>
                    
                    <div class="space-y-2 mb-4">
                        ${order.items.map(item => `
                            <div class="flex justify-between text-sm">
                                <span>${item.name} x${item.quantity}</span>
                                <span>₱${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${order.bonus ? `
                        <div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                            <div class="flex items-center space-x-2">
                                <i data-lucide="gift" class="w-4 h-4 text-green-600"></i>
                                <span class="text-sm font-medium text-green-800">Bonus: ${order.bonus}</span>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${order.adminReplies && order.adminReplies.length > 0 ? `
                        <div class="border-t border-border pt-4">
                            <h5 class="font-medium mb-3 flex items-center space-x-2">
                                <i data-lucide="message-circle" class="w-4 h-4"></i>
                                <span>Admin Replies</span>
                            </h5>
                            <div class="space-y-3">
                                ${order.adminReplies.map(reply => `
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                        <div class="flex justify-between items-start mb-1">
                                            <span class="text-sm font-medium text-blue-800">${reply.adminUsername}</span>
                                            <span class="text-xs text-blue-600">${new Date(reply.createdAt).toLocaleString()}</span>
                                        </div>
                                        <p class="text-sm text-blue-700">${reply.message}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        } else {
            ordersContent.innerHTML = `
                <div class="text-center text-muted-foreground">
                    <i data-lucide="package" class="w-12 h-12 mx-auto mb-4 opacity-50"></i>
                    <p>No orders found</p>
                    <p class="text-sm mt-2">Start shopping to see your orders here!</p>
                </div>
            `;
        }
        
        lucide.createIcons();
    } catch (error) {
        console.error('Load orders error:', error);
        ordersContent.innerHTML = `
            <div class="text-center text-muted-foreground">
                <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-4 text-red-500"></i>
                <p>Failed to load orders</p>
            </div>
        `;
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'pending':
            return 'bg-yellow-100 text-yellow-800';
        case 'processing':
            return 'bg-blue-100 text-blue-800';
        case 'completed':
            return 'bg-green-100 text-green-800';
        case 'cancelled':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// Notifications functions
function openNotifications() {
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    
    document.getElementById('notifications-modal').classList.remove('hidden');
    loadNotifications();
}

function closeNotifications() {
    document.getElementById('notifications-modal').classList.add('hidden');
}

async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.notifications) {
            notifications = data.notifications;
            updateNotificationsUI();
        }
    } catch (error) {
        console.error('Load notifications error:', error);
    }
}

function updateNotificationsUI() {
    const notificationsCount = document.getElementById('notifications-count');
    const notificationsContent = document.getElementById('notifications-content');
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    // Update notifications count
    if (unreadCount > 0) {
        notificationsCount.textContent = unreadCount > 99 ? '99+' : unreadCount;
        notificationsCount.classList.remove('scale-0');
        notificationsCount.classList.add('scale-100');
    } else {
        notificationsCount.classList.add('scale-0');
        notificationsCount.classList.remove('scale-100');
    }
    
    // Update notifications content
    if (notifications.length === 0) {
        notificationsContent.innerHTML = `
            <div class="text-center text-muted-foreground">
                <i data-lucide="bell" class="w-8 h-8 mx-auto mb-4 opacity-50"></i>
                <p>No notifications</p>
            </div>
        `;
    } else {
        notificationsContent.innerHTML = notifications.map(notification => `
            <div class="p-4 border border-border rounded-lg mb-3 ${notification.read ? 'opacity-60' : 'bg-blue-50'} cursor-pointer hover:bg-accent transition-colors" onclick="markNotificationRead('${notification.id}')">
                <div class="flex items-start space-x-3">
                    <div class="flex-shrink-0">
                        <i data-lucide="${getNotificationIcon(notification.type)}" class="w-5 h-5 ${notification.read ? 'text-muted-foreground' : 'text-blue-600'}"></i>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-medium text-sm ${notification.read ? 'text-muted-foreground' : 'text-foreground'}">${notification.title}</h4>
                        <p class="text-xs text-muted-foreground mt-1">${notification.message}</p>
                        ${notification.adminReply ? `<p class="text-xs text-blue-600 mt-2 font-medium">"${notification.adminReply}"</p>` : ''}
                        <p class="text-xs text-muted-foreground mt-2">${new Date(notification.createdAt).toLocaleString()}</p>
                    </div>
                    ${!notification.read ? '<div class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    lucide.createIcons();
}

function getNotificationIcon(type) {
    switch (type) {
        case 'order_created':
            return 'package';
        case 'admin_reply':
            return 'message-circle';
        case 'order_completed':
            return 'check-circle';
        case 'order_cancelled':
            return 'x-circle';
        default:
            return 'bell';
    }
}

async function markNotificationRead(notificationId) {
    try {
        await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        // Update local notification
        const notification = notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            updateNotificationsUI();
        }
    } catch (error) {
        console.error('Mark notification read error:', error);
    }
}

// Filter and search functionality
const filterTabs = document.querySelectorAll('.filter-tab');
const sections = document.querySelectorAll('.section-content');
const itemCards = document.querySelectorAll('.item-card');

filterTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        const filter = this.getAttribute('data-filter');
        
        // Update active tab
        filterTabs.forEach(t => {
            t.classList.remove('active', 'bg-primary', 'text-primary-foreground');
            t.classList.add('hover:bg-accent');
        });
        this.classList.add('active', 'bg-primary', 'text-primary-foreground');
        this.classList.remove('hover:bg-accent');
        
        // Filter items
        if (filter === 'all') {
            sections.forEach(section => section.style.display = 'block');
            itemCards.forEach(card => card.style.display = 'block');
        } else {
            sections.forEach(section => {
                if (section.getAttribute('data-category') === filter) {
                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            });
        }
    });
});

// Sort functionality
document.getElementById('sort-select').addEventListener('change', function() {
    const sortBy = this.value;
    const containers = document.querySelectorAll('.grid');
    
    containers.forEach(container => {
        const cards = Array.from(container.querySelectorAll('.item-card'));
        
        cards.sort((a, b) => {
            switch(sortBy) {
                case 'price-low':
                    return parseInt(a.getAttribute('data-price')) - parseInt(b.getAttribute('data-price'));
                case 'price-high':
                    return parseInt(b.getAttribute('data-price')) - parseInt(a.getAttribute('data-price'));
                case 'name':
                    return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
                default:
                    return 0;
            }
        });
        
        cards.forEach(card => container.appendChild(card));
    });
});

// Search functionality
const searchInputs = document.querySelectorAll('input[placeholder="Search items..."]');
searchInputs.forEach(input => {
    input.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        itemCards.forEach(card => {
            const itemName = card.getAttribute('data-name').toLowerCase();
            if (itemName.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// Mobile menu toggle
document.getElementById('menu-toggle').addEventListener('click', function() {
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenu.classList.toggle('hidden');
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Close mobile menu if open
            document.getElementById('mobile-menu').classList.add('hidden');
        }
    });
});

// Avatar upload handling
document.getElementById('avatar-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size should be less than 5MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.getElementById('cropper-image');
        img.src = e.target.result;
        
        document.getElementById('cropper-container').classList.remove('hidden');
        document.getElementById('crop-save-btn').disabled = false;
        
        // Initialize cropper
        if (cropper) {
            cropper.destroy();
        }
        
        cropper = new Cropper(img, {
            aspectRatio: 1,
            viewMode: 2,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: false,
            center: true,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
        });
    };
    
    reader.readAsDataURL(file);
});

// Bio character count
document.getElementById('profile-bio').addEventListener('input', updateBioCount);

// Check for existing auth token on page load
async function checkAuth() {
    if (authToken) {
        try {
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.user) {
                currentUser = data.user;
                updateAuthUI();
                loadCart();
                loadNotifications();
            } else {
                // Invalid token
                logout();
            }
        } catch (error) {
            console.error('Auth check error:', error);
            logout();
        }
    }
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    // Profile modal
    if (e.target.id === 'profile-modal') {
        closeProfile();
    }
    
    // Avatar cropper modal
    if (e.target.id === 'avatar-cropper-modal') {
        closeAvatarCropper();
    }
    
    // Orders modal
    if (e.target.id === 'orders-modal') {
        closeOrders();
    }
    
    // Notifications modal
    if (e.target.id === 'notifications-modal') {
        closeNotifications();
    }
    
    // Close cart when clicking outside
    if (!e.target.closest('#cart-sidebar') && !e.target.closest('#cart-btn')) {
        closeCart();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Close modals with Escape key
    if (e.key === 'Escape') {
        closeProfile();
        closeAvatarCropper();
        closeOrders();
        closeNotifications();
        closeCart();
    }
    
    // Open cart with Ctrl+K
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (currentUser) {
            openCart();
        }
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initSocket();
    checkAuth();
    
    // Add loading states to buttons
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', function() {
            if (this.disabled) return;
            
            // Add slight loading animation
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
    
    // Add smooth reveal animations to sections
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in');
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
});

// PWA-like features
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful');
        }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// Handle online/offline status
window.addEventListener('online', function() {
    showToast('Connection restored', 'success');
});

window.addEventListener('offline', function() {
    showToast('Connection lost', 'warning');
});

// Prevent right-click context menu on images (optional security feature)
document.addEventListener('contextmenu', function(e) {
    if (e.target.tagName === 'IMG') {
        e.preventDefault();
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && currentUser) {
        // Refresh data when user returns to tab
        loadNotifications();
    }
});

console.log('🚀 Kai.shop application loaded successfully!');
