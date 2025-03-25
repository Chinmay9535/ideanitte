const API_KEY = '47eb2a7db4e440e893012615ea36ae6e';
const BASE_URL = 'https://api.weatherbit.io/v2.0';

class AQIService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
    }

    async getCurrentAQI(lat, lon) {
        try {
            const cacheKey = `${lat},${lon}`;
            const cachedData = this.cache.get(cacheKey);
            
            if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheTimeout) {
                return cachedData.data;
            }

            const response = await fetch(
                `${BASE_URL}/forecast/airquality?lat=${lat}&lon=${lon}&key=${API_KEY}`
            );

            if (!response.ok) {
                throw new Error(`AQI API error: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Process and structure the data
            const processedData = {
                current: this._processCurrentAQI(data.data[0]),
                forecast: this._processForecast(data.data),
                location: {
                    city: data.city_name,
                    state: data.state_code,
                    country: data.country_code,
                    timezone: data.timezone
                }
            };

            // Cache the result
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

    _processCurrentAQI(current) {
        return {
            aqi: current.aqi,
            timestamp: current.timestamp_local,
            pollutants: {
                o3: current.o3,
                so2: current.so2,
                no2: current.no2,
                pm10: current.pm10,
                pm25: current.pm25,
                co: current.co
            },
            status: this._getAQIStatus(current.aqi),
            recommendations: this._getRecommendations(current.aqi)
        };
    }

    _processForecast(data) {
        return data.map(item => ({
            aqi: item.aqi,
            timestamp: item.timestamp_local,
            pollutants: {
                o3: item.o3,
                so2: item.so2,
                no2: item.no2,
                pm10: item.pm10,
                pm25: item.pm25,
                co: item.co
            }
        }));
    }

    _getAQIStatus(aqi) {
        if (aqi <= 50) return { level: 'good', color: '#009966', text: 'Good' };
        if (aqi <= 100) return { level: 'moderate', color: '#ffde33', text: 'Moderate' };
        if (aqi <= 150) return { level: 'unhealthy-sensitive', color: '#ff9933', text: 'Unhealthy for Sensitive Groups' };
        if (aqi <= 200) return { level: 'unhealthy', color: '#cc0033', text: 'Unhealthy' };
        return { level: 'very-unhealthy', color: '#660099', text: 'Very Unhealthy' };
    }

    _getRecommendations(aqi) {
        if (aqi <= 50) {
            return [
                "Air quality is good - Perfect for outdoor activities",
                "Enjoy normal outdoor activities and exercise",
                "Great time for outdoor sports and recreation",
                "Ideal conditions for opening windows and ventilation"
            ];
        } else if (aqi <= 100) {
            return [
                "Air quality is moderate - Consider reducing prolonged outdoor exertion",
                "People with respiratory issues should limit extended outdoor activities",
                "Good to keep windows closed during peak pollution hours",
                "Monitor local air quality updates"
            ];
        } else if (aqi <= 150) {
            return [
                "Unhealthy for sensitive groups - Limit outdoor activities",
                "Use air purifiers indoors if available",
                "Keep windows closed and stay indoors when possible",
                "Wear a mask if outdoor activities are necessary"
            ];
        } else if (aqi <= 200) {
            return [
                "Unhealthy conditions - Avoid outdoor activities",
                "Keep all windows and doors closed",
                "Use air purifiers and wear masks when going outside",
                "Children and elderly should stay indoors"
            ];
        } else {
            return [
                "Very unhealthy conditions - Stay indoors",
                "Avoid all outdoor physical activities",
                "Use air purifiers and keep all windows sealed",
                "Wear N95 masks if going outside is necessary"
            ];
        }
    }

    async getHistoricalData(lat, lon) {
        // For the graph, we'll use the forecast data to simulate historical trends
        const data = await this.getCurrentAQI(lat, lon);
        return data.forecast;
    }
}

module.exports = new AQIService(); 