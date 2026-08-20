#!/usr/bin/env node

/**
 * Schema invariant verification
 * =============================
 *
 * Some of this schema's rules are enforced by triggers and deferred constraints rather than by a
 * column type, and those are exactly the rules a later migration can quietly disarm — a trigger
 * dropped by a CASCADE, a constraint recreated without its DEFERRABLE clause, a guard whose
 * plpgsql still compiles but no longer raises. A migration's own DO block proves the state it left
 * behind; nothing proves the state is still true three migrations later.
 *
 * This runs the rules as behaviour: each case does the thing that should be refused and fails if it
 * was allowed, or does the thing that should be permitted and fails if it was refused. Every case
 * runs inside a transaction that is always rolled back, so it is safe against any database
 * including a developer's own — but it is written to run in CI against a freshly migrated one.
 *
 * Usage
 * -----
 *   DATABASE_URL=... node database/verify-schema-invariants.js
 *
 * Exit code is 0 when every case passes, 1 otherwise.
 */

const { Pool } = require('pg');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const url = (
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  ''
).trim();

if (!url) {
  console.error('No DATABASE_URL configured. Set DATABASE_URL and try again.');
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    console.error('DATABASE_URL is not a valid PostgreSQL URL.');
    process.exit(1);
  }
})();

const pool = new Pool({
  connectionString: url,
  ssl: LOCAL_HOSTS.has(host) ? false : { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15000,
});

/**
 * A fixture store, created and rolled back inside each case.
 *
 * Cases never touch demo or merchant data: they build the two or three rows they need from nothing,
 * so the outcome does not depend on what happens to be seeded.
 */
const FIXTURE = {
  /**
   * Create a throwaway store and return its id.
   *
   * @param {import('pg').PoolClient} client - A client inside an open transaction.
   * @returns {Promise<string>} The new store's uuid.
   */
  async store(client) {
    const owner = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ('invariant-' || gen_random_uuid() || '@example.test', 'x', 'In', 'Variant')
       RETURNING id`,
    );
    const store = await client.query(
      `INSERT INTO stores (owner_id, store_name, store_slug)
       VALUES ($1, 'Invariant Fixture', 'invariant-' || gen_random_uuid())
       RETURNING id`,
      [owner.rows[0].id],
    );
    return store.rows[0].id;
  },

  /**
   * Create a product in the given store and return its id.
   *
   * @param {import('pg').PoolClient} client - A client inside an open transaction.
   * @param {string} storeId - Owning store.
   * @param {string} sku - The product's SKU, which its default variant inherits.
   * @returns {Promise<string>} The new product's uuid.
   */
  async product(client, storeId, sku) {
    const result = await client.query(
      `INSERT INTO products (store_id, sku, name, slug, base_price)
       VALUES ($1, $2, 'Invariant Fixture', 'invariant-' || gen_random_uuid(), 10.00)
       RETURNING id`,
      [storeId, sku],
    );
    return result.rows[0].id;
  },
};

/** @typedef {{name: string, run: (client: import('pg').PoolClient) => Promise<void>}} Case */

/**
 * Assert that a block of work is refused by the database.
 *
 * Runs inside a savepoint so the aborted transaction can continue afterwards, and requires the
 * error to be the expected one — a case that passes because of a typo in its own SQL is worse than
 * no case at all.
 *
 * @param {import('pg').PoolClient} client - A client inside an open transaction.
 * @param {string} label - What is being refused, for the failure message.
 * @param {string[]} expected - SQLSTATE codes any of which counts as the intended refusal.
 * @param {() => Promise<void>} work - The work that must fail.
 * @returns {Promise<void>} Resolves when the work failed as expected.
 */
async function mustRefuse(client, label, expected, work) {
  await client.query('SAVEPOINT invariant_case');
  let error = null;
  try {
    await work();
    /* A deferred constraint has not been evaluated yet at this point; forcing it is the only way to
     * observe it without ending the transaction. */
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  } catch (caught) {
    error = caught;
  }
  await client.query('ROLLBACK TO SAVEPOINT invariant_case');

  if (!error) {
    throw new Error(`${label}: the database allowed it.`);
  }
  if (!expected.includes(error.code)) {
    throw new Error(
      `${label}: refused with SQLSTATE ${error.code} (${error.message}), expected one of ${expected.join(', ')}.`,
    );
  }
}

/** @type {Case[]} */
const CASES = [
  {
    name: 'every product is born with a variant carrying its SKU and price',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-BORN');
      const { rows } = await client.query(
        `SELECT title, sku, base_price, option_key
           FROM product_variants WHERE product_id = $1 AND store_id = $2`,
        [productId, storeId],
      );
      if (rows.length !== 1) {
        throw new Error(`expected exactly one variant, found ${rows.length}`);
      }
      if (rows[0].sku !== 'INV-BORN' || rows[0].option_key !== '') {
        throw new Error(`default variant is wrong: ${JSON.stringify(rows[0])}`);
      }
    },
  },
  {
    name: 'editing a product mirrors onto its single optionless variant',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-SYNC');
      await client.query(
        `UPDATE products SET base_price = 42.00, weight = 1.75, allow_backorder = TRUE
          WHERE id = $1 AND store_id = $2`,
        [productId, storeId],
      );
      const { rows } = await client.query(
        `SELECT base_price, weight, allow_backorder
           FROM product_variants WHERE product_id = $1 AND store_id = $2`,
        [productId, storeId],
      );
      if (Number(rows[0].base_price) !== 42 || Number(rows[0].weight) !== 1.75 || rows[0].allow_backorder !== true) {
        throw new Error(`variant did not follow its product: ${JSON.stringify(rows[0])}`);
      }
    },
  },
  {
    name: 'a variant is no stricter than the product it is generated from',
    async run(client) {
      /*
       * `create_default_variant()` fires on every product insert, so a CHECK the variant table has
       * and `products` does not converts a write the catalogue has always accepted into a hard
       * failure — at product creation, at ShipStation sync, and at the backfill. A blank SKU and a
       * negative weight are both bad data and both legal in `products`; each of them broke a deploy
       * before this case existed.
       */
      const storeId = await FIXTURE.store(client);
      const legalButUgly = [
        { sku: '', weight: 1.0, why: 'a blank SKU' },
        { sku: '   ', weight: 1.0, why: 'a whitespace SKU' },
        { sku: 'INV-NEGW', weight: -2.5, why: 'a negative weight' },
        { sku: 'INV-ZERO', weight: null, why: 'a zero price and no weight' },
      ];
      for (const row of legalButUgly) {
        try {
          await client.query(
            `INSERT INTO products (store_id, sku, name, slug, base_price, weight)
             VALUES ($1::uuid, $2, 'Invariant Fixture', 'invariant-' || gen_random_uuid(), 0.00, $3)`,
            [storeId, row.sku, row.weight],
          );
        } catch (error) {
          throw new Error(`${row.why} is legal in products but the variant table refused it: ${error.message}`);
        }
      }
    },
  },
  {
    name: 'a SKU names one sellable unit per store',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      await FIXTURE.product(client, storeId, 'INV-UNIQ');
      const other = await FIXTURE.product(client, storeId, 'INV-UNIQ-OTHER');
      await mustRefuse(client, 'two variants sharing a SKU in one store', ['23505'], async () => {
        await client.query(
          `UPDATE product_variants SET sku = 'INV-UNIQ'
            WHERE product_id = $1::uuid AND store_id = $2::uuid`,
          [other, storeId],
        );
      });
    },
  },
  {
    name: 'a product cannot commit with no variants left',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-LAST');
      await mustRefuse(client, 'deleting the last variant', ['P0001'], async () => {
        const deleted = await client.query(
          'DELETE FROM product_variants WHERE product_id = $1::uuid AND store_id = $2::uuid',
          [productId, storeId],
        );
        /*
         * Assert the case is testing what it says it is. With the default-variant trigger gone the
         * DELETE removes nothing, the *insert*-side guard raises instead, and the case passes green
         * while the guard it names is disabled — which is how a verifier becomes decoration.
         */
        if (deleted.rowCount !== 1) {
          throw Object.assign(new Error(`expected to delete 1 variant, deleted ${deleted.rowCount}`), {
            code: 'PRECONDITION',
          });
        }
      });
    },
  },
  {
    name: 'the last variant of an already-committed product cannot be deleted',
    async run(client) {
      /*
       * The case above creates its product in the same transaction, so the *insert*-side guard is
       * queued and would raise even with the delete-side trigger disabled — the invariant holds,
       * but not the trigger the case is named after. Reaching for a product that predates this
       * transaction leaves the delete-side trigger as the only thing that can refuse. Everything
       * here is rolled back, so borrowing a real row costs nothing.
       */
      const existing = await client.query(
        `SELECT v.id, v.product_id
           FROM product_variants v
          WHERE (SELECT count(*) FROM product_variants s WHERE s.product_id = v.product_id) = 1
          LIMIT 1`,
      );
      if (existing.rowCount === 0) {
        throw new Error('no single-variant product in the database; run the demo seed first');
      }
      await mustRefuse(client, 'deleting an existing product\'s only variant', ['P0001'], async () => {
        await client.query('DELETE FROM product_variants WHERE id = $1::uuid', [existing.rows[0].id]);
      });
    },
  },
  {
    name: 'deleting the product itself is not a violation',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-GONE');
      await client.query('DELETE FROM products WHERE id = $1 AND store_id = $2', [productId, storeId]);
      /* The guard is deferred, so it has not run yet. Forcing it is the point of the case: a naive
       * implementation raises here because the cascade removed the variants. */
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    },
  },
  {
    name: 'a product created and then deleted in one transaction is not a violation',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-CHURN');
      await client.query('DELETE FROM products WHERE id = $1 AND store_id = $2', [productId, storeId]);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    },
  },
  {
    name: 'a grid of variants can be built before their option rows land',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-GRID');
      await buildGrid(client, storeId, productId);
      /* The transient collision on the empty option_key is what a non-deferred UNIQUE would refuse. */
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const { rows } = await client.query(
        `SELECT count(*)::int AS n, count(DISTINCT option_key)::int AS keys
           FROM product_variants WHERE product_id = $1 AND store_id = $2`,
        [productId, storeId],
      );
      if (rows[0].n !== 4 || rows[0].keys !== 4) {
        throw new Error(`expected 4 distinctly keyed variants, got ${JSON.stringify(rows[0])}`);
      }
    },
  },
  {
    name: 'the same option combination cannot exist twice in one product',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-DUPE');
      await buildGrid(client, storeId, productId);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');

      await mustRefuse(client, 'a duplicate option combination', ['23505'], async () => {
        const dupe = await client.query(
          `INSERT INTO product_variants (store_id, product_id, title, position, sku, base_price)
           VALUES ($1, $2, 'dupe', 9, 'INV-DUPE-X', 10.00) RETURNING id`,
          [storeId, productId],
        );
        await client.query(
          `INSERT INTO variant_option_values (store_id, variant_id, option_id, value_id)
           SELECT $1, $2, vov.option_id, vov.value_id
             FROM variant_option_values vov
             JOIN product_variants v ON v.id = vov.variant_id
            WHERE v.product_id = $3 AND v.store_id = $1
            ORDER BY v.position LIMIT 2`,
          [storeId, dupe.rows[0].id, productId],
        );
      });
    },
  },
  {
    name: 'an option value cannot be filed under the wrong option',
    async run(client) {
      const storeId = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeId, 'INV-CROSS');
      await buildGrid(client, storeId, productId);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');

      await mustRefuse(client, 'a value attached to a foreign option', ['23503'], async () => {
        const fresh = await client.query(
          `INSERT INTO product_variants (store_id, product_id, title, position, sku, base_price)
           VALUES ($1, $2, 'fresh', 8, 'INV-CROSS-X', 10.00) RETURNING id`,
          [storeId, productId],
        );
        await client.query(
          `INSERT INTO variant_option_values (store_id, variant_id, option_id, value_id)
           VALUES (
             $1, $2,
             (SELECT id FROM product_options WHERE product_id = $3 AND name = 'Size'),
             (SELECT pov.id FROM product_option_values pov
                JOIN product_options o ON o.id = pov.option_id
               WHERE o.product_id = $3 AND o.name = 'Colour' LIMIT 1)
           )`,
          [storeId, fresh.rows[0].id, productId],
        );
      });
    },
  },
  {
    name: 'a variant cannot borrow another store\'s media',
    async run(client) {
      const storeA = await FIXTURE.store(client);
      const storeB = await FIXTURE.store(client);
      const productId = await FIXTURE.product(client, storeA, 'INV-MEDIA');
      const media = await client.query(
        `INSERT INTO product_media (store_id, checksum, content_type, byte_size, width, height, bytes)
         VALUES ($1, md5(random()::text) || md5(clock_timestamp()::text), 'image/png', 4, 1, 1, '\\x00'::bytea)
         RETURNING id`,
        [storeB],
      );
      await mustRefuse(client, 'a cross-tenant variant image', ['23503'], async () => {
        await client.query(
          `UPDATE product_variants SET image_media_id = $1 WHERE product_id = $2 AND store_id = $3`,
          [media.rows[0].id, productId, storeA],
        );
      });
    },
  },
];

/**
 * Build a two-axis, four-variant grid on a product and remove its default variant.
 *
 * This is the sequence a variant editor performs, and it is the one that exercises the deferred
 * uniqueness: all five variants hold the empty option key at the same instant.
 *
 * @param {import('pg').PoolClient} client - A client inside an open transaction.
 * @param {string} storeId - Owning store.
 * @param {string} productId - The product to give options to.
 * @returns {Promise<void>} Resolves once the grid is in place.
 */
async function buildGrid(client, storeId, productId) {
  await client.query(
    `INSERT INTO product_options (store_id, product_id, name, position)
     VALUES ($1::uuid, $2::uuid, 'Size', 1), ($1::uuid, $2::uuid, 'Colour', 2)`,
    [storeId, productId],
  );
  await client.query(
    `INSERT INTO product_option_values (store_id, option_id, value, position)
     SELECT $1::uuid, o.id, v.value, v.pos
       FROM product_options o
       JOIN LATERAL (
         VALUES ('S', 1::smallint), ('M', 2::smallint)
       ) v(value, pos) ON o.name = 'Size'
      WHERE o.product_id = $2::uuid AND o.store_id = $1::uuid`,
    [storeId, productId],
  );
  await client.query(
    `INSERT INTO product_option_values (store_id, option_id, value, position)
     SELECT $1::uuid, o.id, v.value, v.pos
       FROM product_options o
       JOIN LATERAL (
         VALUES ('Red', 1::smallint), ('Blue', 2::smallint)
       ) v(value, pos) ON o.name = 'Colour'
      WHERE o.product_id = $2::uuid AND o.store_id = $1::uuid`,
    [storeId, productId],
  );
  await client.query(
    `INSERT INTO product_variants (store_id, product_id, title, position, sku, base_price)
     SELECT $1::uuid, $2::uuid, sv.value || ' / ' || cv.value,
            (row_number() OVER (ORDER BY sv.position, cv.position))::smallint,
            'GRID-' || sv.value || '-' || cv.value || '-' || left(replace($2::text, '-', ''), 8),
            10.00
       FROM product_options so
       JOIN product_option_values sv ON sv.option_id = so.id
       JOIN product_options co ON co.product_id = so.product_id AND co.name = 'Colour'
       JOIN product_option_values cv ON cv.option_id = co.id
      WHERE so.product_id = $2::uuid AND so.store_id = $1::uuid AND so.name = 'Size'`,
    [storeId, productId],
  );
  for (const axis of ['Size', 'Colour']) {
    await client.query(
      `INSERT INTO variant_option_values (store_id, variant_id, option_id, value_id)
       SELECT $1::uuid, v.id, ov.option_id, ov.id
         FROM product_variants v
         JOIN product_options o ON o.product_id = v.product_id AND o.store_id = v.store_id AND o.name = $3
         JOIN product_option_values ov ON ov.option_id = o.id
        WHERE v.product_id = $2::uuid AND v.store_id = $1::uuid AND v.title <> 'Default Title'
          AND CASE WHEN $3 = 'Size'
                   THEN v.title LIKE ov.value || ' / %'
                   ELSE v.title LIKE '% / ' || ov.value
              END`,
      [storeId, productId, axis],
    );
  }
  await client.query(
    `DELETE FROM product_variants
      WHERE product_id = $1::uuid AND store_id = $2::uuid AND title = 'Default Title'`,
    [productId, storeId],
  );
}

/**
 * Run every case and report.
 *
 * @returns {Promise<void>} Resolves after the process exit code has been set.
 */
async function main() {
  console.log(`Schema invariants -> ${host}\n`);
  const failures = [];

  for (const testCase of CASES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await testCase.run(client);
      console.log(`  ok    ${testCase.name}`);
    } catch (error) {
      failures.push({ name: testCase.name, message: error.message });
      console.log(`  FAIL  ${testCase.name}`);
      console.log(`        ${error.message}`);
    } finally {
      /* Always. No case is allowed to leave a row behind, including the ones that threw. */
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} of ${CASES.length} schema invariant(s) are not being enforced.`);
    process.exitCode = 1;
    return;
  }
  console.log(`All ${CASES.length} schema invariants hold.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
