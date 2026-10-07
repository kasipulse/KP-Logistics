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

// Helper function to trigger SMS notification via URL sending (bypasses CORS completely)
function triggerSmsNotification(customerPhone, fare, refCode) {
    const baseUrl = 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send-url/3dc29cfc-7483-4465-8dfd-da0384db1b86';
    
    const messageText = encodeURIComponent(`KP-Logistics: Booking confirmed! Ref: ${refCode}. Amount paid: R${fare}. Your driver is being assigned.`);
    
    // Clean phone number format for South Africa (e.g., converting 082... to 2782...)
    let formattedPhone = customerPhone.replace(/\s+/g, '').replace('+', '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '27' + formattedPhone.slice(1);
    }

    const targetUrl = `${baseUrl}?to=${formattedPhone}&message=${messageText}`;

    // Use an invisible image request to trigger the URL safely without CORS blocking
    const img = new Image();
    img.src = targetUrl;
    console.log('SMS URL trigger dispatched.');
}

// Handle Customer Booking (for index.html) with Paystack Gateway
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pickup = document.getElementById('pickup').value;
        const dropoff = document.getElementById('dropoff').value;
        const zone = document.getElementById('bookingZone') ? document.getElementById('bookingZone').value : "East Rand";
        const vehicleType = document.getElementById('vehicleType').value;
        const phone = document.getElementById('phone').value;
        
        const customerEmail = `client_${phone.replace(/\s+/g, '')}@kp-logistics.site`;
        
        const assistantInput = document.getElementById('assistantCount');
        const assistantCount = assistantInput ? parseInt(assistantInput.value) || 0 : 0;
        const loaderFee = assistantCount * 200;

        const estimatedDistanceKm = 15; 
        const currentFuelPriceZAR = 23.50; 
        
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

        const assumedFuel = ['8ton', '8tonside', 'flatbed', 'towtruck'].includes(vehicleType) ? 'diesel' : 'petrol';
        const rate = consumptionRates[assumedFuel]?.[vehicleType] || 0.11;
        
        const estimatedFuelCost = estimatedDistanceKm * rate * currentFuelPriceZAR;
        const subtotal = baseFee + estimatedFuelCost + loaderFee;
        const commission = subtotal * 0.12;
        const finalCalculatedFare = Math.round(subtotal + commission);
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
                        { display_name: "Contact Phone", variable_name: "phone", value: phone }
                    ]
                },
                callback: function(response) {
                    (async () => {
                        try {
                            // 1. Save booking to Firestore database
                            await addDoc(collection(db, "bookings"), {
                                pickup: pickup,
                                dropoff: dropoff,
                                zone: zone,
                                vehicleType: vehicleType,
                                phone: phone,
                                assistantsRequested: assistantCount,
                                assistantFeeTotal: `R ${loaderFee}.00`,
                                estimatedFare: `R ${finalCalculatedFare}.00`,
                                paymentReference: response.reference,
                                status: "Paid - Pending Driver Assignment",
                                createdAt: new Date()
                            });

                            // 2. Automatically dispatch SMS via URL trigger
                            triggerSmsNotification(phone, finalCalculatedFare, response.reference);

                            alert(`Payment of R ${finalCalculatedFare}.00 successful! Reference: ${response.reference}\nYour trip has been paid and dispatched to available drivers in ${zone}.`);
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
