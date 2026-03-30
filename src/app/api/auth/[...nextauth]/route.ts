import NextAuth from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';

const handler = NextAuth({
    providers: [
        AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
        }),
        CredentialsProvider({
            name: 'Password',
            credentials: {
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (credentials?.password === 'nesr2026') {
                    return { id: '1', name: 'Admin', email: 'admin@nesr.com' };
                }
                return null;
            },
        }),
    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async jwt({ token, account }: any) {
            // This block only runs on the initial sign-in when the access token is fresh
            if (account?.access_token) {
                try {
                    // 1. Fetch the Job Title
                    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=jobTitle", {
                        headers: { Authorization: `Bearer ${account.access_token}` },
                    });
                    if (profileResponse.ok) {
                        const profileData = await profileResponse.json();
                        token.jobTitle = profileData.jobTitle || "NESR Employee";
                    } else {
                        token.jobTitle = "NESR Employee";
                    }

                    // 2. Fetch the Profile Picture (Requesting a tiny 48x48 thumbnail to save cookie space)
                    const photoResponse = await fetch("https://graph.microsoft.com/v1.0/me/photos/48x48/$value", {
                        headers: { Authorization: `Bearer ${account.access_token}` },
                    });
                    if (photoResponse.ok) {
                        const pictureBuffer = await photoResponse.arrayBuffer();
                        const pictureBase64 = Buffer.from(pictureBuffer).toString('base64');

                        // SAFETY VALVE: Vercel header limits are strict (usually 8KB-14KB total).
                        // If the base64 string is larger than 4000 characters, we discard it to prevent crashing the app.
                        // The UI will gracefully fall back to the user's initials.
                        if (pictureBase64.length < 5000) {
                            token.picture = `data:image/jpeg;base64,${pictureBase64}`;
                        } else {
                            console.warn("Profile picture too large for cookie, falling back to initials.");
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch Graph API data", error);
                    if (!token.jobTitle) token.jobTitle = "NESR Employee";
                }
            }
            return token;
        },
        async session({ session, token }: any) {
            // 3. Pass the fetched data down to the frontend UI session
            if (session.user) {
                session.user.jobTitle = token.jobTitle as string;
                if (token.picture) {
                    session.user.image = token.picture as string;
                }
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
