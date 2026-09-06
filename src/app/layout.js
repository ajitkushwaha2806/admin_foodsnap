import "@/app/globals.css";
import { Poppins } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/providers/query-provider";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  title: "FoodSnap Admin Studio",
  description: "AI-powered Food Image & Menu Management Studio",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`dark ${poppins.variable}`}>
        <body
          className={`${poppins.className} font-sans antialiased bg-background text-foreground selection:bg-amber-500 selection:text-white`}
        >
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
