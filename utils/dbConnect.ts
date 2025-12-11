import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI as string;
//process.env.MONGODB_URI as string;
if (!MONGODB_URI) {
  console.log("MONGODB_URI", MONGODB_URI)
  throw new Error('Please define the MONGODB_URI environment variable');
}

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: Cached | undefined;
}

// Initialize cached with a default value to avoid undefined
let cached: Cached = global.mongoose || { conn: null, promise: null };
if (!global.mongoose) {
  global.mongoose = cached;
}

async function dbConnect() {
  // Return cached connection if available
  if (cached.conn) {
    console.log('Using cached MongoDB connection.');
    return cached.conn;
  }

  // Create new connection promise if none exists
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      // You can add options here if needed, for example:
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log('Successfully connected to MongoDB.');
    return cached.conn;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}


export default dbConnect;
