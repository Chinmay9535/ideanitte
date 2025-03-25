import { config } from './config.js';

// Language options with their native names
const languageOptions = {
    'en': 'English',
    'hi': 'हिन्दी',
    'ta': 'தமிழ்',
    'te': 'తెలుగు',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം',
    'mr': 'मराठी',
    'gu': 'ગુજરાતી',
    'pa': 'ਪੰਜਾਬੀ',
    'bn': 'বাংলা'
};

// Current selected language
let currentLanguage = localStorage.getItem('selectedLanguage') || 'en';

// LRU Cache implementation
class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        // Get the value and refresh its position
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            // Refresh existing key's position
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove the oldest item
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

// Initialize translation cache with size limit
const translationCache = new LRUCache(1000); // Limit to 1000 entries

// Function to translate text using the translator.py backend
async function translateText(text, targetLanguage, toEnglish = false) {
    if (targetLanguage === 'en' && !toEnglish) return text;
    
    const cacheKey = `${text}_${targetLanguage}_${toEnglish}`;
    const cachedResult = translationCache.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    try {
        console.log(`Translating text ${toEnglish ? 'to English' : 'from English'}:`, text.substring(0, 50) + '...');
        
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                target_language: targetLanguage,
                to_english: toEnglish
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Translation API error:', errorData);
            throw new Error(`Translation failed: ${errorData.error}`);
        }

        const data = await response.json();
        console.log('Translation successful:', data.translated_text.substring(0, 50) + '...');
        
        if (data.translated_text) {
            translationCache.set(cacheKey, data.translated_text);
            return data.translated_text;
        } else {
            throw new Error('No translation returned');
        }
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

// Function to update all text content
async function updateLanguage(newLanguage) {
    console.log('Updating language to:', newLanguage);
    currentLanguage = newLanguage;
    localStorage.setItem('selectedLanguage', newLanguage);

    try {
        // Translate all visible text elements
        const textElements = document.querySelectorAll('[data-translate]');
        for (const element of textElements) {
            const originalText = element.getAttribute('data-original-text') || element.textContent;
            element.setAttribute('data-original-text', originalText);
            
            const translatedText = await translateText(originalText, newLanguage);
            element.textContent = translatedText;
        }

        // Translate form labels and options
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            const originalText = label.getAttribute('data-original-text') || label.textContent;
            label.setAttribute('data-original-text', originalText);
            label.textContent = await translateText(originalText, newLanguage);
        }

        // Translate select options
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
            for (const option of select.options) {
                const originalText = option.getAttribute('data-original-text') || option.text;
                option.setAttribute('data-original-text', originalText);
                option.text = await translateText(originalText, newLanguage);
            }
        }
    } catch (error) {
        console.error('Error updating language:', error);
    }
}

// Global variables for location and AQI data
let userLocation = null;
let aqiData = null;

