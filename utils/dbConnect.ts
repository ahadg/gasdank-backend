import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb://localhost:27017/wholesaleapp?readPreference=primary&directConnection=true&ssl=false'
//process.env.MONGODB_URI as string;
if (!MONGODB_URI) {
  console.log("MONGODB_URI",MONGODB_URI)
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
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { 
        //useNewUrlParser: true, 
        //useUnifiedTopology: true 
    })
      .then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
