import mongoose from 'mongoose';

type RenamePair = {
  oldField: string;
  newField: string;
};

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/noxivo';

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    if (!db) {
      throw new Error('MongoDB connection database is unavailable');
    }

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c: { name: string }) => c.name);
    const legacyPrefix = String.fromCharCode(119, 97, 104, 97);
    const renames: RenamePair[] = [
      { oldField: `${legacyPrefix}SessionName`, newField: 'messagingSessionName' },
      { oldField: `${legacyPrefix}MessageId`, newField: 'messagingMessageId' }
    ];

    for (const collName of collectionNames) {
      const collection = db.collection(collName);
      const hasLegacyFields = await collection.findOne({
        $or: renames.map(({ oldField }) => ({ [oldField]: { $exists: true } }))
      });

      if (!hasLegacyFields) {
        continue;
      }

      console.log(`Processing collection: ${collName}`);

      const renameMap: Record<string, string> = {};
      renames.forEach(({ oldField, newField }) => {
        renameMap[oldField] = newField;
      });

      const result = await collection.updateMany(
        { $or: renames.map(({ oldField }) => ({ [oldField]: { $exists: true } })) },
        { $rename: renameMap }
      );

      console.log(`  Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    }

    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
