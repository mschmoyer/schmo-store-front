'use client';

/**
 * Storefront pages.
 *
 * Until now a merchant could compose exactly one page — their home page. There
 * was no About, no Shipping & Returns, no Size Guide, no Contact. Policy pages
 * are not decoration: a shop that cannot state its returns policy cannot
 * legally trade in most of its markets, and Stripe asks for the URL during
 * Connect onboarding.
 *
 * The screen is built around the templates rather than around a blank page.
 * The blank-page moment is where storefronts stall, and "what does a Shipping &
 * Returns page even contain" is a question the platform can answer once instead
 * of every merchant answering it badly. Picking a template creates the page
 * pre-composed, with the *structure* of a good version of it and every
 * commitment left as a visible prompt for the merchant to answer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconBuildingWarehouse,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconFile,
  IconHelpCircle,
  IconMail,
  IconRocket,
  IconRuler2,
  IconTrash,
  IconTruckReturn,
  type IconProps,
} from '@tabler/icons-react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  isUsablePageSlug,
  pageTemplateSections,
  slugifyPageTitle,
  type PageTemplate,
  type StorePageSummary,
} from '@/lib/storefront-theme';

/** A template as the list API serialises it — everything but `build`. */
type TemplateSummary = Omit<PageTemplate, 'build'>;

/**
 * The icons templates may name.
 *
 * An explicit map rather than a namespace lookup, matching `SectionIcon.tsx`:
 * templates carry an icon *name* so the registry stays free of React imports
 * and usable from Node scripts, and the mapping back has to live on this side
 * of the line. A bounded map also keeps the whole icon package out of this
 * bundle, and lets an unknown name fail soft instead of rendering `undefined`.
 */
const TEMPLATE_ICONS: Record<string, React.ComponentType<IconProps>> = {
  IconBuildingStore,
  IconBuildingWarehouse,
  IconFile,
  IconHelpCircle,
  IconMail,
  IconRocket,
  IconRuler2,
  IconTruckReturn,
};

/**
 * Draw a template's icon.
 * @param props - The template's icon name
 * @returns The mapped icon, or a neutral placeholder for an unknown name
 */
function TemplateIcon({ name }: { name: string }): React.ReactElement {
  const Icon = TEMPLATE_ICONS[name] ?? IconFile;
  return <Icon size={16} />;
}

/**
 * The storefront pages screen.
 * @returns The page list and template picker
 */
