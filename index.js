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

      console.log(`Saved TrxID: ${trxId} \vert{} Amount:${amount}`);
    }
  }

  res.status(200).send({ status: 'success' });
});

// ডিসকর্ড কমান্ড হ্যান্ডলার
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ১. পেমেন্ট নম্বর দেখার নতুন কমান্ড: !pay
  if (message.content.trim() === '!pay') {
    return message.reply(
`💳 **Our Payment Methods** (১-ক্লিকে কপি করুন):

💖 **bKash (Personal):**
\`01756625140\`

🧡 **Nagad (Personal):**
\`01604757018\`

💜 **Rocket (Personal):**
\`01756625140\`

⚠️ *টাকা পাঠানোর পর ট্রানজ্যাকশন আইডি ভেরিফাই করতে `!verify <TrxID>` কমান্ডটি ব্যবহার করুন।*`
    );
  }

  // ২. অর্ডার তৈরি করার কমান্ড: !order <Amount> <Product_Name>
  if (message.content.startsWith('!order')) {
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

    return message.reply(
`📦 **অর্ডার তৈরি করা হয়েছে!**
🛍️ **Product:** ${productName}
💰 **Payable Amount:** Tk ${amount}

💳 **Payment Numbers** (কপি করতে স্পর্শ করুন):
💖 **bKash:** \`01756625140\`
🧡 **Nagad:** \`01604757018\`
💜 **Rocket:** \`01756625140\`

👉 টাকা পাঠানোর পর কাস্টমার এখানে লিখুন: \`!verify <TrxID>\``
    );
  }

  // ৩. পেমেন্ট ভেরিফাই করার কমান্ড: !verify <TrxID>
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
      return message.reply(`❌ Transaction ID: **${trxId}** খুঁজে পাওয়া যায়নি। টাকা পাঠিয়ে থাকলে ১-২ মিনিট অপেক্ষা করে আবার চেষ্টা করুন।`);
    }

    if (trxData.isUsed) {
      return message.reply('⚠️ এই Transaction ID টি আগেই ভেরিফাই করা হয়ে গেছে!');
    }

    if (trxData.amount < currentOrder.amount) {
      return message.reply(`❌ **পেমেন্ট অসম্পূর্ণ!**\nপ্রয়োজনীয় টাকা: **Tk ${currentOrder.amount}**\nআপনি পাঠিয়েছেন: **Tk ${trxData.amount}**`);
    }

    trxData.isUsed = true;
    delete pendingOrders[message.channel.id];

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
  
