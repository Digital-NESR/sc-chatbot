'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
    { href: '/admin', label: 'Usage' },
    { href: '/admin/columns', label: 'Column Dictionary' },
];

export default function AdminNav() {
    const pathname = usePathname();

    return (
        <nav className="flex items-center gap-1">
            {LINKS.map((l) => {
                const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
                return (
                    <Link
                        key={l.href}
                        href={l.href}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            active ? 'bg-white/20 font-medium' : 'text-white/75 hover:bg-white/10'
                        }`}
                    >
                        {l.label}
                    </Link>
                );
            })}
        </nav>
    );
}
