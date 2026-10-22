import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Advertisement, type AdSlot, type AdTone } from "../models/advertisement.model";
import { User } from "../models/user.model";

// The ads the webapp shipped with, in the same places, as starting ads.
// Safe to run again: an ad with the same headline is skipped.
//   npm run seed:ads

const ADS: Array<{
  advertiser: string;
  headline: string;
  body: string;
  cta: string;
  priceGBP?: number;
  tone: AdTone;
  placements: AdSlot[];
}> = [
  {
    advertiser: "WHP Store",
    headline: "Gut Health Probiotic Complex",
    body: "Daily support formulated for women's wellbeing.",
    cta: "Shop now",
    priceGBP: 34.99,
    tone: "primary",
    placements: ["home"],
  },
  {
    advertiser: "WHP Store",
    headline: "Women's Multivitamin Formula",
    body: "Iron, folate and B vitamins in one daily tablet.",
    cta: "Learn more",
    priceGBP: 29.99,
    tone: "secondary",
    placements: ["learn-feed"],
  },
  {
    advertiser: "GyneClinics",
    headline: "Bladder Health Check",
    body: "A specialist-led assessment at our pelvic health centre.",
    cta: "Find out more",
    priceGBP: 150,
    tone: "gold",
    placements: ["doctors-feed"],
  },
  {
    advertiser: "WHP Store",
    headline: "Digestive Enzyme Support",
    body: "Gentle support for bloating across your cycle.",
    cta: "Shop now",
    priceGBP: 24.99,
    tone: "accent",
    placements: ["article-end"],
  },
];

const run = async () => {
  await connectDB();
  const admin = await User.findOne({ role: "superadmin" });
  if (!admin) {
    console.error("No superadmin yet. Run `npm run seed:superadmin` first.");
    process.exit(1);
  }

  let added = 0;
  for (const ad of ADS) {
    if (await Advertisement.exists({ headline: ad.headline })) {
      console.log(`  skip   ${ad.headline} (already there)`);
      continue;
    }
    // Placeholder link: change it in the dashboard to the advertiser's page.
    await Advertisement.create({ ...ad, linkUrl: "https://gyneclinics.com", priority: 10, active: true, createdBy: admin._id });
    console.log(`  added  ${ad.headline} → ${ad.placements.join(", ")}`);
    added += 1;
  }
  console.log(`Done: ${added} added, ${ADS.length - added} already there.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
