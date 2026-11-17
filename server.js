const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');

const app = express();

// 1. Core Middleware
app.use(cors());

// IMPORTANT: Yoco webhook must be registered BEFORE express.json()
// so it receives the raw body for signature verification.
app.post('/api/webhooks/yoco', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('YOCO_WEBHOOK_SECRET not set');
            return res.status(500).send('Webhook secret not configured');
        }

        const webhookId = req.headers['webhook-id'];
        const webhookTimestamp = req.headers['webhook-timestamp'];
        const webhookSignature = req.headers['webhook-signature'];

        if (!webhookId || !webhookTimestamp || !webhookSignature) {
            return res.status(400).send('Missing webhook headers');
        }

        // Replay protection: 3 minutes
        const ts = Number(webhookTimestamp);
        if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 180) {
            return res.status(400).send('Timestamp outside tolerance');
        }

        const rawBody = req.body.toString('utf8');
        const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
        const secretKey = webhookSecret.replace('whsec_', '');
        const decodedKey = Buffer.from(secretKey, 'base64');

        const expectedSignature = crypto
            .createHmac('sha256', decodedKey)
            .update(signedContent)
            .digest('base64');

        const signatures = webhookSignature.split(' ');
        let valid = false;
        for (const sig of signatures) {
            const sigValue = sig.replace('v1,', '');
            if (sigValue === expectedSignature) {
                valid = true;
                break;
            }
        }

        if (!valid) {
            console.error('Yoco webhook signature mismatch');
            return res.status(401).send('Invalid signature');
        }

        const event = JSON.parse(rawBody);
        console.log('Yoco webhook received:', event.type);

        if (event.type === 'payment.succeeded') {
            const metadata = event.payload?.metadata || {};
            const bookingRef = metadata.bookingRef;

            if (!bookingRef) {
                console.error('No bookingRef in webhook metadata');
                return res.status(200).send('OK');
            }

            console.log(`[Yoco] Payment confirmed for booking: ${bookingRef}`);

            // TODO: fetch booking from Firestore by paymentReference=bookingRef,
            // then triggerCustomerSms + triggerDriverSms + transporter.sendMail here.
        }

        return res.status(200).send('OK');
    } catch (err) {
        console.error('Yoco webhook error:', err);
        return res.status(500).send('Webhook processing error');
    }
});

app.use(express.json());

// 2. Serve static frontend assets
app.use(express.static(__dirname));

// 3. Health Check Endpoint for UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 4. Yoco Checkout Initiation (replaces Stitch)
app.post('/api/payments/yoco-initiate', async (req, res) => {
    try {
        const { amountInCents, bookingRef } = req.body;

        if (!amountInCents || !bookingRef) {
            return res.status(400).json({ error: 'Missing amount or reference' });
        }

        const response = await fetch('https://payments.yoco.com/api/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amountInCents,
                currency: 'ZAR',
                successUrl: `https://kplogistics.online/?payment=success&ref=${bookingRef}`,
                cancelUrl: `https://kplogistics.online/?payment=cancelled`,
                failureUrl: `https://kplogistics.online/?payment=failed`,
                metadata: { bookingRef: bookingRef }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Yoco checkout creation failed:', data);
            return res.status(400).json({ error: data.message || 'Yoco checkout failed' });
        }

        return res.status(200).json({
            redirectUrl: data.redirectUrl,
            id: data.id
        });
    } catch (err) {
        console.error('Yoco initiation error:', err.message);
        return res.status(500).json({ error: 'Server error initiating Yoco payment.' });
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
