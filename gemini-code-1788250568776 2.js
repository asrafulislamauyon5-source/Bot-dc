const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ট্রানজেকশন ডাটা সেভ রাখার জন্য
const pendingTransactions = new Map();

// Webhook Endpoint (SMS Forwarder থেকে মেসেজ আসবে)
app.post('/sms-webhook', (req, res) => {
  const { sender, message } = req.body;
  console.log(`Received SMS from ${sender}: ${message}`);

  if (message) {
    // bKash/Nagad ট্রানজেকশন আইডি বের করার জন্য Regex Pattern
    const trxMatch = message.match(/(?:TrxID|TxnID|ID)\s+([A-Z0-9]+)/i);
    if (trxMatch && trxMatch[1]) {
      const trxId = trxMatch[1].trim();
      pendingTransactions.set(trxId, { sender, message, time: Date.now() });
      console.log(`Stored TrxID: ${trxId}`);
    }
  }

  res.status(200).send({ status: 'success' });
});

// Discord Bot Commands
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    const userTrxId = args[1]?.trim();

    if (!userTrxId) {
      return message.reply('অনুগ্রহ করে Transaction ID দিন। উদাহরণ: `!verify DI181WDGZQ`');
    }

    if (pendingTransactions.has(userTrxId)) {
      const txData = pendingTransactions.get(userTrxId);
      message.reply(`✅ Transaction **${userTrxId}** সফলভাবে ভেরিফাই হয়েছে!\n**SMS Details:** ${txData.message}`);
      pendingTransactions.delete(userTrxId);
    } else {
      message.reply(`❌ Transaction ID: **${userTrxId}** খুঁজে পাওয়া যায়নি। সঠিক ID দিন অথবা কিছু সময় পর চেষ্টা করুন।`);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);