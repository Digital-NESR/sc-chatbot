import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Admin Dashboard | Supply Chain AI',
};

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session || session.user?.email !== 'mfarhan1@nesr.com') {
        redirect('/');
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            {/* Admin Header */}
            <header className="bg-slate-900 text-white shadow-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link 
                            href="/" 
                            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                            title="Back to Chat"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-300" />
                        </Link>
                        <h1 className="text-lg font-semibold tracking-tight">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-400">Logged in as</span>
                        <span className="font-medium px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
                            {session.user.email}
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
                {children}
            </main>
        </div>
    );
}
