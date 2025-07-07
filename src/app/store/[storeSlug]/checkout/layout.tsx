import { TopNav } from "@/components";

export default function StoreCheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}