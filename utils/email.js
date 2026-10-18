const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer SMTP Transporter for Zoho Mail
 * Environment variables must be set on Render:
 * - ZOHO_USER: support@kplogistics.co.za
 * - ZOHO_PASS: your 12-character Zoho App Password
 * - ZOHO_HOST: smtp.zoho.com (or smtp.zoho.eu / smtppro.zoho.in depending on region)
 */
const transporter = nodemailer.createTransport({
    host: process.env.ZOHO_HOST || 'smtp.zoho.com',
    port: 465,
    secure: true, // TLS/SSL enabled on port 465
    auth: {
        user: process.env.ZOHO_USER || 'support@kplogistics.co.za',
        pass: process.env.ZOHO_PASS
    }
});

/**
 * Generic function to send outgoing emails from support@kplogistics.co.za
 * 
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} htmlContent - Formatted HTML message body
 * @returns {Promise<Object>} Status object with success flag and messageId/error
 */
const sendEmail = async (to, subject, htmlContent) => {
    try {
        const mailOptions = {
            from: '"KP Logistics Dispatch" <support@kplogistics.co.za>',
            to: to,
            subject: subject,
            html: htmlContent,
            replyTo: 'support@kplogistics.co.za'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Success] Sent to ${to} | ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`[Email Error] Failed sending to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Helper: Booking Confirmation Email Template for Clients
 */
const sendClientBookingConfirmation = async (clientEmail, bookingDetails) => {
    const subject = `Booking Confirmed #${bookingDetails.bookingId || 'KPL'} - KP Logistics`;
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
                <h2 style="color: #f97316; margin-top: 0;">KP Logistics Dispatch</h2>
                <p style="font-size: 16px; color: #334155;">Hi there,</p>
                <p style="font-size: 14px; color: #475569;">Your booking payment has been verified and your driver is being assigned.</p>
                
                <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Pickup:</strong> ${bookingDetails.pickup || 'Address provided'}</p>
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Drop-off:</strong> ${bookingDetails.dropoff || 'Address provided'}</p>
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Vehicle:</strong> ${bookingDetails.vehicleType || 'Bakkie/Truck'}</p>
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Payment Status:</strong> PAID</p>
                </div>

                <p style="font-size: 13px; color: #64748b;">If you need assistance with your delivery, reply directly to this email or contact support at support@kplogistics.co.za.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
                <p style="font-size: 11px; color: #94a3b8; text-align: center;">&copy; 2026 Kasiplus (PTY) Ltd. All rights reserved.</p>
            </div>
        </div>
    `;

    return await sendEmail(clientEmail, subject, htmlContent);
};

/**
 * Helper: Driver Dispatch Notification Email Template
 */
const sendDriverDispatchAlert = async (driverEmail, dispatchDetails) => {
    const subject = `New Delivery Dispatch Alert - KP Logistics`;
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 20px; color: #ffffff;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
                <h2 style="color: #f97316; margin-top: 0;">New Job Dispatched!</h2>
                <p style="font-size: 14px; color: #cbd5e1;">A new client booking requires pickup in your area.</p>
                
                <div style="background-color: #0f172a; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #334155;">
                    <p style="margin: 4px 0; font-size: 14px; color: #f8fafc;"><strong>Pickup:</strong> ${dispatchDetails.pickup}</p>
                    <p style="margin: 4px 0; font-size: 14px; color: #f8fafc;"><strong>Drop-off:</strong> ${dispatchDetails.dropoff}</p>
                    <p style="margin: 4px 0; font-size: 14px; color: #f8fafc;"><strong>Vehicle Needed:</strong> ${dispatchDetails.vehicleType}</p>
                </div>

                <p style="font-size: 13px; color: #94a3b8;">Open your KP Logistics Driver App to accept or navigate to this load.</p>
            </div>
        </div>
    `;

    return await sendEmail(driverEmail, subject, htmlContent);
};

module.exports = {
    sendEmail,
    sendClientBookingConfirmation,
    sendDriverDispatchAlert
};
