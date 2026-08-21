'use client';

/**
 * The header and footer menu editor.
 *
 * Navigation was hardcoded until now — `['Shop all', ...first four categories]`
 * computed in the header component. A merchant could not add a link, rename
 * one, reorder them, or point at a page they had just written, which meant a
 * custom page was unreachable except by typing its URL.
 *
 * Two behaviours here are deliberate and easy to get wrong:
 *
 *  - **"Use the default" is a real state, not an empty list.** A store that has
 *    never edited its menu derives one from its categories and picks up new
 *    categories as it adds them. An empty list is a merchant choosing to have
 *    no menu at all. Collapsing the two would make turning the nav off
 *    impossible, and would freeze every store's menu the first time they
 *    touched this screen.
 *  - **Links are store-relative.** `/pages/about`, not
 *    `https://shop.example/store/acme/pages/about`. The storefront is mounted
 *    under `/store/<slug>` today and on a custom domain tomorrow, and a stored
 *    absolute URL would break on the move.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import {
  isSafeNavHref,
  MAX_NAV_ITEMS,
  type NavItem,
  type StoreNavigation,
} from '@/lib/storefront-theme';

export interface NavigationEditorProps {
  /** Published pages, offered as one-click link targets. */
  pages: { slug: string; title: string }[];
  /** The store's categories, for the same reason. */
  categories: { slug: string; name: string }[];
}

/** Which menu is being edited. */
type MenuKey = 'header' | 'footer';

/**
 * The menu a store shows when it has never been edited.
 *
 * Mirrors `defaultHeaderNav`. Shown as the starting point when a merchant
 * switches from "the default" to a custom menu, so they edit what they already
 * had rather than starting from nothing and losing their category links.
 *
 * @param categories - The store's categories
 * @returns The derived menu
 */
function derivedMenu(categories: { slug: string; name: string }[]): NavItem[] {
  return [
    { label: 'Shop all', href: '/products' },
    ...categories.slice(0, 4).map((category) => ({
      label: category.name,
      href: `/products?category=${encodeURIComponent(category.slug)}`,
    })),
  ];
}

/**
 * The navigation editor.
 * @param props - {@link NavigationEditorProps}
 * @returns The header/footer menu editor
 */
