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

// Handle Customer Booking (for index.html)
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        
        // Get selected assistant quantity from numeric input (R200 each)
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        // Automated Pricing Calculation Parameters (Updated for Light & Heavy Commercial)
        const estimatedDistanceKm = 15; // Default average town trip radius (can be swapped with Map API later)
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

        try {
            await addDoc(collection(db, "bookings"), {
                pickup: pickup,
                dropoff: dropoff,
                vehicleType: vehicleType,
                phone: phone,
                assistantsRequested: assistantCount,
                assistantFeeTotal: `R ${loaderFee}.00`,
                estimatedFare: `R ${finalCalculatedFare}.00`,
                status: "Pending",
                createdAt: new Date()
            });
            alert(`Booking submitted successfully! Estimated Fare calculated at R ${finalCalculatedFare}.00 ${assistantCount > 0 ? `(Includes ${assistantCount} assistant(s) - R ${loaderFee})` : ''}. A driver will be assigned shortly.`);
            bookingForm.reset();
        } catch (error) {
            console.error("Error adding booking: ", error);
            alert("Error submitting booking. Try again.");
        }
    });
}
