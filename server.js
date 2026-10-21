const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, app.js, CSS, images, etc.) from the root folder
app.use(express.static(__dirname));

// Configure Zoho SMTP Transporter using Render Environment Variables
const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.ZOHO_EMAIL || 'support@kplogistics.online',
        pass: process.env.ZOHO_PASSWORD || 'YOUR_ZOHO_APP_PASSWORD'
    }
});

// Booking Confirmation Email API Route
app.post('/api/bookings/confirm', async (req, res) => {
    try {
        const { clientEmail, bookingData } = req.body;
        console.log(`[EMAIL DISPATCH] Preparing confirmation for: ${clientEmail}`);

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
                    <p><strong>Assistants Requested:</strong> ${bookingData.assistantsRequested}</p>
                    <p><strong>Total Fare:</strong> ${bookingData.estimatedFare}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="font-size: 12px; color: #64748b;">Kasiplus (PTY) Ltd | Gauteng, South Africa</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[SUCCESS] Email sent successfully to ${clientEmail}`);
        
        return res.status(200).json({ success: true, message: "Confirmation email sent." });
    } catch (err) {
        console.error("Zoho Email Dispatch Error:", err);
        return res.status(500).json({ error: "Failed to send email confirmation." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KP Logistics server running on port ${PORT}`));
