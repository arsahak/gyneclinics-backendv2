// Curated category tree for Shaajs's general marketplace catalog —
// common departments (Electronics, Motors, Grocery, Fashion, etc.) plus a
// Pet Supplies & Aquarium department. Every name must be globally unique
// (Category.name has a unique index), including across different branches of
// the tree.

export interface CategoryTreeNode {
  name: string;
  description?: string;
  children?: CategoryTreeNode[];
}

export const CATEGORY_TREE: CategoryTreeNode[] = [
  {
    name: "Electronics",
    description: "Gadgets, appliances, and electronic essentials",
    children: [
      {
        name: "Mobile Phones & Tablets",
        children: [
          { name: "Smartphones" },
          { name: "Feature Phones" },
          { name: "Tablets" },
          { name: "Mobile Phone Accessories" },
        ],
      },
      {
        name: "Television & Home Theater",
        children: [
          { name: "Smart TVs" },
          { name: "LED & LCD TVs" },
          { name: "Home Theater Systems" },
        ],
      },
      { name: "Refrigerators & Freezers" },
      { name: "Air Conditioners & Coolers" },
      { name: "Washing Machines & Dryers" },
      {
        name: "Kitchen Appliances",
        children: [
          { name: "Microwave Ovens" },
          { name: "Blenders & Mixers" },
          { name: "Rice Cookers" },
          { name: "Toasters & Grills" },
        ],
      },
      {
        name: "Computers & Laptops",
        children: [
          { name: "Laptops" },
          { name: "Desktop Computers" },
          { name: "Computer Accessories" },
          { name: "Printers & Scanners" },
        ],
      },
      { name: "Cameras & Photography" },
      {
        name: "Audio & Headphones",
        children: [
          { name: "Headphones & Earbuds" },
          { name: "Bluetooth Speakers" },
        ],
      },
      { name: "Wearable Technology" },
    ],
  },
  {
    name: "Motors",
    description: "Cars, motorcycles, and vehicle parts & accessories",
    children: [
      {
        name: "Cars",
        children: [{ name: "New Cars" }, { name: "Used Cars" }],
      },
      { name: "Motorcycles & Scooters" },
      { name: "Bicycles" },
      {
        name: "Vehicle Parts & Accessories",
        children: [
          { name: "Tyres & Wheels" },
          { name: "Car Electronics" },
          { name: "Engine & Engine Parts" },
          { name: "Car Care & Detailing" },
        ],
      },
      { name: "Commercial Vehicles" },
      { name: "Boats & Watercraft" },
    ],
  },
  {
    name: "Grocery & Food",
    description: "Everyday groceries, fresh food, and pantry staples",
    children: [
      { name: "Fresh Fruits & Vegetables" },
      { name: "Rice, Flour & Grains" },
      { name: "Cooking Oil & Ghee" },
      { name: "Spices & Seasonings" },
      { name: "Dairy & Eggs" },
      { name: "Meat & Seafood" },
      { name: "Snacks & Confectionery" },
      {
        name: "Beverages",
        children: [
          { name: "Tea & Coffee" },
          { name: "Juices & Soft Drinks" },
          { name: "Bottled Water" },
        ],
      },
      { name: "Bakery & Bread" },
      { name: "Frozen Food" },
      { name: "Household & Cleaning Supplies" },
      { name: "Baby Food" },
    ],
  },
  {
    name: "Fashion & Clothing",
    description: "Clothing, footwear, and accessories for everyone",
    children: [
      {
        name: "Men's Fashion",
        children: [
          { name: "Men's Shirts" },
          { name: "Men's T-Shirts & Polos" },
          { name: "Men's Pants & Trousers" },
          { name: "Panjabi & Fatua" },
          { name: "Men's Footwear" },
        ],
      },
      {
        name: "Women's Fashion",
        children: [
          { name: "Sarees" },
          { name: "Salwar Kameez" },
          { name: "Women's Dresses & Tops" },
          { name: "Women's Footwear" },
        ],
      },
      {
        name: "Kids' Fashion",
        children: [
          { name: "Boys' Clothing" },
          { name: "Girls' Clothing" },
          { name: "Kids' Footwear" },
        ],
      },
      { name: "Bags, Wallets & Luggage" },
      { name: "Watches & Jewelry" },
      { name: "Sunglasses & Eyewear" },
    ],
  },
  {
    name: "Home & Living",
    description: "Furniture, decor, and everyday home essentials",
    children: [
      {
        name: "Furniture",
        children: [
          { name: "Living Room Furniture" },
          { name: "Bedroom Furniture" },
          { name: "Office Furniture" },
        ],
      },
      { name: "Home Decor" },
      { name: "Bedding & Bath" },
      { name: "Kitchenware & Dining" },
      { name: "Lighting & Ceiling Fans" },
    ],
  },
  {
    name: "Health & Beauty",
    description: "Skincare, cosmetics, and personal health essentials",
    children: [
      { name: "Skincare" },
      { name: "Makeup & Cosmetics" },
      { name: "Haircare" },
      { name: "Personal Care" },
      { name: "Health Supplements & Vitamins" },
    ],
  },
  {
    name: "Pet Supplies & Aquarium",
    description: "Aquarium, fish, and pet care essentials",
    children: [
      { name: "Aquarium & Fish Tanks" },
      { name: "Aquarium Filters & Pumps" },
      { name: "Fish Food" },
      { name: "Aquatic Plants & Decor" },
      { name: "Water Conditioners & Treatments" },
      { name: "Pet Food" },
      { name: "Pet Accessories" },
      { name: "Pet Grooming" },
    ],
  },
  {
    name: "Sports & Outdoors",
    description: "Fitness, camping, and outdoor recreation gear",
    children: [
      { name: "Exercise & Fitness Equipment" },
      { name: "Outdoor & Camping Gear" },
      { name: "Team Sports Equipment" },
      { name: "Cycling Gear" },
    ],
  },
  {
    name: "Books, Stationery & Hobbies",
    children: [
      { name: "Books" },
      { name: "School & Office Stationery" },
      { name: "Arts & Crafts Supplies" },
      { name: "Musical Instruments" },
    ],
  },
  {
    name: "Toys, Kids & Baby",
    children: [
      { name: "Toys & Games" },
      { name: "Baby Gear" },
      { name: "Diapering & Potty Training" },
    ],
  },
  {
    name: "Industrial & Business",
    description: "Equipment, tools, and supplies for businesses",
    children: [
      { name: "Office Equipment" },
      { name: "Industrial Tools & Machinery" },
      { name: "Safety & Security Equipment" },
    ],
  },
];
