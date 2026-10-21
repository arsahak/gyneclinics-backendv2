import type { CategoryTreeNode } from "./categoryTree";

// The category tree for seedCosmaticsCatogory.ts: each parent with its
// children underneath, and children of children as deep as needed
// (Clothing > Sleepwear & Innerwear > Lingerie > Bras).
//
// It follows the storefront's own menu (shaajs-website/app/data/categories.ts)
// — same departments, same groups, and every category name gives the exact
// slug the menu links to, so a menu link opens that category's products.
// On top of that come the categories the menu doesn't list yet (Men, Home
// Care, hair and skin concerns, lingerie types, men's clothing and footwear,
// everyday gadgets and more).
//
// New categories go at the end of their group: the seed never moves a
// category that already exists, and appending keeps the new ones' sort
// order after the ones already in the database.
//
// The departments are in the storefront's order, the same as its navbar
// menu (shaajs-website/app/data/categories.ts), which lists this same tree —
// a category added here needs adding to the menu too.
//
// Every name appears once in the whole tree — Category.name is unique in the
// database, and a category can only sit under one parent. Where the same
// thing belongs to two departments it carries the department in its name
// ("Shampoo" under Hair Care, "Men's Shampoo" under Men). The seed refuses to
// run if a name is repeated.
export const COSMETICS_CATEGORY_TREE: CategoryTreeNode[] = [
  {
    name: "Makeup",
    description: "Face, eye, lip and nail makeup",
    children: [
      {
        name: "Face Makeup",
        children: [
          { name: "Foundation" },
          { name: "BB & CC Cream" },
          { name: "Concealer" },
          { name: "Primer" },
          { name: "Face Powder" },
          { name: "Blush" },
          { name: "Highlighter" },
          { name: "Bronzer & Contour" },
          { name: "Setting Spray" },
          { name: "Tinted Moisturizer" },
        ],
      },
      {
        name: "Eye Makeup",
        children: [
          { name: "Kajal" },
          { name: "Eyeliner" },
          { name: "Mascara" },
          { name: "Eyeshadow" },
          { name: "Eyeshadow Palettes" },
          { name: "Eyebrow" },
          { name: "False Eyelashes" },
          { name: "Eye Primer" },
          { name: "Under Eye Concealer" },
          { name: "Eye Makeup Remover" },
        ],
      },
      {
        name: "Lip Makeup",
        children: [
          { name: "Lipstick" },
          { name: "Liquid Lipstick" },
          { name: "Lip Gloss" },
          { name: "Lip Tint" },
          { name: "Lip Liner" },
          { name: "Lip Crayon" },
          { name: "Lip Balm" },
          { name: "Lip Plumper" },
        ],
      },
      {
        name: "Nails",
        children: [
          { name: "Nail Polish" },
          { name: "Gel Nail Polish" },
          { name: "Nail Art" },
          { name: "Artificial Nails" },
          { name: "Nail Care" },
          { name: "Nail Polish Remover" },
          { name: "Nail Polish Sets" },
          { name: "Manicure & Pedicure Kits" },
        ],
      },
      {
        name: "Makeup Sets & Palettes",
        children: [
          { name: "Makeup Kits" },
          { name: "Face Palettes" },
          { name: "Bridal Makeup" },
          { name: "Makeup Gift Sets" },
          { name: "Travel Size Makeup" },
        ],
      },
    ],
  },
  {
    name: "Skincare",
    description: "Cleansers, serums, moisturizers, masks and sun care",
    children: [
      {
        name: "Cleansers",
        children: [
          { name: "Face Wash" },
          { name: "Cleanser" },
          { name: "Cleansing Oil & Balm" },
          { name: "Micellar Water" },
          { name: "Makeup Remover" },
          { name: "Scrub & Exfoliator" },
          { name: "Facial Wipes" },
        ],
      },
      {
        name: "Serums & Treatments",
        children: [
          { name: "Face Serum" },
          { name: "Vitamin C" },
          { name: "Niacinamide" },
          { name: "Hyaluronic Acid" },
          { name: "Retinol" },
          { name: "Spot Treatment" },
          { name: "Face Oil" },
          { name: "Ampoule" },
        ],
      },
      {
        name: "Moisturizers & Creams",
        children: [
          { name: "Moisturizer" },
          { name: "Day Cream" },
          { name: "Night Cream" },
          { name: "Gel Cream" },
          { name: "Face Lotion" },
        ],
      },
      {
        name: "Skin Concerns",
        children: [
          { name: "Acne & Blemishes" },
          { name: "Brightening" },
          { name: "Dark Spots" },
          { name: "Dry Skin" },
          { name: "Oily Skin" },
          { name: "Sensitive Skin" },
          { name: "Anti-Aging" },
          { name: "Pores" },
          { name: "Dark Circles" },
          { name: "Dull Skin" },
          { name: "Tan Removal" },
          { name: "Winter Care" },
        ],
      },
      {
        name: "Toners & Mists",
        children: [
          { name: "Toner" },
          { name: "Essence" },
          { name: "Face Mist" },
        ],
      },
      {
        name: "Face Masks",
        children: [
          { name: "Sheet Mask" },
          { name: "Clay Mask" },
          { name: "Peel-Off Mask" },
          { name: "Sleeping Mask" },
          { name: "Facial Kits" },
        ],
      },
      {
        name: "Sun Care",
        children: [
          { name: "Sunscreen" },
          { name: "Tinted Sunscreen" },
          { name: "After-Sun Care" },
        ],
      },
      {
        name: "Eye & Lip Care",
        children: [
          { name: "Eye Cream" },
          { name: "Eye Serum" },
          { name: "Under-Eye Patches" },
          { name: "Lip Scrub" },
          { name: "Lip Mask" },
          { name: "Eye Gel" },
          { name: "Eye Roller" },
        ],
      },
      { name: "K-Beauty" },
    ],
  },
  {
    name: "Hair Care",
    description: "Washing, treating, colouring and styling hair",
    children: [
      {
        name: "Hair Wash & Care",
        children: [
          { name: "Shampoo" },
          { name: "Conditioner" },
          { name: "Hair Mask" },
        ],
      },
      {
        name: "Hair Treatment",
        children: [
          { name: "Hair Oil" },
          { name: "Hair Serum" },
          { name: "Hair Fall Care" },
        ],
      },
      {
        name: "Hair Styling",
        children: [
          { name: "Hair Color" },
          { name: "Styling Gel & Spray" },
          { name: "Heat Protectant" },
          { name: "Hair Wax" },
          { name: "Hair Primer" },
        ],
      },
      {
        name: "Hair Concerns",
        children: [
          { name: "Dandruff" },
          { name: "Dry & Frizzy Hair" },
          { name: "Split Ends" },
          { name: "Color Protection" },
          { name: "Scalp Treatment" },
        ],
      },
      {
        name: "Shop by Hair Type",
        children: [
          { name: "Curly & Wavy Hair" },
          { name: "Straight Hair" },
        ],
      },
    ],
  },
  {
    name: "Fragrance",
    description: "Perfumes, mists, sprays and attar",
    children: [
      {
        name: "Fragrance for Her",
        children: [
          { name: "Women's Perfume" },
          { name: "Body Mist" },
        ],
      },
      {
        name: "Fragrance for Him",
        children: [
          { name: "Men's Perfume" },
          { name: "Body Spray" },
        ],
      },
      {
        name: "More Fragrances",
        children: [
          { name: "Attar" },
          { name: "Fragrance Gift Sets" },
          { name: "Unisex Perfume" },
          { name: "Cologne" },
          { name: "Eau de Parfum (EDP)" },
          { name: "Eau de Toilette (EDT)" },
          { name: "High-End Perfume" },
        ],
      },
    ],
  },
  {
    name: "Bath & Body",
    description: "Shower, bath, body care and everyday hygiene",
    children: [
      {
        name: "Bath & Shower",
        children: [
          { name: "Body Wash" },
          { name: "Soap" },
          { name: "Body Scrub" },
          { name: "Talcum Powder" },
          { name: "Loofahs & Sponges" },
          { name: "Hand Wash" },
          { name: "Hand Sanitizer" },
        ],
      },
      {
        name: "Body Care",
        children: [
          { name: "Body Lotion" },
          { name: "Body Butter" },
          { name: "Hand Cream" },
          { name: "Foot Care" },
          { name: "Mehedi & Henna" },
        ],
      },
      {
        name: "Personal Care",
        children: [
          { name: "Deodorant" },
          { name: "Hair Removal" },
        ],
      },
    ],
  },
  {
    name: "Men",
    description: "Grooming and care for men",
    children: [
      {
        name: "Men's Skin Care",
        children: [
          { name: "Men's Face Wash" },
          { name: "Men's Moisturizer" },
          { name: "Men's Sunscreen" },
          { name: "Men's Face Scrub" },
        ],
      },
      {
        name: "Men's Hair Care",
        children: [
          { name: "Men's Shampoo" },
          { name: "Men's Hair Oil" },
          { name: "Men's Hair Color" },
          { name: "Men's Hair Styling" },
        ],
      },
      {
        name: "Men's Bath & Body",
        children: [
          { name: "Men's Body Wash & Shower Gel" },
          { name: "Men's Soap" },
          { name: "Men's Body Lotion" },
        ],
      },
      {
        name: "Shaving",
        children: [
          { name: "Razors" },
          { name: "Shaving Cream, Foam & Gel" },
          { name: "Shaving Brushes" },
          { name: "Aftershave Lotion & Balm" },
          { name: "Beard & Moustache Care" },
        ],
      },
    ],
  },
  {
    name: "Tools & Accessories",
    description: "Brushes, sponges and beauty accessories",
    children: [
      {
        name: "Brushes & Sponges",
        children: [
          {
            name: "Makeup Brushes",
            children: [
              { name: "Face Brushes" },
              { name: "Eye Brushes" },
              { name: "Blush Brushes" },
              { name: "Lip Brushes" },
            ],
          },
          { name: "Brush Sets" },
          { name: "Beauty Sponges" },
        ],
      },
      {
        name: "Beauty Accessories",
        children: [
          { name: "Makeup Bags" },
          { name: "Mirrors" },
          { name: "Eyelash Curlers" },
          { name: "Tweezers" },
          { name: "Sharpeners" },
          { name: "Hair Combs & Brushes" },
        ],
      },
    ],
  },
  {
    name: "Clothing",
    description: "Traditional, western and modest wear",
    children: [
      {
        name: "Traditional Wear",
        children: [
          { name: "Sarees" },
          { name: "Salwar Kameez" },
          { name: "Three-Piece" },
          { name: "Kurtis & Tunics" },
          { name: "Lehengas" },
          { name: "Orna & Dupatta" },
          { name: "Blouses" },
        ],
      },
      {
        name: "Western Wear",
        children: [
          { name: "Tops & T-Shirts" },
          { name: "Shirts" },
          { name: "Dresses" },
          { name: "Jeans & Pants" },
          { name: "Skirts" },
          { name: "Palazzos & Leggings" },
          { name: "Crop Tops" },
          { name: "Co-ord Sets" },
          { name: "Jumpsuits & Rompers" },
          { name: "Kaftans" },
          { name: "Party Gowns" },
          { name: "Women's Shorts" },
          { name: "Shrugs & Cardigans" },
          { name: "Women's Blazers" },
        ],
      },
      {
        name: "Modest Wear",
        children: [
          { name: "Borka & Abaya" },
          { name: "Hijab" },
          { name: "Scarves" },
        ],
      },
      {
        name: "Sleepwear & Innerwear",
        children: [
          { name: "Nightwear" },
          {
            name: "Lingerie",
            children: [
              { name: "Bras" },
              { name: "Panties" },
              { name: "Lingerie Sets" },
              { name: "Shapewear" },
              { name: "Sports Bras" },
              { name: "Maternity Lingerie" },
              { name: "Teen Lingerie" },
              { name: "Plus Size Lingerie" },
            ],
          },
          { name: "Loungewear" },
        ],
      },
      {
        name: "Winter Wear",
        children: [
          { name: "Sweaters" },
          { name: "Hoodies" },
          { name: "Jackets" },
          { name: "Shawls" },
        ],
      },
      {
        name: "Men's Topwear",
        children: [
          { name: "Men's T-Shirts" },
          { name: "Men's Polo Shirts" },
          { name: "Men's Casual Shirts" },
          { name: "Men's Formal Shirts" },
        ],
      },
      {
        name: "Men's Bottomwear",
        children: [
          { name: "Men's Jeans" },
          { name: "Men's Chinos & Gabardine" },
          { name: "Men's Formal Pants" },
          { name: "Men's Joggers" },
          { name: "Men's Shorts & Three-Quarters" },
        ],
      },
      {
        name: "Men's Ethnic Wear",
        children: [
          { name: "Panjabi" },
          { name: "Fatua" },
          { name: "Men's Pajamas" },
        ],
      },
      {
        name: "Men's Outerwear",
        children: [
          { name: "Men's Jackets" },
          { name: "Men's Blazers" },
          { name: "Men's Hoodies & Sweatshirts" },
          { name: "Men's Sweaters" },
        ],
      },
      {
        name: "Men's Innerwear",
        children: [
          { name: "Men's Vests" },
          { name: "Men's Briefs & Boxers" },
        ],
      },
      {
        name: "Activewear",
        children: [
          { name: "Sports Tops & T-Shirts" },
          { name: "Track Pants" },
          { name: "Tracksuits" },
          { name: "Jerseys" },
          { name: "Yoga Pants & Tights" },
        ],
      },
      {
        name: "Fashion Accessories",
        children: [
          { name: "Caps" },
          { name: "Hats" },
          { name: "Belts" },
          { name: "Socks" },
          { name: "Ties" },
        ],
      },
    ],
  },
  {
    name: "Footwear",
    description: "Casual, party and traditional footwear",
    children: [
      {
        name: "Casual Footwear",
        children: [
          { name: "Sandals" },
          { name: "Flats" },
          { name: "Slippers" },
          { name: "Sneakers" },
          { name: "Mules" },
          { name: "Flip Flops" },
        ],
      },
      {
        name: "Party & Formal Footwear",
        children: [
          { name: "Heels" },
          { name: "Wedges" },
          { name: "Pumps" },
          { name: "Block Heels" },
          { name: "Stilettos" },
        ],
      },
      {
        name: "Traditional Footwear",
        children: [
          { name: "Nagra" },
          { name: "Khussa" },
        ],
      },
      {
        name: "Men's Footwear",
        children: [
          { name: "Men's Formal Shoes" },
          { name: "Men's Loafers" },
          { name: "Men's Casual Shoes" },
          { name: "Men's Sneakers" },
          { name: "Men's Sports Shoes" },
          { name: "Men's Boots" },
          { name: "Men's Sandals" },
          { name: "Men's Slippers & Flip Flops" },
        ],
      },
    ],
  },
  {
    name: "Bags",
    description: "Handbags and everyday bags",
    children: [
      {
        name: "Handbags",
        children: [
          { name: "Shoulder Bags" },
          { name: "Tote Bags" },
          { name: "Crossbody Bags" },
          { name: "Clutches" },
        ],
      },
      {
        name: "Everyday Bags",
        children: [
          { name: "Backpacks" },
          { name: "Wallets & Purses" },
          { name: "Pouches" },
          { name: "Travel Bags" },
        ],
      },
    ],
  },
  {
    name: "Jewelry",
    description: "Earrings, necklaces, bangles and hair accessories",
    children: [
      {
        name: "Earrings & Rings",
        children: [
          { name: "Earrings" },
          { name: "Rings" },
          { name: "Nose Pins" },
        ],
      },
      {
        name: "Necklaces & Sets",
        children: [
          { name: "Necklaces" },
          { name: "Pendants" },
          { name: "Jewelry Sets" },
          { name: "Bridal Jewelry" },
        ],
      },
      {
        name: "Bangles, Bracelets & Anklets",
        children: [
          { name: "Bangles" },
          { name: "Bracelets" },
          { name: "Anklets" },
        ],
      },
      {
        name: "Hair Accessories",
        children: [
          { name: "Hair Clips" },
          { name: "Hair Bands" },
          { name: "Scrunchies" },
        ],
      },
    ],
  },
  {
    name: "Watches",
    description: "Men's, women's and couple watches",
    children: [
      {
        name: "Men's Watches",
        children: [
          { name: "Men's Analog Watches" },
          { name: "Men's Digital Watches" },
          { name: "Men's Chronograph Watches" },
          { name: "Men's Leather Strap Watches" },
          { name: "Men's Metal Strap Watches" },
        ],
      },
      {
        name: "Women's Watches",
        children: [
          { name: "Women's Analog Watches" },
          { name: "Women's Digital Watches" },
          { name: "Bracelet Watches" },
          { name: "Women's Leather Strap Watches" },
          { name: "Women's Metal Strap Watches" },
        ],
      },
      {
        name: "More Watches",
        children: [
          { name: "Couple Watches" },
          { name: "Kids' Watches" },
          { name: "Sports Watches" },
          { name: "Luxury Watches" },
          { name: "Watch Gift Sets" },
        ],
      },
      {
        name: "Watch Accessories",
        children: [
          { name: "Watch Straps" },
          { name: "Watch Boxes & Cases" },
        ],
      },
    ],
  },
  {
    name: "Eyewear",
    description: "Sunglasses, eyeglasses and contact lenses",
    children: [
      {
        name: "Sunglasses",
        children: [
          { name: "Men's Sunglasses" },
          { name: "Women's Sunglasses" },
          { name: "Unisex Sunglasses" },
          { name: "Kids' Sunglasses" },
        ],
      },
      {
        name: "Sunglasses by Style",
        children: [
          { name: "Aviator Sunglasses" },
          { name: "Wayfarer Sunglasses" },
          { name: "Round Sunglasses" },
          { name: "Cat-Eye Sunglasses" },
          { name: "Square Sunglasses" },
          { name: "Oversized Sunglasses" },
          { name: "Polarized Sunglasses" },
          { name: "Sports Sunglasses" },
        ],
      },
      {
        name: "Eyeglasses",
        children: [
          { name: "Eyeglass Frames" },
          { name: "Blue Light Glasses" },
          { name: "Reading Glasses" },
        ],
      },
      {
        name: "Contact Lenses",
        children: [
          { name: "Color Contact Lenses" },
          { name: "Clear Contact Lenses" },
          { name: "Lens Solution" },
        ],
      },
      {
        name: "Eyewear Accessories",
        children: [
          { name: "Glasses Cases" },
          { name: "Lens Cleaners" },
          { name: "Glasses Chains & Straps" },
        ],
      },
    ],
  },
  {
    name: "Gadgets",
    description: "Beauty devices and lifestyle gadgets",
    children: [
      {
        name: "Hair Styling Tools",
        children: [
          { name: "Hair Dryers" },
          { name: "Hair Straighteners" },
          { name: "Hair Curlers" },
          { name: "Hot Air Brushes" },
          { name: "Hair Crimpers" },
        ],
      },
      {
        name: "Face & Skin Devices",
        children: [
          { name: "Facial Cleansing Brushes" },
          { name: "Face Massagers & Rollers" },
          { name: "Facial Steamers" },
          { name: "LED Face Masks" },
          { name: "Blackhead Removers" },
        ],
      },
      {
        name: "Hair Removal & Grooming",
        children: [
          { name: "Epilators" },
          { name: "Trimmers & Shavers" },
          { name: "IPL Devices" },
          { name: "Eyebrow Trimmers" },
        ],
      },
      {
        name: "Nail & Makeup Gadgets",
        children: [
          { name: "UV Nail Lamps" },
          { name: "Nail Drills" },
          { name: "LED Makeup Mirrors" },
          { name: "Makeup Brush Cleaners" },
        ],
      },
      {
        name: "Lifestyle Gadgets",
        children: [
          { name: "Smart Watches" },
          { name: "Earbuds & Headphones" },
          { name: "Power Banks" },
          { name: "Phone Accessories" },
          { name: "Fitness Bands" },
        ],
      },
      {
        name: "Mobile Accessories",
        children: [
          { name: "Chargers & Adapters" },
          { name: "Data Cables" },
          { name: "Phone Cases & Covers" },
          { name: "Screen Protectors" },
          { name: "Phone Holders & Stands" },
        ],
      },
      {
        name: "Audio",
        children: [
          { name: "Bluetooth Speakers" },
          { name: "Neckband Earphones" },
          { name: "Wired Earphones" },
        ],
      },
      {
        name: "Photography & Content",
        children: [
          { name: "Ring Lights" },
          { name: "Tripods & Selfie Sticks" },
          { name: "Wireless Microphones" },
          { name: "Action Cameras" },
        ],
      },
      {
        name: "Computer Accessories",
        children: [
          { name: "Keyboards & Mouse" },
          { name: "Pendrives & Memory Cards" },
          { name: "USB Hubs" },
          { name: "Laptop Stands" },
        ],
      },
      {
        name: "Home & Personal Gadgets",
        children: [
          { name: "Rechargeable Fans" },
          { name: "Desk Lamps" },
          { name: "Weighing Scales" },
          { name: "Massagers" },
        ],
      },
    ],
  },
  {
    name: "Mom & Baby",
    description: "Gentle care for mothers and babies",
    children: [
      {
        name: "Baby Care",
        children: [
          { name: "Baby Lotion" },
          { name: "Baby Oil" },
          { name: "Baby Shampoo & Wash" },
          { name: "Baby Powder" },
          { name: "Diaper Rash Cream" },
          { name: "Baby Soap" },
          { name: "Baby Cream" },
          { name: "Baby Wipes" },
          { name: "Baby Sunscreen" },
        ],
      },
      {
        name: "Mom Care",
        children: [
          { name: "Stretch Mark Care" },
          { name: "Maternity Wear" },
          { name: "Nursing Essentials" },
        ],
      },
    ],
  },
  {
    name: "Health & Wellness",
    description: "Feminine care, supplements, oral care and wellbeing",
    children: [
      {
        name: "Feminine Care",
        children: [
          { name: "Sanitary Pads" },
          { name: "Intimate Wash" },
          { name: "Menstrual Cups" },
        ],
      },
      {
        name: "Supplements",
        children: [
          { name: "Vitamins" },
          { name: "Hair & Skin Supplements" },
          { name: "Collagen" },
        ],
      },
      {
        name: "Oral Care",
        children: [
          { name: "Toothpaste" },
          { name: "Mouthwash" },
          { name: "Teeth Whitening" },
          { name: "Toothbrush" },
          { name: "Dental Floss" },
        ],
      },
      {
        name: "Wellness",
        children: [
          { name: "Sexual Wellness" },
          { name: "Weight Management" },
          { name: "Health & Fitness" },
        ],
      },
    ],
  },
  {
    name: "Home Care",
    description: "Keeping the home fresh and clean",
    children: [
      { name: "Air Fresheners" },
      { name: "Bathroom Essentials" },
      { name: "Germ Control" },
    ],
  },
  {
    name: "Natural",
    description: "Natural and herbal beauty products",
  },
  {
    name: "Gift Sets",
    description: "Gifts by occasion and by type",
    children: [
      {
        name: "Gifts by Occasion",
        children: [
          { name: "Birthday Gifts" },
          { name: "Wedding Gifts" },
          { name: "Eid Gifts" },
          { name: "Anniversary Gifts" },
        ],
      },
      {
        name: "Gifts by Type",
        children: [
          { name: "Beauty Hampers" },
          { name: "Skincare Sets" },
          { name: "Combo Packs" },
        ],
      },
    ],
  },
];
