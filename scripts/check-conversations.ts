import mongoose from 'mongoose';

await mongoose.connect('mongodb://localhost:27017/noxivo');

const Conversation = mongoose.model('Conversation');
const Message = mongoose.model('Message');

// Find all conversations for this contact (by phone number)
const phone = '13468207183';
const conversations = await Conversation.find({
  $or: [
    { contactId: { $regex: phone } },
    { contactPhone: { $regex: phone } }
  ]
}).lean();

console.log(`Found ${conversations.length} conversations:`);
for (const c of conversations) {
  const msgCount = await Message.countDocuments({ conversationId: c._id });
  console.log(`- _id: ${c._id}`);
  console.log(`  contactId: ${c.contactId}`);
  console.log(`  contactPhone: ${c.contactPhone}`);
  console.log(`  contactName: ${c.contactName}`);
  console.log(`  messages: ${msgCount}`);
  console.log(`  lastMessageAt: ${c.lastMessageAt}`);
  console.log('');
}

process.exit(0);