import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

interface MainLayoutProps {
  searchPlaceholder?: string;
}

export default function MainLayout({ searchPlaceholder }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-[#f5f0e8]">
      <Sidebar />
      <TopNav searchPlaceholder={searchPlaceholder} />
      <main className="ml-52 pt-14 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
