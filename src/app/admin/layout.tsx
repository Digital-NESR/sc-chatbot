import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { isAdmin } from '@/lib/admin';

export const metadata = {
    title: 'Admin Dashboard | Supply Chain AI',
};

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session || !isAdmin(session.user?.email)) {
        redirect('/');
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            {/* Admin Header */}
            <header className="bg-[#307c4c] text-white shadow-md">
                <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link 
                            href="/" 
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            title="Back to Chat"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-300" />
                        </Link>
                        <h1 className="text-lg font-semibold tracking-tight">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-white/80">Logged in as</span>
                        <span className="font-medium px-3 py-1 bg-white/10 rounded-full border border-white/20">
                            {session.user.email}
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
            </main>
        </div>
    );
}
