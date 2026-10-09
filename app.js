// Import Auth functions alongside your existing Firestore imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Initialize Firebase & Auth
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Global variable to track logged-in user
let currentUser = null;

// Handle Auth State Changes (UI Lock/Unlock)
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const authContainer = document.getElementById('authContainer');
    const bookingFormContainer = document.getElementById('bookingFormContainer'); // Wrap your form in this ID in index.html
    const userEmailDisplay = document.getElementById('userEmailDisplay');

    if (user) {
        // User is logged in: Show form, hide login button
        if (authContainer) authContainer.style.display = 'none';
        if (bookingFormContainer) bookingFormContainer.style.display = 'block';
        if (userEmailDisplay) userEmailDisplay.innerText = `Logged in as: ${user.email}`;
        
        // Auto-fill phone field if available from Google account profile or previous sessions
        const phoneInput = document.getElementById('phone');
        if (phoneInput && !phoneInput.value && user.phoneNumber) {
            phoneInput.value = user.phoneNumber;
        }
    } else {
        // User is logged out: Hide form, show Google login button
        if (authContainer) authContainer.style.display = 'block';
        if (bookingFormContainer) bookingFormContainer.style.display = 'none';
    }
});

// Google Sign-In Trigger Function (Hook this to a "Sign in with Google" button in your HTML)
window.loginWithGoogle = async function() {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Google Auth Error:", error);
        alert("Login failed. Please try again.");
    }
};

// Logout Function (Optional: hook to a Logout button)
window.logoutUser = async function() {
    await signOut(auth);
};
