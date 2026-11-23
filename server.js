const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// ─────────────────────────────────────────────────────────────
// FIREBASE ADMIN INIT (server-side Firestore access)
// ─────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'kp-logistics-1a015',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────
// SMS CONFIG (SMSMessenger)
// ─────────────────────────────────────────────────────────────
const SMS_BASE = 'https://sms1.smsmessenger.co.za/app/api/rest/v1';
const SMS_SEND_UUID = process.env.SMS_SEND_UUID || '3dc29cfc-7483-4465-8dfd-da0384db1b86';
const ACTIVE_DRIVER_PHONE = process.env.ACTIVE_DRIVER_PHONE || '0658177124';

// Normalise any SA phone input to 27xxxxxxxxx
function normalisePhone(raw) {
  let phone = String(raw || '').replace(/\s+/g, '').replace('+', '');
  if (phone.startsWith('0')) phone = '27' + phone.slice(1);
  return phone;
}

// ─────────────────────────────────────────────────────────────
// 1. Core Middleware
// ─────────────────────────────────────────────────────────────
app.use(cors());

// ⚠️ Yoco webhook MUST be registered BEFORE express.json()
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

      // ───────────────────────────────────────────────────────
      // ✅ FILLED-IN TODO: look up booking, send SMS + email
      // ───────────────────────────────────────────────────────
      try {
        const snap = await db
          .collection('bookings')
          .where('paymentReference', '==', bookingRef)
          .limit(1)
          .get();

        if (snap.empty) {
          console.error(`[Yoco] No booking found for ref: ${bookingRef}`);
          return res.status(200).send('OK');
        }

        const bookingDoc = snap.docs[0];
        const booking = bookingDoc.data();
        const bookingId = bookingDoc.id;

        // 1) Mark booking paid (so track.html stops showing "Pending Payment")
        await bookingDoc.ref.set(
          {
            status: 'Paid',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // 2) Build SMS bodies
        const customerMsg =
          `KP-Logistics: Paid! Ref: ${bookingRef}. ` +
          `From: ${booking.pickup} To: ${booking.dropoff} ` +
          `(${booking.vehicleType}). Fare: ${booking.estimatedFare}. ` +
          `Driver assigned shortly. Track: kplogistics.online/track.html?ref=${bookingId}`;

        const driverMsg =
          `NEW LOAD! Ref:${bookingRef}. ` +
          `From:${booking.pickup} To:${booking.dropoff} ` +
          `(${booking.vehicleType}, Helpers:${booking.assistantsRequested || 0}). ` +
          `Client:${booking.phone}. Fare:${booking.estimatedFare}`;

        // 3) Fire customer + driver SMS in parallel
        await Promise.allSettled([
          sendSmsInternal(booking.phone, customerMsg, bookingId, 'customer'),
          sendSmsInternal(ACTIVE_DRIVER_PHONE, driverMsg, bookingId, 'driver'),
        ]);

        // 4) Fire confirmation email (best-effort, don't block webhook)
        if (booking.clientEmail) {
          sendConfirmationEmail(booking.clientEmail, {
            paymentReference: bookingRef,
            vehicleType: booking.vehicleType || 'N/A',
            pickup: booking.pickup,
            dropoff: booking.dropoff,
            estimatedFare: booking.estimatedFare,
          }).catch((e) => console.error('[Zoho] Email failed:', e.message));
        }
      } catch (innerErr) {
        // Never fail the webhook — Yoco would retry and we'd double-send
        console.error('[Yoco post-payment error]', innerErr);
      }
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

// 3. Health Check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ─────────────────────────────────────────────────────────────
// 4. Yoco Checkout Initiation
// ─────────────────────────────────────────────────────────────
app.post('/api/payments/yoco-initiate', async (req, res) => {
  try {
    const { amountInCents, bookingRef } = req.body;

    if (!amountInCents || !bookingRef) {
      return res.status(400).json({ error: 'Missing amount or reference' });
    }

    const response = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInCents,
        currency: 'ZAR',
        successUrl: `https://kplogistics.online/?payment=success&ref=${bookingRef}`,
        cancelUrl: `https://kplogistics.online/?payment=cancelled`,
        failureUrl: `https://kplogistics.online/?payment=failed`,
        metadata: { bookingRef: bookingRef },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Yoco checkout creation failed:', data);
      return res.status(400).json({ error: data.message || 'Yoco checkout failed' });
    }

    return res.status(200).json({
      redirectUrl: data.redirectUrl,
      id: data.id,
    });
  } catch (err) {
    console.error('Yoco initiation error:', err.message);
    return res.status(500).json({ error: 'Server error initiating Yoco payment.' });
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Zoho SMTP Email Transporter
// ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL || 'support@kplogistics.online',
    pass: process.env.ZOHO_PASSWORD || '',
  },
});

// ─────────────────────────────────────────────────────────────
// 6. Booking Confirmation Email Route (keep for manual calls)
// ─────────────────────────────────────────────────────────────
app.post('/api/bookings/confirm', async (req, res) => {
  try {
    const { clientEmail, bookingData } = req.body;
    console.log(`[ZOHO MAIL] Preparing confirmation for: ${clientEmail}`);

    await sendConfirmationEmail(clientEmail, bookingData);
    return res.status(200).json({ success: true, message: 'Confirmation email sent.' });
  } catch (err) {
    console.error('Zoho Email Error:', err);
    return res.status(500).json({ error: 'Failed to dispatch email.' });
  }
});

// Helper: send confirmation email (reused by Yoco webhook)
async function sendConfirmationEmail(clientEmail, bookingData) {
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
        <p><strong>Vehicle Type:</strong> ${String(bookingData.vehicleType || '').toUpperCase()}</p>
        <p><strong>Pickup Address:</strong> ${bookingData.pickup}</p>
        <p><strong>Drop-off Address:</strong> ${bookingData.dropoff}</p>
        <p><strong>Total Fare:</strong> ${bookingData.estimatedFare}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b;">Kasiplus (PTY) Ltd | Gauteng, South Africa</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`[ZOHO MAIL SUCCESS] Dispatched to ${clientEmail}`);
}

// ─────────────────────────────────────────────────────────────
// 7. SMS SEND (server-side; called from Yoco webhook AND any client)
// ─────────────────────────────────────────────────────────────
async function sendSmsInternal(recipientNumber, message, bookingRef, kind) {
  const phone = normalisePhone(recipientNumber);

  try {
    const url = `${SMS_BASE}/sms/send-url/${SMS_SEND_UUID}`;
    const response = await axios.get(url, {
      params: { recipientNumber: phone, message },
      timeout: 10000,
    });

    const messageId =
      response.data?.messageId ||
      response.data?.message_id ||
      response.data?.id ||
      null;

    if (bookingRef) {
      await db.doc(`bookings/${bookingRef}`).set(
        {
          sms: {
            [kind || 'customer']: {
              messageId,
              recipientNumber: phone,
              status: 'SENT',
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
    }

    console.log(`[SMS SENT] ${kind} → ${phone} (id: ${messageId})`);
    return { success: true, messageId };
  } catch (err) {
    console.error(`[SMS FAIL] ${kind} → ${phone}:`, err.message);

    if (bookingRef) {
      await db
        .doc(`bookings/${bookingRef}`)
        .set(
          {
            sms: {
              [kind || 'customer']: {
                recipientNumber: phone,
                status: 'FAILED',
                error: err.message,
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
          },
          { merge: true }
        )
        .catch(() => {});
    }

    return { success: false, error: err.message };
  }
}

// Public SMS endpoint (optional — useful for manual re-sends or the reseller widget)
app.post('/api/sms/send', async (req, res) => {
  const { recipientNumber, message, bookingRef, kind } = req.body;

  if (!recipientNumber || !message) {
    return res.status(400).json({ error: 'Missing recipientNumber or message' });
  }

  const result = await sendSmsInternal(recipientNumber, message, bookingRef, kind);
  return res.status(result.success ? 200 : 500).json(result);
});

// ─────────────────────────────────────────────────────────────
// 8. SMS DELIVERY REPORT WEBHOOK
// Register this URL in SMSMessenger:
//   https://YOUR-RENDER-APP.onrender.com/api/sms/dlr
// ─────────────────────────────────────────────────────────────
app.all('/api/sms/dlr', async (req, res) => {
  // Ack immediately — gateways retry on non-2xx and can flood you
  res.status(200).send('OK');

  try {
    const payload = req.method === 'GET' ? req.query : req.body;

    console.log('RAW DLR WEBHOOK:', JSON.stringify(payload));

    const messageId = payload.messageId || payload.message_id || payload.id || null;
    const status = (
      payload.status ||
      payload.deliveryStatus ||
      payload.dlrStatus ||
      ''
    ).toUpperCase();
    const recipient =
      payload.recipientNumber || payload.recipient || payload.msisdn || null;
    const errorCode = payload.errorCode || payload.error_code || null;

    if (!messageId && !recipient) {
      console.warn('DLR missing identifiers, ignoring.');
      return;
    }

    // Find the booking that owns this SMS
    let bookingRef = null;

    if (messageId) {
      const snap = await db
        .collection('bookings')
        .where('sms.customer.messageId', '==', messageId)
        .limit(1)
        .get();
      if (!snap.empty) bookingRef = snap.docs[0].ref;

      if (!bookingRef) {
        const snap2 = await db
          .collection('bookings')
          .where('sms.driver.messageId', '==', messageId)
          .limit(1)
          .get();
        if (!snap2.empty) bookingRef = snap2.docs[0].ref;
      }
    }

    if (!bookingRef && recipient) {
      const snap = await db
        .collection('bookings')
        .where('phone', '==', recipient)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!snap.empty) bookingRef = snap.docs[0].ref;
    }

    if (!bookingRef) {
      console.warn('No booking matched DLR:', payload);
      return;
    }

    const isDelivered = ['DELIVRD', 'DELIVERED', 'SUCCESS'].includes(status);
    const isFailed = ['UNDELIV', 'EXPIRED', 'REJECTD', 'FAILED', 'ERROR'].includes(status);

    await bookingRef.set(
      {
        smsDLR: {
          messageId,
          recipientNumber: recipient,
          status: status || 'UNKNOWN',
          delivered: isDelivered,
          failed: isFailed,
          errorCode,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(isDelivered
            ? { deliveredAt: admin.firestore.FieldValue.serverTimestamp() }
            : {}),
        },
      },
      { merge: true }
    );

    console.log(`DLR ${messageId || recipient} → ${status} (booking updated)`);
  } catch (err) {
    console.error('DLR processing error:', err);
  }
});

// ─────────────────────────────────────────────────────────────
// 9. Wildcard Fallback
// ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KP Logistics Web Service listening on port ${PORT}`));
