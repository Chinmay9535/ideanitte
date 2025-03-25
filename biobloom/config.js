const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI',
  'NODE_ENV'
];

// Validate required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Configuration object with defaults where appropriate
const config = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV
  },
  security: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes in milliseconds
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // maximum 100 requests per window
    API_KEY: '47eb2a7db4e440e893012615ea36ae6e',
    UPDATE_INTERVAL: 15 * 60 * 1000, // 15 minutes
    RETRY_TIMEOUT: 30 * 1000, // 30 seconds
    DEFAULT_LOCATION: {
      latitude: 12.9716, // Default to Bangalore coordinates
      longitude: 77.5946
    }
  }
};

// Freeze the configuration object to prevent modifications
module.exports = Object.freeze(config); 