// Import Firebase SDK from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Replace with your free Firebase project credentials
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Handle Customer Booking
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, "bookings"), {
                pickup: document.getElementById('pickup').value,
                dropoff: document.getElementById('dropoff').value,
                vehicleType: document.getElementById('vehicleType').value,
                phone: document.getElementById('phone').value,
                status: "Pending",
                createdAt: new Date()
            });
            alert("Booking submitted successfully! A driver will be assigned shortly.");
            bookingForm.reset();
        } catch (error) {
            console.error("Error adding booking: ", error);
            alert("Error submitting booking. Try again.");
        }
    });
}

// Handle Driver Registration
const driverForm = document.getElementById('driverForm');
if (driverForm) {
    driverForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, "drivers"), {
                name: document.getElementById('driverName').value,
                vehicleModel: document.getElementById('vehicleModel').value,
                vehicleType: document.getElementById('regVehicleType').value,
                phone: document.getElementById('driverPhone').value,
                status: "Approved Pending Review",
                createdAt: new Date()
            });
            alert("Application submitted successfully! Welcome to Kasiplus.");
            driverForm.reset();
        } catch (error) {
            console.error("Error adding driver: ", error);
            alert("Error registering driver. Try again.");
        }
    });
}
