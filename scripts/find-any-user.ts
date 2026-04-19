import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:65292/admin';

async function listAllUsers() {
  console.log(`Connecting to ${mongoUri}...`);
  try {
    await mongoose.connect(mongoUri);
    const admin = mongoose.connection.db?.admin();
    
    if (!admin) {
        throw new Error('Admin connection failed');
    }
    
    const dbs = await admin.listDatabases();
    console.log(`Found databases: ${dbs.databases.map(d => d.name).join(', ')}`);
    
    for (const dbInfo of dbs.databases) {
      if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;
      
      const db = mongoose.connection.useDb(dbInfo.name);
      const users = await db.collection('users').find({}).toArray();
      
      if (users.length > 0) {
        console.log(`\nFound ${users.length} user(s) in database "${dbInfo.name}":`);
        users.forEach(u => {
          console.log(`- Email: ${u.email}, Name: ${u.fullName}, Role: ${u.role}`);
        });
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

listAllUsers();
