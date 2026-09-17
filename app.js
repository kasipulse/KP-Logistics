// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Handle Customer Booking (for index.html) with Paystack Gateway
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        
        // Generate a clean customer email using the phone number for Paystack
        const customerEmail = `client_${phone.replace(/\s+/g, '')}@kp-logistics.site`;
        
        // Get selected assistant quantity from numeric input (R200 each)
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        // Automated Pricing Calculation Parameters (Updated for Light & Heavy Commercial)
        const estimatedDistanceKm = 15; // Default average town trip radius
        const currentFuelPriceZAR = 23.50; // Current baseline South African fuel price per liter
        
        // Base fares reflecting vehicle tiers
        const basePrices = {
            sedan: 250,
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

        // Consumption mapping based on fuel types & expanded vehicle categories (liters per km)
        const consumptionRates = {
            petrol: { 
                sedan: 0.08, 
                bakkie: 0.11, 
                closedbakkie: 0.12, 
                panelvan: 0.13, 
                medtruck: 0.21,
                "8ton": 0.35,
                "8tonside": 0.38,
                flatbed: 0.42,
                towtruck: 0.30
            },
            diesel: { 
                sedan: 0.06, 
                bakkie: 0.08, 
                closedbakkie: 0.09, 
                panelvan: 0.10, 
                medtruck: 0.16, 
                "8ton": 0.35, 
                "8tonside": 0.38, 
                flatbed: 0.42, 
                towtruck: 0.30 
            }
        };

        // Assume standard diesel/petrol mixed baseline or default lookup
        const assumedFuel = ['8ton', '8tonside', 'flatbed', 'towtruck'].includes(vehicleType) ? 'diesel' : 'petrol';
        const rate = consumptionRates[assumedFuel]?.[vehicleType] || 0.11;
        
        const estimatedFuelCost = estimatedDistanceKm * rate * currentFuelPriceZAR;
        
        // Subtotal = Base Fee + Fuel Cost + Multi-loader Fee (R200 per assistant)
        const subtotal = baseFee + estimatedFuelCost + loaderFee;
        
        // Add 12% Platform Commission
        const commission = subtotal * 0.12;
        const finalCalculatedFare = Math.round(subtotal + commission);
        const amountInCents = finalCalculatedFare * 100; // Paystack expects amount in cents

        // Initialize Paystack Popup Checkout for Customer Trip
        let handler = PaystackPop.setup({
            key: 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY', // Replace with your actual Paystack Public Key when ready
            email: customerEmail,
            amount: amountInCents,
            currency: 'ZAR',
            ref: 'KP_TRIP_' + Math.floor((Math.random() * 1000000) + 1),
            metadata: {
                custom_fields: [
                    { display_name: "Pickup Location", variable_name: "pickup", value: pickup },
                    { display_name: "Dropoff Location", variable_name: "dropoff", value: dropoff },
                    { display_name: "Vehicle Category", variable_name: "vehicle_type", value: vehicleType },
                    { display_name: "Assistants", variable_name: "assistants", value: assistantCount },
                    { display_name: "Contact Phone", variable_name: "phone", value: phone }
                ]
            },
            callback: async function(response) {
                // Payment successful, now save verified booking to Firebase
                try {
                    await addDoc(collection(db, "bookings"), {
                        pickup: pickup,
                        dropoff: dropoff,
                        vehicleType: vehicleType,
                        phone: phone,
                        assistantsRequested: assistantCount,
                        assistantFeeTotal: `R ${loaderFee}.00`,
                        estimatedFare: `R ${finalCalculatedFare}.00`,
                        paymentReference: response.reference,
                        status: "Paid - Pending Driver Assignment",
                        createdAt: new Date()
                    });
                    alert(`Payment of R ${finalCalculatedFare}.00 successful! Reference: ${response.reference}\nYour trip has been paid and dispatched to available drivers.`);
                    bookingForm.reset();
                } catch (error) {
                    console.error("Error saving paid booking: ", error);
                    alert("Payment received successfully, but booking save failed. Please contact support with reference: " + response.reference);
                }
            },
            onClose: function() {
                alert('Payment window closed. Trip dispatch requires completed payment.');
            }
        });
        handler.openIframe();
    });
}