// Function to get user's location
async function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                resolve(userLocation);
            },
            (error) => {
                console.error('Error getting location:', error);
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

// Function to fetch AQI data
async function fetchAQIData() {
    try {
        if (!userLocation) {
            await getUserLocation();
        }

        const response = await fetch(`/api/aqi?lat=${userLocation.lat}&lon=${userLocation.lon}`);
        if (!response.ok) {
            throw new Error('Failed to fetch AQI data');
        }

        aqiData = await response.json();
        return aqiData;
    } catch (error) {
        console.error('Error fetching AQI data:', error);
        throw error;
    }
}

// Update AQI display with real data
async function updateAQIDisplay() {
    try {
        const data = await fetchAQIData();
        const current = data.current;

        // Update AQI number display
        const aqiNumber = document.getElementById('aqi-number');
        const aqiStatus = document.getElementById('aqi-status');
        const gaugeRing = document.querySelector('.gauge-ring');
        const locationDisplay = document.getElementById('location-display');
        
        if (!aqiNumber || !aqiStatus || !gaugeRing) {
            console.error('Required elements not found in the DOM');
            return;
        }

        // Update location display
        if (locationDisplay) {
            locationDisplay.textContent = `${data.location.city}, ${data.location.state}`;
        }
        
        // Update AQI value and status
        aqiNumber.textContent = current.aqi;
        aqiStatus.textContent = current.status.text;
        aqiStatus.style.color = current.status.color;
        gaugeRing.setAttribute('data-level', current.status.level);

        // Update recommendations
        const recommendationsContainer = document.getElementById('aqi-recommendations');
        if (recommendationsContainer) {
            const recommendationsHTML = current.recommendations
                .map(rec => {
                    let emoji = '🌍';
                    if (rec.toLowerCase().includes('outdoor')) emoji = '🏃';
                    else if (rec.toLowerCase().includes('window')) emoji = '🪟';
                    else if (rec.toLowerCase().includes('mask')) emoji = '😷';
                    else if (rec.toLowerCase().includes('health')) emoji = '🏥';
                    else if (rec.toLowerCase().includes('air')) emoji = '💨';
                    
                    return `<div class="recommendation-item">
                        <span class="recommendation-icon">${emoji}</span>
                        <span class="recommendation-text">${rec}</span>
                    </div>`;
                })
                .join('');

            recommendationsContainer.innerHTML = `
                <div class="recommendations-header">
                    <span class="status-indicator" style="background-color: ${current.status.color}"></span>
                    <span class="status-text">Current Status: ${current.status.text}</span>
                </div>
                <div class="recommendations-content">
                    ${recommendationsHTML}
                </div>
            `;
        }

        // Update pollutants display if it exists
        const pollutantsContainer = document.getElementById('pollutants-detail');
        if (pollutantsContainer) {
            pollutantsContainer.innerHTML = `
                <div class="pollutant-grid">
                    <div class="pollutant-item">
                        <span class="label">O₃</span>
                        <span class="value">${current.pollutants.o3.toFixed(1)} ppb</span>
                    </div>
                    <div class="pollutant-item">
                        <span class="label">PM2.5</span>
                        <span class="value">${current.pollutants.pm25.toFixed(1)} µg/m³</span>
                    </div>
                    <div class="pollutant-item">
                        <span class="label">PM10</span>
                        <span class="value">${current.pollutants.pm10.toFixed(1)} µg/m³</span>
                    </div>
                    <div class="pollutant-item">
                        <span class="label">NO₂</span>
                        <span class="value">${current.pollutants.no2.toFixed(1)} ppb</span>
                    </div>
                    <div class="pollutant-item">
                        <span class="label">SO₂</span>
                        <span class="value">${current.pollutants.so2.toFixed(1)} ppb</span>
                    </div>
                    <div class="pollutant-item">
                        <span class="label">CO</span>
                        <span class="value">${(current.pollutants.co / 1000).toFixed(1)} ppm</span>
                    </div>
                </div>
            `;
        }

        // Update the chart if it exists
        updateAQIChart(data.forecast);

    } catch (error) {
        console.error('Error updating AQI display:', error);
        // Show error message to user
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.innerHTML = `
            <p>Unable to fetch air quality data. Please try again later.</p>
            <button onclick="updateAQIDisplay()">Retry</button>
        `;
        document.querySelector('.aqi-container').appendChild(errorContainer);
    }
}

// Function to update the AQI chart with real data
function updateAQIChart(forecast) {
    const chartCanvas = document.getElementById('aqiComparisonChart');
    if (!chartCanvas) return;

    const ctx = chartCanvas.getContext('2d');
    
    // Process forecast data
    const labels = forecast.map(item => {
        const date = new Date(item.timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
    });

    const aqiValues = forecast.map(item => item.aqi);

    // Create or update the chart
    if (window.aqiChart) {
        window.aqiChart.data.labels = labels;
        window.aqiChart.data.datasets[0].data = aqiValues;
        window.aqiChart.update();
    } else {
        window.aqiChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Air Quality Index (AQI)',
                    data: aqiValues,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: 'rgba(75, 192, 192, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(75, 192, 192, 1)',
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeInOutQuart'
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'AQI Forecast',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                let quality = '';
                                if (value <= 50) quality = '(Good)';
                                else if (value <= 100) quality = '(Moderate)';
                                else if (value <= 150) quality = '(Unhealthy for Sensitive Groups)';
                                else if (value <= 200) quality = '(Unhealthy)';
                                else quality = '(Very Unhealthy)';
                                return `AQI: ${value} ${quality}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Air Quality Index (AQI)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        }
                    }
                }
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Get user's location first
        await getUserLocation();
        
        // Then initialize AQI display
        await updateAQIDisplay();
        
        // Set up periodic updates (every 15 minutes)
        setInterval(updateAQIDisplay, 15 * 60 * 1000);
        
    } catch (error) {
        console.error('Error initializing AQI display:', error);
    }

    // Initialize user data from localStorage
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    // Initialize AQI Comparison Chart only if the element exists
    const chartCanvas = document.getElementById('aqiComparisonChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Enhanced AQI data with more realistic seasonal variations
        const withoutBioBloomData = [165, 175, 190, 185, 170, 160, 165, 175, 190, 210, 205, 180];
        const withBioBloomData = [120, 125, 130, 125, 115, 110, 115, 120, 135, 150, 140, 130];

        const aqiChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Without BioBloom Solutions',
                        data: withoutBioBloomData,
                        borderColor: 'rgba(76, 175, 80, 0.8)',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: 'rgba(76, 175, 80, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(76, 175, 80, 1)',
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        borderWidth: 3
                    },
                    {
                        label: 'With BioBloom Solutions',
                        data: withBioBloomData,
                        borderColor: 'rgba(34, 139, 34, 0.8)',
                        backgroundColor: 'rgba(34, 139, 34, 0.2)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: 'rgba(34, 139, 34, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(34, 139, 34, 1)',
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeInOutQuart'
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly AQI Levels: Traditional vs BioBloom Solutions',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                let quality = '';
                                if (value <= 50) quality = '(Good)';
                                else if (value <= 100) quality = '(Moderate)';
                                else if (value <= 150) quality = '(Unhealthy for Sensitive Groups)';
                                else if (value <= 200) quality = '(Unhealthy)';
                                else quality = '(Very Unhealthy)';
                                return `${context.dataset.label}: ${value} AQI ${quality}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Air Quality Index (AQI)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        }
                    }
                }
            }
        });
    }

    // Get AI-powered AQI recommendations
    async function getAQIRecommendations(aqiValue) {
        try {
            const prompt = `As an air quality expert, provide 4-5 practical recommendations for daily activities based on the current AQI value of ${aqiValue}. Focus on health and safety advice for the general public. Format the response as a bullet-point list with each point being a concise, actionable recommendation.

Consider:
1. Outdoor activity safety
2. Necessary precautions
3. Best times for activities
4. Health considerations
5. Vulnerable populations

Current AQI: ${aqiValue}`;

            // Since we're having issues with the API, let's return default recommendations based on AQI value
            let recommendations;
            if (aqiValue <= 50) {
                recommendations = [
                    "• Air quality is good - Perfect for outdoor activities",
                    "• Enjoy normal outdoor activities and exercise",
                    "• Great time for outdoor sports and recreation",
                    "• Ideal conditions for opening windows and ventilation"
                ];
            } else if (aqiValue <= 100) {
                recommendations = [
                    "• Air quality is moderate - Consider reducing prolonged outdoor exertion",
                    "• People with respiratory issues should limit extended outdoor activities",
                    "• Good to keep windows closed during peak pollution hours",
                    "• Monitor local air quality updates"
                ];
            } else if (aqiValue <= 150) {
                recommendations = [
                    "• Unhealthy for sensitive groups - Limit outdoor activities",
                    "• Use air purifiers indoors if available",
                    "• Keep windows closed and stay indoors when possible",
                    "• Wear a mask if outdoor activities are necessary"
                ];
            } else if (aqiValue <= 200) {
                recommendations = [
                    "• Unhealthy conditions - Avoid outdoor activities",
                    "• Keep all windows and doors closed",
                    "• Use air purifiers and wear masks when going outside",
                    "• Children and elderly should stay indoors"
                ];
            } else {
                recommendations = [
                    "• Very unhealthy conditions - Stay indoors",
                    "• Avoid all outdoor physical activities",
                    "• Use air purifiers and keep all windows sealed",
                    "• Wear N95 masks if going outside is necessary"
                ];
            }

            return recommendations;
        } catch (error) {
            console.error('Error getting AQI recommendations:', error);
            return [
                "• Keep windows closed during high pollution periods",
                "• Consider using air purifiers indoors",
                "• Stay updated with local air quality reports",
                "• Follow local health authority guidelines"
            ];
        }
    }

    // Update UI based on login status
    function updateUIForLoginStatus() {
        const nav = document.querySelector('nav ul');
        
        // Clear all authentication-related elements
        Array.from(nav.children).forEach(child => {
            if (child.classList.contains('user-menu') || 
                child.querySelector('a[href="login.html"]') ||
                child.querySelector('a[href="register.html"]')) {
                child.remove();
            }
        });

        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user'));

        if (token && user) {
            // Add user menu with profile and logout
            const userMenu = document.createElement('li');
            userMenu.className = 'user-menu';
            userMenu.innerHTML = `
                <span class="user-greeting">Welcome, ${user.name}</span>
                <div class="dropdown-content">
                    <a href="javascript:void(0)" onclick="showProfile()">Profile</a>
                    <a href="javascript:void(0)" onclick="handleLogout()">Logout</a>
                </div>
            `;
            nav.appendChild(userMenu);

            // Toggle dropdown on user greeting click
            const userGreeting = userMenu.querySelector('.user-greeting');
            userGreeting.onclick = function(e) {
                e.stopPropagation();
                const dropdown = userMenu.querySelector('.dropdown-content');
                dropdown.classList.toggle('show');
            };

            // Close dropdown when clicking outside
            document.addEventListener('click', function(e) {
                const dropdowns = document.querySelectorAll('.dropdown-content');
                dropdowns.forEach(dropdown => {
                    if (dropdown.classList.contains('show')) {
                        dropdown.classList.remove('show');
                    }
                });
            });

            // Prevent dropdown from closing when clicking inside
            const dropdown = userMenu.querySelector('.dropdown-content');
            dropdown.onclick = function(e) {
                e.stopPropagation();
            };
        } else {
            // Add login/register links
            const loginLink = document.createElement('li');
            loginLink.innerHTML = '<a href="login.html">Login</a>';
            const registerLink = document.createElement('li');
            registerLink.innerHTML = '<a href="register.html">Register</a>';
            nav.appendChild(loginLink);
            nav.appendChild(registerLink);
        }
    }

    // Handle logout
    function handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    }

    // Show profile
    function showProfile() {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const profileModal = document.createElement('div');
        profileModal.className = 'profile-section';
        profileModal.innerHTML = `
            <div class="profile-header">
                <h2>Profile</h2>
                <div class="profile-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
            </div>
            <div class="profile-content">
                <div class="profile-info">
                    <h3>Personal Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <i class="fas fa-user"></i>
                            <div class="info-detail">
                                <label>Name</label>
                                <p>${user.name || 'Not set'}</p>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-envelope"></i>
                            <div class="info-detail">
                                <label>Email</label>
                                <p>${user.email || 'Not set'}</p>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-phone"></i>
                            <div class="info-detail">
                                <label>Phone</label>
                                <p>${user.phone || 'Not set'}</p>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-location-dot"></i>
                            <div class="info-detail">
                                <label>Location</label>
                                <p>${user.location || 'Not set'}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="profile-stats">
                    <h3>Account Information</h3>
                    <div class="info-item">
                        <i class="fas fa-calendar"></i>
                        <div class="info-detail">
                            <label>Member Since</label>
                            <p>${new Date(user.id).toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="profile-actions">
                <button class="edit-btn" onclick="openEditProfile()">
                    <i class="fas fa-edit"></i> Edit Profile
                </button>
                <button class="cancel-btn" onclick="closeProfile()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;

        document.body.appendChild(profileModal);
    }

    function openEditProfile() {
        closeProfile(); // Close the profile modal
        window.location.href = 'edit-profile.html';
    }

    // Close profile
    function closeProfile() {
        const profileModal = document.querySelector('.profile-section');
        if (profileModal) {
            profileModal.remove();
        }
    }

    // Make functions globally available
    window.handleLogout = handleLogout;
    window.showProfile = showProfile;
    window.closeProfile = closeProfile;
    window.openEditProfile = openEditProfile;
    window.saveProfileChanges = function() {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            const newName = document.getElementById('edit-name').value.trim();
            const newEmail = document.getElementById('edit-email').value.trim();
            const newPhone = document.getElementById('edit-phone').value.trim();
            const newLocation = document.getElementById('edit-location').value.trim();

            // Validate required fields
            if (!newName || !newEmail) {
                alert('Name and Email are required fields.');
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(newEmail)) {
                alert('Please enter a valid email address.');
                return;
            }

            // Update user object
            user.name = newName;
            user.email = newEmail;
            user.phone = newPhone;
            user.location = newLocation;

            // Save to localStorage
            localStorage.setItem('user', JSON.stringify(user));

            // Show success message
            showSuccessMessage('Profile updated successfully!');
            
            // Redirect back to main page after a short delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } catch (error) {
            console.error('Error saving profile changes:', error);
            alert('An error occurred while saving your changes. Please try again.');
        }
    };

    window.showSuccessMessage = function(message) {
        const successPopup = document.createElement('div');
        successPopup.className = 'success-popup';
        successPopup.innerHTML = `
            <div class="success-content">
                <i class="fas fa-check-circle"></i>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(successPopup);

        // Remove popup after 2 seconds
        setTimeout(() => {
            successPopup.remove();
        }, 2000);
    };

    // Initialize the app
    function initApp() {
        // Add language selector
        const header = document.querySelector('header .container');
        const languageSelector = document.createElement('div');
        languageSelector.className = 'language-selector';
        languageSelector.innerHTML = `
            <select id="language-select">
                ${Object.entries(languageOptions).map(([code, name]) => 
                    `<option value="${code}" ${code === currentLanguage ? 'selected' : ''}>${name}</option>`
                ).join('')}
            </select>
        `;
        header.appendChild(languageSelector);

        // Add language change listener
        document.getElementById('language-select').addEventListener('change', (e) => {
            updateLanguage(e.target.value);
        });

        // Add smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener("click", function (e) {
                const targetId = this.getAttribute("href");
                if (targetId === '#') return;
                
                e.preventDefault();
                const targetElement = document.querySelector(targetId);

                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: "smooth",
                    });
                }
            });
        });

        // Update UI based on login status
        updateUIForLoginStatus();
    }

    // Initialize the app
    initApp();
});