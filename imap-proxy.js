import express from "express";
import cors from "cors";
import { ImapFlow } from "imapflow";

const app = express();
app.use(cors());

// Gmail credentials from environment
const EMAIL = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_PASS;

if (!EMAIL || !PASS) {
  console.error("Error: Set GMAIL_USER and GMAIL_PASS environment variables");
  process.exit(1);
}

// Initialize IMAP client
const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: {
    user: EMAIL,
    pass: PASS,
  },
});

// Track last UID to avoid duplicates
let lastUID = null;
let connected = false;

async function connectIMAP() {
  if (!connected) {
    await client.connect();
    connected = true;
    console.log("Connected to Gmail IMAP");
  }
}

// Function to extract OTP (4-6 digits)
function extractOTP(text) {
  const match = text.match(/\b\d{4,6}\b/);
  return match ? match[0] : null;
}

app.get("/latest", async (req, res) => {
  try {
    await connectIMAP();
    await client.mailboxOpen("INBOX");

    const lock = await client.getMailboxLock("INBOX");
    try {
      const message = await client.fetchOne("*", { envelope: true, source: true });

      if (!message) return res.json({ message: "No messages found" });

      // Avoid returning same message
      if (message.uid === lastUID) return res.json({ message: "No new message" });
      lastUID = message.uid;

      const sender = message.envelope.from[0].address;
      const subject = message.envelope.subject || "";
      const body = message.source.toString();

      const otp = extractOTP(body);

      res.json({
        sender,
        subject,
        otp,
        id: message.uid,
        receivedAt: Date.now(),
      });
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mail", details: err.message });
  }
});

// Railway provides PORT env variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IMAP Proxy running on port ${PORT}`));
