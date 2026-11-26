// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration for KP-Logistics
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
window.db = db;

// South African market fuel benchmark rates
const CURRENT_FUEL_PRICES = {
    petrol: 30.28,
    diesel: 33.29
};

let calculatedDistanceKm = 15;

// Variables to store pickup coordinates for dispatch
let pickupLat = null;
let pickupLng = null;

// ─────────────────────────────────────────────────────────────
// ROUTE DISTANCE CALCULATION (Google Maps Distance Matrix)
// ─────────────────────────────────────────────────────────────
window.calculateRouteDistance = function () {
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
                calculatedDistanceKm = results.distance.value / 1000;
            }
        }
        updateEstimateDisplay();
    });
};

// ─────────────────────────────────────────────────────────────
// FARE CALCULATION ENGINE
// ─────────────────────────────────────────────────────────────
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

function updateEstimateDisplay() {
    const priceEstimateEl = document.getElementById('priceEstimate');
    if (!priceEstimateEl) return;
    const finalFare = calculateFinalFare();
    priceEstimateEl.innerText = `R ${finalFare}.00`;
}

// ─────────────────────────────────────────────────────────────
// POST-PAYMENT EXECUTION
// ─────────────────────────────────────────────────────────────
async function handleSuccessfulPaymentReturn(refCode) {
    console.log(`Payment return for reference: ${refCode}`);

    window.history.replaceState({}, document.title, window.location.pathname);

    if (refCode) {
        window.location.href = `/track.html?ref=${encodeURIComponent(refCode)}`;
    }
}

// ─────────────────────────────────────────────────────────────
// DOM READY — bind listeners & handle return URL params
// ─────────────────────────────────────────────────────────────
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

    // Initialize Google Places Autocomplete and grab coordinates for pickup
    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        const options = { componentRestrictions: { country: "za" } };
        
        if (pickupInput) {
            const autocomplete = new google.maps.places.Autocomplete(pickupInput, options);
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.geometry && place.geometry.location) {
                    pickupLat = place.geometry.location.lat();
                    pickupLng = place.geometry.location.lng();
                    console.log("Pickup coordinates captured:", pickupLat, pickupLng);
                }
            });
        }
        if (dropoffInput) {
            new google.maps.places.Autocomplete(dropoffInput, options);
        }
    }

    // Check if customer just returned from a successful payment session
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        const refCode = urlParams.get('ref');
        handleSuccessfulPaymentReturn(refCode);
    }
});

// ─────────────────────────────────────────────────────────────
// FORM SUBMISSION — Yoco Checkout Redirect
// ─────────────────────────────────────────────────────────────
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = bookingForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Connecting to Yoco Secure Checkout...";
        }

        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const zone = document.getElementById('bookingZone') ? document.getElementById('bookingZone').value : "East Rand";
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;

        const customerEmail = `client_${phone.replace(/\s+/g, '')}@kplogistics.co.za`;

        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        const finalCalculatedFare = calculateFinalFare();
        const paymentReference = 'KP_PAY_' + Math.floor((Math.random() * 1000000) + 1);
        const fareInCents = finalCalculatedFare * 100;

        try {
            // 1. Request Yoco payment initiation session from Render backend
            const response = await fetch('/api/payments/yoco-initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountInCents: fareInCents,
                    bookingRef: paymentReference
                })
            });

            const data = await response.json();

            if (data.redirectUrl) {
                // 2. Pre-save booking record using paymentReference as the doc ID.
                await setDoc(doc(db, "bookings", paymentReference), {
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
                    status: "Pending Payment",
                    pickupLat: pickupLat,   // <-- Saved for dispatch
                    pickupLng: pickupLng,   // <-- Saved for dispatch
                    createdAt: new Date()
                });

                // 3. Immediately redirect user to Yoco's secure checkout page
                window.location.href = data.redirectUrl;
            } else {
                alert("Could not load Yoco gateway. Please check your Yoco credentials on Render.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Dispatch Driver Now";
                }
            }
        } catch (error) {
            console.error("Yoco redirection error:", error);
            alert("Error connecting to payment gateway. Please try again.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Dispatch Driver Now";
            }
        }
    });
}
