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

// ডাটা রাখার অবজেক্ট
const transactions = {};
const pendingOrders = {};

// SMS Forwarder থেকে আসা ডেটা রিসিভ করা
app.post('/sms-webhook', (req, res) => {
  const { sender, message } = req.body;
  console.log('Received SMS:', sender, message);

  if (message) {
    const trxMatch = message.match(/TrxID\s+([A-Z0-9]+)/i);
    const amountMatch = message.match(/(?:Tk|BDT)\s*([\d,]+\.?\d*)/i);
    const numberMatch = message.match(/(?:from|to)\s+(01\d{9})/i);

    if (trxMatch) {
      const trxId = trxMatch[1].toUpperCase();
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
      const senderNum = numberMatch ? numberMatch[1] : '';

      // Balance অংশ হাইড করা
      const cleanedMessage = message
        .replace(/Balance\s+(?:Tk|BDT)?\s*[\d,]+\.?\d*/gi, 'Balance Tk ***')
        .replace(/Bal\s+(?:Tk|BDT)?\s*[\d,]+\.?\d*/gi, 'Bal Tk ***');

      transactions[trxId] = {
        sender: sender || 'Unknown',
        amount: amount,
        senderNumber: senderNum,
        message: cleanedMessage,
        isUsed: false, // একটি TrxID যেন ২ বার ভেরিফাই না হতে পারে
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

  // ১. আপনি বা স্টাফদের অর্ডার তৈরি করার কমান্ড:
  // উদাহরণ: !order 500 Netflix
  if (message.content.startsWith('!order')) {
    const args = message.content.split(' ');
    const amount = parseFloat(args[1]);
    const productName = args.slice(2).join(' ');

    if (!amount || !productName) {
      return message.reply('❌ সঠিক ফরম্যাট লিখুন: `!order <Amount> <Product_Name>`\nউদাহরণ: `!order 500 Netflix Subscription`');
    }

    // চ্যানলে অর্ডার রিকোয়েস্ট সেভ করা
    pendingOrders[message.channel.id] = {
      amount: amount,
      product: productName,
      createdBy: message.author.tag
    };

    return message.reply(`📦 **অর্ডার তৈরি করা হয়েছে!**\n🛍️ **Product:** ${productName}\n💰 **Payable Amount:** Tk ${amount}\n\n👉 টাকা পাঠানোর পর কাস্টমার এখানে লিখুন: `!verify <TrxID>``);
  }

  // ২. কাস্টমারদের পেমেন্ট ভেরিফাই করার কমান্ড:
  // উদাহরণ: !verify DI142AHR94
  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    const trxId = args[1] ? args[1].trim().toUpperCase() : null;

    if (!trxId) {
      return message.reply('❌ অনুগ্রহ করে আপনার Transaction ID দিন।\nউদাহরণ: `!verify DI142AHR94`');
    }

    const currentOrder = pendingOrders[message.channel.id];

    // যদি কোনো অর্ডার আগে থেকে তৈরি করা না থাকে
    if (!currentOrder) {
      return message.reply('❌ এই চ্যানেলে কোনো পেন্ডিং অর্ডার নেই! প্রথমে অ্যাডমিনকে অর্ডার তৈরি করতে বলুন।');
    }

    const trxData = transactions[trxId];

    if (!trxData) {
      return message.reply(`❌ Transaction ID: **${trxId}** খুঁজে পাওয়া যায়নি। টাকা পাঠিয়ে থাকলে ১-২ মিনিট অপেক্ষা করে আবার চেষ্টা করুন।`);
    }

    if (trxData.isUsed) {
      return message.reply('⚠️ এই Transaction ID টি আগেই ভেরিফাই করা হয়ে গেছে!');
    }

    // কাস্টমারের পাঠানো টাকা মিলছে কি না তা চেক করা
    if (trxData.amount < currentOrder.amount) {
      return message.reply(`❌ **পেমেন্ট অসম্পূর্ণ!**\nপ্রয়োজনীয় টাকা: **Tk ${currentOrder.amount}**\nআপনি পাঠিয়েছেন: **Tk ${trxData.amount}**`);
    }

    // পেমেন্ট সফল হলে
    trxData.isUsed = true; // TrxID ব্যবহৃত চিহ্নিত হলো
    delete pendingOrders[message.channel.id]; // পেন্ডিং অর্ডার শেষ হলো

    return message.reply(`🎉 **পেমেন্ট ভেরিফাইড ও সফল হয়েছে!**\n\n🛍️ **Product:** ${currentOrder.product}\n💰 **Paid Amount:** Tk ${trxData.amount}\n🆔 **TrxID:** ${trxId}\n\nআপনার অর্ডার প্রক্রিয়াধীন রয়েছে!`);
  }
});

// বট লগইন
client.login(process.env.DISCORD_TOKEN);

// সার্ভার পোর্ট লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
