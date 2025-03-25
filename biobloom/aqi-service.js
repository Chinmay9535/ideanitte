// AQI Service for handling real-time air quality data
class AQIService {
    constructor() {
        this.API_KEY = '47eb2a7db4e440e893012615ea36ae6e'; // Your Weatherbit API key
        this.location = null;
        this.lastUpdate = null;
        this.updateInterval = 15 * 60 * 1000; // 15 minutes
        this.retryTimeout = 30 * 1000; // 30 seconds
        this.cache = new Map();
        this.historicalData = [];
        this.chart = null;
        this.defaultLocation = {
            latitude: 12.9716,
            longitude: 77.5946
        };
    }

    async initialize() {
        try {
            await this.getLocation();
            await this.startAQIUpdates();
        } catch (error) {
            console.error('Error initializing AQI service:', error);
            // Use default location if geolocation fails
            this.location = this.defaultLocation;
            this.updateLocationDisplay();
            await this.startAQIUpdates();
        }
    }

    async getLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                console.log('Geolocation not supported, using default location');
                this.location = this.defaultLocation;
                resolve(this.location);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                    this.updateLocationDisplay();
                    resolve(this.location);
                },
                (error) => {
                    console.log('Geolocation error:', error);
                    this.location = this.defaultLocation;
                    this.updateLocationDisplay();
                    resolve(this.location);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    updateLocationDisplay() {
        const locationDisplay = document.getElementById('location-display');
        if (this.location) {
            // Reverse geocoding to get location name
            fetch(`https://api.weatherbit.io/v2.0/current?lat=${this.location.latitude}&lon=${this.location.longitude}&key=${this.API_KEY}`)
                .then(response => response.json())
                .then(data => {
                    const cityName = data.data[0].city_name;
                    const countryCode = data.data[0].country_code;
                    locationDisplay.textContent = `${cityName}, ${countryCode}`;
                })
                .catch(() => {
                    // Fallback to coordinates if reverse geocoding fails
                    locationDisplay.textContent = `${this.location.latitude.toFixed(4)}°, ${this.location.longitude.toFixed(4)}°`;
                });
        } else {
            locationDisplay.textContent = 'Location unavailable';
        }
    }

    async getCurrentAQI() {
        if (!this.location) {
            throw new Error('Location not available');
        }

        const cacheKey = `${this.location.latitude},${this.location.longitude}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData && Date.now() - cachedData.timestamp < this.updateInterval) {
            return cachedData.data;
        }

        try {
            const response = await fetch(
                `https://api.weatherbit.io/v2.0/current/airquality?lat=${this.location.latitude}&lon=${this.location.longitude}&key=${this.API_KEY}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch AQI data');
            }

            const data = await response.json();
            const processedData = this.processAQIData(data);
            
            this.cache.set(cacheKey, {
                timestamp: Date.now(),
                data: processedData
            });

            return processedData;
        } catch (error) {
            console.error('Error fetching AQI data:', error);
            throw error;
        }
    }

    processAQIData(data) {
        const aqi = data.data[0];
        return {
            aqi: aqi.aqi,
            timestamp: new Date(data.data[0].ts * 1000),
            pollutants: {
                pm25: aqi.pm25.toFixed(1),
                pm10: aqi.pm10.toFixed(1),
                o3: aqi.o3.toFixed(1),
                no2: aqi.no2.toFixed(1),
                so2: aqi.so2.toFixed(1),
                co: aqi.co.toFixed(1)
            },
            status: this.getAQIStatus(aqi.aqi),
            recommendations: this.getRecommendations(aqi.aqi)
        };
    }

    getAQIStatus(aqi) {
        if (aqi <= 50) return { level: 'good', text: 'Good', color: '#009966' };
        if (aqi <= 100) return { level: 'moderate', text: 'Moderate', color: '#ffde33' };
        if (aqi <= 150) return { level: 'unhealthy-sensitive', text: 'Unhealthy for Sensitive Groups', color: '#ff9933' };
        if (aqi <= 200) return { level: 'unhealthy', text: 'Unhealthy', color: '#cc0033' };
        return { level: 'very-unhealthy', text: 'Very Unhealthy', color: '#660099' };
    }

    getRecommendations(aqi) {
        const recommendations = [];
        
        if (aqi <= 50) {
            recommendations.push(
                { icon: '🌱', text: 'Ideal conditions for outdoor farming activities' },
                { icon: '🌿', text: 'Perfect time for planting and harvesting' }
            );
        } else if (aqi <= 100) {
            recommendations.push(
                { icon: '😷', text: 'Consider wearing masks during extended outdoor work' },
                { icon: '⏰', text: 'Plan heavy outdoor work during early morning or evening' }
            );
        } else if (aqi <= 150) {
            recommendations.push(
                { icon: '⚠️', text: 'Limit prolonged outdoor farming activities' },
                { icon: '💧', text: 'Increase irrigation to help settle dust' }
            );
        } else if (aqi <= 200) {
            recommendations.push(
                { icon: '🚫', text: 'Avoid non-essential outdoor farming activities' },
                { icon: '🏡', text: 'Focus on indoor agricultural tasks' }
            );
        } else {
            recommendations.push(
                { icon: '⛔', text: 'Suspend all outdoor farming activities' },
                { icon: '🏥', text: 'Stay indoors and use air purification' }
            );
        }
        
        return recommendations;
    }

    async getHistoricalAQI() {
        if (!this.location) {
            throw new Error('Location not available');
        }

        try {
            const response = await fetch(
                `https://api.weatherbit.io/v2.0/history/airquality?lat=${this.location.latitude}&lon=${this.location.longitude}&key=${this.API_KEY}&days=7`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch historical AQI data');
            }

            const data = await response.json();
            return this.processHistoricalData(data);
        } catch (error) {
            console.error('Error fetching historical AQI data:', error);
            throw error;
        }
    }

    processHistoricalData(data) {
        return data.data.map(item => ({
            timestamp: new Date(item.ts * 1000),
            aqi: item.aqi
        }));
    }

    updateChart(historicalData) {
        const ctx = document.getElementById('aqiComparisonChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const labels = historicalData.map(item => 
            item.timestamp.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        );

        const aqiData = historicalData.map(item => item.aqi);

        // Generate simulated data for "With BioBloom Solutions"
        const simulatedData = aqiData.map(value => 
            Math.max(0, value * 0.6 + Math.random() * 10)
        );

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Without BioBloom Solutions',
                        data: aqiData,
                        borderColor: 'rgba(76, 175, 80, 0.8)',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'With BioBloom Solutions',
                        data: simulatedData,
                        borderColor: 'rgba(34, 139, 34, 0.8)',
                        backgroundColor: 'rgba(34, 139, 34, 0.2)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(0)} AQI`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'AQI'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date & Time'
                        }
                    }
                }
            }
        });
    }

    async startAQIUpdates() {
        try {
            const [currentData, historicalData] = await Promise.all([
                this.getCurrentAQI(),
                this.getHistoricalAQI()
            ]);

            this.updateUI(currentData);
            this.updateChart(historicalData);
            this.lastUpdate = Date.now();

            // Set up periodic updates
            setInterval(async () => {
                try {
                    const [newData, newHistoricalData] = await Promise.all([
                        this.getCurrentAQI(),
                        this.getHistoricalAQI()
                    ]);
                    this.updateUI(newData);
                    this.updateChart(newHistoricalData);
                    this.lastUpdate = Date.now();
                } catch (error) {
                    console.error('Error updating AQI data:', error);
                    this.handleError(error);
                }
            }, this.updateInterval);

        } catch (error) {
            console.error('Error starting AQI updates:', error);
            this.handleError(error);
            
            // Retry after timeout
            setTimeout(() => this.startAQIUpdates(), this.retryTimeout);
        }
    }

    updateUI(aqiData) {
        // Update AQI number and status
        const aqiNumber = document.getElementById('aqi-number');
        const aqiStatus = document.getElementById('aqi-status');
        const gaugeRing = document.querySelector('.gauge-ring');
        const lastUpdated = document.getElementById('last-updated-time');

        aqiNumber.textContent = aqiData.aqi;
        aqiStatus.textContent = aqiData.status.text;
        gaugeRing.dataset.level = aqiData.status.level;
        lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

        // Update recommendations
        const recommendationsContainer = document.getElementById('aqi-recommendations');
        recommendationsContainer.innerHTML = aqiData.recommendations
            .map(rec => `
                <div class="recommendation-item">
                    <span class="recommendation-icon">${rec.icon}</span>
                    <span class="recommendation-text">${rec.text}</span>
                </div>
            `).join('');

        // Update pollutants if the section exists
        const pollutantsSection = document.querySelector('.pollutants-section');
        if (pollutantsSection) {
            pollutantsSection.innerHTML = `
                <h3>Air Quality Details</h3>
                <div class="pollutant-grid">
                    ${Object.entries(aqiData.pollutants).map(([key, value]) => `
                        <div class="pollutant-item">
                            <span class="label">${key.toUpperCase()}</span>
                            <span class="value">${value}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    handleError(error) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${error.message}</span>
            <button onclick="aqiService.initialize()">Retry</button>
        `;

        const aqiContainer = document.querySelector('.aqi-container');
        const existingError = aqiContainer.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        aqiContainer.insertBefore(errorContainer, aqiContainer.firstChild);
    }
}

// Initialize the AQI service when the page loads
let aqiService;
document.addEventListener('DOMContentLoaded', () => {
    aqiService = new AQIService();
    aqiService.initialize();
}); 