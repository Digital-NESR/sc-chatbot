import NextAuth from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';


import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
    providers: [
        AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
        }),

    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
    },
    callbacks: {
        async jwt({ token, account, user }: any) {

            // This block only runs on the initial sign-in when the access token is fresh
            if (account?.access_token) {
                try {
                    // 1. Fetch the Job Title and Display Name
                    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=jobTitle,displayName", {
                        headers: { Authorization: `Bearer ${account.access_token}` },
                    });
                    if (profileResponse.ok) {
                        const profileData = await profileResponse.json();
                        token.jobTitle = profileData.jobTitle || "NESR Employee";
                        token.displayName = profileData.displayName || token.name || user?.name || "User";
                    } else {
                        token.jobTitle = "NESR Employee";
                        token.displayName = token.name || user?.name || "User";
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
                    if (!token.displayName) token.displayName = token.name || user?.name || "User";
                }
            }

            return token;
        },
        async session({ session, token }: any) {
            // 4. Pass the fetched data down to the frontend UI session
            if (session.user) {
                session.user.jobTitle = token.jobTitle as string;
                session.user.displayName = token.displayName as string || session.user.name;
                if (token.picture) {
                    session.user.image = token.picture as string;
                }
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
