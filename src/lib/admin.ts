export function isAdmin(email?: string | null): boolean {
    if (!email) return false;
    const adminEmailsStr = process.env.ADMIN_EMAILS || 'mfarhan1@nesr.com';
    const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase());
    return adminEmails.includes(email.toLowerCase());
}
