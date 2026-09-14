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
