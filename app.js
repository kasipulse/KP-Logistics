import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;

// Helper to save form state before redirect
function saveFormState() {
    const formData = {
        pickup: document.getElementById('pickup')?.value || '',
        dropoff: document.getElementById('dropoff')?.value || '',
        zone: document.getElementById('bookingZone')?.value || 'East Rand',
        vehicleType: document.getElementById('vehicleType')?.value || 'bakkie',
        phone: document.getElementById('phone')?.value || '',
        assistantCount: document.getElementById('assistantCount')?.value || '0'
    };
    localStorage.setItem('pending_booking', JSON.stringify(formData));
}

// Helper to restore form state after redirect and auto-trigger checkout if returning from login
function restoreFormState() {
    const saved = localStorage.getItem('pending_booking');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (document.getElementById('pickup')) document.getElementById('pickup').value = data.pickup;
            if (document.getElementById('dropoff')) document.getElementById('dropoff').value = data.dropoff;
            if (document.getElementById('bookingZone')) document.getElementById('bookingZone').value = data.zone;
            if (document.getElementById('vehicleType')) document.getElementById('vehicleType').value = data.vehicleType;
            if (document.getElementById('phone')) document.getElementById('phone').value = data.phone;
            if (document.getElementById('assistantCount')) document.getElementById('assistantCount').value = data.assistantCount;
            
            // Recalculate distance and price estimate with restored values
            if (typeof window.calculateRouteDistance === 'function') {
                window.calculateRouteDistance();
            }
        } catch (e) {
            console.error("Error restoring form state:", e);
        }
        localStorage.removeItem('pending_booking');
    }
}

// Handle redirect result when user returns from Google login page on mobile/Safari
getRedirectResult(auth).then((result) => {
    if (result && result.user) {
        currentUser = result.user;
        console.log("Successfully logged in via redirect:", currentUser.email);
        restoreFormState();
    }
}).catch((error) => {
    console.error("Redirect sign-in error:", error);
});

// Track Auth State for UI Banner
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const banner = document.getElementById('userSessionBanner');
    const emailDisplay = document.getElementById('userEmailDisplay');

    if (user) {
        if (banner) banner.style.display = 'flex';
        if (emailDisplay) emailDisplay.innerText = `Signed in as: ${user.email}`;
        // If user just logged in and we have saved state, restore it
        restoreFormState();
    } else {
        if (banner) banner.style.display = 'none';
    }
});

window.logoutUser = async function() {
    await signOut(auth);
};

const ACTIVE_DRIVER_PHONE = "0658177124"; 

// Dynamic fuel pricing config based on current market rates
const CURRENT_FUEL_PRICES = {
    petrol: 30.28,
    diesel: 33.29
};

// Global distance tracker (defaults to 15km if locations aren't fully resolved yet)
let calculatedDistanceKm = 15;

// Function to calculate exact route distance via Google Maps Distance Matrix
window.calculateRouteDistance = function() {
    const pickup = document.getElementById('pickup').value;
    const dropoff = document.getElementById('dropoff').value;

    if (!pickup || !dropoff) return;

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

// Unified fare estimation logic using real-time distance and current fuel prices
function updateEstimateDisplay() {
    const vehicleTypeEl = document.getElementById('vehicleType');
    const assistantCountEl = document.getElementById('assistantCount');
    const priceEstimateEl = document.getElementById('priceEstimate');

    if (!vehicleTypeEl || !priceEstimateEl) return;

    const vehicleType = vehicleTypeEl.value;
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
    const finalCalculatedFare = Math.round(subtotal + commission);

    priceEstimateEl.innerText = `R ${finalCalculatedFare}.00`;
    return finalCalculatedFare;
}

// Bind live listeners for form inputs
document.addEventListener('DOMContentLoaded', () => {
    const dropoffInput = document.getElementById('dropoff');
    const pickupInput = document.getElementById('pickup');
    const vehicleTypeSelect = document.getElementById('vehicleType');
    const assistantCountInput = document.getElementById('assistantCount');

    if (dropoffInput) dropoffInput.addEventListener('blur', calculateRouteDistance);
    if (pickupInput) pickupInput.addEventListener('blur', calculateRouteDistance);
    if (vehicleTypeSelect) vehicleTypeSelect.addEventListener('change', updateEstimateDisplay);
    if (assistantCountInput) {
        assistantCountInput.addEventListener('input', updateEstimateDisplay);
        assistantCountInput.addEventListener('change', updateEstimateDisplay);
    }
});

function triggerCustomerSms(customerPhone, pickup, dropoff, vehicleType, fare, refCode) {
    const baseUrl = 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send-url/3dc29cfc-7483-4465-8dfd-da0384db1b86';
    const messageContent = `KP-Logistics: Paid! Ref: ${refCode}. From: ${pickup} To: ${dropoff} (${vehicleType}). Fare: R${fare}. Driver assigned shortly.`;
    const messageText = encodeURIComponent(messageContent);
    
    let formattedPhone = customerPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '27' + formattedPhone.slice(1);
    }

    const img = new Image();
    img.src = `${baseUrl}?recipientNumber=${formattedPhone}&message=${messageText}`;
}

function triggerDriverSms(driverPhone, pickup, dropoff, vehicleType, assistants, clientPhone, fare, refCode) {
    const baseUrl = 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send-url/3dc29cfc-7483-4465-8dfd-da0384db1b86';
    const messageContent = `NEW LOAD! Ref:${refCode}. From:${pickup} To:${dropoff} (${vehicleType}, Helpers:${assistants}). Client:${clientPhone}. Fare:R${fare}`;
    const messageText = encodeURIComponent(messageContent);
    
    let formattedPhone = driverPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '27' + formattedPhone.slice(1);
    }

    const img = new Image();
    img.src = `${baseUrl}?recipientNumber=${formattedPhone}&message=${messageText}`;
}

const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // CHECKPOINT: If user is not logged in, save form data and redirect to Google Sign-In safely for Safari/mobile
        if (!currentUser) {
            saveFormState();
            alert("Please sign in with your Google account to complete your booking. We've saved your trip details!");
            try {
                await signInWithRedirect(auth, googleProvider);
            } catch (authError) {
                console.error("Redirect sign-in error:", authError);
            }
            return; 
        }
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const zone = document.getElementById('bookingZone') ? document.getElementById('bookingZone').value : "East Rand";
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        
        const customerEmail = currentUser.email || `client_${phone.replace(/\s+/g, '')}@kp-logistics.site`;
        
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        // Recalculate precise final fare right at checkout submission
        const finalCalculatedFare = updateEstimateDisplay();
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
                        { display_name: "Google Account", variable_name: "google_user", value: currentUser.email },
                        { display_name: "Distance (KM)", variable_name: "distance_km", value: calculatedDistanceKm.toFixed(1) }
                    ]
                },
                callback: function(response) {
                    (async () => {
                        try {
                            await addDoc(collection(db, "bookings"), {
                                pickup: pickup,
                                dropoff: dropoff,
                                zone: zone,
                                vehicleType: vehicleType,
                                phone: phone,
                                customerEmail: currentUser.email,
                                assistantsRequested: assistantCount,
                                assistantFeeTotal: `R ${loaderFee}.00`,
                                estimatedDistanceKm: `${calculatedDistanceKm.toFixed(1)} km`,
                                estimatedFare: `R ${finalCalculatedFare}.00`,
                                paymentReference: response.reference,
                                status: "Paid - Assigned to Driver",
                                createdAt: new Date()
                            });

                            triggerCustomerSms(phone, pickup, dropoff, vehicleType, finalCalculatedFare, response.reference);
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
