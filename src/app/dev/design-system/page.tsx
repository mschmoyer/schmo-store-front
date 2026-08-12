'use client';

import * as React from 'react';
import {
  IconArrowRight,
  IconBolt,
  IconDownload,
  IconPackage,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Container,
  Divider,
  Drawer,
  EmptyState,
  Eyebrow,
  Input,
  Modal,
  Price,
  ProductImage,
  Section,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Textarea,
  Tooltip,
} from '@/components/ui';
import styles from './showcase.module.css';

/** Products used to exercise the deterministic ProductImage fallback. */
const SAMPLE_PRODUCTS = [
  { sku: 'PHONE-001', name: 'Latest Smartphone Pro' },
  { sku: 'JEWELRY-001', name: 'Handcrafted Silver Necklace' },
  { sku: 'FIT-KETTLE-24', name: 'Cast Iron Kettlebell 24kg' },
  { sku: 'LAPTOP-ULTRA', name: 'Ultra Thin Laptop' },
  { sku: 'CASE-CLR-11', name: 'Clear Phone Case' },
  { sku: 'MUG-STONE-01', name: 'Stoneware Mug' },
] as const;

/** One labelled block in the showcase. */
function Row({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <h3 className={styles.rowTitle}>{title}</h3>
        {note ? <p className={styles.rowNote}>{note}</p> : null}
      </div>
      <div className={styles.rowBody}>{children}</div>
    </div>
  );
}

/**
 * Internal design-system showcase. Renders every primitive in every variant so
 * the kit can be reviewed and screenshotted in one pass. Not linked from the
 * app and not intended to ship to customers.
 *
 * @returns The showcase page.
 */
