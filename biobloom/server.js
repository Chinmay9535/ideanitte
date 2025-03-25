const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const config = require('./config');
const translationService = require('./services/translationService');
const aqiService = require('./services/aqiService');

const app = express();

// Security Middleware
app.use(helmet()); // Adds various HTTP headers for security
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS attacks

// Rate limiting
const authLimiter = rateLimit({
    windowMs: config.security.rateLimitWindow,
    max: config.security.rateLimitMax,
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to auth routes
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Basic Middleware
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.static(path.join(__dirname)));

// MongoDB Connection with config
mongoose.connect(config.database.uri, config.database.options)
    .then(() => {
        console.log('Connected to MongoDB successfully');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if database connection fails
    });

// User Schema with validation
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxLength: [50, 'Name cannot be more than 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minLength: [8, 'Password must be at least 8 characters']
    },
    searchHistory: {
        type: [{
            previousCrop: {
                type: String,
                required: true,
                trim: true
            },
            soilType: {
                type: String,
                required: true,
                trim: true
            },
            region: {
                type: String,
                required: true,
                trim: true
            },
            farmSize: {
                type: Number,
                required: true,
                min: [0, 'Farm size cannot be negative']
            },
            recommendations: {
                type: Object,
                required: true
            },
            timestamp: {
                type: Date,
                default: Date.now
            }
        }],
        validate: [arrayLimit, '{PATH} exceeds the limit of 100']
    }
});

// Validate array limit
function arrayLimit(val) {
    return val.length <= 100;
}

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ 'searchHistory.timestamp': -1 });

const User = mongoose.model('User', userSchema);

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ 
            status: 'error',
            message: 'Please login to access this feature'
        });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({
            status: 'error',
            message: 'Your session has expired. Please login again'
        });
    }
};

// Routes
app.post('/api/register', async (req, res) => {
    console.log('Received registration request:', req.body);
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('User already exists:', email);
            return res.status(400).json({ error: 'This email is already registered. Please login instead.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword
        });

        await user.save();
        console.log('User registered successfully:', email);
        res.status(201).json({ message: 'Registration successful! Please login.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('Received login request:', req.body.email);
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            console.log('Missing login credentials');
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found:', email);
            return res.status(400).json({ error: 'No account found with this email. Please register first.' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Invalid password for user:', email);
            return res.status(400).json({ error: 'Incorrect password. Please try again.' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            config.jwt.secret,
            { expiresIn: '24h' }
        );

        console.log('User logged in successfully:', email);
        res.json({ 
            token, 
            user: { 
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Save search history
app.post('/api/save-search', authenticateToken, async (req, res) => {
    try {
        const { previousCrop, soilType, region, farmSize, recommendations } = req.body;
        
        // Validate the data
        if (!previousCrop || !soilType || !region || !farmSize || !recommendations) {
            console.log('Missing required search data');
            return res.status(400).json({ error: 'Missing required search data' });
        }

        // Update user's search history
        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            {
                $push: {
                    searchHistory: {
                        previousCrop,
                        soilType,
                        region,
                        farmSize,
                        recommendations,
                        timestamp: new Date()
                    }
                }
            },
            { new: true } // Return the updated document
        );

        if (!updatedUser) {
            console.log('User not found for search history update');
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Search history saved successfully for user:', updatedUser.email);
        res.json({ 
            message: 'Search history saved successfully',
            searchHistory: updatedUser.searchHistory
        });
    } catch (error) {
        console.error('Save search error:', error);
        res.status(500).json({ error: 'Failed to save search history' });
    }
});

// Get user's search history with pagination
app.get('/api/search-history', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'timestamp';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        // Validate pagination parameters
        if (page < 1 || limit < 1 || limit > 50) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid pagination parameters. Page must be >= 1 and limit between 1 and 50'
            });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Calculate total items and pages
        const totalItems = user.searchHistory.length;
        const totalPages = Math.ceil(totalItems / limit);

        // Sort and paginate search history
        const sortedHistory = user.searchHistory
            .sort((a, b) => {
                if (sortBy === 'timestamp') {
                    return (new Date(b[sortBy]) - new Date(a[sortBy])) * sortOrder;
                }
                return (a[sortBy] > b[sortBy] ? 1 : -1) * sortOrder;
            })
            .slice((page - 1) * limit, page * limit);

        res.json({
            status: 'success',
            data: {
                history: sortedHistory,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                },
                sort: {
                    field: sortBy,
                    order: sortOrder === 1 ? 'asc' : 'desc'
                }
            }
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to load search history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Translation endpoint
app.post('/api/translate', async (req, res) => {
    try {
        const { text, target_language, to_english = false } = req.body;
        
        if (!text || !target_language) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters'
            });
        }

        const result = await translationService.translateText(text, target_language, to_english);
        res.json(result);

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Translation failed',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Helper function to process recommendations with translations
async function processRecommendationsWithTranslation(recommendations, targetLanguage) {
    try {
        // First, ensure we have recommendations in English
        const englishRecommendations = recommendations;
        
        // Translate each part of the recommendations
        const translatedRecommendations = {};
        
        for (const [key, value] of Object.entries(englishRecommendations)) {
            if (typeof value === 'string') {
                // Translate string values
                const response = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: value,
                        target_language: targetLanguage
                    })
                });
                const result = await response.json();
                translatedRecommendations[key] = result.translated_text;
            } else if (Array.isArray(value)) {
                // Translate array values
                translatedRecommendations[key] = await Promise.all(
                    value.map(async (item) => {
                        const response = await fetch('/api/translate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                text: typeof item === 'string' ? item : JSON.stringify(item),
                                target_language: targetLanguage
                            })
                        });
                        const result = await response.json();
                        return result.translated_text;
                    })
                );
            } else if (typeof value === 'object') {
                // Recursively translate nested objects
                translatedRecommendations[key] = await processRecommendationsWithTranslation(value, targetLanguage);
            } else {
                // Keep non-string values as is
                translatedRecommendations[key] = value;
            }
        }
        
        return translatedRecommendations;
    } catch (error) {
        console.error('Error processing translations:', error);
        return recommendations; // Return original if translation fails
    }
}

// AQI endpoint
app.get('/api/aqi', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({
                status: 'error',
                message: 'Latitude and longitude are required'
            });
        }

        const data = await aqiService.getCurrentAQI(lat, lon);
        res.json(data);

    } catch (error) {
        console.error('AQI fetch error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch AQI data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));