import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const senderGmail = process.env.GMAIL_ADDR;
const recipients = process.env.RECIPIENTS;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  "https://developers.google.com/oauthplayground"
);

oAuth2Client.setCredentials({ refresh_token: gmailRefreshToken });
const accessToken = await oAuth2Client.getAccessToken();

const smtpTransport = nodemailer.createTransport({
     service: "gmail",
     auth: {
          type: "OAuth2",
          user: senderGmail, 
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          refreshToken: gmailRefreshToken,
          accessToken: accessToken
     },
     tls: {
        rejectUnauthorized: false
      }
});


export const generateMailHtml = (subject,html) => {
  const emailHTML ={
    from: senderGmail,
    to: recipients,
    subject: subject,
    generateTextFromHTML: true,
    html: html
  }
  return emailHTML;
}


export async function sendEmail(emailHTML) {
  try {
    const info = await smtpTransport.sendMail(emailHTML);

    console.log(`Email sent to ${recipients}: ${info.response}`);
  } catch (err) {
    console.error("Email failed with error message:", err);
  }
}