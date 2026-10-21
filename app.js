// Import Firebase SDKs
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
window.db = db; // Expose Firestore to window for F12 console commands

// Operational Configurations
const ACTIVE_DRIVER_PHONE = "0658177124"; 
const YOCO_PUBLIC_KEY = "pk_test_461c13e6Dme2LvY92d64"; 
const RENDER_BACKEND_URL = "https://kp-logistics-backend.onrender.com"; 

// South African market fuel benchmark rates
const CURRENT_FUEL_PRICES = {
    petrol: 30.28,
    diesel: 33.29
};

// Global distance tracker (defaults to 15km baseline)
let calculatedDistanceKm = 15;

// Function to calculate exact route distance via Google Maps Distance Matrix
window.calculateRouteDistance = function() {
    const pickupInput = document.getElementById('pickup');
    const dropoffInput = document.getElementById('dropoff');

    const pickup = pickupInput ? pickupInput.value : '';
    const dropoff = dropoffInput ? dropoffInput.value : '';

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

// Centralized Fare Calculation Engine
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

// Bind live UI listeners on DOM load
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

// Helper 1: Trigger SMS notification for Customer
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
    console.log('Customer SMS trigger dispatched.');
}

// Helper 2: Trigger SMS notification for Driver
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
    console.log('Driver SMS trigger dispatched.');
}

// Helper 3: Trigger Zoho Mail via Render Backend (uses no-cors mode to bypass browser preflight blocking)
async function triggerZohoEmailDispatch(clientEmail, bookingData) {
    if (RENDER_BACKEND_URL.includes("your-render-app.onrender.com")) {
        console.warn('Render backend URL not configured yet. Skipping email trigger.');
        return;
    }

    try {
        await fetch(`${RENDER_BACKEND_URL}/api/bookings/confirm`, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                clientEmail: clientEmail,
                bookingData: bookingData
            })
        });
        console.log('Render Zoho email dispatch request sent.');
    } catch (err) {
        console.warn('Backend email endpoint notice:', err);
    }
}

// Process Booking and Dispatch Notifications
async function executeBookingDispatch(paymentReference, pickup, dropoff, zone, vehicleType, phone, customerEmail, assistantCount, loaderFee, finalCalculatedFare) {
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

        // 2. Dispatch customer confirmation SMS
        triggerCustomerSms(phone, pickup, dropoff, vehicleType, finalCalculatedFare, paymentReference);

        // 3. Dispatch driver load SMS
        triggerDriverSms(ACTIVE_DRIVER_PHONE, pickup, dropoff, vehicleType, assistantCount, phone, finalCalculatedFare, paymentReference);

        // 4. Trigger Zoho email via Render backend (Non-blocking)
        triggerZohoEmailDispatch(customerEmail, bookingPayload);

        alert(`Payment of R ${finalCalculatedFare}.00 confirmed!\nRef: ${paymentReference}\nTrip saved and driver dispatch triggered.`);
        if (document.getElementById('bookingForm')) {
            document.getElementById('bookingForm').reset();
        }

    } catch (error) {
        console.error("Error saving paid booking: ", error);
        alert("Payment received, but booking record failed. Contact support with reference: " + paymentReference);
    }
}

// Handle Customer Booking Form Submission with Secure Test Checkout Prompt
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
        
        const customerEmail = clientEmailInput && clientEmailInput.value 
            ? clientEmailInput.value 
            : `client_${phone.replace(/\s+/g, '')}@kplogistics.co.za`;
        
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        const finalCalculatedFare = calculateFinalFare();

        // Secure Checkout Confirmation Step for Yoco Test Flow
        const confirmPayment = confirm(`KP Logistics Yoco Checkout\n\nRoute: ${pickup} to ${dropoff}\nVehicle: ${vehicleType.toUpperCase()}\nTotal Fare: R ${finalCalculatedFare}.00\n\nClick OK to authorize test card payment and dispatch driver.`);
        
        if (!confirmPayment) {
            return;
        }

        const paymentReference = 'YOCO_TEST_' + Math.floor((Math.random() * 1000000) + 1);
        await executeBookingDispatch(paymentReference, pickup, dropoff, zone, vehicleType, phone, customerEmail, assistantCount, loaderFee, finalCalculatedFare);
    });
}
