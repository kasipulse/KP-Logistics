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

        // Automated Pricing Calculation Parameters
        const estimatedDistanceKm = 15; // Default average town trip radius (can be swapped with Map API later)
        const currentFuelPriceZAR = 23.50; // Current baseline South African fuel price per liter
        const baseFee = 180; // Mandatory flag-drop / base labor fee

        // Consumption mapping based on fuel types & vehicle categories
        const consumptionRates = {
            petrol: { bakkie: 0.11, panelvan: 0.13, medtruck: 0.21 },
            diesel: { bakkie: 0.08, panelvan: 0.10, medtruck: 0.16 }
        };

        // Assume standard mixed fuel baseline if not specified at booking, or default to petrol
        const assumedFuel = 'petrol'; 
        const rate = consumptionRates[assumedFuel]?.[vehicleType] || 0.11;
        
        const estimatedFuelCost = estimatedDistanceKm * rate * currentFuelPriceZAR;
        const subtotal = baseFee + estimatedFuelCost;
        
        // Add 12% Platform Commission
        const commission = subtotal * 0.12;
        const finalCalculatedFare = Math.round(subtotal + commission);

        try {
            await addDoc(collection(db, "bookings"), {
                pickup: pickup,
                dropoff: dropoff,
                vehicleType: vehicleType,
                phone: phone,
                estimatedFare: `R ${finalCalculatedFare}.00`,
                status: "Pending",
                createdAt: new Date()
            });
            alert(`Booking submitted successfully! Estimated Fare calculated at R ${finalCalculatedFare}.00. A driver will be assigned shortly.`);
            bookingForm.reset();
        } catch (error) {
            console.error("Error adding booking: ", error);
            alert("Error submitting booking. Try again.");
        }
    });
}
