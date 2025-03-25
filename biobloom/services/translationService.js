const Redis = require('ioredis');
const { promisify } = require('util');
const { spawn } = require('child_process');

// Initialize Redis client
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
        if (times > 3) {
            return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 100, 3000); // Exponential backoff
    }
});

// Handle Redis errors
redis.on('error', (err) => {
    console.error('Redis error:', err);
});

// Cache configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const BATCH_SIZE = 10; // Number of translations to process in parallel

class TranslationService {
    constructor() {
        this.translationQueue = [];
        this.processingBatch = false;
    }

    async translateText(text, targetLanguage, toEnglish = false) {
        try {
            // Generate cache key
            const cacheKey = `trans:${text}:${targetLanguage}:${toEnglish}`;

            // Check cache first
            const cachedResult = await redis.get(cacheKey);
            if (cachedResult) {
                return JSON.parse(cachedResult);
            }

            // Add to queue and process
            return new Promise((resolve, reject) => {
                this.translationQueue.push({
                    text,
                    targetLanguage,
                    toEnglish,
                    cacheKey,
                    resolve,
                    reject
                });

                this.processBatchIfNeeded();
            });
        } catch (error) {
            console.error('Translation error:', error);
            throw error;
        }
    }

    async processBatchIfNeeded() {
        if (this.processingBatch || this.translationQueue.length === 0) {
            return;
        }

        this.processingBatch = true;
        const batch = this.translationQueue.splice(0, BATCH_SIZE);

        try {
            const results = await Promise.all(
                batch.map(item => this.processTranslation(item))
            );

            // Store results in cache and resolve promises
            results.forEach((result, index) => {
                const item = batch[index];
                if (result.success) {
                    redis.setex(item.cacheKey, CACHE_TTL, JSON.stringify(result));
                    item.resolve(result);
                } else {
                    item.reject(new Error(result.error || 'Translation failed'));
                }
            });
        } catch (error) {
            batch.forEach(item => item.reject(error));
        } finally {
            this.processingBatch = false;
            if (this.translationQueue.length > 0) {
                this.processBatchIfNeeded();
            }
        }
    }

    async processTranslation({ text, targetLanguage, toEnglish }) {
        return new Promise((resolve, reject) => {
            const timeoutMs = 30000;
            const python = spawn('python', [
                'translator.py',
                text,
                targetLanguage,
                toEnglish.toString()
            ]);

            let result = '';
            let error = '';
            let timeoutId = setTimeout(() => {
                python.kill();
                reject(new Error('Translation timed out'));
            }, timeoutMs);

            python.stdout.on('data', (data) => {
                result += data.toString();
            });

            python.stderr.on('data', (data) => {
                error += data.toString();
            });

            python.on('close', (code) => {
                clearTimeout(timeoutId);
                if (code !== 0) {
                    reject(new Error(error || 'Translation process failed'));
                } else {
                    try {
                        resolve(JSON.parse(result));
                    } catch (e) {
                        reject(new Error('Invalid translation result'));
                    }
                }
            });

            python.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    async clearCache() {
        try {
            const keys = await redis.keys('trans:*');
            if (keys.length > 0) {
                await redis.del(keys);
            }
            return true;
        } catch (error) {
            console.error('Cache clear error:', error);
            return false;
        }
    }
}

module.exports = new TranslationService(); 