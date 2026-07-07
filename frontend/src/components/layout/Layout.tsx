import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import type { User } from '../../types';

interface LayoutProps {
  children: ReactNode;
  user?: User | null;
  searchPlaceholder?: string;
}

export default function Layout({ children, searchPlaceholder }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <Sidebar />
      <TopNav searchPlaceholder={searchPlaceholder} />
      <main className="ml-52 pt-14 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}