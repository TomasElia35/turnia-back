import { many, one } from './src/config/db.js';

async function assignMissingSubs() {
  try {
    const defaultPlan = await one(`select id from plans where name = 'Pro' limit 1`);
    if (!defaultPlan) {
      console.error('No Pro plan found in DB. Run seed first.');
      return;
    }

    // Find all businesses without a subscription
    const missing = await many(`
      select b.id, b.name 
      from businesses b
      left join subscriptions s on s.business_id = b.id
      where s.id is null
    `);

    if (missing.length === 0) {
      console.log('All businesses already have a subscription.');
      return;
    }

    for (const biz of missing) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await one(
        `insert into subscriptions (business_id, plan_id, status, billing_cycle, next_billing_date)
         values ($1, $2, 'active', 'monthly', $3) returning id`,
        [biz.id, defaultPlan.id, nextMonth]
      );
      console.log(`Assigned Pro subscription to business: ${biz.name} (${biz.id})`);
    }
    console.log('Finished assigning missing subscriptions.');
  } catch (err) {
    console.error('Error:', err);
  }
}

assignMissingSubs();
