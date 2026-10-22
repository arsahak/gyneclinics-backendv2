import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { uniqueSlug } from "../controllers/content.controller";
import { Content, CONTENT_CATEGORIES } from "../models/content.model";

// Brings content saved before the Learn update in line with the webapp:
// gives it a slug, renames format "text" to "guide" (Article), and moves a
// category outside the Learn list to "Wellness". Safe to run again.
//   npm run migrate:content

const run = async () => {
  await connectDB();
  const collection = Content.collection;
  let fixed = 0;

  for (const doc of await collection.find({}).toArray()) {
    const set: Record<string, unknown> = {};
    if (!doc.slug) set.slug = await uniqueSlug(String(doc.title ?? "article"));
    if (doc.format === "text" || !doc.format) set.format = "guide";
    if (!(CONTENT_CATEGORIES as readonly string[]).includes(doc.category)) set.category = "Wellness";
    if (doc.authorName === undefined) set.authorName = "GyneClinics Editorial Team";
    if (doc.authorRole === undefined) set.authorRole = "Reviewed by a consultant gynaecologist";
    if (doc.excerptEstimated === undefined) set.excerptEstimated = true;
    if (Object.keys(set).length === 0) continue;

    await collection.updateOne({ _id: doc._id }, { $set: set });
    console.log(`  fixed  "${doc.title}":`, Object.entries(set).map(([k, v]) => `${k} → ${v}`).join(", "));
    fixed += 1;
  }

  console.log(`Done: ${fixed} fixed.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
