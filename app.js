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

// CONFIGURATION
const ACTIVE_DRIVER_PHONE = "0658177124"; 
const YOCO_PUBLIC_KEY = "pk_test_6290ff57c3a32a8e42de333bcba740801e72774c"; // Replace with your Yoco Public Key
const RENDER_BACKEND_URL = "https://your-render-app.onrender.com"; // Replace with your Render backend URL

// Initialize Yoco SDK
let yocoSdk = null;
if (window.YocoSDK) {
    yocoSdk = new window.YocoSDK({ publicKey: YOCO_PUBLIC_KEY });
}

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

// Centralized Fare Calculation Engine (Guarantees UI and Yoco match 100%)
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

// 3. Helper function to trigger Zoho email notifications via Render backend
async function triggerZohoEmailDispatch(clientEmail, bookingData) {
    try {
        await fetch(`${RENDER_BACKEND_URL}/api/bookings/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientEmail: clientEmail,
                bookingData: bookingData
            })
        });
        console.log('Render Zoho email dispatch triggered.');
    } catch (err) {
        console.error('Failed to trigger Render email backend:', err);
    }
}

// Handle Customer Booking (for index.html) with Yoco Web SDK Gateway
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const zone = document.getElementById('bookingZone') ? document.getElementById('bookingZone').value : "East Rand";
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        const clientEmailInput = document.getElementById('email');
        
        // Use provided email or fallback to formatted phone email
        const customerEmail = clientEmailInput && clientEmailInput.value 
            ? clientEmailInput.value 
            : `client_${phone.replace(/\s+/g, '')}@kplogistics.co.za`;
        
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        // Use centralized fare calculation engine
        const finalCalculatedFare = calculateFinalFare();
        const amountInCents = finalCalculatedFare * 100;

        if (!yocoSdk) {
            yocoSdk = new window.YocoSDK({ publicKey: YOCO_PUBLIC_KEY });
        }

        try {
            yocoSdk.showPopup({
                amountInCents: amountInCents,
                currency: 'ZAR',
                name: 'KP Logistics',
                description: `Vehicle Booking (${vehicleType})`,
                callback: async function(result) {
                    if (result.error) {
                        console.error("Yoco payment error: ", result.error.message);
                        alert("Payment was canceled or failed: " + result.error.message);
                        return;
                    }

                    const paymentReference = result.id || 'YOCO_TRIP_' + Math.floor((Math.random() * 1000000) + 1);

                    try {
                        const bookingPayload = {
                            pickup: pickup,
                            dropoff: dropoff,
                            zone: zone,
                            vehicleType: vehicleType,
                            phone: phone,
                            clientEmail: customerEmail,
                            assistantsRequested: assistantCount,
                            assistantFeeTotal: `R ${loaderFee}.00`,
                            estimatedDistanceKm: `${calculatedDistanceKm.toFixed(1)} km`,
                            estimatedFare: `R ${finalCalculatedFare}.00`,
                            paymentReference: paymentReference,
                            status: "Paid - Assigned to Driver",
                            createdAt: new Date()
                        };

                        // 1. Save booking to Firestore database
                        await addDoc(collection(db, "bookings"), bookingPayload);

                        // 2. Automatically dispatch customer confirmation SMS
                        triggerCustomerSms(phone, pickup, dropoff, vehicleType, finalCalculatedFare, paymentReference);

                        // 3. Automatically dispatch load details SMS to driver
                        triggerDriverSms(ACTIVE_DRIVER_PHONE, pickup, dropoff, vehicleType, assistantCount, phone, finalCalculatedFare, paymentReference);

                        // 4. Trigger Zoho email via Render backend (support@kplogistics.co.za)
                        triggerZohoEmailDispatch(customerEmail, bookingPayload);

                        alert(`Payment of R ${finalCalculatedFare}.00 successful! Reference: ${paymentReference}\nTrip successfully paid and dispatched.`);
                        bookingForm.reset();

                    } catch (error) {
                        console.error("Error saving paid booking: ", error);
                        alert("Payment received successfully, but booking record failed. Contact support with reference: " + paymentReference);
                    }
                }
            });
        } catch (yocoError) {
            console.error("Yoco SDK initialization error: ", yocoError);
            alert("Could not open payment gateway. Please check your connection.");
        }
    });
}
