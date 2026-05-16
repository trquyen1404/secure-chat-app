const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // e.g. utt.chat.verify@gmail.com
    pass: process.env.EMAIL_PASS  // App password
  }
});

exports.sendVerificationCode = async (email, code) => {
  const mailOptions = {
    from: `"UTT Secure Chat" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Mã xác thực tài khoản UTT Secure Chat',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #4f46e5; text-align: center;">Chào mừng bạn đến với UTT Secure Chat</h2>
        <p>Để hoàn tất đăng ký tài khoản tại Đại học Công nghệ Giao thông vận tải, vui lòng sử dụng mã xác nhận dưới đây:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1f2937;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Mã này có hiệu lực trong vòng 24 giờ. Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="text-align: center; color: #9ca3af; font-size: 12px;">© 2026 UTT Secure Chat - Hệ thống nội bộ Đại học Công nghệ GTVT</p>
      </div>
    `
  };

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('!!! [MAIL_SERVICE] Email credentials not set. Printing code to console instead:');
    console.log(`\x1b[33m[VERIFICATION CODE for ${email}]: ${code}\x1b[0m`);
    return true;
  }

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('[MAIL_SERVICE] Error sending email:', error);
    // Even if it fails, we logged the code so developer can test
    console.log(`\x1b[33m[VERIFICATION CODE for ${email}]: ${code}\x1b[0m`);
    return false;
  }
};
