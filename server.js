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

// Helper: Fetch OAuth Access Token from Stitch API using Basic Auth
async function getStitchAccessToken() {
    const rawClientId = process.env.STITCH_CLIENT_ID || 'test-05990af1-a234-4071-b275-d7d1c00b2a9b';
    const rawClientSecret = process.env.STITCH_CLIENT_SECRET || 'rwfn9+8fgDQOff0TjKBm/TeNm3uUs89fsEnNcndrAewpHdjYyA2KkQRachJRoNy3';

    const clientId = rawClientId.trim();
    const clientSecret = rawClientSecret.trim();

    // Base64 encode credentials for Basic Auth Header
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'client_paymentrequest');

    const response = await fetch('https://secure.stitch.money/connect/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authHeader}`
        },
        body: params
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error("Stitch Token Request Failed:", data);
        throw new Error(data.error_description || data.error || 'Failed to authenticate with Stitch API');
    }

    return data.access_token;
}

// 4. Stitch Payment Initiation Route (Instant EFT)
app.post('/api/payments/stitch-initiate', async (req, res) => {
    try {
        const { amountInCents, bookingRef } = req.body;

        if (!amountInCents || !bookingRef) {
            return res.status(400).json({ error: "Missing amountInCents or bookingRef in request body." });
        }

        // 1. Get Access Token
        let token;
        try {
            token = await getStitchAccessToken();
        } catch (tokenErr) {
            console.error("Stitch Token Authentication Error:", tokenErr.message);
            return res.status(401).json({ error: `Stitch Authentication Failed: ${tokenErr.message}` });
        }

        // 2. Define Stitch GraphQL Client Payment Initiation Request Mutation
        const query = `
            mutation CreatePaymentRequest(
                $amount: MoneyInput!, 
                $payerReference: String!, 
                $beneficiaryReference: String!,
                $beneficiaryName: String!,
                $beneficiaryBankId: BankBeneficiaryBankId!,
                $beneficiaryAccountNumber: String!
            ) {
                clientPaymentInitiationRequestCreate(input: {
                    amount: $amount,
                    payerReference: $payerReference,
                    beneficiaryReference: $beneficiaryReference,
                    beneficiary: {
                        bankAccount: {
                            name: $beneficiaryName,
                            bankId: $beneficiaryBankId,
                            accountNumber: $beneficiaryAccountNumber
                        }
                    }
                }) {
                    paymentInitiationRequest {
                        id
                        url
                    }
                }
            }
        `;

        const variables = {
            amount: {
                quantity: (amountInCents / 100).toFixed(2),
                currency: "ZAR"
            },
            payerReference: bookingRef,
            beneficiaryReference: "KP LOGISTICS",
            beneficiaryName: "Kasiplus (Pty) Ltd",
            beneficiaryBankId: "fnb",
            beneficiaryAccountNumber: "62000000000"
        };

        // 3. Request Payment Request URL from Stitch GraphQL API
        const graphqlResponse = await fetch('https://api.stitch.money/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query, variables })
        });

        const result = await graphqlResponse.json();

        if (result.data && result.data.clientPaymentInitiationRequestCreate) {
            const reqData = result.data.clientPaymentInitiationRequestCreate.paymentInitiationRequest;
            return res.status(200).json({ 
                redirectUrl: reqData.url, 
                id: reqData.id 
            });
        } else {
            console.error("Stitch GraphQL Errors:", JSON.stringify(result.errors, null, 2));
            const errorMessage = result.errors && result.errors[0] ? result.errors[0].message : "Failed to create Stitch payment request.";
            return res.status(400).json({ error: errorMessage });
        }

    } catch (err) {
        console.error("Stitch payment unhandled exception:", err);
        return res.status(500).json({ error: "Server error initiating Stitch payment." });
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
