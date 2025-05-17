import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const mailerSend = new MailerSend({
  apiKey: 'mlsn.d6548175eb055b52e1be06757e7439682fb2cf03f13cf2d35f3bfe2b9809b025',
});



export async function sendEmail(obj : { to : string, subject : string, html : string, text : string}) {
    try {
        const sentFrom = new Sender("MS_jiVwnv@test-dnvo4d9moorg5r86.mlsender.net", "ManapnL");

        const recipients = [
          new Recipient(obj.to, "Your Client")
        ];
        
        const emailParams = new EmailParams()
          .setFrom(sentFrom)
          .setTo(recipients)
          .setReplyTo(sentFrom)
          .setSubject(obj.subject)
          .setHtml(obj.html)
          .setText(obj.text);
        
        await mailerSend.email.send(emailParams);
        
    } catch (error: any) {
      console.error('Error sending email:', error.response?.data || error);
    }
  }



  export async function sendPasswordEmail(email: string, resetLink: string) {
    const subject = "Reset Your Password";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello,</p>
        <p>You recently requested to reset your password. Click the button below to reset it:</p>
        <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>If the button above doesn’t work, copy and paste the following link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>If you did not request a password reset, please ignore this email.</p>
        <p>Thanks,<br/>The ManapnL Team</p>
      </div>
    `;
    const text = `
      Password Reset Request
    `;
  
    try {
      await sendEmail({
        to: email,
        subject,
        html,
        text,
      });
    } catch (error: any) {
      console.log("Error sending password reset email:", error);
    }
  }