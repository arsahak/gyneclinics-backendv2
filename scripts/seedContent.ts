import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Content, type ContentCategory, type ContentFormat } from "../models/content.model";
import { User } from "../models/user.model";
import { cleanContentHtml } from "../utils/contentHtml";
import { learnArticles } from "./data/learnArticles";

// Adds the webapp's starting Learn articles as published content.
// Safe to run again: articles whose slug already exists are skipped.
//   npm run seed:content

const run = async () => {
  await connectDB();

  const author = await User.findOne({ role: "superadmin" });
  if (!author) {
    console.error("No superadmin yet. Run `npm run seed:superadmin` first.");
    process.exit(1);
  }

  let added = 0;
  for (const a of learnArticles) {
    if (await Content.exists({ slug: a.slug })) {
      console.log(`  skip   ${a.slug} (already there)`);
      continue;
    }
    await Content.create({
      slug: a.slug,
      title: a.title,
      body: cleanContentHtml(a.body),
      excerpt: a.excerpt,
      excerptEstimated: false,
      format: a.format as ContentFormat,
      category: a.category as ContentCategory,
      readTimeMinutes: a.readTimeMinutes,
      readTimeEstimated: false,
      visibility: "published",
      publishedAt: new Date(a.publishedAt),
      authorName: a.authorName,
      authorRole: a.authorRole,
      sponsored: Boolean(a.sponsorName),
      sponsorName: a.sponsorName ?? undefined,
      author: author._id,
    });
    console.log(`  added  ${a.slug}`);
    added += 1;
  }

  console.log(`Done: ${added} added, ${learnArticles.length - added} already there.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
