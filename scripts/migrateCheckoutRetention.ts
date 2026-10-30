import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Checkout } from "../models/checkout.model";

// Checkouts now stay 30 days instead of 3, so support can trace a payment that
// didn't become a booking. MongoDB keeps an existing expiry setting even when
// the model changes, so this updates it in the database. Safe to run again.
//   npm run migrate:checkout-retention

const DAYS = 30;

const run = async () => {
  await connectDB();
  const collection = Checkout.collection;
  const seconds = DAYS * 24 * 3600;
  const ttl = (await collection.indexes()).find((i) => i.key?.createdAt === 1 && i.expireAfterSeconds !== undefined);

  if (!ttl) {
    // No expiry yet: create the model's indexes (30 days, and the slot lookup).
    await Checkout.syncIndexes();
    console.log(`Done: created the checkout indexes (kept ${DAYS} days).`);
  } else if (ttl.expireAfterSeconds === seconds) {
    console.log(`Nothing to do: checkouts are already kept ${DAYS} days.`);
  } else {
    await mongoose.connection.db!.command({ collMod: collection.collectionName, index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: seconds } });
    console.log(`Done: checkouts were kept ${Math.round((ttl.expireAfterSeconds ?? 0) / 86400)} days, now ${DAYS}.`);
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
