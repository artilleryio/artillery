import { setTimeout } from 'timers/promises';

async function main() {
  const url = 'https://app.artillery.io/api/user/whoami';
  const apiKey = process.env.ARTILLERY_CLOUD_API_KEY;

  let attempts = 0;
  let response;
  let jsonData;

  while (attempts < 3) {
    try {
      response = await fetch(url, {
        headers: {
          'x-auth-token': apiKey
        }
      });

      if (response.ok) {
        jsonData = await response.json();
        break;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed:`, error.message);

      if (attempts >= 3) {
        console.error('All retry attempts failed');
        process.exit(1);
      } else {
        await setTimeout(5000);
      }
    }
  }

  try {
    const activeOrg = jsonData.activeOrg;
    if (!activeOrg) {
      console.error('No activeOrg field found in response');
      process.exit(1);
    }

    const memberships = jsonData.memberships;
    if (!Array.isArray(memberships)) {
      console.error('No memberships array found in response');
      process.exit(1);
    }

    const activeMembership = memberships.find(
      (membership) => membership.id === activeOrg
    );
    if (!activeMembership) {
      console.error(`No membership found with id: ${activeOrg}`);
      process.exit(1);
    }

    const plan = activeMembership.plan;
    if (!plan) {
      console.error('No plan field found in active membership');
      process.exit(1);
    }

    if (plan === 'business' || plan === 'enterprise') {
      console.log('License check passed: Business plan detected');
      process.exit(0);
    } else {
      console.error(
        `License check failed: Expected 'Business' plan, got '${plan}'`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('Error parsing or inspecting JSON response:', error.message);
    process.exit(1);
  }
}

main();
