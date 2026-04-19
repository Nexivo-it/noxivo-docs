import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/noxivo';

async function listUsers() {
  console.log(`Connecting to ${mongoUri}...`);
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    if (!db) {
        throw new Error('Database connection failed');
    }
    
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.log('No users found in the "users" collection.');
    } else {
      console.log(`Found ${users.length} user(s):`);
      users.forEach(u => {
        console.log(`- Email: ${u.email}, FullName: ${u.fullName}, Role: ${u.role}, Status: ${u.status}`);
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
