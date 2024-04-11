const { Redis } = require('@upstash/redis');
const falso = require('@ngneat/falso');
const dotenv = require('dotenv');
dotenv.config();

// Configuration
const USERS_COUNT = 100;
const BATCH_SIZE = 5;

// Initialize Upstash Redis
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN,
  })

// Generate a random username and password
function generateUser() {
  return {
    username: falso.randUserName(),
    password: falso.randPassword(),
  };
}

async function storeUsersInRedis(users) {
    const pipeline = redis.pipeline();
    users.forEach(user => {
      if (user) {
        pipeline.lpush('users', JSON.stringify(user));
      }
    });
    await pipeline.exec();
  }

// Main function to seed users
async function seedUsers() {
  for (let i = 0; i < USERS_COUNT; i += BATCH_SIZE) {
    // Generate users
    const users = Array.from({ length: BATCH_SIZE }, generateUser);
    await storeUsersInRedis(users);
    console.log(users);
    console.log(`Batch ${i / BATCH_SIZE + 1} completed.`);
  }
  console.log('All users have been seeded and stored in Redis.');
  process.exit(0);
}

seedUsers();
