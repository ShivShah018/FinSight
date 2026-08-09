async function sendPasswordResetEmail(toEmail, rawToken) {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://fin-sight-beta-dusky.vercel.app').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
  const fromEmail = process.env.EMAIL_FROM || 'FinSight <onboarding@resend.dev>';
  const apiKey = process.env.RESEND_API_KEY;

  console.log('[emailService] Attempting password reset email dispatch via Resend API:');
  console.log(`  - Recipient: ${toEmail}`);
  console.log(`  - FRONTEND_URL: ${process.env.FRONTEND_URL ? 'CONFIGURED (' + frontendUrl + ')' : 'DEFAULT (' + frontendUrl + ')'}`);
  console.log(`  - EMAIL_FROM: ${process.env.EMAIL_FROM ? 'CONFIGURED (' + fromEmail + ')' : 'DEFAULT (' + fromEmail + ')'}`);
  console.log(`  - RESEND_API_KEY: ${apiKey ? 'PRESENT (len=' + apiKey.length + ')' : 'MISSING'}`);

  if (!apiKey) {
    const msg = 'RESEND_API_KEY environment variable is missing on server. Cannot deliver email.';
    console.error(`[emailService] ERROR: ${msg}`);
    return { success: false, error: msg };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
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
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.message || data.error || `HTTP ${response.status} ${response.statusText}`;
      console.error(`[emailService] ERROR from Resend API for ${toEmail}: ${errMsg}`);
      if (data.name) console.error(`  - Resend Error Type: ${data.name}`);
      return { success: false, error: errMsg };
    }

    console.log(`[emailService] SUCCESS: Password reset email successfully dispatched to ${toEmail} via Resend. Email ID: ${data.id}`);
    return { success: true, emailId: data.id };
  } catch (err) {
    console.error(`[emailService] ERROR dispatching email to ${toEmail}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendPasswordResetEmail
};
