import mongoose from 'mongoose';
import { UserModel } from './packages/database/src/models/user.js';
import { dbConnect } from './apps/workflow-engine/src/lib/mongodb.js';

async function listUsers() {
  await dbConnect();
  const users = await UserModel.find({}, { email: 1, fullName: 1, role: 1, status: 1 }).lean();
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

listUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
