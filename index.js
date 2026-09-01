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
        isUsed: false,
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

  // ১. হেল্প কমান্ড: !help
  if (message.content.trim() === '!help') {
    const helpText = "📜 **Bot Commands List:**\n\n" +
      "💳 `!pay` - বিকাশ, নগদ ও রকেট নম্বর দেখার জন্য।\n" +
      "🔍 `!verify <TrxID>` - পেমেন্ট ভেরিফাই করার জন্য (কাস্টমারদের জন্য)।\n" +
      "📦 `!order <Amount> <Product_Name>` - নতুন অর্ডার তৈরি করার জন্য (শুধুমাত্র Owner/Admin)।\n" +
      "ℹ️ `!help` - সকল কমান্ডের তালিকা দেখতে।";

    return message.reply(helpText);
  }

  // ২. পেমেন্ট নম্বর দেখার কমান্ড: !pay
  if (message.content.trim() === '!pay') {
    const payText = "💳 **Our Payment Methods** (১-ক্লিকে কপি করুন):\n\n" +
      "💖 **bKash (Personal):**\n`01756625140`\n\n" +
      "🧡 **Nagad (Personal):**\n`01604757018`\n\n" +
      "💜 **Rocket (Personal):**\n`01756625140`\n\n" +
      "⚠️ *টাকা পাঠানোর পর ট্রানজ্যাকশন আইডি ভেরিফাই করতে `!verify <TrxID>` কমান্ডটি ব্যবহার করুন।*";
    
    return message.reply(payText);
  }

  // ৩. অর্ডার তৈরি করার কমান্ড (Owner Access Only): !order <Amount> <Product_Name>
  if (message.content.startsWith('!order')) {
    // Verified Owner রোল চেকিং
    const hasOwnerRole = message.member && message.member.roles.cache.some(role => role.name.toLowerCase() === 'verified owner');

    if (!hasOwnerRole) {
      return message.reply('❌ **অ্যাক্সেস ডিনাইড!** এই কমান্ডটি শুধুমাত্র **verified owner** রোলের ইউজাররা ব্যবহার করতে পারবেন।');
    }

    const args = message.content.split(' ');
    const amount = parseFloat(args[1]);
    const productName = args.slice(2).join(' ');

    if (!amount || !productName) {
      return message.reply('❌ সঠিক ফরম্যাট লিখুন: `!order <Amount> <Product_Name>`\nউদাহরণ: `!order 500 Netflix Subscription`');
    }

    pendingOrders[message.channel.id] = {
      amount: amount,
      product: productName,
      createdBy: message.author.tag
    };

    const orderText = "📦 **অর্ডার তৈরি করা হয়েছে!**\n" +
      "🛍️ **Product:** " + productName + "\n" +
      "💰 **Payable Amount:** Tk " + amount + "\n\n" +
      "💳 **Payment Numbers** (কপি করতে স্পর্শ করুন):\n" +
      "💖 **bKash:** `01756625140`\n" +
      "🧡 **Nagad:** `01604757018`\n" +
      "💜 **Rocket:** `01756625140`\n\n" +
      "👉 টাকা পাঠানোর পর কাস্টমার এখানে লিখুন: `!verify <TrxID>`";

    return message.reply(orderText);
  }

  // ৪. পেমেন্ট ভেরিফাই করার কমান্ড: !verify <TrxID>
  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    const trxId = args[1] ? args[1].trim().toUpperCase() : null;

    if (!trxId) {
      return message.reply('❌ অনুগ্রহ করে আপনার Transaction ID দিন।\nউদাহরণ: `!verify DI142AHR94`');
    }

    const currentOrder = pendingOrders[message.channel.id];

    if (!currentOrder) {
      return message.reply('❌ এই চ্যানেলে কোনো পেন্ডিং অর্ডার নেই! প্রথমে অ্যাডমিনকে অর্ডার তৈরি করতে বলুন।');
    }

    const trxData = transactions[trxId];

    if (!trxData) {
      return message.reply('❌ Transaction ID: **' + trxId + '** খুঁজে পাওয়া যায়নি। টাকা পাঠিয়ে থাকলে ১-২ মিনিট অপেক্ষা করে আবার চেষ্টা করুন।');
    }

    if (trxData.isUsed) {
      return message.reply('⚠️ এই Transaction ID টি আগেই ভেরিফাই করা হয়ে গেছে!');
    }

    if (trxData.amount < currentOrder.amount) {
      return message.reply('❌ **পেমেন্ট অসম্পূর্ণ!**\nপ্রয়োজনীয় টাকা: **Tk ' + currentOrder.amount + '**\nআপনি পাঠিয়েছেন: **Tk ' + trxData.amount + '**');
    }

    trxData.isUsed = true;
    delete pendingOrders[message.channel.id];

    return message.reply('🎉 **পেমেন্ট ভেরিফাইড ও সফল হয়েছে!**\n\n🛍️ **Product:** ' + currentOrder.product + '\n💰 **Paid Amount:** Tk ' + trxData.amount + '\n🆔 **TrxID:** ' + trxId + '\n\nআপনার অর্ডার প্রক্রিয়াধীন রয়েছে!');
  }
});

// বট লগইন
client.login(process.env.DISCORD_TOKEN);

// সার্ভার পোর্ট লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
