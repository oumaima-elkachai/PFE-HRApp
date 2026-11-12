import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';



export default function MainLayout() {
  return (
    <div className="min-h-screen bg-stone-100">
      <Sidebar />
      <TopNav />
      <main className="ms-52 pt-14 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
