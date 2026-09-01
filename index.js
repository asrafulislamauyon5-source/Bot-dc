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

// SMS ডেটা জমা রাখার অবজেক্ট
const transactions = {};

// SMS Forwarder থেকে আসা ডেটা রিসিভ করার এন্ডপয়েন্ট
app.post('/sms-webhook', (req, res) => {
  const { sender, message } = req.body;
  console.log('Received SMS:', sender, message);

  if (message) {
    // TrxID বের করার রেগুলার এক্সপ্রেশন
    const trxMatch = message.match(/TrxID\s+([A-Z0-9]+)/i);
    // টাকার পরিমাণ বের করার রেগুলার এক্সপ্রেশন
    const amountMatch = message.match(/(?:Tk|BDT)\s*([\d,]+\.?\d*)/i);

    if (trxMatch) {
      const trxId = trxMatch[1].toUpperCase();
      const amount = amountMatch ? amountMatch[1] : 'Unknown';

      transactions[trxId] = {
        sender: sender || 'Unknown',
        amount: amount,
        fullMessage: message,
        time: new Date()
      };

      console.log(`Saved TrxID: ${trxId} | Amount: ${amount}`);
    }
  }

  res.status(200).send({ status: 'success' });
});

// ডিসকর্ড কমান্ড হ্যান্ডলার
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    const trxId = args[1] ? args[1].trim().toUpperCase() : null;

    if (!trxId) {
      return message.reply('❌ অনুগ্রহ করে একটি Transaction ID দিন। উদাহরণ: `!verify DI142AHR94`');
    }

    if (transactions[trxId]) {
      const data = transactions[trxId];
      // ব্যালেন্স বা গোপন তথ্য ছাড়া শুধু প্রয়োজনীয় অংশ দেখানো
      message.reply(`✅ Transaction **${trxId}** সফলভাবে ভেরিফাই হয়েছে!\n💰 **টাকার পরিমাণ:** Tk ${data.amount}`);
    } else {
      message.reply(`❌ Transaction ID: **${trxId}** খুঁজে পাওয়া যায়নি। সঠিক ID দিন অথবা কিছু সময় পর চেষ্টা করুন।`);
    }
  }
});

// বট লগইন
client.login(process.env.DISCORD_TOKEN);

// সার্ভার পোর্ট লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