export function NavigationEditor({ pages, categories }: NavigationEditorProps) {
  const [menu, setMenu] = useState<MenuKey>('header');
  const [navigation, setNavigation] = useState<StoreNavigation>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/admin/storefront-theme');
        const payload = await response.json();
        if (cancelled || !payload?.success) return;
        setNavigation(payload.data.navigation ?? {});
      } catch {
        if (!cancelled) setError('Could not load your menus.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = navigation[menu];
  const usingDefault = items === undefined;

  /** Link targets offered in the dropdown, all store-relative. */
  const targets = useMemo(
    () => [
      { value: '/products', label: 'All products' },
      ...categories.map((category) => ({
        value: `/products?category=${encodeURIComponent(category.slug)}`,
        label: `Category: ${category.name}`,
      })),
      ...pages.map((page) => ({ value: `/pages/${page.slug}`, label: `Page: ${page.title}` })),
      { value: '/cart', label: 'Cart' },
      { value: '/account', label: 'Account' },
    ],
    [categories, pages],
  );

  /**
   * Replace the menu being edited.
   * @param next - The new item list, or undefined to go back to the default
   */
  const setMenuItems = useCallback(
    (next: NavItem[] | undefined) => {
      setNavigation((current) => {
        const updated = { ...current };
        if (next === undefined) delete updated[menu];
        else updated[menu] = next;
        return updated;
      });
    },
    [menu],
  );

  const update = useCallback(
    (index: number, patch: Partial<NavItem>) => {
      setMenuItems((items ?? []).map((item, position) => (position === index ? { ...item, ...patch } : item)));
    },
    [items, setMenuItems],
  );

  const move = useCallback(
    (index: number, delta: number) => {
      const list = [...(items ?? [])];
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      setMenuItems(list);
    },
    [items, setMenuItems],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/storefront-theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ navigation }),
      });
      const payload = await response.json();
      if (!payload?.success) {
        const first = payload?.fieldErrors
          ? Object.values(payload.fieldErrors as Record<string, string[]>)[0]?.[0]
          : null;
        setError(first ?? payload?.error ?? 'Your menus were not saved.');
        return;
      }
      notifications.show({
        title: 'Saved to your draft',
        message: 'Publish from Page Design to put the change on your storefront.',
        color: 'green',
      });
    } catch {
      setError('The request failed.');
    } finally {
      setSaving(false);
    }
  }, [navigation]);

  if (loading) return <Text c="dimmed">Loading menus…</Text>;

  const invalid = (items ?? []).some(
    (item) => !item.label.trim() || !isSafeNavHref(item.href),
  );

  return (
    <Stack gap="md">
      <div>
        <Title order={4}>Menus</Title>
        <Text size="sm" c="dimmed">
          What appears in your header and in your footer&rsquo;s Shop column. Changes save to your
          draft; publish from Page Design.
        </Text>
      </div>

      <SegmentedControl
        value={menu}
        onChange={(value) => setMenu(value as MenuKey)}
        data={[
          { value: 'header', label: 'Header menu' },
          { value: 'footer', label: 'Footer menu' },
        ]}
      />

      {error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      ) : null}

      {usingDefault ? (
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600}>Using the automatic menu</Text>
            <Text size="sm" c="dimmed">
              Shop all, then your first four categories — and it picks up new categories as you add
              them. Take over only if you want something different; you will be maintaining it by
              hand afterwards.
            </Text>
            <Group>
              <Button
                variant="light"
                size="xs"
                onClick={() => setMenuItems(derivedMenu(categories))}
              >
                Take over this menu
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {items!.length === 0 ? (
            <Text size="sm" c="dimmed">
              This menu is empty, so nothing will show. Add an item, or go back to the automatic
              menu.
            </Text>
          ) : null}

          {items!.map((item, index) => (
            <Card key={index} withBorder padding="sm">
              <Group align="flex-end" wrap="nowrap" gap="xs">
                <TextInput
                  label={index === 0 ? 'Label' : undefined}
                  placeholder="Shop all"
                  value={item.label}
                  error={!item.label.trim() ? 'Needs a label' : undefined}
                  onChange={(event) => update(index, { label: event.currentTarget.value })}
                  style={{ flex: '0 0 200px' }}
                />
                <Select
                  label={index === 0 ? 'Links to' : undefined}
                  data={targets}
                  value={targets.some((t) => t.value === item.href) ? item.href : null}
                  placeholder="Choose or type below"
                  onChange={(value) => value && update(index, { href: value })}
                  style={{ flex: 1 }}
                  searchable
                />
                <TextInput
                  label={index === 0 ? 'Or a link' : undefined}
                  placeholder="/pages/about or https://…"
                  value={item.href}
                  error={!isSafeNavHref(item.href) ? 'Not a usable link' : undefined}
                  onChange={(event) => update(index, { href: event.currentTarget.value })}
                  style={{ flex: 1 }}
                />
                <Tooltip label="Move up">
                  <ActionIcon
                    variant="subtle"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${item.label || 'item'} up`}
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Move down">
                  <ActionIcon
                    variant="subtle"
                    disabled={index === items!.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${item.label || 'item'} down`}
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                </Tooltip>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => setMenuItems(items!.filter((_, position) => position !== index))}
                  aria-label={`Remove ${item.label || 'item'}`}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Card>
          ))}

          <Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              disabled={items!.length >= MAX_NAV_ITEMS}
              onClick={() => setMenuItems([...items!, { label: '', href: '/products' }])}
            >
              Add item
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setMenuItems(undefined)}>
              Back to the automatic menu
            </Button>
          </Group>
        </Stack>
      )}

      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={invalid}>
          Save menus
        </Button>
      </Group>
    </Stack>
  );
}

export default NavigationEditor;