export default function DesignSystemPage(): React.ReactElement {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [switchOn, setSwitchOn] = React.useState(true);

  return (
    <main className={styles.page}>
      {/* ---------------------------------------------------------- header */}
      <Section tone="inverse" rhythm="compact" container="wide">
        <Stack gap={12} align="start">
          <Eyebrow rule>Design system</Eyebrow>
          <h1 className={styles.pageTitle}>The primitive kit</h1>
          <p className={styles.pageLede}>
            Every component below reads from the semantic tokens in{' '}
            <code>globals.css</code>. Warm ink, warm paper, one vermilion signal — and money-green
            reserved for value.
          </p>
        </Stack>
      </Section>

      <Container width="wide">
        {/* -------------------------------------------------------- colour */}
        <Row title="Palette" note="Raw scale. Components never reach for these directly.">
          <Stack gap={20}>
            {(
              [
                ['ink', ['950', '900', '800', '700', '600', '500', '400', '300', '200', '100', '50']],
                ['ember', ['900', '800', '700', '600', '500', '400', '300', '200', '100', '50']],
              ] as const
            ).map(([family, shades]) => (
              <div key={family} className={styles.swatchRow}>
                {shades.map((shade) => (
                  <div key={shade} className={styles.swatch}>
                    <span
                      className={styles.swatchChip}
                      style={{ background: `var(--${family}-${shade})` }}
                    />
                    <span className={styles.swatchLabel}>
                      {family}-{shade}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div className={styles.swatchRow}>
              {(
                ['paper', 'paper-raised', 'paper-sunken', 'mint-500', 'amber-500', 'rose-500', 'azure-500'] as const
              ).map((token) => (
                <div key={token} className={styles.swatch}>
                  <span className={styles.swatchChip} style={{ background: `var(--${token})` }} />
                  <span className={styles.swatchLabel}>{token}</span>
                </div>
              ))}
            </div>
          </Stack>
        </Row>

        <Divider soft />

        {/* ---------------------------------------------------- typography */}
        <Row title="Type scale" note="Space Grotesk display, Inter UI, JetBrains Mono for identifiers.">
          <Stack gap={16}>
            <span className={styles.display}>Live in five minutes</span>
            <h2 className={styles.h1}>Your ShipStation inventory</h2>
            <h3 className={styles.h2}>A storefront that sells it</h3>
            <h4 className={styles.h3}>Subsection / card title</h4>
            <p className={styles.lead}>
              Lead paragraph. Confident, concrete, allergic to fluff — margins, fees and shipping
              labels, not empowering journeys.
            </p>
            <p className={styles.body}>
              Body copy at 16px on a 1.6 leading. Secondary ink sits at 7:1 against paper, which is
              the floor for anything a person has to read.
            </p>
            <p className={styles.mono}>SKU: FIT-KETTLE-24 · ORDER 8104-2291-QA</p>
          </Stack>
        </Row>

        <Divider soft />

        {/* ------------------------------------------------------- buttons */}
        <Row title="Button — variants" note="Press physics: lift on hover, settle on active, 120ms.">
          <Stack direction="horizontal" gap={12} wrap>
            <Button>Create store</Button>
            <Button variant="secondary">Import products</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive" leftIcon={<IconTrash size={16} />}>
              Delete
            </Button>
            <Button variant="link">View the docs</Button>
          </Stack>
        </Row>

        <Row title="Button — sizes and icons">
          <Stack direction="horizontal" gap={12} wrap align="center">
            <Button size="sm" leftIcon={<IconPlus size={14} />}>
              Small
            </Button>
            <Button size="md" leftIcon={<IconPlus size={16} />}>
              Medium
            </Button>
            <Button size="lg" rightIcon={<IconArrowRight size={18} />}>
              Large
            </Button>
            <Button variant="secondary" iconOnly aria-label="Search">
              <IconSearch size={17} />
            </Button>
            <Button variant="ghost" iconOnly aria-label="Download">
              <IconDownload size={17} />
            </Button>
          </Stack>
        </Row>

        <Row
          title="Button — loading and disabled"
          note="Loading keeps the exact width of the resting label."
        >
          <Stack direction="horizontal" gap={12} wrap align="center">
            <Button loading>Create store</Button>
            <Button variant="secondary" loading>
              Import products
            </Button>
            <Button variant="destructive" loading>
              Delete
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </Stack>
        </Row>

        <Divider soft />

        {/* --------------------------------------------------------- badge */}
        <Row title="Badge" note="Colour is never the only signal — the dot is the second cue.">
          <Stack gap={14}>
            <Stack direction="horizontal" gap={10} wrap>
              <Badge>Draft</Badge>
              <Badge tone="ember" dot>
                Syncing
              </Badge>
              <Badge tone="mint" dot>
                In stock
              </Badge>
              <Badge tone="amber" dot>
                Low stock
              </Badge>
              <Badge tone="rose" dot>
                Out of stock
              </Badge>
              <Badge tone="ember" dot pulse>
                Live
              </Badge>
            </Stack>
            <Stack direction="horizontal" gap={10} wrap align="center">
              <Badge size="sm">Small</Badge>
              <Badge size="md">Medium</Badge>
              <Badge size="lg">Large</Badge>
              <Badge square tone="neutral">
                SKU-0041
              </Badge>
              <Badge solid tone="ember">
                Solid
              </Badge>
              <Badge solid tone="mint">
                Paid
              </Badge>
              <Badge solid tone="rose">
                Refunded
              </Badge>
            </Stack>
          </Stack>
        </Row>

        <Divider soft />

        {/* --------------------------------------------------------- price */}
        <Row title="Price" note="Display face, tabular numerals, mint savings badge.">
          <Stack gap={20}>
            <Stack direction="horizontal" gap={32} wrap align="baseline">
              <Price value={24} size="sm" />
              <Price value={149.99} size="md" />
              <Price value={899.99} size="lg" />
              <Price value={1249} size="xl" />
            </Stack>
            <Stack direction="horizontal" gap={32} wrap align="center">
              <Price value={799.99} compareAt={899.99} size="lg" />
              <Price value={89} compareAt={129} savingsAsPercent />
              <Price value={0} freeWhenZero size="md" />
              <Price value={12.5} compareAt={20} stacked size="lg" />
            </Stack>
          </Stack>
        </Row>

        <Divider soft />

        {/* -------------------------------------------------- product image */}
        <Row
          title="ProductImage — generated fallback"
          note="Deterministic from the SKU. Same product, same mark, every render."
        >
          <div className={styles.productGrid}>
            {SAMPLE_PRODUCTS.map((product) => (
              <Card
                key={product.sku}
                as="a"
                href="#product"
                padding="none"
                className={styles.productCard}
                interactive
              >
                <ProductImage
                  sku={product.sku}
                  name={product.name}
                  ratio="4 / 3"
                  rounded="none"
                  zoomOnHover
                />
                <CardBody className={styles.productBody}>
                  <span className={styles.productName}>{product.name}</span>
                  <Stack direction="horizontal" justify="between" align="center" gap={8}>
                    <Price value={149.99} compareAt={199} size="sm" />
                    <Badge tone="mint" size="sm" dot>
                      In stock
                    </Badge>
                  </Stack>
                </CardBody>
              </Card>
            ))}
          </div>
        </Row>

        <Divider soft />

        {/* ---------------------------------------------------------- card */}
        <Row title="Card">
          <div className={styles.cardGrid}>
            <Card>
              <CardHeader title="Payout schedule" subtitle="Next transfer lands Thursday." />
              <CardBody>
                <p className={styles.cardCopy}>
                  Standard card. Paper-raised, hairline border, radius-lg, layered shadow-sm.
                </p>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" size="sm">
                  Details
                </Button>
                <Button size="sm">Edit</Button>
              </CardFooter>
            </Card>

            <Card accent>
              <CardHeader
                title="Pro plan"
                subtitle="$1/month, forever."
                action={<Badge tone="ember">Popular</Badge>}
              />
              <CardBody>
                <p className={styles.cardCopy}>
                  Accent card. An ember hairline along the top edge marks the promoted option.
                </p>
              </CardBody>
            </Card>

            <Card interactive as="button" padding="md">
              <CardHeader title="Interactive card" subtitle="Lifts on hover, focusable." />
              <CardBody>
                <p className={styles.cardCopy}>
                  Rendered as a real button so the keyboard reaches it.
                </p>
              </CardBody>
            </Card>

            <Card tone="sunken">
              <CardHeader title="Sunken well" subtitle="For inset panels and summaries." />
              <CardBody>
                <p className={styles.cardCopy}>No elevation, sits back into the page.</p>
              </CardBody>
            </Card>
          </div>
        </Row>

        <Divider soft />

        {/* --------------------------------------------------------- forms */}
        <Row title="Form controls" note="40px, real label-for, two-stop focus ring.">
          <div className={styles.formGrid}>
            <Stack gap={18}>
              <Input label="Store name" placeholder="Rebel Supply Co." hint="Shown in your storefront header." />
              <Input
                label="SKU"
                mono
                defaultValue="FIT-KETTLE-24"
                leftSection={<IconPackage size={17} />}
              />
              <Input
                label="Price"
                type="number"
                defaultValue="149.99"
                leftSection={<span>$</span>}
                rightSection={<span>USD</span>}
              />
              <Input
                label="Support email"
                defaultValue="not-an-email"
                error="Enter a valid email address."
                required
              />
              <Input label="Disabled" defaultValue="Locked by your plan" disabled />
            </Stack>

            <Stack gap={18}>
              <Select
                label="Warehouse"
                placeholder="Choose a warehouse"
                options={[
                  { value: 'a', label: 'Austin, TX' },
                  { value: 'b', label: 'Reno, NV' },
                  { value: 'c', label: 'Columbus, OH' },
                ]}
                hint="Where this product ships from."
              />
              <Textarea
                label="Product description"
                placeholder="What is it, who is it for, what does it weigh?"
                optionalLabel
              />
              <Stack gap={12}>
                <Checkbox label="Track inventory" hint="Pull stock levels from ShipStation." defaultChecked />
                <Checkbox label="Requires shipping" defaultChecked />
                <Checkbox label="Partial selection" indeterminate />
                <Checkbox label="Disabled option" disabled />
              </Stack>
              <Stack gap={12}>
                <Switch
                  label="Publish storefront"
                  hint="Anyone with the link can buy."
                  checked={switchOn}
                  onChange={(event) => setSwitchOn(event.currentTarget.checked)}
                />
                <Switch label="Email me on every order" />
                <Switch label="Locked" disabled />
              </Stack>
            </Stack>
          </div>
        </Row>

        <Divider soft />

        {/* ------------------------------------------------------ feedback */}
        <Row title="Spinner, Skeleton, EmptyState">
          <Stack gap={28}>
            <Stack direction="horizontal" gap={24} align="center">
              <Spinner size="xs" />
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <Spinner size="xl" />
              <span className={styles.emberText}>
                <Spinner size="lg" />
              </span>
            </Stack>

            <div className={styles.skeletonGrid}>
              <Skeleton.Card />
              <Skeleton.Card />
              <Stack gap={14}>
                <Skeleton height={26} width="60%" shape="pill" />
                <Skeleton.Text lines={5} />
                <Stack direction="horizontal" gap={10} align="center">
                  <Skeleton shape="circle" width={40} />
                  <Skeleton height={14} width={140} shape="pill" />
                </Stack>
              </Stack>
            </div>

            <div className={styles.emptyGrid}>
              <EmptyState
                title="No products yet"
                description="Sync your ShipStation catalogue and every SKU you already manage shows up here, priced and ready to sell."
                action={<Button leftIcon={<IconBolt size={16} />}>Sync ShipStation</Button>}
                secondaryAction={<Button variant="ghost">Add one manually</Button>}
              />
              <EmptyState
                compact
                align="left"
                title="No orders today"
                description="Orders land here the moment a customer checks out."
                action={
                  <Button variant="secondary" size="sm">
                    View last week
                  </Button>
                }
              />
            </div>
          </Stack>
        </Row>

        <Divider soft />

        {/* ------------------------------------------------------ overlays */}
        <Row title="Overlays" note="Tooltip, Modal and Drawer wrapping Mantine in our chrome.">
          <Stack direction="horizontal" gap={12} wrap>
            <Tooltip label="Pulls stock levels every 15 minutes">
              <Button variant="secondary">Hover for a tooltip</Button>
            </Tooltip>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              Open drawer
            </Button>
          </Stack>
        </Row>

        <Divider soft />

        {/* ------------------------------------------------------ elevation */}
        <Row title="Elevation and radius" note="Layered warm shadows — never a single flat blur.">
          <Stack direction="horizontal" gap={20} wrap>
            {(['xs', 'sm', 'md', 'lg', 'ember'] as const).map((token) => (
              <div key={token} className={styles.shadowTile} style={{ boxShadow: `var(--shadow-${token})` }}>
                shadow-{token}
              </div>
            ))}
          </Stack>
          <Stack direction="horizontal" gap={20} wrap className={styles.radiusRow}>
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((token) => (
              <div key={token} className={styles.radiusTile} style={{ borderRadius: `var(--radius-${token})` }}>
                {token}
              </div>
            ))}
          </Stack>
        </Row>

        <div className={styles.tail} />
      </Container>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Delete this product?"
        description="This removes it from your storefront. ShipStation is not touched."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => setModalOpen(false)}>
              Delete product
            </Button>
          </>
        }
      >
        <p className={styles.cardCopy}>
          <strong>Cast Iron Kettlebell 24kg</strong> has 41 units in stock across two warehouses.
          Deleting it hides the listing immediately; existing orders are unaffected.
        </p>
      </Modal>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filter products"
        description="Narrow the catalogue down."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Reset
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>Apply filters</Button>
          </>
        }
      >
        <Stack gap={18}>
          <Input label="Search" placeholder="Name or SKU" leftSection={<IconSearch size={17} />} />
          <Select
            label="Stock status"
            options={[
              { value: 'in', label: 'In stock' },
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
            ]}
          />
          <Checkbox label="Featured only" />
        </Stack>
      </Drawer>
    </main>
  );
}
