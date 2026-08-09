const nodemailer = require('nodemailer');

async function sendPasswordResetEmail(toEmail, rawToken) {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://fin-sight-gibqyxvx0-shivshah18.vercel.app').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
  const fromEmail = process.env.EMAIL_FROM || '"FinSight" <noreply@finsight.app>';

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log('[emailService] Attempting password reset email dispatch:');
  console.log(`  - Recipient: ${toEmail}`);
  console.log(`  - FRONTEND_URL: ${process.env.FRONTEND_URL ? 'CONFIGURED (' + frontendUrl + ')' : 'DEFAULT (' + frontendUrl + ')'}`);
  console.log(`  - EMAIL_FROM: ${process.env.EMAIL_FROM ? 'CONFIGURED (' + fromEmail + ')' : 'DEFAULT (' + fromEmail + ')'}`);
  console.log(`  - SMTP_HOST: ${host ? host : 'MISSING'}`);
  console.log(`  - SMTP_PORT: ${port}`);
  console.log(`  - SMTP_USER: ${user ? user : 'MISSING'}`);
  console.log(`  - SMTP_PASS: ${pass ? 'PRESENT (len=' + pass.length + ')' : 'MISSING'}`);

  if (!host || !user || !pass) {
    const missingVars = [];
    if (!host) missingVars.push('SMTP_HOST');
    if (!user) missingVars.push('SMTP_USER');
    if (!pass) missingVars.push('SMTP_PASS');
    const msg = `SMTP environment variables missing on server: ${missingVars.join(', ')}. Cannot deliver email.`;
    console.error(`[emailService] ERROR: ${msg}`);
    return { success: false, error: msg };
  }

  try {
    const isGmail = host.toLowerCase().includes('gmail');
    const transporter = nodemailer.createTransport(
      isGmail
        ? {
            service: 'gmail',
            auth: { user, pass }
          }
        : {
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            tls: {
              rejectUnauthorized: false
            }
          }
    );

    const mailOptions = {
      from: fromEmail,
      to: toEmail,
      subject: 'Reset your FinSight password',
      text: `Hello,\n\nA password reset request was received for your FinSight account.\n\nPlease reset your password by visiting the link below (valid for 60 minutes):\n${resetUrl}\n\nIf you did not request this reset, you can safely ignore this email.\n\nBest regards,\nFinSight Team`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 40px; color: #f8fafc;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; padding: 32px; border: 1px solid #334155;">
            <h2 style="color: #c084fc; margin-top: 0; font-size: 24px; font-weight: bold;">FinSight</h2>
            <h3 style="color: #ffffff; font-size: 18px; margin-bottom: 12px;">Reset Your Password</h3>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
              We received a request to reset the password for your FinSight account. Click the button below to set a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #9333ea; color: #ffffff; padding: 12px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">Reset Password</a>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
              This link is valid for <strong>60 minutes</strong> and can only be used once.<br/>
              If you did not request a password reset, please ignore this email.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[emailService] SUCCESS: Password reset email successfully dispatched to ${toEmail}. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[emailService] ERROR sending email to ${toEmail}:`, err.message || err);
    if (err.code) console.error(`  - Error Code: ${err.code}`);
    if (err.command) console.error(`  - Command: ${err.command}`);
    if (err.response) console.error(`  - Provider Response: ${err.response}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendPasswordResetEmail
};
