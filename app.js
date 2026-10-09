// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration for KP-Logistics
const firebaseConfig = {
    apiKey: "AIzaSyABtMzUk8hZ0fJgPG3Osz2lQ64RkmBS3kw",
    authDomain: "kp-logistics-1a015.firebaseapp.com",
    projectId: "kp-logistics-1a015",
    storageBucket: "kp-logistics-1a015.firebasestorage.app",
    messagingSenderId: "334125590321",
    appId: "1:334125590321:web:2adf74f76c7a68c6ddb210",
    measurementId: "G-DD5MCVTC81"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// SINGLE DRIVER CONFIGURATION
const ACTIVE_DRIVER_PHONE = "0658177124"; 

// Current South African market fuel benchmark rates (Protected margins)
const CURRENT_FUEL_PRICES = {
    petrol: 30.28,
    diesel: 33.29
};

// Global distance tracker (defaults to 15km if map lookup hasn't run yet)
let calculatedDistanceKm = 15;

// Function to calculate exact route distance via Google Maps Distance Matrix
window.calculateRouteDistance = function() {
    const pickup = document.getElementById('pickup').value;
    const dropoff = document.getElementById('dropoff').value;

    if (!pickup || !dropoff) {
        updateEstimateDisplay();
        return;
    }

    if (typeof google === 'undefined' || !google.maps || !google.maps.DistanceMatrixService) {
        updateEstimateDisplay();
        return;
    }

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
        origins: [pickup],
        destinations: [dropoff],
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.METRIC,
        region: 'za'
    }, (response, status) => {
        if (status === 'OK') {
            const results = response.rows[0]?.elements[0];
            if (results && results.status === 'OK') {
                calculatedDistanceKm = results.distance.value / 1000; // Meters to KM
            }
        }
        updateEstimateDisplay();
    });
};

// Centralized Fare Calculation Engine (Guarantees UI and Paystack match 100%)
function calculateFinalFare() {
    const vehicleTypeEl = document.getElementById('vehicleType');
    const assistantCountEl = document.getElementById('assistantCount');

    const vehicleType = vehicleTypeEl ? vehicleTypeEl.value : 'bakkie';
    const assistantCount = assistantCountEl ? parseInt(assistantCountEl.value) || 0 : 0;
    const loaderFee = assistantCount * 200;

    const basePrices = {
        bakkie: 350,
        closedbakkie: 400,
        panelvan: 520,
        medtruck: 890,
        "8ton": 2200,
        "8tonside": 2500,
        flatbed: 3000,
        towtruck: 1800
    };
    const baseFee = basePrices[vehicleType] || 350;

    const consumptionRates = {
        petrol: { bakkie: 0.11, closedbakkie: 0.12, panelvan: 0.13, medtruck: 0.21, "8ton": 0.35, "8tonside": 0.38, flatbed: 0.42, towtruck: 0.30 },
        diesel: { bakkie: 0.08, closedbakkie: 0.09, panelvan: 0.10, medtruck: 0.16, "8ton": 0.35, "8tonside": 0.38, flatbed: 0.42, towtruck: 0.30 }
    };

    const fuelType = ['8ton', '8tonside', 'flatbed', 'towtruck'].includes(vehicleType) ? 'diesel' : 'petrol';
    const rate = consumptionRates[fuelType][vehicleType] || 0.11;
    const activeFuelPrice = CURRENT_FUEL_PRICES[fuelType];

    const estimatedFuelCost = calculatedDistanceKm * rate * activeFuelPrice;
    const subtotal = baseFee + estimatedFuelCost + loaderFee;
    const commission = subtotal * 0.12;

    return Math.round(subtotal + commission);
}

// Updates the price estimate tag on the UI dynamically
function updateEstimateDisplay() {
    const priceEstimateEl = document.getElementById('priceEstimate');
    if (!priceEstimateEl) return;

    const finalFare = calculateFinalFare();
    priceEstimateEl.innerText = `R ${finalFare}.00`;
}

// Bind live listeners on DOM load
document.addEventListener('DOMContentLoaded', () => {
    const dropoffInput = document.getElementById('dropoff');
    const pickupInput = document.getElementById('pickup');
    const vehicleTypeSelect = document.getElementById('vehicleType');
    const assistantCountInput = document.getElementById('assistantCount');

    if (dropoffInput) dropoffInput.addEventListener('blur', window.calculateRouteDistance);
    if (pickupInput) pickupInput.addEventListener('blur', window.calculateRouteDistance);
    if (vehicleTypeSelect) vehicleTypeSelect.addEventListener('change', updateEstimateDisplay);
    if (assistantCountInput) {
        assistantCountInput.addEventListener('input', updateEstimateDisplay);
        assistantCountInput.addEventListener('change', updateEstimateDisplay);
    }
});

