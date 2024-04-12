const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN
});

async function getUser(context, events) {
    const initialTime = Date.now();
    const res = await redis.lpop('users', 1);

    if (res.length === 0) {
        console.error('No users found in Redis');
        throw new Error('err_no_users_found_in_redis');
    }
    context.vars.username = res[0].username;
    context.vars.password = res[0].password;
    const finalTime = Date.now();

    if (process.env.SHOW_TIMING) {
        console.log(`Time taken: ${finalTime - initialTime}ms`);
    };
}

module.exports = {
    getUser
};