import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <SignIn />
    </main>
  );
}