// 1. Helper function to trigger SMS notification for the Customer
function triggerCustomerSms(customerPhone, pickup, dropoff, vehicleType, fare, refCode) {
    const baseUrl = 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send-url/3dc29cfc-7483-4465-8dfd-da0384db1b86';
    const messageContent = `KP-Logistics: Paid! Ref: ${refCode}. From: ${pickup} To: ${dropoff} (${vehicleType}). Fare: R${fare}. Driver assigned shortly.`;
    const messageText = encodeURIComponent(messageContent);
    
    let formattedPhone = customerPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '27' + formattedPhone.slice(1);
    }

    const targetUrl = `${baseUrl}?recipientNumber=${formattedPhone}&message=${messageText}`;
    const img = new Image();
    img.src = targetUrl;
    console.log('Customer SMS URL trigger dispatched.');
}

// 2. Helper function to trigger SMS notification for the Driver
function triggerDriverSms(driverPhone, pickup, dropoff, vehicleType, assistants, clientPhone, fare, refCode) {
    const baseUrl = 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send-url/3dc29cfc-7483-4465-8dfd-da0384db1b86';
    const messageContent = `NEW LOAD! Ref:${refCode}. From:${pickup} To:${dropoff} (${vehicleType}, Helpers:${assistants}). Client:${clientPhone}. Fare:R${fare}`;
    const messageText = encodeURIComponent(messageContent);
    
    let formattedPhone = driverPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '27' + formattedPhone.slice(1);
    }

    const targetUrl = `${baseUrl}?recipientNumber=${formattedPhone}&message=${messageText}`;
    const img = new Image();
    img.src = targetUrl;
    console.log('Driver SMS URL trigger dispatched.');
}

// Handle Customer Booking (for index.html) with Paystack Gateway
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const zone = document.getElementById('bookingZone') ? document.getElementById('bookingZone').value : "East Rand";
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        
        const customerEmail = `client_${phone.replace(/\s+/g, '')}@kp-logistics.site`;
        
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        // Use the centralized calculation so Paystack matches the screen exactly
        const finalCalculatedFare = calculateFinalFare();
        const amountInCents = finalCalculatedFare * 100;

        try {
            let handler = PaystackPop.setup({
                key: 'pk_test_6290ff57c3a32a8e42de333bcba740801e72774c', 
                email: customerEmail,
                amount: amountInCents,
                currency: 'ZAR',
                ref: 'KP_TRIP_' + Math.floor((Math.random() * 1000000) + 1),
                metadata: {
                    custom_fields: [
                        { display_name: "Pickup Location", variable_name: "pickup", value: pickup },
                        { display_name: "Dropoff Location", variable_name: "dropoff", value: dropoff },
                        { display_name: "Operating Zone", variable_name: "zone", value: zone },
                        { display_name: "Vehicle Category", variable_name: "vehicle_type", value: vehicleType },
                        { display_name: "Assistants", variable_name: "assistants", value: assistantCount },
                        { display_name: "Contact Phone", variable_name: "phone", value: phone },
                        { display_name: "Calculated Distance", variable_name: "distance_km", value: `${calculatedDistanceKm.toFixed(1)} km` }
                    ]
                },
                callback: function(response) {
                    (async () => {
                        try {
                            // 1. Save booking to Firestore database
                            await addDoc(collection(db, "bookings"), {
                                pickup: pickup,
                                dropoff: dropoff,
                                zone: zone,
                                vehicleType: vehicleType,
                                phone: phone,
                                assistantsRequested: assistantCount,
                                assistantFeeTotal: `R ${loaderFee}.00`,
                                estimatedDistanceKm: `${calculatedDistanceKm.toFixed(1)} km`,
                                estimatedFare: `R ${finalCalculatedFare}.00`,
                                paymentReference: response.reference,
                                status: "Paid - Assigned to Driver",
                                createdAt: new Date()
                            });

                            // 2. Automatically dispatch customer confirmation SMS
                            triggerCustomerSms(phone, pickup, dropoff, vehicleType, finalCalculatedFare, response.reference);

                            // 3. Automatically dispatch load details SMS to the single active driver
                            triggerDriverSms(ACTIVE_DRIVER_PHONE, pickup, dropoff, vehicleType, assistantCount, phone, finalCalculatedFare, response.reference);

                            alert(`Payment of R ${finalCalculatedFare}.00 successful! Reference: ${response.reference}\nTrip successfully paid and dispatched to the driver.`);
                            bookingForm.reset();
                        } catch (error) {
                            console.error("Error saving paid booking: ", error);
                            alert("Payment received successfully, but booking save failed. Please contact support with reference: " + response.reference);
                        }
                    })();
                },
                onClose: function() {
                    console.log('Payment window closed by user.');
                }
            });
            handler.openIframe();
        } catch (paystackError) {
            console.error("Paystack initialization error: ", paystackError);
            alert("Could not open payment gateway. Please check your network connection.");
        }
    });
}
