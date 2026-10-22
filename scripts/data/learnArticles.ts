// The Learn articles the webapp shipped with, as starting content.
// Loaded by scripts/seedContent.ts (only slugs that don't exist yet).

export interface SeedArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  format: string;
  readTimeMinutes: number;
  authorName: string;
  authorRole: string;
  publishedAt: string;
  sponsorName: string | null;
  body: string;
}

export const learnArticles: SeedArticle[] = [
  {
    "slug": "what-is-a-normal-cycle",
    "title": "What is a “normal” menstrual cycle?",
    "excerpt": "Cycles between 21 and 35 days are common, and small changes month to month are expected. Here is how to read your own pattern.",
    "category": "Periods",
    "format": "guide",
    "readTimeMinutes": 5,
    "authorName": "GyneClinics Editorial Team",
    "authorRole": "Reviewed by a consultant gynaecologist",
    "publishedAt": "2026-10-14",
    "sponsorName": null,
    "body": "<p>Every body has its own rhythm. A menstrual cycle is counted from the first day of one period to the day before the next one starts. For most adults this falls somewhere between 21 and 35 days.</p><h2>Why cycles change</h2><p>Stress, travel, illness, changes in weight, exercise and sleep can all shift the timing of a cycle by a few days. A difference of up to seven days between your shortest and longest cycle is generally considered regular.</p><h2>Tracking helps you notice patterns</h2><p>Logging your period start and end dates each month builds a personal picture over time. After three or more cycles, averages become more meaningful and you can spot changes earlier.</p><h2>When to speak to a specialist</h2><p>Consider talking to a gynaecologist if your cycles are regularly shorter than 21 days or longer than 35 days, if periods stop for three months or more, or if bleeding is very heavy or painful.</p>"
  },
  {
    "slug": "understanding-your-fertile-window",
    "title": "Understanding your fertile window",
    "excerpt": "Ovulation usually happens about 14 days before your next period. Learn how the fertile window is estimated — and its limits.",
    "category": "Fertility",
    "format": "guide",
    "readTimeMinutes": 6,
    "authorName": "GyneClinics Editorial Team",
    "authorRole": "Reviewed by a fertility specialist",
    "publishedAt": "2026-10-10",
    "sponsorName": null,
    "body": "<p>The fertile window is the few days each cycle when pregnancy is most likely. It includes the five days before ovulation and the day of ovulation itself.</p><h2>How apps estimate it</h2><p>Calendar-based estimates count back about 14 days from your expected next period. This works best when your cycles are regular and you have logged several of them.</p><h2>Important limits</h2><p>Calendar estimates are informational only. They are not a reliable method of contraception, and ovulation can vary from cycle to cycle. Speak to a specialist for personalised advice.</p>"
  },
  {
    "slug": "first-trimester-what-to-expect",
    "title": "First trimester: what to expect week by week",
    "excerpt": "From early symptoms to your first scan, a gentle guide to the first 12 weeks of pregnancy.",
    "category": "Pregnancy",
    "format": "blog",
    "readTimeMinutes": 8,
    "authorName": "Dr. Grace Okafor",
    "authorRole": "Obstetrician & Gynaecologist",
    "publishedAt": "2026-10-06",
    "sponsorName": null,
    "body": "<p>The first trimester is a time of rapid change. Tiredness, nausea and tender breasts are common, and every pregnancy feels a little different.</p><h2>Your first scan</h2><p>Most women are offered a dating scan between 10 and 14 weeks. It checks how many babies there are and estimates your due date from the baby's measurements.</p><h2>Looking after yourself</h2><p>Folic acid, rest, gentle movement and regular meals help. Keep a note of questions to ask at your appointments.</p>"
  },
  {
    "slug": "perimenopause-signs",
    "title": "Perimenopause: 9 signs that are easy to miss",
    "excerpt": "Changes in sleep, mood and cycle length can start years before periods stop. Here is what to look out for.",
    "category": "Menopause",
    "format": "blog",
    "readTimeMinutes": 7,
    "authorName": "Dr. Priya Menon",
    "authorRole": "Menopause Specialist",
    "publishedAt": "2026-09-30",
    "sponsorName": null,
    "body": "<p>Perimenopause is the transition before menopause. It often starts in the 40s, but can begin earlier, and symptoms can come and go.</p><h2>Common signs</h2><p>Shorter or longer cycles, heavier periods, night sweats, broken sleep, low mood, brain fog, joint aches and changes in libido are all common.</p><h2>Tracking makes conversations easier</h2><p>Logging your cycles and symptoms gives you and your doctor a clearer picture of what is changing over time.</p>"
  },
  {
    "slug": "pelvic-floor-basics",
    "title": "Pelvic floor basics for every life stage",
    "excerpt": "A strong pelvic floor supports bladder health, comfort and confidence. Start with these simple exercises.",
    "category": "Pelvic Health",
    "format": "guide",
    "readTimeMinutes": 4,
    "authorName": "Dr. Sophie Clarke",
    "authorRole": "Urogynaecologist",
    "publishedAt": "2026-09-24",
    "sponsorName": null,
    "body": "<p>Your pelvic floor is a group of muscles that support the bladder, bowel and uterus. Like any muscle, it benefits from regular exercise.</p><h2>A simple routine</h2><p>Squeeze and lift for five seconds, then relax for five seconds. Repeat ten times, three times a day. Breathe normally throughout.</p>"
  },
  {
    "slug": "nutrition-for-hormonal-balance",
    "title": "Everyday nutrition for hormonal balance",
    "excerpt": "Iron, fibre, healthy fats and steady meals can make a real difference across your cycle.",
    "category": "Wellness",
    "format": "blog",
    "readTimeMinutes": 5,
    "authorName": "WHP Nutrition Team",
    "authorRole": "Sponsored partner content",
    "publishedAt": "2026-09-20",
    "sponsorName": "WHP Store",
    "body": "<p>Food will not fix every symptom, but a balanced plate supports energy and wellbeing throughout the month.</p><h2>Focus on iron</h2><p>Periods can lower iron levels. Leafy greens, beans, lentils and lean meat help, especially when paired with vitamin C.</p><h2>Steady energy</h2><p>Regular meals with fibre and protein can help keep energy stable, particularly in the days before your period.</p>"
  },
  {
    "slug": "period-pain-relief",
    "title": "Period pain: what helps and when to seek advice",
    "excerpt": "Heat, movement and pain relief help many people — but severe pain is not something you have to live with.",
    "category": "Periods",
    "format": "guide",
    "readTimeMinutes": 5,
    "authorName": "Dr. Laila Haddad",
    "authorRole": "Consultant Gynaecologist",
    "publishedAt": "2026-09-15",
    "sponsorName": null,
    "body": "<p>Mild cramps are common in the first days of a period. A warm compress, gentle exercise and over-the-counter pain relief often help.</p><h2>When to get advice</h2><p>If pain stops you from going to school or work, gets worse over time, or comes with very heavy bleeding, speak to a specialist. Conditions like endometriosis are common and treatable.</p>"
  },
  {
    "slug": "my-pcos-journey",
    "title": "My PCOS journey: learning to listen to my body",
    "excerpt": "“Tracking my cycles for six months gave me the confidence to ask the right questions.”",
    "category": "Stories",
    "format": "story",
    "readTimeMinutes": 4,
    "authorName": "Ayesha, 27",
    "authorRole": "Community story · Approved by GyneClinics",
    "publishedAt": "2026-10-12",
    "sponsorName": null,
    "body": "<p>For years I thought irregular periods were just how I was. When I started logging my dates I noticed my cycles ranged from 32 to 51 days.</p><p>Bringing that history to a specialist made the conversation so much easier. I was diagnosed with PCOS and finally had a plan that felt right for me.</p><p>If you are unsure whether something is normal, write it down. Your notes are valuable.</p>"
  },
  {
    "slug": "after-my-baby",
    "title": "After my baby: finding my strength again",
    "excerpt": "“Nobody told me pelvic floor recovery was a thing. I wish I had known sooner.”",
    "category": "Stories",
    "format": "story",
    "readTimeMinutes": 3,
    "authorName": "Anonymous",
    "authorRole": "Community story · Approved by GyneClinics",
    "publishedAt": "2026-10-01",
    "sponsorName": null,
    "body": "<p>Six months after my son was born, I still felt like my body was not mine. Talking to a urogynaecologist changed that.</p><p>Small daily exercises and honest advice helped me feel confident again. Please do not stay silent if something feels off.</p>"
  }
];