export default function AdminPagesScreen() {
  const [storeSlug, setStoreSlug] = useState('');
  const [pages, setPages] = useState<StorePageSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chosen, setChosen] = useState<TemplateSummary | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pages');
      const payload = await response.json();
      if (!payload?.success) {
        setError(payload?.error ?? 'Could not load your pages.');
        return;
      }
      setPages(payload.data.pages ?? []);
      setTemplates(payload.data.templates ?? []);
      setStoreSlug(payload.data.storeSlug ?? '');
      setError(null);
    } catch {
      setError('Could not load your pages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : slugifyPageTitle(title)),
    [slug, slugTouched, title],
  );

  /**
   * Open the create dialog for a template, pre-filling its title and slug.
   * @param template - The chosen template
   */
  const openTemplate = (template: TemplateSummary): void => {
    setChosen(template);
    setTitle(template.title);
    setSlug(template.slug);
    setSlugTouched(true);
    setCreateError(null);
  };

  const create = useCallback(async () => {
    if (!chosen) return;
    setCreateError(null);

    if (!title.trim()) {
      setCreateError('Give the page a title.');
      return;
    }
    if (!isUsablePageSlug(effectiveSlug)) {
      setCreateError('That URL is not usable. Lowercase letters, numbers and hyphens only.');
      return;
    }

    setBusy('create');
    try {
      const response = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: effectiveSlug,
          title: title.trim(),
          // Built client-side from the same registry the API validates
          // against, so the page arrives composed rather than blank.
          sections: pageTemplateSections(chosen.id),
        }),
      });
      const payload = await response.json();

      if (!payload?.success) {
        setCreateError(
          payload?.fieldErrors?.slug?.[0] ?? payload?.error ?? 'The page could not be created.',
        );
        return;
      }

      notifications.show({
        title: 'Page created',
        message: `"${title.trim()}" is saved as a draft. Publish it when you are ready.`,
        color: 'green',
      });
      setChosen(null);
      await load();
    } catch {
      setCreateError('The request failed.');
    } finally {
      setBusy(null);
    }
  }, [chosen, title, effectiveSlug, load]);

  /**
   * Publish or unpublish one page.
   * @param page - The page to change
   */
  const togglePublish = useCallback(
    async (page: StorePageSummary) => {
      setBusy(page.slug);
      try {
        const response = await fetch(`/api/admin/pages/${page.slug}/publish`, {
          method: page.published ? 'DELETE' : 'POST',
        });
        const payload = await response.json();
        if (!payload?.success) {
          notifications.show({
            title: 'Not changed',
            message: payload?.error ?? 'Something went wrong.',
            color: 'red',
          });
          return;
        }
        notifications.show({
          title: page.published ? 'Unpublished' : 'Published',
          message: page.published
            ? `"${page.title}" is off your storefront. The page itself is still here.`
            : `"${page.title}" is live on your storefront.`,
          color: 'green',
        });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  /**
   * Delete a page outright.
   * @param page - The page to delete
   */
  const remove = useCallback(
    async (page: StorePageSummary) => {
      // Deleting is not the same as unpublishing, and the confirmation says so
      // — a merchant reaching for "take this off my shop" must not lose the
      // copy they wrote because the two buttons sat next to each other.
      const confirmed = window.confirm(
        `Delete "${page.title}" permanently?\n\nThis removes the page and everything written on it. ` +
          `To take it off your storefront but keep it, use Unpublish instead.`,
      );
      if (!confirmed) return;

      setBusy(page.slug);
      try {
        const response = await fetch(`/api/admin/pages/${page.slug}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!payload?.success) {
          notifications.show({
            title: 'Not deleted',
            message: payload?.error ?? 'Something went wrong.',
            color: 'red',
          });
          return;
        }
        notifications.show({ title: 'Deleted', message: `"${page.title}" is gone.`, color: 'green' });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const essentials = templates.filter((template) => template.group === 'essential');
  const growth = templates.filter((template) => template.group === 'growth');
  const taken = new Set(pages.map((page) => page.slug));

  return (
    <Container size="lg" py="lg">
      <AdminPageHeader
        title="Pages"
        description="About, Shipping & returns, Contact — the pages a shop needs beyond its home page."
      />

      {error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Text c="dimmed">Loading…</Text>
      ) : (
        <Stack gap="xl">
          {pages.length > 0 ? (
            <Stack gap="sm">
              <Title order={4}>Your pages</Title>
              {pages.map((page) => (
                <Card key={page.slug} withBorder padding="md">
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Text fw={600}>{page.title}</Text>
                        <Badge
                          size="sm"
                          variant={page.published ? 'filled' : 'light'}
                          color={page.published ? 'green' : undefined}
                        >
                          {page.published ? 'Live' : 'Draft'}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        /pages/{page.slug} · {page.sectionCount} section
                        {page.sectionCount === 1 ? '' : 's'}
                      </Text>
                    </div>

                    <Group gap="xs" wrap="nowrap">
                      {page.published && storeSlug ? (
                        <Tooltip label="Open on your storefront">
                          <ActionIcon
                            component={Link}
                            href={`/store/${storeSlug}/pages/${page.slug}`}
                            target="_blank"
                            variant="subtle"
                            aria-label={`Open ${page.title} on your storefront`}
                          >
                            <IconExternalLink size={18} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}

                      <Button
                        size="xs"
                        variant={page.published ? 'default' : 'filled'}
                        loading={busy === page.slug}
                        leftSection={
                          page.published ? <IconEyeOff size={14} /> : <IconEye size={14} />
                        }
                        onClick={() => togglePublish(page)}
                      >
                        {page.published ? 'Unpublish' : 'Publish'}
                      </Button>

                      <Tooltip label="Delete permanently">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          disabled={busy === page.slug}
                          onClick={() => remove(page)}
                          aria-label={`Delete ${page.title}`}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : null}

          <Stack gap="sm">
            <div>
              <Title order={4}>Start from a template</Title>
              <Text size="sm" c="dimmed">
                Each one arrives with the structure of a good version of that page. The copy is a
                set of prompts in square brackets — answer them, and delete anything that does not
                apply to you.
              </Text>
            </div>

            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Every shop needs these
            </Text>
            <Grid>
              {essentials.map((template) => (
                <Grid.Col key={template.id} span={{ base: 12, sm: 6, md: 4 }}>
                  <TemplateCard
                    template={template}
                    disabled={taken.has(template.slug)}
                    onChoose={openTemplate}
                  />
                </Grid.Col>
              ))}
            </Grid>

            <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="sm">
              When you need them
            </Text>
            <Grid>
              {growth.map((template) => (
                <Grid.Col key={template.id} span={{ base: 12, sm: 6, md: 4 }}>
                  <TemplateCard
                    template={template}
                    disabled={taken.has(template.slug)}
                    onChoose={openTemplate}
                  />
                </Grid.Col>
              ))}
            </Grid>
          </Stack>
        </Stack>
      )}

      <Modal
        opened={chosen !== null}
        onClose={() => setChosen(null)}
        title={chosen ? `New page: ${chosen.title}` : ''}
      >
        <Stack gap="md">
          {createError ? (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {createError}
            </Alert>
          ) : null}

          <TextInput
            label="Page title"
            required
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <TextInput
            label="URL"
            description={`Your shoppers will see /pages/${effectiveSlug || '…'}`}
            required
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.currentTarget.value);
            }}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setChosen(null)}>
              Cancel
            </Button>
            <Button loading={busy === 'create'} onClick={create}>
              Create as draft
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

interface TemplateCardProps {
  template: TemplateSummary;
  /** True when the store already has a page at this template's slug. */
  disabled: boolean;
  onChoose: (template: TemplateSummary) => void;
}

/**
 * One template in the picker.
 * @param props - {@link TemplateCardProps}
 * @returns A clickable template card
 */
function TemplateCard({ template, disabled, onChoose }: TemplateCardProps) {
  return (
    <Card withBorder padding="md" h="100%">
      <Stack gap="xs" h="100%" justify="space-between">
        <div>
          <Group gap="xs" mb={6}>
            <ThemeIcon variant="light" size="md">
              <TemplateIcon name={template.icon} />
            </ThemeIcon>
            <Text fw={600}>{template.title}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            {template.description}
          </Text>
        </div>
        <Button
          size="xs"
          variant="light"
          disabled={disabled}
          onClick={() => onChoose(template)}
          mt="sm"
        >
          {disabled ? 'Already added' : 'Use this'}
        </Button>
      </Stack>
    </Card>
  );
}
