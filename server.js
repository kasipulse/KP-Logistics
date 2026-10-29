const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// 1. Core Middleware
app.use(cors());
app.use(express.json());

// 2. Serve static frontend assets (index.html, app.js, images, sitemaps, etc.)
app.use(express.static(__dirname));

// 3. Health Check Endpoint for UptimeRobot (Keeps Render instance warm 24/7)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 4. Yoco Checkout Session Creator Route
app.post('/api/payments/create-checkout', async (req, res) => {
    try {
        const { amountInCents, currency, bookingRef } = req.body;

        const yocoSecretKey = process.env.YOCO_SECRET_KEY || '';

        const response = await fetch('https://online.yoco.com/v1/checkouts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${yocoSecretKey}`
            },
            body: JSON.stringify({
                amount: amountInCents,
                currency: currency || 'ZAR',
                cancelUrl: 'https://kplogistics.online',
                successUrl: `https://kplogistics.online?payment=success&ref=${bookingRef}`,
                metadata: { bookingRef: bookingRef }
            })
        });

        const data = await response.json();

        if (response.ok && data.redirectUrl) {
            return res.status(200).json({ redirectUrl: data.redirectUrl, id: data.id });
        } else {
            console.error("Yoco API Error:", data);
            return res.status(400).json({ error: "Failed to initialize Yoco session." });
        }
    } catch (err) {
        console.error("Checkout creation error:", err);
        return res.status(500).json({ error: "Server error initiating payment." });
    }
});

// 5. Zoho SMTP Email Transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.ZOHO_EMAIL || 'support@kplogistics.online',
        pass: process.env.ZOHO_PASSWORD || ''
    }
});

// 6. Booking Confirmation Email Route
app.post('/api/bookings/confirm', async (req, res) => {
    try {
        const { clientEmail, bookingData } = req.body;
        console.log(`[ZOHO MAIL] Preparing confirmation for: ${clientEmail}`);

        const mailOptions = {
            from: '"KP Logistics Dispatch" <support@kplogistics.online>',
            to: clientEmail,
            bcc: 'support@kplogistics.online',
            subject: `Booking Confirmed - Ref: ${bookingData.paymentReference}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #f97316; margin-top: 0;">KP Logistics - Booking Confirmation</h2>
                    <p>Thank you for booking with KP Logistics. Your driver has been assigned and your load is secured.</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p><strong>Reference Code:</strong> ${bookingData.paymentReference}</p>
                    <p><strong>Vehicle Type:</strong> ${bookingData.vehicleType.toUpperCase()}</p>
                    <p><strong>Pickup Address:</strong> ${bookingData.pickup}</p>
                    <p><strong>Drop-off Address:</strong> ${bookingData.dropoff}</p>
                    <p><strong>Total Fare:</strong> ${bookingData.estimatedFare}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="font-size: 12px; color: #64748b;">Kasiplus (PTY) Ltd | Gauteng, South Africa</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[ZOHO MAIL SUCCESS] Dispatched to ${clientEmail}`);
        return res.status(200).json({ success: true, message: "Confirmation email sent." });
    } catch (err) {
        console.error("Zoho Email Error:", err);
        return res.status(500).json({ error: "Failed to dispatch email." });
    }
});

// 7. Wildcard Fallback Route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KP Logistics Web Service listening on port ${PORT}`));
