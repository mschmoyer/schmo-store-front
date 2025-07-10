'use client';

import { Container, Group, Text, Stack, Anchor, Divider, SimpleGrid } from '@mantine/core';
import Link from 'next/link';
import { rebelTheme } from '@/lib/theme/rebel-theme';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerData: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Demo Stores', href: '/demo-stores' },
      // { label: 'Pricing', href: '/pricing' },
      // { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    title: 'Support',
    links: [
      // { label: 'Help Center', href: '/help' },
      { label: 'Contact Us', href: '/contact' },
      { label: 'Setup Guide', href: '/setup' },
      // { label: 'API Documentation', href: '/docs' },
      // { label: 'Status Page', href: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      // { label: 'Blog', href: '/blog' },
      // { label: 'Careers', href: '/careers' },
      // { label: 'Press', href: '/press' },
      // { label: 'Partners', href: '/partners' },
    ],
  },
  {
    title: 'Legal',
    links: [
      // { label: 'Privacy Policy', href: '/legal/privacy' },
      { label: 'Terms of Service', href: '/legal/terms' },
      // { label: 'Cookie Policy', href: '/legal/cookies' },
      // { label: 'GDPR', href: '/legal/gdpr' },
    ],
  },
];

// const socialLinks = [
//   { icon: IconBrandTwitter, href: 'https://twitter.com/schmostore', label: 'Twitter' },
//   { icon: IconBrandFacebook, href: 'https://facebook.com/schmostore', label: 'Facebook' },
//   { icon: IconBrandLinkedin, href: 'https://linkedin.com/company/schmostore', label: 'LinkedIn' },
//   { icon: IconMail, href: 'mailto:hello@schmostore.com', label: 'Email' },
// ];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`${rebelTheme.sections.footer} py-12 mt-auto`}>
      <Container size="lg">
        <Stack gap="xl">
          {/* Main Footer Content */}
          <div>
            <Group justify="space-between" align="flex-start" className="mb-8">
              <div className="max-w-sm">
                <Text size="xl" fw={700} className={`mb-2 ${rebelTheme.classes.text.heading}`}>
                  Rebel Shops
                </Text>
                <Text size="sm" className={`${rebelTheme.classes.text.body} leading-relaxed`}>
                  The easiest way to turn your ShipStation inventory into a beautiful, 
                  professional online store. Start selling in minutes.
                </Text>
              </div>
              
              {/*<Group gap="md">*/}
              {/*  {socialLinks.map((social, index) => (*/}
              {/*    <Anchor*/}
              {/*      key={index}*/}
              {/*      href={social.href}*/}
              {/*      target="_blank"*/}
              {/*      rel="noopener noreferrer"*/}
              {/*      className={`${rebelTheme.classes.text.muted} ${rebelTheme.classes.link.primary} transition-colors`}*/}
              {/*    >*/}
              {/*      <social.icon size={20} />*/}
              {/*    </Anchor>*/}
              {/*  ))}*/}
              {/*</Group>*/}
            </Group>

            <SimpleGrid
              cols={{ base: 2, sm: 4 }}
              spacing="lg"
              className="mt-8"
            >
              {footerData.map((section, index) => (
                <div key={index}>
                  <Text size="sm" fw={600} className={`mb-3 ${rebelTheme.classes.text.heading}`}>
                    {section.title}
                  </Text>
                  <Stack gap="xs">
                    {section.links.map((link, linkIndex) => (
                      <Anchor
                        key={linkIndex}
                        component={link.external ? "a" : (Link as unknown as "a")}
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className={`${rebelTheme.classes.text.muted} ${rebelTheme.classes.link.secondary} transition-colors text-sm`}
                      >
                        {link.label}
                      </Anchor>
                    ))}
                  </Stack>
                </div>
              ))}
            </SimpleGrid>
          </div>

          <Divider color="gray.7" />

          {/* Bottom Footer */}
          <Group justify="space-between" align="center">
            <Text size="sm" className={rebelTheme.classes.text.muted}>
              © {currentYear} RebelShops. All rights reserved.
            </Text>
            
            <Group gap="lg">
              <Text size="sm" className={rebelTheme.classes.text.muted}>
                Built with ❤️ for entrepreneurs
              </Text>
            </Group>
          </Group>
        </Stack>
      </Container>
    </footer>
  );
}