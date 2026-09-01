const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const transactions = {};
const pendingOrders = {};

app.post('/sms-webhook', (req, res) => {
  // অ্যাপ থেকে যেভাবে ডেটাই আসুক না কেন তা রিসিভ করা
  const body = req.body || {};
  const sender = body.sender || body.from || body.phone || 'Unknown';
  const message = body.message || body.text || body.sms || body.body || (typeof body === 'string' ? body : '');

  console.log('Received Webhook Payload:', JSON.stringify(body));

  if (message) {
    // bKash (TrxID), Nagad (TxnID/TxID), Rocket (TxnID/TrxID) সব মেলাবে
    const trxMatch = message.match(/(?:TrxID|TxnID|TxID|TRXID|TXNID|Trx ID|Txn ID)[:\s]*([A-Z0-9]+)/i);
    const amountMatch = message.match(/(?:Tk|BDT|Tk\.)\s*([\d,]+\.?\d*)|([\d,]+\.?\d*)\s*(?:Tk|BDT|Tk\.)/i);

    if (trxMatch) {
      const trxId = trxMatch[1].toUpperCase();
      let rawAmount = 0;
      if (amountMatch) {
        rawAmount = amountMatch[1] || amountMatch[2];
      }
      const amount = rawAmount ? parseFloat(rawAmount.replace(',', '')) : 0;

      // সিকিউরিটির জন্য Balance তথ্য মুছে দেওয়া
      const cleanedMessage = message.replace(/(?:Balance|Bal)\s*(?:Tk|BDT|Tk\.)?\s*[\d,]+\.?\d*/gi, 'Balance Tk ***');

      transactions[trxId] = {
        sender: sender,
        amount: amount,
        message: cleanedMessage,
        isUsed: false,
        time: new Date()
      };

      console.log(`✅ Saved TrxID: ${trxId} | Amount: ${amount}`);
    } else {
      console.log('❌ Could not parse TrxID from message:', message);
    }
  }

  res.status(200).send({ status: 'success' });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.trim() === '!help') {
    return message.reply(
      "📜 **Bot Commands List:**\n\n" +
      "💳 `!pay` - পেমেন্ট নম্বর দেখতে।\n" +
      "🔍 `!verify <TrxID>` - পেমেন্ট ভেরিফাই করতে।\n" +
      "📦 `!order <Amount> <Product_Name>` - নতুন অর্ডার তৈরি করতে।"
    );
  }

  if (message.content.trim() === '!pay') {
    return message.reply(
      "💳 **Our Payment Methods:**\n\n" +
      "💖 **bKash:** `01756625140`\n" +
      "🧡 **Nagad:** `01604757018`\n" +
      "💜 **Rocket:** `01756625140`"
    );
  }

  if (message.content.startsWith('!order')) {
    const args = message.content.split(' ');
    const amount = parseFloat(args[1]);
    const productName = args.slice(2).join(' ');

    if (!amount || !productName) {
      return message.reply('❌ সঠিক ফরম্যাট: `!order <Amount> <Product_Name>`');
    }

    pendingOrders[message.channel.id] = {
      amount: amount,
      product: productName,
      createdBy: message.author.tag
    };

    return message.reply(
      `📦 **অর্ডার তৈরি হয়েছে!**\n🛍️ **Product:** ${productName}\n💰 **Amount:** Tk ${amount}\n\n👉 টাকা পাঠিয়ে ভেরিফাই করতে লিখুন: \`!verify <TrxID>\``
    );
  }

  if (message.content.startsWith('!verify')) {
    const args = message.content.split(' ');
    const trxId = args[1] ? args[1].trim().toUpperCase() : null;

    if (!trxId) {
      return message.reply('❌ সঠিক ফরম্যাট: `!verify <TrxID>`');
    }

    const currentOrder = pendingOrders[message.channel.id];
    if (!currentOrder) {
      return message.reply('❌ এই চ্যানেলে কোনো পেন্ডিং অর্ডার নেই!');
    }

    const trxData = transactions[trxId];
    if (!trxData) {
      return message.reply(`❌ Transaction ID: **${trxId}** খুঁজে পাওয়া যায়নি। টাকা বানিয়ে থাকলে ১ মিনিট পর চেষ্টা করুন।`);
    }

    if (trxData.isUsed) {
      return message.reply('⚠️ এই Transaction ID টি আগেই ব্যবহৃত হয়েছে!');
    }

    if (trxData.amount < currentOrder.amount) {
      return message.reply(`❌ **পেমেন্ট অসম্পূর্ণ!**\nপ্রয়োজন: **Tk ${currentOrder.amount}**\nপাঠিয়েছেন: **Tk ${trxData.amount}**`);
    }

    trxData.isUsed = true;
    delete pendingOrders[message.channel.id];

    return message.reply(
      `🎉 **পেমেন্ট ভেরিফাইড!**\n\n🛍️ **Product:** ${currentOrder.product}\n💰 **Amount:** Tk ${trxData.amount}\n🆔 **TrxID:** ${trxId}\n\n📄 **Full Message:**\n\`\`\`\n${trxData.message}\n\`\`\``
    );
  }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
