import mongoose from 'mongoose';
import { UserModel } from './packages/database/src/models/user.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/noxivo';

async function listUsers() {
  console.log(`Connecting to ${mongoUri}...`);
  try {
    await mongoose.connect(mongoUri);
    const users = await UserModel.find({}).lean();
    
    if (users.length === 0) {
      console.log('No users found in the database.');
    } else {
      console.log(`Found ${users.length} user(s):`);
      users.forEach(u => {
        console.log(`- Email: ${u.email}, Name: ${u.fullName}, Role: ${u.role}, Status: ${u.status}`);
      });
    }
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

listUsers();
