import { db } from "./connection";
import { currencies, categories, users } from "./schema";
import { config } from "../config/env";

// Hash password using Bun's built-in password hashing
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

async function seedDatabase() {
  console.log("🌱 Seeding database...");

  try {
    // 1. Seed currencies
    console.log("📊 Seeding currencies...");
    await db
      .insert(currencies)
      .values([
        { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: "2" },
        { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: "2" },
        { code: "GBP", name: "British Pound", symbol: "£", decimalPlaces: "2" },
        { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalPlaces: "0" },
        {
          code: "CAD",
          name: "Canadian Dollar",
          symbol: "C$",
          decimalPlaces: "2",
        },
        {
          code: "AUD",
          name: "Australian Dollar",
          symbol: "A$",
          decimalPlaces: "2",
        },
        { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimalPlaces: "2" },
        { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimalPlaces: "2" },
        { code: "INR", name: "Indian Rupee", symbol: "₹", decimalPlaces: "2" },
        {
          code: "BDT",
          name: "Bangladeshi Taka",
          symbol: "৳",
          decimalPlaces: "2",
        },
      ])
      .onConflictDoNothing();

    // 2. Create default user
    console.log("👤 Creating default user...");
    const passwordHash = await hashPassword(config.auth.password);
    const [user] = await db
      .insert(users)
      .values({
        username: config.auth.username,
        passwordHash,
        displayName: "Admin User",
      })
      .returning();

    // 3. Seed default expense categories
    console.log("📁 Seeding default categories...");
    const expenseCategories = [
      { name: "Groceries", icon: "🛒", color: "#10b981" },
      { name: "Rent", icon: "🏠", color: "#3b82f6" },
      { name: "Utilities", icon: "💡", color: "#f59e0b" },
      { name: "Transportation", icon: "🚗", color: "#6366f1" },
      { name: "Entertainment", icon: "🎬", color: "#ec4899" },
      { name: "Healthcare", icon: "🏥", color: "#ef4444" },
      { name: "Dining Out", icon: "🍽️", color: "#f97316" },
      { name: "Shopping", icon: "🛍️", color: "#8b5cf6" },
      { name: "Education", icon: "📚", color: "#0ea5e9" },
      { name: "Insurance", icon: "🛡️", color: "#64748b" },
      { name: "Subscriptions", icon: "📱", color: "#14b8a6" },
      { name: "Personal Care", icon: "💇", color: "#a855f7" },
      { name: "Gifts", icon: "🎁", color: "#f43f5e" },
      { name: "Travel", icon: "✈️", color: "#06b6d4" },
      { name: "Other Expenses", icon: "📦", color: "#78716c" },
    ];

    for (const category of expenseCategories) {
      await db
        .insert(categories)
        .values({
          userId: user.id,
          name: category.name,
          type: "expense",
          icon: category.icon,
          color: category.color,
          isSystem: "true",
        })
        .onConflictDoNothing();
    }

    // 4. Seed default income categories
    const incomeCategories = [
      { name: "Salary", icon: "💰", color: "#22c55e" },
      { name: "Freelance", icon: "💼", color: "#84cc16" },
      { name: "Investment", icon: "📈", color: "#10b981" },
      { name: "Business", icon: "🏢", color: "#14b8a6" },
      { name: "Bonus", icon: "🎉", color: "#06b6d4" },
      { name: "Gift", icon: "🎁", color: "#0ea5e9" },
      { name: "Other Income", icon: "💵", color: "#22d3ee" },
    ];

    for (const category of incomeCategories) {
      await db
        .insert(categories)
        .values({
          userId: user.id,
          name: category.name,
          type: "income",
          icon: category.icon,
          color: category.color,
          isSystem: "true",
        })
        .onConflictDoNothing();
    }

    console.log("✅ Database seeded successfully");
    console.log(`\n📝 Default User Credentials:`);
    console.log(`   Username: ${config.auth.username}`);
    console.log(`   Password: ${config.auth.password}`);
    console.log(`\n⚠️  Please change these credentials in production!\n`);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedDatabase();
