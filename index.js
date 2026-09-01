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
  console.log('Received SMS from:', sender, 'Message:', message);

  if (message) {
    // বিকাশ (TrxID), নগদ ও রকেট (TxnID, TxID)-এর জন্য সার্বজনীন Regex Filter
    const trxMatch = message.match(/(?:TrxID|TxnID|TxID|TRXID|TXNID)[:\s]*([A-Z0-9]+)/i);
    const amountMatch = message.match(/(?:Tk|BDT|Tk\.)\s*([\d,]+\.?\d*)/i);
    const numberMatch = message.match(/(?:from|to)\s+(01\d{9})/i);

    if (trxMatch) {
      const trxId = trxMatch[1].toUpperCase();
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
      const senderNum = numberMatch ? numberMatch[1] : '';

      // Balance অংশ হাইড করা (বিকাশ, নগদ ও রকেট সবগুলোর জন্য)
      const cleanedMessage = message.replace(/(?:Balance|Bal)\s*(?:Tk|BDT|Tk\.)?\s*[\d,]+\.?\d*/gi, 'Balance Tk ***');

      transactions[trxId] = {
        sender: sender || 'Unknown',
        amount: amount,
        senderNumber: senderNum,
        message: cleanedMessage,
        isUsed: false,
        time: new Date()
      };

      console.log(`Saved Successfully -> TrxID/TxnID: ${trxId} | Amount: ${amount}`);
    } else {
      console.log('Failed to match TrxID/TxnID from SMS:', message);
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
      "📦 `!order <Amount> <Product_Name>` - নতুন অর্ডার তৈরি করার জন্য (Staff/Admin Only)।\n" +
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

  // ৩. অর্ডার তৈরি করার কমান্ড (Allowed Roles Only): !order <Amount> <Product_Name>
  if (message.content.startsWith('!order')) {
    const allowedKeywords = ['owner', 'management', 'team hypernest', 'official staff', 'admin'];

    const hasPermission = message.member && message.member.roles.cache.some(role => {
      const roleName = role.name.toLowerCase();
      return allowedKeywords.some(keyword => roleName.includes(keyword));
    });

    if (!hasPermission) {
      return message.reply('❌ **অ্যাক্সেস ডিনাইড!** এই কমান্ডটি দেওয়ার পারমিশন আপনার নেই।');
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

    // বিশদ বিবরণ সহ সফল রেসপন্স
    const successMsg = "🎉 **পেমেন্ট ভেরিফাইড ও সফল হয়েছে!**\n\n" +
      "🛍️ **Product Name:** " + currentOrder.product + "\n" +
      "💰 **Paid Amount:** Tk " + trxData.amount + "\n" +
      "🆔 **Transaction ID:** " + trxId + "\n" +
      "📱 **Sender Provider:** " + trxData.sender + "\n\n" +
      "📄 **Full Message:**\n```\n" + trxData.message + "\n```\n" +
      "আপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে!";

    return message.reply(successMsg);
  }
});

// বট লগইন
client.login(process.env.DISCORD_TOKEN);

// সার্ভার পোর্ট লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
