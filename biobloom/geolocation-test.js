// Geolocation Browser Compatibility Test
function testGeolocation() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ''; // Clear previous results
    
    console.log('Testing geolocation support...');
    
    // Check if geolocation is supported
    if (!navigator.geolocation) {
        console.error('Geolocation is not supported by this browser');
        addResult('error', 'Geolocation is not supported by this browser');
        return;
    }

    console.log('Geolocation is supported');
    addResult('success', 'Geolocation is supported');

    // Test getting current position
    const startTime = Date.now();
    navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            console.log('Position obtained successfully');
            console.log(`Response time: ${responseTime}ms`);
            console.log('Coordinates:', {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            });

            addResult('success', `
                <h3>Position obtained successfully</h3>
                <p>Response time: ${responseTime}ms</p>
                <p>Latitude: ${position.coords.latitude}</p>
                <p>Longitude: ${position.coords.longitude}</p>
                <p>Accuracy: ${position.coords.accuracy} meters</p>
            `);
        },
        // Error callback
        (error) => {
            console.error('Error getting position:', error);
            let errorMessage = '';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'User denied the request for geolocation';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information is unavailable';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'The request to get user location timed out';
                    break;
                default:
                    errorMessage = 'An unknown error occurred';
                    break;
            }

            addResult('error', `
                <h3>Error getting position</h3>
                <p>Error code: ${error.code}</p>
                <p>Error message: ${errorMessage}</p>
            `);
        },
        // Options
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );

    // Test watching position
    try {
        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                console.log('Watch position update:', {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                console.error('Watch position error:', error);
                addResult('error', 'Error in watchPosition: ' + error.message);
            }
        );

        // Stop watching after 5 seconds
        setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
            console.log('Stopped watching position');
            addResult('success', 'Successfully tested watchPosition');
        }, 5000);
    } catch (error) {
        console.error('Error setting up watch position:', error);
        addResult('error', 'Error setting up watchPosition: ' + error.message);
    }
}

// Helper function to add results to the page
function addResult(type, message) {
    const resultsDiv = document.getElementById('results');
    const resultElement = document.createElement('div');
    resultElement.className = `result ${type}`;
    resultElement.innerHTML = message;
    resultsDiv.appendChild(resultElement);
}

// Add browser information when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const browserDetails = document.getElementById('browser-details');
    browserDetails.innerHTML = `
        <p><strong>User Agent:</strong> ${navigator.userAgent}</p>
        <p><strong>Browser Language:</strong> ${navigator.language}</p>
        <p><strong>Platform:</strong> ${navigator.platform}</p>
        <p><strong>Vendor:</strong> ${navigator.vendor || 'Not available'}</p>
        <p><strong>Cookies Enabled:</strong> ${navigator.cookieEnabled}</p>
        <p><strong>Online Status:</strong> ${navigator.onLine ? 'Online' : 'Offline'}</p>
        ${navigator.maxTouchPoints !== undefined ? `<p><strong>Max Touch Points:</strong> ${navigator.maxTouchPoints}</p>` : ''}
        <p><strong>Screen Resolution:</strong> ${window.screen.width}x${window.screen.height}</p>
        <p><strong>Window Size:</strong> ${window.innerWidth}x${window.innerHeight}</p>
    `;
}); 